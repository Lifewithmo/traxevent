import type { CalendarItem } from '@/lib/calendar'
import type { Event, InvoiceAgingBucket, NormalizedInvoice } from '@/lib/types'
import { invoiceBalance } from '@/lib/invoices'
import { deriveAging } from '@/lib/invoice-status'
import { todayYmd as localDateOf } from '@/lib/opportunity-detail'

// Cash-flow runway to your next booked job. Pure derivation over an already-built
// feed + the org's events + its invoices. Receivables timing only — this is NEVER
// a P&L: it says what is OWED to you, when it lands relative to each upcoming job,
// and what committed cost that job carries. It says nothing about profit, margin,
// or revenue. No fetching, no React, no server imports.
//
// Everything here must SHOW ITS WORK. A number the operator cannot trace is an
// oracle, and an oracle they cannot check is one they will stop trusting the first
// time it looks wrong. So every scalar on a RunwayJob is reconcilable from parts
// that also ship on the row: `inflowBefore`/`dueAfter` from `contributions`, and
// `cumulative` from `carriedIn + cashIn - boothFee`.

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Past due, not merely outstanding — mirrors lib/invoice-presentation.ts. */
const OVERDUE_AGING = new Set<InvoiceAgingBucket>(['d1_30', 'd31_60', 'd61_90', 'd90_plus'])

/**
 * One receivable behind a runway figure — the build-up the strip used to throw
 * away. Deep-links to the invoice record so a wrong number is fixable at source.
 */
export interface RunwayContribution {
  invoiceId: string
  /** The invoice's own title/number, as the feed titled it. */
  title: string
  /** Outstanding balance (never the gross) — the same figure that was summed. */
  amount: number
  /** YYYY-MM-DD due date; what placed it before or after the job. */
  dueDate: string
  aging: InvoiceAgingBucket
  /** Past due. An "expected to land" figure that is mostly 90 days late is a lie
   *  of omission, so this rides up to the row, not just the expanded panel. */
  overdue: boolean
  /** Which side of the job's date this lands on. */
  timing: 'before' | 'after'
  /** `/{orgSlug}/leads/{leadId}/invoices/{invoiceId}` — the receivable itself. */
  href: string
}

/**
 * Why a job's inflow is what it is. The shipped strip rendered ONE string for a
 * zero — "Nothing owed lands before this job" — for two opposite situations:
 * fully collected (good, nothing to do) and never invoiced (you are about to work
 * a job you have not billed for). These are the actions, not the arithmetic.
 *
 *  • `outstanding` — money is owed on this job and the timing above places it.
 *  • `collected`   — every invoice raised for it is settled. Nothing to do.
 *  • `draft`       — an invoice exists but has never been sent, so the customer
 *                    has been asked for nothing. Beats `collected` deliberately:
 *                    an unsent draft is an action even when the rest is paid.
 *  • `uninvoiced`  — nothing billable has ever been raised for this job.
 */
export type RunwayBilling = 'outstanding' | 'collected' | 'draft' | 'uninvoiced'

/** The invoice fields the runway reads. Structural, so callers can hand over
 *  NormalizedInvoice[] without this module depending on how they were fetched. */
export type RunwayInvoice = Pick<
  NormalizedInvoice,
  'id' | 'lead_id' | 'due_date' | 'line_items' | 'payments' | 'discount' | 'tax_rate' | 'credits'
> & { lifecycle?: NormalizedInvoice['lifecycle'] }

export interface RunwayJob {
  eventId: string
  title: string
  /** the job's date (YYYY-MM-DD) — event_start, the live source of truth. */
  date: string
  /** outstanding receivables anchored here whose due date is on or before the job. */
  inflowBefore: number
  /** the remainder anchored here, due after the job. */
  dueAfter: number
  /** The invoices behind those two figures, `before` first, each by due date.
   *  Sums EXACTLY: before → inflowBefore, after → dueAfter. */
  contributions: RunwayContribution[]
  /** How much of `inflowBefore` is already past due — money the timing counts as
   *  landing that the customer has, in fact, not sent. */
  overdueBefore: number
  /** The honest reading of a zero (and of a non-zero). See RunwayBilling. */
  billing: RunwayBilling
  /** Sent, unpaid, and carrying NO due date — so the feed never placed it and the
   *  timing above cannot see it. Disclosed rather than silently dropped. */
  untimedOwed: number
  /** The opportunity behind the job — where an uninvoiced job gets billed. */
  leadId?: string
  /** COMMITTED COST on this job: Event.booth_fee. Outflow side only; it is never
   *  added to any inflow and there is deliberately no booked-value field here. */
  boothFee: number
  /** Running cash position carried in from the previous job (0 at the first). */
  carriedIn: number
  /** Every outstanding receivable landing since the previous job through this
   *  job's date — chronological, whoever owes it. */
  cashIn: number
  /** carriedIn + cashIn − boothFee. The runway's actual answer: will the cash be
   *  there when this job arrives? Receivables minus committed costs — NOT profit. */
  cumulative: number
  /** The FIRST job at which `cumulative` goes negative. */
  firstShortfall: boolean
}

