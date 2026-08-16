import { describe, it, expect } from 'vitest'
import { daysToEvent, opportunityRollup } from '@/lib/opportunity-rollup'
import type { Invoice, Task } from '@/lib/types'

const TODAY = '2026-08-15'

// Minimal invoice factory — only the fields the money helpers read.
function inv(p: Partial<Invoice>): Invoice {
  return {
    id: 'i', org_id: 'o', lead_id: 'L1', type: 'final', lifecycle: 'sent',
    line_items: [{ description: 'Cart', quantity: 1, unit_price: 1000 }],
    payments: [], created_at: '2026-01-01T00:00:00.000Z', token: 'tok', ...p,
  } as Invoice
}
function task(p: Partial<Task>): Task {
  return { id: 't', lead_id: 'L1', title: 'Do it', done: false, created_at: '2026-01-01T00:00:00.000Z', ...p }
}
const lead = (p: { estimated_value?: number; event_date?: string } = {}) => p

describe('daysToEvent', () => {
  it('returns a positive count for a future event', () => {
    expect(daysToEvent('2026-08-30', TODAY)).toBe(15)
  })
  it('returns 0 when the event is today', () => {
    expect(daysToEvent(TODAY, TODAY)).toBe(0)
  })
  it('returns a negative count for a past event', () => {
    expect(daysToEvent('2026-08-12', TODAY)).toBe(-3)
  })
  it('returns null when there is no event date', () => {
    expect(daysToEvent(undefined, TODAY)).toBeNull()
  })
  it('is immune to DST — a UTC-midnight diff across the spring shift is whole days', () => {
    expect(daysToEvent('2026-03-15', '2026-03-01')).toBe(14)
  })

  // NaN is the dangerous return, not a wrong number: the band branches on
  // `=== null` to decide between the figure and its "+ Add date" affordance,
  // and NaN !== null, so a NaN would render the literal "NaN days" with no fix.
  it('returns null, never NaN, for an event_date that is not a bare YYYY-MM-DD', () => {
    for (const bad of ['2026-08-30T14:00:00.000Z', 'next Friday', '2026-13-45', '']) {
      const result = daysToEvent(bad, TODAY)
      expect(result, `expected null for ${JSON.stringify(bad)}`).toBeNull()
      expect(Number.isNaN(result as unknown as number)).toBe(false)
    }
  })

  it('returns null rather than NaN when today itself is unparseable', () => {
    expect(daysToEvent('2026-08-30', 'not-a-date')).toBeNull()
  })
})

