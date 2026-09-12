import type { SeedArgs } from '@/scripts/seed/args'
import { buildMarketDaySeed, MARKET_SERIES_ID } from '@/scripts/seed/market-day-data'
import { buildRosterSeed, ROSTER_ORG_ID } from '@/scripts/seed/roster-data'

/**
 * The --dry-run write plan for the addition flags: every collection path and
 * doc id the real run would touch, in order, with zero writes. PURE — this
 * module (and everything it imports) must stay free of firebase-admin so the
 * plan prints with no Firebase env at all.
 */
export function buildAdditionsPlan(args: SeedArgs, today: Date): string[] {
  const lines: string[] = []

  if (args.withMarketDays) {
    const seed = buildMarketDaySeed(today)
    const org = args.orgId
    lines.push(`── --with-market-days → org "${org}" ──`)
    lines.push(`READ    orgs/${org}  (must exist — the full seed creates it)`)
    lines.push(`RESOLVE orgs/${org}/resources  (find "${seed.beansResource.name}" by name; create it only if absent)`)
    lines.push(`DELETE  orgs/${org}/events where series_id == "${MARKET_SERIES_ID}"  (recursive — prior season, incl. ops/closeout)`)
    lines.push(`WRITE   orgs/${org}/event_series/${seed.series.id}  — "${seed.series.name}" (Sat ${seed.series.recurrence.from} → ${seed.series.recurrence.until}, booth fee $${seed.series.booth_fee})`)
    for (const day of seed.days) {
      const c = day.closeout
      const state = !c
        ? 'no closeout'
        : `closeout: sales $${c.actuals.sales.toFixed(2)}${c.actuals.consumables ? ` + ${c.actuals.consumables.map((x) => `${x.qty_used} × ${x.resourceName}`).join(', ')}` : ''}${c.completed ? ', COMPLETED' : ', saved only'}`
      lines.push(`WRITE   orgs/${org}/events/${day.event.id}  — ${day.event.event_start} slug=${day.event.slug} (${state})`)
      if (c) {
        lines.push(`WRITE   orgs/${org}/events/${day.event.id}/ops/closeout  — via saveActualsCore${c.completed ? ' + completeCloseoutCore' : ''}`)
      }
    }
  }

  if (args.withRosterOrg) {
    const seed = buildRosterSeed(today)
    if (args.withMarketDays) lines.push('')
    lines.push(`── --with-roster-org → org "${ROSTER_ORG_ID}" ──`)
    lines.push(`AUTH    resolve demo user ${args.email} (create only if absent; claims must be demo-owned; claims NOT modified)`)
    lines.push(`DELETE  orgs/${ROSTER_ORG_ID}  (recursive — reset before recreate)`)
    lines.push(`WRITE   orgs/${ROSTER_ORG_ID}  — "${seed.org.name}" (slug /${seed.org.slug}, pack ${seed.org.industry_pack_id})`)
    lines.push(`WRITE   orgs/${ROSTER_ORG_ID}/members/<demo-user-uid>  — owner (same auth user as the primary demo org)`)
    lines.push(`WRITE   orgs/${ROSTER_ORG_ID}/events/${seed.event.id}  — "${seed.event.name}" ${seed.event.event_start} slug=${seed.event.slug} (registration_type=child)`)
    lines.push(`WRITE   orgs/${ROSTER_ORG_ID}/form_templates/${seed.formTemplate.id}  — "${seed.formTemplate.name}"`)
    lines.push(`WRITE   orgs/${ROSTER_ORG_ID}/events/${seed.event.id}/form_assignments/${seed.formAssignment.id}  — required registrant waiver`)
    for (const f of seed.families) {
      const kids = f.members.map((m) => m.first_name).join(', ')
      const flags = [
        f.family.registration_status !== 'confirmed' ? f.family.registration_status : null,
        (f.family.amount_due ?? 0) > (f.family.amount_paid ?? 0) ? `owes $${(f.family.amount_due ?? 0) - (f.family.amount_paid ?? 0)}` : null,
        f.members.some((m) => m.allergies || m.medical_notes) ? 'medical flag' : null,
        f.signedForm ? 'waiver signed' : 'waiver MISSING',
      ].filter(Boolean).join(', ')
      lines.push(`WRITE   …/events/${seed.event.id}/families/${f.family.id}  — ${f.family.last_name} (${kids}) [${flags}]`)
      for (const m of f.members) {
        lines.push(`WRITE   …/families/${f.family.id}/family_members/${m.id}`)
      }
      if (f.signedForm) {
        lines.push(`WRITE   …/families/${f.family.id}/signed_forms/${f.signedForm.id}`)
      }
    }
    for (const r of seed.checkins) {
      lines.push(`WRITE   …/events/${seed.event.id}/checkins/${r.id}  — ${r.member_name} ${r.status === 'in' ? 'currently IN' : `full cycle, picked up by ${r.guardian_pickup_name}`}`)
    }
  }

  if (args.claimsOrg) {
    if (lines.length > 0) lines.push('')
    lines.push(`── --claims-org → "${args.claimsOrg}" ──`)
    lines.push(`AUTH    setCustomUserClaims(${args.email}) → { orgId: ${args.claimsOrg}, orgSlug: <from org doc>, role: <from member doc> }`)
    lines.push(`        (org + membership must already exist; takes effect on the next session)`)
  }

  return lines
}

export function printAdditionsPlan(args: SeedArgs, today: Date): void {
  console.log(`\nDRY RUN — write plan only, nothing written\n`)
  for (const line of buildAdditionsPlan(args, today)) console.log(line)
  console.log(`\nDRY RUN complete — 0 writes performed.\n`)
}
