import type { InvoiceLifecycle, InvoiceLineItem } from '@/lib/types'
import { invoiceTotal } from '@/lib/invoices'

export class InvoiceScopeError extends Error {
  constructor(message: string) { super(message); this.name = 'InvoiceScopeError' }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }

export function previouslyBilled(
  invoices: ReadonlyArray<{ lifecycle: InvoiceLifecycle; source?: { id?: string }; line_items: InvoiceLineItem[] }>,
  sourceId: string,
): number {
  return round2(
    invoices
      .filter((i) => i.lifecycle === 'issued' && i.source?.id === sourceId)
      .reduce((sum, i) => sum + invoiceTotal(i.line_items), 0),
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
