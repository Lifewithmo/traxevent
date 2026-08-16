import { describe, it, expect } from 'vitest'
import { customerAR, filterInvoicesByLeadIds } from '@/lib/crm/ar-rollup'
import type { Invoice } from '@/lib/types'

// Minimal invoice factory — only the fields the money helpers read.
function inv(p: Partial<Invoice>): Invoice {
  return {
    id: 'i', org_id: 'o', lead_id: 'L1', type: 'final', lifecycle: 'sent',
    line_items: [{ description: 'Cart', quantity: 1, unit_price: 1000 }],
    payments: [], created_at: '2026-01-01T00:00:00.000Z', token: 'tok', ...p,
  } as Invoice
}
const NOW = new Date('2026-08-15T00:00:00.000Z')

describe('filterInvoicesByLeadIds', () => {
  it('keeps only invoices whose lead_id is in the set', () => {
    const list = [inv({ id: 'a', lead_id: 'L1' }), inv({ id: 'b', lead_id: 'L2' })]
    expect(filterInvoicesByLeadIds(list, ['L1']).map((i) => i.id)).toEqual(['a'])
  })
})

describe('customerAR', () => {
  it('sums invoiced/paid/outstanding over SENT invoices, excluding draft and void', () => {
    const list = [
      inv({ id: 'a', lifecycle: 'sent', line_items: [{ description: 'x', quantity: 1, unit_price: 1000 }], payments: [{ amount: 400, recorded_at: NOW.toISOString() }] }),
      inv({ id: 'b', lifecycle: 'draft', line_items: [{ description: 'x', quantity: 1, unit_price: 500 }] }),
      inv({ id: 'c', lifecycle: 'void', line_items: [{ description: 'x', quantity: 1, unit_price: 900 }] }),
    ]
    const ar = customerAR(list, NOW)
    expect(ar.invoiced).toBe(1000)
    expect(ar.paid).toBe(400)
    expect(ar.outstanding).toBe(600)
  })
  it('counts an invoice past its due date as overdue and picks the earliest next-due date', () => {
    const list = [
      inv({ id: 'a', due_date: '2026-08-01', line_items: [{ description: 'x', quantity: 1, unit_price: 300 }] }), // overdue
      inv({ id: 'b', due_date: '2026-09-01', line_items: [{ description: 'x', quantity: 1, unit_price: 700 }] }), // future
    ]
    const ar = customerAR(list, NOW)
    expect(ar.overdueAmount).toBe(300)
    expect(ar.nextDueDate).toBe('2026-08-01')
    expect(ar.openCount).toBe(2)
  })
  it('does not double-count a paid deposit invoice (money comes from the ledger only)', () => {
    const list = [
      inv({ id: 'dep', type: 'deposit', line_items: [{ description: 'Deposit', quantity: 1, unit_price: 500 }], payments: [{ amount: 500, recorded_at: NOW.toISOString() }] }),
    ]
    const ar = customerAR(list, NOW)
    expect(ar.paid).toBe(500)
    expect(ar.outstanding).toBe(0)
  })
})
