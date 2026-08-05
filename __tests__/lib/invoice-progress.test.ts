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

import { acceptedProposalTotal } from '@/lib/invoice-progress'

describe('acceptedProposalTotal', () => {
  it('prefers the locked selection.selected_total when present', () => {
    const p = { line_items: [{ description: 'x', quantity: 1, unit_price: 999 }],
      selection: { optional_item_ids: [], selected_total: 1234, selected_at: '' } }
    expect(acceptedProposalTotal(p)).toBe(1234)
  })

  it('falls back to computeSelectedTotal (required items − discount + tax) with no selection', () => {
    const p = {
      line_items: [
        { id: 'a', description: 'Base', quantity: 1, unit_price: 1000 },
        { id: 'b', description: 'Add-on', quantity: 1, unit_price: 500, optional: true }, // excluded (not selected)
      ],
      discount: { type: 'percent' as const, value: 10 },   // -100 on 1000
      tax_rate: 10,                                         // +90 on 900
    }
    // required base 1000, no addons; discount 100 -> 900; tax 10% -> 990
    expect(acceptedProposalTotal(p)).toBe(990)
  })

  it('a package proposal returns its locked selected_total', () => {
    const p = {
      packages: [{ id: 'good', name: 'Good', includes: [], price: 800 },
                 { id: 'best', name: 'Best', includes: [], price: 2000 }],
      line_items: [],
      selection: { package_id: 'best', optional_item_ids: [], selected_total: 2000, selected_at: '' },
    }
    expect(acceptedProposalTotal(p)).toBe(2000)
  })
})
