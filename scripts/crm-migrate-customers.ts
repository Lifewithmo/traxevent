import { createCustomerCore, type CreateCustomerInput } from '@/lib/crm/customers'
import { listLeadsCore, updateLeadCore } from '@/lib/crm/leads'
import type { Lead } from '@/lib/types'

/** Pure mapping from a Lead's contact fields to a CreateCustomerInput (present fields only). */
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
 * For every lead in `orgId` without a customer_id, create a Customer (dedup by
 * normalized email within the run) and link the lead via customer_id.
 * Idempotent (already-linked leads are skipped). `dryRun` performs no writes.
 */
export async function migrate(orgId: string, opts: { dryRun?: boolean } = {}): Promise<MigrationSummary> {
  const { dryRun = false } = opts
  const leads = await listLeadsCore(orgId)
  const emailToCustomerId = new Map<string, string>()
  let alreadyLinked = 0
  let created = 0
  let deduped = 0

  for (const lead of leads) {
    if (lead.customer_id) {
      alreadyLinked++
      continue
    }
    const dedupKey = lead.email ? lead.email.trim().toLowerCase() : undefined
    const existingId = dedupKey ? emailToCustomerId.get(dedupKey) : undefined

    let customerId: string
    if (existingId) {
      customerId = existingId
      deduped++
    } else {
      customerId = dryRun ? `dry-${created}` : (await createCustomerCore(orgId, leadToCustomerInput(lead))).id
      created++
      if (dedupKey) emailToCustomerId.set(dedupKey, customerId)
    }

    if (!dryRun) await updateLeadCore(orgId, lead.id, { customer_id: customerId })
  }

  return { totalLeads: leads.length, alreadyLinked, created, deduped }
}

// CLI entrypoint — true under `tsx scripts/crm-migrate-customers.ts`, inert under Vitest import.
if (process.argv[1]?.endsWith('crm-migrate-customers.ts')) {
  const orgId = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  if (!orgId) {
    console.error('Usage: npm run crm:migrate -- <orgId> [--dry-run]')
    process.exit(1)
  }
  migrate(orgId, { dryRun })
    .then((summary) => {
      console.log(dryRun ? 'DRY RUN — no writes made.' : 'Migration complete.', summary)
      process.exit(0)
    })
    .catch((err) => {
      console.error('Migration failed:', err)
      process.exit(1)
    })
}
