'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listEvents } from '@/actions/events'
import { listLeads } from '@/actions/leads'
import { listEventsCore } from '@/lib/events'
import { listLeadsCore } from '@/lib/crm/leads'
import { listTasksCore } from '@/lib/crm/tasks'
import { assembleCalendarFeed } from '@/lib/calendar-feed'
import { OPEN_STAGES } from '@/lib/leads'
import { buildCalendar, calendarRangeItems, type CalendarItem } from '@/lib/calendar'
import type { Lead, Task } from '@/lib/types'

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
