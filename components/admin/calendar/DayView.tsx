import { feedForDay, type CalendarItem } from '@/lib/calendar'
import { TimeGridDay, DAY_END_HOUR, DAY_START_HOUR } from '@/components/admin/calendar/TimeGridDay'
import { cn } from '@/lib/utils'

interface DayViewProps {
  orgSlug: string
  /** The whole feed; the day is filtered internally. */
  items: CalendarItem[]
  ymd: string
  today?: string
  dayStartHour?: number
  dayEndHour?: number
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
}: DayViewProps) {
  const dayItems = feedForDay(items, ymd)
  const isToday = today === ymd

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
        dayStartHour={dayStartHour}
        dayEndHour={dayEndHour}
      />
    </section>
  )
}
