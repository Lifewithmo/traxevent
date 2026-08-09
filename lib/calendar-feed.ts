import { listEventsCore } from '@/lib/events'
import { listAllInvoicesCore } from '@/lib/crm/invoices'
import { listLeadsCore } from '@/lib/crm/leads'
import { listTasksCore } from '@/lib/crm/tasks'
import { listComplianceDocsCore } from '@/lib/ops/compliance'
import { OPEN_STAGES } from '@/lib/leads'
import { buildCalendarFeed, type CalendarItem } from '@/lib/calendar'
import type { Lead, Task } from '@/lib/types'

/** Fetch every source and assemble all six calendar kinds. No auth — callers guard. */
export async function assembleCalendarFeed(orgId: string, orgSlug: string): Promise<CalendarItem[]> {
  const [events, leads, complianceDocs, invoices] = await Promise.all([
    listEventsCore(orgId),
    listLeadsCore(orgId),
    listComplianceDocsCore(orgId),
    listAllInvoicesCore(orgId),
  ])
  const openLeads = leads.filter((l) => (OPEN_STAGES as Lead['stage'][]).includes(l.stage))
  const taskLists = await Promise.all(openLeads.map((l) => listTasksCore(orgId, l.id)))
  const tasksByLeadId: Record<string, Task[]> = {}
  openLeads.forEach((l, i) => { tasksByLeadId[l.id] = taskLists[i] })
  return buildCalendarFeed(orgSlug, { events, leads, tasksByLeadId, complianceDocs, invoices })
}
