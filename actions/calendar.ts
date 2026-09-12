'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listEvents } from '@/actions/events'
import { listLeads } from '@/actions/leads'
import { listAllProposals } from '@/actions/proposals'
import { listEventsCore } from '@/lib/events'
import { listLeadsCore } from '@/lib/crm/leads'
import { listTasksCore } from '@/lib/crm/tasks'
import { loadCalendarSources } from '@/lib/calendar-fetch'
import { assembleCalendarFeed } from '@/lib/calendar-feed'
import { OPEN_STAGES } from '@/lib/leads'
import { buildCalendar, buildCalendarFeed, calendarRangeItems, feedForDay, type CalendarItem } from '@/lib/calendar'
import type { Event, Lead, NormalizedInvoice, Proposal, Task } from '@/lib/types'

export async function getCalendarFeed(orgId: string, orgSlug: string): Promise<CalendarItem[]> {
  await assertOrgMember(orgId)
  return assembleCalendarFeed(orgId, orgSlug)
}

export async function getOrgCalendar(orgId: string, orgSlug: string): Promise<CalendarItem[]> {
  await assertOrgMember(orgId)
  const [events, leads] = await Promise.all([listEvents(orgId), listLeads(orgId)])
  return buildCalendar(orgSlug, events, leads)
}

export async function listCalendarRange(
  orgId: string,
  orgSlug: string,
  fromYmd: string,
  toYmd: string
): Promise<CalendarItem[]> {
  await assertOrgMember(orgId)
  // DELIBERATELY UNBOUNDED, both collections — this looked like the easiest
  // bounding win (a ten-day strip re-fetched on every nav) and is not one:
  //
  //  • events — calendarRangeItems → buildCalendar derives `scheduledLeadIds`
  //    from the events array it is HANDED, and suppresses the tentative "hold"
  //    row of any lead that has one. Bound the read to the window and a lead
  //    whose job is booked OUTSIDE it stops looking converted, so the strip
  //    grows a phantom hold on the lead's `event_date` — exactly the field that
  //    goes stale after a reschedule. Losing reads is not worth inventing rows,
  //    and buildCalendar lives in lib/calendar.ts, which this change may not
  //    touch to pass the suppression set in separately.
  //  • leads — an in-range TASK can belong to a lead dated outside the range
  //    (see the loader's note in lib/calendar-fetch.ts).
  //
  // calendarRangeItems re-filters both in memory, as it always has.
  const [events, leads] = await Promise.all([
    listEventsCore(orgId),
    listLeadsCore(orgId),
  ])
  const openLeads = leads.filter((l) => (OPEN_STAGES as Lead['stage'][]).includes(l.stage))
  const leadTasks: Array<{ lead: Lead; tasks: Task[] }> = await Promise.all(
    openLeads.map(async (lead) => ({ lead, tasks: await listTasksCore(orgId, lead.id) }))
  )
  return calendarRangeItems(orgSlug, events, leads, leadTasks, fromYmd, toYmd)
}

/** One day event's linked records, resolved through its opportunity. */
export interface DayEventDetail {
  job: Lead | null
  proposals: Proposal[]
  invoices: NormalizedInvoice[]
}

/** Everything the day-detail spine renders for a single day. */
export interface DayDetail {
  ymd: string
  /** live events landing on the day (multi-day events span into their interior days). */
  events: Event[]
  /** prep work due that day — open-lead tasks and follow-ups. */
  tasks: CalendarItem[]
  /** compliance expiries landing that day (blockers fold into the spine, no separate rail). */
  blockers: CalendarItem[]
  /** drop-pickup windows landing that day (one item per window). */
  drops: CalendarItem[]
  /**
   * invoices FALLING DUE that day, with their outstanding balance on `amount`.
   *
   * These are the same `invoice_due` items the week/month cell renders as an
   * amber money chip. The spine used to filter them out, so a day carrying a
   * $4,200 balance and no booked event read "Nothing scheduled" while the very
   * same day's grid cell showed the money — two surfaces built from one feed
   * disagreeing. Distinct from `related[eventId].invoices`, which is every
   * invoice linked to a day event regardless of when it is due.
   */
  invoicesDue: CalendarItem[]
  /** per day-event: its opportunity + that opportunity's proposals and invoices. */
  related: Record<string, DayEventDetail>
}

/**
 * Day-join fetcher for the `/calendar/[ymd]` spine. Reads the request's SHARED
 * calendar sources (lib/calendar-fetch.ts) rather than re-fanning out, then
 * joins each day event to its opportunity's proposals + invoices in memory.
 * Receivables/proposals attach by the event's own `lead_id` (the spine shows a
 * given event's linked records); runway timing lives in lib/calendar-cashflow.ts.
 */
export async function getDayDetail(orgId: string, orgSlug: string, ymd: string): Promise<DayDetail> {
  await assertOrgMember(orgId)
  const day = ymd.slice(0, 10)

  // Unbounded on purpose, twice over. (1) This route's layout renders the whole
  // feed in the same request, so the shared load is already unbounded — asking
  // for a narrower window here would MISS that cache entry and fork a second
  // fan-out rather than save reads. (2) `related` shows every invoice linked to
  // a day event whatever its due date, which a due-date-bounded read cannot
  // answer. The day filtering happens in memory, below.
  const [sources, proposals] = await Promise.all([
    loadCalendarSources(orgId, null, null),
    // listAllProposals re-asserts membership (intentional redundant read — there is
    // no listAllProposalsCore, and adding one is not worth it for a single caller).
    listAllProposals(orgId),
  ])
  const { events, leads, invoices } = sources

  const dayItems = feedForDay(buildCalendarFeed(orgSlug, sources), day)
  const tasks = dayItems.filter((i) => i.kind === 'task' || i.kind === 'follow_up')
  const blockers = dayItems.filter((i) => i.kind === 'compliance')
  const dayDrops = dayItems.filter((i) => i.kind === 'drop')
  const invoicesDue = dayItems.filter((i) => i.kind === 'invoice_due')

  const dayEvents = events.filter(
    (e) =>
      e.status !== 'archived' && e.event_start &&
      e.event_start.slice(0, 10) <= day &&
      (e.event_end?.slice(0, 10) ?? e.event_start.slice(0, 10)) >= day
  )

  const leadById = new Map(leads.map((l) => [l.id, l]))
  const invoicesByLead = groupByLead(invoices)
  const proposalsByLead = groupByLead(proposals)

  const related: Record<string, DayEventDetail> = {}
  for (const e of dayEvents) {
    related[e.id] = {
      job: e.lead_id ? leadById.get(e.lead_id) ?? null : null,
      proposals: e.lead_id ? proposalsByLead.get(e.lead_id) ?? [] : [],
      invoices: e.lead_id ? invoicesByLead.get(e.lead_id) ?? [] : [],
    }
  }

  return { ymd: day, events: dayEvents, tasks, blockers, drops: dayDrops, invoicesDue, related }
}

function groupByLead<T extends { lead_id: string }>(rows: T[]): Map<string, T[]> {
  const byLead = new Map<string, T[]>()
  for (const row of rows) {
    const list = byLead.get(row.lead_id)
    if (list) list.push(row)
    else byLead.set(row.lead_id, [row])
  }
  return byLead
}
