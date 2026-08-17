'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listEvents } from '@/actions/events'
import { listLeads } from '@/actions/leads'
import { listAllProposals } from '@/actions/proposals'
import { listEventsCore } from '@/lib/events'
import { listLeadsCore } from '@/lib/crm/leads'
import { listTasksCore } from '@/lib/crm/tasks'
import { listAllInvoicesCore } from '@/lib/crm/invoices'
import { listComplianceDocsCore } from '@/lib/ops/compliance'
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
  const [events, leads] = await Promise.all([listEventsCore(orgId), listLeadsCore(orgId)])
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
  /** per day-event: its opportunity + that opportunity's proposals and invoices. */
  related: Record<string, DayEventDetail>
}

/**
 * Day-join fetcher for the `/calendar/[ymd]` spine. Bulk-fetches the org's
 * events/leads/invoices/proposals (fan-out, mirroring lib/calendar-feed.ts),
 * then joins each day event to its opportunity's proposals + invoices in memory.
 * Receivables/proposals attach by the event's own `lead_id` (the spine shows a
 * given event's linked records); runway timing lives in lib/calendar-cashflow.ts.
 */
export async function getDayDetail(orgId: string, orgSlug: string, ymd: string): Promise<DayDetail> {
  await assertOrgMember(orgId)
  const day = ymd.slice(0, 10)

  const [events, leads, invoices, proposals, complianceDocs] = await Promise.all([
    listEventsCore(orgId),
    listLeadsCore(orgId),
    listAllInvoicesCore(orgId),
    listAllProposals(orgId),
    listComplianceDocsCore(orgId),
  ])

  // Open-lead tasks feed the prep/blocker derivation (same shape as the org feed).
  const openLeads = leads.filter((l) => (OPEN_STAGES as Lead['stage'][]).includes(l.stage))
  const taskLists = await Promise.all(openLeads.map((l) => listTasksCore(orgId, l.id)))
  const tasksByLeadId: Record<string, Task[]> = {}
  openLeads.forEach((l, i) => { tasksByLeadId[l.id] = taskLists[i] })

  const dayItems = feedForDay(
    buildCalendarFeed(orgSlug, { events, leads, tasksByLeadId, complianceDocs, invoices, drops: [] }),
    day
  )
  const tasks = dayItems.filter((i) => i.kind === 'task' || i.kind === 'follow_up')
  const blockers = dayItems.filter((i) => i.kind === 'compliance')

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

  return { ymd: day, events: dayEvents, tasks, blockers, related }
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
