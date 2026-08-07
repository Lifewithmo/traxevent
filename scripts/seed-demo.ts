import { adminDb, adminAuth } from '@/lib/firebase-admin'
import { findOrCreateCustomerCore } from '@/lib/crm/customers'
import { leadsRef } from '@/lib/crm/leads'
import { tasksRef } from '@/lib/crm/tasks'
import { parseSeedArgs, assertDemoOrgId, type SeedArgs } from '@/scripts/seed/args'
import { buildBrewtraxSeed } from '@/scripts/seed/brewtrax-data'
import type { Org, OrgMember, Lead, Task, Event, ItineraryItem, Proposal } from '@/lib/types'
import { generateAccessToken } from '@/lib/tokens'
import { buildEventSlug } from '@/lib/slug'
import { createInvoiceCore, issueInvoiceCore, recordPaymentCore } from '@/lib/crm/invoices'
import { createResourceCore } from '@/lib/ops/resources'
import { createWorkPackageCore } from '@/lib/ops/work-packages'
import { instantiateOpsPlanCore, completeChecklistStepCore, toggleDeadlineCore } from '@/lib/ops/event-ops'
import { createIssueCore, resolveIssueCore } from '@/lib/ops/issues'
import { createComplianceDocCore } from '@/lib/ops/compliance'
import type { WorkPackageLine } from '@/lib/types'

// Run via `npm run seed:demo` — it sets --conditions=react-server so 'server-only'
// (imported transitively via lib/firebase-admin) resolves to its no-throw module under tsx.

function orgRef(orgId: string) {
  assertDemoOrgId(orgId)
  return adminDb.collection('orgs').doc(orgId)
}

/**
 * Delete the demo org and everything beneath it. `assertDemoOrgId` runs again
 * here rather than trusting the caller — this is the only destructive path in
 * the script, so the guard sits directly on it.
 */
async function resetOrg(orgId: string): Promise<void> {
  assertDemoOrgId(orgId)
  const ref = orgRef(orgId)
  if (!(await ref.get()).exists) {
    console.log(`  no existing org "${orgId}" — nothing to reset`)
    return
  }
  await adminDb.recursiveDelete(ref)
  console.log(`  deleted org "${orgId}" and all subcollections`)
}

/** Look up the demo auth user by email, creating it only if absent. */
async function resolveDemoUser(args: SeedArgs): Promise<string> {
  try {
    const existing = await adminAuth.getUserByEmail(args.email)
    console.log(`  reusing auth user ${args.email} (${existing.uid})`)
    return existing.uid
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code !== 'auth/user-not-found') throw err
    const created = await adminAuth.createUser({
      email: args.email,
      password: args.password,
      displayName: 'BrewTrax Demo',
      emailVerified: true,
    })
    console.log(`  created auth user ${args.email} (${created.uid})`)
    return created.uid
  }
}

