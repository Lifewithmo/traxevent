import { kindOf } from '@/lib/occasions/kind'
import type { Event, EventKind } from '@/lib/types'

export interface SidebarEventRow {
  id: string
  name: string
  slug: string
  label: string      // 'Today' when the event starts today, else 'Aug 20'
  isToday: boolean
  kind: EventKind
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// 'YYYY-MM-DD' -> 'Aug 20'. String math only — no Date, so no timezone drift.
function shortDate(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split('-')
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`
}

/**
 * The sidebar's Events list: today's events first, then the soonest upcoming,
 * capped at `limit`. Always the same shape regardless of how many are today —
 * an event starting today is just a row whose label reads 'Today'.
 * `now` is an ISO date string (YYYY-MM-DD) so callers control the clock.
 */
export function selectUpcomingEvents(events: Event[], now: string, limit = 5): SidebarEventRow[] {
  const today = now.slice(0, 10)
  return events
    .filter((e) => e.status !== 'archived')
    .filter((e) => typeof e.event_start === 'string' && e.event_start.slice(0, 10) >= today)
    .sort((a, b) => a.event_start.localeCompare(b.event_start))
    .slice(0, limit)
    .map((e) => {
      const start = e.event_start.slice(0, 10)
      const isToday = start === today
      return { id: e.id, name: e.name, slug: e.slug, label: isToday ? 'Today' : shortDate(start), isToday, kind: kindOf(e) }
    })
}
