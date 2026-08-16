import { invoiceBalance } from '@/lib/invoices'
import type { Invoice, Lead, Task } from '@/lib/types'

/**
 * The figures the opportunity cockpit puts on tiles. Pure — no React, no
 * server imports — so the page, the tests and any future export path all read
 * the same numbers.
 *
 * Deliberately absent: weighted/expected pipeline value and contracted value.
 * No stage-probability data exists to weight with, and `acceptedProposalTotal()`
 * has a real multi-accepted-proposal / missing-selection hazard. Out of scope.
 */
export interface OpportunityRollup {
  /** Quoted value from the lead. `null` means unset — render "+ Add", never "—". */
  estValue: number | null
  /** Whole days from today to the event; negative once past. `null` = no event date. */
  daysToEvent: number | null
  pastBookings: number
  openBalance: number
  overdueBalance: number
  openTaskCount: number
  overdueTaskCount: number
}

export interface OpportunityRollupInput {
  lead: Pick<Lead, 'estimated_value' | 'event_date'>
  invoices: Invoice[]
  tasks: Task[]
  /** Count of the customer's prior bookings; passed through for the returning-client tile. */
  pastBookings: number
  /** Today as YYYY-MM-DD (see todayYmd in lib/opportunity-detail.ts). */
  today: string
}

/**
 * Whole calendar days from `today` to `eventYmd`: positive ahead, 0 today,
 * negative once past. UTC-midnight arithmetic, matching `daysOutLabel` in
 * lib/date-window.ts:31-39 — but returning the NUMBER, which nothing exposed
 * before. The existing label's past tense ("3 days ago") reads like recency
 * rather than a past event, so the tile formats its own copy from this count.
 *
 * Anything that does not parse as a bare YYYY-MM-DD — a full ISO timestamp, a
 * legacy free-text date, an empty-ish string — returns `null`, NOT NaN. The
 * band branches on `=== null` to choose between the figure and its "+ Add"
 * affordance, and NaN !== null, so a bare `Math.round` would have rendered the
 * literal "NaN days" with no way for the operator to fix it.
 */
export function daysToEvent(eventYmd: string | undefined, today: string): number | null {
  if (!eventYmd) return null
  const n = Math.round(
    (Date.parse(`${eventYmd}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000
  )
  return Number.isFinite(n) ? n : null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function opportunityRollup(i: OpportunityRollupInput): OpportunityRollup {
  // Liveness predicate: not void AND still carrying a positive balance — the
  // same set the invoice attachment chip counts (lib/opportunity-detail.ts:166-167).
  // Deliberately NOT customerAR() from lib/crm/ar-rollup.ts, which counts only
  // lifecycle === 'sent' and would silently disagree with the unpaid-invoice
  // count this page has always shown for drafts.
  //
  // The `> 0` half is load-bearing, not incidental: invoiceBalance() is
  // amountDue - amountPaid and goes NEGATIVE when an invoice is overpaid (a
  // real state — derivePaymentStatus returns 'overpaid', lib/invoice-status.ts:28).
  // Without it a credit balance would silently subtract from what the customer
  // owes on OTHER invoices. Pinned by the overpaid tests.
  const live = i.invoices.filter((v) => v.lifecycle !== 'void' && invoiceBalance(v) > 0)
  const openTasks = i.tasks.filter((t) => !t.done)

  return {
    estValue: i.lead.estimated_value ?? null,
    daysToEvent: daysToEvent(i.lead.event_date, i.today),
    pastBookings: i.pastBookings,
    openBalance: round2(live.reduce((s, v) => s + invoiceBalance(v), 0)),
    overdueBalance: round2(
      live
        .filter((v) => v.due_date != null && v.due_date < i.today)
        .reduce((s, v) => s + invoiceBalance(v), 0)
    ),
    openTaskCount: openTasks.length,
    overdueTaskCount: openTasks.filter((t) => t.due_date != null && t.due_date < i.today).length,
  }
}
