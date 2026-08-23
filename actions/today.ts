'use server'

import { canAccessEventPage } from '@/lib/auth/access'
import { assertOrgMember } from '@/lib/auth/assert'
import { listLeadsCore } from '@/lib/crm/leads'
import { listTasksCore } from '@/lib/crm/tasks'
import { listEventsCore } from '@/lib/events'
import { OPEN_STAGES } from '@/lib/leads'
import { kindOf } from '@/lib/occasions/kind'
import { getOpsPlanCore } from '@/lib/ops/event-ops'
import { todayYmd } from '@/lib/opportunity-detail'
import { buildToday, type TodayData } from '@/lib/today'
import { agendaOpsOf, attachAgendaOps, buildAgenda, type Agenda, type AgendaOps } from '@/lib/today-moves'
import type { LeadStage, Task } from '@/lib/types'

// NOTE: this is a 'use server' module — every export must be an async function.
// TodayData / Agenda (types) are therefore NOT re-exported here; import them
// from '@/lib/today' and '@/lib/today-moves' directly. Re-exporting broke
// `next build` (RSC compiler).

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

/**
 * Booked work for today + the next seven days. Reuses listEventsCore — no new
 * query shape — then fans out one ops-plan read per client job on the agenda
 * (today+7 window only, so days_until <= 7 by construction; same per-nav cost
 * class as getTodayData's task fan-out above) so the rail can say whether the
 * next job is actually ready.
 */
export async function getTodayAgenda(orgId: string): Promise<Agenda> {
  const member = await assertOrgMember(orgId)
  const events = await listEventsCore(orgId)
  const today = todayYmd()
  const agenda = buildAgenda(events, today)

  const onAgenda = new Set([...agenda.today, ...agenda.upcoming].map((e) => e.eventId))
  // Per-event ops gate (pure math over the member doc — same rule the event
  // layout and the org-home horizon rail apply): readiness/packed facts are
  // derived from the ops plan, so a member without the 'ops' page on an event
  // gets NO enrichment for it — no chip, no claim, never a false state.
  const jobs = events.filter(
    (e) =>
      onAgenda.has(e.id) &&
      kindOf(e) === 'client_job' &&
      canAccessEventPage(member, e.id, 'ops', e.department_id ?? null)
  )
  const reads = await Promise.all(
    jobs.map(async (e) => {
      try {
        return { eventId: e.id, ops: agendaOpsOf(await getOpsPlanCore(orgId, e.id), e.event_start, today) }
      } catch {
        return null // failed read: attach nothing — never a false "no ops plan yet"
      }
    })
  )
  const opsByEventId: Record<string, AgendaOps> = {}
  for (const r of reads) if (r) opsByEventId[r.eventId] = r.ops
  return attachAgendaOps(agenda, opsByEventId)
}
