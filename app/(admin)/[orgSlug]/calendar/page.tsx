export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getCalendarFeed } from '@/actions/calendar'
import { filterFeed, PIPELINE_KINDS } from '@/lib/calendar'
import { feedInWindow, normalizeView } from '@/lib/calendar-window'
import { todayYmd } from '@/lib/opportunity-detail'
import { CalendarCanvas } from '@/components/admin/calendar/CalendarCanvas'

/**
 * The canvas page: reads `?view` / `?week` / `?kinds` (only pages can) and fetches
 * its own visible-window feed, bounded to the shown view — never the whole
 * unbounded feed. Defaults to today's Week view. No day is selected here, so the
 * spine lives on the sibling `/calendar/[ymd]` route.
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

  const feed = await getCalendarFeed(orgId, orgSlug)
  const scoped = kinds === 'pipeline' ? filterFeed(feed, PIPELINE_KINDS) : feed
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
