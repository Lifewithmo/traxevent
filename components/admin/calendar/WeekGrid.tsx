'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedForDay, weekDays, type CalendarItem } from '@/lib/calendar'
import { cn } from '@/lib/utils'
import {
  HoursGutter,
  TimeGridDay,
  DAY_END_HOUR,
  DAY_START_HOUR,
} from '@/components/admin/calendar/TimeGridDay'
import { BookabilityMark, verdictCellStyle, verdictCellTone } from '@/components/admin/calendar/BookabilityMark'
import { useBookabilityCtx } from '@/components/admin/calendar/bookability-context'
import { bindingConstraint, VERDICT_LABEL } from '@/lib/calendar-bookability'
import {
  RescheduleBar,
  RescheduleProvider,
  useReschedule,
} from '@/components/admin/calendar/reschedule-drag'

interface WeekGridProps {
  orgSlug: string
  /** The whole feed; the week window is filtered internally. */
  items: CalendarItem[]
  /** Monday of the shown week (ymd). */
  weekStart: string
  today: string
  /** The day whose spine is open — highlighted in the header. */
  selected?: string
  /** Preserved on every day-header link so the filter/view survive the jump. */
  kinds?: string
  view?: string
  dayStartHour?: number
  dayEndHour?: number
}

function dayLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

// One template drives all three rows so the hours gutter, the weekday headers,
// the all-day band and the time bodies stay column-aligned.
const GRID_TEMPLATE = 'grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]'

/** The week is a drag surface, so it owns a reschedule scope: seven day columns
 *  that are each a drop target, one optimistic feed, one Undo. */
export function WeekGrid(props: WeekGridProps) {
  return (
    <RescheduleProvider orgSlug={props.orgSlug} items={props.items}>
      <WeekGridInner {...props} />
    </RescheduleProvider>
  )
}

