'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  CALENDAR_KIND_LABELS,
  CALENDAR_KINDS,
  feedForDay,
  type CalendarItem,
  type CalendarKind,
} from '@/lib/calendar'
import { addDays } from '@/lib/opportunity-detail'
import { cn } from '@/lib/utils'
import { KindDot } from '@/components/admin/calendar/KindDot'
import { BookabilityMark, verdictCellStyle, verdictCellTone } from '@/components/admin/calendar/BookabilityMark'
import { useBookabilityCtx, type DayVerdict } from '@/components/admin/calendar/bookability-context'
import { bindingConstraint, VERDICT_LABEL } from '@/lib/calendar-bookability'
import {
  RescheduleBar,
  RescheduleProvider,
  canReschedule,
  dayLabel,
  useReschedule,
  type HandleProps,
} from '@/components/admin/calendar/reschedule-drag'

/** Individually-addressable marks a day shows before the count carries the rest
 *  (decision #2 — dots, not chips). */
export const MAX_DOTS = 4

// ─────────────────────────────────────────────────────────────────────────────
// CELL GEOMETRY — W4-P.
//
// The month cell is the narrowest box in the cockpit, and nothing about it may
// be guessed. `grid-cols-7` tracks are `minmax(0,1fr)`, so a column is exactly
// containerWidth/7, and Tailwind's preflight `box-sizing: border-box` puts the
// `border-l` and the `p-1.5` INSIDE that. So:
//
//     cellContent = containerWidth / 7 − CELL_BORDER_PX − 2 × CELL_PAD_PX
//
// Measured against the four layouts this grid actually ships in (the rail is a
// 280px in-flow column at md+ and off-canvas below; the day spine is a 360px
// column at lg+ on /calendar/[ymd]):
//
//   | context                                  | container | column | content |
//   | phone 375 — rail off-canvas, no spine    |       375 |  53.57 |   40.57 |
//   | tablet 768 — rail in-flow, no spine      |       488 |  69.71 |   56.71 |
//   | desktop 1280 — rail + spine open         |       640 |  91.43 |   78.43 |
//   | desktop 1280 — rail, no spine            |      1000 | 142.86 |  129.86 |
//
// A 24px mark plus its gap costs 28px, so a phone cell fits exactly ONE and the
// shipped `flex-wrap` row stacked up to four. Because a CSS Grid row shares its
// height across all seven cells, one busy Wednesday inflated the whole Mon–Sun
// row from 64px to ~148px — the bug this block exists to make impossible.
//
// Read the table again for the reason it shipped: 1280px is BOTH 78.43px and
// 129.86px of cell depending on whether the spine is open. A VIEWPORT breakpoint
// cannot be correct here. The reveal thresholds below are a CONTAINER query on
// the grid itself, which measures the thing that is actually narrow — the same
// move PipelineStatsHeader makes for its KPI band.
//
// The 24px marks are a WCAG 2.5.8 (AA) target minimum and are a FLOOR: the fix
// for "they do not fit" is to show fewer of them, never smaller ones.
// ─────────────────────────────────────────────────────────────────────────────

/** `p-1.5`, per side. */
export const CELL_PAD_PX = 6
/** `border-l` on every cell but the first of a row. */
export const CELL_BORDER_PX = 1
/** `size-6` — the WCAG 2.5.8 (AA) target minimum. Never shrink this to fit. */
export const MARK_PX = 24
/** `gap-1` between marks, and before the count. */
export const MARK_GAP_PX = 4
/** Width held back for the day's total at the end of the row. Generous: two
 *  digits of `text-[10px] tabular-nums` measure ~12px. */
export const COUNT_RESERVE_PX = 16
/** The 8px grid mark in the narrow-width load strip (`KindDot`'s own size). */
export const LOAD_SHAPE_PX = 8
/** `gap-0.5` between load-strip shapes. */
export const LOAD_SHAPE_GAP_PX = 2
/** Distinct kinds the narrow strip names at once.
 *  2×8 + 1×2 + 4 + 16 = 38px against the phone's 40.57px. */
export const MAX_LOAD_SHAPES = 2

/** Content width one cell gets at a given grid container width. */
export function cellContentPx(containerPx: number): number {
  return containerPx / 7 - CELL_BORDER_PX - 2 * CELL_PAD_PX
}

