import { describe, it, expect } from 'vitest'
import { upgradeLegacyProposal } from '@/lib/proposals/upgrade'
import { computeSelectedTotal, packageBullets, packagePrice } from '@/lib/proposals'
import type { Proposal, ProposalLineItem, ProposalPackage } from '@/lib/types'

type PricingSlice = Pick<Proposal, 'line_items' | 'packages'>

const legacyProposal = (): PricingSlice => ({
  line_items: [
    { id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true },
  ],
  packages: [
    { id: 'good', name: 'Good', includes: ['Install', 'Cleanup'], price: 12500 },
    { id: 'best', name: 'Best', includes: ['Install', 'Cleanup', 'Warranty'], price: 15000, recommended: true },
  ],
})

describe('upgradeLegacyProposal', () => {
  it('converts each bullet to a qty-1/price-0 pool item and refs it from item_ids', () => {
    const out = upgradeLegacyProposal(legacyProposal())
    expect(out.changed).toBe(true)
    const good = out.packages.find((p) => p.id === 'good') as ProposalPackage
    expect(good.item_ids).toHaveLength(2)
    const members = good.item_ids!.map(
      (id) => out.line_items.find((i) => i.id === id) as ProposalLineItem,
    )
    expect(members.map((m) => m.description)).toEqual(['Install', 'Cleanup'])
    for (const m of members) {
      expect(m.quantity).toBe(1)
      expect(m.unit_price).toBe(0)
    }
  })

  it('sets price_override to the old flat price and keeps price denormalized to it', () => {
    const out = upgradeLegacyProposal(legacyProposal())
    const good = out.packages.find((p) => p.id === 'good') as ProposalPackage
    expect(good.price_override).toBe(12500)
    expect(good.price).toBe(12500)
    expect(packagePrice(good, out.line_items)).toBe(12500)
  })

  it('empties includes on upgraded packages (never written for composed)', () => {
    const out = upgradeLegacyProposal(legacyProposal())
    for (const p of out.packages) expect(p.includes).toEqual([])
  })

  it('preserves the existing pool and appends after it', () => {
    const out = upgradeLegacyProposal(legacyProposal())
    expect(out.line_items[0]).toEqual({ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true })
    expect(out.line_items.length).toBe(1 + 2 + 3)
  })

  it('mints collision-safe ids against the existing pool', () => {
    const input: PricingSlice = {
      line_items: [{ id: 'good-inc-0', description: 'Squatter', quantity: 1, unit_price: 5 }],
      packages: [{ id: 'good', name: 'Good', includes: ['Install'], price: 100 }],
    }
    const out = upgradeLegacyProposal(input)
    const good = out.packages[0]
    expect(good.item_ids).toHaveLength(1)
    expect(good.item_ids![0]).not.toBe('good-inc-0')
    const ids = out.line_items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is idempotent: upgrading an upgraded document changes nothing', () => {
    const once = upgradeLegacyProposal(legacyProposal())
    const twice = upgradeLegacyProposal({ line_items: once.line_items, packages: once.packages })
    expect(twice.changed).toBe(false)
    expect(twice.line_items).toEqual(once.line_items)
    expect(twice.packages).toEqual(once.packages)
  })

  it('reports changed:false and passes through when there are no legacy packages', () => {
    const noPkgs: PricingSlice = { line_items: [{ id: 'x', description: 'Solo', quantity: 1, unit_price: 10 }] }
    const out = upgradeLegacyProposal(noPkgs)
    expect(out.changed).toBe(false)
    expect(out.packages).toEqual([])
    expect(out.line_items).toEqual(noPkgs.line_items)
  })

  it('customer-visible output is identical before and after (totals and bullets)', () => {
    const before = legacyProposal()
    const out = upgradeLegacyProposal(before)
    const after: PricingSlice = { line_items: out.line_items, packages: out.packages }
    for (const pkgId of ['good', 'best']) {
      for (const optional of [[], ['o1']]) {
        const sel = { package_id: pkgId, optional_item_ids: optional }
        expect(computeSelectedTotal(after, sel)).toBe(computeSelectedTotal(before, sel))
      }
      const beforePkg = before.packages!.find((p) => p.id === pkgId)!
      const afterPkg = out.packages.find((p) => p.id === pkgId)!
      expect(packageBullets(afterPkg, out.line_items)).toEqual(beforePkg.includes)
    }
  })
})
