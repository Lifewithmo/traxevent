import { describe, it, expect } from 'vitest'
import { previouslyBilled, remainingToBill, assertWithinScope, InvoiceScopeError, proposalInvoiceLines } from '@/lib/invoice-progress'
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

  it('sums amount due (net of discount/tax/credits), not raw line totals', () => {
    const invs = [
      {
        lifecycle: 'issued' as const,
        source: { id: 'p1' },
        line_items: line(1000),
        discount: { type: 'percent' as const, value: 10 },
      },
    ]
    expect(previouslyBilled(invs, 'p1')).toBe(900) // 1000 - 10% discount, no tax/credits
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

describe('proposalInvoiceLines', () => {
  it('package proposal → package line + selected optionals', () => {
    const p = { id: 'p1',
      packages: [{ id: 'best', name: 'Best', includes: [], price: 2000 }],
      line_items: [{ id: 'o1', description: 'Drone', quantity: 1, unit_price: 300, optional: true },
                   { id: 'o2', description: 'Album', quantity: 1, unit_price: 200, optional: true }],
      selection: { package_id: 'best', optional_item_ids: ['o1'], selected_total: 2300, selected_at: '' } }
    const lines = proposalInvoiceLines(p)
    expect(lines).toEqual([
      { description: 'Best', quantity: 1, unit_price: 2000, source: { type: 'proposal', id: 'p1' } },
      { description: 'Drone', quantity: 1, unit_price: 300, source: { type: 'proposal', id: 'p1' } },
    ])
  })
  it('itemized proposal → required items + selected optionals', () => {
    const p = { id: 'p1', line_items: [
      { id: 'r1', description: 'Base', quantity: 1, unit_price: 1000 },
      { id: 'o1', description: 'Add-on', quantity: 1, unit_price: 500, optional: true }],
      selection: { optional_item_ids: [], selected_total: 1000, selected_at: '' } }
    const lines = proposalInvoiceLines(p)
    expect(lines).toEqual([{ description: 'Base', quantity: 1, unit_price: 1000, source: { type: 'proposal', id: 'p1' } }])
  })

  const src = { type: 'proposal' as const, id: 'p1' }

  it('composed selection → one line per member item, in item_ids order', () => {
    const p = { id: 'p1',
      packages: [{ id: 'std', name: 'Standard', includes: [], price: 1460, item_ids: ['i2', 'i1'] }],
      line_items: [
        { id: 'i1', description: 'Setup', quantity: 1, unit_price: 500 },
        { id: 'i2', description: 'Service', quantity: 8, unit_price: 120 }],
      selection: { package_id: 'std', optional_item_ids: [], selected_total: 1460, selected_at: '' } }
    expect(proposalInvoiceLines(p)).toEqual([
      { description: 'Service', quantity: 8, unit_price: 120, source: src },
      { description: 'Setup', quantity: 1, unit_price: 500, source: src },
    ])
  })

  it('price_override below the sum → negative adjustment line for the delta', () => {
    const p = { id: 'p1',
      packages: [{ id: 'std', name: 'Standard', includes: [], price: 1400, item_ids: ['i1', 'i2'], price_override: 1400 }],
      line_items: [
        { id: 'i1', description: 'Setup', quantity: 1, unit_price: 500 },
        { id: 'i2', description: 'Service', quantity: 8, unit_price: 120 }],
      selection: { package_id: 'std', optional_item_ids: [], selected_total: 1400, selected_at: '' } }
    expect(proposalInvoiceLines(p)).toEqual([
      { description: 'Setup', quantity: 1, unit_price: 500, source: src },
      { description: 'Service', quantity: 8, unit_price: 120, source: src },
      { description: 'Package price adjustment — Standard', quantity: 1, unit_price: -60, source: src },
    ])
  })

  it('price_override above the sum → positive adjustment line', () => {
    const p = { id: 'p1',
      packages: [{ id: 'std', name: 'Standard', includes: [], price: 1500, item_ids: ['i1'], price_override: 1500 }],
      line_items: [{ id: 'i1', description: 'Setup', quantity: 1, unit_price: 500 }],
      selection: { package_id: 'std', optional_item_ids: [], selected_total: 1500, selected_at: '' } }
    expect(proposalInvoiceLines(p)).toEqual([
      { description: 'Setup', quantity: 1, unit_price: 500, source: src },
      { description: 'Package price adjustment — Standard', quantity: 1, unit_price: 1000, source: src },
    ])
  })

  it('price_override equal to the sum → no adjustment line', () => {
    const p = { id: 'p1',
      packages: [{ id: 'std', name: 'Standard', includes: [], price: 500, item_ids: ['i1'], price_override: 500 }],
      line_items: [{ id: 'i1', description: 'Setup', quantity: 1, unit_price: 500 }],
      selection: { package_id: 'std', optional_item_ids: [], selected_total: 500, selected_at: '' } }
    expect(proposalInvoiceLines(p)).toEqual([
      { description: 'Setup', quantity: 1, unit_price: 500, source: src },
    ])
  })

  it('upgraded-legacy tier ($0 members + override) itemizes and totals to the flat price', () => {
    const p = { id: 'p1',
      packages: [{ id: 'good', name: 'Good', includes: [], price: 1200, item_ids: ['g0', 'g1'], price_override: 1200 }],
      line_items: [
        { id: 'g0', description: 'Install', quantity: 1, unit_price: 0 },
        { id: 'g1', description: 'Cleanup', quantity: 1, unit_price: 0 }],
      selection: { package_id: 'good', optional_item_ids: [], selected_total: 1200, selected_at: '' } }
    const lines = proposalInvoiceLines(p)
    expect(lines.map((l) => l.description)).toEqual(['Install', 'Cleanup', 'Package price adjustment — Good'])
    expect(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)).toBe(1200)
  })

  it('composed selection still appends chosen optional add-ons after the tier lines', () => {
    const p = { id: 'p1',
      packages: [{ id: 'std', name: 'Standard', includes: [], price: 500, item_ids: ['i1'] }],
      line_items: [
        { id: 'i1', description: 'Setup', quantity: 1, unit_price: 500 },
        { id: 'o1', description: 'Drone', quantity: 1, unit_price: 300, optional: true }],
      selection: { package_id: 'std', optional_item_ids: ['o1'], selected_total: 800, selected_at: '' } }
    expect(proposalInvoiceLines(p)).toEqual([
      { description: 'Setup', quantity: 1, unit_price: 500, source: src },
      { description: 'Drone', quantity: 1, unit_price: 300, source: src },
    ])
  })
})
