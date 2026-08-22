import { describe, it, expect } from 'vitest'
import { buildRunway, type RunwayInvoice } from '@/lib/calendar-cashflow'
import type { CalendarItem } from '@/lib/calendar'
import type { Event } from '@/lib/types'

const TODAY = new Date('2026-08-16T00:00:00.000Z')

const evt = (over: Partial<Event>): Event => ({
  id: 'e', name: 'Job', slug: 'job', year: 2026, status: 'active', event_type_id: 'et',
  event_start: '2026-08-22', event_end: '2026-08-22', created_at: '2026-08-01T00:00:00.000Z',
  ...over,
}) as Event

const due = (over: Partial<CalendarItem> & Pick<CalendarItem, 'id' | 'date' | 'leadId' | 'amount'>): CalendarItem => ({
  title: 'Invoice', kind: 'invoice_due', href: '/acme/leads/x', ...over,
})

/** A minimal invoice the balance helpers can actually evaluate. */
const inv = (o: {
  id: string
  lead_id: string
  lifecycle?: 'draft' | 'sent' | 'void'
  due_date?: string
  total?: number
  paid?: number
}): RunwayInvoice =>
  ({
    id: o.id,
    lead_id: o.lead_id,
    lifecycle: o.lifecycle ?? 'sent',
    due_date: o.due_date,
    line_items: o.total ? [{ id: 'li', description: 'work', quantity: 1, unit_price: o.total }] : [],
    payments: o.paid ? [{ id: 'p', amount: o.paid }] : [],
    credits: [],
  }) as unknown as RunwayInvoice

