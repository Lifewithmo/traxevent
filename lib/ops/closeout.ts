import { adminDb } from '@/lib/firebase-admin'
import { getOpsPlanCore } from '@/lib/ops/event-ops'
import { getWorkPackagesByIdsCore } from '@/lib/ops/work-packages'
import { listResourcesCore } from '@/lib/ops/resources'
import { computeCloseoutSummary } from '@/lib/ops/derive'
import type { OpsCloseout, OpsActuals, CloseoutSummary } from '@/lib/types'

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
  const plan = await getOpsPlanCore(orgId, eventId)
  if (!plan) throw new Error('No ops plan for this event')
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
