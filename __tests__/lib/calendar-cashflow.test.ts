import { describe, it, expect } from 'vitest'
import { buildRunway, type RunwayInvoice } from '@/lib/calendar-cashflow'
import type { CalendarItem } from '@/lib/calendar'
import type { Event } from '@/lib/types'

/** A clock with explicitly chosen LOCAL date parts and UTC instant. buildRunway
 *  reads "today" off the local parts, so a real `new Date('…T00:00:00.000Z')`
 *  is the 15th in Denver and the 16th in London — every date boundary in this
 *  file would then depend on the machine that ran it. */
const clock = (local: [number, number, number], iso: string) =>
  ({
    getFullYear: () => local[0],
    getMonth: () => local[1] - 1,
    getDate: () => local[2],
    toISOString: () => iso,
  }) as unknown as Date

const TODAY = clock([2026, 8, 16], '2026-08-16T12:00:00.000Z')

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
      'eventId', 'title', 'date', 'pastDue', 'inflowBefore', 'dueAfter', 'contributions',
      'billing', 'untimedOwed', 'leadId', 'boothFee', 'windowFrom', 'carriedIn', 'cashIn',
      'cashInThisJob', 'cashInOther', 'agedAr', 'cumulative', 'firstShortfall',
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

  it('does NOT count an already-delinquent receivable as inflow expected before the job', () => {
    const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
    const items = [due({ id: 'overdue', leadId: 'L', amount: 700, date: '2026-08-05' })] // due before today
    const [job] = buildRunway(items, events, TODAY, [])
    // The due date passed and the money did not arrive. That is aged debt, not a
    // forecast — "expected to land" must not include it.
    expect(job.inflowBefore).toBe(0)
    expect(job.pastDue).toBe(700)
    expect(job.contributions[0].timing).toBe('overdue')
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

    it('RECONCILES: the three timing buckets sum to pastDue / inflowBefore / dueAfter', () => {
      const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
      const items = [
        due({ id: 'a', leadId: 'L', amount: 1200.5, date: '2026-08-01' }), // already delinquent
        due({ id: 'b', leadId: 'L', amount: 340.25, date: '2026-08-22' }),
        due({ id: 'c', leadId: 'L', amount: 90.3, date: '2026-08-23' }),
        due({ id: 'd', leadId: 'L', amount: 10.7, date: '2026-09-01' }),
      ]
      const [job] = buildRunway(items, events, TODAY, [])
      const sum = (t: 'overdue' | 'before' | 'after') =>
        Math.round(job.contributions.filter((c) => c.timing === t).reduce((s, c) => s + c.amount, 0) * 100) / 100
      expect(sum('overdue')).toBe(job.pastDue)
      expect(sum('before')).toBe(job.inflowBefore)
      expect(sum('after')).toBe(job.dueAfter)
      expect(job.pastDue).toBe(1200.5)
      expect(job.inflowBefore).toBe(340.25)
      expect(job.dueAfter).toBe(101)
    })

    it('orders the build-up past-due, then before, then after, each by due date', () => {
      const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
      const items = [
        due({ id: 'late', leadId: 'L', amount: 1, date: '2026-09-01' }),
        due({ id: 'second', leadId: 'L', amount: 1, date: '2026-08-20' }),
        due({ id: 'first', leadId: 'L', amount: 1, date: '2026-08-01' }),
      ]
      const [job] = buildRunway(items, events, TODAY, [])
      expect(job.contributions.map((c) => c.invoiceId)).toEqual(['first', 'second', 'late'])
      expect(job.contributions.map((c) => c.timing)).toEqual(['overdue', 'before', 'after'])
    })

    it('marks an overdue contribution and rolls it up into pastDue, never into inflowBefore', () => {
      const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
      const items = [
        due({ id: 'late', leadId: 'L', amount: 800, date: '2026-06-01' }), // ~76 days overdue
        due({ id: 'soon', leadId: 'L', amount: 200, date: '2026-08-20' }),
      ]
      const [job] = buildRunway(items, events, TODAY, [])
      expect(job.contributions.find((c) => c.invoiceId === 'late')).toMatchObject({ overdue: true, aging: 'd61_90' })
      expect(job.contributions.find((c) => c.invoiceId === 'soon')!.overdue).toBe(false)
      // the honest reading: $800 is aged debt, only $200 is actually expected
      expect(job.pastDue).toBe(800)
      expect(job.inflowBefore).toBe(200)
    })

    it('keeps `overdue` and `timing: "overdue"` in lockstep — one basis, two readings', () => {
      const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
      const items = [
        due({ id: 'a', leadId: 'L', amount: 1, date: '2026-06-01' }),
        due({ id: 'b', leadId: 'L', amount: 1, date: '2026-08-15' }), // yesterday
        due({ id: 'c', leadId: 'L', amount: 1, date: '2026-08-16' }), // today — NOT late yet
        due({ id: 'd', leadId: 'L', amount: 1, date: '2026-08-22' }),
        due({ id: 'e', leadId: 'L', amount: 1, date: '2026-09-30' }),
      ]
      const [job] = buildRunway(items, events, TODAY, [])
      for (const c of job.contributions) {
        expect(c.overdue).toBe(c.timing === 'overdue')
      }
      expect(job.contributions.filter((c) => c.overdue).map((c) => c.invoiceId)).toEqual(['a', 'b'])
    })

    it('treats a receivable due TODAY as still expected, not as aged debt (boundary)', () => {
      const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
      const items = [due({ id: 'today', leadId: 'L', amount: 500, date: '2026-08-16' })]
      const [job] = buildRunway(items, events, TODAY, [])
      expect(job.pastDue).toBe(0)
      expect(job.inflowBefore).toBe(500)
      expect(job.cashIn).toBe(500)
      expect(job.agedAr).toBe(0)
    })
  })

  // ── Aged AR: debt is not a forecast ────────────────────────────────────────

  describe('delinquent receivables are aged debt, never cash in hand', () => {
    it('does not fund the next job out of a receivable that is ten months late', () => {
      // The reviewer's reproduction. One open invoice, $12,000, due 2025-11-01,
      // on a lead whose event is long past. The next booked job is Sep Fair,
      // booth_fee 500, never invoiced. The shipped code answered
      // { cashIn: 12000, cumulative: 11500 } and printed "Stays positive".
      const events = [
        evt({ id: 'old', name: 'Last autumn', lead_id: 'OLD', event_start: '2025-11-15' }),
        evt({ id: 'fair', name: 'Sep Fair', lead_id: 'NEW', event_start: '2026-09-01', booth_fee: 500 }),
      ]
      const items = [due({ id: 'stale', leadId: 'OLD', amount: 12000, date: '2025-11-01' })]
      const runway = buildRunway(items, events, TODAY, [])
      expect(runway).toHaveLength(1)
      const [job] = runway
      expect(job.cashIn).toBe(0)
      expect(job.cumulative).toBe(-500) // the truth: a $500 booth fee and no money
      expect(job.firstShortfall).toBe(true)
      // …and the $12,000 is not swallowed — it is reported as what it is.
      expect(job.agedAr).toBe(12000)
      expect(job.billing).toBe('uninvoiced')
    })

    it('reports aged AR on every row, because the hole does not close as jobs pass', () => {
      const events = [
        evt({ id: 'a', event_start: '2026-08-20' }),
        evt({ id: 'b', event_start: '2026-09-10' }),
      ]
      const items = [due({ id: 'stale', leadId: 'Z', amount: 2500, date: '2026-05-01' })]
      expect(buildRunway(items, events, TODAY, []).map((r) => r.agedAr)).toEqual([2500, 2500])
    })

    it('counts aged AR across every lead, anchored or not, and rounds it', () => {
      const events = [evt({ id: 'a', lead_id: 'L', event_start: '2026-08-20' })]
      const items = [
        due({ id: 'anchored', leadId: 'L', amount: 100.11, date: '2026-08-01' }),
        due({ id: 'orphan', leadId: 'GONE', amount: 200.22, date: '2026-07-01' }),
        due({ id: 'future', leadId: 'L', amount: 999, date: '2026-08-19' }),
      ]
      const [job] = buildRunway(items, events, TODAY, [])
      expect(job.agedAr).toBe(300.33)
      expect(job.cashIn).toBe(999)
      expect(job.cumulative).toBe(999)
    })

    it('leaves the runway at zero — not positive — when every receivable is delinquent', () => {
      const events = [evt({ id: 'a', lead_id: 'L', event_start: '2026-08-20' })]
      const items = [due({ id: 'stale', leadId: 'L', amount: 4000, date: '2026-01-01' })]
      const [job] = buildRunway(items, events, TODAY, [])
      expect(job.cashIn).toBe(0)
      expect(job.cumulative).toBe(0)
      expect(job.agedAr).toBe(4000)
    })
  })

  // ── One basis for "today", whatever the viewer's clock says ────────────────

  describe('a single "today" for timing AND aging', () => {
    // Each clock below has a LOCAL date and a UTC date that DISAGREE — the daily
    // window in which the two bases in the shipped module diverged.

    it('does not call a receivable overdue on its own due date (Denver, 19:00)', () => {
      // Denver 2026-08-16 19:00 → 2026-08-17T01:00Z. The customer has all of the
      // 16th to pay; a UTC-derived aging basis marks them late at 18:00 local.
      const now = clock([2026, 8, 16], '2026-08-17T01:00:00.000Z')
      const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
      const items = [due({ id: 'i', leadId: 'L', amount: 1000, date: '2026-08-16' })]
      const [job] = buildRunway(items, events, now, [])
      expect(job.contributions[0].aging).toBe('due_today')
      expect(job.contributions[0].overdue).toBe(false)
      expect(job.pastDue).toBe(0)
      expect(job.inflowBefore).toBe(1000)
      expect(job.agedAr).toBe(0)
    })

    it('does not read a genuinely late receivable as current (Sydney, 08:00)', () => {
      // Sydney 2026-08-17 08:00 → 2026-08-16T22:00Z. Yesterday's invoice IS late;
      // a UTC-derived basis calls it due-today for another ten hours.
      const now = clock([2026, 8, 17], '2026-08-16T22:00:00.000Z')
      const events = [evt({ id: 'j', lead_id: 'L', event_start: '2026-08-22' })]
      const items = [due({ id: 'i', leadId: 'L', amount: 1000, date: '2026-08-16' })]
      const [job] = buildRunway(items, events, now, [])
      expect(job.contributions[0].aging).toBe('d1_30')
      expect(job.contributions[0].overdue).toBe(true)
      expect(job.pastDue).toBe(1000)
      expect(job.inflowBefore).toBe(0)
      // and the cash column agrees with the aging — one basis, not two
      expect(job.cashIn).toBe(0)
      expect(job.agedAr).toBe(1000)
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

    it('splits cashIn by WHOSE money it is, so the two bases on the row reconcile', () => {
      // The row shows "what this job's client owes" (anchored to the lead) next
      // to "cash position at this job" (chronological, every lead). Without the
      // split those two adjacent figures differ by $4,000 with nothing to
      // explain the gap.
      const events = [
        evt({ id: 'j', name: 'Alder wedding', lead_id: 'A', event_start: '2026-09-01' }),
        evt({ id: 'other', lead_id: 'B', event_start: '2026-09-30' }),
      ]
      const items = [
        due({ id: 'mine', leadId: 'A', amount: 1000, date: '2026-08-25' }),
        due({ id: 'theirs', leadId: 'B', amount: 4000, date: '2026-08-26' }),
      ]
      const [job] = buildRunway(items, events, TODAY, [])
      expect(job.inflowBefore).toBe(1000)
      expect(job.cashIn).toBe(5000)
      expect(job.cashInThisJob).toBe(1000)
      expect(job.cashInOther).toBe(4000)
    })

    it('RECONCILES on every row: cashInThisJob + cashInOther = cashIn', () => {
      const events = [
        evt({ id: 'a', lead_id: 'A', event_start: '2026-08-20' }),
        evt({ id: 'b', lead_id: 'B', event_start: '2026-09-10' }),
        evt({ id: 'c', lead_id: 'C', event_start: '2026-09-20' }),
      ]
      const items = [
        due({ id: 'ia', leadId: 'A', amount: 1000.25, date: '2026-08-18' }),
        due({ id: 'ib', leadId: 'B', amount: 400.5, date: '2026-09-05' }),
        due({ id: 'ix', leadId: 'A', amount: 60.25, date: '2026-09-08' }),
        due({ id: 'orphan', leadId: 'GONE', amount: 12, date: '2026-09-19' }),
      ]
      for (const r of buildRunway(items, events, TODAY, [])) {
        expect(Math.round((r.cashInThisJob + r.cashInOther) * 100) / 100).toBe(r.cashIn)
      }
    })

    it('names the window each cashIn figure covers — it is not "everything up to now"', () => {
      const events = [
        evt({ id: 'a', event_start: '2026-08-20' }),
        evt({ id: 'b', event_start: '2026-09-10' }),
      ]
      const runway = buildRunway([], events, TODAY, [])
      // the first window opens TODAY, never at the dawn of time
      expect(runway[0].windowFrom).toBe('2026-08-16')
      // and each later one opens the day after the previous job
      expect(runway[1].windowFrom).toBe('2026-08-21')
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
