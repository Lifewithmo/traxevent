import type { UserRecord } from 'firebase-admin/auth'
import { adminDb, adminAuth } from '@/lib/firebase-admin'
import { assertDemoOrgId, type SeedArgs } from '@/scripts/seed/args'
import { orgRef, resetOrg, resolveDemoUser, assertClaimsAreDemoOwned } from '@/scripts/seed/full-seed'
import { buildMarketDaySeed, MARKET_SERIES_ID, MARKET_SERIES_NAME } from '@/scripts/seed/market-day-data'
import { buildRosterSeed, ROSTER_ORG_ID } from '@/scripts/seed/roster-data'
import { seriesRef } from '@/lib/occasions/series'
import { saveActualsCore, completeCloseoutCore } from '@/lib/ops/closeout'
import { listResourcesCore, createResourceCore } from '@/lib/ops/resources'
import { listEventsCore } from '@/lib/events'
import type { Org, OrgMember, OpsActuals } from '@/lib/types'

/**
 * The Events-walkthrough additions, behind their own flags so the orchestrator
 * can run each independently of the full seed (and of each other):
 *
 *   --with-market-days  a "City Market Saturdays" season on the EXISTING demo
 *                       org: five past Saturdays in every closeout state, a
 *                       day dated today, two future Saturdays.
 *   --with-roster-org   the Pinecrest Day Camp attendee-roster org, owned by
 *                       the SAME demo auth user (so one login serves both).
 *   --claims-org=<id>   point the demo user's custom claims at a demo org.
 *                       The org guards resolve access from claims
 *                       (lib/auth/assert.ts checks user.orgId === orgId), so
 *                       walking Pinecrest needs claims switched to it — and a
 *                       fresh session cookie (sign in again, or re-POST a
 *                       refreshed ID token to /api/auth/session).
 *
 * Both seeding flags are idempotent: every doc id is literal, the market-day
 * run deletes the prior season before rewriting it, and the roster run resets
 * its own org (never the primary one). Neither touches auth claims.
 */
export async function runAdditions(args: SeedArgs): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not set — refusing to run')

  console.log(`\nSeeding demo additions`)
  console.log(`  project:      ${projectId}`)
  console.log(`  market days:  ${args.withMarketDays ? `→ org "${args.orgId}"` : 'no'}`)
  console.log(`  roster org:   ${args.withRosterOrg ? `→ org "${ROSTER_ORG_ID}"` : 'no'}`)
  console.log(`  claims:       ${args.claimsOrg ? `→ org "${args.claimsOrg}"` : 'untouched'}\n`)

  // The auth account is only needed (and only vetted) when we attach it to the
  // roster org or rewrite its claims. assertClaimsAreDemoOwned refuses accounts
  // carrying non-demo claims BEFORE anything destructive runs — same preflight
  // ordering contract as the full seeder.
  let user: UserRecord | undefined
  if (args.withRosterOrg || args.claimsOrg) {
    user = await resolveDemoUser(args)
    assertClaimsAreDemoOwned(user, args.email)
  }

  if (args.withMarketDays) await seedMarketDays(args.orgId)
  if (args.withRosterOrg) await seedRosterOrg(args, user!)
  if (args.claimsOrg) await pointClaimsAt(args.claimsOrg, user!, args.email)

  console.log(`\nDone.`)
  if (args.withRosterOrg && !args.claimsOrg) {
    console.log(
      `  note: org guards resolve access from auth claims — to walk ${ROSTER_ORG_ID},\n` +
      `  re-run with --claims-org=${ROSTER_ORG_ID} and start a fresh session\n` +
      `  (and --claims-org=${args.orgId} to switch back).\n`,
    )
  }
}

/**
 * Season for the existing org. Deletes any prior generation of THIS series
 * (recursively, so stale ops/closeout docs go with their days), then rewrites
 * series + days with literal ids and records the closeouts through the same
 * cores the lite screen writes with (saveActualsCore / completeCloseoutCore).
 */
