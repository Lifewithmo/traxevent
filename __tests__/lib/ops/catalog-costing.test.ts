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

// Legacy shape derive.ts documents as real: a unit_cost with no unit to denominate
// it in. Kept out of `resources` so the uncostedConsumables fixture stays exact
// (it has a unit_cost, so it is not "still needs pricing" — it needs a UNIT).
const withSyrup: OpsResource[] = [
  ...resources,
  { id: 'res-syrup', name: 'Simple syrup', kind: 'consumable', unit_cost: 2.0, created_at: 't' },
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

  it('costs only the costed line and names the uncosted ingredient in gaps', () => {
    // Regression: one costed consumable used to mark the WHOLE package costed while
    // the uncosted line vanished from the figure with no signal.
    const p = pkg({
      id: 'wp-partial',
      max_guests: 100,
      lines: [
        { kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 1 },
        { kind: 'consumable', resource_id: 'res-napkins', qty_per_guest: 2 },
      ],
    })
    const [result] = computeCatalogCosting([p], resources)
    // beans: 1/guest × 100 guests = 100 oz × $0.55/oz = $55. Napkins (200 each, no
    // unit_cost) contribute nothing and are named instead of silently dropped.
    // toBeCloseTo because 100 × 0.55 is 55.00000000000001 in IEEE-754.
    expect(result.costed).toBe(true)
    expect(result.materials).toBeCloseTo(55, 10)
    expect(result.gaps).toEqual(['Napkins'])
  })

  it('names a dangling resource_id in gaps by its raw id and excludes it from materials', () => {
    const p = pkg({
      id: 'wp-dangling',
      max_guests: 100,
      lines: [
        { kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 1 },
        { kind: 'consumable', resource_id: 'res-ghost', qty_per_guest: 3 },
      ],
    })
    const [result] = computeCatalogCosting([p], resources)
    // beans: 100 oz × $0.55/oz = $55 (55.00000000000001 in IEEE-754). 'res-ghost'
    // resolves to no resource at all, so the raw id is the only honest label.
    expect(result.costed).toBe(true)
    expect(result.materials).toBeCloseTo(55, 10)
    expect(result.gaps).toEqual(['res-ghost'])
  })

  it('excludes a unit_cost with no unit rather than raw-multiplying the line quantity', () => {
    const p = pkg({
      id: 'wp-nounit',
      max_guests: 20,
      lines: [
        { kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 1 },
        { kind: 'consumable', resource_id: 'res-syrup', qty_per_guest: { qty: 0.5, unit: 'lb' } },
      ],
    })
    const [result] = computeCatalogCosting([p], withSyrup)
    // beans: 1/guest × 20 = 20 oz × $0.55/oz = $11 — the whole figure.
    expect(result.materials).toBe(11)
    // NOT the raw multiply: 0.5 lb/guest × 20 = 10 × $2.00 = $20, i.e. $11 + $20 = $31.
    expect(result.materials).not.toBe(31)
    expect(result.gaps).toEqual(['Simple syrup'])
  })

  it('yields the same result for the same physical quantity typed in different units', () => {
    // 0.5 lb === 8 oz. Under the old legacy-multiply branch these produced wildly
    // different dollar figures purely from which unit string was typed.
    const inLb = pkg({
      id: 'wp-lb',
      max_guests: 20,
      lines: [
        { kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 1 },
        { kind: 'consumable', resource_id: 'res-syrup', qty_per_guest: { qty: 0.5, unit: 'lb' } },
      ],
    })
    const inOz = pkg({
      ...inLb,
      id: 'wp-oz',
      lines: [
        { kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 1 },
        { kind: 'consumable', resource_id: 'res-syrup', qty_per_guest: { qty: 8, unit: 'oz' } },
      ],
    })
    const [lb, oz] = computeCatalogCosting([inLb, inOz], withSyrup)
    // Both: beans only → 20 oz × $0.55/oz = $11, syrup excluded either way.
    expect(lb.materials).toBe(11)
    expect(oz.materials).toBe(11)
    // Old behavior: lb → $11 + (0.5 × 20 × $2) = $31; oz → $11 + (8 × 20 × $2) = $331.
    expect(oz.materials).toBe(lb.materials)
    expect(lb.gaps).toEqual(['Simple syrup'])
    expect(oz.gaps).toEqual(['Simple syrup'])
  })

  it('flags no-capacity for max_guests of 0 instead of reporting $0 materials as costed', () => {
    const p = pkg({
      id: 'wp-zero',
      max_guests: 0,
      lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 1 }],
    })
    const [result] = computeCatalogCosting([p], resources)
    // 1/guest × 0 guests × $0.55 = $0 — a real number that reads as "free to fulfill".
    expect(result).toEqual({
      id: 'wp-zero', price: 1200, costed: false, materials: 0, gaps: [], reason: 'no-capacity',
    })
  })

  it('flags no-capacity for a negative max_guests and never reports negative materials', () => {
    const p = pkg({
      id: 'wp-negative',
      max_guests: -5,
      lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 1 }],
    })
    const [result] = computeCatalogCosting([p], resources)
    // Unguarded this was 1/guest × -5 × $0.55/oz = -$2.75.
    expect(result.costed).toBe(false)
    expect(result.reason).toBe('no-capacity')
    expect(result.materials).toBe(0)
    expect(result.materials).toBeGreaterThanOrEqual(0)
  })

  it('flags no-costed-ingredient when no consumable line is costable, whatever the failure mode', () => {
    const p = pkg({
      id: 'wp-none-costable',
      max_guests: 40,
      lines: [
        { kind: 'consumable', resource_id: 'res-napkins', qty_per_guest: 2 },     // no unit_cost
        { kind: 'consumable', resource_id: 'res-ghost', qty_per_guest: 1 },       // dangling
        { kind: 'consumable', resource_id: 'res-syrup', qty_per_guest: 0.5 },     // unit_cost, no unit
      ],
    })
    const [result] = computeCatalogCosting([p], withSyrup)
    // Nothing priceable: the old code saw syrup's unit_cost and reported
    // 0.5 × 40 × $2.00 = $40 as a complete figure.
    expect(result).toEqual({
      id: 'wp-none-costable', price: 1200, costed: false, materials: 0, gaps: [], reason: 'no-costed-ingredient',
    })
  })

  it('keeps packages independent and in input order', () => {
    const results = computeCatalogCosting(
      [
        pkg({
          id: 'a', price: 500, max_guests: 100,
          lines: [
            { kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 1 },
            { kind: 'consumable', resource_id: 'res-cups', qty_per_guest: 1 },
          ],
        }),
        pkg({ id: 'b', price: 600, max_guests: 0, lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 1 }] }),
        pkg({
          id: 'c', price: 700, max_guests: 50,
          lines: [
            { kind: 'consumable', resource_id: 'res-cups', qty_per_guest: 2 },
            { kind: 'consumable', resource_id: 'res-napkins', qty_per_guest: 1 },
          ],
        }),
        pkg({ id: 'd', price: 800, max_guests: 10, lines: [{ kind: 'labor', role: 'barista', count: 1 }] }),
      ],
      resources,
    )
    expect(results.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
    // a: 100 oz × $0.55 = $55 + 100 each × $0.12 = $12 → $67, nothing excluded.
    expect(results[0]).toEqual({ id: 'a', price: 500, costed: true, basis: 100, materials: 67, gaps: [] })
    expect(results[1]).toEqual({ id: 'b', price: 600, costed: false, materials: 0, gaps: [], reason: 'no-capacity' })
    // c: cups 2/guest × 50 = 100 each × $0.12/each = $12; napkins excluded and named.
    expect(results[2]).toEqual({ id: 'c', price: 700, costed: true, basis: 50, materials: 12, gaps: ['Napkins'] })
    expect(results[3]).toEqual({ id: 'd', price: 800, costed: false, materials: 0, gaps: [], reason: 'no-consumables' })
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

  it('returns that package price as both min and max for a single package', () => {
    expect(priceRange([pkg({ id: 'solo', price: 950 })])).toEqual({ min: 950, max: 950 })
  })

  it('returns min and max price across several packages', () => {
    const a = pkg({ id: 'a', price: 400 })
    const b = pkg({ id: 'b', price: 1200 })
    const c = pkg({ id: 'c', price: 800 })
    expect(priceRange([a, b, c])).toEqual({ min: 400, max: 1200 })
  })
})
