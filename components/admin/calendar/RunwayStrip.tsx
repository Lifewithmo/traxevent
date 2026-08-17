import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { RunwayJob } from '@/lib/calendar-cashflow'

// The category-defining pane: cash-flow runway to the next booked job. This is
// RECEIVABLES TIMING, never a P&L — it says what is owed to you and whether it
// lands before each upcoming job, not profit or cost (decision #1). Every string
// here is chosen to keep that honest.

/** Keep the list scannable (Miller ≤7±2). Beyond this the tail collapses to a count. */
const MAX_ROWS = 5

function shortDate(ymd: string): string {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
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

  return (
    <section aria-label="Cash runway" className="px-4 py-3">
      <div className="mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
          Cash runway
        </h3>
        <p className="text-[11px] leading-tight text-muted-foreground">
          What&rsquo;s owed to you before each booked job — receivables timing.
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
              <li key={job.eventId}>
                <Link
                  href={hrefFor(job.date)}
                  className="block rounded-md border border-border bg-card px-2.5 py-2 transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                      {job.title}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {shortDate(job.date)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    {job.inflowBefore > 0 ? (
                      <>
                        <span className="font-semibold tabular-nums text-[var(--money-green)]">
                          {formatMoney(job.inflowBefore)}
                        </span>{' '}
                        expected to land before this job
                      </>
                    ) : (
                      <>Nothing owed lands before this job</>
                    )}
                    {job.dueAfter > 0 ? (
                      <span className="block tabular-nums">
                        {formatMoney(job.dueAfter)} owed, due after
                      </span>
                    ) : null}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {runway.length > MAX_ROWS ? (
            <p className="mt-1.5 px-1 text-[11px] font-medium text-muted-foreground">
              +{runway.length - MAX_ROWS} more upcoming
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