function WeekGridInner({
  orgSlug,
  items: itemsProp,
  weekStart,
  today,
  selected,
  kinds,
  view,
  dayStartHour = DAY_START_HOUR,
  dayEndHour = DAY_END_HOUR,
}: WeekGridProps) {
  // The feed with any in-flight optimistic move already applied — a job dropped
  // on Saturday must appear on Saturday before the server has said yes.
  const { items, activeDropDay } = useReschedule(itemsProp)
  // null outside the cockpit shell — the header then renders exactly as before.
  const bookCtx = useBookabilityCtx()
  const days = weekDays(weekStart)
  // Per-day off the FULL feed so feedForDay's span logic keeps a multi-day event
  // that STARTS before the week on its interior days — a start-date range filter
  // would drop it. Emptiness is judged the same overlap-aware way.
  const perDay = days.map((d) => ({ day: d, items: feedForDay(items, d) }))
  // Same rule as MonthGrid: a week with no items but a real verdict on it is not
  // an empty week. "Nothing on the calendar this week" over days that cannot be
  // prepped in time repeats the very lie this feature removes.
  const hasVerdictSignal = days.some(
    (d) => bookCtx && d >= bookCtx.today && bindingConstraint(d, bookCtx).verdict !== 'open'
  )
  const isEmpty = !hasVerdictSignal && perDay.every((p) => p.items.length === 0)

  const dayHref = (ymd: string) => {
    const p = new URLSearchParams()
    if (kinds) p.set('kinds', kinds)
    if (view) p.set('view', view)
    const q = p.toString()
    return `/${orgSlug}/calendar/${ymd}${q ? `?${q}` : ''}`
  }

  if (isEmpty) {
    return (
      <EmptyState
        title="Nothing on the calendar this week"
        description="Booked jobs, holds, drops, tasks and invoice due dates all land here."
        className="px-5 py-12"
        action={
          <Link
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            href={`/${orgSlug}/new-event?date=${weekStart}`}
          >
            Book a job
          </Link>
        }
      />
    )
  }

  return (
    <section aria-label="Week grid" className="min-w-0">
      {/* Header row */}
      <div className={cn(GRID_TEMPLATE, 'border-b border-border')}>
        <div aria-hidden />
        {days.map((d) => {
          const isToday = d === today
          const isSelected = d === selected
          // Days behind today get no verdict — see bookability-context.tsx.
          const verdict = bookCtx && d >= bookCtx.today ? bindingConstraint(d, bookCtx) : null
          const marked = verdict && verdict.verdict !== 'open'
          return (
            <Link
              key={d}
              href={dayHref(d)}
              data-slot="week-day-header"
              data-day={d}
              data-verdict={marked ? verdict.verdict : undefined}
              style={verdict && !isToday && !isSelected ? verdictCellStyle(verdict.verdict) : undefined}
              aria-current={isSelected ? 'date' : undefined}
              className={cn(
                // Plain inline flow, NOT a flex row: a week column is ~47px
                // wide on a 375px phone and the label alone nearly fills it. A
                // flex row could not shrink below [label]+[glyph]; inline flow
                // wraps the glyph under the label instead of overflowing.
                'border-l border-border/60 px-2 py-1.5 text-center font-mono text-[10px] font-bold uppercase tracking-wide transition-colors hover:bg-muted motion-reduce:transition-none',
                // Today and the open day own their own inverted/ringed treatment;
                // a verdict wash underneath them would only mud it. Those two
                // headers keep the MARK, which is the channel that carries the
                // meaning anyway — the tint was never doing the work alone.
                verdict && !isToday && !isSelected && verdictCellTone(verdict.verdict),
                isToday && 'bg-foreground text-background',
                isSelected && !isToday && 'bg-muted text-foreground ring-1 ring-inset ring-ring',
                !isToday && !isSelected && 'text-muted-foreground'
              )}
            >
              {dayLabel(d)}
              {marked ? (
                <>
                  {/* currentColor, so the glyph stays legible on the inverted
                      "today" chip as well as on a tinted header. */}
                  <BookabilityMark
                    verdict={verdict.verdict}
                    hideLabel
                    data-testid="bookability-mark"
                    className="ml-1 align-middle"
                  />
                  <span className="sr-only">
                    — {VERDICT_LABEL[verdict.verdict]} for booking
                    {verdict.binding ? `: ${verdict.binding.reason}` : ''}
                  </span>
                </>
              ) : null}
            </Link>
          )
        })}
      </div>

      {/* All-day band row — one shared band spanning the week */}
      <div className={cn(GRID_TEMPLATE, 'items-stretch border-b border-border')}>
        <div className="flex items-start justify-end p-1.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
          all-day
        </div>
        {perDay.map(({ day, items: dayItems }) => (
          <div
            key={day}
            data-slot="week-band-cell"
            data-day={day}
            // An all-day chip dropped here changes only the DAY — the band is
            // not a time zone, so it carries no grid geometry.
            data-drop-day={day}
            data-drop-active={activeDropDay === day || undefined}
            className={cn(
              'border-l border-border/60 motion-safe:transition-colors motion-reduce:transition-none',
              activeDropDay === day && 'bg-primary/5'
            )}
          >
            <TimeGridDay orgSlug={orgSlug} ymd={day} items={dayItems} section="band" />
          </div>
        ))}
      </div>

      {/* Time-grid body row — shared hours gutter + seven day bodies */}
      <div className={cn(GRID_TEMPLATE, 'overflow-x-auto')}>
        <HoursGutter dayStartHour={dayStartHour} dayEndHour={dayEndHour} />
        {perDay.map(({ day, items: dayItems }) => (
          <div
            key={day}
            data-slot="week-body-cell"
            data-day={day}
            // Safety net for the 1px of cell that the body does not cover; the
            // body's own zone (which carries the hour geometry) wins whenever
            // the pointer is actually over the grid.
            data-drop-day={day}
            className="flex border-l border-border/60"
          >
            <TimeGridDay
              orgSlug={orgSlug}
              ymd={day}
              items={dayItems}
              section="body"
              dayStartHour={dayStartHour}
              dayEndHour={dayEndHour}
            />
          </div>
        ))}
      </div>

      <RescheduleBar />
    </section>
  )
}
