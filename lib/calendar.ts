import type { ComplianceDoc, Drop, Event, Lead, NormalizedInvoice, Task } from '@/lib/types'
import { invoiceBalance } from '@/lib/invoices'
import { OPEN_STAGES, opportunityTitle } from '@/lib/leads'
import { addDays } from '@/lib/opportunity-detail'
import { DEFAULT_PREP_LEAD_DAYS } from '@/lib/pipeline-view'

export type CalendarKind = 'event' | 'lead' | 'task' | 'follow_up' | 'compliance' | 'invoice_due' | 'drop'

export interface CalendarItem {
  id: string
  title: string
  date: string          // ISO date (YYYY-MM-DD or full ISO)
  kind: CalendarKind
  href: string
  /** Present only on DERIVED signals (never on facts read from a document).
   *  Every derived signal must be able to explain itself and point at the field
   *  that produced it, so the operator can check it and fix it at the source. */
  derived?: {
    /** Stable machine id for the rule, e.g. 'capacity.over' | 'leadtime.past-book-by'. */
    rule: string
    /** The concrete values the rule fired on, for display: e.g. { needed: 2, available: 1 }. */
    inputs: Record<string, string | number | boolean>
    /** One human sentence naming the binding constraint. */
    reason: string
    /** Deep link to the record/setting that produced it, so a wrong verdict is fixable at source. */
    fixHref?: string
  }
  /** Second line under the title — who it's for, what it blocks. */
  detail?: string
  /** invoice_due only: the outstanding balance. */
  amount?: number
  /** timed items only ('HH:mm'): events with working hours, drop windows. Absent = all-day. */
  start?: string
  end?: string
  /** multi-day events only: the last ISO date (YYYY-MM-DD) the item spans; absent = single day. */
  endDate?: string
  /** Booked-$: the closed-won lead's estimated_value, on its event or its unconverted hold.
   *  NEVER Event.payment_amount (a registration fee) or Event.booth_fee (an expense). */
  bookedValue?: number
  /** The opportunity this item belongs to — lets the runway anchor receivables to an Event. */
  leadId?: string
  /** compliance only: an upcoming booked event depends on this document. */
  blocker?: boolean
  /** lead dates are holds, not bookings. */
  tentative?: boolean
  /** event only: expected guests, for the header count. */
  headcount?: number
}

/** A fact is anything the feed read from a document; a derived item explains itself. */
export function isDerived(item: CalendarItem): boolean {
  return item.derived != null
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

  // A closed_won lead's booked value must be counted ONCE even when it owns
  // several events. Attribute it to the lead's earliest live event only (a
  // deterministic anchor; tie-break by id). We use earliest rather than the
  // runway's nearest-future anchor because this pure builder has no `today`.
  const wonAnchorEventId = new Map<string, string>()
  for (const e of liveEvents) {
    if (!e.lead_id || leadById.get(e.lead_id)?.stage !== 'closed_won') continue
    const curId = wonAnchorEventId.get(e.lead_id)
    if (!curId) { wonAnchorEventId.set(e.lead_id, e.id); continue }
    const cur = liveEvents.find((x) => x.id === curId)!
    const better = e.event_start < cur.event_start || (e.event_start === cur.event_start && e.id < cur.id)
    if (better) wonAnchorEventId.set(e.lead_id, e.id)
  }

  for (const e of liveEvents) {
    const startYmd = e.event_start.slice(0, 10)
    const endYmd = e.event_end?.slice(0, 10)
    // Booked-$ comes from the source lead's estimated_value, never the event's
    // payment_amount (registration fee) or booth_fee (an expense). Counted only
    // on the lead's single anchor event so multi-event bookings never double-count.
    const wonLead = e.lead_id ? leadById.get(e.lead_id) : undefined
    const bookedValue =
      wonLead?.stage === 'closed_won' && wonAnchorEventId.get(e.lead_id!) === e.id
        ? wonLead.estimated_value
        : undefined
    items.push({
      id: e.id, title: e.name, date: startYmd, kind: 'event',
      href: `/${orgSlug}/${e.slug}/dashboard`,
      detail: e.headcount
        ? `${e.headcount} guests`
        // inline kindOf: lib/calendar stays dependency-light
        : (e.kind ?? 'client_job') === 'market_day' && e.location
          ? e.location.name
          : undefined,
      headcount: e.headcount,
      // timed placement on the grid; absent hours ⇒ all-day "time TBD"
      ...(e.hours ? { start: e.hours.start, end: e.hours.end } : {}),
      // multi-day span: carry the end date so feedForDay can include interior days
      ...(endYmd && endYmd > startYmd ? { endDate: endYmd } : {}),
      ...(bookedValue != null ? { bookedValue } : {}),
    })
  }

  // Tentative holds: dated opportunities that are not lost and not yet converted.
  for (const l of s.leads) {
    if (!l.event_date || l.stage === 'closed_lost' || scheduledLeadIds.has(l.id)) continue
    items.push({
      id: l.id, title: opportunityTitle(l), date: l.event_date.slice(0, 10), kind: 'lead',
      href: `/${orgSlug}/leads/${l.id}`, tentative: true,
      detail: l.stage === 'closed_won' ? 'won · not scheduled' : 'not booked',
      // an unconverted won lead still carries its booked value, bucketed by event_date
      ...(l.stage === 'closed_won' && l.estimated_value != null ? { bookedValue: l.estimated_value } : {}),
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
      amount: balance, detail: lead ? opportunityTitle(lead) : undefined, leadId: inv.lead_id,
    })
  }

  // drop — one entry per pickup WINDOW of live (scheduled/closed) drops, each
  // carrying its own start/end so the time-grid can place it.
  for (const d of s.drops) {
    if (d.status !== 'scheduled' && d.status !== 'closed') continue
    for (const w of d.pickup.windows) {
      items.push({
        id: `${d.id}:${w.id}`,
        title: `Drop pickup: ${d.title}`,
        date: w.day.slice(0, 10),
        kind: 'drop',
        href: `/${orgSlug}/drop-orders/${d.id}`,
        detail: d.pickup.location_name,
        start: w.start,
        end: w.end,
      })
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date))
}

