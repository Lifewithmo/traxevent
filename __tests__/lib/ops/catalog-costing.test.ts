import { describe, it, expect } from 'vitest'
import { computeCatalogCosting, uncostedConsumables, priceRange } from '@/lib/ops/catalog-costing'
import type { WorkPackage, OpsResource } from '@/lib/types'

const resources: OpsResource[] = [
  { id: 'res-beans', name: 'Espresso beans', kind: 'consumable', unit: 'oz', unit_cost: 0.55, created_at: 't' },
  { id: 'res-cups', name: '12oz cups', kind: 'consumable', unit: 'each', unit_cost: 0.12, created_at: 't' },
  { id: 'res-napkins', name: 'Napkins', kind: 'consumable', created_at: 't' },
  { id: 'res-machine', name: 'Espresso Machine 02', kind: 'serialized', created_at: 't' },
  { id: 'res-tent', name: 'Tent', kind: 'reusable', created_at: 't' },
]

const pkg = (over: Partial<WorkPackage>): WorkPackage => ({
  id: 'wp1', name: 'Espresso Bar', price: 1200, lines: [], created_at: 't', ...over,
})

describe('computeCatalogCosting', () => {
  it('computes real materials cost for a fully costed package', () => {
    const p = pkg({
      id: 'wp-full',
      max_guests: 100,
      lines: [
        { kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 1 },
        { kind: 'consumable', resource_id: 'res-cups', qty_per_guest: 1 },
      ],
    })
    const [result] = computeCatalogCosting([p], resources)
    // beans: 100 oz × $0.55/oz = $55; cups: 100 each × $0.12/each = $12 → $67
    expect(result).toEqual({
      id: 'wp-full', price: 1200, costed: true, basis: 100, materials: 67, gaps: [],
    })
  })

  it('flags no-capacity and reports zero materials when max_guests is undefined', () => {
    const p = pkg({
      id: 'wp-nocap',
      lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 1 }],
    })
    const [result] = computeCatalogCosting([p], resources)
    expect(result).toEqual({
      id: 'wp-nocap', price: 1200, costed: false, materials: 0, gaps: [], reason: 'no-capacity',
    })
  })

  it('flags no-costed-ingredient when every consumable resource lacks unit_cost', () => {
    const p = pkg({
      id: 'wp-uncosted',
      max_guests: 50,
      lines: [{ kind: 'consumable', resource_id: 'res-napkins', qty_per_guest: 2 }],
    })
    const [result] = computeCatalogCosting([p], resources)
    expect(result).toEqual({
      id: 'wp-uncosted', price: 1200, costed: false, materials: 0, gaps: [], reason: 'no-costed-ingredient',
    })
  })

  it('flags no-consumables for a package with only equipment and labor lines', () => {
    const p = pkg({
      id: 'wp-equipment',
      max_guests: 50,
      lines: [
        { kind: 'equipment', resource_id: 'res-machine', qty: 1 },
        { kind: 'labor', role: 'barista', count: 2 },
      ],
    })
    const [result] = computeCatalogCosting([p], resources)
    expect(result).toEqual({
      id: 'wp-equipment', price: 1200, costed: false, materials: 0, gaps: [], reason: 'no-consumables',
    })
  })

  it('surfaces the resource name in gaps when a costed line has no conversion path, without failing costed status', () => {
    // mirrors __tests__/lib/ops/derive.test.ts:167-172 — 'shot' has no bridge for res-beans
    const p = pkg({
      id: 'wp-gap',
      max_guests: 100,
      lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: { qty: 2, unit: 'shot' } }],
    })
    const [result] = computeCatalogCosting([p], resources)
    expect(result.costed).toBe(true)
    expect(result.basis).toBe(100)
    expect(result.materials).toBe(0)
    expect(result.gaps).toEqual(['Espresso beans'])
  })

  it('never returns nonzero materials for an uncosted package', () => {
    const results = computeCatalogCosting(
      [
        pkg({ id: 'nocap', lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 1 }] }),
        pkg({
          id: 'uncosted', max_guests: 50,
          lines: [{ kind: 'consumable', resource_id: 'res-napkins', qty_per_guest: 1 }],
        }),
        pkg({
          id: 'equipment-only', max_guests: 50,
          lines: [{ kind: 'equipment', resource_id: 'res-machine', qty: 1 }],
        }),
      ],
      resources,
    )
    for (const r of results) {
      expect(r.costed).toBe(false)
      expect(r.materials).toBe(0)
    }
  })
})

describe('uncostedConsumables', () => {
  it('returns only consumable resources missing unit_cost, ignoring other kinds', () => {
    const result = uncostedConsumables(resources)
    expect(result).toEqual([{ id: 'res-napkins', name: 'Napkins', kind: 'consumable', created_at: 't' }])
  })
})

describe('priceRange', () => {
  it('is undefined for an empty package list', () => {
    expect(priceRange([])).toBeUndefined()
  })

  it('returns min and max price across several packages', () => {
    const a = pkg({ id: 'a', price: 400 })
    const b = pkg({ id: 'b', price: 1200 })
    const c = pkg({ id: 'c', price: 800 })
    expect(priceRange([a, b, c])).toEqual({ min: 400, max: 1200 })
  })
})
