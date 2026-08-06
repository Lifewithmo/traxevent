import type { Lead, LeadStage } from '@/lib/types'

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
