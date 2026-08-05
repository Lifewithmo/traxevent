import type { Invoice, InvoiceLineItem, InvoicePayment, InvoiceStatus } from '@/lib/types'

export const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'partial', 'paid', 'void']

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partially paid',
  paid: 'Paid',
  void: 'Void',
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function lineItemSubtotal(item: InvoiceLineItem): number {
  const qty = item.quantity
  const price = item.unit_price
  if (!(qty > 0) || !(price > 0)) return 0
  return round2(qty * price)
}

export function invoiceTotal(lineItems: InvoiceLineItem[]): number {
  return round2(lineItems.reduce((sum, item) => sum + lineItemSubtotal(item), 0))
}

export function amountPaid(payments: InvoicePayment[]): number {
  return round2(payments.reduce((sum, p) => sum + (p.amount > 0 ? p.amount : 0), 0))
}

export function tipsTotal(payments: InvoicePayment[]): number {
  return round2(payments.reduce((sum, p) => sum + ((p.tip_amount ?? 0) > 0 ? (p.tip_amount as number) : 0), 0))
}

export function invoiceBalance(invoice: Pick<Invoice, 'line_items' | 'payments'>): number {
  return round2(invoiceTotal(invoice.line_items) - amountPaid(invoice.payments))
}

// Derive the paid/partial status after a payment; `fallback` is used when nothing is paid
// (so a draft stays draft, a sent invoice stays sent).
export function paymentStatus(total: number, paid: number, fallback: InvoiceStatus): InvoiceStatus {
  if (total > 0 && paid >= total) return 'paid'
  if (paid > 0) return 'partial'
  return fallback
}
