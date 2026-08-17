import { cache } from 'react'
import { adminDb } from '@/lib/firebase-admin'
import { getCalendarFeed } from '@/actions/calendar'
import { listEvents } from '@/actions/events'

/** Resolve an org slug to its id, memoised per request — the layout, the canvas
 *  page and the day route all need it, so this collapses 2-3 identical org reads
 *  into one. Returns null when the slug matches no org (caller → notFound()). */
export const orgIdBySlug = cache(async (slug: string): Promise<string | null> => {
  const snap = await adminDb.collection('orgs').where('slug', '==', slug).limit(1).get()
  return snap.empty ? null : snap.docs[0].id
})

// Request-scoped memoisation for the cockpit. The calendar layout, the canvas
// page and the day route all render inside ONE server request and each need the
// org feed / events. React.cache() collapses those repeated calls into a single
// fetch per request (keyed by args) instead of the 2-3x org-wide fan-out the
// routes were otherwise paying.
//
// These wrap the membership-asserting ACTIONS (not the raw core fetchers), so the
// auth check is preserved (and itself deduped). Only the calendar routes import
// this module, so the memoisation is scoped to the cockpit.
//
// PERF (fast-follow): getDayDetail still issues its own org-wide source fan-out
// (it needs the raw arrays, not the assembled feed), and assembleCalendarFeed
// still reads whole collections — genuine query-level bounding (Firestore range
// reads across events/leads/invoices/…) is a data-layer refactor with new
// indexes, tracked separately rather than forced into this shell wave.

export const orgCalendarFeed = cache((orgId: string, orgSlug: string) => getCalendarFeed(orgId, orgSlug))

export const orgEvents = cache((orgId: string) => listEvents(orgId))
