import { describe, it, expect } from 'vitest'
import { buildMoves, buildAgenda, moveCount, agendaOpsOf, attachAgendaOps } from '@/lib/today-moves'
import type { TodayData } from '@/lib/today'
import type { Event, OpsPlan } from '@/lib/types'

const today = '2026-08-05'

const emptyData: TodayData = {
  tiles: { tasksDue: 0, needsAttention: 0, openPipelineValue: 0 },
  needsAttention: [],
  dueTasks: [],
  waiting: [],
  wonUnscheduled: [],
}

const task = (over: Partial<TodayData['dueTasks'][0]['task']>) => ({
  id: 't', lead_id: 'l', title: 'Call', done: false, created_at: '2026-08-01T00:00:00.000Z', ...over,
})

describe('buildMoves', () => {
  it('groups in queue order: overdue, due today, no next step, waiting, won-unscheduled', () => {
    const data: TodayData = {
      ...emptyData,
      dueTasks: [
        { task: task({ id: 'td' }), leadId: 'l1', leadTitle: 'Ann', status: 'today' },
        { task: task({ id: 'ov', due_date: '2026-08-01' }), leadId: 'l2', leadTitle: 'Bob', status: 'overdue' },
      ],
      needsAttention: [{ leadId: 'l3', title: 'Cara', stage: 'inquiry' }],
      waiting: [{ leadId: 'l4', title: 'Dan', reason: 'quote', followUpDue: true, quietDays: 2 }],
      wonUnscheduled: [{ leadId: 'l5', title: 'Eve' }],
    }
    const blocks = buildMoves(data, today)
    expect(blocks.map((b) => b.group)).toEqual(['overdue', 'due_today', 'no_next_step', 'waiting', 'won_unscheduled'])
    expect(blocks[0].tone).toBe('urgent')
    expect(moveCount(blocks)).toBe(5)
  })

  it('drops empty groups', () => {
    const data: TodayData = { ...emptyData, needsAttention: [{ leadId: 'l1', title: 'Ann', stage: 'inquiry' }] }
    const blocks = buildMoves(data, today)
    expect(blocks.map((b) => b.group)).toEqual(['no_next_step'])
  })

  it('hides waiting rows whose follow-up is not due yet', () => {
    const data: TodayData = {
      ...emptyData,
      waiting: [
        { leadId: 'due', title: 'Due', reason: 'quote', followUpDue: true, quietDays: 3 },
        { leadId: 'quiet', title: 'Quiet', reason: 'sign', followUpDue: false, quietDays: 1 },
      ],
    }
    const blocks = buildMoves(data, today)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].moves.map((m) => m.leadId)).toEqual(['due'])
  })

  it('headlines the company when present, else the opportunity title', () => {
    const data: TodayData = {
      ...emptyData,
      needsAttention: [
        { leadId: 'l1', title: 'Ann', company: 'Acme', stage: 'inquiry' },
        { leadId: 'l2', title: 'Bob', stage: 'inquiry' },
      ],
    }
    const [block] = buildMoves(data, today)
    expect(block.moves[0].customer).toBe('Acme')
    expect(block.moves[0].detail).toBe('Ann · no next step')
    expect(block.moves[1].customer).toBe('Bob')
    expect(block.moves[1].detail).toBe('no next step')
  })

  it('due-task rows lead with mark-done and offer snooze dates from today', () => {
    const data: TodayData = {
      ...emptyData,
      dueTasks: [{ task: task({ id: 'ov', due_date: '2026-08-01' }), leadId: 'l1', leadTitle: 'Ann', status: 'overdue' }],
    }
    const [block] = buildMoves(data, today)
    const actions = block.moves[0].actions
    expect(actions[0]).toEqual({ kind: 'complete', label: 'Mark done' })
    expect(actions.find((a) => a.label === 'Due tomorrow')?.dueDate).toBe('2026-08-06')
    expect(actions.find((a) => a.label === 'Due next week')?.dueDate).toBe('2026-08-12')
    expect(block.moves[0].detail).toContain('due 2026-08-01')
  })
})