describe('opportunityRollup', () => {
  const base = { lead: lead(), invoices: [], tasks: [], pastBookings: 0, today: TODAY }

  it('passes through estimated value and counts days to the event', () => {
    const r = opportunityRollup({ ...base, lead: lead({ estimated_value: 4800, event_date: '2026-08-30' }) })
    expect(r.estValue).toBe(4800)
    expect(r.daysToEvent).toBe(15)
  })

  it('reports a null est. value when the field is unset, so the tile can offer "+ Add"', () => {
    const r = opportunityRollup(base)
    expect(r.estValue).toBeNull()
    expect(r.daysToEvent).toBeNull()
  })

  it('keeps a zero estimate as a real figure, not an unset field', () => {
    expect(opportunityRollup({ ...base, lead: lead({ estimated_value: 0 }) }).estValue).toBe(0)
  })

  // INVERTED, deliberately. This test used to pin `openBalance` at 1500 —
  // counting the draft — on the stated rationale that it matched the invoice
  // attachment chip in lib/opportunity-detail.ts. That function no longer
  // exists (deleted this increment), and the figure sits under the same
  // "Open balance" label as LeadInvoicesClient's footer in the same page's
  // rail, which counts `lifecycle === 'sent'` only. Two different numbers under
  // one label is the bug; the invoice module is the record of truth.
  it('open balance counts only SENT invoices — a draft has not been asked for yet', () => {
    const r = opportunityRollup({
      ...base,
      invoices: [
        inv({ id: 'sent', lifecycle: 'sent', line_items: [{ description: 'x', quantity: 1, unit_price: 1000 }] }),
        inv({ id: 'draft', lifecycle: 'draft', line_items: [{ description: 'x', quantity: 1, unit_price: 500 }] }),
        inv({ id: 'void', lifecycle: 'void', line_items: [{ description: 'x', quantity: 1, unit_price: 900 }] }),
      ],
    })
    expect(r.openBalance).toBe(1000)
    // The two numbers this must never be again: 1500 counts the draft, 2400
    // counts the void as well.
    expect(r.openBalance).not.toBe(1500)
  })

  // The concrete failure the reviewer reported: one never-sent draft for $5,000
  // due yesterday rendered "OPEN BALANCE $5,000 · past due" in destructive tone
  // beside an Invoices card reading "Open balance $0.00".
  it('a draft past its due date is neither open nor overdue', () => {
    const r = opportunityRollup({
      ...base,
      invoices: [
        inv({
          id: 'never-sent',
          lifecycle: 'draft',
          due_date: '2026-08-14',
          line_items: [{ description: 'x', quantity: 1, unit_price: 5000 }],
        }),
      ],
    })
    expect(r.openBalance).toBe(0)
    expect(r.overdueBalance).toBe(0)
  })

  it('excludes a fully paid invoice from the open balance', () => {
    const r = opportunityRollup({
      ...base,
      invoices: [
        inv({ id: 'paid', line_items: [{ description: 'x', quantity: 1, unit_price: 1000 }], payments: [{ amount: 1000, recorded_at: '2026-08-01T00:00:00.000Z' }] }),
        inv({ id: 'part', line_items: [{ description: 'x', quantity: 1, unit_price: 1000 }], payments: [{ amount: 250, recorded_at: '2026-08-01T00:00:00.000Z' }] }),
      ],
    })
    expect(r.openBalance).toBe(750)
  })

  // Pins the `> 0` half of the liveness predicate. invoiceBalance() is
  // amountDue - amountPaid and goes negative when an invoice is overpaid — a
  // real state (derivePaymentStatus returns 'overpaid'). Without the guard the
  // credit would net against what the customer still owes elsewhere, so these
  // two tests are the difference between $1,000 owed and a silent $800.
  it('an overpaid invoice does not subtract its credit balance from the open balance', () => {
    const r = opportunityRollup({
      ...base,
      invoices: [
        inv({ id: 'unpaid', line_items: [{ description: 'x', quantity: 1, unit_price: 1000 }] }),
        inv({
          id: 'overpaid',
          line_items: [{ description: 'x', quantity: 1, unit_price: 500 }],
          payments: [{ amount: 700, recorded_at: '2026-08-01T00:00:00.000Z' }],
        }),
      ],
    })
    expect(r.openBalance).toBe(1000)
    expect(r.openBalance).not.toBe(800)
  })

  it('an overpaid invoice past its due date does not subtract from the overdue balance', () => {
    const r = opportunityRollup({
      ...base,
      invoices: [
        inv({ id: 'late', due_date: '2026-08-01', line_items: [{ description: 'x', quantity: 1, unit_price: 1000 }] }),
        inv({
          id: 'overpaid-late',
          due_date: '2026-08-01',
          line_items: [{ description: 'x', quantity: 1, unit_price: 500 }],
          payments: [{ amount: 700, recorded_at: '2026-08-01T00:00:00.000Z' }],
        }),
      ],
    })
    expect(r.overdueBalance).toBe(1000)
    expect(r.overdueBalance).not.toBe(800)
  })

  it('overdue balance counts only invoices past their due date', () => {
    const r = opportunityRollup({
      ...base,
      invoices: [
        inv({ id: 'late', due_date: '2026-08-01', line_items: [{ description: 'x', quantity: 1, unit_price: 300 }] }),
        inv({ id: 'soon', due_date: '2026-09-01', line_items: [{ description: 'x', quantity: 1, unit_price: 700 }] }),
        inv({ id: 'undated', line_items: [{ description: 'x', quantity: 1, unit_price: 100 }] }),
      ],
    })
    expect(r.openBalance).toBe(1100)
    expect(r.overdueBalance).toBe(300)
  })

  it('an invoice due today is not yet overdue', () => {
    const r = opportunityRollup({
      ...base,
      invoices: [inv({ due_date: TODAY, line_items: [{ description: 'x', quantity: 1, unit_price: 400 }] })],
    })
    expect(r.overdueBalance).toBe(0)
  })

  it('a void invoice past its due date never counts as overdue', () => {
    const r = opportunityRollup({
      ...base,
      invoices: [inv({ lifecycle: 'void', due_date: '2026-01-01', line_items: [{ description: 'x', quantity: 1, unit_price: 900 }] })],
    })
    expect(r.openBalance).toBe(0)
    expect(r.overdueBalance).toBe(0)
  })

  it('counts open tasks and overdue tasks, ignoring done and undated tasks', () => {
    const r = opportunityRollup({
      ...base,
      tasks: [
        task({ id: 'a', due_date: '2026-08-01' }),            // open + overdue
        task({ id: 'b', due_date: '2026-09-01' }),            // open, future
        task({ id: 'c' }),                                    // open, undated
        task({ id: 'd', due_date: '2026-08-01', done: true }), // done + past due
      ],
    })
    expect(r.openTaskCount).toBe(3)
    expect(r.overdueTaskCount).toBe(1)
  })

  it('passes the past-booking count through for the returning-client tile', () => {
    expect(opportunityRollup({ ...base, pastBookings: 3 }).pastBookings).toBe(3)
  })
})
