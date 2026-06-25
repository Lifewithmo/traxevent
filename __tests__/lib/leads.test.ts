import { describe, it, expect } from 'vitest'
import { LEAD_STAGES, LEAD_STAGE_LABELS, groupLeadsByStage, pipelineSummary } from '@/lib/leads'
import type { Lead, LeadStage } from '@/lib/types'

const lead = (id: string, stage: LeadStage, estimated_value?: number): Lead =>
  ({ id, name: id, stage, created_at: '', ...(estimated_value != null ? { estimated_value } : {}) }) as Lead

describe('LEAD_STAGES', () => {
  it('is the five pipeline stages in order', () => {
    expect(LEAD_STAGES).toEqual(['inquiry', 'consultation', 'proposal', 'booked', 'delivered'])
  })
  it('has a label for every stage', () => {
    for (const s of LEAD_STAGES) expect(LEAD_STAGE_LABELS[s]).toBeTruthy()
  })
})

describe('groupLeadsByStage', () => {
  it('buckets leads into their stage', () => {
    const g = groupLeadsByStage([lead('a', 'inquiry'), lead('b', 'booked'), lead('c', 'inquiry')])
    expect(g.inquiry.map((l) => l.id)).toEqual(['a', 'c'])
    expect(g.booked.map((l) => l.id)).toEqual(['b'])
    expect(g.delivered).toEqual([])
  })
  it('ignores leads with an unrecognized stage', () => {
    const g = groupLeadsByStage([lead('x', 'bogus' as LeadStage)])
    expect(Object.values(g).flat()).toEqual([])
  })
})

describe('pipelineSummary', () => {
  it('counts and sums estimated value per stage; openValue excludes delivered; bookedValue includes booked+delivered', () => {
    const s = pipelineSummary([
      lead('a', 'inquiry', 1000),
      lead('b', 'booked', 5000),
      lead('c', 'delivered', 3000),
      lead('d', 'proposal'),            // no value
    ])
    expect(s.stages.find((x) => x.stage === 'inquiry')).toMatchObject({ count: 1, value: 1000 })
    expect(s.stages.find((x) => x.stage === 'proposal')).toMatchObject({ count: 1, value: 0 })
    expect(s.openCount).toBe(3)         // inquiry + booked + proposal (not delivered)
    expect(s.openValue).toBe(6000)      // 1000 + 5000
    expect(s.bookedValue).toBe(8000)    // 5000 + 3000
  })
})
