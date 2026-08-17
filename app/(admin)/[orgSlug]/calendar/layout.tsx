export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getCalendarFeed } from '@/actions/calendar'
import { listEvents } from '@/actions/events'
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
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const today = todayYmd()
  const [feed, events, icsToken] = await Promise.all([
    getCalendarFeed(orgId, orgSlug),
    listEvents(orgId),
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
    // and the canvas/spine each scroll independently. Below md the rail goes away
    // and the canvas takes the full width (mirrors the Clients cockpit).
    <div className="flex h-full min-h-0 max-md:flex-col">
      <div className="hidden h-full w-[280px] shrink-0 border-r border-sidebar-border md:block">
        <CalendarLeftRail orgSlug={orgSlug} today={today} rollup={rollup} runway={runway} subscribeUrl={subscribeUrl} />
      </div>
      <div className="flex min-w-0 flex-1 overflow-hidden max-lg:flex-col">{children}</div>
    </div>
  )
}
