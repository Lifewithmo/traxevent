'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { AssignmentSlot, Family } from '@/lib/types'
import { randomBytes } from 'crypto'

function slotsRef(orgId: string, campId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId).collection('assignment_slots')
}

function familiesRef(orgId: string, campId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId).collection('families')
}

export interface CreateSlotInput {
  name: string
  capacity?: number
  notes?: string
  sort_order?: number
}

export async function listSlots(orgId: string, campId: string): Promise<AssignmentSlot[]> {
  const snap = await slotsRef(orgId, campId).orderBy('sort_order', 'asc').get()
  return snap.docs.map((d) => d.data() as AssignmentSlot)
}

export async function createSlot(
  orgId: string,
  campId: string,
  input: CreateSlotInput
): Promise<AssignmentSlot> {
  const id = randomBytes(8).toString('hex')
  const now = new Date().toISOString()
  const slot: AssignmentSlot = {
    id,
    name: input.name,
    ...(input.capacity != null ? { capacity: input.capacity } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    sort_order: input.sort_order ?? 0,  // always write; default 0 so new slots appear first
    created_at: now,
  }
  await slotsRef(orgId, campId).doc(id).set(slot)
  return slot
}

export async function updateSlot(
  orgId: string,
  campId: string,
  slotId: string,
  updates: Partial<Pick<AssignmentSlot, 'name' | 'capacity' | 'notes' | 'sort_order'>>
): Promise<void> {
  await slotsRef(orgId, campId).doc(slotId).update({
    ...updates,
    updated_at: new Date().toISOString(),
  })
}

export async function deleteSlot(orgId: string, campId: string, slotId: string): Promise<void> {
  await slotsRef(orgId, campId).doc(slotId).delete()
}

export async function assignFamily(
  orgId: string,
  campId: string,
  familyId: string,
  slotId: string | null
): Promise<void> {
  await familiesRef(orgId, campId).doc(familyId).update({
    assignment_slot_id: slotId,
    updated_at: new Date().toISOString(),
  })
}

export async function autoAssign(
  orgId: string,
  campId: string
): Promise<{ assigned: number }> {
  const [slotsSnap, familiesSnap] = await Promise.all([
    slotsRef(orgId, campId).orderBy('sort_order', 'asc').get(),
    familiesRef(orgId, campId).get(),
  ])

  const slots = slotsSnap.docs.map((d) => d.data() as AssignmentSlot)
  if (slots.length === 0) return { assigned: 0 }

  const families = familiesSnap.docs
    .map((d) => d.data() as Family)
    .filter(
      (f) =>
        (f.registration_status === 'pending' || f.registration_status === 'confirmed') &&
        !f.assignment_slot_id
    )

  // Count current occupancy per slot
  const occupancy = new Map<string, number>(slots.map((s) => [s.id, 0]))
  familiesSnap.docs.forEach((d) => {
    const f = d.data() as Family
    if (f.assignment_slot_id && occupancy.has(f.assignment_slot_id)) {
      occupancy.set(f.assignment_slot_id, (occupancy.get(f.assignment_slot_id) ?? 0) + 1)
    }
  })

  let assigned = 0
  for (const family of families) {
    const available = slots.filter((s) => {
      const count = occupancy.get(s.id) ?? 0
      return s.capacity == null || count < s.capacity
    })
    if (available.length === 0) break

    available.sort((a, b) => (occupancy.get(a.id) ?? 0) - (occupancy.get(b.id) ?? 0))
    const target = available[0]

    await familiesRef(orgId, campId).doc(family.id).update({
      assignment_slot_id: target.id,
      updated_at: new Date().toISOString(),
    })
    occupancy.set(target.id, (occupancy.get(target.id) ?? 0) + 1)
    assigned++
  }

  return { assigned }
}
