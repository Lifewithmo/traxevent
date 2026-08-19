import { describe, it, expect } from 'vitest'
import {
  selectHorizonWindow,
  selectReadinessHorizon,
  HORIZON_CAP,
  type HorizonRow,
} from '@/lib/ops/readiness-horizon'
import type { Event, OpsPlan } from '@/lib/types'

const TODAY = '2026-08-10'

let seq = 0
function event(overrides: Partial<Event> = {}): Event {
  seq += 1
  const id = overrides.id ?? `e${seq}`
  return {
    id,
    name: `Event ${id}`,
    slug: `event-${id}`,
    year: 2026,
    status: 'active',
    event_type_id: 'general',
    event_start: '2026-08-15',
    event_end: '2026-08-15',
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

/** A plan where everything is DONE unless overridden — lets each test flip one thing. */
function plan(overrides: Partial<OpsPlan> = {}): OpsPlan {
  return {
    package_ids: ['p1'],
    requirements: { guests: 50 },
    deadlines: [{ id: 'd1', label: 'Order beans', due: '2026-08-20', done: true }],
    shopping_list: [{ resource_id: 'r1', name: 'Beans', qty: 38, checked: true }],
    packing_list: [{ resource_id: 'r2', name: 'Machine', qty: 1, checked: true }],
    checklists: [{
      id: 'c1', name: 'Prep', phase: 'prep',
      steps: [{ text: 'a', evidence: 'none', done: true }],
    }],
    needs_review: false,
    change_log: [],
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const plans = (entries: [string, OpsPlan | null][]) => new Map<string, OpsPlan | null>(entries)

describe('selectHorizonWindow', () => {
  it('keeps events from today through today+14 inclusive, drops past and beyond', () => {
    const inToday = event({ id: 'a', event_start: '2026-08-10' })
    const inEdge = event({ id: 'b', event_start: '2026-08-24' }) // today+14
    const past = event({ id: 'c', event_start: '2026-08-09' })
    const beyond = event({ id: 'd', event_start: '2026-08-25' }) // today+15
    const ids = selectHorizonWindow([past, beyond, inEdge, inToday], TODAY).map((e) => e.id)
    expect(ids).toEqual(['a', 'b'])
  })

  it('drops archived events and market days (no ops plan to radar)', () => {
    const job = event({ id: 'a' })
    const archived = event({ id: 'b', status: 'archived' })
    const market = event({ id: 'c', kind: 'market_day' })
    const explicitJob = event({ id: 'd', kind: 'client_job' })
    const ids = selectHorizonWindow([job, archived, market, explicitJob], TODAY).map((e) => e.id)
    expect(ids).toEqual(['a', 'd'])
  })

  it('sorts soonest first and caps at HORIZON_CAP', () => {
    const many = Array.from({ length: HORIZON_CAP + 2 }, (_, i) =>
      event({ id: `e${i}`, event_start: `2026-08-${String(23 - i).padStart(2, '0')}` })
    )
    const windowed = selectHorizonWindow(many, TODAY)
    expect(windowed).toHaveLength(HORIZON_CAP)
    // Soonest 12 of the 14 dates survive; the two latest (08-22, 08-23) are cut.
    expect(windowed[0].event_start).toBe('2026-08-10')
    expect(windowed[windowed.length - 1].event_start).toBe('2026-08-21')
  })

  it('handles full ISO event_start values by comparing the date part', () => {
    const iso = event({ id: 'a', event_start: '2026-08-10T09:00:00.000Z' })
    expect(selectHorizonWindow([iso], TODAY).map((e) => e.id)).toEqual(['a'])
  })
})

describe('selectReadinessHorizon — no-plan rows', () => {
  it('renders a missing plan as the "No ops plan yet" row', () => {
    const e = event({ id: 'a', event_start: '2026-08-15' })
    const rows = selectReadinessHorizon([e], plans([]), TODAY)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('no_plan')
    expect(rows[0].signals).toEqual([{ text: 'No ops plan yet', tone: 'alert' }])
  })

  it('treats an explicit null plan entry the same as an absent one', () => {
    const e = event({ id: 'a' })
    const rows = selectReadinessHorizon([e], plans([['a', null]]), TODAY)
    expect(rows[0].kind).toBe('no_plan')
  })

  it('is alert inside 7 days, pending beyond', () => {
    const near = event({ id: 'a', event_start: '2026-08-17' })  // T-7
    const far = event({ id: 'b', event_start: '2026-08-18' })   // T-8
    const rows = selectReadinessHorizon([near, far], plans([]), TODAY)
    expect(rows.find((r) => r.event_id === 'a')!.signals[0].tone).toBe('alert')
    expect(rows.find((r) => r.event_id === 'b')!.signals[0].tone).toBe('pending')
  })

  it('outranks every plan-backed row, even one with overdue deadlines', () => {
    const noPlan = event({ id: 'a', event_start: '2026-08-23' }) // 13d out, still first
    const overdue = event({ id: 'b', event_start: '2026-08-11' })
    const rows = selectReadinessHorizon(
      [overdue, noPlan],
      plans([['b', plan({ deadlines: [{ id: 'd1', label: 'x', due: '2026-08-01', done: false }] })]]),
      TODAY,
    )
    expect(rows.map((r) => r.event_id)).toEqual(['a', 'b'])
  })

  it('ranks multiple no-plan rows by T-minus', () => {
    const far = event({ id: 'a', event_start: '2026-08-20' })
    const near = event({ id: 'b', event_start: '2026-08-12' })
    const rows = selectReadinessHorizon([far, near], plans([]), TODAY)
    expect(rows.map((r) => r.event_id)).toEqual(['b', 'a'])
  })
})

describe('selectReadinessHorizon — plan-backed rows', () => {
  it('excludes a ready plan (nothing overdue, 100%) — ready earns its absence', () => {
    const e = event({ id: 'a' })
    const rows = selectReadinessHorizon([e], plans([['a', plan()]]), TODAY)
    expect(rows).toEqual([])
  })

  it('excludes a plan with nothing trackable (computeReadiness reads it as 100%)', () => {
    const e = event({ id: 'a' })
    const empty = plan({ deadlines: [], shopping_list: [], packing_list: [], checklists: [] })
    expect(selectReadinessHorizon([e], plans([['a', empty]]), TODAY)).toEqual([])
  })

  it('includes an overdue plan and leads with the overdue signal', () => {
    const e = event({ id: 'a' })
    const p = plan({
      deadlines: [
        { id: 'd1', label: 'x', due: '2026-08-01', done: false },
        { id: 'd2', label: 'y', due: '2026-08-05', done: false },
      ],
    })
    const rows = selectReadinessHorizon([e], plans([['a', p]]), TODAY)
    expect(rows[0].kind).toBe('not_ready')
    expect(rows[0].overdue).toBe(2)
    expect(rows[0].signals[0]).toEqual({ text: '2 overdue', tone: 'alert' })
  })

  it('names load-list progress with its numbers, never a bare count', () => {
    const e = event({ id: 'a' })
    const p = plan({
      shopping_list: [
        { resource_id: 'r1', name: 'Beans', qty: 38, checked: true },
        { resource_id: 'r2', name: 'Cups', qty: 100, checked: false },
      ],
      packing_list: [{ resource_id: 'r3', name: 'Machine', qty: 1, checked: false }],
    })
    const rows = selectReadinessHorizon([e], plans([['a', p]]), TODAY)
    expect(rows[0].signals).toEqual([{ text: 'Load list 1/3', tone: 'pending' }])
  })

  it('calls an empty load list unbuilt', () => {
    const e = event({ id: 'a' })
    const p = plan({
      shopping_list: [],
      packing_list: [],
      checklists: [{
        id: 'c1', name: 'Prep', phase: 'prep',
        steps: [{ text: 'a', evidence: 'none', done: false }, { text: 'b', evidence: 'none', done: false }],
      }],
    })
    const rows = selectReadinessHorizon([e], plans([['a', p]]), TODAY)
    expect(rows[0].signals).toEqual([
      { text: 'Load list unbuilt', tone: 'pending' },
      { text: 'Checklists 0/2', tone: 'pending' },
    ])
  })

  it('surfaces a still-open (not overdue) deadline when nothing else is undone', () => {
    const e = event({ id: 'a' })
    const p = plan({ deadlines: [{ id: 'd1', label: 'x', due: '2026-08-20', done: false }] })
    const rows = selectReadinessHorizon([e], plans([['a', p]]), TODAY)
    expect(rows[0].signals).toEqual([{ text: '1 deadline open', tone: 'pending' }])
  })

  it('caps signals at two, most important first', () => {
    const e = event({ id: 'a' })
    const p = plan({
      deadlines: [{ id: 'd1', label: 'x', due: '2026-08-01', done: false }],
      shopping_list: [],
      packing_list: [],
      checklists: [{
        id: 'c1', name: 'Prep', phase: 'prep',
        steps: [{ text: 'a', evidence: 'none', done: false }],
      }],
    })
    const rows = selectReadinessHorizon([e], plans([['a', p]]), TODAY)
    expect(rows[0].signals).toEqual([
      { text: '1 overdue', tone: 'alert' },
      { text: 'Load list unbuilt', tone: 'pending' },
    ])
  })

  it('ranks by overdue desc, then days_until asc, then name', () => {
    const worst = event({ id: 'a', name: 'A', event_start: '2026-08-20' })
    const sooner = event({ id: 'b', name: 'B', event_start: '2026-08-11' })
    const later = event({ id: 'c', name: 'C', event_start: '2026-08-18' })
    const overduePlan = plan({
      deadlines: [
        { id: 'd1', label: 'x', due: '2026-08-01', done: false },
        { id: 'd2', label: 'y', due: '2026-08-02', done: false },
      ],
    })
    const laggingPlan = plan({
      shopping_list: [{ resource_id: 'r1', name: 'Beans', qty: 1, checked: false }],
    })
    const rows = selectReadinessHorizon(
      [later, worst, sooner],
      plans([['a', overduePlan], ['b', laggingPlan], ['c', laggingPlan]]),
      TODAY,
    )
    // a: 2 overdue beats both; b vs c: same overdue (0), sooner date wins.
    expect(rows.map((r) => r.event_id)).toEqual(['a', 'b', 'c'])
  })

  it('breaks full ties by name so the order is stable', () => {
    const zeta = event({ id: 'a', name: 'Zeta', event_start: '2026-08-15' })
    const alpha = event({ id: 'b', name: 'Alpha', event_start: '2026-08-15' })
    const lagging = plan({ shopping_list: [{ resource_id: 'r1', name: 'Beans', qty: 1, checked: false }] })
    const rows = selectReadinessHorizon([zeta, alpha], plans([['a', lagging], ['b', lagging]]), TODAY)
    expect(rows.map((r) => r.name)).toEqual(['Alpha', 'Zeta'])
  })
})

describe('selectReadinessHorizon — labels and windowing', () => {
  it('labels T-minus in operator words: Today / Tomorrow / Nd out', () => {
    const t0 = event({ id: 'a', event_start: '2026-08-10' })
    const t1 = event({ id: 'b', event_start: '2026-08-11' })
    const t5 = event({ id: 'c', event_start: '2026-08-15' })
    const rows = selectReadinessHorizon([t0, t1, t5], plans([]), TODAY)
    const byId = new Map(rows.map((r) => [r.event_id, r]))
    expect(byId.get('a')!.days_label).toBe('Today')
    expect(byId.get('a')!.days_until).toBe(0)
    expect(byId.get('b')!.days_label).toBe('Tomorrow')
    expect(byId.get('c')!.days_label).toBe('5d out')
  })

  it('applies the window itself — out-of-window events never produce rows even with plan entries', () => {
    const beyond = event({ id: 'a', event_start: '2026-08-25' })
    const market = event({ id: 'b', kind: 'market_day' })
    const rows = selectReadinessHorizon([beyond, market], plans([['a', null], ['b', null]]), TODAY)
    expect(rows).toEqual([])
  })

  it('carries name, slug, and the date part of event_start in the row payload', () => {
    const e = event({ id: 'a', name: 'Basque wedding', slug: 'basque-wedding', event_start: '2026-08-15T00:00:00.000Z' })
    const rows = selectReadinessHorizon([e], plans([]), TODAY)
    expect(rows[0]).toMatchObject({
      event_id: 'a',
      name: 'Basque wedding',
      slug: 'basque-wedding',
      event_start: '2026-08-15',
    })
  })

  it('returns HorizonRow shapes consumable without the events array', () => {
    const e = event({ id: 'a' })
    const rows: HorizonRow[] = selectReadinessHorizon([e], plans([]), TODAY)
    expect(rows[0].signals.length).toBeGreaterThan(0)
    expect(rows[0].signals.length).toBeLessThanOrEqual(2)
  })
})
