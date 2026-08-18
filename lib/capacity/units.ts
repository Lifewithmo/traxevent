import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { CapacityBlockout, CapacityUnit, CapacityUnitKind } from '@/lib/types'

// The one plan gate lives in the firebase-free capacity module so the radar
// wiring can call it without pulling in the data layer; re-exported here for
// this file's own callers (and existing `@/lib/capacity/units` importers).
export { hasMultiResourceCapacity } from '@/lib/capacity/capacity'

const CAPACITY_UNIT_KINDS: CapacityUnitKind[] = ['mobile', 'venue']

export interface CreateCapacityUnitInput {
  name: string
  kind: CapacityUnitKind
}

export interface CapacityUnitUpdate {
  name?: string
  active?: boolean
  blockouts?: CapacityBlockout[]
}

/** Throws if a block-out range is malformed (missing bound, or start after end). Inclusive ranges, so start === end is valid. */
export function assertValidBlockout(b: CapacityBlockout): void {
  if (!b.start || !b.end) throw new Error('Block-out requires a start and end date')
  if (b.start > b.end) throw new Error('Block-out start must be on or before end')
}

export function capacityUnitsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('capacity_units')
}

export async function listCapacityUnitsCore(orgId: string): Promise<CapacityUnit[]> {
  const snap = await capacityUnitsRef(orgId).orderBy('name').get()
  return snap.docs.map((d) => d.data() as CapacityUnit)
}

/** Guard-free create. Validates name + kind; performs no auth. New units default active:true, blockouts:[]. */
export async function createCapacityUnitCore(orgId: string, input: CreateCapacityUnitInput): Promise<CapacityUnit> {
  if (!input.name?.trim()) throw new Error('Name is required')
  if (!CAPACITY_UNIT_KINDS.includes(input.kind)) throw new Error('Invalid capacity unit kind')
  const ref = capacityUnitsRef(orgId).doc()
  const unit: CapacityUnit = {
    id: ref.id,
    name: input.name.trim(),
    kind: input.kind,
    active: true,
    blockouts: [],
    created_at: new Date().toISOString(),
  }
  await ref.set(unit)
  return unit
}

/** Guard-free update. undefined = untouched. Validates name + every block-out range. */
export async function updateCapacityUnitCore(
  orgId: string,
  id: string,
  updates: CapacityUnitUpdate,
): Promise<void> {
  if (updates.name !== undefined && !updates.name.trim()) throw new Error('Name is required')
  if (updates.blockouts !== undefined) updates.blockouts.forEach(assertValidBlockout)
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  if (updates.name !== undefined) cleaned.name = updates.name.trim()
  await capacityUnitsRef(orgId).doc(id).update({ ...cleaned, updated_at: new Date().toISOString() })
}

export async function deleteCapacityUnitCore(orgId: string, id: string): Promise<void> {
  await capacityUnitsRef(orgId).doc(id).delete()
}
