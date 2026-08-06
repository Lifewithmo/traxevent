import { customersRef, findOrCreateCustomerCore, normalizeEmail, type CreateCustomerInput } from '@/lib/crm/customers'
import { listLeadsCore, updateLeadCore } from '@/lib/crm/leads'
import type { Lead } from '@/lib/types'

// Run via `npm run crm:migrate` — it sets --conditions=react-server so 'server-only' (imported transitively via lib/firebase-admin) resolves to its no-throw module under tsx.

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
 * For every lead in `orgId` without a customer_id, find-or-create a Customer via
 * the canonical `findOrCreateCustomerCore` (durable dedup on `email_lower`,
 * across runs and across `createLead`-originated Customers, not just within this
 * run) and link the lead via customer_id. Idempotent (already-linked leads are
 * skipped). `dryRun` performs no writes.
 *
 * `findOrCreateCustomerCore` itself writes when no match is found, so dry-run
 * cannot call it — it instead simulates the same email_lower lookup read-only,
 * tracking emails already "created" earlier in this dry run so repeats within
 * the run are still counted as deduped instead of double-created.
 */
export async function migrate(orgId: string, opts: { dryRun?: boolean } = {}): Promise<MigrationSummary> {
  const { dryRun = false } = opts
  const leads = await listLeadsCore(orgId)
  let alreadyLinked = 0
  let created = 0
  let deduped = 0
  const dryRunSeenEmails = new Set<string>()

  for (const lead of leads) {
    if (lead.customer_id) {
      alreadyLinked++
      continue
    }

    if (dryRun) {
      const key = normalizeEmail(lead.email)
      const existsAlready = key
        ? dryRunSeenEmails.has(key) ||
          !(await customersRef(orgId).where('email_lower', '==', key).limit(1).get()).empty
        : false
      if (existsAlready) {
        deduped++
      } else {
        created++
        if (key) dryRunSeenEmails.add(key)
      }
      continue
    }

    const { customer, created: wasCreated } = await findOrCreateCustomerCore(orgId, leadToCustomerInput(lead))
    if (wasCreated) created++
    else deduped++
    await updateLeadCore(orgId, lead.id, { customer_id: customer.id })
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