/** The two kinds of work that can exist without a date. */
export type UnscheduledKind = Extract<CalendarKind, 'event' | 'lead'>

/**
 * A piece of work with no date on it — the rows buildCalendarFeed drops.
 * No `date` field, deliberately: that absence IS the item.
 */
export interface UnscheduledItem {
  id: string
  title: string
  kind: UnscheduledKind
  href: string
  /** Second line under the title — why it is in this list. */
  detail?: string
  /** Ranking input, and the ONLY money here: the opportunity's estimated_value
   *  (for an event, its source lead's). NEVER Event.payment_amount (a
   *  registration fee) or Event.booth_fee (an expense) — see bookedValue. */
  value?: number
  /** Ranking input: the day this must be booked BY (promised event_date −
   *  prep lead days). Only an undated event can carry one — its opportunity
   *  still holds the promised date the job itself lost. */
  bookByDate?: string
  /** Ranking input: how long this has sat without a date. */
  createdAt: string
  /** The opportunity behind the row — where a drag-to-schedule writes the date. */
  leadId?: string
}

/** Sorts after every real ISO date, so "no deadline" lands at the tail. */
const NO_BOOK_BY = '9999-12-31'

// Deadline, then money, then age, then id. Every key is a total order and they
// are applied lexicographically, so the comparator is transitive — an
// intransitive one corrupts Array.sort() silently (see PR #114).
function compareUnscheduled(a: UnscheduledItem, b: UnscheduledItem): number {
  const aBy = a.bookByDate ?? NO_BOOK_BY
  const bBy = b.bookByDate ?? NO_BOOK_BY
  if (aBy !== bBy) return aBy < bBy ? -1 : 1
  const av = a.value ?? 0
  const bv = b.value ?? 0
  if (av !== bv) return bv - av
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Dated work is on the calendar; this is the work that is NOT, ranked by what
 *  should get a date first. Same sources as buildCalendarFeed, opposite filter.
 *
 *  buildCalendarFeed guards both its event loop (on event_start) and its lead
 *  loop (on event_date), so undated work vanishes from every calendar surface —
 *  and "the ones I haven't scheduled yet" is the list a scheduler needs most.
 *  A separate function, not a widened feed: the ICS route and the cockpit both
 *  depend on the feed carrying only dated items. */
export function buildUnscheduled(orgSlug: string, s: CalendarFeedSources): UnscheduledItem[] {
  const isOpen = (l: Lead) => (OPEN_STAGES as Lead['stage'][]).includes(l.stage)
  const leadById = new Map(s.leads.map((l) => [l.id, l]))
  const liveEvents = s.events.filter((e) => e.status !== 'archived')
  // A lead that owns a live event is represented BY that event — dated (so it
  // is scheduled, and out of this list) or undated (so the event row below
  // already carries it). Archived events don't count: archiving the job leaves
  // the opportunity unscheduled again.
  const leadsWithLiveEvent = new Set(liveEvents.map((e) => e.lead_id).filter((id): id is string => !!id))
  const items: UnscheduledItem[] = []

  // Booked work that has no day. Rare — conversion demands a date — but legacy
  // and imported events arrive without one, and such a job is invisible on
  // every calendar surface while still being owed to a customer.
  for (const e of liveEvents) {
    if (e.event_start) continue
    const lead = e.lead_id ? leadById.get(e.lead_id) : undefined
    items.push({
      id: e.id, title: e.name, kind: 'event',
      href: `/${orgSlug}/${e.slug}/dashboard`,
      detail: 'booked · no date set',
      createdAt: e.created_at,
      ...(lead?.estimated_value != null ? { value: lead.estimated_value } : {}),
      // the pipeline's book-by deadline, reused: event_date − prep lead days
      ...(lead?.event_date ? { bookByDate: addDays(lead.event_date.slice(0, 10), -DEFAULT_PREP_LEAD_DAYS) } : {}),
      ...(e.lead_id ? { leadId: e.lead_id } : {}),
    })
  }

  // Open opportunities nobody has put a day against — the drag source for a
  // later increment's Unscheduled drawer. Lost and closed deals are not work.
  for (const l of s.leads) {
    if (l.event_date || !isOpen(l) || leadsWithLiveEvent.has(l.id)) continue
    items.push({
      id: l.id, title: opportunityTitle(l), kind: 'lead',
      href: `/${orgSlug}/leads/${l.id}`,
      detail: 'no date set',
      createdAt: l.created_at,
      leadId: l.id,
      ...(l.estimated_value != null ? { value: l.estimated_value } : {}),
    })
  }

  return items.sort(compareUnscheduled)
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

/** Every item landing on `ymd` (date part only). Multi-day events (those with an
 *  `endDate`) are included on every interior day they span, not just their start. */
export function feedForDay(items: CalendarItem[], ymd: string): CalendarItem[] {
  const day = ymd.slice(0, 10)
  return items.filter((i) => {
    const from = i.date.slice(0, 10)
    const to = (i.endDate ?? i.date).slice(0, 10)
    return day >= from && day <= to
  })
}
