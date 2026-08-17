export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { orgCalendarFeed, orgEvents, orgIdBySlug } from '@/lib/calendar-fetch'
import { ensureIcsToken } from '@/actions/calendar-sync'
import { feedInWindow } from '@/lib/calendar-window'
import { weekRollup } from '@/lib/calendar-week'
import { buildRunway } from '@/lib/calendar-cashflow'
import { todayYmd } from '@/lib/opportunity-detail'
import { CalendarLeftRail } from '@/components/admin/calendar/CalendarLeftRail'

/**
 * The cockpit shell (mirrors the Clients cockpit). The persistent LEFT RAIL lives
 * here so it survives day-nav and view-switches without a refetch — layouts don't
 * re-run on searchParam-only navigation. Its data is deliberately param-independent
 * (current-week KPIs + the runway horizon), so nothing here depends on `?view` /
 * `?week` / `?kinds` (which a server layout can't read anyway). The canvas page
 * reads those and fetches its own bounded window.
 */
export default async function CalendarLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgId = await orgIdBySlug(orgSlug)
  if (!orgId) notFound()

  const today = todayYmd()
  // orgCalendarFeed / orgEvents are React.cache()'d, so the page (and the day
  // route) reuse this same fetch within the request instead of re-fanning out.
  const [feed, events, icsToken] = await Promise.all([
    orgCalendarFeed(orgId, orgSlug),
    orgEvents(orgId),
    ensureIcsToken(orgId),
  ])
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? ''
  const subscribeUrl = `${origin}/ics/${orgSlug}/${icsToken}`

  // KPI stack summarises THIS week. Uses the SPAN-AWARE window (not a start-date
  // bound) so a multi-day booking that started last week but spans into this one is
  // counted — matching what the WeekGrid renders. The runway scans the whole feed
  // forward to each upcoming booked job (receivables timing).
  const rollup = weekRollup(feedInWindow(feed, 'week', today), today)
  const runway = buildRunway(feed, events, new Date())

  return (
    // main (org layout) is a stretched, scrollable box — h-full fills it; the rail
    // and the canvas/spine each scroll independently. The rail manages its own
    // responsive shape: an in-flow 280px column at md+, an off-canvas drawer below
    // (its mobile bar sits above the canvas), mirroring the Clients cockpit.
    <div className="flex h-full min-h-0 max-md:flex-col">
      <CalendarLeftRail orgSlug={orgSlug} today={today} rollup={rollup} runway={runway} subscribeUrl={subscribeUrl} />
      <div className="flex min-w-0 flex-1 overflow-hidden max-lg:flex-col">{children}</div>
    </div>
  )
}
