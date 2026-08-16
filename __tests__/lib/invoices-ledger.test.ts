import { describe, it, expect } from 'vitest'
import { buildInvoiceLedger, type LedgerInvoice } from '@/lib/invoices-ledger'
import type { InvoiceLineItem, InvoicePayment } from '@/lib/types'

const NOW = new Date('2026-08-16T12:00:00.000Z')

const li = (unit_price: number): InvoiceLineItem => ({ description: 'x', quantity: 1, unit_price })
const pay = (amount: number, recorded_at = '2026-08-10T00:00:00.000Z'): InvoicePayment => ({ amount, recorded_at })

function inv(over: Partial<LedgerInvoice> & { id: string }): LedgerInvoice {
  return {
    org_id: 'o1',
    lead_id: `lead-${over.id}`,
    token: 'tok',
    type: 'quick',
    lifecycle: 'sent',
    delivery: 'not_sent',
    accounting: 'not_connected',
    dispute: 'none',
    line_items: [li(100)],
    payments: [],
    created_at: '2026-08-01T00:00:00.000Z',
    clientName: 'Some Job',
    ...over,
  }
}

function keys(rows: LedgerInvoice[]) {
  return buildInvoiceLedger(rows, NOW).map((g) => g.key)
}

function group(rows: LedgerInvoice[], key: string) {
  return buildInvoiceLedger(rows, NOW).find((g) => g.key === key)
}

describe('buildInvoiceLedger — grouping', () => {
  it('orders groups by the operator’s next decision, and omits empty ones', () => {
    const rows = [
      inv({ id: 'settled', lifecycle: 'void' }),
      inv({ id: 'draft', lifecycle: 'draft' }),
      inv({ id: 'awaiting', due_date: '2026-09-30' }),
      inv({ id: 'soon', due_date: '2026-08-18' }),
      inv({ id: 'late', due_date: '2026-07-01' }),
    ]
    expect(keys(rows)).toEqual(['overdue', 'due_soon', 'awaiting', 'drafts', 'settled'])
    // Only the two groups that have rows survive.
    expect(keys([inv({ id: 'a', lifecycle: 'draft' }), inv({ id: 'b', due_date: '2026-07-01' })]))
      .toEqual(['overdue', 'drafts'])
    expect(buildInvoiceLedger([], NOW)).toEqual([])
  })

  it('splits due-soon (and due-today) out of awaiting payment', () => {
    const rows = [
      inv({ id: 'today', due_date: '2026-08-16' }),
      inv({ id: 'in2', due_date: '2026-08-18' }),
      inv({ id: 'far', due_date: '2026-10-01' }),
      inv({ id: 'nodate' }),
    ]
    // Ascending due date, so the one due TODAY leads the one due in two days.
    expect(group(rows, 'due_soon')!.rows.map((r) => r.id)).toEqual(['today', 'in2'])
    expect(group(rows, 'awaiting')!.rows.map((r) => r.id)).toEqual(['far', 'nodate'])
  })

  it('puts a partially paid, past-due invoice in Overdue — not Awaiting', () => {
    const rows = [inv({ id: 'partial-late', due_date: '2026-07-20', payments: [pay(40)] })]
    const g = buildInvoiceLedger(rows, NOW)
    expect(g).toHaveLength(1)
    expect(g[0].key).toBe('overdue')
    expect(g[0].rows[0].payment).toBe('partial')
    expect(g[0].rows[0].pill.label).toBe('Overdue')
    expect(g[0].rows[0].balance).toBe(60)
  })

  it('lands both paid and void invoices in Settled, and keeps drafts out of AR', () => {
    const rows = [
      inv({ id: 'paid', due_date: '2026-07-01', payments: [pay(100)] }),
      inv({ id: 'void', lifecycle: 'void', due_date: '2026-07-01' }),
      inv({ id: 'draft', lifecycle: 'draft', due_date: '2026-07-01' }),
    ]
    expect(keys(rows)).toEqual(['drafts', 'settled'])
    expect(group(rows, 'settled')!.rows.map((r) => r.id).sort()).toEqual(['paid', 'void'])
    expect(group(rows, 'settled')!.rows.map((r) => r.pill.label).sort()).toEqual(['Paid', 'Void'])
    // A draft is never overdue, however long its due date has been past.
    expect(group(rows, 'drafts')!.rows[0].pill.label).toBe('Draft')
  })
})

