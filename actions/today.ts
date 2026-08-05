'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listLeads } from '@/actions/leads'
import { listTasks } from '@/actions/tasks'
import { OPEN_STAGES } from '@/lib/leads'
import { todayYmd } from '@/lib/opportunity-detail'
import { buildToday, type TodayData } from '@/lib/today'
import type { LeadStage, Task } from '@/lib/types'

export async function getTodayData(orgId: string): Promise<TodayData> {
  await assertOrgMember(orgId)
  const leads = await listLeads(orgId)
  const openLeads = leads.filter((l) => (OPEN_STAGES as LeadStage[]).includes(l.stage))
  const taskLists = await Promise.all(openLeads.map((l) => listTasks(orgId, l.id)))
  const tasksByLeadId: Record<string, Task[]> = {}
  openLeads.forEach((l, i) => { tasksByLeadId[l.id] = taskLists[i] })
  return buildToday({ leads, tasksByLeadId, today: todayYmd() })
}
