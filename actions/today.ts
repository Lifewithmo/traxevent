'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listLeadsCore } from '@/lib/crm/leads'
import { listTasksCore } from '@/lib/crm/tasks'
import { listEventsCore } from '@/lib/events'
import { OPEN_STAGES } from '@/lib/leads'
import { todayYmd } from '@/lib/opportunity-detail'
import { buildToday, type TodayData } from '@/lib/today'
import type { LeadStage, Task } from '@/lib/types'

// NOTE: this is a 'use server' module — every export must be an async function.
// TodayData (a type) is therefore NOT re-exported here; import it from
// '@/lib/today' directly. Re-exporting it broke `next build` (RSC compiler).

export async function getTodayData(orgId: string): Promise<TodayData> {
  await assertOrgMember(orgId)
  const [leads, events] = await Promise.all([listLeadsCore(orgId), listEventsCore(orgId)])
  const scheduledLeadIds = events.map((e) => e.lead_id).filter((id): id is string => !!id)
  const openLeads = leads.filter((l) => (OPEN_STAGES as LeadStage[]).includes(l.stage))
  const taskLists = await Promise.all(openLeads.map((l) => listTasksCore(orgId, l.id)))
  const tasksByLeadId: Record<string, Task[]> = {}
  openLeads.forEach((l, i) => { tasksByLeadId[l.id] = taskLists[i] })
  return buildToday({ leads, tasksByLeadId, today: todayYmd(), scheduledLeadIds })
}
