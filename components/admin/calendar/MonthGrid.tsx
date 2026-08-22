'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { CALENDAR_KIND_LABELS, CALENDAR_KINDS, feedForDay, type CalendarItem } from '@/lib/calendar'
import { addDays } from '@/lib/opportunity-detail'
import { cn } from '@/lib/utils'
import { KindDot } from '@/components/admin/calendar/KindDot'
import {
  RescheduleBar,
  RescheduleProvider,
  canReschedule,
  dayLabel,
  useReschedule,
  type HandleProps,
} from '@/components/admin/calendar/reschedule-drag'

/** Dots shown before a day collapses to "+N" (decision #2 — dots, not chips). */
export const MAX_DOTS = 4

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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
function cellAriaLabel(ymd: string, items: CalendarItem[]): string {
  const dt = new Date(`${ymd}T00:00:00.000Z`)
  const weekday = dt.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
  const date = `${weekday}, ${MONTHS_SHORT[dt.getUTCMonth()]} ${dt.getUTCDate()}`
  const count = items.length
  if (count === 0) return `${date}, nothing scheduled`
  const byKind = CALENDAR_KINDS.map((k) => ({ k, n: items.filter((i) => i.kind === k).length }))
    .filter(({ n }) => n > 0)
    .map(({ k, n }) => `${n} ${CALENDAR_KIND_LABELS[k]}`)
  return `${date}, ${count} ${count === 1 ? 'item' : 'items'}: ${byKind.join(', ')}`
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
function JobHandle({ item }: { item: CalendarItem }) {
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
        dragClass
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
    return { day, inMonth: day.slice(0, 7) === monthKey, items: feedForDay(items, day) }
  })

  if (perCell.every((c) => !c.inMonth || c.items.length === 0)) {
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
        {perCell.map(({ day: d, inMonth, items: dayItems }) => {
          const dots = dayItems.slice(0, MAX_DOTS)
          const overflow = dayItems.length - dots.length
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
              className={cn(
                'relative flex min-h-16 flex-col gap-1 border-b border-l border-border/60 p-1.5 text-left',
                'motion-safe:transition-colors motion-reduce:transition-none',
                '[&:nth-child(7n+1)]:border-l-0',
                !inMonth && 'bg-muted/30 text-muted-foreground',
                isDropTarget && 'bg-primary/10 ring-2 ring-inset ring-ring'
              )}
            >
              <Link
                href={dayHref(d)}
                data-slot="month-cell"
                data-day={d}
                aria-label={cellAriaLabel(d, dayItems)}
                aria-current={isSelected ? 'date' : undefined}
                className={cn(
                  'absolute inset-0 transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none',
                  isSelected && 'ring-1 ring-inset ring-ring'
                )}
              />
              <span
                className={cn(
                  'pointer-events-none relative inline-flex size-6 items-center justify-center self-start rounded-full text-xs tabular-nums',
                  isToday ? 'bg-foreground font-bold text-background' : 'font-medium'
                )}
              >
                {dayNum}
              </span>
              {dayItems.length > 0 ? (
                // pointer-events-none so a tap anywhere but a handle still opens
                // the day through the overlay link beneath.
                <span className="pointer-events-none relative mt-auto flex flex-wrap items-center gap-1">
                  {dots.map((i) =>
                    canReschedule(i) ? (
                      <JobHandle key={`${i.kind}:${i.id}`} item={i} />
                    ) : (
                      // hideLabel: the cell's own aria-label swallows the
                      // subtree, so the kind names live there (cellAriaLabel).
                      <KindDot
                        key={`${i.kind}:${i.id}`}
                        kind={i.kind}
                        hideLabel
                        data-testid="density-dot"
                        className="size-6 justify-center"
                      />
                    )
                  )}
                  {overflow > 0 ? (
                    <span className="text-[10px] font-medium tabular-nums text-muted-foreground">+{overflow}</span>
                  ) : null}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>

      <RescheduleBar />
    </section>
  )
}
