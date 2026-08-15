import { describe, it, expect } from 'vitest'
import { buildMoneyOverview } from '@/lib/money-overview'
import type { NormalizedInvoice } from '@/lib/types'

const NOW = new Date('2026-08-15T12:00:00Z')

function inv(over: Partial<NormalizedInvoice> & { id: string }): NormalizedInvoice {
  return {
    line_items: [{ description: 'Service', quantity: 1, unit_price: 100 }],
    payments: [],
    lifecycle: 'sent',
    ...over,
  } as NormalizedInvoice
}

describe('buildMoneyOverview', () => {
  it('sums the unpaid balance of sent invoices as outstanding', () => {
    const o = buildMoneyOverview([inv({ id: 'a' }), inv({ id: 'b' })], NOW)
    expect(o.outstanding).toBe(200)
  })

  it('subtracts payments from outstanding', () => {
    const o = buildMoneyOverview(
      [inv({ id: 'a', payments: [{ amount: 40, recorded_at: '2026-08-10' }] } as Partial<NormalizedInvoice> & { id: string })],
      NOW,
    )
    expect(o.outstanding).toBe(60)
  })

  it('excludes draft and void invoices from outstanding', () => {
    const o = buildMoneyOverview(
      [inv({ id: 'a', lifecycle: 'draft' }), inv({ id: 'b', lifecycle: 'void' })],
      NOW,
    )
    expect(o.outstanding).toBe(0)
  })

  it('counts and sums invoices past their due date as overdue', () => {
    const o = buildMoneyOverview(
      [inv({ id: 'a', due_date: '2026-08-01' }), inv({ id: 'b', due_date: '2026-09-01' })],
      NOW,
    )
    expect(o.overdue).toBe(100)
    expect(o.overdueCount).toBe(1)
  })

  it('buckets balances by aging', () => {
    const o = buildMoneyOverview(
      [inv({ id: 'a', due_date: '2026-08-01' }), inv({ id: 'b', due_date: '2026-04-01' })],
      NOW,
    )
    expect(o.aging.d1_30).toBe(100)
    expect(o.aging.d90_plus).toBe(100)
  })

  it('sums payments received in the current calendar month', () => {
    const o = buildMoneyOverview(
      [inv({ id: 'a', payments: [{ amount: 30, recorded_at: '2026-08-03' }, { amount: 20, recorded_at: '2026-07-28' }] } as Partial<NormalizedInvoice> & { id: string })],
      NOW,
    )
    expect(o.paidThisMonth).toBe(30)
  })

  it('returns zeroed totals and no overdue rows for an empty list', () => {
    const o = buildMoneyOverview([], NOW)
    expect(o).toMatchObject({ outstanding: 0, overdue: 0, overdueCount: 0, paidThisMonth: 0 })
    expect(o.overdueInvoices).toEqual([])
  })

  it('returns the overdue invoices themselves, most overdue first', () => {
    const o = buildMoneyOverview(
      [
        inv({ id: 'recent', lead_id: 'l1', number: 'INV-2', due_date: '2026-08-10' }),
        inv({ id: 'old', lead_id: 'l2', number: 'INV-1', due_date: '2026-07-01' }),
      ],
      NOW,
    )
    expect(o.overdueInvoices.map((i) => i.id)).toEqual(['old', 'recent'])
    expect(o.overdueInvoices[0]).toMatchObject({ leadId: 'l2', label: 'INV-1', balance: 100, daysOverdue: 45 })
  })

  it('falls back to the invoice title, then a placeholder, when there is no number', () => {
    const titled = buildMoneyOverview([inv({ id: 'a', title: 'Deposit', due_date: '2026-08-01' })], NOW)
    expect(titled.overdueInvoices[0].label).toBe('Deposit')
    const bare = buildMoneyOverview([inv({ id: 'a', due_date: '2026-08-01' })], NOW)
    expect(bare.overdueInvoices[0].label).toBe('Untitled invoice')
  })
})
