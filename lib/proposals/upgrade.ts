import type { Proposal, ProposalLineItem, ProposalPackage } from '@/lib/types'
import { isComposedPackage } from '@/lib/proposals'

export interface UpgradeResult {
  line_items: ProposalLineItem[]
  packages: ProposalPackage[]
  changed: boolean
}

/**
 * Pure upgrade-on-open adapter (spec §1, legacy compatibility): converts each
 * legacy package's `includes` bullets into qty-1 / price-0 line items appended
 * to the pool, sets `item_ids`, and sets `price_override` to the old flat
 * price — so the computed customer price and the rendered bullets are
 * IDENTICAL before and after. One-way; no downgrade path.
 *
 * Deterministic and idempotent: ids are minted as `{pkgId}-inc-{n}` (walking
 * n past any collision with the existing pool), composed packages and the
 * existing pool pass through untouched, and `changed: false` means the inputs
 * were returned as-is — the caller (the builder, at open time) only persists
 * when `changed` is true, and only on the first autosave; opening read-only
 * never writes.
 */
export function upgradeLegacyProposal(p: Pick<Proposal, 'line_items' | 'packages'>): UpgradeResult {
  const pool = p.line_items ?? []
  const packages = p.packages ?? []
  if (!packages.some((pkg) => !isComposedPackage(pkg))) {
    return { line_items: pool, packages, changed: false }
  }

  const usedIds = new Set(pool.filter((i) => i.id !== undefined).map((i) => i.id as string))
  const appended: ProposalLineItem[] = []

  const upgraded = packages.map((pkg) => {
    if (isComposedPackage(pkg)) return pkg
    const itemIds: string[] = []
    ;(pkg.includes ?? []).forEach((bullet, index) => {
      let n = index
      while (usedIds.has(`${pkg.id}-inc-${n}`)) n += 1
      const id = `${pkg.id}-inc-${n}`
      usedIds.add(id)
      itemIds.push(id)
      appended.push({ id, description: bullet, quantity: 1, unit_price: 0 })
    })
    const { includes: _includes, ...rest } = pkg
    return { ...rest, includes: [], item_ids: itemIds, price_override: pkg.price, price: pkg.price }
  })

  return { line_items: [...pool, ...appended], packages: upgraded, changed: true }
}
