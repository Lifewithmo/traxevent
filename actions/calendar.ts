'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listCamps } from '@/actions/camps'
import { listLeads } from '@/actions/leads'
import { buildCalendar, type CalendarItem } from '@/lib/calendar'

export async function getOrgCalendar(orgId: string, orgSlug: string): Promise<CalendarItem[]> {
  await assertOrgMember(orgId)
  const [camps, leads] = await Promise.all([listCamps(orgId), listLeads(orgId)])
  return buildCalendar(orgSlug, camps, leads)
}
