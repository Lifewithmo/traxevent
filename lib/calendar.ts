import type { Event, Lead } from '@/lib/types'
import { opportunityTitle } from '@/lib/leads'

export interface CalendarItem {
  id: string
  title: string
  date: string          // ISO date (YYYY-MM-DD or full ISO)
  kind: 'event' | 'lead'
  href: string
}

// Merge events (by event_start) and leads (by event_date) into one date-sorted agenda.
// Items without a date are omitted. `orgSlug` builds the links.
//
// A converted opportunity has both an event (event_start) and a lead
// (event_date), usually on the same date with the same title. The event row
// is kept — that is where the ops plan lives — and the lead row is skipped,
// matching the scheduled-lead derivation in actions/today.ts.
export function buildCalendar(orgSlug: string, events: Event[], leads: Lead[]): CalendarItem[] {
  const scheduledLeadIds = new Set(events.map((e) => e.lead_id).filter((id): id is string => !!id))
  const items: CalendarItem[] = []
  for (const c of events) {
    if (c.event_start) {
      items.push({ id: c.id, title: c.name, date: c.event_start, kind: 'event', href: `/${orgSlug}/${c.slug}/dashboard` })
    }
  }
  for (const l of leads) {
    if (l.event_date && !scheduledLeadIds.has(l.id)) {
      items.push({ id: l.id, title: opportunityTitle(l), date: l.event_date, kind: 'lead', href: `/${orgSlug}/leads/${l.id}` })
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date))
}
