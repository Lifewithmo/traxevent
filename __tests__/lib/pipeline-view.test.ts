import { describe, it, expect } from 'vitest'
import { buildPipelineRows, countdownLabel, closedThisMonth, conflictEventDates, DEFAULT_PREP_LEAD_DAYS } from '@/lib/pipeline-view'
import { DUE_TONE } from '@/lib/pipeline-presentation'
import { wonValueInMonth } from '@/lib/pipeline-stats'
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
