'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertEventPage } from '@/lib/auth/assert'
import type { ItineraryItem } from '@/lib/types'
import { randomBytes } from 'crypto'

function eventRef(orgId: string, eventId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId)
}

function itineraryRef(orgId: string, eventId: string) {
  return eventRef(orgId, eventId).collection('itinerary')
}

// ⚠️ SECURITY — PRE-EXISTING EXPOSURE, deliberately NOT fixed in this diff.
// listItinerary has NO auth assert, unlike every mutation below (which all
// assertEventPage(..., 'itinerary')). It CANNOT simply be given that assert:
// it is load-bearing for the PUBLIC registrant schedule page
// (app/(registrant)/[orgSlug]/[eventSlug]/schedule/page.tsx:33), whose viewers
// are not org members — and the admin runsheet pages guard with
// requireEventPage(..., 'ops'), not 'itinerary', so the assert would also
// break the run sheet for ops-only members.
// EXPOSURE: because this is an exported 'use server' action, it is a POST
// endpoint any caller can invoke with an arbitrary orgId/eventId and read that
// event's full itinerary (titles, locations, descriptions) — the registrant
// page's itinerary_published check happens in the PAGE, not here. Guardless
// since the d2 rename (26d6d1a).
// FIX (separate task, not this diff): move the read into a guard-free
// listItineraryCore in lib/ for server pages that already guard, and put an
// assertEventPage / itinerary_published check on the exported action.
export async function listItinerary(orgId: string, eventId: string): Promise<ItineraryItem[]> {
  const snap = await itineraryRef(orgId, eventId).get()
  return snap.docs.map((d) => d.data() as ItineraryItem)
}

export interface CreateItineraryItemInput {
  day: string
  start_time: string
  end_time?: string
  title: string
  location?: string
  description?: string
  sort_order: number
}

export async function createItineraryItem(
  orgId: string,
  eventId: string,
  input: CreateItineraryItemInput
): Promise<ItineraryItem> {
  await assertEventPage(orgId, eventId, 'itinerary')
  const id = randomBytes(8).toString('hex')
  const now = new Date().toISOString()
  const item: ItineraryItem = {
    id,
    day: input.day,
    start_time: input.start_time,
    ...(input.end_time ? { end_time: input.end_time } : {}),
    title: input.title,
    ...(input.location ? { location: input.location } : {}),
    ...(input.description ? { description: input.description } : {}),
    sort_order: input.sort_order,
    created_at: now,
  }
  await itineraryRef(orgId, eventId).doc(id).set(item)
  return item
}

export async function updateItineraryItem(
  orgId: string,
  eventId: string,
  itemId: string,
  updates: Partial<Pick<ItineraryItem, 'day' | 'start_time' | 'end_time' | 'title' | 'location' | 'description' | 'sort_order'>>
): Promise<void> {
  await assertEventPage(orgId, eventId, 'itinerary')
  await itineraryRef(orgId, eventId).doc(itemId).update({
    ...updates,
    updated_at: new Date().toISOString(),
  })
}

export async function deleteItineraryItem(orgId: string, eventId: string, itemId: string): Promise<void> {
  await assertEventPage(orgId, eventId, 'itinerary')
  await itineraryRef(orgId, eventId).doc(itemId).delete()
}

export async function setItineraryPublished(
  orgId: string,
  eventId: string,
  published: boolean
): Promise<void> {
  await assertEventPage(orgId, eventId, 'itinerary')
  await eventRef(orgId, eventId).update({ itinerary_published: published })
}
