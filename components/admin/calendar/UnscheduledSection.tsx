'use client'

import { useId, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { unscheduledReason, type UnscheduledRow, type UnscheduledUrgency } from '@/lib/calendar-unscheduled'

/**
 * THE WORK THAT HAS NO DATE — and, since the rail's composition pass, the rail's
 * ONE FOCAL ELEMENT.
 *
 * `buildCalendarFeed` guards its event loop on `event_start` and its lead loop
 * on `event_date`, so an opportunity nobody has scheduled — and a job that was
 * sold and never put on a day — exists on no calendar surface at all. "The ones
 * I haven't booked yet" is precisely the list a scheduler opens the calendar to
 * work, and until now the only way to see it was to leave the calendar.
 *
 * Job (one sentence): *which sold-or-chased job still has no day on it, and
 * which one do I have to put on the calendar first?*
 *
 * WHY THIS ONE IS FOCAL. Everything else in the rail is either navigation (the
 * scope filter, the mini-month, the next-open chips) or reporting (this week's
 * numbers, the cash runway, the marks key, the ICS link). This is the only zone
 * that is WORK — a queue the operator empties — and it is the only thing on the
 * whole calendar module that is invisible everywhere else. It is also the drag
 * source a later increment drags onto the grid beside it. So it gets what a
 * focal element gets and nothing else in the rail may have:
 *
 *  • a DECIDING NUMBER at 26px — how many jobs have no day on them — with the
 *    aggregate that says how bad that is ("2 already sold — on no calendar").
 *  • a real 13px heading in the operator's words ("Needs a date"), not the
 *    11px/600/uppercase eyebrow every other section shares.
 *  • the rail's ONLY full border. Every other zone is separated by a hairline
 *    rule or by whitespace. Delete this border and the focal element stops
 *    being distinguishable from its neighbours — which is exactly the defect
 *    the composition review found.
 *
 * The count is inside the disclosure button, so collapsing the rows never hides
 * the deciding number: an operator with a clean book pays one row for it, and
 * an operator with four sold-and-undated jobs cannot collapse the alarm away.
 */

/** Miller, and the fold. One tighter than <RunwayStrip/> on purpose. */
const MAX_ROWS = 4

/** Default OPEN. Undated work is the thing you are meant to see; only an
 *  explicit collapse is remembered. */
const OPEN_KEY = 'tx-calendar-unscheduled-open'

// ── the remembered collapse, as an external store ────────────────────────────
// `localStorage` IS an external system, so it is read with
// `useSyncExternalStore` rather than a `useState` + mount effect. That is not
// pedantry: the effect version renders the section open, then immediately
// re-renders it closed, so a returning operator who collapsed this watches it
// flash open on every calendar entry. The server snapshot is the default (open),
// which is also what hydration uses, and React reconciles to the stored value in
// the same commit rather than a cascading second render.

const subscribers = new Set<() => void>()

function subscribeToStoredOpen(onChange: () => void): () => void {
  subscribers.add(onChange)
  // `storage` only fires in OTHER tabs; `subscribers` covers this one.
  window.addEventListener('storage', onChange)
  return () => {
    subscribers.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** Session-only fallback, consulted ONLY when `localStorage` itself throws
 *  (Safari private mode). Without it the disclosure would be inert there — the
 *  store is the single source of the open state. */
let unstorableOpen: boolean | null = null

/** A boolean, so React's Object.is snapshot comparison is stable by value. */
function readStoredOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== '0'
  } catch {
    return unstorableOpen ?? true
  }
}

function serverStoredOpen(): boolean {
  return true
}

function writeStoredOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? '1' : '0')
  } catch {
    unstorableOpen = open
  }
  for (const notify of subscribers) notify()
}

interface UnscheduledSectionProps {
  orgSlug: string
  /** `buildUnscheduled` output, already ranked. NEVER re-sorted here. */
  rows: UnscheduledRow[]
  /** Today, for the deadline arithmetic. Passed in (not `new Date()`) so the
   *  rail renders the same day the rest of the cockpit is showing. */
  today: string
}

/** Tone per urgency level. Every level also ships WORDS ("past due", "d left",
 *  "Sold"), so colour is never the only carrier (WCAG 1.4.1). */
const TONE: Record<UnscheduledUrgency, string> = {
  now: 'font-semibold text-[var(--danger-fg)]',
  soon: 'font-medium text-[var(--warn-fg)]',
  later: 'text-muted-foreground',
}

/**
 * The focal element's "so what" line — the interpretation the bare count cannot
 * carry (3 undated chases and 3 undated *sold jobs* are the same number and
 * opposite emergencies).
 *
 * Deliberately an AGGREGATE, never a copy of row one: a summary that restates
 * the first row's own sentence renders the same value twice and teaches the eye
 * to skip the headline.
 */
function summaryOf(
  rows: UnscheduledRow[],
  today: string
): { level: UnscheduledUrgency; text: string } {
  const sold = rows.reduce((n, r) => (r.committed ? n + 1 : n), 0)
  if (sold > 0) {
    // A sold job with no day is a promise already broken on every calendar the
    // crew and the customer can see. It outranks any countdown.
    return { level: 'now', text: `${sold} already sold — on no calendar` }
  }
  // With nothing sold, the urgency levels are purely the book-by arithmetic
  // (the `committed` floor cannot be in play), so they can be counted honestly.
  const levels = rows.map((r) => unscheduledReason(r, today).level)
  const late = levels.reduce((n, l) => (l === 'now' ? n + 1 : n), 0)
  if (late > 0) {
    return { level: 'now', text: `${late} past ${late === 1 ? 'its' : 'their'} book-by date` }
  }
  const soon = levels.reduce((n, l) => (l === 'soon' ? n + 1 : n), 0)
  if (soon > 0) {
    return { level: 'soon', text: `${soon} inside the prep window` }
  }
  return { level: 'later', text: 'None past their book-by date yet' }
}

