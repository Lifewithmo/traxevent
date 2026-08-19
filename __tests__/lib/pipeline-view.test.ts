import { describe, it, expect } from 'vitest'
import { buildPipelineRows, countdownLabel, closedThisMonth, conflictEventDates, radarConflictOpts, DEFAULT_PREP_LEAD_DAYS } from '@/lib/pipeline-view'
import { DUE_TONE } from '@/lib/pipeline-presentation'
import { wonValueInMonth } from '@/lib/pipeline-stats'
import type { Lead, Task, Proposal, CapacityUnit } from '@/lib/types'
import type { CapacityDay } from '@/lib/capacity/capacity'

const today = '2026-08-07'
const lead = (over: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Dana', stage: 'consultation', created_at: '2026-07-01T00:00:00.000Z', ...over,
} as Lead)
const task = (over: Partial<Task>): Task => ({
  id: 't1', lead_id: 'l1', title: 'Site visit', done: false, created_at: '2026-08-01T00:00:00.000Z', ...over,
} as Task)

describe('countdownLabel', () => {
  it('labels today, future, and overdue', () => {
    expect(countdownLabel('2026-08-07', today).text).toBe('Today')
    expect(countdownLabel('2026-08-09', today).text).toBe('in 2 days')
    expect(countdownLabel('2026-08-05', today).text).toBe('2 days overdue')
  })

  /*
    LITERALS, not `DUE_TONE.overdue`. Asserting against the same map the
    implementation indexes (`DUE_TONE[dueStatus(...)]`) pins the ROUTING and
    nothing else: flip DUE_TONE.overdue from 'alert' to 'neutral' and overdue
    red dies on BOTH Pipeline surfaces with the whole suite still green. This is
    where the colour decision lives, so this is where the colour is nailed down.
  */
  it('paints overdue alert, today pending, and upcoming neutral', () => {
    expect(countdownLabel('2026-08-05', today).tone).toBe('alert')
    expect(countdownLabel('2026-08-07', today).tone).toBe('pending')
    expect(countdownLabel('2026-08-09', today).tone).toBe('neutral')
  })

  it('keeps DUE_TONE as the single source those tones come from', () => {
    expect(countdownLabel('2026-08-05', today).tone).toBe(DUE_TONE.overdue)
    expect(countdownLabel('2026-08-07', today).tone).toBe(DUE_TONE.today)
    expect(countdownLabel('2026-08-09', today).tone).toBe(DUE_TONE.upcoming)
  })

  it('keeps the singular day form', () => {
    expect(countdownLabel('2026-08-08', today).text).toBe('in 1 day')
    expect(countdownLabel('2026-08-06', today).text).toBe('1 day overdue')
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
    // One date format across the module — `shortDate`, never a raw ISO ymd two
    // lines under a board card's `shortDate(event_date)` subtitle.
    expect(g.waiting[0].statusLine).toBe('Waiting on them — PO number · follow up Aug 9, 2026')
    expect(g.waiting[0].countdown).toEqual({ text: 'in 2 days', tone: DUE_TONE.upcoming })
  })
  it('builds active rows from the next task and sorts groups oldest-touch first', () => {
    const g = buildPipelineRows([
      { lead: lead({ id: 'newer', last_touch_at: '2026-08-06T00:00:00.000Z' }),
        tasks: [task({ due_date: '2026-08-11' })], proposals: [] },
      { lead: lead({ id: 'older', last_touch_at: '2026-08-01T00:00:00.000Z' }),
        tasks: [task({ title: 'Send options', due_date: '2026-08-07' })], proposals: [] },
    ], today)
    expect(g.active.map((r) => r.lead.id)).toEqual(['older', 'newer'])
    expect(g.active[0].statusLine).toBe('Next: Send options · due Aug 7, 2026')
    expect(g.active[0].countdown).toEqual({ text: 'Today', tone: DUE_TONE.today })
    expect(g.active[1].countdown).toEqual({ text: 'in 4 days', tone: DUE_TONE.upcoming })
  })
  it('excludes closed leads', () => {
    const g = buildPipelineRows([{ lead: lead({ stage: 'closed_won' }), tasks: [], proposals: [] }], today)
    expect(g.needs_attention.length + g.waiting.length + g.active.length).toBe(0)
  })
})

