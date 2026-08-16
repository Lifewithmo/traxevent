import type { VariantProps } from 'class-variance-authority'
import { type pillVariants } from '@/components/ui/status-pill'
import type { DueStatus } from '@/lib/opportunity-detail'
import type { InvoiceLifecycle, LeadStage, ProposalStatus, VendorStatus } from '@/lib/types'

/**
 * The Sales Pipeline module's single tone + format vocabulary.
 *
 * Every status the module paints resolves through one of the maps below, so no
 * two screens invent a competing tone for the same state. The maps are
 * exhaustive `Record`s on purpose: adding a stage/status to the union is a
 * compile error here until it gets a tone, which is exactly the outcome a
 * partial map with a `?? 'neutral'` default would silently swallow.
 */
export type Tone = NonNullable<VariantProps<typeof pillVariants>['tone']>

/**
 * Deliberate verbatim copy of JOB_TONE in
 * components/admin/clients/ClientWorkingRail.tsx:41-47. The Clients module is
 * shipped and off-limits this increment, so the constant cannot be hoisted out
 * of it into shared code. If a stage's tone changes, change it in BOTH places.
 */
export const STAGE_TONE: Record<LeadStage, Tone> = {
  inquiry: 'neutral',
  consultation: 'pending',
  proposal: 'pending',
  closed_won: 'confirmed',
  closed_lost: 'alert',
}

/** Keys match the union returned by dueStatus() in lib/opportunity-detail.ts. */
export const DUE_TONE: Record<DueStatus, Tone> = {
  overdue: 'alert',
  today: 'pending',
  upcoming: 'neutral',
}

/** Mirrors PROPOSAL_TONE in ClientWorkingRail.tsx:49-55 (same duplication note as STAGE_TONE). */
export const PROPOSAL_TONE: Record<ProposalStatus, Tone> = {
  draft: 'neutral',
  sent: 'pending',
  accepted: 'confirmed',
  rejected: 'alert',
  voided: 'alert',
}

/**
 * Lifecycle only — 'paid' is NOT a lifecycle (InvoiceLifecycle is
 * draft|sent|void); paid-ness is derived from the balance. Use
 * INVOICE_TONE-by-payment-status in ClientWorkingRail's shape if a screen needs
 * the settled/partial distinction.
 */
export const INVOICE_LIFECYCLE_TONE: Record<InvoiceLifecycle, Tone> = {
  draft: 'neutral',
  sent: 'pending',
  void: 'neutral',
}

/** Only a confirmed vendor is confirmed; potential and declined both still need a decision. */
export const VENDOR_TONE: Record<VendorStatus, Tone> = {
  potential: 'pending',
  confirmed: 'confirmed',
  declined: 'pending',
}

/**
 * The cockpit money convention: thousands separator, no cents. Matches
 * ClientKpiBand.tsx:12. Deliberately NOT lib/utils.ts `formatMoney`, which
 * renders `$1234.50` (no separator) and is pinned by the ops/catalog tests.
 */
export function money(n: number): string {
  return `$${n.toLocaleString()}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * `2026-08-30` -> `Aug 30, 2026`. String-parsed, never `new Date(ymd)`, so a
 * calendar date can't slip a day in a negative-offset timezone.
 *
 * FORMAT DIVERGENCE — this emits the YEAR; the private `shortDue` helper inside
 * attachmentChips (lib/opportunity-detail.ts:152-155) emits `Aug 30` without
 * one. Both can appear on the opportunity page, so do NOT place the two strings
 * adjacent (a tile note beside a chip hint) — one dated "Aug 30, 2026" next to
 * one dated "Aug 30" reads as two different dates. Pick one per region.
 *
 * Unparseable input (an ISO timestamp, free text, an out-of-range month) is
 * returned UNCHANGED rather than rendered as "undefined NaN, NaN" — an ugly
 * raw date beats a broken one on an operator's screen.
 */
export function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const month = MONTHS[m - 1]
  if (month === undefined || !Number.isFinite(d) || !Number.isFinite(y)) return ymd
  return `${month} ${d}, ${y}`
}
