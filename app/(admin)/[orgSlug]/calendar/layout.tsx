export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { orgCalendarFeed, orgEvents, orgInvoices, orgIdBySlug } from '@/lib/calendar-fetch'
import { ensureIcsToken } from '@/actions/calendar-sync'
import { feedInWindow } from '@/lib/calendar-window'
import { weekRollup } from '@/lib/calendar-week'
import { buildRunway } from '@/lib/calendar-cashflow'
import { todayYmd } from '@/lib/opportunity-detail'
import { CalendarLeftRail } from '@/components/admin/calendar/CalendarLeftRail'
import { RailSkeleton } from './calendar-skeleton'

/**
 * The cockpit shell (mirrors the Clients cockpit). The persistent LEFT RAIL lives
 * here so it survives day-nav and view-switches without a refetch — layouts don't
 * re-run on searchParam-only navigation. Its data is deliberately param-independent
 * (current-week KPIs + the runway horizon), so nothing here depends on `?view` /
 * `?week` / `?kinds` (which a server layout can't read anyway). The canvas page
 * reads those and fetches its own bounded window.
 *
 * NOTHING is awaited in the layout body. `loading.tsx` wraps a layout's CHILDREN,
 * never the layout itself, so the calendar's loading boundary could do nothing
 * about the rail's own reads: a cold entry to /calendar sat on the org lookup +
 * feed + events + ICS token before a single pixel of the cockpit painted, on a
 * `force-dynamic` route where those reads are never cached. Starting the work and
 * passing the promise down puts the whole shell — and `children`, which then hits
 * its own loading boundary — in the static shell, with only the rail suspended
 * behind <RailSkeleton/>.
 */
export default function CalendarLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  // Start the work; do NOT await it. Awaiting anything here (params included)
  // is what blocked the shell.
  const rail = loadRail(params)

  return (
    // main (org layout) is a stretched, scrollable box — h-full fills it; the rail
    // and the canvas/spine each scroll independently. The rail manages its own
    // responsive shape: an in-flow 280px column at md+, an off-canvas drawer below
    // (its mobile bar sits above the canvas), mirroring the Clients cockpit.
    <div className="flex h-full min-h-0 max-md:flex-col">
      <Suspense fallback={<RailSkeleton />}>
        <CalendarRail data={rail} />
      </Suspense>
      <div className="flex min-w-0 flex-1 overflow-hidden max-lg:flex-col">{children}</div>
    </div>
  )
}

interface RailData {
  orgSlug: string
  today: string
  rollup: ReturnType<typeof weekRollup>
  runway: ReturnType<typeof buildRunway>
  subscribeUrl: string
}

async function loadRail(params: Promise<{ orgSlug: string }>): Promise<RailData | null> {
  const { orgSlug } = await params
  const orgId = await orgIdBySlug(orgSlug)
  // No notFound() here on purpose. This is now inside a Suspense boundary, and a
  // 404 thrown mid-stream would paint the not-found UI into the RAIL SLOT rather
  // than replacing the page. Both calendar pages (and the org layout's
  // requireOrgMember before them) already 404 on the same condition, so the rail
  // just declines to render.
  if (!orgId) return null

  const today = todayYmd()
  // orgCalendarFeed / orgEvents are React.cache()'d, so the page (and the day
  // route) reuse this same fetch within the request instead of re-fanning out.
  const [feed, events, invoices, icsToken] = await Promise.all([
    orgCalendarFeed(orgId, orgSlug),
    orgEvents(orgId),
    orgInvoices(orgId),
    ensureIcsToken(orgId),
  ])
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? ''
  // ensureIcsToken deliberately stays member-scoped, not admin-scoped. The token is
  // the org's ONE shared feed secret and every member is a legitimate consumer of
  // it — subscribing their own phone is the whole feature — so gating it by role
  // would delete the feature for the crew without reducing exposure by one reader.
  // The real narrowing is per-user feed tokens (each revocable on its own), which
  // is its own increment; until then rotation (SubscribePanel → rotateIcsToken,
  // owner/admin only) is the containment story for a leaked link.
  const subscribeUrl = `${origin}/ics/${orgSlug}/${icsToken}`

  // KPI stack summarises THIS week. Uses the SPAN-AWARE window (not a start-date
  // bound) so a multi-day booking that started last week but spans into this one is
  // counted — matching what the WeekGrid renders. The runway scans the whole feed
  // forward to each upcoming booked job (receivables timing).
  return {
    orgSlug,
    today,
    rollup: weekRollup(feedInWindow(feed, 'week', today), today),
    // 4th arg: real invoice state, so a fully-collected job is not reported as
    // "never invoiced". Reads the same React.cache()'d sources — zero extra reads.
    runway: buildRunway(feed, events, new Date(), invoices),
    subscribeUrl,
  }
}

/** The only thing that suspends. Everything else is in the static shell. */
async function CalendarRail({ data }: { data: Promise<RailData | null> }) {
  const d = await data
  if (!d) return null
  return (
    <CalendarLeftRail
      orgSlug={d.orgSlug}
      today={d.today}
      rollup={d.rollup}
      runway={d.runway}
      subscribeUrl={d.subscribeUrl}
    />
  )
}