describe('buildInvoiceLedger — ordering', () => {
  it('sorts Overdue most-overdue-first, against the caller’s created_at DESC order', () => {
    // listAllInvoices returns Firestore orderBy('created_at','desc'); the re-sort
    // is the point — the oldest debt must surface first regardless of input order.
    const rows = [
      inv({ id: 'recent', created_at: '2026-08-14T00:00:00.000Z', due_date: '2026-08-14' }),
      inv({ id: 'ancient', created_at: '2026-02-01T00:00:00.000Z', due_date: '2026-03-01' }),
      inv({ id: 'mid', created_at: '2026-07-01T00:00:00.000Z', due_date: '2026-07-15' }),
    ]
    expect(group(rows, 'overdue')!.rows.map((r) => r.id)).toEqual(['ancient', 'mid', 'recent'])
    expect(group(rows, 'overdue')!.rows.map((r) => r.daysOverdue)).toEqual([168, 32, 2])
  })

  it('sorts due-soon and awaiting by due date ascending, undated last', () => {
    const rows = [
      inv({ id: 'nov', due_date: '2026-11-01' }),
      inv({ id: 'none' }),
      inv({ id: 'sep', due_date: '2026-09-01' }),
    ]
    expect(group(rows, 'awaiting')!.rows.map((r) => r.id)).toEqual(['sep', 'nov', 'none'])
  })

  it('sorts drafts and settled newest-first by created_at', () => {
    const rows = [
      inv({ id: 'old', lifecycle: 'draft', created_at: '2026-01-01T00:00:00.000Z' }),
      inv({ id: 'new', lifecycle: 'draft', created_at: '2026-08-15T00:00:00.000Z' }),
      inv({ id: 'v-old', lifecycle: 'void', created_at: '2026-01-01T00:00:00.000Z' }),
      inv({ id: 'v-new', lifecycle: 'void', created_at: '2026-08-15T00:00:00.000Z' }),
    ]
    expect(group(rows, 'drafts')!.rows.map((r) => r.id)).toEqual(['new', 'old'])
    expect(group(rows, 'settled')!.rows.map((r) => r.id)).toEqual(['v-new', 'v-old'])
  })
})

describe('buildInvoiceLedger — money', () => {
  it('totals each group by the money that group represents', () => {
    const rows = [
      // Overdue / due-soon / awaiting sum the BALANCE still owed.
      inv({ id: 'late1', due_date: '2026-07-01', line_items: [li(500)], payments: [pay(200)] }),
      inv({ id: 'late2', due_date: '2026-06-01', line_items: [li(250)] }),
      inv({ id: 'soon', due_date: '2026-08-18', line_items: [li(400)] }),
      // Drafts sum the TOTAL — nothing has been asked for yet, so there is no
      // balance story. `d3` carries a payment on purpose: without one, total
      // and balance are identical for every draft and this assertion passes
      // under the wrong picker.
      inv({ id: 'd1', lifecycle: 'draft', line_items: [li(1000)] }),
      inv({ id: 'd2', lifecycle: 'draft', line_items: [li(250.5)] }),
      inv({ id: 'd3', lifecycle: 'draft', line_items: [li(400)], payments: [pay(150)] }),
      // Settled sums what was actually COLLECTED; a void collected nothing.
      inv({ id: 'paid', line_items: [li(300)], payments: [pay(300)] }),
      inv({ id: 'void', lifecycle: 'void', line_items: [li(9999)] }),
    ]
    expect(group(rows, 'overdue')!.total).toBe(550) // 300 + 250
    expect(group(rows, 'due_soon')!.total).toBe(400)
    // 1000 + 250.5 + 400 billed. Would be 1500.5 if drafts summed BALANCE, and
    // 150 if they summed what was collected.
    expect(group(rows, 'drafts')!.total).toBe(1650.5)
    expect(group(rows, 'settled')!.total).toBe(300)
  })

  it('rounds each group total to cents rather than leaking float dust', () => {
    // 10.10 + 20.20 === 30.299999999999997 in IEEE-754. Group totals accumulate
    // across rows, so the sum — not just each row — has to be rounded.
    const rows = [
      inv({ id: 'a', lifecycle: 'draft', line_items: [li(10.1)] }),
      inv({ id: 'b', lifecycle: 'draft', line_items: [li(20.2)] }),
    ]
    expect(group(rows, 'drafts')!.total).toBe(30.3)
  })

  it('carries an overpayment through as a negative balance', () => {
    // __tests__/lib/invoices.test.ts pins invoiceBalance at -20 for this shape.
    const rows = [inv({ id: 'over', line_items: [li(100)], payments: [pay(120)] })]
    const g = buildInvoiceLedger(rows, NOW)
    expect(g[0].key).toBe('settled')
    expect(g[0].rows[0].balance).toBe(-20)
    expect(g[0].rows[0].payment).toBe('overpaid')
    expect(g[0].rows[0].pill.label).toBe('Paid')
    expect(g[0].total).toBe(120) // collected, not billed
  })
})

describe('buildInvoiceLedger — row display fields', () => {
  it('surfaces the label, job, due date and subtext the old table threw away', () => {
    const rows = [
      inv({
        id: 'x',
        number: 'INV-1042',
        title: 'Deposit',
        type: 'deposit',
        due_date: '2026-09-01',
        clientName: 'Harbor Gala',
        source: { type: 'proposal', label: 'Accepted proposal' },
      }),
    ]
    const r = buildInvoiceLedger(rows, NOW)[0].rows[0]
    expect(r.label).toBe('#INV-1042')
    expect(r.clientName).toBe('Harbor Gala')
    expect(r.dueDate).toBe('2026-09-01')
    expect(r.subtext).toBe('Deposit · Accepted proposal')
    expect(r.leadId).toBe('lead-x')
  })

  it('falls back to the title, then a generic label, when there is no number', () => {
    const rows = [inv({ id: 'a', title: 'Balance due' }), inv({ id: 'b' })]
    const labels = buildInvoiceLedger(rows, NOW)[0].rows.map((r) => r.label)
    expect(labels).toContain('Balance due')
    expect(labels).toContain('Invoice')
  })
})
