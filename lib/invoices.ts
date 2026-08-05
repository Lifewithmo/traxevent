import type { Invoice, InvoiceLineItem, InvoicePayment, InvoiceDiscount, InvoiceCredit } from '@/lib/types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function lineItemSubtotal(item: InvoiceLineItem): number {
  const qty = item.quantity
  const price = item.unit_price
  if (!(qty > 0) || !(price > 0)) return 0
  return round2(qty * price)
}

export function amountPaid(payments: InvoicePayment[]): number {
  return round2(payments.reduce((sum, p) => sum + (p.amount > 0 ? p.amount : 0), 0))
}

export function tipsTotal(payments: InvoicePayment[]): number {
  return round2(payments.reduce((sum, p) => sum + ((p.tip_amount ?? 0) > 0 ? (p.tip_amount as number) : 0), 0))
}

export function invoiceBalance(
  invoice: Pick<Invoice, 'line_items' | 'payments' | 'discount' | 'tax_rate' | 'credits'>,
): number {
  return round2(invoiceAmountDue(invoice) - amountPaid(invoice.payments))
}

export function linesSubtotal(lineItems: InvoiceLineItem[]): number {
  return round2(lineItems.reduce((s, i) => s + lineItemSubtotal(i), 0))
}
export function invoiceDiscountAmount(subtotal: number, discount?: InvoiceDiscount): number {
  if (!discount || !(discount.value > 0)) return 0
  const raw = discount.type === 'percent' ? (subtotal * discount.value) / 100 : discount.value
  return round2(Math.min(raw, subtotal))
}
export function invoiceTaxAmount(taxableBase: number, taxRate?: number): number {
  if (!(taxRate && taxRate > 0)) return 0
  return round2((taxableBase * taxRate) / 100)
}
export function creditsTotal(credits?: InvoiceCredit[]): number {
  return round2((credits ?? []).reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0))
}
type Breakdownable = Pick<Invoice, 'line_items' | 'discount' | 'tax_rate' | 'credits'>
export function invoiceGross(invoice: Breakdownable): number {
  const sub = linesSubtotal(invoice.line_items)
  const disc = invoiceDiscountAmount(sub, invoice.discount)
  return round2(sub - disc + invoiceTaxAmount(round2(sub - disc), invoice.tax_rate))
}
export function invoiceAmountDue(invoice: Breakdownable): number {
  return round2(invoiceGross(invoice) - creditsTotal(invoice.credits))
}
