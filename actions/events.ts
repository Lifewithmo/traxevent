'use server'

import { randomBytes } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { FieldValue } from 'firebase-admin/firestore'
import type { Event, EventRegistrationType, EventLocation, EventHours } from '@/lib/types'
import type { Terminology } from '@/lib/event-types'
import { createEventCore, listEventsCore, listEventsByLeadCore, resolveUniqueEventSlug } from '@/lib/events'
import { getOpsPlanCore, recomputeOpsListsCore, clearReadyConfirmedCore } from '@/lib/ops/event-ops'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

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
    // Optional working hours for client jobs (writes the existing Event.hours field).
    // Blank → omitted → the calendar renders the job in the all-day "time TBD" band.
    hours?: EventHours
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
  updates: Omit<Partial<Pick<Event,
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
    | 'location'
    | 'hours'
    | 'booth_fee'
    | 'notify_family_on_pickup'
  >>, 'location' | 'hours' | 'booth_fee'> & {
    event_type_terminology?: Terminology | null
    // location/hours/booth_fee: null explicitly clears (FieldValue.delete()), see convention below.
    // Event's own type keeps these non-nullable-when-present; only the write path accepts null.
    location?: EventLocation | null
    hours?: EventHours | null
    booth_fee?: number | null
  }
): Promise<void> {
  const member = await assertOrgAdmin(orgId)
  const ref = adminDb
    .collection('orgs').doc(orgId)
    .collection('events').doc(eventId)

  const snap = await ref.get()
  if (!snap.exists) throw new Error('Event not found')
  const prev = snap.data() as Event

  // Firestore rejects `undefined` (ignoreUndefinedProperties is off). Convention:
  //   undefined  → leave the field unchanged (callers pass it for blank optionals)
  //   null       → explicitly clear the field (FieldValue.delete())
  // Note: this only strips `undefined` at the top level. `key_contacts` is an array —
  // Firestore also rejects `undefined` nested inside array elements (e.g. a contact
  // whose optional `phone`/`email` was cleared), so normalize those below.
  //
  // SECURITY NOTE (PRE-EXISTING, documented in the 2026-08-23 inc-2 review —
  // deliberately NOT changed in that fix wave): the Pick<> in the signature is
  // a COMPILE-TIME allowlist only. This loop copies EVERY top-level key the
  // wire payload carries into the Firestore update, so a caller invoking the
  // server action directly (bypassing TypeScript) can write arbitrary Event
  // fields — `slug`, `kind`, `series_id`, `id`, `created_at`, …. Blast radius
  // is bounded to org admins by assertOrgAdmin above. Fix shape when picked
  // up: enforce the allowlist at RUNTIME — iterate a const array of permitted
  // field names and reject unknown keys (the REQUIREMENT_FIELDS pattern in
  // lib/ops/event-ops.ts updateOpsRequirementsCore).
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

  // Tesler ratchet (spec 2026-08-19 B5): a headcount change re-derives the ops
  // lists AND syncs the plan's guests + needs_review (guests-path precedent) so
  // the plan never silently diverges from the event. Ordering: the event write
  // lands first — if the re-derive fails (e.g. a plan package was deleted), the
  // headcount is saved, this throws visibly, and the load-out divergence
  // warning is the recovery path. Non-positive headcounts are skipped: lists
  // can't be derived for 0 guests, so the divergence warning covers that too.
  const wantsRederive =
    updates.headcount !== undefined &&
    updates.headcount !== prev.headcount &&
    Number.isFinite(updates.headcount) &&
    updates.headcount > 0

  // Confirm-ready clearing path (c) (inc-2 P2): a moved date or shifted hours
  // invalidates the operator's "ready" attestation — the settings form always
  // sends these fields, so compare against the previous doc and only a REAL
  // change clears. The re-derive above already clears (path b), so the direct
  // clear only runs when no recompute will.
  //
  // Hours compare FIELD-WISE, never by serialization: production Firestore
  // returns map keys sorted ({end, start}) while the form sends {start, end},
  // so JSON.stringify of IDENTICAL hours is unequal and every settings save
  // (a rename, a contact edit) would spuriously clear the attestation. The
  // emulator preserves insertion order, so only a field-wise compare is safe
  // on both.
  const prevHours = prev.hours ?? null
  const nextHours = updates.hours ?? null
  const hoursChanged =
    updates.hours !== undefined &&
    ((nextHours?.start ?? null) !== (prevHours?.start ?? null) ||
      (nextHours?.end ?? null) !== (prevHours?.end ?? null))
  const dateOrHoursChanged =
    (updates.event_start !== undefined && updates.event_start !== prev.event_start) ||
    (updates.event_end !== undefined && updates.event_end !== prev.event_end) ||
    hoursChanged

  if (wantsRederive || dateOrHoursChanged) {
    const plan = await getOpsPlanCore(orgId, eventId)
    if (plan) {
      if (wantsRederive) {
        // recomputeOpsListsCore clears ready_confirmed itself (clearing path b).
        await recomputeOpsListsCore(orgId, eventId, member.uid, { guests: updates.headcount as number })
      } else if (plan.ready_confirmed) {
        await clearReadyConfirmedCore(orgId, eventId, member.uid)
      }
    }
  }
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

  const slug = await resolveUniqueEventSlug(orgId, input.name, input.year)

  const newRef = eventsCol.doc()
  const newEvent: Event = {
    id: newRef.id,
    name: input.name,
    slug,
    year: input.year,
    status: 'draft',
    ...(source.registration_type ? { registration_type: source.registration_type } : {}),
    event_type_id: source.event_type_id,
    ...(source.event_type_terminology ? { event_type_terminology: source.event_type_terminology } : {}),
    ...(source.kind ? { kind: source.kind } : {}),
    ...(source.location ? { location: source.location } : {}),
    ...(source.hours ? { hours: source.hours } : {}),
    ...(source.booth_fee !== undefined ? { booth_fee: source.booth_fee } : {}),
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

/** Direct market-day creation (spec §3.1/§6: "+ New → Market day"). Born active — no draft gate. */
export async function createMarketDay(
  orgId: string,
  input: {
    name: string
    date: string
    location: { name: string; address?: string }
    hours?: { start: string; end: string }
    booth_fee?: number
  },
): Promise<Event> {
  await assertOrgAdmin(orgId)
  if (!input.name?.trim()) throw new Error('A name is required')
  if (!DAY_RE.test(input.date ?? '')) throw new Error('Pick a valid date')
  if (!input.location?.name?.trim()) throw new Error('A location is required')
  return createEventCore(orgId, {
    name: input.name.trim(),
    year: Number(input.date.slice(0, 4)),
    kind: 'market_day',
    status: 'active',
    event_start: input.date,
    event_end: input.date,
    location: { name: input.location.name.trim(), ...(input.location.address?.trim() ? { address: input.location.address.trim() } : {}) },
    ...(input.hours ? { hours: input.hours } : {}),
    ...(input.booth_fee !== undefined ? { booth_fee: input.booth_fee } : {}),
  })
}
