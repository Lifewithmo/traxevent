// Shopping-run write core — spec 2026-08-23 S2.3. Lives in its OWN module,
// not lib/ops/shopping-run.ts (that file is a pure selector with no DB
// imports, derive.ts precedent) and NOT exported from the 'use server' action
// file (every export there is a public endpoint — the itinerary core/action
// split is the security precedent). actions/shopping-run.ts guards and calls
// this.
import { adminDb } from '@/lib/firebase-admin'
import { opsPlanRef } from '@/lib/ops/event-ops'
import type { OpsPlan, OpsListItem } from '@/lib/types'

export interface RunCheckTarget {
  event_id: string
  /** resource_id|unit item keys, toggleListItemCore's convention. */
  keys: { resource_id: string; unit?: string }[]
}

/**
 * Run-row "check all": sets `checked` on the named shopping-list items across
 * SEVERAL events' plan docs in ONE multi-document transaction — never N serial
 * per-event writes (spec 2026-08-19 B2's bulk-core rule, fanned out across
 * plans). All-or-nothing on purpose: a run row that half-saved across jobs
 * would show a checked run row over unchecked per-event lists, and the two
 * surfaces must never disagree. Any key that doesn't resolve fails the whole
 * write VISIBLY ('Item not found') — the client keeps its optimistic state and
 * offers retry, custody-grade.
 */
export async function bulkSetRunCheckedCore(
  orgId: string,
  targets: RunCheckTarget[],
  checked: boolean,
): Promise<void> {
  if (targets.length === 0) return
  await adminDb.runTransaction(async (tx) => {
    // All reads first (Firestore transaction contract), then all writes.
    const refs = targets.map((t) => opsPlanRef(orgId, t.event_id))
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)))
    const now = new Date().toISOString()
    const writes: { ref: (typeof refs)[number]; shopping_list: OpsListItem[] }[] = []
    targets.forEach((t, i) => {
      const snap = snaps[i]
      if (!snap.exists) throw new Error('No ops plan for this event')
      const plan = snap.data() as OpsPlan
      const wanted = new Set(t.keys.map((k) => `${k.resource_id}|${k.unit ?? ''}`))
      const present = new Set(plan.shopping_list.map((it) => `${it.resource_id}|${it.unit ?? ''}`))
      for (const k of wanted) {
        if (!present.has(k)) throw new Error('Item not found')
      }
      writes.push({
        ref: refs[i],
        shopping_list: plan.shopping_list.map((it) =>
          wanted.has(`${it.resource_id}|${it.unit ?? ''}`) ? { ...it, checked } : it,
        ),
      })
    })
    for (const w of writes) tx.update(w.ref, { shopping_list: w.shopping_list, updated_at: now })
  })
}
