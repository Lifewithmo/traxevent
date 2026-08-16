import { adminDb } from '@/lib/firebase-admin'
import { buildEventSlug } from '@/lib/slug'
import { DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import type { Terminology } from '@/lib/event-types'
import type { Event, EventRegistrationType, EventKind, EventLocation, EventHours } from '@/lib/types'

export function eventsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('events')
}

export interface CreateEventCoreInput {
  name: string
  year: number
  registration_type?: EventRegistrationType   // optional since occasions R1
  event_type_id?: string
  event_type_terminology?: Terminology
  event_start: string
  event_end: string
  department_id?: string | null
  headcount?: number
  lead_id?: string
  kind?: EventKind
  location?: EventLocation
  hours?: EventHours
  booth_fee?: number
  series_id?: string
  status?: 'draft' | 'active'                 // series days are born active (spec §3.2)
}

/**
 * Resolves a name+year into a slug guaranteed unique within the org, appending
 * -2, -3, … on collision. Every event-creation path shares this: slugs are
 * resolved with a `.where('slug', '==', …).limit(1)` query (getEventBySlug,
 * requireEventPage), so a collision would silently route navigation to the
 * FIRST event with that slug rather than the one just created.
 */
export async function resolveUniqueEventSlug(orgId: string, name: string, year: number): Promise<string> {
  const baseSlug = buildEventSlug(name, year)
  let slug = baseSlug
  let suffix = 2
  while (!(await eventsRef(orgId).where('slug', '==', slug).limit(1).get()).empty) {
    slug = `${baseSlug}-${suffix}`
    suffix++
  }
  return slug
}

/** Guard-free event create. Authorization is the caller's responsibility. */
export async function createEventCore(orgId: string, input: CreateEventCoreInput): Promise<Event> {
  const eventRef = eventsRef(orgId).doc()
  const slug = await resolveUniqueEventSlug(orgId, input.name, input.year)
  const event: Event = {
    id: eventRef.id,
    name: input.name,
    slug,
    year: input.year,
    status: input.status ?? 'draft',
    ...(input.registration_type ? { registration_type: input.registration_type } : {}),
    event_type_id: input.event_type_id ?? DEFAULT_EVENT_TYPE_ID,
    ...(input.event_type_terminology ? { event_type_terminology: input.event_type_terminology } : {}),
    ...(input.department_id ? { department_id: input.department_id } : {}),
    ...(input.headcount !== undefined ? { headcount: input.headcount } : {}),
    ...(input.lead_id ? { lead_id: input.lead_id } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.location ? { location: input.location } : {}),
    ...(input.hours ? { hours: input.hours } : {}),
    ...(input.booth_fee !== undefined ? { booth_fee: input.booth_fee } : {}),
    ...(input.series_id ? { series_id: input.series_id } : {}),
    event_start: input.event_start,
    event_end: input.event_end,
    created_at: new Date().toISOString(),
  }
  await eventRef.set(event)
  return event
}

/** Guard-free event list, newest first. */
export async function listEventsCore(orgId: string): Promise<Event[]> {
  const snap = await eventsRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Event)
}

/**
 * Every job created from one opportunity, newest first. Deliberately does NOT
 * chain .orderBy() — a composite index for an equality query returning one or
 * two docs is not worth carrying. Sorted in memory instead.
 */
export async function listEventsByLeadCore(orgId: string, leadId: string): Promise<Event[]> {
  const snap = await eventsRef(orgId).where('lead_id', '==', leadId).get()
  return snap.docs
    .map((d) => d.data() as Event)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}
