import type { ComplianceDoc, Drop, Event, Lead, NormalizedInvoice, Task } from '@/lib/types'
import { invoiceBalance } from '@/lib/invoices'
import { OPEN_STAGES, opportunityTitle } from '@/lib/leads'
import { addDays } from '@/lib/opportunity-detail'

export type CalendarKind = 'event' | 'lead' | 'task' | 'follow_up' | 'compliance' | 'invoice_due' | 'drop'

export interface CalendarItem {
  id: string
  title: string
  date: string          // ISO date (YYYY-MM-DD or full ISO)
  kind: CalendarKind
  href: string
  /** Second line under the title — who it's for, what it blocks. */
  detail?: string
  /** invoice_due only: the outstanding balance. */
  amount?: number
  /** compliance only: an upcoming booked event depends on this document. */
  blocker?: boolean
  /** lead dates are holds, not bookings. */
  tentative?: boolean
  /** event only: expected guests, for the header count. */
  headcount?: number
}

export const CALENDAR_KIND_LABELS: Record<CalendarKind, string> = {
  event: 'Booked event',
  lead: 'Opportunity date',
  task: 'Task',
  follow_up: 'Follow-up',
  compliance: 'Compliance',
  invoice_due: 'Invoice due',
  drop: 'Drop pickup',
}

export const CALENDAR_KINDS = Object.keys(CALENDAR_KIND_LABELS) as CalendarKind[]

/** The three kinds that are pipeline work — what the Pipeline calendar shows. */
export const PIPELINE_KINDS: CalendarKind[] = ['lead', 'task', 'follow_up']

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

/** Everything on the calendar in [fromYmd, toYmd]: booked events, tentative
 *  (unconverted) opportunity dates, and open dated tasks. Range compares the
 *  ISO date part, inclusive. */
export function calendarRangeItems(
  orgSlug: string,
  events: Event[],
  leads: Lead[],
  leadTasks: Array<{ lead: Lead; tasks: Task[] }>,
  fromYmd: string,
  toYmd: string
): CalendarItem[] {
  const inRange = (date: string) => {
    const d = date.slice(0, 10)
    return d >= fromYmd && d <= toYmd
  }
  const items = buildCalendar(orgSlug, events, leads).filter((i) => inRange(i.date))
  for (const { lead, tasks } of leadTasks) {
    for (const t of tasks) {
      if (t.done || !t.due_date || !inRange(t.due_date)) continue
      items.push({ id: t.id, title: t.title, date: t.due_date, kind: 'task', href: `/${orgSlug}/leads/${lead.id}` })
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date))
}

