import { describe, it, expect } from 'vitest'
import { computeHealth, nextAction } from '@/lib/opportunity-health'
import type { Task } from '@/lib/types'

const t = (over: Partial<Task>): Task => ({ id: 'x', lead_id: 'l', title: 't', done: false, created_at: '', ...over })

describe('computeHealth', () => {
  it('closed when stage is a closed outcome', () => {
    expect(computeHealth({ stage: 'closed_won' }, [])).toBe('closed')
    expect(computeHealth({ stage: 'closed_lost' }, [t({ due_date: '2026-01-01' })])).toBe('closed')
  })
  it('waiting when the lead is flagged waiting and not closed', () => {
    expect(computeHealth({ stage: 'proposal', waiting: { reason: 'signed contract' } }, [])).toBe('waiting')
  })
  it('active when an incomplete dated task exists', () => {
    expect(computeHealth({ stage: 'inquiry' }, [t({ due_date: '2026-02-01' })])).toBe('active')
  })
  it('needs_attention when open, not waiting, no dated incomplete task', () => {
    expect(computeHealth({ stage: 'inquiry' }, [])).toBe('needs_attention')
    expect(computeHealth({ stage: 'proposal' }, [t({ done: true, due_date: '2026-02-01' })])).toBe('needs_attention')
    expect(computeHealth({ stage: 'proposal' }, [t({ due_date: undefined })])).toBe('needs_attention')
  })
})

describe('nextAction', () => {
  it('returns the soonest incomplete dated task', () => {
    const tasks = [t({ id: 'a', due_date: '2026-03-01' }), t({ id: 'b', due_date: '2026-02-01' }), t({ id: 'c', done: true, due_date: '2026-01-01' })]
    expect(nextAction(tasks)?.id).toBe('b')
  })
  it('returns null when nothing qualifies', () => {
    expect(nextAction([t({ due_date: undefined }), t({ done: true, due_date: '2026-01-01' })])).toBeNull()
  })
  it('breaks a due_date tie in favor of the first task', () => {
    expect(nextAction([t({ id: 'a', due_date: '2026-02-01' }), t({ id: 'b', due_date: '2026-02-01' })])?.id).toBe('a')
  })
})
