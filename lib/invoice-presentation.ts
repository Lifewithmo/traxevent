import type { InvoiceAgingBucket, InvoiceLifecycle, InvoicePaymentStatus } from '@/lib/types'

/** StatusPill's tone vocabulary (components/ui/status-pill.tsx). */
export type InvoicePillTone = 'confirmed' | 'pending' | 'alert' | 'neutral'

export interface InvoicePill {
  tone: InvoicePillTone
  label: string
}

const OVERDUE_BUCKETS: InvoiceAgingBucket[] = ['d1_30', 'd31_60', 'd61_90', 'd90_plus']

/**
 * The one status an operator reads off an invoice.
 *
 * Lifecycle alone is not the answer: every `sent` invoice used to render the
 * same gray Badge whether it was paid, half-paid, or ninety days late. Money
 * state wins over lifecycle state — `Paid` and `Overdue` are what the operator
 * is scanning for — and only a `sent` invoice can have either, because a draft
 * has not been asked for and a void was withdrawn (mirrors `isCollectable` in
 * lib/money-overview.ts).
 *
 * `label` is display copy; the public invoice page's "Paid" chip is asserted by
 * __tests__/components/InvoiceViewClient.test.tsx, so that string is a contract.
 */
export function invoicePill(input: {
  lifecycle: InvoiceLifecycle
  payment: InvoicePaymentStatus
  aging: InvoiceAgingBucket
}): InvoicePill {
  const { lifecycle, payment, aging } = input
  if (lifecycle === 'void') return { tone: 'neutral', label: 'Void' }
  if (lifecycle === 'draft') return { tone: 'neutral', label: 'Draft' }
  if (payment === 'paid' || payment === 'overpaid') return { tone: 'confirmed', label: 'Paid' }
  if (OVERDUE_BUCKETS.includes(aging)) return { tone: 'alert', label: 'Overdue' }
  if (payment === 'partial') return { tone: 'pending', label: 'Partial' }
  if (aging === 'due_today') return { tone: 'pending', label: 'Due today' }
  return { tone: 'pending', label: 'Sent' }
}

/** Whole-dollar figure for StatTiles and rollups — `$1,234`. */
export function money0(n: number): string {
  const rounded = Math.round(n)
  return `${rounded < 0 ? '−' : ''}$${Math.abs(rounded).toLocaleString()}`
}

/** Exact figure for row amounts and document math — `$1,234.56`. */
export function money2(n: number): string {
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`
}