const ymd = (s: string) => s.slice(0, 10)

/**
 * Ordered upcoming booked jobs (future/today `event_start`, ascending), each with
 * the receivables expected before it vs. after it, the invoices behind those
 * figures, its committed cost, and the running cash position it arrives at.
 *
 * Anchor rule (verified, no migration): each `invoice_due` item joins to an Event
 * through `Invoice.lead_id → Event` — NOT `Lead.event_date`, which goes stale on
 * reschedule. `Event.lead_id` is not 1:1, so when a lead owns several events its
 * receivables attach to the NEAREST FUTURE `event_start`.
 *
 * `invoices` is REQUIRED, not optional-with-a-default: the billing state below
 * cannot be inferred from the feed (which carries only sent, dated, unpaid
 * invoices — a paid one produces no item at all), and defaulting to an empty list
 * would report every fully-collected job as "never invoiced" and tell the operator
 * to bill work they have already been paid for.
 */
export function buildRunway(
  items: CalendarItem[],
  events: Event[],
  today: Date,
  invoices: RunwayInvoice[]
): RunwayJob[] {
  // "today" is the LOCAL calendar date (the same convention as todayYmd() used
  // everywhere else on the page), NOT the UTC date. Deriving it via
  // today.toISOString() drops tonight's jobs and mis-buckets receivables for
  // several hours each evening in any negative-UTC-offset (Americas) org.
  const todayYmd = localDateOf(today)
  const live = events.filter((e) => e.status !== 'archived' && e.event_start)

  // Upcoming booked jobs, nearest first.
  const upcoming = live
    .filter((e) => ymd(e.event_start) >= todayYmd)
    .sort((a, b) => a.event_start.localeCompare(b.event_start))

  // Each lead's receivables anchor to its nearest-future event.
  const nearestByLead = new Map<string, Event>()
  for (const e of live) {
    if (!e.lead_id || ymd(e.event_start) < todayYmd) continue
    const cur = nearestByLead.get(e.lead_id)
    if (!cur || e.event_start.localeCompare(cur.event_start) < 0) nearestByLead.set(e.lead_id, e)
  }

  // Bucket outstanding receivables onto their anchor event — keeping each one
  // rather than collapsing it into a running total. Every value here is already
  // in hand on the CalendarItem; this costs no extra read.
  const byEvent = new Map<string, RunwayContribution[]>()
  for (const it of items) {
    if (it.kind !== 'invoice_due' || !it.leadId || it.amount == null) continue
    const anchor = nearestByLead.get(it.leadId)
    if (!anchor) continue
    const dueDate = ymd(it.date)
    // buildCalendarFeed emits `invoice_due` ONLY for a `sent`, dated invoice with
    // a positive balance (lib/calendar.ts), so the lifecycle is known and
    // `amount` IS the outstanding balance — deriveAging's two real inputs.
    const aging = deriveAging({ dueDate, balance: it.amount, lifecycle: 'sent' }, today)
    const list = byEvent.get(anchor.id) ?? []
    list.push({
      invoiceId: it.id,
      title: it.title,
      amount: it.amount,
      dueDate,
      aging,
      overdue: OVERDUE_AGING.has(aging),
      timing: dueDate <= ymd(anchor.event_start) ? 'before' : 'after',
      // The feed's own href is the OPPORTUNITY (`/{orgSlug}/leads/{leadId}`); the
      // invoice record hangs off it, so the deep link is derivable here without
      // this pure module taking an orgSlug parameter it would only reassemble.
      href: `${it.href}/invoices/${it.id}`,
    })
    byEvent.set(anchor.id, list)
  }

  // before-then-after, each by due date, so the panel reads as a timeline.
  for (const list of byEvent.values()) {
    list.sort((a, b) => {
      if (a.timing !== b.timing) return a.timing === 'before' ? -1 : 1
      if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
      return a.invoiceId < b.invoiceId ? -1 : a.invoiceId > b.invoiceId ? 1 : 0
    })
  }

  // Billing state per lead — the only thing the feed cannot answer, because a
  // settled invoice leaves no trace on it.
  const invoicesByLead = new Map<string, RunwayInvoice[]>()
  for (const inv of invoices) {
    const list = invoicesByLead.get(inv.lead_id) ?? []
    list.push(inv)
    invoicesByLead.set(inv.lead_id, list)
  }

  function billingFor(leadId: string | undefined): { billing: RunwayBilling; untimedOwed: number } {
    // A job with no opportunity behind it has nothing to bill from — and, either
    // way, no invoice exists for it.
    const mine = (leadId ? invoicesByLead.get(leadId) ?? [] : []).filter(
      (i) => (i.lifecycle ?? 'sent') !== 'void'
    )
    if (mine.length === 0) return { billing: 'uninvoiced', untimedOwed: 0 }
    const outstanding = mine.filter((i) => (i.lifecycle ?? 'sent') === 'sent' && invoiceBalance(i) > 0)
    // Sent and unpaid but undated: buildCalendarFeed needs a `due_date` to place
    // an item, so this money never reaches the timing above at all.
    const untimedOwed = round2(
      outstanding.filter((i) => !i.due_date).reduce((s, i) => s + invoiceBalance(i), 0)
    )
    const billing: RunwayBilling =
      outstanding.length > 0
        ? 'outstanding'
        : mine.some((i) => (i.lifecycle ?? 'sent') === 'draft')
          ? 'draft'
          : 'collected'
    return { billing, untimedOwed }
  }

  // The cash column is CHRONOLOGICAL, not anchored. Money due after job A but
  // before job B is cash in hand at B; bucketing it by anchor (as inflowBefore
  // must, to answer "is THIS job's client paid up") would drop it from the run
  // entirely and invent shortfalls that do not exist. Each receivable is consumed
  // exactly once as the cursor walks the jobs, so nothing is double-counted —
  // including two jobs on the same day, where the second correctly takes in $0.
  const dated = items
    .filter((i) => i.kind === 'invoice_due' && i.amount != null)
    .map((i) => ({ date: ymd(i.date), amount: i.amount as number }))
    .sort((a, b) => a.date.localeCompare(b.date))

  let cursor = 0
  let running = 0
  let shortfallTaken = false

  return upcoming.map((e) => {
    const date = ymd(e.event_start)
    const contributions = byEvent.get(e.id) ?? []
    // Derived FROM the contributions, so the build-up can never drift from the
    // total it is supposed to explain.
    const sum = (t: 'before' | 'after') =>
      round2(contributions.filter((c) => c.timing === t).reduce((s, c) => s + c.amount, 0))

    let cashIn = 0
    while (cursor < dated.length && dated[cursor].date <= date) {
      cashIn += dated[cursor].amount
      cursor++
    }
    cashIn = round2(cashIn)

    const carriedIn = running
    // booth_fee is a COST. It only ever subtracts; a missing or nonsensical value
    // is treated as no cost rather than guessed at.
    const boothFee = e.booth_fee != null && e.booth_fee > 0 ? round2(e.booth_fee) : 0
    running = round2(carriedIn + cashIn - boothFee)
    const firstShortfall = !shortfallTaken && running < 0
    if (firstShortfall) shortfallTaken = true

    const { billing, untimedOwed } = billingFor(e.lead_id)

    return {
      eventId: e.id,
      title: e.name,
      date,
      inflowBefore: sum('before'),
      dueAfter: sum('after'),
      contributions,
      overdueBefore: round2(
        contributions.filter((c) => c.timing === 'before' && c.overdue).reduce((s, c) => s + c.amount, 0)
      ),
      billing,
      untimedOwed,
      leadId: e.lead_id,
      boothFee,
      carriedIn,
      cashIn,
      cumulative: running,
      firstShortfall,
    }
  })
}
