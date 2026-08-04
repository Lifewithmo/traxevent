import type { Event, Lead } from '@/lib/types'

export interface CalendarItem {
  id: string
  title: string
  date: string          // ISO date (YYYY-MM-DD or full ISO)
  kind: 'event' | 'lead'
  href: string
}

// Merge camps (by camp_start) and leads (by event_date) into one date-sorted agenda.
// Items without a date are omitted. `orgSlug` builds the links.
export function buildCalendar(orgSlug: string, camps: Event[], leads: Lead[]): CalendarItem[] {
  const items: CalendarItem[] = []
  for (const c of camps) {
    if (c.camp_start) {
      items.push({ id: c.id, title: c.name, date: c.camp_start, kind: 'event', href: `/${orgSlug}/${c.slug}/dashboard` })
    }
  }
  for (const l of leads) {
    if (l.event_date) {
      items.push({ id: l.id, title: l.name, date: l.event_date, kind: 'lead', href: `/${orgSlug}/leads/${l.id}` })
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date))
}
