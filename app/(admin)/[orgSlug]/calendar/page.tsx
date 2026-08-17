export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { orgCalendarFeed } from '@/lib/calendar-fetch'
import { filterFeed, PIPELINE_KINDS } from '@/lib/calendar'
import { feedInWindow, normalizeView } from '@/lib/calendar-window'
import { todayYmd } from '@/lib/opportunity-detail'
import { CalendarCanvas } from '@/components/admin/calendar/CalendarCanvas'

/**
 * The canvas page: reads `?view` / `?week` / `?kinds` (only pages can), then hands
 * the canvas only the span-aware window for the shown view (feedInWindow) rather
 * than the whole feed. The DB read itself is still org-wide — it is shared with the
 * layout via the React.cache()'d orgCalendarFeed, and query-level bounding is a
 * tracked fast-follow (see lib/calendar-fetch.ts). Defaults to today's Week view;
 * no day is selected here, so the spine lives on the `/calendar/[ymd]` route.
 */
export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ week?: string; view?: string; kinds?: string }>
}) {
  const [{ orgSlug }, sp] = await Promise.all([params, searchParams])
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const today = todayYmd()
  const view = normalizeView(sp.view)
  const anchor = (sp.week ?? today).slice(0, 10)
  const kinds = sp.kinds === 'pipeline' ? 'pipeline' : undefined

  const feed = await orgCalendarFeed(orgId, orgSlug)
  const scoped = kinds === 'pipeline' ? filterFeed(feed, PIPELINE_KINDS) : feed
  // Hand the canvas only the shown view's span-aware window (in-memory bound).
  const items = feedInWindow(scoped, view, anchor)

  return (
    <CalendarCanvas
      orgSlug={orgSlug}
      items={items}
      today={today}
      view={view}
      anchor={anchor}
      kinds={kinds}
    />
  )
}
