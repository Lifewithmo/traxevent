import type { InvoiceLifecycle, InvoiceLineItem, InvoiceDiscount, InvoiceCredit, Proposal } from '@/lib/types'
import { invoiceAmountDue } from '@/lib/invoices'
import { computeSelectedTotal } from '@/lib/proposals'

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
      .filter((i) => i.lifecycle === 'issued' && i.source?.id === sourceId)
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