const ev = (over: Partial<Event>): Event => ({
  id: 'e', name: 'Wedding', slug: 'wedding', year: 2026, status: 'active',
  registration_type: 'open' as Event['registration_type'], event_type_id: 'et1',
  features: { accommodations: false, teams: false, budget: false, itinerary: false, communicate: false },
  event_start: '2026-08-05', event_end: '2026-08-05', created_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

describe('buildAgenda', () => {
  it('splits today from the seven-day window and keeps empty days visible', () => {
    const agenda = buildAgenda(
      [
        ev({ id: 'now', slug: 'now', name: 'Now', event_start: '2026-08-05', event_end: '2026-08-05' }),
        ev({ id: 'soon', slug: 'soon', name: 'Soon', event_start: '2026-08-08', event_end: '2026-08-08' }),
      ],
      today
    )
    expect(agenda.today.map((e) => e.eventId)).toEqual(['now'])
    expect(agenda.upcoming.map((e) => e.eventId)).toEqual(['soon'])
    expect(agenda.windowDays).toHaveLength(7)
    expect(agenda.windowDays[0]).toBe('2026-08-06')
    expect(agenda.windowDays[6]).toBe('2026-08-12')
  })

  it('a multi-day event appears on every day it covers, flagged multiDay', () => {
    const agenda = buildAgenda([ev({ event_start: '2026-08-05', event_end: '2026-08-07' })], today)
    expect(agenda.today).toHaveLength(1)
    expect(agenda.today[0].multiDay).toBe(true)
    expect(agenda.upcoming.map((e) => e.date)).toEqual(['2026-08-06', '2026-08-07'])
  })

  it('excludes archived events and anything past the window', () => {
    const agenda = buildAgenda(
      [
        ev({ id: 'arch', status: 'archived' }),
        ev({ id: 'far', event_start: '2026-08-20', event_end: '2026-08-20' }),
      ],
      today
    )
    expect(agenda.today).toHaveLength(0)
    expect(agenda.upcoming).toHaveLength(0)
  })

  it('stamps each entry with whole days until its date', () => {
    const agenda = buildAgenda(
      [
        ev({ id: 'now', event_start: '2026-08-05', event_end: '2026-08-06' }),
        ev({ id: 'soon', slug: 'soon', event_start: '2026-08-08', event_end: '2026-08-08' }),
      ],
      today
    )
    expect(agenda.today[0].daysUntil).toBe(0)
    expect(agenda.upcoming.map((e) => [e.eventId, e.daysUntil])).toEqual([
      ['now', 1],
      ['soon', 3],
    ])
  })
})

const plan = (over: Partial<OpsPlan> = {}): OpsPlan => ({
  package_ids: [],
  requirements: { guests: 40 },
  deadlines: [],
  shopping_list: [],
  packing_list: [],
  checklists: [],
  needs_review: false,
  change_log: [],
  created_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

const item = (checked: boolean, resource_id = 'r1') => ({ resource_id, name: 'Cups', qty: 2, checked })

describe('agendaOpsOf', () => {
  it('a missing plan carries only hasPlan:false — no readiness, no packed count', () => {
    expect(agendaOpsOf(null, '2026-08-08', today)).toEqual({ hasPlan: false })
  })

  it('packed counts load lists only, while readiness spans deadlines and checklists too', () => {
    const ops = agendaOpsOf(
      plan({
        deadlines: [{ id: 'd1', label: 'Order ice', due: '2026-08-01', done: false }],
        shopping_list: [item(true, 's1'), item(false, 's2')],
        packing_list: [item(true, 'p1')],
        checklists: [{ id: 'c1', name: 'Prep', phase: 'setup', steps: [{ text: 'Load van', evidence: 'none', done: true }] }],
      }),
      '2026-08-08',
      today
    )
    expect(ops.hasPlan).toBe(true)
    // Physical load count: shopping + packing only (2 of 3).
    expect(ops.packed).toEqual({ done: 2, total: 3 })
    // Readiness: deadline (undone) + 3 list items (2 done) + 1 step (done) = 3/5, one overdue.
    expect(ops.readiness).toMatchObject({ done: 3, total: 5, pct: 60, overdue: 1, days_until: 3 })
  })
})

describe('attachAgendaOps', () => {
  it('attaches by eventId to every occurrence and leaves unread events without a claim', () => {
    const agenda = buildAgenda(
      [
        ev({ id: 'multi', event_start: '2026-08-05', event_end: '2026-08-06' }),
        ev({ id: 'other', slug: 'other', event_start: '2026-08-07', event_end: '2026-08-07' }),
      ],
      today
    )
    const enriched = attachAgendaOps(agenda, { multi: { hasPlan: false } })
    expect(enriched.today[0].ops).toEqual({ hasPlan: false })
    const multiUpcoming = enriched.upcoming.find((e) => e.eventId === 'multi')
    expect(multiUpcoming?.ops).toEqual({ hasPlan: false })
    const other = enriched.upcoming.find((e) => e.eventId === 'other')
    expect(other?.ops).toBeUndefined()
    expect(other && 'ops' in other).toBe(false)
  })
})