describe('buildPipelineRows — book-by radar', () => {
  const nod = (over: Partial<Lead>) => ({ lead: lead(over), tasks: [], proposals: [] })

  it('derives book-by = event − DEFAULT_PREP_LEAD_DAYS and signed days-to-book-by (no opts)', () => {
    expect(DEFAULT_PREP_LEAD_DAYS).toBe(14)
    const g = buildPipelineRows([nod({ event_date: '2026-08-22' })], today)
    const r = g.needs_attention[0]
    expect(r.eventDate).toBe('2026-08-22')
    expect(r.bookByDate).toBe('2026-08-08')       // 2026-08-22 minus 14 days
    expect(r.daysToBookBy).toBe(1)                 // today 2026-08-07 → 2026-08-08
  })

  it('reports a past-due book-by as a negative day count', () => {
    // event already inside the prep window: book-by was 2026-08-04, three days ago.
    const g = buildPipelineRows([nod({ event_date: '2026-08-18' })], today)
    expect(g.needs_attention[0].bookByDate).toBe('2026-08-04')
    expect(g.needs_attention[0].daysToBookBy).toBe(-3)
  })

  it('honours a custom prepLeadDays', () => {
    const g = buildPipelineRows([nod({ event_date: '2026-08-22' })], today, { prepLeadDays: 30 })
    expect(g.needs_attention[0].bookByDate).toBe('2026-07-23')
  })

  it('ranks the sooner event first even when its touch is newer (book-by beats staleness)', () => {
    const g = buildPipelineRows([
      // 9 months out, but the STALER touch — old sort would float this to the top.
      nod({ id: 'far', event_date: '2027-05-07', last_touch_at: '2026-07-01T00:00:00.000Z' }),
      // 8 days out, fresher touch — must still win on the imminent deadline.
      nod({ id: 'soon', event_date: '2026-08-15', last_touch_at: '2026-08-06T00:00:00.000Z' }),
    ], today)
    expect(g.needs_attention.map((r) => r.lead.id)).toEqual(['soon', 'far'])
  })

  it('sorts no-date rows to the tail behind every dated row', () => {
    const g = buildPipelineRows([
      nod({ id: 'nodate' }),
      nod({ id: 'dated', event_date: '2027-01-01' }),
    ], today)
    expect(g.needs_attention.map((r) => r.lead.id)).toEqual(['dated', 'nodate'])
    expect(g.needs_attention[1].bookByDate).toBeUndefined()
    expect(g.needs_attention[1].daysToBookBy).toBeUndefined()
    expect(g.needs_attention[1].conflict).toBe(false)
  })

  it('flags conflict rows and floats them above a sooner non-conflicting deadline', () => {
    const conflictDates = new Set(['2026-08-20'])
    const g = buildPipelineRows([
      // sooner book-by, but no conflict — must yield to the two conflicting rows.
      nod({ id: 'sooner', event_date: '2026-08-12' }),
      nod({ id: 'confA', event_date: '2026-08-20' }),
      nod({ id: 'confB', event_date: '2026-08-20' }),
    ], today, { conflictDates })
    const order = g.needs_attention.map((r) => r.lead.id)
    expect(order.slice(0, 2).sort()).toEqual(['confA', 'confB'])
    expect(order[2]).toBe('sooner')
    expect(g.needs_attention.find((r) => r.lead.id === 'confA')!.conflict).toBe(true)
    expect(g.needs_attention.find((r) => r.lead.id === 'sooner')!.conflict).toBe(false)
  })
})

