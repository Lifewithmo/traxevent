import type { Lead, LeadStage, LostReason } from '@/lib/types'

export const LEAD_STAGES: LeadStage[] = ['inquiry', 'consultation', 'proposal', 'closed_won', 'closed_lost']

// Pipeline stages still "in play" vs. the two closed outcomes. closed_won is the booking.
export const OPEN_STAGES: LeadStage[] = ['inquiry', 'consultation', 'proposal']
export const CLOSED_STAGES: LeadStage[] = ['closed_won', 'closed_lost']

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  inquiry: 'Inquiry',
  consultation: 'Consultation',
  proposal: 'Proposal',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
}

// Bucket leads by stage for the pipeline board. Leads with an unrecognized stage are dropped.
export function groupLeadsByStage(leads: Lead[]): Record<LeadStage, Lead[]> {
  const grouped = { inquiry: [], consultation: [], proposal: [], closed_won: [], closed_lost: [] } as Record<LeadStage, Lead[]>
  for (const lead of leads) {
    if (grouped[lead.stage]) grouped[lead.stage].push(lead)
  }
  return grouped
}

export interface PipelineStageSummary {
  stage: LeadStage
  count: number
  value: number
}

export interface PipelineSummary {
  stages: PipelineStageSummary[]
  openCount: number
  openValue: number
  bookedValue: number
}

export function pipelineSummary(leads: Lead[]): PipelineSummary {
  const grouped = groupLeadsByStage(leads)
  const stages = LEAD_STAGES.map((stage) => {
    const items = grouped[stage]
    return { stage, count: items.length, value: items.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0) }
  })
  const open = stages.filter((s) => (OPEN_STAGES as LeadStage[]).includes(s.stage))
  const openCount = open.reduce((n, s) => n + s.count, 0)
  const openValue = open.reduce((n, s) => n + s.value, 0)
  const bookedValue = grouped.closed_won.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0)
  return { stages, openCount, openValue, bookedValue }
}

/** The opportunity's display label — its own title, or the contact name for legacy leads. */
export function opportunityTitle(lead: Pick<Lead, 'title' | 'name'>): string {
  return lead.title?.trim() || lead.name
}

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  over_budget: 'Over budget',
  went_elsewhere: 'Went elsewhere',
  date_fell_through: 'Date fell through',
  no_response: 'No response',
}

export const LOST_REASONS = (Object.entries(LOST_REASON_LABELS) as [LostReason, string][])
  .map(([value, label]) => ({ value, label }))

/** closed_at delta for a stage transition; {} when closed-ness is unchanged. */
export function closedAtPatch(prev: LeadStage, next: LeadStage, nowIso: string): { closed_at?: string | null } {
  const wasClosed = CLOSED_STAGES.includes(prev)
  const isClosed = CLOSED_STAGES.includes(next)
  if (!wasClosed && isClosed) return { closed_at: nowIso }
  if (wasClosed && !isClosed) return { closed_at: null }
  return {}
}
