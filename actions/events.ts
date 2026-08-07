'use server'

import { randomBytes } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { FieldValue } from 'firebase-admin/firestore'
import type { Event, EventRegistrationType } from '@/lib/types'
import { buildEventSlug } from '@/lib/slug'
import type { Terminology } from '@/lib/event-types'
import { createEventCore, listEventsCore, listEventsByLeadCore, type CreateEventCoreInput } from '@/lib/events'

export async function createEvent(
  orgId: string,
  input: {
    name: string
    year: number
    registration_type: EventRegistrationType
    event_type_id?: string
    event_type_terminology?: Terminology
    event_start: string
    event_end: string
    department_id?: string | null
  }
): Promise<Event> {
  await assertOrgAdmin(orgId)
  return createEventCore(orgId, input)
}

export async function listEvents(orgId: string): Promise<Event[]> {
  await assertOrgMember(orgId)
  return listEventsCore(orgId)
}

export async function listEventsByLead(orgId: string, leadId: string): Promise<Event[]> {
  await assertOrgMember(orgId)
  return listEventsByLeadCore(orgId, leadId)
}

export async function getEventBySlug(orgId: string, slug: string): Promise<Event | null> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('events')
    .where('slug', '==', slug)
    .limit(1)
    .get()
  return snap.empty ? null : (snap.docs[0].data() as Event)
}

export async function updateEvent(
  orgId: string,
  eventId: string,
  updates: Partial<Pick<Event,
    | 'name'
    | 'status'
    | 'event_type_id'
    // note: registration_type and event_type_id should be updated together — they are coupled
    | 'registration_type'
    | 'event_start'
    | 'event_end'
    | 'registration_open'
    | 'registration_close'
    | 'capacity'
    | 'payment_amount'
    | 'from_display_name'
    | 'reply_to_email'
    | 'department_id'
    | 'headcount'
    | 'key_contacts'
  >> & { event_type_terminology?: Terminology | null }
): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = adminDb
    .collection('orgs').doc(orgId)
    .collection('events').doc(eventId)

  const snap = await ref.get()
  if (!snap.exists) throw new Error('Event not found')

  // Firestore rejects `undefined` (ignoreUndefinedProperties is off). Convention:
  //   undefined  → leave the field unchanged (callers pass it for blank optionals)
  //   null       → explicitly clear the field (FieldValue.delete())
  // Note: this only strips `undefined` at the top level. `key_contacts` is an array —
  // Firestore also rejects `undefined` nested inside array elements (e.g. a contact
  // whose optional `phone`/`email` was cleared), so normalize those below.
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }

  if (updates.key_contacts) {
    cleaned.key_contacts = updates.key_contacts.map((contact) => ({
      name: contact.name,
      role: contact.role,
      ...(contact.phone !== undefined ? { phone: contact.phone } : {}),
      ...(contact.email !== undefined ? { email: contact.email } : {}),
    }))
  }

  await ref.update({
    ...cleaned,
    updated_at: new Date().toISOString(),
  })
}

export interface DuplicateEventInput {
  name: string
  year: number
  event_start: string
  event_end: string
}

export async function duplicateEvent(
  orgId: string,
  sourceEventId: string,
  input: DuplicateEventInput
): Promise<Event> {
  await assertOrgAdmin(orgId)
  const eventsCol = adminDb.collection('orgs').doc(orgId).collection('events')
  const sourceRef = eventsCol.doc(sourceEventId)
  const sourceSnap = await sourceRef.get()
  if (!sourceSnap.exists) throw new Error('Source event not found')
  const source = sourceSnap.data() as Event

  const baseSlug = buildEventSlug(input.name, input.year)
  let slug = baseSlug
  let suffix = 2
  while (!(await eventsCol.where('slug', '==', slug).limit(1).get()).empty) {
    slug = `${baseSlug}-${suffix}`
    suffix++
  }

  const newRef = eventsCol.doc()
  const newEvent: Event = {
    id: newRef.id,
    name: input.name,
    slug,
    year: input.year,
    status: 'draft',
    registration_type: source.registration_type,
    event_type_id: source.event_type_id,
    ...(source.event_type_terminology ? { event_type_terminology: source.event_type_terminology } : {}),
    features: source.features,
    event_start: input.event_start,
    event_end: input.event_end,
    ...(source.capacity != null ? { capacity: source.capacity } : {}),
    ...(source.payment_amount != null ? { payment_amount: source.payment_amount } : {}),
    ...(source.from_display_name ? { from_display_name: source.from_display_name } : {}),
    ...(source.reply_to_email ? { reply_to_email: source.reply_to_email } : {}),
    created_at: new Date().toISOString(),
  }
  await newRef.set(newEvent)

  try {
    const [slotsSnap, formsSnap] = await Promise.all([
      sourceRef.collection('assignment_slots').get(),
      sourceRef.collection('form_assignments').get(),
    ])

    await Promise.all([
      ...slotsSnap.docs.map((d) => {
        const id = randomBytes(8).toString('hex')
        return newRef.collection('assignment_slots').doc(id).set({ ...d.data(), id, created_at: new Date().toISOString() })
      }),
      ...formsSnap.docs.map((d) => {
        const id = randomBytes(8).toString('hex')
        return newRef.collection('form_assignments').doc(id).set({ ...d.data(), id, created_at: new Date().toISOString() })
      }),
    ])
  } catch (err) {
    // Roll back the orphaned draft so the user can cleanly retry.
    await newRef.delete()
    throw err
  }

  return newEvent
}
