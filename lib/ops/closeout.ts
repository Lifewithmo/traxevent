import { adminDb } from '@/lib/firebase-admin'
import { kindOf } from '@/lib/occasions/kind'
import { getOpsPlanCore } from '@/lib/ops/event-ops'
import { getWorkPackagesByIdsCore } from '@/lib/ops/work-packages'
import { listResourcesCore } from '@/lib/ops/resources'
import { computeCloseoutSummary, marketDayCloseoutSummary } from '@/lib/ops/derive'
import type { Event, OpsCloseout, OpsActuals, CloseoutSummary } from '@/lib/types'

// Invoice generation deliberately does NOT live here: phase 3 (screens) wires
// "generate final invoice" to the existing invoicing system using
// closeoutSummaryCore's output. This module only records actuals and computes.

export function opsCloseoutRef(orgId: string, eventId: string) {
  return adminDb.collection('orgs').doc(orgId)
    .collection('events').doc(eventId)
    .collection('ops').doc('closeout')
}

export async function getCloseoutCore(orgId: string, eventId: string): Promise<OpsCloseout | null> {
  const snap = await opsCloseoutRef(orgId, eventId).get()
  return snap.exists ? (snap.data() as OpsCloseout) : null
}

/** Upsert actuals. Never regresses `completed`. */
export async function saveActualsCore(orgId: string, eventId: string, actuals: OpsActuals): Promise<void> {
  if (actuals.consumables?.some((c) => c.qty_used < 0)) throw new Error('Quantities must be non-negative')
  if (actuals.hours_worked !== undefined && actuals.hours_worked < 0) throw new Error('Quantities must be non-negative')
  if (actuals.sales !== undefined && actuals.sales < 0) throw new Error('Quantities must be non-negative')

  const existing = await getCloseoutCore(orgId, eventId)
  const now = new Date().toISOString()
  const cleaned: OpsActuals = {}
  if (actuals.consumables !== undefined) cleaned.consumables = actuals.consumables
  if (actuals.hours_worked !== undefined) cleaned.hours_worked = actuals.hours_worked
  if (actuals.sales !== undefined) cleaned.sales = actuals.sales
  if (actuals.waste_notes !== undefined) cleaned.waste_notes = actuals.waste_notes
  await opsCloseoutRef(orgId, eventId).set(
    {
      actuals: { ...(existing?.actuals ?? {}), ...cleaned },
      completed: existing?.completed ?? false,
      ...(existing ? {} : { created_at: now }),
      updated_at: now,
    },
    { merge: true },
  )
}

export async function closeoutSummaryCore(orgId: string, eventId: string): Promise<CloseoutSummary> {
  // The action is client-called with no event in scope, so the core reads the
  // event doc itself (one direct get): booth_fee joins BOTH margins, and kind
  // decides whether a plan is required at all (spec 2026-08-23 S1).
  const [plan, eventSnap] = await Promise.all([
    getOpsPlanCore(orgId, eventId),
    adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId).get(),
  ])
  const event = eventSnap.exists ? (eventSnap.data() as Event) : null
  const boothFee = event?.booth_fee ?? 0

  if (!plan) {
    // Closeout-lite: market days have no ops layer, and saveActualsCore /
    // completeCloseoutCore are already plan-free — the summary follows.
    if (!event || kindOf(event) !== 'market_day') throw new Error('No ops plan for this event')
    const closeout = await getCloseoutCore(orgId, eventId)
    // Resources are only needed to cost recorded consumable actuals — the lite
    // screen records none, so skip the read on the common path.
    const resources = closeout?.actuals?.consumables?.length ? await listResourcesCore(orgId) : []
    return marketDayCloseoutSummary({
      resources,
      actual_consumables: closeout?.actuals?.consumables ?? [],
      sales: closeout?.actuals?.sales ?? 0,
      booth_fee: boothFee,
    })
  }

  const [packages, resources, closeout] = await Promise.all([
    getWorkPackagesByIdsCore(orgId, plan.package_ids),
    listResourcesCore(orgId),
    getCloseoutCore(orgId, eventId),
  ])
  const foundIds = new Set(packages.map((p) => p.id))
  for (const id of plan.package_ids) {
    if (!foundIds.has(id)) throw new Error(`Package no longer exists: ${id}`)
  }
  return computeCloseoutSummary({
    packages,
    resources,
    guests: plan.requirements.guests,
    actual_consumables: closeout?.actuals?.consumables ?? [],
    sales: closeout?.actuals?.sales ?? 0,
    booth_fee: boothFee,
  })
}

