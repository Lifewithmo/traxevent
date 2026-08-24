import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { RunwayRow } from '@/components/admin/calendar/RunwayRow'
import type { RunwayJob } from '@/lib/calendar-cashflow'

// Cash-flow runway to the next booked jobs. This is RECEIVABLES TIMING, never a
// P&L — it says what is owed to you, whether it lands before each upcoming job,
// and what committed cost that job carries; it says nothing about profit or
// revenue (decision #1). Every string here is chosen to keep that honest.
//
// It also has to SHOW ITS WORK. A figure the operator cannot trace, check or act
// on is an oracle, and the first time it looks wrong they stop trusting the
// surface. So each row expands into the actual invoices behind its number and the
// arithmetic behind its running balance (see RunwayRow).
//
// COMPOSITION PASS. Two things changed when the rail got its focal element back:
//
//  1. The rows lost their per-row `border + bg-card + rounded-md`. Five bordered
//     cards in a `space-y-1` column is the uniform card stack the composition
//     rules forbid, and in a 280px rail those five borders were competing with
//     the one border that is now supposed to mean something (the focal queue).
//     They are hairline-divided rows now — Gestalt gets the grouping from the
//     rules and the shared left edge, at a fraction of the ink. Nothing else
//     about a row changed: same disclosure, same invoices, same ledger, same
//     "Bill this job" action.
//  2. The strip gained the interpretation it never had. The verdict — does the
//     cash hold, and where does it break — was only discoverable by expanding
//     rows one at a time, and a shortfall past the visible cap was undiscoverable
//     altogether. VERDICT() reads the WHOLE runway, not the visible slice.

/** Keep the list scannable and the rail short. Three, not five: the verdict line
 *  above now covers the whole horizon (including the tail), so the rows only
 *  have to carry the jobs the operator can still act on this month — and the
 *  tail is a LINK to the full upcoming book, not a dead end. */
const MAX_ROWS = 3

function shortDate(ymd: string): string {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * The strip's one-line "so what", computed over EVERY job in the runway rather
 * than the three that are rendered.
 *
 * Deliberately carries no money figure: the amounts already live on the rows and
 * in the ledger behind them, and a headline that restates a row's number is the
 * same value rendered twice.
 *
 * FOUR states, not two. The shipped version branched on `firstShortfall` alone,
 * so anything that was not negative fell into the reassurance branch — including
 * an org with no invoices at all, whose running balance is 0 by construction.
 * That printed "Stays positive through Sep 10" directly above "2 jobs still to
 * bill": a confident verdict derived from no data whatsoever. A claim needs
 * something to be a claim ABOUT.
 */
function verdict(runway: RunwayJob[], agedAr: number): { tone: string; text: string } {
  const breaks = runway.find((j) => j.firstShortfall)
  if (breaks) {
    return {
      tone: 'font-semibold text-[var(--danger-fg)]',
      text: `Runs short at ${breaks.title} · ${shortDate(breaks.date)}`,
    }
  }
  const last = runway[runway.length - 1]
  // Nothing moves in or out across the whole horizon, so "positive" would be
  // describing a balance of zero that no receivable and no cost ever touched.
  if (!runway.some((j) => j.cashIn !== 0 || j.boothFee !== 0)) {
    const owedSomewhere =
      agedAr > 0 ||
      runway.some((j) => j.pastDue !== 0 || j.inflowBefore !== 0 || j.dueAfter !== 0 || j.untimedOwed !== 0)
    return {
      tone: 'text-muted-foreground',
      text: owedSomewhere
        ? `Nothing is scheduled to land through ${shortDate(last.date)}`
        : 'No receivables on file yet',
    }
  }
  return {
    tone: 'text-muted-foreground',
    text: `Stays positive through ${shortDate(last.date)}`,
  }
}

interface RunwayStripProps {
  orgSlug: string
  /** buildRunway() output — nearest booked job first. */
  runway: RunwayJob[]
  /** Preserves ?view/?kinds/?week when jumping to a job's day. Falls back to the
   *  plain day route so the strip renders correctly outside the cockpit shell. */
  dayHref?: (ymd: string) => string
}

export function RunwayStrip({ orgSlug, runway, dayHref }: RunwayStripProps) {
  const hrefFor = dayHref ?? ((ymd: string) => `/${orgSlug}/calendar/${ymd}`)
  const hidden = runway.length - MAX_ROWS
  // Unbilled work is the one thing on this surface that is an ACTION rather than
  // a reading, so it is counted across the whole horizon too.
  const unbilled = runway.reduce(
    (n, j) => (j.billing === 'uninvoiced' || j.billing === 'draft' ? n + 1 : n),
    0
  )
  // A standing hole, identical on every row by construction (see `agedAr`) —
  // read off the first rather than summed, which would multiply it by the
  // number of jobs.
  const agedAr = runway[0]?.agedAr ?? 0
  const punchline = runway.length > 0 ? verdict(runway, agedAr) : null

  return (
    <section aria-label="Cash runway" data-rail-section="runway" className="px-4 py-3">
      <div className="mb-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
            Cash runway
          </h3>
          {/* The honesty qualifier that used to need its own two-line paragraph.
              It is a caption on the heading, not a second block of prose. */}
          <span className="shrink-0 text-[10px] leading-tight text-muted-foreground">
            receivables timing
          </span>
        </div>
        {punchline ? (
          <>
            <p className={cn('text-[11px] leading-tight', punchline.tone)}>{punchline.text}</p>
            {unbilled > 0 ? (
              <p className="text-[11px] leading-tight font-medium text-[var(--warn-fg)]">
                {unbilled} {unbilled === 1 ? 'job' : 'jobs'} still to bill
              </p>
            ) : null}
            {/* Aged AR is EXCLUDED from every figure below, because a due date
                that has passed on an unpaid invoice is a failed forecast, not
                cash. Excluding it silently would be the same lie in the other
                direction, so it gets its own line — and a destination, because
                chasing it is a different job from waiting for money that is not
                late yet. */}
            {agedAr > 0 ? (
              <Link
                href={`/${orgSlug}/invoices`}
                className="flex min-h-11 items-center rounded-md px-1 text-[11px] font-semibold text-[var(--danger-fg)] underline underline-offset-2 transition-colors hover:bg-sidebar-hover focus-visible:bg-sidebar-hover motion-reduce:transition-none"
              >
                {`${formatMoney(agedAr)} past due — not counted, chase it`} &rarr;
              </Link>
            ) : null}
          </>
        ) : null}
      </div>

      {runway.length === 0 ? (
        <EmptyState
          title="No booked jobs ahead"
          description="Close a won opportunity and its receivables show up here."
          className="px-2 py-6"
          action={
            <Link className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/${orgSlug}/leads`}>
              Open the pipeline
            </Link>
          }
        />
      ) : (
        <>
          <ul
            role="list"
            aria-label="Runway to upcoming jobs"
            className="divide-y divide-sidebar-border border-t border-sidebar-border"
          >
            {runway.slice(0, MAX_ROWS).map((job) => (
              <RunwayRow key={job.eventId} job={job} orgSlug={orgSlug} dayHref={hrefFor(job.date)} />
            ))}
          </ul>
          {hidden > 0 ? (
            <Link
              href={`/${orgSlug}/calendar?view=agenda`}
              className="flex min-h-11 items-center rounded-md px-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:bg-sidebar-hover hover:text-foreground focus-visible:bg-sidebar-hover motion-reduce:transition-none"
            >
              +{hidden} more upcoming — see the full book &rarr;
            </Link>
          ) : null}
        </>
      )}
    </section>
  )
}
