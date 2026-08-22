'use client'

import { useId, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { unscheduledReason, type UnscheduledRow, type UnscheduledUrgency } from '@/lib/calendar-unscheduled'

/**
 * THE WORK THAT HAS NO DATE.
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
 * Deciding value: **days left to the book-by date** (the promised event date
 * minus the org's prep lead days), with estimated value as the fallback when no
 * date was ever promised. That sentence is the only non-muted text on a row, and
 * it is why the rows are in the order they are in.
 *
 * WHERE IT SITS, and what got quieter. Directly under the mini-month and ABOVE
 * the this-week KPIs and the cash runway. The rail's top half is orientation
 * (scope filter, legend, mini-month) and its bottom half is reporting (KPIs,
 * runway, ICS) — this is neither: it is a QUEUE the operator acts on, and a
 * queue belongs next to the surface it acts into. It is also the drag source for
 * drag-to-schedule, and a drag source at the bottom of a scrolling 280px rail is
 * unusable. So the KPI band gave up the first slot below the mini-month. Two
 * further concessions keep the rail from growing louder rather than longer:
 *
 *  • The header reuses the rail's EXISTING eyebrow grammar exactly (11px, 600,
 *    uppercase, .06em, muted) — a fourth section, but no fourth hierarchy level.
 *  • MAX_ROWS is 4, one tighter than the runway's 5, because this list sits
 *    above the runway and two five-row stacks would push the runway (the
 *    category-defining pane) off the fold on a ~900px rail.
 *
 * It is also the only collapsible section in the rail, and it remembers being
 * collapsed: an operator with a clean book pays one 36px row for it, forever.
 */

/** Miller, and the fold. One tighter than <RunwayStrip/> on purpose — see above. */
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

export function UnscheduledSection({ orgSlug, rows, today }: UnscheduledSectionProps) {
  const listId = useId()
  const open = useSyncExternalStore(subscribeToStoredOpen, readStoredOpen, serverStoredOpen)
  const toggle = () => writeStoredOpen(!open)

  const shown = rows.slice(0, MAX_ROWS)
  const hidden = rows.length - shown.length

  return (
    <section aria-label="Unscheduled work" className="border-b border-sidebar-border px-4 py-2">
      {/*
        Native <button> disclosure. The caret is decorative — the button's
        accessible name is its own visible text plus the count, so the state
        reaches assistive tech through `aria-expanded` rather than a rotation
        nobody can hear.
      */}
      <h3>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={listId}
          className="flex min-h-11 w-full items-center gap-1.5 rounded-md px-1 text-left transition-colors hover:bg-sidebar-hover focus-visible:bg-sidebar-hover motion-reduce:transition-none"
        >
          <span
            aria-hidden
            className={cn('inline-block text-[10px] text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-90')}
          >
            &#9654;
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
            Unscheduled
          </span>
          {rows.length > 0 ? (
            <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
              {rows.length}
            </span>
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
            <p className="px-1 pb-2 pt-0.5 text-[11px] text-muted-foreground">
              Everything is scheduled.
            </p>
          ) : (
            <>
              <ul role="list" aria-label="Work with no date" className="pb-1">
                {shown.map((row) => (
                  <UnscheduledRowLink key={`${row.kind}:${row.id}`} row={row} today={today} />
                ))}
              </ul>
              {hidden > 0 ? (
                <Link
                  href={`/${orgSlug}/leads`}
                  className="mb-1 flex min-h-11 items-center rounded-md px-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:bg-sidebar-hover hover:text-foreground focus-visible:bg-sidebar-hover motion-reduce:transition-none"
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
