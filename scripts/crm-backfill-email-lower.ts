import { customersRef, normalizeEmail } from '@/lib/crm/customers'
import type { Customer } from '@/lib/types'

// Run via `npm run crm:backfill-email-lower` — it sets --conditions=react-server so 'server-only' (imported transitively via lib/firebase-admin) resolves to its no-throw module under tsx.
//
// Why this exists: `email_lower` is the dedup key `findOrCreateCustomerCore` reads.
// Customers created before that field existed (i.e. everything the initial
// `crm:migrate` run produced) have no `email_lower`, so the dedup query can never
// match them and duplicates would reappear. `crm:migrate` does NOT backfill this —
// it skips any lead that already has `customer_id` set, so already-linked leads'
// Customer docs are never touched. This script is the dedicated backfill.

export interface EmailLowerBackfillSummary {
  total: number
  updated: number
  skipped: number
}

/**
 * Backfill `email_lower` on customers that predate the field. Skips customers
 * that already carry the key (idempotent) and customers with no usable email
 * (nothing to derive). `dryRun` performs no writes.
 */
export async function backfillEmailLower(
  orgId: string,
  opts: { dryRun?: boolean } = {}
): Promise<EmailLowerBackfillSummary> {
  const { dryRun = false } = opts
  const snap = await customersRef(orgId).get()
  const customers = snap.docs.map((d) => d.data() as Customer)

  let updated = 0
  let skipped = 0

  for (const customer of customers) {
    if (customer.email_lower) {
      skipped++
      continue
    }
    const key = normalizeEmail(customer.email)
    if (!key) {
      skipped++
      continue
    }
    if (!dryRun) await customersRef(orgId).doc(customer.id).update({ email_lower: key })
    updated++
  }

  return { total: customers.length, updated, skipped }
}

// CLI entrypoint — true under `tsx scripts/crm-backfill-email-lower.ts`, inert under Vitest import.
if (process.argv[1]?.endsWith('crm-backfill-email-lower.ts')) {
  const orgId = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  if (!orgId) {
    console.error('Usage: npm run crm:backfill-email-lower -- <orgId> [--dry-run]')
    process.exit(1)
  }
  backfillEmailLower(orgId, { dryRun })
    .then((summary) => {
      console.log(dryRun ? 'DRY RUN — no writes made.' : 'Backfill complete.', summary)
      process.exit(0)
    })
    .catch((err) => {
      console.error('Backfill failed:', err)
      process.exit(1)
    })
}
