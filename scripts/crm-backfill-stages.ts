import { listLeadsCore, updateLeadCore } from '@/lib/crm/leads'
import type { LeadStage } from '@/lib/types'

// Run via `npm run crm:backfill-stages` — it sets --conditions=react-server so 'server-only' (imported transitively via lib/firebase-admin) resolves to its no-throw module under tsx.

/** Map a legacy (dropped) stage to its V1 equivalent, or null if no change is needed. */
export function mapLegacyStage(stage: string): LeadStage | null {
  if (stage === 'booked' || stage === 'delivered') return 'closed_won'
  return null
}

export interface BackfillSummary {
  totalLeads: number
  rewritten: number
  unchanged: number
  changes: { id: string; from: string; to: LeadStage }[]
}

/**
 * Rewrite any lead stored at a dropped stage (booked/delivered → closed_won).
 * Idempotent (V1 stages map to null → untouched). `dryRun` performs no writes.
 * Writes through the core, so it emits no `stage` ActivityEvent (deliberate).
 */
export async function backfillStages(orgId: string, opts: { dryRun?: boolean } = {}): Promise<BackfillSummary> {
  const { dryRun = false } = opts
  const leads = await listLeadsCore(orgId)
  let rewritten = 0
  let unchanged = 0
  const changes: BackfillSummary['changes'] = []

  for (const lead of leads) {
    const from = lead.stage as unknown as string
    const to = mapLegacyStage(from)
    if (!to) {
      unchanged++
      continue
    }
    changes.push({ id: lead.id, from, to })
    if (!dryRun) await updateLeadCore(orgId, lead.id, { stage: to })
    rewritten++
  }

  return { totalLeads: leads.length, rewritten, unchanged, changes }
}

// CLI entrypoint — true under `tsx scripts/crm-backfill-stages.ts`, inert under Vitest import.
if (process.argv[1]?.endsWith('crm-backfill-stages.ts')) {
  const orgId = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  if (!orgId) {
    console.error('Usage: npm run crm:backfill-stages -- <orgId> [--dry-run]')
    process.exit(1)
  }
  backfillStages(orgId, { dryRun })
    .then((summary) => {
      console.log(dryRun ? 'DRY RUN — no writes made.' : 'Backfill complete.', summary)
      process.exit(0)
    })
    .catch((err) => {
      console.error('Backfill failed:', err)
      process.exit(1)
    })
}