/** Width `n` individually-addressable 24px marks need, count reserve included. */
export function marksRowPx(n: number): number {
  if (n <= 0) return 0
  return MARK_PX * n + MARK_GAP_PX * (n - 1) + MARK_GAP_PX + COUNT_RESERVE_PX
}

/** Width the narrow-width load strip needs for `n` deduplicated kind shapes. */
export function loadStripPx(n: number): number {
  if (n <= 0) return 0
  return LOAD_SHAPE_PX * n + LOAD_SHAPE_GAP_PX * (n - 1) + MARK_GAP_PX + COUNT_RESERVE_PX
}

/**
 * Grid container width at which the nth mark (0-indexed) is revealed.
 *
 * Solved from `cellContentPx(container) >= marksRowPx(n+1)`, i.e.
 * `container >= 7 × (28n + 29)` → 595 / 791 / 987 for two / three / four marks,
 * each rounded up to a round number. Marks 0 and 1 share the first gate: below
 * it the cell shows the load strip instead, so there is no individual mark to
 * reveal at all.
 */
export const MARK_REVEAL_PX = [600, 600, 800, 1000] as const

/**
 * Tailwind must see these as literal strings, so they are spelled out rather
 * than built from MARK_REVEAL_PX. `hidden` beats the mark's own `inline-flex`
 * through tailwind-merge (same display group, last wins), and the container
 * variant re-reveals it — so a mark that does not fit is removed from the
 * layout AND from the tab order rather than clipped into a phantom focus stop.
 */
const MARK_REVEAL_CLASS = [
  '',
  '',
  'hidden @min-[800px]/month:inline-flex',
  'hidden @min-[1000px]/month:inline-flex',
] as const

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * The kinds a narrow cell names, busiest first, capped at MAX_LOAD_SHAPES.
 *
 * Deduplicating is the point, not a compromise: four repeated `event` dots said
 * "event" four times and cost 108px to do it, while the same 16px of strip plus
 * the day's total says strictly more (Tufte, data-ink).
 *
 * The candidates come off the Map in FEED order — deliberately, and not from
 * `CALENDAR_KINDS.filter(...)`. Seeding from the canonical list would pre-sort
 * the input and leave the comparator's tiebreak unreachable dead code that no
 * test could ever fail on (mutation-checked: it survived every mutation until
 * this line changed). Making the comparator carry the whole ordering is what
 * makes it verifiable — and it has to be a TOTAL order, count first and the
 * canonical index second, or two same-count kinds would sort inconsistently
 * from one render to the next.
 */
export function loadShapes(items: CalendarItem[], max: number = MAX_LOAD_SHAPES): CalendarKind[] {
  const n = new Map<CalendarKind, number>()
  for (const i of items) n.set(i.kind, (n.get(i.kind) ?? 0) + 1)
  return [...n.keys()]
    .sort((a, b) => n.get(b)! - n.get(a)! || CALENDAR_KINDS.indexOf(a) - CALENDAR_KINDS.indexOf(b))
    .slice(0, max)
}

