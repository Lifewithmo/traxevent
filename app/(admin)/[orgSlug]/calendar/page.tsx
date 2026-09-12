export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { orgBookabilityCtx, orgCalendarFeed, orgIdBySlug } from '@/lib/calendar-fetch'
import { filterFeed, PIPELINE_KINDS } from '@/lib/calendar'
import { feedInWindow, normalizeView } from '@/lib/calendar-window'
import { todayYmd, normalizeYmd } from '@/lib/opportunity-detail'
import { CalendarCanvas } from '@/components/admin/calendar/CalendarCanvas'
import { BookabilityProvider } from '@/components/admin/calendar/bookability-context'

/**
 * The canvas page: reads `?view` / `?week` / `?kinds` (only pages can), then hands
 * the canvas the span-aware window for the shown view (feedInWindow) to RENDER, and
 * the unwindowed `?kinds`-scoped feed for ⌘K to SEARCH. The DB read itself is still
 * org-wide — it is shared with the layout via the React.cache()'d orgCalendarFeed,
 * and query-level bounding is a tracked fast-follow (see lib/calendar-fetch.ts) —
 * so the search index costs no extra read; it is the array this page already built
 * the window out of. Defaults to today's Week view; no day is selected here, so the
 * spine lives on the `/calendar/[ymd]` route.
 */
export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ week?: string; view?: string; kinds?: string }>
}) {
  const [{ orgSlug }, sp] = await Promise.all([params, searchParams])
  const orgId = await orgIdBySlug(orgSlug)
  if (!orgId) notFound()

  const today = todayYmd()
  const view = normalizeView(sp.view)
  // `?week` is untrusted and was NOT normalised the way `view` is: a garbage
  // value reached date construction and threw RangeError, killing the cockpit.
  // A bad query param falls back to the current week — it must not 404 or 500
  // an otherwise-valid page.
  const anchor = normalizeYmd(sp.week, today)
  const kinds = sp.kinds === 'pipeline' ? 'pipeline' : undefined

  // Both are React.cache()'d and share the layout's fan-out; the bookability ctx
  // adds at most the one business-tier capacity_units query.
  const [feed, bookability] = await Promise.all([
    orgCalendarFeed(orgId, orgSlug),
    orgBookabilityCtx(orgId, orgSlug, today),
  ])
  const scoped = kinds === 'pipeline' ? filterFeed(feed, PIPELINE_KINDS) : feed
  // The grid renders the shown view's span-aware window (in-memory bound); ⌘K
  // searches `scoped` — the same items, unwindowed — so "no matches" is a fact
  // about the calendar and not about the seven days on screen.
  const items = feedInWindow(scoped, view, anchor)

  return (
    // The verdict reaches MonthGrid/WeekGrid through context rather than a prop:
    // CalendarCanvas sits between them and is off-limits on this branch. See
    // components/admin/calendar/bookability-context.tsx.
    <BookabilityProvider ctx={bookability}>
      <CalendarCanvas
        orgSlug={orgSlug}
        items={items}
        feed={scoped}
        today={today}
        view={view}
        anchor={anchor}
        kinds={kinds}
      />
    </BookabilityProvider>
  )
}
