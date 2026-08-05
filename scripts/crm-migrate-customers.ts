import { createCustomer, type CreateCustomerInput } from '@/actions/customers'
import { listLeads, updateLead } from '@/actions/leads'
import type { Lead } from '@/lib/types'

/**
 * KNOWN LIMITATION — not yet runnable standalone.
 *
 * `leadToCustomerInput` is a pure function and is safe to import/use anywhere.
 *
 * `migrate(orgId)` reuses the existing server actions (`listLeads`,
 * `createCustomer`, `updateLead`), whose guards (`assertOrgMember` /
 * `assertOrgAdmin` → `getCurrentUser` → `next/headers` `cookies()`) require a
 * Next.js request scope. Run as a plain `npx tsx` script, it will throw
 * "cookies was called outside a request scope" on the first action call,
 * before any writes happen (fail-safe — no partial migration). A script-safe
 * / service-account auth path is required before this can actually be run;
 * that is deferred to the later "reshape + reseed" increment, which also
 * re-points proposals/invoices/contracts/vendors and hits this same guard.
 */

/**
 * Pure mapping from a Lead's contact fields to a CreateCustomerInput.
 * Spreads only fields that are present on the lead.
 */
export function leadToCustomerInput(lead: Lead): CreateCustomerInput {
  return {
    name: lead.name,
    ...(lead.organization ? { company: lead.organization } : {}),
    ...(lead.email ? { email: lead.email } : {}),
    ...(lead.phone ? { phone: lead.phone } : {}),
  }
}

export interface MigrationSummary {
  totalLeads: number
  alreadyLinked: number
  created: number
  deduped: number
}

/**
 * Migration runner: for every lead in `orgId` without a customer_id,
 * create a Customer (deduping by email against customers already created
 * in this run) and link the lead to it via customer_id.
 *
 * This is a one-off script run manually against Firestore with the admin
 * service account — it is not exercised by CI.
 */
export async function migrate(orgId: string): Promise<MigrationSummary> {
  const leads = await listLeads(orgId)
  const emailToCustomerId = new Map<string, string>()

  let alreadyLinked = 0
  let created = 0
  let deduped = 0

  for (const lead of leads) {
    if (lead.customer_id) {
      alreadyLinked++
      continue
    }

    let customerId: string
    const email = lead.email
    const dedupKey = email ? email.trim().toLowerCase() : undefined
    const existingId = dedupKey ? emailToCustomerId.get(dedupKey) : undefined

    if (existingId) {
      customerId = existingId
      deduped++
    } else {
      const customer = await createCustomer(orgId, leadToCustomerInput(lead))
      customerId = customer.id
      created++
      if (dedupKey) emailToCustomerId.set(dedupKey, customerId)
    }

    await updateLead(orgId, lead.id, { customer_id: customerId })
  }

  return { totalLeads: leads.length, alreadyLinked, created, deduped }
}

if (require.main === module) {
  const orgId = process.argv[2]
  if (!orgId) {
    console.error('Usage: npx tsx scripts/crm-migrate-customers.ts <orgId>')
    process.exit(1)
  }
  migrate(orgId)
    .then((summary) => {
      console.log('Migration complete:', summary)
      process.exit(0)
    })
    .catch((err) => {
      console.error('Migration failed:', err)
      process.exit(1)
    })
}
