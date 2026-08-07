// Tests for the TEMPORARY Track-C contract stubs. The stub module (and this
// file) are deleted by the integration session once Tracks A and B land the
// real implementations in lib/types.ts / lib/proposals.ts.
import { describe, it, expect } from 'vitest'
import {
  packagePrice,
  packageBullets,
  supersetBase,
  upgradeLegacyPackages,
  type ProposalLineItem,
  type ProposalPackage,
} from '@/lib/proposal-builder-stubs'

const items: ProposalLineItem[] = [
  { id: 'i1', description: 'Setup crew', quantity: 2, unit_price: 100, unit: 'hr' },
  { id: 'i2', description: 'Espresso bar', quantity: 1, unit_price: 500 },
  { id: 'i3', description: 'Late teardown', quantity: 1, unit_price: 150, optional: true },
]

function composed(over: Partial<ProposalPackage> = {}): ProposalPackage {
  return { id: 'p1', name: 'Better', includes: [], price: 0, item_ids: ['i1', 'i2'], ...over }
}

function legacy(over: Partial<ProposalPackage> = {}): ProposalPackage {
  return { id: 'l1', name: 'Classic', includes: ['One thing', 'Another'], price: 900, ...over }
}

describe('packagePrice', () => {
  it('sums member items (quantity × unit_price) for a composed package', () => {
    expect(packagePrice(composed(), items)).toBe(700)
  })

  it('prefers price_override over the computed sum', () => {
    expect(packagePrice(composed({ price_override: 650 }), items)).toBe(650)
  })

  it('returns the stored flat price for a legacy package', () => {
    expect(packagePrice(legacy(), items)).toBe(900)
  })

  it('ignores member ids that do not resolve', () => {
    expect(packagePrice(composed({ item_ids: ['i1', 'missing'] }), items)).toBe(200)
  })
})

describe('packageBullets', () => {
  it('uses member item descriptions in item_ids order for a composed package', () => {
    expect(packageBullets(composed({ item_ids: ['i2', 'i1'] }), items)).toEqual([
      'Espresso bar',
      'Setup crew',
    ])
  })

  it('ignores includes when item_ids is present', () => {
    expect(packageBullets(composed({ includes: ['stale'] }), items)).toEqual([
      'Setup crew',
      'Espresso bar',
    ])
  })

  it('uses includes for a legacy package', () => {
    expect(packageBullets(legacy(), items)).toEqual(['One thing', 'Another'])
  })
})

describe('supersetBase', () => {
  const a = composed({ id: 'a', name: 'Basic', item_ids: ['i1'] })
  const b = composed({ id: 'b', name: 'Better', item_ids: ['i1', 'i2'] })
  const c = composed({ id: 'c', name: 'Best', item_ids: ['i1', 'i2', 'i3'] })

  it('finds the largest strict subset tier', () => {
    expect(supersetBase(c, [a, b, c])?.id).toBe('b')
    expect(supersetBase(b, [a, b, c])?.id).toBe('a')
  })

  it('returns undefined for the smallest tier', () => {
    expect(supersetBase(a, [a, b, c])).toBeUndefined()
  })

  it('returns undefined when tiers do not nest', () => {
    const other = composed({ id: 'x', name: 'Other', item_ids: ['i3'] })
    expect(supersetBase(other, [a, other])).toBeUndefined()
  })

  it('never matches legacy packages on either side', () => {
    expect(supersetBase(legacy(), [a, legacy()])).toBeUndefined()
    expect(supersetBase(b, [legacy(), b])).toBeUndefined()
  })
})

describe('upgradeLegacyPackages', () => {
  it('converts each bullet to a qty-1 / price-0 pool item and overrides to the old flat price', () => {
    const result = upgradeLegacyPackages([...items], [legacy()])
    const pkg = result.packages[0]
    expect(pkg.item_ids).toHaveLength(2)
    expect(pkg.price_override).toBe(900)
    // Customer-visible output identical before and after.
    expect(packagePrice(pkg, result.line_items)).toBe(900)
    expect(packageBullets(pkg, result.line_items)).toEqual(['One thing', 'Another'])
    // New pool items are qty-1 / price-0 appended after the existing pool.
    const added = result.line_items.slice(items.length)
    expect(added).toHaveLength(2)
    for (const item of added) {
      expect(item.quantity).toBe(1)
      expect(item.unit_price).toBe(0)
    }
  })

  it('is a no-op on already-composed packages', () => {
    const input = { line_items: [...items], packages: [composed()] }
    const result = upgradeLegacyPackages(input.line_items, input.packages)
    expect(result.line_items).toEqual(input.line_items)
    expect(result.packages).toEqual(input.packages)
  })

  it('is idempotent — running the adapter on its own output changes nothing', () => {
    const once = upgradeLegacyPackages([...items], [legacy()])
    const twice = upgradeLegacyPackages(once.line_items, once.packages)
    expect(twice.line_items).toEqual(once.line_items)
    expect(twice.packages).toEqual(once.packages)
  })
})