describe('buildPipelineRows — capacity mode (Task 3)', () => {
  const nod = (over: Partial<Lead>) => ({ lead: lead(over), tasks: [], proposals: [] })
  const day = (date: string, over: boolean): CapacityDay => ({
    date,
    over,
    detail: [
      { kind: 'mobile', demand: over ? 4 : 3, supply: 3 },
      { kind: 'venue', demand: 0, supply: 2 },
    ],
    clashes: [],
  })

  it('drives conflict + overCapacity from capacityByDate, not conflictDates', () => {
    const capacityByDate = new Map<string, CapacityDay>([
      ['2026-08-20', day('2026-08-20', true)],
      ['2026-08-12', day('2026-08-12', false)],
    ])
    const g = buildPipelineRows([
      nod({ id: 'over', event_date: '2026-08-20' }),
      nod({ id: 'ok', event_date: '2026-08-12' }),
    ], today, { capacityByDate })

    const over = g.needs_attention.find((r) => r.lead.id === 'over')!
    const ok = g.needs_attention.find((r) => r.lead.id === 'ok')!
    expect(over.conflict).toBe(true)
    expect(over.overCapacity?.over).toBe(true)
    expect(over.overCapacity).toBe(capacityByDate.get('2026-08-20'))
    expect(ok.conflict).toBe(false)
    expect(ok.overCapacity?.over).toBe(false)
  })

  it('floats an over-capacity row above a sooner non-over deadline (conflict-first sort)', () => {
    const capacityByDate = new Map<string, CapacityDay>([
      ['2026-08-20', day('2026-08-20', true)],
    ])
    const g = buildPipelineRows([
      // sooner book-by, but under capacity — must yield to the over-capacity row.
      nod({ id: 'sooner', event_date: '2026-08-12' }),
      nod({ id: 'over', event_date: '2026-08-20' }),
    ], today, { capacityByDate })
    expect(g.needs_attention.map((r) => r.lead.id)).toEqual(['over', 'sooner'])
  })

  it('ignores conflictDates entirely when capacityByDate is present (capacity mode wins)', () => {
    // conflictDates would mark 2026-08-12 as a conflict under increment-1 rules,
    // but capacity mode is authoritative: that date is under capacity, so no conflict.
    const capacityByDate = new Map<string, CapacityDay>([
      ['2026-08-12', day('2026-08-12', false)],
    ])
    const conflictDates = new Set(['2026-08-12'])
    const g = buildPipelineRows([
      nod({ id: 'ok', event_date: '2026-08-12' }),
    ], today, { capacityByDate, conflictDates })
    expect(g.needs_attention[0].conflict).toBe(false)
    expect(g.needs_attention[0].overCapacity?.over).toBe(false)
  })

  it('leaves overCapacity undefined for a row whose date has no capacity entry', () => {
    const capacityByDate = new Map<string, CapacityDay>([
      ['2026-08-20', day('2026-08-20', true)],
    ])
    const g = buildPipelineRows([
      nod({ id: 'unmapped', event_date: '2027-01-01' }),
    ], today, { capacityByDate })
    expect(g.needs_attention[0].overCapacity).toBeUndefined()
    expect(g.needs_attention[0].conflict).toBe(false)
  })
})

describe('buildPipelineRows — capacity mode clash float-up (Task 2)', () => {
  const nod = (over: Partial<Lead>) => ({ lead: lead(over), tasks: [], proposals: [] })
  // A day UNDER capacity (over:false) that nonetheless carries a unit clash on 'k1'.
  const clashDay = (date: string): CapacityDay => ({
    date,
    over: false,
    detail: [
      { kind: 'mobile', demand: 2, supply: 3 },
      { kind: 'venue', demand: 0, supply: 2 },
    ],
    clashes: [{ unitId: 'k1', unitName: 'Kart 1', kind: 'mobile', count: 2 }],
  })

  it('marks a clash-only row (over:false) as conflict:true when it owns the clashing unit', () => {
    const capacityByDate = new Map<string, CapacityDay>([['2026-08-20', clashDay('2026-08-20')]])
    const g = buildPipelineRows([
      nod({ id: 'owner', event_date: '2026-08-20', assigned_units: { mobile: 'k1' } }),
    ], today, { capacityByDate })
    const owner = g.needs_attention.find((r) => r.lead.id === 'owner')!
    expect(owner.conflict).toBe(true)
    expect(owner.overCapacity?.over).toBe(false) // the day itself is NOT over — clash alone floated it
  })

  it('leaves a same-day non-owner row (over:false, not assigned to the clashing unit) conflict:false', () => {
    const capacityByDate = new Map<string, CapacityDay>([['2026-08-20', clashDay('2026-08-20')]])
    const g = buildPipelineRows([
      nod({ id: 'other', event_date: '2026-08-20', assigned_units: { mobile: 'k2' } }),
      nod({ id: 'unassigned', event_date: '2026-08-20' }),
    ], today, { capacityByDate })
    expect(g.needs_attention.find((r) => r.lead.id === 'other')!.conflict).toBe(false)
    expect(g.needs_attention.find((r) => r.lead.id === 'unassigned')!.conflict).toBe(false)
  })

  it('floats a clash-only row above a sooner non-conflicting deadline (conflict-first sort)', () => {
    const capacityByDate = new Map<string, CapacityDay>([['2026-08-20', clashDay('2026-08-20')]])
    const g = buildPipelineRows([
      // sooner book-by, under capacity, no clash — must yield to the clashing row.
      nod({ id: 'sooner', event_date: '2026-08-12' }),
      nod({ id: 'owner', event_date: '2026-08-20', assigned_units: { mobile: 'k1' } }),
    ], today, { capacityByDate })
    expect(g.needs_attention.map((r) => r.lead.id)).toEqual(['owner', 'sooner'])
  })
})

