import { LEAD_STAGES, LEAD_STAGE_LABELS } from '@/lib/leads'
import type { LeadStage } from '@/lib/types'

export interface LeadTimelineStep {
  stage: LeadStage
  label: string
  done: boolean
  current: boolean
}

// A stepper for the client portal: stages before the current are done, the current is highlighted.
export function buildLeadTimeline(stage: LeadStage): LeadTimelineStep[] {
  const idx = LEAD_STAGES.indexOf(stage)
  return LEAD_STAGES.map((s, i) => ({
    stage: s,
    label: LEAD_STAGE_LABELS[s],
    done: idx >= 0 && i < idx,
    current: i === idx,
  }))
}
