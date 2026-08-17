export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getDayDetail } from '@/actions/calendar'
import { orgCalendarFeed, orgEvents } from '@/lib/calendar-fetch'
import { filterFeed, PIPELINE_KINDS } from '@/lib/calendar'
import { feedInWindow, normalizeView } from '@/lib/calendar-window'
import { buildRunway } from '@/lib/calendar-cashflow'
import { todayYmd } from '@/lib/opportunity-detail'
import { CalendarCanvas } from '@/components/admin/calendar/CalendarCanvas'
import { DaySpine } from '@/components/admin/calendar/DaySpine'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * The day-detail spine route. Renders the same canvas (with the day highlighted)
 * beside the live-swapping spine. Deep-linkable at /calendar/2026-08-20; clicking
 * another day is an App-Router navigation that streams a fresh spine in place.
 */
export default async function CalendarDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; ymd: string }>
  searchParams: Promise<{ week?: string; view?: string; kinds?: string }>
}) {
  const [{ orgSlug, ymd }, sp] = await Promise.all([params, searchParams])
  if (!YMD.test(ymd)) notFound()

  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const today = todayYmd()
  const view = normalizeView(sp.view)
  // With a day open, centre the canvas on that day unless a week is pinned.
  const anchor = (sp.week ?? ymd).slice(0, 10)
  const kinds = sp.kinds === 'pipeline' ? 'pipeline' : undefined

  // orgCalendarFeed / orgEvents are React.cache()'d, so these reuse the layout's
  // fetch within the request. getDayDetail keeps its own source fan-out (it needs
  // the raw arrays) — a tracked perf fast-follow, see lib/calendar-fetch.ts.
  const [feed, events, detail] = await Promise.all([
    orgCalendarFeed(orgId, orgSlug),
    orgEvents(orgId),
    getDayDetail(orgId, orgSlug, ymd),
  ])
  const scoped = kinds === 'pipeline' ? filterFeed(feed, PIPELINE_KINDS) : feed
  const items = feedInWindow(scoped, view, anchor)
  const runway = buildRunway(feed, events, new Date())

  return (
    <>
      <CalendarCanvas
        orgSlug={orgSlug}
        items={items}
        today={today}
        view={view}
        anchor={anchor}
        kinds={kinds}
        selectedDay={ymd}
      />
      <div className="w-full shrink-0 border-t border-border lg:w-[360px] lg:border-l lg:border-t-0">
        <DaySpine orgSlug={orgSlug} today={today} detail={detail} runway={runway} />
      </div>
    </>
  )
}
