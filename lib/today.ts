import type { Lead, Task, LeadStage } from '@/lib/types'
import { computeHealth } from '@/lib/opportunity-health'
import { OPEN_STAGES, pipelineSummary, opportunityTitle } from '@/lib/leads'
import { dueStatus } from '@/lib/opportunity-detail'

export interface TodayTiles {
  tasksDue: number
  needsAttention: number
  openPipelineValue: number
}

export interface NeedsAttentionItem {
  leadId: string
  title: string
  company?: string
  stage: LeadStage
}

export interface DueTaskItem {
  task: Task
  leadId: string
  leadTitle: string
  company?: string
  status: 'overdue' | 'today'
}

export interface WaitingItem {
  leadId: string
  title: string
  company?: string
  reason: string
  followUpDate?: string
  followUpDue: boolean
  quietDays: number
}

export interface WonUnscheduledItem {
  leadId: string
  title: string
  company?: string
  eventDate?: string
  value?: number
}

export interface TodayData {
  tiles: TodayTiles
  needsAttention: NeedsAttentionItem[]
  dueTasks: DueTaskItem[]
  waiting: WaitingItem[]
  wonUnscheduled: WonUnscheduledItem[]
}

/** Whole days between an ISO timestamp (or YYYY-MM-DD) and `today` (YYYY-MM-DD), never negative. */
function quietDaysSince(sinceIso: string, today: string): number {
  const from = Date.parse(`${sinceIso.slice(0, 10)}T00:00:00.000Z`)
  const to = Date.parse(`${today}T00:00:00.000Z`)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.max(0, Math.round((to - from) / 86_400_000))
}

export function buildToday(input: {
  leads: Lead[]
  tasksByLeadId: Record<string, Task[]>
  today: string
  scheduledLeadIds: string[]
}): TodayData {
  const { leads, tasksByLeadId, today, scheduledLeadIds } = input
  const isOpen = (s: LeadStage) => (OPEN_STAGES as LeadStage[]).includes(s)
  const openLeads = leads.filter((l) => isOpen(l.stage))
  const byId = new Map(leads.map((l) => [l.id, l]))
  const scheduled = new Set(scheduledLeadIds)

  const needsAttention: NeedsAttentionItem[] = []
  const dueTasks: DueTaskItem[] = []
  const waiting: WaitingItem[] = []

  for (const lead of openLeads) {
    const tasks = tasksByLeadId[lead.id] ?? []
    const health = computeHealth(lead, tasks)

    if (health === 'needs_attention') {
      needsAttention.push({ leadId: lead.id, title: opportunityTitle(lead), company: lead.organization, stage: lead.stage })
    } else if (health === 'waiting' && lead.waiting) {
      const followUpDate = lead.waiting.follow_up_date
      waiting.push({
        leadId: lead.id,
        title: opportunityTitle(lead),
        company: lead.organization,
        reason: lead.waiting.reason,
        followUpDate,
        followUpDue: !!followUpDate && followUpDate <= today,
        quietDays: quietDaysSince(lead.updated_at ?? lead.created_at, today),
      })
    }

    // Due list is task-centric: any open, dated task due today or earlier.
    for (const t of tasks) {
      if (t.done || !t.due_date || t.due_date > today) continue
      dueTasks.push({
        task: t,
        leadId: lead.id,
        leadTitle: opportunityTitle(lead),
        company: lead.organization,
        status: dueStatus(t.due_date, today) === 'overdue' ? 'overdue' : 'today',
      })
    }
  }

  // A won deal that never became work is the same orphan the open-stage
  // lists exist to catch, one stage later.
  const wonUnscheduled: WonUnscheduledItem[] = leads
    .filter((l) => l.stage === 'closed_won' && !scheduled.has(l.id))
    .map((l) => ({
      leadId: l.id,
      title: opportunityTitle(l),
      company: l.organization,
      eventDate: l.event_date,
      value: l.estimated_value,
    }))

  const staleKey = (leadId: string) => byId.get(leadId)?.updated_at ?? byId.get(leadId)?.created_at ?? ''
  needsAttention.sort((a, b) => staleKey(a.leadId).localeCompare(staleKey(b.leadId)))
  dueTasks.sort((a, b) =>
    a.task.due_date === b.task.due_date
      ? a.task.created_at.localeCompare(b.task.created_at)
      : a.task.due_date!.localeCompare(b.task.due_date!)
  )
  waiting.sort((a, b) => (a.followUpDue !== b.followUpDue ? (a.followUpDue ? -1 : 1) : b.quietDays - a.quietDays))
  wonUnscheduled.sort((a, b) => {
    if (!a.eventDate) return b.eventDate ? 1 : 0
    if (!b.eventDate) return -1
    return a.eventDate.localeCompare(b.eventDate)
  })

  return {
    tiles: {
      tasksDue: dueTasks.length,
      needsAttention: needsAttention.length,
      openPipelineValue: pipelineSummary(leads).openValue,
    },
    needsAttention,
    dueTasks,
    waiting,
    wonUnscheduled,
  }
}
