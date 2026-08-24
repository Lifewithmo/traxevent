'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { StatusPill } from '@/components/ui/status-pill'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { RunwayJob } from '@/lib/calendar-cashflow'

// ONE runway row, and the thing that stops the strip being an oracle: the money
// figure is a disclosure, and behind it are the actual invoices that produced it
// plus the arithmetic behind the running balance. Nothing here is a new read —
// every value ships on the RunwayJob.
//
// RECEIVABLES TIMING, never a P&L. `boothFee` is a committed COST and only ever
// subtracts; there is no revenue, margin or profit figure on this surface.

function shortDate(ymd: string): string {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Warning glyph. Paired with words everywhere it appears — the shortfall is
 *  never signalled by colour alone (WCAG 1.4.1). */
function WarnIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden
      focusable="false"
      className="shrink-0"
    >
      <path d="M6 1.4 11 10.6H1L6 1.4Z" />
      <path d="M6 5v2.2M6 9h.01" />
    </svg>
  )
}

/** The money sentence, and the state it is really reporting. The shipped strip
 *  rendered one string for a zero whether the job was fully collected or had
 *  never been billed at all — opposite situations, opposite actions. */
function MoneyLine({ job }: { job: RunwayJob }) {
  if (job.billing === 'uninvoiced') {
    return (
      <span className="flex items-center gap-1 text-[var(--warn-fg)]">
        <WarnIcon />
        <span className="font-semibold">Not invoiced yet</span>
      </span>
    )
  }
  if (job.billing === 'draft') {
    return (
      <span className="flex items-center gap-1 text-[var(--warn-fg)]">
        <WarnIcon />
        <span className="font-semibold">Invoice drafted, never sent</span>
      </span>
    )
  }
  if (job.billing === 'collected') {
    return (
      <span className="text-[var(--money-green)]">
        <span className="font-semibold">Paid in full</span> — nothing outstanding
      </span>
    )
  }
  // outstanding
  if (job.inflowBefore > 0) {
    return (
      <span className="text-muted-foreground">
        <span className="font-semibold tabular-nums text-[var(--money-green)]">
          {formatMoney(job.inflowBefore)}
        </span>{' '}
        expected to land before this job
        {job.overdueBefore > 0 ? (
          <span className="mt-0.5 flex items-center gap-1 text-[var(--danger-fg)]">
            <WarnIcon />
            <span className="tabular-nums">{formatMoney(job.overdueBefore)}</span>
            <span>of it already overdue</span>
          </span>
        ) : null}
      </span>
    )
  }
  return (
    <span className="text-muted-foreground">
      Nothing owed lands before this job
      {job.dueAfter > 0 ? (
        <span className="block tabular-nums">{formatMoney(job.dueAfter)} owed, due after</span>
      ) : null}
    </span>
  )
}

/** The receivables behind `inflowBefore` / `dueAfter`, each a link to the record
 *  that produced it — so a wrong figure is fixable at source rather than merely
 *  doubted. Sums exactly to the two scalars above. */
