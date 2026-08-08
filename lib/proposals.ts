import type {
  Proposal,
  ProposalLineItem,
  ProposalPackage,
  ProposalStatus,
  ProposalDiscount,
  ProposalDeposit,
  ProposalSelection,
} from '@/lib/types'

export const PROPOSAL_STATUSES: ProposalStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'voided']

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
  voided: 'Voided',
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Subtotal for one line item; non-positive qty or price yields 0.
export function lineItemSubtotal(item: ProposalLineItem): number {
  const qty = item.quantity
  const price = item.unit_price
  if (!(qty > 0) || !(price > 0)) return 0
  return round2(qty * price)
}

export function proposalTotal(lineItems: ProposalLineItem[]): number {
  return round2(lineItems.reduce((sum, item) => sum + lineItemSubtotal(item), 0))
}

// Base for an itemized proposal = sum of REQUIRED items (optional !== true).
function requiredItemsSubtotal(items: ProposalLineItem[]): number {
  return round2(
    items.filter((i) => i.optional !== true).reduce((s, i) => s + lineItemSubtotal(i), 0),
  )
}

export function discountAmount(subtotal: number, discount?: ProposalDiscount): number {
  if (!discount || !(discount.value > 0)) return 0
  const raw = discount.type === 'percent' ? (subtotal * discount.value) / 100 : discount.value
  return round2(Math.min(raw, subtotal))
}

export function depositAmount(total: number, deposit?: ProposalDeposit): number {
  if (!deposit || !(deposit.value > 0)) return 0
  const raw = deposit.type === 'percent' ? (total * deposit.value) / 100 : deposit.value
  return round2(Math.min(raw, total))
}

// Presence of `item_ids` marks a v2 composed package — even an empty array
// (a composed tier whose members were all removed is still composed, not
// suddenly a legacy flat-price tier).
export function isComposedPackage(pkg: ProposalPackage): boolean {
  return Array.isArray(pkg.item_ids)
}

// Member items resolved in `item_ids` order. Unresolvable refs are skipped:
// by the time a document is read the write path has already validated refs,
// so a dangling id here is stale data to render around, not an error to throw.
export function packageMemberItems(pkg: ProposalPackage, items: ProposalLineItem[]): ProposalLineItem[] {
  if (!Array.isArray(pkg.item_ids)) return []
  const byId = new Map(items.filter((i) => i.id !== undefined).map((i) => [i.id as string, i]))
  return pkg.item_ids.flatMap((id) => {
    const item = byId.get(id)
    return item ? [item] : []
  })
}

// The customer price of a tier. Legacy: the stored flat price is authoritative.
// Composed: Σ member subtotals, unless price_override is set. The write path
// stores this result denormalized into `price` so existing readers of
// `pkg.price` (totals, signing, invoicing) keep working unmodified.
export function packagePrice(pkg: ProposalPackage, items: ProposalLineItem[]): number {
  if (!isComposedPackage(pkg)) return pkg.price
  if (typeof pkg.price_override === 'number') return pkg.price_override
  return round2(packageMemberItems(pkg, items).reduce((s, i) => s + lineItemSubtotal(i), 0))
}

// Tier bullets ARE the member items' descriptions for composed packages;
// `includes` is ignored when `item_ids` is present (legacy-only field).
export function packageBullets(pkg: ProposalPackage, items: ProposalLineItem[]): string[] {
  if (!isComposedPackage(pkg)) return pkg.includes ?? []
  return packageMemberItems(pkg, items).map((i) => i.description)
}

// Superset display collapse (display-only, pure): when this tier's members
// are a strict superset of another composed tier's, the shared portion
// collapses to "Everything in {base}". The base is the largest strict subset
// (ties broken by array order); remaining bullets keep item_ids order.
export function packageDisplayBullets(
  pkg: ProposalPackage,
  packages: ProposalPackage[],
  items: ProposalLineItem[],
): { everything_in?: string; bullets: string[] } {
  if (!isComposedPackage(pkg)) return { bullets: pkg.includes ?? [] }
  const memberIds = new Set(pkg.item_ids ?? [])
  let base: ProposalPackage | undefined
  for (const other of packages) {
    if (other.id === pkg.id || !isComposedPackage(other)) continue
    const otherIds = other.item_ids ?? []
    if (otherIds.length >= memberIds.size) continue
    if (!otherIds.every((id) => memberIds.has(id))) continue
    if (!base || otherIds.length > (base.item_ids?.length ?? 0)) base = other
  }
  if (!base) return { bullets: packageBullets(pkg, items) }
  const baseIds = new Set(base.item_ids ?? [])
  const rest = { ...pkg, item_ids: (pkg.item_ids ?? []).filter((id) => !baseIds.has(id)) }
  return { everything_in: base.name, bullets: packageBullets(rest, items) }
}

