'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listEvents } from '@/actions/events'
import { listLeads } from '@/actions/leads'
import { buildCalendar, type CalendarItem } from '@/lib/calendar'

export async function getOrgCalendar(orgId: string, orgSlug: string): Promise<CalendarItem[]> {
  await assertOrgMember(orgId)
  const [events, leads] = await Promise.all([listEvents(orgId), listLeads(orgId)])
  return buildCalendar(orgSlug, events, leads)
}