describe('buildPipelineRows — backstop regression (no capacityByDate ⇒ increment 1)', () => {
  const nod = (over: Partial<Lead>) => ({ lead: lead(over), tasks: [], proposals: [] })

  /*
    THE BACKSTOP. With NO capacityByDate, buildPipelineRows must produce exactly
    increment 1's output: conflict is driven by conflictDates, overCapacity is
    never set, and the conflict-first + book-by ordering is unchanged. This pins
    the base/solo path byte-for-byte so the capacity branch can never leak into it.
  */
  it('reproduces increment-1 conflict flags, ordering, and no overCapacity', () => {
    const conflictDates = new Set(['2026-08-20'])
    const g = buildPipelineRows([
      nod({ id: 'sooner', event_date: '2026-08-12' }),
      nod({ id: 'confA', event_date: '2026-08-20' }),
      nod({ id: 'confB', event_date: '2026-08-20' }),
      nod({ id: 'nodate' }),
    ], today, { conflictDates })

    const order = g.needs_attention.map((r) => r.lead.id)
    // conflicts first (either interleave), then the sooner non-conflict, then no-date tail.
    expect(order.slice(0, 2).sort()).toEqual(['confA', 'confB'])
    expect(order[2]).toBe('sooner')
    expect(order[3]).toBe('nodate')

    expect(g.needs_attention.find((r) => r.lead.id === 'confA')!.conflict).toBe(true)
    expect(g.needs_attention.find((r) => r.lead.id === 'sooner')!.conflict).toBe(false)
    expect(g.needs_attention.find((r) => r.lead.id === 'nodate')!.conflict).toBe(false)
    // overCapacity is never populated on the backstop path.
    for (const r of g.needs_attention) expect(r.overCapacity).toBeUndefined()
  })
})

describe('radarConflictOpts — the backstop gate (Task 3 wiring)', () => {
  const capUnit = (over: Partial<CapacityUnit> & { kind: CapacityUnit['kind'] }): CapacityUnit => ({
    id: 'u1', name: 'Kart', active: true, blockouts: [], created_at: '2026-01-01T00:00:00.000Z', ...over,
  })
  // A lone dated bookable lead — under increment 1 this is NEVER a conflict
  // (needs ≥2 on a date). It is the exact input a zero-supply capacity engine
  // would wrongly flag `over`, so it's the probe for the backstop.
  const loneLead = [lead({ id: 'solo', stage: 'inquiry', event_date: '2026-09-05' })]

  it('a business org with ZERO units falls back to conflictDates — a lone dated lead is NOT flagged', () => {
    const opts = radarConflictOpts({ plan: 'business' }, loneLead, [])
    // fallback path: conflictDates present, capacity engine NOT consulted
    expect('capacityByDate' in opts).toBe(false)
    expect('conflictDates' in opts).toBe(true)
    const conflictDates = (opts as { conflictDates: Set<string> }).conflictDates
    expect(conflictDates.has('2026-09-05')).toBe(false) // lone lead ⇒ no conflict
    // and threaded through buildPipelineRows the row is not a conflict and has no overCapacity
    const g = buildPipelineRows([{ lead: loneLead[0], tasks: [], proposals: [] }], today, opts)
    expect(g.needs_attention[0].conflict).toBe(false)
    expect(g.needs_attention[0].overCapacity).toBeUndefined()
  })

  it('a business org with ZERO units still surfaces increment-1 conflicts (≥2 on a date)', () => {
    const two = [
      lead({ id: 'a', stage: 'inquiry', event_date: '2026-09-05' }),
      lead({ id: 'b', stage: 'proposal', event_date: '2026-09-05' }),
    ]
    const opts = radarConflictOpts({ plan: 'business' }, two, [])
    expect('conflictDates' in opts).toBe(true)
    expect((opts as { conflictDates: Set<string> }).conflictDates.has('2026-09-05')).toBe(true)
  })

  it('a base/standard org never enters capacity mode even if units are somehow present', () => {
    const opts = radarConflictOpts({ plan: 'standard' }, loneLead, [capUnit({ kind: 'mobile' })])
    expect('capacityByDate' in opts).toBe(false)
    expect('conflictDates' in opts).toBe(true)
  })

  it('a business org WITH ≥1 unit enters capacity mode (engine consulted)', () => {
    const opts = radarConflictOpts({ plan: 'business' }, loneLead, [capUnit({ kind: 'mobile' })])
    expect('capacityByDate' in opts).toBe(true)
    expect('conflictDates' in opts).toBe(false)
    const map = (opts as { capacityByDate: Map<string, CapacityDay> }).capacityByDate
    // 1 bookable lead, 1 mobile unit ⇒ demand 1 ≤ supply 1 ⇒ NOT over
    expect(map.get('2026-09-05')!.over).toBe(false)
  })
})

