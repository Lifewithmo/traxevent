'use server'

import { assertEventPage } from '@/lib/auth/assert'
import { bulkSetRunCheckedCore, type RunCheckTarget } from '@/lib/ops/shopping-run-write'

// Shopping-run actions live in their own file (spec 2026-08-23 P1: NOT in
// actions/event-ops.ts). The core stays in lib/ops/shopping-run-write.ts —
// exporting an unguarded core from a 'use server' module would publish it as
// an open endpoint (the itinerary-reads security fix is the precedent).

/**
 * Run-row check-all across events. Gated per event with the same
 * assertEventPage(…, 'ops') rule as every other list write — a member may
 * only bulk-check items on plans whose ops page they can open. One multi-doc
 * transaction in the core; visible failure + retry on the client (B2-grade).
 */
export async function bulkSetRunChecked(
  orgId: string,
  targets: RunCheckTarget[],
  checked: boolean,
): Promise<void> {
  await Promise.all(targets.map((t) => assertEventPage(orgId, t.event_id, 'ops')))
  return bulkSetRunCheckedCore(orgId, targets, checked)
}
