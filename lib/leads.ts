import type { Lead, LeadStage } from '@/lib/types'

export const LEAD_STAGES: LeadStage[] = ['inquiry', 'consultation', 'proposal', 'booked', 'delivered']

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  inquiry: 'Inquiry',
  consultation: 'Consultation',
  proposal: 'Proposal',
  booked: 'Booked',
  delivered: 'Delivered',
}

// Bucket leads by stage for the pipeline board. Leads with an unrecognized stage are dropped.
export function groupLeadsByStage(leads: Lead[]): Record<LeadStage, Lead[]> {
  const grouped = { inquiry: [], consultation: [], proposal: [], booked: [], delivered: [] } as Record<LeadStage, Lead[]>
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
  const open = stages.filter((s) => s.stage !== 'delivered')
  const openCount = open.reduce((n, s) => n + s.count, 0)
  const openValue = open.reduce((n, s) => n + s.value, 0)
  const bookedValue = [...grouped.booked, ...grouped.delivered].reduce((sum, l) => sum + (l.estimated_value ?? 0), 0)
  return { stages, openCount, openValue, bookedValue }
}
