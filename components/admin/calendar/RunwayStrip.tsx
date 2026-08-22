import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { RunwayRow } from '@/components/admin/calendar/RunwayRow'
import type { RunwayJob } from '@/lib/calendar-cashflow'

// The category-defining pane: cash-flow runway to the next booked job. This is
// RECEIVABLES TIMING, never a P&L — it says what is owed to you, whether it lands
// before each upcoming job, and what committed cost that job carries; it says
// nothing about profit or revenue (decision #1). Every string here is chosen to
// keep that honest.
//
// It also has to SHOW ITS WORK. A figure the operator cannot trace, check or act
// on is an oracle, and the first time it looks wrong they stop trusting the
// surface. So each row expands into the actual invoices behind its number and the
// arithmetic behind its running balance (see RunwayRow).

/** Keep the list scannable (Miller ≤7±2). Beyond this the tail collapses to a
 *  count — which is a LINK to the full upcoming book, not a dead end. */
const MAX_ROWS = 5

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

  return (
    <section aria-label="Cash runway" className="px-4 py-3">
      <div className="mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
          Cash runway
        </h3>
        <p className="text-[11px] leading-tight text-muted-foreground">
          What&rsquo;s owed to you before each booked job, less its committed costs —
          receivables timing.
        </p>
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
          <ul role="list" aria-label="Runway to upcoming jobs" className="space-y-1">
            {runway.slice(0, MAX_ROWS).map((job) => (
              <RunwayRow key={job.eventId} job={job} orgSlug={orgSlug} dayHref={hrefFor(job.date)} />
            ))}
          </ul>
          {hidden > 0 ? (
            <Link
              href={`/${orgSlug}/calendar?view=agenda`}
              className="mt-1.5 flex min-h-11 items-center rounded-md px-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted motion-reduce:transition-none"
            >
              +{hidden} more upcoming — see the full book &rarr;
            </Link>
          ) : null}
        </>
      )}
    </section>
  )
}