type Priceable = Pick<Proposal, 'packages' | 'line_items' | 'discount' | 'tax_rate'>
type Choice = Pick<ProposalSelection, 'package_id' | 'optional_item_ids'>

// The authoritative total for a given customer selection.
export function computeSelectedTotal(proposal: Priceable, selection: Choice): number {
  const items = proposal.line_items ?? []
  const packages = proposal.packages ?? []
  const base =
    packages.length > 0
      ? (packages.find((p) => p.id === selection.package_id)?.price ?? 0)
      : requiredItemsSubtotal(items)
  const chosen = new Set(selection.optional_item_ids ?? [])
  const addons = round2(
    items
      .filter((i) => i.optional === true && i.id !== undefined && chosen.has(i.id))
      .reduce((s, i) => s + lineItemSubtotal(i), 0),
  )
  const subtotal = round2(base + addons)
  const discountA = discountAmount(subtotal, proposal.discount)
  const taxable = round2(subtotal - discountA)
  const taxA = round2((taxable * (proposal.tax_rate ?? 0)) / 100)
  return round2(subtotal - discountA + taxA)
}

export function proposalRange(proposal: Priceable): { min: number; max: number } {
  const items = proposal.line_items ?? []
  const packages = proposal.packages ?? []
  const optionalIds = items
    .filter((i) => i.optional === true && i.id !== undefined)
    .map((i) => i.id!) as string[]
  const byPrice = [...packages].sort((a, b) => a.price - b.price)
  const cheapest = byPrice[0]?.id
  const dearest = byPrice[byPrice.length - 1]?.id
  const min = computeSelectedTotal(proposal, { package_id: cheapest, optional_item_ids: [] })
  const max = computeSelectedTotal(proposal, { package_id: dearest, optional_item_ids: optionalIds })
  return { min, max }
}

// Display-safe range for list views. An accepted proposal shows its locked
// selection total (not a recomputed guess); anything else shows proposalRange.
export function proposalDisplayRange(
  proposal: Priceable & Pick<Proposal, 'selection'>,
): { min: number; max: number } {
  const selectedTotal = proposal.selection?.selected_total
  if (selectedTotal != null) return { min: selectedTotal, max: selectedTotal }
  return proposalRange(proposal)
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

// The single source of truth for "what instant does this proposal's
// expires_at resolve to" — used by both signing guards (actions/
// proposals-public.ts, the before_accept deposit-intent route) and by the
// customer-facing "This proposal expires ..." display, so all three can
// never disagree.
//
// The admin editor's expiry field is a bare <input type="date">, which is
// the ONLY format this field holds in practice (not an edge case to shrug
// off). A bare YYYY-MM-DD parsed the naive way (`new Date('2026-08-06')`)
// resolves to 2026-08-06T00:00:00Z — i.e. the proposal would already read as
// expired for the entire day the admin meant to include. So a date-only
// value is resolved to the END of that calendar day (23:59:59.999 UTC)
// instead, meaning the whole named day is still valid. A value that already
// carries a time component (e.g. a full ISO datetime) is used as-is.
//
// An unparseable value deliberately does NOT resolve to "expired": returning
// +Infinity means such a proposal is never treated as past its expiry.
// Silently bricking a proposal because of a malformed stored date string
// would be worse than not enforcing expiry at all — enforcement here is
// fail-closed on genuine expiry, not fail-closed on bad data.
//
// KNOWN RESIDUAL: resolving to end-of-day UTC (not end-of-day in the
// customer's own local time) still cuts a proposal off early for anyone west
// of UTC — e.g. a Pacific-time customer loses several hours of their final
// valid day. Fixing that properly needs an org- or customer-level timezone,
// which this data model does not have. End-of-day UTC is the improvement
// available without inventing one.
export function proposalExpiryInstant(expiresAt: string): number {
  if (DATE_ONLY.test(expiresAt)) {
    return new Date(`${expiresAt}T23:59:59.999Z`).getTime()
  }
  const t = new Date(expiresAt).getTime()
  return Number.isNaN(t) ? Infinity : t
}
