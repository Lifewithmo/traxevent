import { describe, it, expect } from 'vitest'
import { previouslyBilled, remainingToBill, assertWithinScope, InvoiceScopeError } from '@/lib/invoice-progress'
import type { InvoiceLineItem } from '@/lib/types'

const line = (n: number): InvoiceLineItem[] => [{ description: 'x', quantity: 1, unit_price: n }]

describe('previouslyBilled', () => {
  it('sums issued, non-void invoices matching the source id only', () => {
    const invs = [
      { lifecycle: 'issued' as const, source: { id: 'p1' }, line_items: line(300) },
      { lifecycle: 'issued' as const, source: { id: 'p1' }, line_items: line(200) },
      { lifecycle: 'draft' as const, source: { id: 'p1' }, line_items: line(999) },   // not issued
      { lifecycle: 'voided' as const, source: { id: 'p1' }, line_items: line(999) },  // voided
      { lifecycle: 'issued' as const, source: { id: 'other' }, line_items: line(999) }, // other source
    ]
    expect(previouslyBilled(invs, 'p1')).toBe(500)
  })
})

describe('remainingToBill', () => {
  it('approved minus billed', () => {
    expect(remainingToBill(1000, 500)).toBe(500)
    expect(remainingToBill(1000, 1000)).toBe(0)
  })
})

describe('assertWithinScope', () => {
  it('passes when new + billed <= approved', () => {
    expect(() => assertWithinScope(500, 500, 1000)).not.toThrow()
  })
  it('throws InvoiceScopeError with the overage amount', () => {
    expect(() => assertWithinScope(600, 500, 1000)).toThrow(InvoiceScopeError)
    expect(() => assertWithinScope(600, 500, 1000)).toThrow(/exceeds approved scope by \$100\.00/)
  })
})