/** Monday-start week containing `ymd`: [monday, sunday]. */
export function weekRange(ymd: string): { from: string; to: string } {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`)
  const dow = d.getUTCDay() // 0 Sun … 6 Sat
  const monday = addDays(ymd.slice(0, 10), dow === 0 ? -6 : 1 - dow)
  return { from: monday, to: addDays(monday, 6) }
}

export function weekDays(from: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(from, i))
}

export interface CalendarFeedSources {
  events: Event[]
  leads: Lead[]
  tasksByLeadId: Record<string, Task[]>
  complianceDocs: ComplianceDoc[]
  invoices: NormalizedInvoice[]
  drops: Drop[]
}

/**
 * Everything the org calendar (and the ICS feed) knows about, all six kinds.
 * The top band of the week view is time (event, lead); the OWED band is the
 * rest. buildCalendar()'s converted-lead rule carries over: a converted
 * opportunity shows as its event only.
 */
export function buildCalendarFeed(orgSlug: string, s: CalendarFeedSources): CalendarItem[] {
  const items: CalendarItem[] = []
  const isOpen = (l: Lead) => (OPEN_STAGES as Lead['stage'][]).includes(l.stage)
  const leadById = new Map(s.leads.map((l) => [l.id, l]))
  const scheduledLeadIds = new Set(s.events.map((e) => e.lead_id).filter((id): id is string => !!id))
  const liveEvents = s.events.filter((e) => e.status !== 'archived' && e.event_start)

  for (const e of liveEvents) {
    items.push({
      id: e.id, title: e.name, date: e.event_start.slice(0, 10), kind: 'event',
      href: `/${orgSlug}/${e.slug}/dashboard`,
      detail: e.headcount
        ? `${e.headcount} guests`
        // inline kindOf: lib/calendar stays dependency-light
        : (e.kind ?? 'client_job') === 'market_day' && e.location
          ? e.location.name
          : undefined,
      headcount: e.headcount,
    })
  }

  // Tentative holds: dated opportunities that are not lost and not yet converted.
  for (const l of s.leads) {
    if (!l.event_date || l.stage === 'closed_lost' || scheduledLeadIds.has(l.id)) continue
    items.push({
      id: l.id, title: opportunityTitle(l), date: l.event_date.slice(0, 10), kind: 'lead',
      href: `/${orgSlug}/leads/${l.id}`, tentative: true,
      detail: l.stage === 'closed_won' ? 'won · not scheduled' : 'not booked',
    })
  }

  for (const [leadId, tasks] of Object.entries(s.tasksByLeadId)) {
    const lead = leadById.get(leadId)
    if (!lead || !isOpen(lead)) continue
    for (const t of tasks) {
      if (t.done || !t.due_date) continue
      items.push({
        id: t.id, title: t.title, date: t.due_date, kind: 'task',
        href: `/${orgSlug}/leads/${leadId}`, detail: opportunityTitle(lead),
      })
    }
  }

  for (const l of s.leads) {
    if (!isOpen(l) || !l.waiting?.follow_up_date) continue
    items.push({
      id: l.id, title: `Follow up: ${opportunityTitle(l)}`, date: l.waiting.follow_up_date, kind: 'follow_up',
      href: `/${orgSlug}/leads/${l.id}`, detail: `waiting on ${l.waiting.reason}`,
    })
  }

  // A lapsed document blocks the next booked event after its expiry.
  for (const doc of s.complianceDocs) {
    if (!doc.expires_on) continue
    const blocked = liveEvents
      .filter((e) => e.event_start.slice(0, 10) >= doc.expires_on!)
      .sort((a, b) => a.event_start.localeCompare(b.event_start))[0]
    items.push({
      id: doc.id, title: `${doc.name} expires`, date: doc.expires_on, kind: 'compliance',
      href: `/${orgSlug}/compliance`, blocker: !!blocked,
      detail: blocked ? `blocks ${blocked.name}` : undefined,
    })
  }

  for (const inv of s.invoices) {
    if (inv.lifecycle !== 'sent' || !inv.due_date) continue
    const balance = invoiceBalance(inv)
    if (balance <= 0) continue
    const lead = leadById.get(inv.lead_id)
    items.push({
      id: inv.id, title: inv.title?.trim() || `Invoice ${inv.number ?? ''}`.trim(), date: inv.due_date,
      kind: 'invoice_due', href: `/${orgSlug}/leads/${inv.lead_id}`,
      amount: balance, detail: lead ? opportunityTitle(lead) : undefined,
    })
  }

  // drop — one entry per distinct pickup day of live (scheduled/closed) drops
  for (const d of s.drops) {
    if (d.status !== 'scheduled' && d.status !== 'closed') continue
    const days = [...new Set(d.pickup.windows.map((w) => w.day))]
    for (const day of days) {
      items.push({
        id: `${d.id}:${day}`,
        title: `Drop pickup: ${d.title}`,
        date: day,
        kind: 'drop',
        href: `/${orgSlug}/drop-orders/${d.id}`,
        detail: d.pickup.location_name,
      })
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date))
}

export function filterFeed(items: CalendarItem[], kinds: CalendarKind[]): CalendarItem[] {
  const keep = new Set(kinds)
  return items.filter((i) => keep.has(i.kind))
}

export function feedInRange(items: CalendarItem[], fromYmd: string, toYmd: string): CalendarItem[] {
  return items.filter((i) => {
    const d = i.date.slice(0, 10)
    return d >= fromYmd && d <= toYmd
  })
}
