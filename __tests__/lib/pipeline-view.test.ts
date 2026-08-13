import { describe, it, expect } from 'vitest'
import { buildPipelineRows, countdownLabel, closedThisMonth } from '@/lib/pipeline-view'
import type { Lead, Task, Proposal } from '@/lib/types'

const today = '2026-08-07'
const lead = (over: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Dana', stage: 'consultation', created_at: '2026-07-01T00:00:00.000Z', ...over,
} as Lead)
const task = (over: Partial<Task>): Task => ({
  id: 't1', lead_id: 'l1', title: 'Site visit', done: false, created_at: '2026-08-01T00:00:00.000Z', ...over,
} as Task)

describe('countdownLabel', () => {
  it('labels today, future, and overdue', () => {
    expect(countdownLabel('2026-08-07', today)).toBe('Today')
    expect(countdownLabel('2026-08-09', today)).toBe('in 2 days')
    expect(countdownLabel('2026-08-05', today)).toBe('2 days overdue')
  })
})

describe('buildPipelineRows', () => {
  it('groups by health and builds the needs-attention sentence', () => {
    const g = buildPipelineRows([{
      lead: lead({ event_date: '2026-09-04', guest_count: 60, last_touch_at: '2026-07-27T00:00:00.000Z' }),
      tasks: [], proposals: [],
    }], today)
    expect(g.needs_attention).toHaveLength(1)
    expect(g.needs_attention[0].statusLine).toBe('No next step — last touched 11 days ago')
    expect(g.needs_attention[0].quickAction).toBe('set_next_step')
  })
  it('flags an unopened sent proposal with a nudge action, using the sent event time', () => {
    const g = buildPipelineRows([{
      lead: lead({ stage: 'proposal', last_touch_at: '2026-07-29T00:00:00.000Z' }),
      tasks: [],
      proposals: [{
        id: 'p1', status: 'sent', created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-29T00:00:00.000Z',
        events: [{ kind: 'sent', at: '2026-07-29T00:00:00.000Z' }],
      } as Proposal],
    }], today)
    expect(g.needs_attention[0].statusLine).toBe('Proposal sent 9 days ago — no opens')
    expect(g.needs_attention[0].quickAction).toBe('nudge')
  })
  it('falls back to created_at for a legacy proposal with no sent event', () => {
    const g = buildPipelineRows([{
      lead: lead({ stage: 'proposal', last_touch_at: '2026-07-29T00:00:00.000Z' }),
      tasks: [],
      proposals: [{ id: 'p1', status: 'sent', created_at: '2026-07-29T00:00:00.000Z', updated_at: '2026-07-29T00:00:00.000Z' } as Proposal],
    }], today)
    expect(g.needs_attention[0].statusLine).toBe('Proposal sent 9 days ago — no opens')
  })
  it('builds waiting rows with follow-up countdown', () => {
    const g = buildPipelineRows([{
      lead: lead({ waiting: { reason: 'PO number', follow_up_date: '2026-08-09' } }),
      tasks: [], proposals: [],
    }], today)
    expect(g.waiting[0].statusLine).toBe('Waiting on them — PO number · follow up 2026-08-09')
    expect(g.waiting[0].countdown).toBe('in 2 days')
  })
  it('builds active rows from the next task and sorts groups oldest-touch first', () => {
    const g = buildPipelineRows([
      { lead: lead({ id: 'newer', last_touch_at: '2026-08-06T00:00:00.000Z' }),
        tasks: [task({ due_date: '2026-08-11' })], proposals: [] },
      { lead: lead({ id: 'older', last_touch_at: '2026-08-01T00:00:00.000Z' }),
        tasks: [task({ title: 'Send options', due_date: '2026-08-07' })], proposals: [] },
    ], today)
    expect(g.active.map((r) => r.lead.id)).toEqual(['older', 'newer'])
    expect(g.active[0].statusLine).toBe('Next: Send options · due 2026-08-07')
    expect(g.active[0].countdown).toBe('Today')
  })
  it('excludes closed leads', () => {
    const g = buildPipelineRows([{ lead: lead({ stage: 'closed_won' }), tasks: [], proposals: [] }], today)
    expect(g.needs_attention.length + g.waiting.length + g.active.length).toBe(0)
  })
})

describe('closedThisMonth', () => {
  it('rolls up only leads closed in the current month', () => {
    const r = closedThisMonth([
      lead({ stage: 'closed_won', closed_at: '2026-08-02T00:00:00.000Z', estimated_value: 1000 }),
      lead({ stage: 'closed_won', closed_at: '2026-07-30T00:00:00.000Z', estimated_value: 500 }),
      lead({ stage: 'closed_lost', closed_at: '2026-08-05T00:00:00.000Z', estimated_value: 540 }),
    ], today)
    expect(r).toEqual({ wonCount: 1, wonValue: 1000, lostCount: 1, lostValue: 540 })
  })
})
