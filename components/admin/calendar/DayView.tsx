import { feedForDay, type CalendarItem } from '@/lib/calendar'
import {
  dayWindowFor,
  TimeGridDay,
  DAY_END_HOUR,
  DAY_START_HOUR,
  DEFAULT_BUSINESS_HOURS,
} from '@/components/admin/calendar/TimeGridDay'
import type { BusinessHours } from '@/lib/types'
import { cn } from '@/lib/utils'

interface DayViewProps {
  orgSlug: string
  /** The whole feed; the day is filtered internally. */
  items: CalendarItem[]
  ymd: string
  today?: string
  dayStartHour?: number
  dayEndHour?: number
  /** Org working window; out-of-hours rows are shaded. Defaults to 8am–6pm. */
  businessHours?: BusinessHours
}

function fullDayLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** A single day at full width — the Day view is the TimeGridDay primitive with
 *  its own hours gutter, under a plain date heading. */
export function DayView({
  orgSlug,
  items,
  ymd,
  today,
  dayStartHour = DAY_START_HOUR,
  dayEndHour = DAY_END_HOUR,
  businessHours = DEFAULT_BUSINESS_HOURS,
}: DayViewProps) {
  const dayItems = feedForDay(items, ymd)
  const isToday = today === ymd
  // The Day view owns its own hours gutter, so it can afford the day's REAL
  // extremes: a 5am load-in or a 1am teardown grows the window instead of being
  // clamped into 6am–10pm, which would misstate when the job actually runs.
  // (The Week view can't — seven columns share one gutter — so a clipped item
  //  there keeps its true hours on the chip and is flagged instead.)
  const hours = dayWindowFor(dayItems, dayStartHour, dayEndHour)

  return (
    <section aria-label="Day view" className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-border px-5 py-3">
        <h1 className={cn('text-base font-semibold', isToday && 'text-foreground')}>{fullDayLabel(ymd)}</h1>
        {isToday ? (
          <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground">today</span>
        ) : null}
      </div>
      <TimeGridDay
        orgSlug={orgSlug}
        ymd={ymd}
        items={dayItems}
        section="all"
        withGutter
        dayStartHour={hours.dayStartHour}
        dayEndHour={hours.dayEndHour}
        businessHours={businessHours}
      />
    </section>
  )
}
