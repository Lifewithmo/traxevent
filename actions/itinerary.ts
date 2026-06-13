'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { ItineraryItem } from '@/lib/types'
import { randomBytes } from 'crypto'

function campRef(orgId: string, campId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId)
}

function itineraryRef(orgId: string, campId: string) {
  return campRef(orgId, campId).collection('itinerary')
}

export async function listItinerary(orgId: string, campId: string): Promise<ItineraryItem[]> {
  const snap = await itineraryRef(orgId, campId).get()
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
  campId: string,
  input: CreateItineraryItemInput
): Promise<ItineraryItem> {
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
  await itineraryRef(orgId, campId).doc(id).set(item)
  return item
}

export async function updateItineraryItem(
  orgId: string,
  campId: string,
  itemId: string,
  updates: Partial<Pick<ItineraryItem, 'day' | 'start_time' | 'end_time' | 'title' | 'location' | 'description' | 'sort_order'>>
): Promise<void> {
  await itineraryRef(orgId, campId).doc(itemId).update({
    ...updates,
    updated_at: new Date().toISOString(),
  })
}

export async function deleteItineraryItem(orgId: string, campId: string, itemId: string): Promise<void> {
  await itineraryRef(orgId, campId).doc(itemId).delete()
}

export async function setItineraryPublished(
  orgId: string,
  campId: string,
  published: boolean
): Promise<void> {
  await campRef(orgId, campId).update({ itinerary_published: published })
}