interface MonthGridProps {
  orgSlug: string
  /** The whole feed; the month window is filtered internally. */
  items: CalendarItem[]
  /** Any ymd within the month, or 'YYYY-MM'. */
  month: string
  today: string
  selected?: string
  /** Preserved on every day link. */
  kinds?: string
  view?: string
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Accessible cell name: "Wed, Aug 19, 3 items: 2 Booked event, 1 Invoice due" /
 *  "…, 1 item: 1 Task" / "…, nothing scheduled".
 *
 *  The kind breakdown is the cell's non-colour channel (WCAG 1.4.1). The dots
 *  carry shape + an sr-only name of their own, but an `aria-label` on the
 *  wrapping link SWALLOWS its subtree, so a screen-reader user would otherwise
 *  hear only "3 items" and never learn that one of them is an overdue invoice.
 *  Month/day order is composed explicitly so it never flips to a locale's
 *  day-first form. */
function cellAriaLabel(ymd: string, items: CalendarItem[], verdict: DayVerdict | null): string {
  const dt = new Date(`${ymd}T00:00:00.000Z`)
  const weekday = dt.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
  const date = `${weekday}, ${MONTHS_SHORT[dt.getUTCMonth()]} ${dt.getUTCDate()}`
  const count = items.length
  const byKind = CALENDAR_KINDS.map((k) => ({ k, n: items.filter((i) => i.kind === k).length }))
    .filter(({ n }) => n > 0)
    .map(({ k, n }) => `${n} ${CALENDAR_KIND_LABELS[k]}`)
  const load =
    count === 0 ? 'nothing scheduled' : `${count} ${count === 1 ? 'item' : 'items'}: ${byKind.join(', ')}`
  // The bookability verdict rides in the SAME label rather than a title
  // attribute, for the same reason the kind breakdown does: this aria-label
  // swallows the cell's whole subtree, so a mark with its own sr-only name
  // would never be announced. And the empty case is exactly the one this
  // feature exists for — "nothing scheduled" is not the same claim as "free".
  if (!verdict || verdict.verdict === 'open') return `${date}, ${load}`
  return `${date}, ${load}. ${VERDICT_LABEL[verdict.verdict]} for booking${
    verdict.binding ? `: ${verdict.binding.reason}` : ''
  }`
}

/**
 * A density mark that is also a GRAB HANDLE.
 *
 * Why a real button and not the bare dot: a booked job has to be individually
 * addressable before it can be individually moved, by pointer OR by keyboard.
 * That is also why the day link below is a stretched overlay rather than a
 * wrapper — an `<a>` may not contain interactive content (and anything with a
 * tabindex counts), so a focusable handle inside the old cell-wide link would
 * have been invalid HTML and unusable with a screen reader.
 *
 * The 24px box is WCAG 2.5.8 (AA) target minimum. The mark inside stays the 8px
 * grid dot, so the cell reads exactly as it did.
 */
function JobHandle({ item, className }: { item: CalendarItem; className?: string }) {
  const props = useReschedule().handleProps(item) as Partial<HandleProps>
  const { className: dragClass, style: dragStyle, ...rest } = props
  return (
    <button
      type="button"
      {...rest}
      data-slot="month-job-handle"
      style={dragStyle}
      className={cn(
        'pointer-events-auto inline-flex size-6 shrink-0 items-center justify-center rounded-sm',
        'hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        'motion-safe:transition-colors motion-reduce:transition-none',
        dragClass,
        // last: the container-query reveal must beat the base `inline-flex`
        className
      )}
    >
      <KindDot kind={item.kind} hideLabel data-testid="density-dot" />
      <span className="sr-only">
        Move {item.title} — {dayLabel(item.date)}. Bracket keys move it a day; braces a week.
      </span>
    </button>
  )
}

/** The month is a drag surface too — thirty-odd day cells, each a drop target. */
export function MonthGrid(props: MonthGridProps) {
  return (
    <RescheduleProvider orgSlug={props.orgSlug} items={props.items}>
      <MonthGridInner {...props} />
    </RescheduleProvider>
  )
}

function MonthGridInner({ orgSlug, items: itemsProp, month, today, selected, kinds, view }: MonthGridProps) {
  const { items, activeDropDay } = useReschedule(itemsProp)
  // null outside the cockpit shell (a bare grid in a test or an embed) — the
  // grid then renders exactly as it did before this feature existed.
  const bookCtx = useBookabilityCtx()
  const monthKey = month.slice(0, 7)
  const [year, month1] = monthKey.split('-').map(Number)
  const firstYmd = `${monthKey}-01`

  const dayHref = (ymd: string) => {
    const p = new URLSearchParams()
    if (kinds) p.set('kinds', kinds)
    if (view) p.set('view', view)
    const q = p.toString()
    return `/${orgSlug}/calendar/${ymd}${q ? `?${q}` : ''}`
  }

  // Monday-start grid: pad leading days from the previous month, then fill whole weeks.
  const firstDow = new Date(`${firstYmd}T00:00:00.000Z`).getUTCDay() // 0 Sun … 6 Sat
  const lead = (firstDow + 6) % 7
  const total = Math.ceil((lead + daysInMonth(year, month1)) / 7) * 7
  const gridStart = addDays(firstYmd, -lead)
  // Per-day off the FULL feed (feedForDay's span logic), then judge emptiness
  // from the in-month days — a multi-day event that only SPANS into the month
  // (its start date is in the prior month) still counts, and still shows.
  const perCell = Array.from({ length: total }, (_, i) => {
    const day = addDays(gridStart, i)
    return {
      day,
      inMonth: day.slice(0, 7) === monthKey,
      items: feedForDay(items, day),
      // The Bookability Verdict, resolved once per cell. Computed straight from
      // the context rather than through `useDayVerdict` because a hook cannot be
      // called inside this map, and splitting the cell into its own component
      // would mean re-cutting the drag structure that was just settled here.
      //
      // Skipped for days behind today (nobody asks whether they were free last
      // Tuesday — see bookability-context.tsx).
      verdict: bookCtx && day >= bookCtx.today ? bindingConstraint(day, bookCtx) : null,
    }
  })

  // A month with no items but a real verdict on it is NOT an empty month — it is
  // the exact case this feature exists for. "Nothing scheduled this month" over
  // a fortnight that cannot be prepped in time is the same lie an empty cell used
  // to tell: no feed items is not the same claim as free. So the onboarding empty
  // state yields to the grid the moment the grid has something true to say.
  const hasVerdictSignal = perCell.some((c) => c.inMonth && c.verdict && c.verdict.verdict !== 'open')

  if (!hasVerdictSignal && perCell.every((c) => !c.inMonth || c.items.length === 0)) {
    return (
      <EmptyState
        title="Nothing scheduled this month"
        description="Booked jobs, holds, drops, tasks and invoice due dates all land here."
        className="px-5 py-12"
        action={
          <Link
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            href={`/${orgSlug}/new-event?date=${firstYmd}`}
          >
            Book a job
          </Link>
        }
      />
    )
  }

  return (
    <section aria-label="Month view" className="min-w-0">
      {/* The query container for the cell geometry above. Scoped to the two grid
          rows rather than the <section> so `RescheduleBar`'s sticky positioning
          stays outside the containment this establishes. */}
      <div data-slot="month-container" className="@container/month min-w-0">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAY_HEADERS.map((w) => (
            <div
              key={w}
              className="border-l border-border/60 px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground first:border-l-0"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {perCell.map(({ day: d, inMonth, items: dayItems, verdict }) => {
            const dots = dayItems.slice(0, MAX_DOTS)
            const isToday = d === today
            const isSelected = d === selected
            const dayNum = Number(d.slice(8, 10))
            const isDropTarget = activeDropDay === d
            return (
              // The CELL is the box and the drop target; the day LINK is a
              // stretched overlay inside it. See JobHandle for why.
              <div
                key={d}
                data-slot="month-cell-box"
                data-day={d}
                data-drop-day={d}
                data-drop-active={isDropTarget || undefined}
                // Only present when there IS something to say. `open` is the
                // default state of a date and the default state leaves no trace —
                // in the DOM as much as in the ink.
                data-verdict={verdict && verdict.verdict !== 'open' ? verdict.verdict : undefined}
                // The `closed` hatch. Suppressed on a pad day and mid-drag for the
                // same reasons the tint is (see below).
                style={inMonth && verdict && !isDropTarget ? verdictCellStyle(verdict.verdict) : undefined}
                className={cn(
                  'relative flex min-h-16 flex-col gap-1 border-b border-l border-border/60 p-1.5 text-left',
                  'motion-safe:transition-colors motion-reduce:transition-none',
                  '[&:nth-child(7n+1)]:border-l-0',
                  // Tint IN-MONTH days only. A pad day from the flanking month is
                  // already washed to bg-muted/30 and a second wash on top is
                  // indistinguishable — it would read as a rendering bug, not a
                  // verdict. The pad day keeps its MARK (below), which is the
                  // non-colour channel and the one that actually carries meaning.
                  inMonth && verdict && verdictCellTone(verdict.verdict),
                  !inMonth && 'bg-muted/30 text-muted-foreground',
                  // Drop-target feedback outranks the verdict: mid-drag, "this is
                  // where it lands" is the only thing the operator is reading.
                  isDropTarget && 'bg-primary/10 ring-2 ring-inset ring-ring'
                )}
              >
                <Link
                  href={dayHref(d)}
                  data-slot="month-cell"
                  data-day={d}
                  aria-label={cellAriaLabel(d, dayItems, verdict)}
                  aria-current={isSelected ? 'date' : undefined}
                  className={cn(
                    'absolute inset-0 transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none',
                    isSelected && 'ring-1 ring-inset ring-ring'
                  )}
                />
                {/* Day number and verdict mark share one row: the mark belongs to
                    the DATE, not to the items below it, and a day with no items at
                    all still has to be able to say "closed". pointer-events-none
                    keeps the stretched day link underneath tappable. */}
                <span className="pointer-events-none relative flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      // shrink-0: a month cell is ~53px wide on a 375px phone and
                      // the row is [24px number][4px gap][8px mark]. It fits, but
                      // only just — neither item may be allowed to squeeze.
                      'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums',
                      isToday ? 'bg-foreground font-bold text-background' : 'font-medium'
                    )}
                  >
                    {dayNum}
                  </span>
                  {verdict ? (
                    // hideLabel: the cell's aria-label swallows this subtree, so
                    // the verdict text lives there (cellAriaLabel).
                    <BookabilityMark
                      verdict={verdict.verdict}
                      hideLabel
                      data-testid="bookability-mark"
                      className="mr-0.5"
                    />
                  ) : null}
                </span>
                {dayItems.length > 0 ? (
                  // ONE line, at every width, for every item count — `flex-nowrap`
                  // is the whole structural fix. A wrapping row here does not just
                  // overflow its own cell: CSS Grid shares a row's height across
                  // all seven, so one busy day used to inflate the entire week.
                  // What varies with width is WHICH marks are in the line, never
                  // how many lines there are.
                  //
                  // pointer-events-none so a tap anywhere but a handle still opens
                  // the day through the overlay link beneath.
                  <span
                    data-slot="month-load"
                    className="pointer-events-none relative mt-auto flex min-w-0 flex-nowrap items-center gap-1"
                  >
                    {/* NARROW (container < 600px — every phone, and a tablet in
                        portrait). Individual 24px handles are impossible here
                        without either wrapping the row or breaking the 2.5.8
                        floor, so the cell stops being a manipulation surface and
                        becomes a density read-out — which is what Apple Calendar,
                        Google Calendar, Fantastical and Outlook all do with a
                        phone month cell. The kind channel survives the collapse
                        as deduplicated shapes, which is more than those four
                        manage: their dots are anonymous, so a month cell cannot
                        tell you one of the three things on Friday is an invoice
                        coming due. Ours can, and the aria-label still names every
                        kind at every width.
                        The keyboard/AT path to the individual items is the cell's
                        own stretched day link → /calendar/[ymd], where each item
                        is a full-size row with its own handle and [ / ] keys. */}
                    <span
                      data-slot="month-load-strip"
                      className="flex flex-nowrap items-center gap-0.5 @min-[600px]/month:hidden"
                    >
                      {loadShapes(dayItems).map((k) => (
                        // hideLabel: the strip is a visual channel; the cell link's
                        // aria-label carries the full breakdown (cellAriaLabel).
                        <KindDot key={k} kind={k} hideLabel data-testid="load-shape" />
                      ))}
                    </span>

                    {/* WIDE. Each mark is revealed only once the container is
                        provably wide enough for it (MARK_REVEAL_PX). */}
                    <span
                      data-slot="month-marks"
                      className="hidden flex-nowrap items-center gap-1 @min-[600px]/month:flex"
                    >
                      {dots.map((i, n) =>
                        canReschedule(i) ? (
                          <JobHandle key={`${i.kind}:${i.id}`} item={i} className={MARK_REVEAL_CLASS[n]} />
                        ) : (
                          // hideLabel: the cell's own aria-label swallows the
                          // subtree, so the kind names live there (cellAriaLabel).
                          <KindDot
                            key={`${i.kind}:${i.id}`}
                            kind={i.kind}
                            hideLabel
                            data-testid="density-dot"
                            className={cn('size-6 justify-center', MARK_REVEAL_CLASS[n])}
                          />
                        )
                      )}
                    </span>

                    {/* The day's TOTAL, not the overflow. "+2" beside four dots
                        made the reader add 4+2 to learn "6", and it welded the
                        number to how many marks rendered — which is exactly what
                        would stop the reveal above from being allowed to drop one.
                        A total is stable at every width and says more.
                        Suppressed at n=1: a lone mark with no number IS one item,
                        and a grid of 42 cells each printing "1" is noise.
                        aria-hidden because the cell link's own label already says
                        "6 items: 2 Booked event, …" — this is its visual echo. */}
                    {dayItems.length > 1 ? (
                      <span
                        aria-hidden
                        data-slot="month-load-count"
                        className="ml-auto text-[10px] font-medium tabular-nums text-muted-foreground"
                      >
                        {dayItems.length}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <RescheduleBar />
    </section>
  )
}