function Contributions({ job }: { job: RunwayJob }) {
  const firstAfter = job.contributions.findIndex((c) => c.timing === 'after')
  return (
    <ul role="list" className="space-y-0.5">
      {job.contributions.map((c, i) => (
        <li key={c.invoiceId}>
          {i === firstAfter ? (
            <p className="px-1 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground">
              Due after the job
            </p>
          ) : null}
          <Link
            href={c.href}
            className="flex min-h-11 flex-col justify-center rounded-md px-1.5 py-1 transition-colors hover:bg-sidebar-hover focus-visible:bg-sidebar-hover motion-reduce:transition-none"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                {c.title}
              </span>
              <span
                className={cn(
                  'shrink-0 font-mono text-[11px] font-semibold tabular-nums',
                  c.overdue ? 'text-[var(--danger-fg)]' : 'text-foreground'
                )}
              >
                {formatMoney(c.amount)}
              </span>
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {/* Only OVERDUE earns a chip; a plain due date says everything the
                  other buckets would, with none of the chrome. */}
              {c.overdue ? (
                <StatusPill tone="alert" className="px-1.5 py-0 text-[10px]">
                  Overdue
                </StatusPill>
              ) : null}
              <span className="tabular-nums">Due {shortDate(c.dueDate)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** The arithmetic behind the running balance. A running-balance column is only
 *  trustworthy if each line's delta is visible, so this is the register the
 *  figure comes off: carried in + landing − committed cost = running. */
function Ledger({ job }: { job: RunwayJob }) {
  return (
    <dl className="space-y-0.5 text-[11px]">
      <div className="flex items-baseline justify-between gap-2">
        <dt className="text-muted-foreground">Carried in</dt>
        <dd className="font-mono tabular-nums text-foreground">{formatMoney(job.carriedIn)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <dt className="min-w-0 truncate text-muted-foreground">Lands by {shortDate(job.date)}</dt>
        <dd className="font-mono tabular-nums text-[var(--money-green)]">
          +{formatMoney(job.cashIn)}
        </dd>
      </div>
      {job.boothFee > 0 ? (
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Booth fee (committed cost)</dt>
          <dd className="font-mono tabular-nums text-foreground">
            &minus;{formatMoney(job.boothFee)}
          </dd>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-2 border-t border-sidebar-border pt-1">
        <dt className="font-semibold text-foreground">Running</dt>
        <dd
          className={cn(
            'font-mono font-semibold tabular-nums',
            job.cumulative < 0 ? 'text-[var(--danger-fg)]' : 'text-foreground'
          )}
        >
          {formatMoney(job.cumulative)}
        </dd>
      </div>
    </dl>
  )
}

interface RunwayRowProps {
  job: RunwayJob
  orgSlug: string
  /** The job's day on the calendar — where the WORK is, not where the money is. */
  dayHref: string
}

export function RunwayRow({ job, orgSlug, dayHref }: RunwayRowProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const short = job.cumulative < 0

  return (
    // NOT a card. This used to be `rounded-md border border-border bg-card`, one
    // of five identical boxes in a `space-y-1` column — the uniform card stack
    // the composition rules forbid, and five borders competing with the single
    // border that now marks the rail's focal element. <RunwayStrip/> divides the
    // rows with hairlines instead; the shared left edge and the rules do the
    // grouping Gestalt needs at a fraction of the ink.
    <li className="py-1">
      {/* The title goes to the job's day; the money below goes to the money. */}
      <div className="flex items-baseline justify-between gap-2 px-1 pt-0.5">
        <Link
          href={dayHref}
          className="min-w-0 flex-1 truncate rounded-sm text-[13px] font-medium text-foreground hover:underline focus-visible:underline"
        >
          {job.title}
        </Link>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {shortDate(job.date)}
        </span>
      </div>

      {/* Two-line disclosure: the money sentence and the running position. Both
          lines together make a naturally 44px-tall, full-width target. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-sidebar-hover focus-visible:bg-sidebar-hover motion-reduce:transition-none"
      >
        <span className="min-w-0 flex-1">
          <span className="sr-only">{job.title}: </span>
          <span className="block text-[11px] leading-tight">
            <MoneyLine job={job} />
          </span>
          <span
            className={cn(
              'mt-1 flex items-center gap-1 text-[11px] leading-tight',
              short ? 'text-[var(--danger-fg)]' : 'text-muted-foreground'
            )}
          >
            {short ? <WarnIcon /> : null}
            <span>{job.firstShortfall ? 'Cash runs short here' : short ? 'Still short' : 'Running'}</span>
            <span className="font-mono font-semibold tabular-nums">{formatMoney(job.cumulative)}</span>
          </span>
        </span>
        <span
          aria-hidden
          className="shrink-0 text-[10px] text-muted-foreground transition-transform motion-reduce:transition-none"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        >
          ▾
        </span>
      </button>

      {/* An unbilled job is an action, not a status. Outside the button so the
          link is reachable without nesting interactive elements. */}
      {(job.billing === 'uninvoiced' || job.billing === 'draft') && job.leadId ? (
        <Link
          href={`/${orgSlug}/leads/${job.leadId}/invoices`}
          className="mx-1 mb-1 flex min-h-11 items-center rounded-md border border-[var(--warn-border)] bg-[var(--warn-bg)] px-2 text-[11px] font-semibold text-[var(--warn-fg)] transition-colors hover:brightness-95 motion-reduce:transition-none"
        >
          {job.billing === 'draft' ? 'Send the invoice' : 'Bill this job'} &rarr;
        </Link>
      ) : null}

      {open ? (
        <div id={panelId} className="space-y-2 border-t border-sidebar-border px-1 py-2">
          {job.contributions.length > 0 ? (
            <div>
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground">
                What this job&rsquo;s client owes
              </p>
              <Contributions job={job} />
            </div>
          ) : null}
          <div>
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground">
              Cash position at this job
            </p>
            <Ledger job={job} />
          </div>
          {job.untimedOwed > 0 ? (
            <p className="flex items-start gap-1 text-[10px] leading-tight text-[var(--warn-fg)]">
              <WarnIcon />
              <span>
                <span className="tabular-nums">{formatMoney(job.untimedOwed)}</span> owed with no due
                date — not counted above.
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