async function main(): Promise<void> {
  const args = parseSeedArgs(process.argv.slice(2))

  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not set — refusing to run')

  console.log(`\nSeeding BrewTrax demo data`)
  console.log(`  project: ${projectId}`)
  console.log(`  org:     ${args.orgId}`)
  console.log(`  reset:   ${args.reset}\n`)

  const ref = orgRef(args.orgId)
  if (args.reset) {
    await resetOrg(args.orgId)
  } else if ((await ref.get()).exists) {
    throw new Error(`Org "${args.orgId}" already exists. Re-run with --reset to replace it.`)
  }

  const uid = await resolveDemoUser(args)
  const seed = buildBrewtraxSeed(new Date())

  // Org + owner membership.
  const org: Org = { ...seed.org, id: args.orgId }
  await ref.set(org)
  const member: OrgMember = {
    uid, role: 'owner', display_name: 'BrewTrax Demo', email: args.email, event_access: {},
  }
  await ref.collection('members').doc(uid).set(member)
  console.log(`  org + owner member written`)

  // The app resolves org access from Firebase custom claims, not the member doc
  // (lib/auth/session.ts reads orgId/orgSlug/role off the verified session cookie).
  // Without these the demo login authenticates but every org guard rejects it.
  // Set directly via the admin SDK: actions/auth.ts setOrgClaims is 'use server'
  // and unreachable from a script. Re-applied on every run so --reset keeps the
  // login working against the recreated org.
  await adminAuth.setCustomUserClaims(uid, {
    orgId: args.orgId,
    orgSlug: org.slug,
    role: 'owner',
  })
  console.log(`  org claims set on ${args.email}`)

  // Customers — findOrCreateCustomerCore mints its own ids, so map key -> id.
  const customerIds = new Map<string, string>()
  for (const c of seed.customers) {
    const { customer } = await findOrCreateCustomerCore(args.orgId, c.input)
    customerIds.set(c.key, customer.id)
  }
  console.log(`  ${customerIds.size} customers`)

  // Leads carry literal ids, so demo URLs stay stable across resets.
  for (const l of seed.leads) {
    const customerId = customerIds.get(l.customerKey)
    if (!customerId) throw new Error(`Lead ${l.key} references unknown customer ${l.customerKey}`)
    const lead: Lead = { ...l.lead, customer_id: customerId }
    await leadsRef(args.orgId).doc(lead.id).set(lead)
  }
  console.log(`  ${seed.leads.length} leads`)

  const leadIds = new Map(seed.leads.map((l) => [l.key, l.lead.id]))

  for (const t of seed.tasks) {
    const leadId = leadIds.get(t.leadKey)
    if (!leadId) throw new Error(`Task ${t.task.id} references unknown lead ${t.leadKey}`)
    const task: Task = { ...t.task, lead_id: leadId }
    await tasksRef(args.orgId, leadId).doc(task.id).set(task)
  }
  console.log(`  ${seed.tasks.length} tasks`)

  // Events + itinerary. The fixture's literal slug must match what the app
  // would generate, or demo URLs diverge from real ones.
  for (const e of seed.events) {
    const expected = buildEventSlug(e.event.name, e.event.year)
    if (e.event.slug !== expected) {
      throw new Error(`Event ${e.key} slug "${e.event.slug}" does not match buildEventSlug: "${expected}"`)
    }
    const eventDoc: Event = e.event
    const eventRef = ref.collection('events').doc(eventDoc.id)
    await eventRef.set(eventDoc)
    for (const item of e.itinerary) {
      const itineraryItem: ItineraryItem = item
      await eventRef.collection('itinerary').doc(itineraryItem.id).set(itineraryItem)
    }
  }
  console.log(`  ${seed.events.length} events`)

  const eventIds = new Map(seed.events.map((e) => [e.key, e.event.id]))

  // Proposals. Written directly (no guard-free core exists); token minted here.
  for (const p of seed.proposals) {
    const leadId = leadIds.get(p.leadKey)
    if (!leadId) throw new Error(`Proposal ${p.proposal.id} references unknown lead ${p.leadKey}`)
    const proposal: Proposal = {
      ...p.proposal,
      org_id: args.orgId,
      lead_id: leadId,
      token: generateAccessToken(),
    }
    await ref.collection('proposals').doc(proposal.id).set(proposal)
  }
  console.log(`  ${seed.proposals.length} proposals`)

  // Invoices go through the real transitions — create, issue, then pay — so
  // lifecycle, number, balance, and aging come out of production code rather
  // than being guessed at in the fixture.
  for (const inv of seed.invoices) {
    const leadId = leadIds.get(inv.leadKey)
    if (!leadId) throw new Error(`Invoice ${inv.key} references unknown lead ${inv.leadKey}`)
    const customerId = customerIds.get(inv.customerKey)
    if (!customerId) throw new Error(`Invoice ${inv.key} references unknown customer ${inv.customerKey}`)

    const created = await createInvoiceCore(args.orgId, leadId, { ...inv.input, customer_id: customerId })
    if (inv.issue) await issueInvoiceCore(args.orgId, created.id, { issuedAt: inv.issue.issuedAt })
    for (const payment of inv.payments) {
      await recordPaymentCore(args.orgId, created.id, payment)
    }
  }
  console.log(`  ${seed.invoices.length} invoices`)

  // Ops: resources first (work package lines reference their ids), then
  // packages, then the plan derived from them.
  const resourceIds = new Map<string, string>()
  for (const r of seed.ops.resources) {
    const resource = await createResourceCore(args.orgId, r.input)
    resourceIds.set(r.key, resource.id)
  }

  const packageIds = new Map<string, string>()
  for (const p of seed.ops.workPackages) {
    const lines: WorkPackageLine[] = p.lines.map((line) => {
      if (line.kind === 'labor') return { kind: 'labor', role: line.role, count: line.count }
      const resourceId = resourceIds.get(line.resourceKey)
      if (!resourceId) throw new Error(`Work package ${p.key} references unknown resource ${line.resourceKey}`)
      return line.kind === 'consumable'
        ? { kind: 'consumable', resource_id: resourceId, qty_per_guest: line.qty_per_guest, ...(line.base_qty !== undefined ? { base_qty: line.base_qty } : {}) }
        : { kind: 'equipment', resource_id: resourceId, qty: line.qty }
    })
    // Third arg is the validation allow-list: createWorkPackageCore rejects a
    // line pointing at a resource id outside this set.
    const pkg = await createWorkPackageCore(args.orgId, {
      name: p.name, price: p.price, lines,
      ...(p.description ? { description: p.description } : {}),
      ...(p.scope ? { scope: p.scope } : {}),
      ...(p.max_guests !== undefined ? { max_guests: p.max_guests } : {}),
      ...(p.setup_minutes !== undefined ? { setup_minutes: p.setup_minutes } : {}),
      ...(p.teardown_minutes !== undefined ? { teardown_minutes: p.teardown_minutes } : {}),
    }, new Set(resourceIds.values()))
    packageIds.set(p.key, pkg.id)
  }
  console.log(`  ${resourceIds.size} resources, ${packageIds.size} work packages`)

  const planEventId = eventIds.get(seed.ops.plan.eventKey)
  if (!planEventId) throw new Error(`Ops plan references unknown event ${seed.ops.plan.eventKey}`)
  const planPackageIds = seed.ops.plan.packageKeys.map((key) => {
    const id = packageIds.get(key)
    if (!id) throw new Error(`Ops plan references unknown work package ${key}`)
    return id
  })

  const plan = await instantiateOpsPlanCore(args.orgId, planEventId, {
    package_ids: planPackageIds,
    requirements: seed.ops.plan.requirements,
    event_start: seed.events.find((e) => e.key === seed.ops.plan.eventKey)!.event.event_start,
    industry_pack_id: seed.org.industry_pack_id,
    actor_uid: uid,
  })

  // Partially complete the plan so readiness reads as in-progress, not 0% or 100%.
  let stepsRemaining = seed.ops.plan.completeStepCount
  for (const checklist of plan.checklists) {
    for (let i = 0; i < checklist.steps.length && stepsRemaining > 0; i++) {
      await completeChecklistStepCore(args.orgId, planEventId, checklist.id, i, { done: true, actor_uid: uid })
      stepsRemaining--
    }
    if (stepsRemaining === 0) break
  }
  for (const deadline of plan.deadlines.slice(0, seed.ops.plan.completeDeadlineCount)) {
    await toggleDeadlineCore(args.orgId, planEventId, deadline.id, true)
  }
  console.log(`  ops plan on event ${planEventId}`)

  for (const issue of seed.ops.issues) {
    const created = await createIssueCore(args.orgId, planEventId, {
      type: issue.type, severity: issue.severity, note: issue.note, created_by: uid,
    })
    if (issue.resolution) {
      await resolveIssueCore(args.orgId, planEventId, created.id, issue.resolution)
    }
  }

  for (const doc of seed.ops.complianceDocs) {
    await createComplianceDocCore(args.orgId, doc)
  }
  console.log(`  ${seed.ops.issues.length} issues, ${seed.ops.complianceDocs.length} compliance docs`)

  console.log(`\nDone.`)
  console.log(`  login: ${args.email} / ${args.password}`)
  console.log(`  org:   /${seed.org.slug}\n`)
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