/** actuals counts as "recorded" only if at least one field is actually populated. */
function hasRecordedActuals(actuals: OpsActuals | undefined): boolean {
  if (!actuals) return false
  return (actuals.consumables?.length ?? 0) > 0
    || actuals.hours_worked !== undefined
    || actuals.sales !== undefined
    || actuals.waste_notes !== undefined
}

/** The season strip is a rollup, not an archive — at most this many doc gets. */
export const SERIES_ROLLUP_CAP = 30

export interface SeriesRollupSelection {
  /** Day ids the rollup actually reads (at most `cap`). */
  readIds: string[]
  /** Day ids past the cap — never read. Callers owe these an honest
   *  "beyond the rollup" state, never the failed-read cell/copy. */
  beyondCapIds: string[]
}

/**
 * Which of a season's days the capped rollup reads. A season can grow past
 * the cap across repeated extends (lib/occasions/series.ts), and the verdict
 * matters most late in the season — so days that can already hold a closeout
 * (event_start <= today) win the budget, NEWEST first; any remaining budget
 * goes to upcoming days, soonest first. Pure: no Firestore, fully testable.
 */
export function selectSeriesRollupDays(
  days: { id: string; event_start: string }[],
  today: string,
  cap = SERIES_ROLLUP_CAP,
): SeriesRollupSelection {
  const past = days
    .filter((d) => d.event_start.slice(0, 10) <= today)
    .sort((a, b) => b.event_start.localeCompare(a.event_start) || b.id.localeCompare(a.id))
  const future = days
    .filter((d) => d.event_start.slice(0, 10) > today)
    .sort((a, b) => a.event_start.localeCompare(b.event_start) || a.id.localeCompare(b.id))
  const readIds = [...past, ...future].slice(0, cap).map((d) => d.id)
  const read = new Set(readIds)
  return { readIds, beyondCapIds: days.filter((d) => !read.has(d.id)).map((d) => d.id) }
}

/**
 * Closeout docs for a series' days — direct doc gets via Promise.all, capped
 * at SERIES_ROLLUP_CAP as a read-cost backstop. Callers with more days than
 * the cap must pick WHICH days to read via selectSeriesRollupDays (closeouts
 * live on recent days, not the season's oldest) and give the unselected rest
 * a distinct beyond-the-rollup state.
 * Failed ≠ missing: a successful read of a nonexistent doc maps to `null`
 * ("not closed out"), while a FAILED read is absent from the result entirely,
 * so callers render "unknown" — never a false $0 day.
 */
export async function listSeriesCloseoutsCore(
  orgId: string,
  eventIds: string[],
): Promise<Record<string, OpsCloseout | null>> {
  const reads = await Promise.all(
    eventIds.slice(0, SERIES_ROLLUP_CAP).map(async (id) => {
      try {
        return { id, closeout: await getCloseoutCore(orgId, id) }
      } catch {
        return null
      }
    }),
  )
  const out: Record<string, OpsCloseout | null> = {}
  for (const r of reads) if (r) out[r.id] = r.closeout
  return out
}

export async function completeCloseoutCore(orgId: string, eventId: string): Promise<void> {
  const existing = await getCloseoutCore(orgId, eventId)
  if (!existing || !hasRecordedActuals(existing.actuals)) {
    throw new Error('Record actuals before completing closeout')
  }
  const now = new Date().toISOString()
  await opsCloseoutRef(orgId, eventId).set(
    { completed: true, completed_at: now, updated_at: now },
    { merge: true },
  )
}
