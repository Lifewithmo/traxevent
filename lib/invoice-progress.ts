import type { InvoiceLifecycle, InvoiceLineItem, InvoiceDiscount, InvoiceCredit, Proposal } from '@/lib/types'
import { invoiceAmountDue } from '@/lib/invoices'
import {
  computeSelectedTotal,
  isComposedPackage,
  lineItemSubtotal,
  packageMemberItems,
} from '@/lib/proposals'

export class InvoiceScopeError extends Error {
  constructor(message: string) { super(message); this.name = 'InvoiceScopeError' }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }

export function previouslyBilled(
  invoices: ReadonlyArray<{
    lifecycle: InvoiceLifecycle
    source?: { id?: string }
    line_items: InvoiceLineItem[]
    discount?: InvoiceDiscount
    tax_rate?: number
    credits?: InvoiceCredit[]
  }>,
  sourceId: string,
): number {
  return round2(
    invoices
      .filter((i) => i.lifecycle === 'sent' && i.source?.id === sourceId)
      .reduce((sum, i) => sum + invoiceAmountDue(i), 0),
  )
}

export function remainingToBill(approved: number, billed: number): number {
  return round2(approved - billed)
}

export function assertWithinScope(newTotal: number, billed: number, approved: number): void {
  const overage = round2(newTotal + billed - approved)
  if (overage > 0) {
    throw new InvoiceScopeError(`Invoice exceeds approved scope by $${overage.toFixed(2)}`)
  }
}

export function acceptedProposalTotal(
  proposal: Pick<Proposal, 'packages' | 'line_items' | 'discount' | 'tax_rate' | 'selection'>,
): number {
  return proposal.selection?.selected_total ?? computeSelectedTotal(proposal, { optional_item_ids: [] })
}

export function proposalInvoiceLines(
  proposal: Pick<Proposal, 'id' | 'packages' | 'line_items' | 'selection'>,
): InvoiceLineItem[] {
  const src = { type: 'proposal' as const, id: proposal.id }
  const sel = proposal.selection
  const items = proposal.line_items ?? []
  const lines: InvoiceLineItem[] = []
  const pkgs = proposal.packages ?? []
  if (pkgs.length > 0 && sel?.package_id) {
    const pkg = pkgs.find((p) => p.id === sel.package_id)
    if (pkg && isComposedPackage(pkg)) {
      // v2 composed tier: the accepted selection itemizes into its member
      // items — "every accepted selection becomes structured business data".
      const members = packageMemberItems(pkg, items)
      for (const m of members) {
        lines.push({ description: m.description, quantity: m.quantity, unit_price: m.unit_price, source: src })
      }
      // A price_override that differs from the computed sum is real agreed
      // money the member lines don't carry — emit the delta as its own
      // package-level adjustment line (negative for a round-down override).
      if (pkg.price_override !== undefined) {
        const sum = round2(members.reduce((s, m) => s + lineItemSubtotal(m), 0))
        const delta = round2(pkg.price_override - sum)
        if (delta !== 0) {
          lines.push({
            description: `Package price adjustment — ${pkg.name}`,
            quantity: 1,
            unit_price: delta,
            source: src,
          })
        }
      }
    } else if (pkg) {
      lines.push({ description: pkg.name, quantity: 1, unit_price: pkg.price, source: src })
    }
  } else {
    for (const i of items.filter((i) => i.optional !== true)) {
      lines.push({ description: i.description, quantity: i.quantity, unit_price: i.unit_price, source: src })
    }
  }
  const chosen = new Set(sel?.optional_item_ids ?? [])
  for (const i of items.filter((i) => i.optional === true && i.id !== undefined && chosen.has(i.id))) {
    lines.push({ description: i.description, quantity: i.quantity, unit_price: i.unit_price, source: src })
  }
  return lines
}
