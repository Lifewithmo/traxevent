import { describe, it, expect } from 'vitest'
import { buildToday } from '@/lib/today'
import type { Lead, Task } from '@/lib/types'

const lead = (over: Partial<Lead>): Lead => ({ id: 'x', name: 'X', stage: 'inquiry', created_at: '2026-08-01T00:00:00.000Z', ...over })
const task = (over: Partial<Task>): Task => ({ id: 't', lead_id: 'x', title: 'T', done: false, created_at: '2026-08-01T00:00:00.000Z', ...over })

describe('buildToday', () => {
  const today = '2026-08-05'

  it('needs-attention = open lead, not waiting, no dated task', () => {
    const l = lead({ id: 'a', name: 'Ann', organization: 'Acme' })
    const d = buildToday({ leads: [l], tasksByLeadId: { a: [] }, today })
    expect(d.needsAttention.map((n) => n.leadId)).toEqual(['a'])
    expect(d.needsAttention[0].company).toBe('Acme')
    expect(d.tiles.needsAttention).toBe(1)
  })

  it('a dated open task moves a lead out of needs-attention and into due when due<=today', () => {
    const l = lead({ id: 'b' })
    const d = buildToday({ leads: [l], tasksByLeadId: { b: [task({ id: 't1', lead_id: 'b', due_date: '2026-08-05' })] }, today })
    expect(d.needsAttention).toHaveLength(0)
    expect(d.dueTasks.map((x) => x.task.id)).toEqual(['t1'])
    expect(d.dueTasks[0].status).toBe('today')
    expect(d.tiles.tasksDue).toBe(1)
  })

  it('classifies overdue vs today and excludes future/done', () => {
    const l = lead({ id: 'c' })
    const tasks = [
      task({ id: 'over', lead_id: 'c', due_date: '2026-08-01' }),
      task({ id: 'fut', lead_id: 'c', due_date: '2026-08-09' }),
      task({ id: 'donetoday', lead_id: 'c', due_date: '2026-08-05', done: true }),
    ]
    const d = buildToday({ leads: [l], tasksByLeadId: { c: tasks }, today })
    expect(d.dueTasks.map((x) => x.task.id)).toEqual(['over'])
    expect(d.dueTasks[0].status).toBe('overdue')
  })

  it('waiting list carries reason, follow-up-due and quiet days; sorts due-first', () => {
    const notDue = lead({ id: 'w1', name: 'W1', updated_at: '2026-08-04T00:00:00.000Z', waiting: { reason: 'quote', follow_up_date: '2026-08-10' } })
    const due = lead({ id: 'w2', name: 'W2', updated_at: '2026-08-01T00:00:00.000Z', waiting: { reason: 'sign', follow_up_date: '2026-08-03' } })
    const d = buildToday({ leads: [notDue, due], tasksByLeadId: { w1: [], w2: [] }, today })
    expect(d.waiting.map((w) => w.leadId)).toEqual(['w2', 'w1']) // due first
    expect(d.waiting[0].followUpDue).toBe(true)
    expect(d.waiting[0].quietDays).toBe(4)
    expect(d.waiting[1].followUpDue).toBe(false)
  })

  it('open pipeline value sums estimated_value over open leads only', () => {
    const leads = [
      lead({ id: 'o1', stage: 'proposal', estimated_value: 1000 }),
      lead({ id: 'o2', stage: 'inquiry', estimated_value: 500 }),
      lead({ id: 'won', stage: 'closed_won', estimated_value: 9999 }),
    ]
    const d = buildToday({ leads, tasksByLeadId: { o1: [], o2: [] }, today })
    expect(d.tiles.openPipelineValue).toBe(1500)
  })

  it('excludes closed leads from every list', () => {
    const leads = [lead({ id: 'lost', stage: 'closed_lost' }), lead({ id: 'won', stage: 'closed_won' })]
    const d = buildToday({ leads, tasksByLeadId: {}, today })
    expect(d.needsAttention).toHaveLength(0)
    expect(d.dueTasks).toHaveLength(0)
    expect(d.waiting).toHaveLength(0)
  })

  it('needs-attention sorts stalest (oldest updated_at) first', () => {
    const fresh = lead({ id: 'fresh', updated_at: '2026-08-04T00:00:00.000Z' })
    const stale = lead({ id: 'stale', updated_at: '2026-08-01T00:00:00.000Z' })
    const d = buildToday({ leads: [fresh, stale], tasksByLeadId: { fresh: [], stale: [] }, today })
    expect(d.needsAttention.map((n) => n.leadId)).toEqual(['stale', 'fresh'])
  })

  it('due-list sorts by due_date ascending, with created_at tie-break', () => {
    const l = lead({ id: 'multi' })
    const tasks = [
      task({ id: 'taskA', lead_id: 'multi', due_date: '2026-08-04', created_at: '2026-08-01T00:00:00.000Z' }),
      task({ id: 'taskB', lead_id: 'multi', due_date: '2026-08-02', created_at: '2026-08-02T00:00:00.000Z' }),
      task({ id: 'taskC', lead_id: 'multi', due_date: '2026-08-02', created_at: '2026-08-01T00:00:00.000Z' }),
    ]
    const d = buildToday({ leads: [l], tasksByLeadId: { multi: tasks }, today })
    expect(d.dueTasks.map((x) => x.task.id)).toEqual(['taskC', 'taskB', 'taskA'])
  })

  it('waiting sorts by quietDays descending when followUpDue is same', () => {
    const longerQuiet = lead({ id: 'lq', name: 'LQ', updated_at: '2026-08-01T00:00:00.000Z', waiting: { reason: 'quote', follow_up_date: '2026-08-10' } })
    const shorterQuiet = lead({ id: 'sq', name: 'SQ', updated_at: '2026-08-04T00:00:00.000Z', waiting: { reason: 'quote', follow_up_date: '2026-08-10' } })
    const d = buildToday({ leads: [shorterQuiet, longerQuiet], tasksByLeadId: { lq: [], sq: [] }, today })
    expect(d.waiting.map((w) => w.leadId)).toEqual(['lq', 'sq'])
    expect(d.waiting[0].quietDays).toBe(4)
    expect(d.waiting[1].quietDays).toBe(1)
  })
})
