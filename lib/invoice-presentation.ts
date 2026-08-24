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

/**
 * The calendar-date face of an ISO instant pinned to UTC — `'Aug 13, 2026'`,
 * identical no matter which machine formats it.
 *
 * For the PUBLIC invoice (a server-rendered customer document), the Sent stamp
 * must have one true rendering: the old ambient-zone `toLocaleDateString()`
 * made the customer-visible date depend on the deploy region's clock AND
 * locale (an evening send was already "tomorrow" on a UTC server). A document
 * can't hydration-gate its way to the viewer's zone the way the operator
 * screens do — InvoiceViewClient has no client runtime at all — so the honest
 * fix is a pinned, labeled zone: render sites append "(UTC)", the check-in
 * manifest precedent, so a near-midnight date that disagrees with the reader's
 * calendar reads as a fixed record rather than an error.
 */
export function invoiceDateUTC(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
  })
}

/**
 * Viewer-local calendar-date face of an ISO instant — `'Aug 12, 2026'` in the
 * zone of whatever runtime formats it. That ambient zone is the point — and
 * exactly why every render site MUST gate this behind a hydration flag
 * (CheckinClient's fmtTime contract): 'use client' components still SSR, and
 * baking the SERVER's date face into HTML that the browser's hydration pass
 * re-formats in the viewer's zone is the React #418 mismatch that bricked
 * /checkin. Locale is pinned so only the zone varies, and only client-side.
 */
export function invoiceDateLocal(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
