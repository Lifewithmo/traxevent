// ============================================================================
// TEMPORARY TRACK-C STUBS — DELETE AT INTEGRATION
//
// Contract types copied VERBATIM from spec §1/§2
// (docs/superpowers/specs/2026-08-07-proposal-builder-redesign-design.md).
// Track A lands the real types in lib/types.ts and the real pricing helpers
// in lib/proposals.ts; Track B lands OrgBranding. The integration session
// deletes this module (and actions/proposal-builder-stubs.ts, and
// components/proposals/ProposalThemeStub.tsx) after rebasing Track C onto
// Tracks A + B, repointing every import here at the real modules.
// ============================================================================

// —— spec §1 (verbatim) ——————————————————————————————————————————————————————

export interface ProposalLineItem {
  id?: string
  description: string
  quantity: number
  unit_price: number           // dollars
  unit?: string                // NEW, optional: "hr", "each", "day" — display + future invoicing
  optional?: boolean           // unchanged: customer-toggleable add-on
  taxable?: boolean            // unchanged
}

export interface ProposalPackage {
  id: string
  name: string
  description?: string
  // LEGACY pair — written only by pre-v2 documents. A package with no
  // `item_ids` is legacy: `includes` + `price` are authoritative, read-only.
  includes: string[]
  price: number                // legacy: authoritative flat price.
                               // composed: DERIVED (see below), stored denormalized.
  // COMPOSED pair — presence of `item_ids` marks a v2 package.
  item_ids?: string[]          // ordered refs into the proposal's line_items pool
  price_override?: number      // optional round-number override of the computed sum
  recommended?: boolean
}

// —— spec §2 (verbatim) ——————————————————————————————————————————————————————

export interface OrgBranding {
  display_name?: string        // customer-facing; falls back to org name
  logo_url?: string
  cover_image_url?: string     // hero behind the proposal title
  accent_color?: string        // #rrggbb
  secondary_color?: string     // #rrggbb
}

// —— spec §3: placeholder flag on every block variant ————————————————————————

import type {
  ProposalBlock,
  ProposalDiscount,
  ProposalDeposit,
} from '@/lib/types'

export type PlaceholderBlock = ProposalBlock & { placeholder?: boolean }

// —— spec §5: consolidated draft payload for updateProposalDraft —————————————

export interface ProposalDraftUpdate {
  title?: string
  notes?: string
  blocks?: PlaceholderBlock[]
  line_items?: ProposalLineItem[]
  packages?: ProposalPackage[]
  discount?: ProposalDiscount
  tax_rate?: number
  deposit?: ProposalDeposit
  deposit_gate?: 'before_accept' | 'after_accept'
  deposit_terms?: string
  expires_at?: string
}

// —— spec §1: upgraded AI suggested-package shape ————————————————————————————

export interface SuggestedPackageV2 {
  name: string
  description?: string
  recommended?: boolean
  items: Array<{ description: string; quantity: number; unit_price: number; optional?: boolean }>
}

// —— Pure helpers mirroring Track A's lib/proposals.ts additions —————————————
// (packagePrice / superset detection / legacy adapter per spec §1 semantics)

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function memberItems(pkg: ProposalPackage, items: ProposalLineItem[]): ProposalLineItem[] {
  const byId = new Map(items.filter((i) => i.id).map((i) => [i.id as string, i]))
  return (pkg.item_ids ?? []).flatMap((id) => {
    const item = byId.get(id)
    return item ? [item] : []
  })
}

/** Composed tier price = Σ member items, unless price_override; legacy = flat price. */
export function packagePrice(pkg: ProposalPackage, items: ProposalLineItem[]): number {
  if (!pkg.item_ids) return pkg.price
  if (pkg.price_override !== undefined) return pkg.price_override
  return round2(
    memberItems(pkg, items).reduce((sum, i) => sum + i.quantity * i.unit_price, 0),
  )
}

/** Tier bullets ARE the member items' descriptions, in item_ids order; legacy = includes. */
export function packageBullets(pkg: ProposalPackage, items: ProposalLineItem[]): string[] {
  if (!pkg.item_ids) return pkg.includes
  return memberItems(pkg, items).map((i) => i.description)
}

/**
 * Superset display (spec §1): when this tier's item_ids ⊇ another tier's (and
 * the other has fewer members), the renderer collapses the shared prefix to
 * "Everything in {other}". Returns the largest such base tier, or undefined.
 * Display-only; legacy packages never participate.
 */
export function supersetBase(
  pkg: ProposalPackage,
  allPackages: ProposalPackage[],
): ProposalPackage | undefined {
  if (!pkg.item_ids) return undefined
  const own = new Set(pkg.item_ids)
  let best: ProposalPackage | undefined
  for (const other of allPackages) {
    if (other.id === pkg.id || !other.item_ids) continue
    if (other.item_ids.length >= own.size) continue
    if (!other.item_ids.every((id) => own.has(id))) continue
    if (!best || other.item_ids.length > (best.item_ids?.length ?? 0)) best = other
  }
  return best
}

/**
 * Upgrade-on-open adapter (spec §1, drafts/sent-unsigned only — the CALLER
 * enforces that): converts each legacy bullet to a qty-1 / price-0 line item
 * appended to the pool, sets item_ids, and sets price_override to the old
 * flat price. Customer-visible output is identical before and after.
 * Pure and idempotent; composed packages pass through untouched.
 */
export function upgradeLegacyPackages(
  lineItems: ProposalLineItem[],
  packages: ProposalPackage[],
): { line_items: ProposalLineItem[]; packages: ProposalPackage[] } {
  if (packages.every((p) => p.item_ids)) return { line_items: lineItems, packages }

  const line_items = [...lineItems]
  let seq = 0
  const upgraded = packages.map((pkg) => {
    if (pkg.item_ids) return pkg
    const item_ids = pkg.includes.map((bullet) => {
      const id = `up-${pkg.id}-${seq++}`
      line_items.push({ id, description: bullet, quantity: 1, unit_price: 0 })
      return id
    })
    return { ...pkg, includes: [], item_ids, price_override: pkg.price }
  })
  return { line_items, packages: upgraded }
}
