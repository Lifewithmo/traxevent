import { adminDb } from '@/lib/firebase-admin'
import type { ItineraryItem } from '@/lib/types'

// Server-only itinerary reads. Kept separate from lib/itinerary.ts, whose
// display helpers (grouping/formatting) are imported by 'use client'
// components — pulling firebase-admin into that module would break them.

function itineraryRef(orgId: string, eventId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId).collection('itinerary')
}

/**
 * Guard-free itinerary read (bare .get(); ordering happens in memory, in
 * groupItineraryByDay). Every caller is a server page that has ALREADY
 * gated: requireEventPage for the admin itinerary/runsheet pages, the
 * event's itinerary_published flag for the public registrant schedule.
 * Never re-export this from a 'use server' module — the old exported
 * listItinerary action was an unauthenticated POST endpoint that read any
 * org's itinerary (removed; see __tests__/actions/itinerary.test.ts).
 */
export async function listItineraryCore(orgId: string, eventId: string): Promise<ItineraryItem[]> {
  const snap = await itineraryRef(orgId, eventId).get()
  return snap.docs.map((d) => d.data() as ItineraryItem)
}
