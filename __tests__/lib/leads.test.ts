import { describe, it, expect } from 'vitest'
import { LEAD_STAGES, LEAD_STAGE_LABELS, OPEN_STAGES, CLOSED_STAGES, groupLeadsByStage, pipelineSummary, opportunityTitle, closedAtPatch, LOST_REASON_LABELS } from '@/lib/leads'
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

describe('opportunityTitle', () => {
  it('prefers an explicit title', () => {
    expect(opportunityTitle({ title: 'Riverside gala', name: 'Dana Kim' })).toBe('Riverside gala')
  })
  it('falls back to the contact name for legacy leads', () => {
    expect(opportunityTitle({ name: 'Dana Kim' })).toBe('Dana Kim')
  })
  it('treats a blank title as absent', () => {
    expect(opportunityTitle({ title: '   ', name: 'Dana Kim' })).toBe('Dana Kim')
  })
})

describe('closedAtPatch', () => {
  const now = '2026-08-07T20:00:00.000Z'
  it('stamps closed_at when entering a closed stage from an open one', () => {
    expect(closedAtPatch('proposal', 'closed_won', now)).toEqual({ closed_at: now })
    expect(closedAtPatch('inquiry', 'closed_lost', now)).toEqual({ closed_at: now })
  })
  it('clears closed_at when reopening', () => {
    expect(closedAtPatch('closed_won', 'proposal', now)).toEqual({ closed_at: null })
  })
  it('is a no-op when the closed-ness does not change', () => {
    expect(closedAtPatch('inquiry', 'consultation', now)).toEqual({})
    expect(closedAtPatch('closed_won', 'closed_lost', now)).toEqual({})
  })
})

describe('LOST_REASON_LABELS', () => {
  it('labels all four reasons', () => {
    expect(LOST_REASON_LABELS.over_budget).toBe('Over budget')
    expect(LOST_REASON_LABELS.went_elsewhere).toBe('Went elsewhere')
    expect(LOST_REASON_LABELS.date_fell_through).toBe('Date fell through')
    expect(LOST_REASON_LABELS.no_response).toBe('No response')
  })
})
