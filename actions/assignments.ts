'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { AssignmentSlot, Family } from '@/lib/types'
import { randomBytes } from 'crypto'
import { assertEventPage } from '@/lib/auth/assert'

function slotsRef(orgId: string, eventId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId).collection('assignment_slots')
}

function familiesRef(orgId: string, eventId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId).collection('families')
}

export interface CreateSlotInput {
  name: string
  capacity?: number
  notes?: string
  sort_order?: number
}

export async function listSlots(orgId: string, eventId: string): Promise<AssignmentSlot[]> {
  await assertEventPage(orgId, eventId, 'assignments')
  const snap = await slotsRef(orgId, eventId).orderBy('sort_order', 'asc').get()
  return snap.docs.map((d) => d.data() as AssignmentSlot)
}

export async function createSlot(
  orgId: string,
  eventId: string,
  input: CreateSlotInput
): Promise<AssignmentSlot> {
  await assertEventPage(orgId, eventId, 'assignments')
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
  await slotsRef(orgId, eventId).doc(id).set(slot)
  return slot
}

export async function updateSlot(
  orgId: string,
  eventId: string,
  slotId: string,
  updates: Partial<Pick<AssignmentSlot, 'name' | 'capacity' | 'notes' | 'sort_order'>>
): Promise<void> {
  await assertEventPage(orgId, eventId, 'assignments')
  await slotsRef(orgId, eventId).doc(slotId).update({
    ...updates,
    updated_at: new Date().toISOString(),
  })
}

export async function deleteSlot(orgId: string, eventId: string, slotId: string): Promise<void> {
  await assertEventPage(orgId, eventId, 'assignments')
  const batch = adminDb.batch()
  batch.delete(slotsRef(orgId, eventId).doc(slotId))

  const affected = await familiesRef(orgId, eventId)
    .where('assignment_slot_id', '==', slotId)
    .get()
  const now = new Date().toISOString()
  affected.docs.forEach((d) =>
    batch.update(d.ref, { assignment_slot_id: null, updated_at: now })
  )

  await batch.commit()
}

export async function assignFamily(
  orgId: string,
  eventId: string,
  familyId: string,
  slotId: string | null
): Promise<void> {
  await assertEventPage(orgId, eventId, 'assignments')
  await familiesRef(orgId, eventId).doc(familyId).update({
    assignment_slot_id: slotId,
    updated_at: new Date().toISOString(),
  })
}

export async function autoAssign(
  orgId: string,
  eventId: string
): Promise<{ assigned: number }> {
  await assertEventPage(orgId, eventId, 'assignments')
  const [slotsSnap, familiesSnap] = await Promise.all([
    slotsRef(orgId, eventId).orderBy('sort_order', 'asc').get(),
    familiesRef(orgId, eventId).get(),
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

    await familiesRef(orgId, eventId).doc(family.id).update({
      assignment_slot_id: target.id,
      updated_at: new Date().toISOString(),
    })
    occupancy.set(target.id, (occupancy.get(target.id) ?? 0) + 1)
    assigned++
  }

  return { assigned }
}
