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
