export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getDayDetail } from '@/actions/calendar'
import { orgCalendarFeed, orgEvents, orgInvoices, orgIdBySlug } from '@/lib/calendar-fetch'
import { filterFeed, PIPELINE_KINDS } from '@/lib/calendar'
import { feedInWindow, normalizeView } from '@/lib/calendar-window'
import { buildRunway } from '@/lib/calendar-cashflow'
import { todayYmd, isValidYmd, normalizeYmd } from '@/lib/opportunity-detail'
import { CalendarCanvas } from '@/components/admin/calendar/CalendarCanvas'
import { DaySpine } from '@/components/admin/calendar/DaySpine'

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
  // Round-trip validation, NOT a shape regex: /^\d{4}-\d{2}-\d{2}$/ accepts
  // 2026-02-31, which Date rolls over to March 3 — the page then rendered a
  // confident "March 3, 2026" at the URL /calendar/2026-02-31.
  if (!isValidYmd(ymd)) notFound()

  const orgId = await orgIdBySlug(orgSlug)
  if (!orgId) notFound()

  const today = todayYmd()
  const view = normalizeView(sp.view)
  // With a day open, centre the canvas on that day unless a week is pinned.
  const anchor = normalizeYmd(sp.week, ymd)
  const kinds = sp.kinds === 'pipeline' ? 'pipeline' : undefined

  // orgCalendarFeed / orgEvents are React.cache()'d, so these reuse the layout's
  // fetch within the request. getDayDetail keeps its own source fan-out (it needs
  // the raw arrays) — a tracked perf fast-follow, see lib/calendar-fetch.ts.
  const [feed, events, invoices, detail] = await Promise.all([
    orgCalendarFeed(orgId, orgSlug),
    orgEvents(orgId),
    orgInvoices(orgId),
    getDayDetail(orgId, orgSlug, ymd),
  ])
  const scoped = kinds === 'pipeline' ? filterFeed(feed, PIPELINE_KINDS) : feed
  const items = feedInWindow(scoped, view, anchor)
  const runway = buildRunway(feed, events, new Date(), invoices)

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
