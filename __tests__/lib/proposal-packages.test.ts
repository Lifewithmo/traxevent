import { describe, it, expect } from 'vitest'
import {
  isComposedPackage,
  packageMemberItems,
  packagePrice,
  packageBullets,
  packageDisplayBullets,
} from '@/lib/proposals'
import type { ProposalLineItem, ProposalPackage } from '@/lib/types'

const items: ProposalLineItem[] = [
  { id: 'i1', description: 'Site setup', quantity: 1, unit_price: 500, unit: 'each' },
  { id: 'i2', description: 'Service hours', quantity: 8, unit_price: 120, unit: 'hr' },
  { id: 'i3', description: 'Premium bar', quantity: 1, unit_price: 900 },
  { id: 'i4', description: 'Zero-priced upgraded bullet', quantity: 1, unit_price: 0 },
]

const legacy: ProposalPackage = { id: 'l1', name: 'Classic', includes: ['Setup', 'Teardown'], price: 1200 }
const composed: ProposalPackage = { id: 'c1', name: 'Standard', includes: [], price: 0, item_ids: ['i1', 'i2'] }
const overridden: ProposalPackage = { id: 'c2', name: 'Best', includes: [], price: 0, item_ids: ['i1', 'i2', 'i3'], price_override: 2200 }

describe('isComposedPackage', () => {
  it('is true exactly when item_ids is present', () => {
    expect(isComposedPackage(legacy)).toBe(false)
    expect(isComposedPackage(composed)).toBe(true)
    expect(isComposedPackage({ ...legacy, item_ids: [] })).toBe(true) // empty pool still marks v2
  })
})

describe('packageMemberItems', () => {
  it('resolves members in item_ids order', () => {
    const pkg: ProposalPackage = { ...composed, item_ids: ['i2', 'i1'] }
    expect(packageMemberItems(pkg, items).map((i) => i.id)).toEqual(['i2', 'i1'])
  })
  it('skips unresolvable ids', () => {
    const pkg: ProposalPackage = { ...composed, item_ids: ['i1', 'ghost', 'i3'] }
    expect(packageMemberItems(pkg, items).map((i) => i.id)).toEqual(['i1', 'i3'])
  })
  it('is empty for legacy packages', () => {
    expect(packageMemberItems(legacy, items)).toEqual([])
  })
})

describe('packagePrice', () => {
  it('legacy → the stored flat price', () => {
    expect(packagePrice(legacy, items)).toBe(1200)
  })
  it('composed → sum of member subtotals (qty × unit_price, rounded)', () => {
    expect(packagePrice(composed, items)).toBe(500 + 8 * 120)
  })
  it('composed with price_override → the override wins', () => {
    expect(packagePrice(overridden, items)).toBe(2200)
  })
  it('non-positive qty/price members contribute 0 (lineItemSubtotal semantics)', () => {
    const pkg: ProposalPackage = { ...composed, item_ids: ['i1', 'i4'] }
    expect(packagePrice(pkg, items)).toBe(500)
  })
  it('rounds the composed sum to cents', () => {
    const dec: ProposalLineItem[] = [
      { id: 'd1', description: 'A', quantity: 3, unit_price: 0.1 },
      { id: 'd2', description: 'B', quantity: 1, unit_price: 0.2 },
    ]
    const pkg: ProposalPackage = { ...composed, item_ids: ['d1', 'd2'] }
    expect(packagePrice(pkg, dec)).toBe(0.5)
  })
})

describe('packageBullets', () => {
  it('legacy → includes lines', () => {
    expect(packageBullets(legacy, items)).toEqual(['Setup', 'Teardown'])
  })
  it('composed → member descriptions in item_ids order; includes ignored even if present', () => {
    const pkg: ProposalPackage = { ...composed, includes: ['stale bullet'], item_ids: ['i2', 'i1'] }
    expect(packageBullets(pkg, items)).toEqual(['Service hours', 'Site setup'])
  })
})

describe('packageDisplayBullets (superset collapse)', () => {
  const good: ProposalPackage = { id: 'g', name: 'Good', includes: [], price: 0, item_ids: ['i1', 'i2'] }
  const best: ProposalPackage = { id: 'b', name: 'Best', includes: [], price: 0, item_ids: ['i1', 'i2', 'i3'] }
  const pkgs = [good, best]

  it('collapses a strict superset to "Everything in {A}" + the remainder', () => {
    expect(packageDisplayBullets(best, pkgs, items)).toEqual({
      everything_in: 'Good',
      bullets: ['Premium bar'],
    })
  })
  it('the subset tier itself does not collapse', () => {
    expect(packageDisplayBullets(good, pkgs, items)).toEqual({ bullets: ['Site setup', 'Service hours'] })
  })
  it('no collapse when memberships are equal', () => {
    const twin: ProposalPackage = { ...good, id: 'twin', name: 'Twin' }
    expect(packageDisplayBullets(good, [good, twin], items)).toEqual({ bullets: ['Site setup', 'Service hours'] })
  })
  it('no collapse against a non-subset tier', () => {
    const other: ProposalPackage = { id: 'o', name: 'Other', includes: [], price: 0, item_ids: ['i1', 'i4'] }
    expect(packageDisplayBullets(best, [other, best], items)).toEqual({
      bullets: ['Site setup', 'Service hours', 'Premium bar'],
    })
  })
  it('legacy packages never collapse and never serve as a base', () => {
    expect(packageDisplayBullets(legacy, [legacy, best], items)).toEqual({ bullets: ['Setup', 'Teardown'] })
    expect(packageDisplayBullets(best, [legacy, best], items)).toEqual({
      bullets: ['Site setup', 'Service hours', 'Premium bar'],
    })
  })
  it('picks the largest strict subset as the base', () => {
    const mini: ProposalPackage = { id: 'm', name: 'Mini', includes: [], price: 0, item_ids: ['i1'] }
    expect(packageDisplayBullets(best, [mini, good, best], items)).toEqual({
      everything_in: 'Good',
      bullets: ['Premium bar'],
    })
  })
  it('breaks size ties by array order', () => {
    const alt: ProposalPackage = { id: 'a', name: 'Alt', includes: [], price: 0, item_ids: ['i2', 'i1'] }
    expect(packageDisplayBullets(best, [good, alt, best], items)).toEqual({
      everything_in: 'Good',
      bullets: ['Premium bar'],
    })
  })
})