describe('buildRunway', () => {
  it('counts inflow only for receivables due on or before the booked job date', () => {
    const events = [evt({ id: 'j', name: 'Wedding', lead_id: 'L', event_start: '2026-08-22' })]
    const items = [
      due({ id: 'before', leadId: 'L', amount: 1000, date: '2026-08-20' }),
      due({ id: 'after', leadId: 'L', amount: 500, date: '2026-08-25' }),
    ]
    const runway = buildRunway(items, events, TODAY, [])
    expect(runway).toHaveLength(1)
    expect(runway[0]).toMatchObject({ eventId: 'j', title: 'Wedding', date: '2026-08-22', inflowBefore: 1000, dueAfter: 500 })
  })

  it('anchors a multi-event lead’s receivable to its nearest future event', () => {
    const events = [
      evt({ id: 'near', lead_id: 'L', event_start: '2026-08-22' }),
      evt({ id: 'far', lead_id: 'L', event_start: '2026-09-30' }),
    ]
    const items = [due({ id: 'inv', leadId: 'L', amount: 1000, date: '2026-08-20' })]
    const runway = buildRunway(items, events, TODAY, [])
    // ascending by event date
    expect(runway.map((r) => r.eventId)).toEqual(['near', 'far'])
    expect(runway.find((r) => r.eventId === 'near')!.inflowBefore).toBe(1000)
    expect(runway.find((r) => r.eventId === 'far')!.inflowBefore).toBe(0)
  })

  it('emits exactly the receivables-timing fields — never a revenue/profit field', () => {
    const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
    const items = [due({ id: 'inv', leadId: 'L', amount: 1000, date: '2026-08-20' })]
    const runway = buildRunway(items, events, TODAY, [])
    expect(Object.keys(runway[0])).toEqual([
      'eventId', 'title', 'date', 'inflowBefore', 'dueAfter', 'contributions', 'overdueBefore',
      'billing', 'untimedOwed', 'leadId', 'boothFee', 'carriedIn', 'cashIn', 'cumulative',
      'firstShortfall',
    ])
    // The one COST field here is an outflow. Nothing on this shape may name
    // revenue, booked value, margin or profit — this is not a P&L.
    const serialised = JSON.stringify(runway[0])
    expect(serialised).not.toMatch(/profit|margin|revenue|bookedValue|payment_amount|paymentAmount/i)
  })

  it('lists only upcoming booked jobs (future/today), skipping past and archived events', () => {
    const events = [
      evt({ id: 'past', event_start: '2026-08-10' }),
      evt({ id: 'today', event_start: '2026-08-16' }),
      evt({ id: 'future', event_start: '2026-09-01' }),
      evt({ id: 'archived', event_start: '2026-08-30', status: 'archived' }),
    ]
    expect(buildRunway([], events, TODAY, []).map((r) => r.eventId)).toEqual(['today', 'future'])
  })

  it('counts a receivable due exactly ON the job date as inflow before (boundary, pins the <=)', () => {
    const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
    const items = [due({ id: 'on-date', leadId: 'L', amount: 900, date: '2026-08-22' })] // due == event_start
    const runway = buildRunway(items, events, TODAY, [])
    expect(runway[0].inflowBefore).toBe(900)
    expect(runway[0].dueAfter).toBe(0)
  })

  it('picks the nearest future event as anchor even when events arrive far-first (pins the ordering)', () => {
    // far event listed BEFORE the near one — a naive "first match wins" resolver would anchor to 9/30
    const events = [
      evt({ id: 'far', lead_id: 'L', event_start: '2026-09-30' }),
      evt({ id: 'near', lead_id: 'L', event_start: '2026-08-22' }),
    ]
    const items = [due({ id: 'inv', leadId: 'L', amount: 1000, date: '2026-08-20' })]
    const runway = buildRunway(items, events, TODAY, [])
    expect(runway.find((r) => r.eventId === 'near')!.inflowBefore).toBe(1000)
    expect(runway.find((r) => r.eventId === 'far')!.inflowBefore).toBe(0)
  })

  it('still counts an overdue receivable as inflow before the job', () => {
    const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
    const items = [due({ id: 'overdue', leadId: 'L', amount: 700, date: '2026-08-05' })] // due before today
    expect(buildRunway(items, events, TODAY, [])[0].inflowBefore).toBe(700)
  })

  it('uses the LOCAL calendar date for "today", not the UTC date (Americas evening boundary)', () => {
    // A fake `now`: local components say the 16th, but toISOString() has already
    // rolled to the 17th (UTC) — exactly the several-hours-a-day window where an
    // Americas org would otherwise lose tonight's job off the runway.
    const now = {
      getFullYear: () => 2026,
      getMonth: () => 7, // August (0-based)
      getDate: () => 16,
      toISOString: () => '2026-08-17T02:00:00.000Z',
    } as unknown as Date
    const events = [evt({ id: 'tonight', event_start: '2026-08-16' })]
    // Local today (08-16) keeps the job upcoming; a UTC-derived today (08-17) would
    // treat it as past and drop it. Reverting to toISOString() breaks this.
    expect(buildRunway([], events, now, []).map((r) => r.eventId)).toEqual(['tonight'])
  })

  it('ignores non-invoice items, unlinked invoices, and invoices with no anchor event', () => {
    const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
    const items: CalendarItem[] = [
      { id: 'ev', title: 'x', date: '2026-08-22', kind: 'event', href: '/x', bookedValue: 9 },
      due({ id: 'no-lead', leadId: undefined, amount: 400, date: '2026-08-20' }),
      due({ id: 'other-lead', leadId: 'Z', amount: 400, date: '2026-08-20' }),
    ]
    expect(buildRunway(items, events, TODAY, [])[0]).toMatchObject({ inflowBefore: 0, dueAfter: 0 })
  })

  // ── The build-up: the evidence behind the number ───────────────────────────

  describe('contributions', () => {
    it('carries each contributing invoice through with its amount, due date and deep link', () => {
      const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
      const items = [
        due({ id: 'inv1', title: 'Deposit', leadId: 'L', amount: 1000, date: '2026-08-20', href: '/acme/leads/L' }),
        due({ id: 'inv2', title: 'Final', leadId: 'L', amount: 500, date: '2026-08-25', href: '/acme/leads/L' }),
      ]
      const [job] = buildRunway(items, events, TODAY, [])
      expect(job.contributions).toEqual([
        {
          invoiceId: 'inv1', title: 'Deposit', amount: 1000, dueDate: '2026-08-20',
          aging: 'current', overdue: false, timing: 'before',
          href: '/acme/leads/L/invoices/inv1',
        },
        {
          invoiceId: 'inv2', title: 'Final', amount: 500, dueDate: '2026-08-25',
          aging: 'current', overdue: false, timing: 'after',
          href: '/acme/leads/L/invoices/inv2',
        },
      ])
    })

    it('deep-links to the INVOICE record, not the opportunity the feed pointed at', () => {
      const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
      const items = [due({ id: 'inv1', leadId: 'L', amount: 100, date: '2026-08-20', href: '/acme/leads/L' })]
      const href = buildRunway(items, events, TODAY, [])[0].contributions[0].href
      // The real route: app/(admin)/[orgSlug]/leads/[leadId]/invoices/[invoiceId]
      expect(href).toBe('/acme/leads/L/invoices/inv1')
      expect(href).not.toBe('/acme/leads/L')
    })

    it('RECONCILES: the before contributions sum to inflowBefore and the after ones to dueAfter', () => {
      const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
      const items = [
        due({ id: 'a', leadId: 'L', amount: 1200.5, date: '2026-08-01' }),
        due({ id: 'b', leadId: 'L', amount: 340.25, date: '2026-08-22' }),
        due({ id: 'c', leadId: 'L', amount: 90.3, date: '2026-08-23' }),
        due({ id: 'd', leadId: 'L', amount: 10.7, date: '2026-09-01' }),
      ]
      const [job] = buildRunway(items, events, TODAY, [])
      const sum = (t: 'before' | 'after') =>
        Math.round(job.contributions.filter((c) => c.timing === t).reduce((s, c) => s + c.amount, 0) * 100) / 100
      expect(sum('before')).toBe(job.inflowBefore)
      expect(sum('after')).toBe(job.dueAfter)
      expect(job.inflowBefore).toBe(1540.75)
      expect(job.dueAfter).toBe(101)
    })

    it('orders the build-up before-then-after, each by due date', () => {
      const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
      const items = [
        due({ id: 'late', leadId: 'L', amount: 1, date: '2026-09-01' }),
        due({ id: 'second', leadId: 'L', amount: 1, date: '2026-08-20' }),
        due({ id: 'first', leadId: 'L', amount: 1, date: '2026-08-01' }),
      ]
      const [job] = buildRunway(items, events, TODAY, [])
      expect(job.contributions.map((c) => c.invoiceId)).toEqual(['first', 'second', 'late'])
    })

    it('marks an overdue contribution and rolls it up into overdueBefore', () => {
      const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
      const items = [
        due({ id: 'late', leadId: 'L', amount: 800, date: '2026-06-01' }), // ~76 days overdue
        due({ id: 'soon', leadId: 'L', amount: 200, date: '2026-08-20' }),
      ]
      const [job] = buildRunway(items, events, TODAY, [])
      expect(job.contributions.find((c) => c.invoiceId === 'late')).toMatchObject({ overdue: true, aging: 'd61_90' })
      expect(job.contributions.find((c) => c.invoiceId === 'soon')!.overdue).toBe(false)
      // the honest reading of "$1,000 expected": 80% of it is already late
      expect(job.overdueBefore).toBe(800)
      expect(job.inflowBefore).toBe(1000)
    })
  })

  // ── The honest zero ────────────────────────────────────────────────────────

  describe('billing state (why the number is zero)', () => {
    const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]

    it('reports COLLECTED when every invoice raised for the job is settled', () => {
      const invoices = [inv({ id: 'i1', lead_id: 'L', total: 2000, paid: 2000, due_date: '2026-08-01' })]
      const [job] = buildRunway([], events, TODAY, invoices)
      expect(job.billing).toBe('collected')
      expect(job.inflowBefore).toBe(0)
    })

    it('reports UNINVOICED — the opposite situation — when nothing has ever been raised', () => {
      const [job] = buildRunway([], events, TODAY, [])
      expect(job.billing).toBe('uninvoiced')
      expect(job.inflowBefore).toBe(0)
    })

    it('does not let a VOID invoice pass as billing the job', () => {
      const invoices = [inv({ id: 'i1', lead_id: 'L', lifecycle: 'void', total: 2000 })]
      expect(buildRunway([], events, TODAY, invoices)[0].billing).toBe('uninvoiced')
    })

    it('reports DRAFT when an invoice exists but has never been sent', () => {
      const invoices = [inv({ id: 'i1', lead_id: 'L', lifecycle: 'draft', total: 2000 })]
      expect(buildRunway([], events, TODAY, invoices)[0].billing).toBe('draft')
    })

    it('lets an unsent draft beat "collected" — it is still an action', () => {
      const invoices = [
        inv({ id: 'paid', lead_id: 'L', total: 1000, paid: 1000, due_date: '2026-08-01' }),
        inv({ id: 'never-sent', lead_id: 'L', lifecycle: 'draft', total: 500 }),
      ]
      expect(buildRunway([], events, TODAY, invoices)[0].billing).toBe('draft')
    })

    it('reports OUTSTANDING when a sent invoice still carries a balance', () => {
      const invoices = [inv({ id: 'i1', lead_id: 'L', total: 2000, paid: 500, due_date: '2026-08-20' })]
      const items = [due({ id: 'i1', leadId: 'L', amount: 1500, date: '2026-08-20' })]
      expect(buildRunway(items, events, TODAY, invoices)[0].billing).toBe('outstanding')
    })

    it('an invoice on ANOTHER lead never makes this job look billed', () => {
      const invoices = [inv({ id: 'i1', lead_id: 'OTHER', total: 2000, paid: 2000 })]
      expect(buildRunway([], events, TODAY, invoices)[0].billing).toBe('uninvoiced')
    })

    it('discloses sent-but-undated money the timing cannot place', () => {
      // No due_date → buildCalendarFeed emits no item for it, so the before/after
      // split literally cannot see this balance. It must not vanish.
      const invoices = [inv({ id: 'i1', lead_id: 'L', total: 900 })]
      const [job] = buildRunway([], events, TODAY, invoices)
      expect(job.untimedOwed).toBe(900)
      expect(job.billing).toBe('outstanding')
      expect(job.inflowBefore).toBe(0)
    })

    it('carries the leadId so an uninvoiced job has somewhere to be billed', () => {
      expect(buildRunway([], events, TODAY, [])[0].leadId).toBe('L')
    })
  })

  // ── The runway proper: a cumulative balance with an outflow side ───────────

  describe('cumulative balance', () => {
    it('runs a balance forward across the ordered jobs', () => {
      const events = [
        evt({ id: 'a', lead_id: 'A', event_start: '2026-08-20' }),
        evt({ id: 'b', lead_id: 'B', event_start: '2026-09-10' }),
      ]
      const items = [
        due({ id: 'ia', leadId: 'A', amount: 1000, date: '2026-08-18' }),
        due({ id: 'ib', leadId: 'B', amount: 400, date: '2026-09-05' }),
      ]
      const runway = buildRunway(items, events, TODAY, [])
      expect(runway.map((r) => r.cumulative)).toEqual([1000, 1400])
      expect(runway.map((r) => r.carriedIn)).toEqual([0, 1000])
      expect(runway.map((r) => r.cashIn)).toEqual([1000, 400])
    })

    it('the ledger reconciles on every row: carriedIn + cashIn − boothFee = cumulative', () => {
      const events = [
        evt({ id: 'a', lead_id: 'A', event_start: '2026-08-20', booth_fee: 150 }),
        evt({ id: 'b', lead_id: 'B', event_start: '2026-09-10', booth_fee: 75.5 }),
      ]
      const items = [
        due({ id: 'ia', leadId: 'A', amount: 1000, date: '2026-08-18' }),
        due({ id: 'ib', leadId: 'B', amount: 400, date: '2026-09-05' }),
      ]
      for (const r of buildRunway(items, events, TODAY, [])) {
        expect(Math.round((r.carriedIn + r.cashIn - r.boothFee) * 100) / 100).toBe(r.cumulative)
      }
    })

    it('booth_fee is an OUTFLOW — it reduces the balance and never inflates any inflow', () => {
      const events = [evt({ id: 'a', lead_id: 'A', event_start: '2026-08-20', booth_fee: 250 })]
      const items = [due({ id: 'ia', leadId: 'A', amount: 1000, date: '2026-08-18' })]
      const [job] = buildRunway(items, events, TODAY, [])
      expect(job.boothFee).toBe(250)
      expect(job.cumulative).toBe(750) // 1000 in, 250 committed out
      // it never leaks onto the inflow side
      expect(job.inflowBefore).toBe(1000)
      expect(job.cashIn).toBe(1000)
    })

    it('a booth fee with no receivable to cover it drives the balance negative', () => {
      const events = [evt({ id: 'a', event_start: '2026-08-20', booth_fee: 300 })]
      const [job] = buildRunway([], events, TODAY, [])
      expect(job.cumulative).toBe(-300)
      expect(job.firstShortfall).toBe(true)
    })

    it('marks only the FIRST shortfall, and marks nothing when the balance never goes negative', () => {
      const events = [
        evt({ id: 'a', lead_id: 'A', event_start: '2026-08-20', booth_fee: 100 }),
        evt({ id: 'b', event_start: '2026-08-25', booth_fee: 900 }), // goes negative here
        evt({ id: 'c', event_start: '2026-09-01', booth_fee: 50 }),  // still negative, not "first"
      ]
      const items = [due({ id: 'ia', leadId: 'A', amount: 500, date: '2026-08-18' })]
      const runway = buildRunway(items, events, TODAY, [])
      expect(runway.map((r) => r.cumulative)).toEqual([400, -500, -550])
      expect(runway.map((r) => r.firstShortfall)).toEqual([false, true, false])

      const healthy = buildRunway(items, [events[0]], TODAY, [])
      expect(healthy.map((r) => r.firstShortfall)).toEqual([false])
    })

    it('is CHRONOLOGICAL, so money due after job A but before job B still funds B', () => {
      // A's receivable is due after A — anchored to A it lands in dueAfter and would
      // vanish from an anchor-bucketed run, inventing a shortfall at B.
      const events = [
        evt({ id: 'a', lead_id: 'A', event_start: '2026-08-20' }),
        evt({ id: 'b', event_start: '2026-09-10', booth_fee: 600 }),
      ]
      const items = [due({ id: 'ia', leadId: 'A', amount: 1000, date: '2026-08-30' })]
      const runway = buildRunway(items, events, TODAY, [])
      expect(runway[0]).toMatchObject({ inflowBefore: 0, dueAfter: 1000, cashIn: 0, cumulative: 0 })
      // the $1,000 lands between the two jobs and is there when B arrives
      expect(runway[1]).toMatchObject({ cashIn: 1000, cumulative: 400, firstShortfall: false })
    })

    it('never counts one receivable twice, including two jobs on the same day', () => {
      const events = [
        evt({ id: 'a', lead_id: 'A', event_start: '2026-08-20' }),
        evt({ id: 'b', lead_id: 'B', event_start: '2026-08-20' }),
      ]
      const items = [due({ id: 'ia', leadId: 'A', amount: 1000, date: '2026-08-18' })]
      const runway = buildRunway(items, events, TODAY, [])
      expect(runway.map((r) => r.cashIn)).toEqual([1000, 0])
      expect(runway.map((r) => r.cumulative)).toEqual([1000, 1000])
    })

    it('treats a missing or non-positive booth_fee as no committed cost', () => {
      const events = [
        evt({ id: 'none', event_start: '2026-08-20' }),
        evt({ id: 'zero', event_start: '2026-08-21', booth_fee: 0 }),
        evt({ id: 'bogus', event_start: '2026-08-22', booth_fee: -50 }),
      ]
      expect(buildRunway([], events, TODAY, []).map((r) => r.boothFee)).toEqual([0, 0, 0])
    })
  })

  // ── The money rules (lib/calendar.ts documents these at `bookedValue`) ─────

  describe('money rules', () => {
    it('never lets Event.payment_amount (a REGISTRATION FEE) reach any figure', () => {
      const events = [
        evt({ id: 'a', lead_id: 'A', event_start: '2026-08-20', payment_amount: 99999, booth_fee: 100 }),
      ]
      const items = [due({ id: 'ia', leadId: 'A', amount: 1000, date: '2026-08-18' })]
      const [job] = buildRunway(items, events, TODAY, [])
      for (const v of Object.values(job)) {
        expect(v).not.toBe(99999)
      }
      expect(job).toMatchObject({ inflowBefore: 1000, cashIn: 1000, boothFee: 100, cumulative: 900 })
    })

    it('never lets a bookedValue on the feed reach any figure', () => {
      const events = [evt({ id: 'a', lead_id: 'A', event_start: '2026-08-20' })]
      const items: CalendarItem[] = [
        { id: 'ev', title: 'Job', date: '2026-08-20', kind: 'event', href: '/acme/x', bookedValue: 55555 },
      ]
      const [job] = buildRunway(items, events, TODAY, [])
      expect(job).toMatchObject({ inflowBefore: 0, dueAfter: 0, cashIn: 0, cumulative: 0 })
      expect(job.contributions).toEqual([])
    })
  })
})