async function seedMarketDays(orgId: string): Promise<void> {
  assertDemoOrgId(orgId)
  const ref = orgRef(orgId)
  if (!(await ref.get()).exists) {
    throw new Error(`Org "${orgId}" does not exist — run the full seed first (npm run seed:demo -- --reset), then the additions.`)
  }

  const seed = buildMarketDaySeed(new Date())

  // The loss day's consumable must be a REAL resource with a unit_cost, or the
  // closeout summary can't cost it. Reuse the org's existing resource by name;
  // create it from the same fixture input only when absent (fresh custom org).
  const resources = await listResourcesCore(orgId)
  let beans = resources.find((r) => r.name === seed.beansResource.name)
  if (!beans) {
    beans = await createResourceCore(orgId, seed.beansResource)
    console.log(`  created missing resource "${beans.name}" (${beans.id})`)
  }

  // Idempotence: drop every previously generated day of this series before
  // rewriting. Date math moves with `today`, so a re-run a week later would
  // otherwise leave orphaned days beside the fresh season.
  const prior = await ref.collection('events').where('series_id', '==', MARKET_SERIES_ID).get()
  for (const doc of prior.docs) {
    await adminDb.recursiveDelete(doc.ref)
  }
  if (prior.size > 0) console.log(`  deleted ${prior.size} prior "${MARKET_SERIES_NAME}" days`)

  // Slug integrity: the app resolves events by slug with a limit(1) query, so
  // a collision would silently route navigation to the wrong event. With the
  // prior season gone, none of our deterministic slugs may remain taken.
  const taken = new Set((await listEventsCore(orgId)).map((e) => e.slug))
  for (const day of seed.days) {
    if (taken.has(day.event.slug)) {
      throw new Error(`Event slug "${day.event.slug}" is already taken by a non-series event — refusing to create a duplicate slug.`)
    }
  }

  await seriesRef(orgId).doc(seed.series.id).set(seed.series)
  console.log(`  series "${seed.series.name}" (${seed.series.id})`)

  let closeouts = 0
  for (const day of seed.days) {
    await ref.collection('events').doc(day.event.id).set(day.event)
    if (!day.closeout) continue
    const actuals: OpsActuals = {
      sales: day.closeout.actuals.sales,
      ...(day.closeout.actuals.consumables
        ? {
            consumables: day.closeout.actuals.consumables.map((c) => {
              if (c.resourceName !== beans!.name) throw new Error(`Unknown seed resource "${c.resourceName}"`)
              return { resource_id: beans!.id, qty_used: c.qty_used }
            }),
          }
        : {}),
    }
    await saveActualsCore(orgId, day.event.id, actuals)
    if (day.closeout.completed) await completeCloseoutCore(orgId, day.event.id)
    closeouts++
  }
  console.log(`  ${seed.days.length} market days (${closeouts} with closeouts)`)
}

/**
 * The attendee-roster org: reset + recreate under literal ids, owned by the
 * same demo auth user. Claims are NOT touched here — the primary demo login
 * keeps working; --claims-org flips the session's org when the walkthrough
 * moves over.
 */
async function seedRosterOrg(args: SeedArgs, user: UserRecord): Promise<void> {
  const seed = buildRosterSeed(new Date())
  await resetOrg(ROSTER_ORG_ID)

  const ref = orgRef(ROSTER_ORG_ID)
  const org: Org = { ...seed.org, id: ROSTER_ORG_ID }
  await ref.set(org)

  const member: OrgMember = {
    ...seed.member,
    uid: user.uid,
    display_name: user.displayName ?? 'Demo Owner',
    email: args.email,
  }
  await ref.collection('members').doc(user.uid).set(member)
  console.log(`  org "${org.name}" + owner member (${args.email})`)

  const eventRef = ref.collection('events').doc(seed.event.id)
  await eventRef.set(seed.event)

  await ref.collection('form_templates').doc(seed.formTemplate.id).set(seed.formTemplate)
  await eventRef.collection('form_assignments').doc(seed.formAssignment.id).set(seed.formAssignment)

  let members = 0
  let signed = 0
  for (const f of seed.families) {
    const familyRef = eventRef.collection('families').doc(f.family.id)
    await familyRef.set(f.family)
    for (const m of f.members) {
      await familyRef.collection('family_members').doc(m.id).set(m)
      members++
    }
    if (f.signedForm) {
      await familyRef.collection('signed_forms').doc(f.signedForm.id).set(f.signedForm)
      signed++
    }
  }
  console.log(`  event "${seed.event.name}": ${seed.families.length} families, ${members} campers, ${signed} signed waivers`)

  for (const record of seed.checkins) {
    await eventRef.collection('checkins').doc(record.id).set(record)
  }
  console.log(`  ${seed.checkins.length} check-in records for today`)
}

/** Rewrite the demo user's org claims — the walkthrough's org switch. */
async function pointClaimsAt(claimsOrgId: string, user: UserRecord, email: string): Promise<void> {
  assertDemoOrgId(claimsOrgId)
  const snap = await orgRef(claimsOrgId).get()
  if (!snap.exists) throw new Error(`Org "${claimsOrgId}" does not exist — seed it before pointing claims at it.`)
  const org = snap.data() as Org

  const memberSnap = await orgRef(claimsOrgId).collection('members').doc(user.uid).get()
  if (!memberSnap.exists) {
    throw new Error(`${email} is not a member of "${claimsOrgId}" — refusing to point claims at an org the account cannot use.`)
  }
  const role = (memberSnap.data() as OrgMember).role

  await adminAuth.setCustomUserClaims(user.uid, { orgId: claimsOrgId, orgSlug: org.slug, role })
  console.log(`  claims on ${email} → ${claimsOrgId} (/${org.slug}, ${role})`)
  console.log(`  claims land on the NEXT session — sign in again (or refresh the ID token and re-POST /api/auth/session)`)
}
