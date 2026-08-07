import { adminDb, adminAuth } from '@/lib/firebase-admin'
import { findOrCreateCustomerCore } from '@/lib/crm/customers'
import { leadsRef } from '@/lib/crm/leads'
import { tasksRef } from '@/lib/crm/tasks'
import { parseSeedArgs, assertDemoOrgId, type SeedArgs } from '@/scripts/seed/args'
import { buildBrewtraxSeed } from '@/scripts/seed/brewtrax-data'
import type { Org, OrgMember, Lead, Task } from '@/lib/types'

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

  console.log(`\nDone.`)
  console.log(`  login: ${args.email} / ${args.password}`)
  console.log(`  org:   /${seed.org.slug}\n`)
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