export function UnscheduledSection({ orgSlug, rows, today }: UnscheduledSectionProps) {
  const listId = useId()
  const open = useSyncExternalStore(subscribeToStoredOpen, readStoredOpen, serverStoredOpen)
  const toggle = () => writeStoredOpen(!open)

  const shown = rows.slice(0, MAX_ROWS)
  const hidden = rows.length - shown.length
  const summary = rows.length > 0 ? summaryOf(rows, today) : null

  return (
    <section
      aria-label="Unscheduled work"
      // The rail's ONE focal element, and its ONE full border. `mx-3 my-3`
      // rather than a flush hairline: whitespace isolation is half of what
      // makes it read as the figure and the rest of the rail as ground.
      data-rail-section="unscheduled"
      data-rail-focal="true"
      className="mx-3 my-3 rounded-lg border border-sidebar-border bg-card px-2.5 py-2 shadow-xs"
    >
      {/*
        Native <button> disclosure, and the whole summary is the target — the
        heading, the deciding number and its interpretation all sit inside it,
        so the tap area is ~72px tall (Fitts) and collapsing the rows never
        hides the number that made the section focal.
      */}
      <h3>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={listId}
          className="flex min-h-11 w-full flex-col items-start gap-1 rounded-md px-1 py-1 text-left transition-colors hover:bg-sidebar-hover focus-visible:bg-sidebar-hover motion-reduce:transition-none"
        >
          <span className="flex w-full items-center gap-1.5">
            <span
              aria-hidden
              className={cn('inline-block text-[10px] text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-90')}
            >
              &#9654;
            </span>
            <span className="text-[13px] font-semibold text-sidebar-foreground">Needs a date</span>
          </span>

          {summary ? (
            <>
              <span className="flex items-baseline gap-1.5">
                <span
                  data-slot="rail-focal-value"
                  className="text-[26px] font-semibold leading-none tracking-[-.02em] tabular-nums text-sidebar-foreground"
                >
                  {rows.length}
                </span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {rows.length === 1 ? 'job with no day on it' : 'jobs with no day on them'}
                </span>
              </span>
              <span className={cn('text-[11px] leading-tight', TONE[summary.level])}>
                {summary.text}
              </span>
            </>
          ) : null}
        </button>
      </h3>

      {/* The id `aria-controls` names always exists; only its CONTENTS come and
          go. A `hidden` subtree would keep its links in
          `querySelectorAll('a[href]')`, and the rail's mobile focus trap walks
          exactly that list — it would then try to focus a display:none anchor
          and drop focus on the floor at the wrap point. */}
      <div id={listId}>
        {open ? (
          rows.length === 0 ? (
            // No CTA. "Everything is scheduled" is a finished state, not a funnel
            // — the calendar is already the place you would go next.
            <p className="px-1 pb-1 pt-0.5 text-[11px] text-muted-foreground">
              Everything is scheduled.
            </p>
          ) : (
            <>
              <ul role="list" aria-label="Work with no date" className="mt-1 border-t border-sidebar-border pt-0.5">
                {shown.map((row) => (
                  <UnscheduledRowLink key={`${row.kind}:${row.id}`} row={row} today={today} />
                ))}
              </ul>
              {hidden > 0 ? (
                <Link
                  href={`/${orgSlug}/leads`}
                  className="flex min-h-11 items-center rounded-md px-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:bg-sidebar-hover hover:text-foreground focus-visible:bg-sidebar-hover motion-reduce:transition-none"
                >
                  +{hidden} more with no date — open the pipeline &rarr;
                </Link>
              ) : null}
            </>
          )
        ) : null}
      </div>
    </section>
  )
}

/**
 * ONE row: what it is, why it is urgent, and a link to the record.
 *
 * Deliberately flat DOM — a single <a> holding two spans. A concurrent
 * increment turns these into the drag source for drag-to-schedule, and it needs
 * a stable hook plus something simple enough to clone as a drag image. Every
 * datum that increment has to write a date onto travels on the element:
 * `data-unscheduled-id`, `data-unscheduled-kind` and `data-lead-id` (the
 * opportunity that actually owns `event_date`). Dragging is NOT implemented
 * here.
 */
function UnscheduledRowLink({ row, today }: { row: UnscheduledRow; today: string }) {
  const reason = unscheduledReason(row, today)
  return (
    <li>
      <Link
        href={row.href}
        data-slot="unscheduled-row"
        data-unscheduled-id={row.id}
        data-unscheduled-kind={row.kind}
        data-lead-id={row.leadId}
        data-committed={row.committed ? 'true' : 'false'}
        data-urgency={reason.level}
        className="flex min-h-11 flex-col justify-center gap-0.5 rounded-md px-1 py-1 transition-colors hover:bg-sidebar-hover focus-visible:bg-sidebar-hover motion-reduce:transition-none"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {row.committed ? (
            // The word does the work; the colour only agrees with it. This is
            // the row the drawer exists for — sold, and on no calendar.
            <span className="shrink-0 rounded-sm bg-[var(--danger-bg)] px-1 text-[10px] font-bold uppercase tracking-[.04em] text-[var(--danger-fg)]">
              Sold
            </span>
          ) : null}
          <span
            className={cn(
              'truncate text-[12px] text-sidebar-foreground',
              row.committed ? 'font-semibold' : 'font-medium'
            )}
          >
            {row.title}
          </span>
        </span>
        <span className={cn('text-[11px] leading-tight', TONE[reason.level])}>{reason.text}</span>
      </Link>
    </li>
  )
}
