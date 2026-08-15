import { describe, it, expect } from 'vitest'
import {
  dropPhase, computeOrderTotals, soldByProduct, availableStock, cartFits,
  MAX_LINE_QTY, PENDING_HOLD_MS,
} from '@/lib/storefront/drop-logic'
import type { DropItem } from '@/lib/types'

const ITEMS: DropItem[] = [
  { product_id: 'p1', name: 'Vanilla Latte', price: 5.5, stock: 10 },
  { product_id: 'p2', name: 'Club Soda', price: 4.5 },              // unlimited
]

describe('dropPhase', () => {
  const drop = { status: 'scheduled' as const, opens_at: '2026-08-20T15:00:00.000Z', closes_at: '2026-08-21T15:00:00.000Z' }
  it('derives upcoming / open / ended from instants', () => {
    expect(dropPhase(drop, '2026-08-20T14:59:59.000Z')).toBe('upcoming')
    expect(dropPhase(drop, '2026-08-20T15:00:00.000Z')).toBe('open')
    expect(dropPhase(drop, '2026-08-21T15:00:00.000Z')).toBe('ended')
  })
  it('status intent wins: draft/archived pass through; closed = ended even mid-window', () => {
    expect(dropPhase({ ...drop, status: 'draft' }, '2026-08-20T16:00:00.000Z')).toBe('draft')
    expect(dropPhase({ ...drop, status: 'archived' }, '2026-08-20T16:00:00.000Z')).toBe('archived')
    expect(dropPhase({ ...drop, status: 'closed' }, '2026-08-20T16:00:00.000Z')).toBe('ended')
  })
})

describe('computeOrderTotals', () => {
  it('snapshots name/price from drop items and rounds money', () => {
    const t = computeOrderTotals(ITEMS, [{ product_id: 'p1', qty: 2 }, { product_id: 'p2', qty: 1 }], { tax_rate: 6, tip: 2 })
    expect(t.lines).toEqual([
      { product_id: 'p1', name: 'Vanilla Latte', price: 5.5, qty: 2 },
      { product_id: 'p2', name: 'Club Soda', price: 4.5, qty: 1 },
    ])
    expect(t.subtotal).toBe(15.5)
    expect(t.tax).toBe(0.93)       // 15.5 * 6% = 0.93
    expect(t.tip).toBe(2)
    expect(t.total).toBe(18.43)
  })
  it('no tax_rate → zero tax and no tax_rate key', () => {
    const t = computeOrderTotals(ITEMS, [{ product_id: 'p2', qty: 1 }])
    expect(t.tax).toBe(0)
    expect(t).not.toHaveProperty('tax_rate')
    expect(t.total).toBe(4.5)
  })
  it('rejects empty carts, unknown items, dupes, bad qty, bad tips', () => {
    expect(() => computeOrderTotals(ITEMS, [])).toThrow('empty')
    expect(() => computeOrderTotals(ITEMS, [{ product_id: 'nope', qty: 1 }])).toThrow('no longer available')
    expect(() => computeOrderTotals(ITEMS, [{ product_id: 'p1', qty: 1 }, { product_id: 'p1', qty: 1 }])).toThrow('Duplicate')
    expect(() => computeOrderTotals(ITEMS, [{ product_id: 'p1', qty: 0 }])).toThrow('quantity')
    expect(() => computeOrderTotals(ITEMS, [{ product_id: 'p1', qty: 1.5 }])).toThrow('quantity')
    expect(() => computeOrderTotals(ITEMS, [{ product_id: 'p1', qty: MAX_LINE_QTY + 1 }])).toThrow('quantity')
    expect(() => computeOrderTotals(ITEMS, [{ product_id: 'p1', qty: 1 }], { tip: -1 })).toThrow('tip')
  })
})

describe('availability', () => {
  const NOW = '2026-08-20T16:00:00.000Z'
  const LATER = new Date(Date.parse(NOW) + PENDING_HOLD_MS).toISOString()
  it('counts confirmed, picked_up, and unexpired pending; ignores expired pending and refunded', () => {
    const sold = soldByProduct([
      { status: 'confirmed', lines: [{ product_id: 'p1', qty: 3 }] },
      { status: 'picked_up', lines: [{ product_id: 'p1', qty: 2 }] },
      { status: 'pending', expires_at: LATER, lines: [{ product_id: 'p1', qty: 1 }] },
      { status: 'pending', expires_at: '2026-08-20T15:00:00.000Z', lines: [{ product_id: 'p1', qty: 4 }] },
      { status: 'refunded', lines: [{ product_id: 'p1', qty: 5 }] },
    ], NOW)
    expect(sold.get('p1')).toBe(6)
    expect(availableStock(ITEMS[0], sold)).toBe(4)
  })
  it('unlimited stock returns null availability and always fits', () => {
    const sold = soldByProduct([], NOW)
    expect(availableStock(ITEMS[1], sold)).toBeNull()
    expect(cartFits(ITEMS, [{ product_id: 'p2', qty: 40 }], sold)).toEqual({ ok: true })
  })
  it('cartFits names the item that does not fit', () => {
    const sold = soldByProduct([{ status: 'confirmed', lines: [{ product_id: 'p1', qty: 9 }] }], NOW)
    expect(cartFits(ITEMS, [{ product_id: 'p1', qty: 2 }], sold)).toEqual({ ok: false, name: 'Vanilla Latte' })
    expect(cartFits(ITEMS, [{ product_id: 'p1', qty: 1 }], sold)).toEqual({ ok: true })
  })
})