describe('conflictEventDates', () => {
  it('flags a date carried by two open leads', () => {
    const s = conflictEventDates([
      lead({ id: 'a', stage: 'inquiry', event_date: '2026-09-01' }),
      lead({ id: 'b', stage: 'proposal', event_date: '2026-09-01' }),
    ])
    expect(s.has('2026-09-01')).toBe(true)
    expect(s.size).toBe(1)
  })

  it('counts a closed_won job as occupying its date — an open opp that day conflicts', () => {
    const s = conflictEventDates([
      lead({ id: 'won', stage: 'closed_won', event_date: '2026-09-01' }),
      lead({ id: 'open', stage: 'consultation', event_date: '2026-09-01' }),
    ])
    expect(s.has('2026-09-01')).toBe(true)
    // and the open row learns of it through buildPipelineRows
    const g = buildPipelineRows([{ lead: lead({ id: 'open', stage: 'consultation', event_date: '2026-09-01' }), tasks: [], proposals: [] }], today, { conflictDates: s })
    expect(g.needs_attention[0].conflict).toBe(true)
  })

  it('ignores closed_lost — a dead deal does not block a date', () => {
    const s = conflictEventDates([
      lead({ id: 'lost', stage: 'closed_lost', event_date: '2026-09-01' }),
      lead({ id: 'open', stage: 'consultation', event_date: '2026-09-01' }),
    ])
    expect(s.has('2026-09-01')).toBe(false)
  })

  it('does not flag distinct dates or a lone lead, and skips no-date leads', () => {
    const s = conflictEventDates([
      lead({ id: 'a', stage: 'inquiry', event_date: '2026-09-01' }),
      lead({ id: 'b', stage: 'inquiry', event_date: '2026-09-02' }),
      lead({ id: 'c', stage: 'inquiry' }),
      lead({ id: 'd', stage: 'inquiry' }),
    ])
    expect(s.size).toBe(0)
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

  /*
    THE DUPLICATE-FIGURE PROOF. `monthly.wonValue`/`wonCount` and the KPI band's
    "Booked this month" are the SAME CALL: leads/page.tsx:57 computes
    `bookedThisMonth: wonValueInMonth(leads, ym)` with `ym = today.slice(0,7)`,
    and closedThisMonth does `wonValueInMonth(leads, today.slice(0,7))`. Same
    function, same arguments, same number — so ClosedMonthSummary must NEVER
    render the won side as a figure, or /leads shows one number twice at the
    same 20px money weight. This test is the reason the won tile is gone; if it
    ever stops holding, the won side becomes renderable again.
  */
  it('produces the identical won figure the KPI band already renders', () => {
    const leads = [
      lead({ id: 'w1', stage: 'closed_won', closed_at: '2026-08-02T00:00:00.000Z', estimated_value: 1000 }),
      lead({ id: 'w2', stage: 'closed_won', closed_at: '2026-08-19T00:00:00.000Z', estimated_value: 5300 }),
      lead({ id: 'x1', stage: 'closed_lost', closed_at: '2026-08-05T00:00:00.000Z', estimated_value: 800 }),
    ]
    const band = wonValueInMonth(leads, today.slice(0, 7))
    const summary = closedThisMonth(leads, today)
    expect(summary.wonValue).toBe(band.value)
    expect(summary.wonCount).toBe(band.count)
  })
})
