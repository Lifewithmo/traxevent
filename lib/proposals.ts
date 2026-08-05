import type {
  Proposal,
  ProposalLineItem,
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
