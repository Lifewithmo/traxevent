import { describe, it, expect } from 'vitest'
import { LEAD_STAGES, LEAD_STAGE_LABELS, OPEN_STAGES, CLOSED_STAGES, groupLeadsByStage, pipelineSummary } from '@/lib/leads'
import type { Lead, LeadStage } from '@/lib/types'

describe('lead stages (V1)', () => {
  it('has the five V1 stages', () => {
    expect(LEAD_STAGES).toEqual(['inquiry', 'consultation', 'proposal', 'closed_won', 'closed_lost'])
  })
  it('splits open vs closed', () => {
    expect(OPEN_STAGES).toEqual(['inquiry', 'consultation', 'proposal'])
    expect(CLOSED_STAGES).toEqual(['closed_won', 'closed_lost'])
  })
})

const lead = (id: string, stage: LeadStage, estimated_value?: number): Lead =>
  ({ id, name: id, stage, created_at: '', ...(estimated_value != null ? { estimated_value } : {}) }) as Lead

describe('LEAD_STAGES', () => {
  it('is the five pipeline stages in order', () => {
    expect(LEAD_STAGES).toEqual(['inquiry', 'consultation', 'proposal', 'closed_won', 'closed_lost'])
  })
  it('has a label for every stage', () => {
    for (const s of LEAD_STAGES) expect(LEAD_STAGE_LABELS[s]).toBeTruthy()
  })
})

describe('groupLeadsByStage', () => {
  it('buckets leads into their stage', () => {
    const g = groupLeadsByStage([lead('a', 'inquiry'), lead('b', 'closed_won'), lead('c', 'inquiry')])
    expect(g.inquiry.map((l) => l.id)).toEqual(['a', 'c'])
    expect(g.closed_won.map((l) => l.id)).toEqual(['b'])
    expect(g.closed_lost).toEqual([])
  })
  it('ignores leads with an unrecognized stage', () => {
    const g = groupLeadsByStage([lead('x', 'bogus' as LeadStage)])
    expect(Object.values(g).flat()).toEqual([])
  })
})

describe('pipelineSummary', () => {
  it('counts and sums estimated value per stage; openValue excludes closed stages; bookedValue is closed_won only', () => {
    const s = pipelineSummary([
      lead('a', 'inquiry', 1000),
      lead('b', 'closed_won', 5000),
      lead('c', 'closed_lost', 3000),
      lead('d', 'proposal'),            // no value
    ])
    expect(s.stages.find((x) => x.stage === 'inquiry')).toMatchObject({ count: 1, value: 1000 })
    expect(s.stages.find((x) => x.stage === 'proposal')).toMatchObject({ count: 1, value: 0 })
    expect(s.openCount).toBe(2)         // inquiry + proposal (not closed_won/closed_lost)
    expect(s.openValue).toBe(1000)      // 1000
    expect(s.bookedValue).toBe(5000)    // closed_won only
  })
})
