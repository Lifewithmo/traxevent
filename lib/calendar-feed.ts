import { loadCalendarSources, type CalendarSourceWindow } from '@/lib/calendar-fetch'
import { buildCalendarFeed, type CalendarItem } from '@/lib/calendar'

/**
 * Fetch every source and assemble all seven calendar kinds. No auth — callers guard.
 *
 * The fan-out lives in `loadCalendarSources` (lib/calendar-fetch.ts) and is
 * memoised per request, so a route that renders the feed AND the day spine pays
 * for the source reads once rather than twice.
 *
 * `window` bounds the date-bearing collections at the QUERY (see the loader for
 * which are boundable and which come back whole, and why). Omit it — as the ICS
 * export and the cockpit layout do — to assemble the full calendar.
 */
export async function assembleCalendarFeed(
  orgId: string,
  orgSlug: string,
  window: CalendarSourceWindow = null
): Promise<CalendarItem[]> {
  const sources = await loadCalendarSources(orgId, window?.from ?? null, window?.to ?? null)
  return buildCalendarFeed(orgSlug, sources)
}
