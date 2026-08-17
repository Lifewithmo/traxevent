import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { CalendarItem } from '@/lib/calendar'
import { KIND_DOT } from '@/components/admin/calendar/kind-color'

// Hybrid time-grid geometry. Exported so callers (and tests) share the exact
// px-per-hour scale — a timed item's `top` is derived from these, never guessed.
export const PX_PER_HOUR = 48
export const DAY_START_HOUR = 6 // 6am — earlier than most prep starts
export const DAY_END_HOUR = 22 // 10pm — covers evening events
const MIN_ITEM_PX = 22 // a 15-minute window is still a tappable target

/** 'HH:mm' → fractional hour ('16:30' → 16.5). */
function hourOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h + (Number.isFinite(m) ? m : 0) / 60
}

/** 24h hour(+min) → compact 12h label: 6 → "6a", 13 → "1p", 16:30 → "4:30p". */
function fmt12(h: number, m = 0): string {
  const ap = h < 12 || h >= 24 ? 'a' : 'p'
  let hh = h % 12
  if (hh === 0) hh = 12
  return m ? `${hh}:${String(m).padStart(2, '0')}${ap}` : `${hh}${ap}`
}

function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return fmt12(h, m || 0)
}

function hourRange(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

interface TimeGridDayProps {
  /** Items already scoped to this one day (via feedForDay). */
  items: CalendarItem[]
  ymd: string
  /** Builds the empty-day CTA target. */
  orgSlug: string
  /** 'all' = band + body stacked (Day view); 'band'/'body' = one row for the
   *  Week view, so seven columns share a single all-day band and hours gutter. */
  section?: 'all' | 'band' | 'body'
  /** Render the hours gutter beside the body (Day view; the Week view supplies
   *  one shared gutter instead). */
  withGutter?: boolean
  dayStartHour?: number
  dayEndHour?: number
}

/** The shared hours column — one per week/day, aligned to the same scale as
 *  every TimeGridDay body so the lines meet the labels. */
export function HoursGutter({
  dayStartHour = DAY_START_HOUR,
  dayEndHour = DAY_END_HOUR,
}: {
  dayStartHour?: number
  dayEndHour?: number
}) {
  return (
    <div
      className="relative w-12 shrink-0"
      style={{ height: (dayEndHour - dayStartHour) * PX_PER_HOUR }}
      aria-hidden
    >
      {hourRange(dayStartHour, dayEndHour).map((h) => (
        <span
          key={h}
          className="absolute right-1 -translate-y-1/2 font-mono text-[10px] tabular-nums text-muted-foreground"
          style={{ top: (h - dayStartHour) * PX_PER_HOUR }}
        >
          {fmt12(h)}
        </span>
      ))}
    </div>
  )
}

/** An all-day / due-that-day chip. Events without hours read "time TBD"; an
 *  invoice keeps its balance. Colour comes from the kind token. */
function BandChip({ item }: { item: CalendarItem }) {
  const tbd = item.kind === 'event'
  return (
    <Link
      href={item.href}
      className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-1.5 py-1 text-[11px] leading-tight transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none"
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: KIND_DOT[item.kind] }}
        aria-hidden
      />
      <span className={cn('min-w-0 flex-1 truncate', item.blocker && 'text-destructive')}>{item.title}</span>
      {tbd ? <span className="shrink-0 text-[10px] text-muted-foreground">Time TBD</span> : null}
      {item.kind === 'invoice_due' && item.amount != null ? (
        <span className="shrink-0 font-semibold tabular-nums text-[var(--money-green)]">{formatMoney(item.amount)}</span>
      ) : null}
    </Link>
  )
}

/** A timed item positioned by its start; height ∝ duration. */
function GridItem({ item, dayStartHour }: { item: CalendarItem; dayStartHour: number }) {
  const start = hourOf(item.start!)
  const end = item.end ? hourOf(item.end) : start + 1
  const top = Math.max(0, (start - dayStartHour) * PX_PER_HOUR)
  const height = Math.max(MIN_ITEM_PX, (end - start) * PX_PER_HOUR)
  return (
    <Link
      href={item.href}
      data-slot="grid-item"
      style={{ top, height, borderLeftColor: KIND_DOT[item.kind] }}
      className="absolute inset-x-1 overflow-hidden rounded-sm border border-border border-l-[3px] bg-card px-1.5 py-0.5 text-[11px] leading-tight shadow-xs transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none"
    >
      <span className="block truncate font-medium">{item.title}</span>
      <span className="block truncate text-[10px] text-muted-foreground tabular-nums">
        {timeLabel(item.start!)}
        {item.end ? `–${timeLabel(item.end)}` : ''}
        {item.detail ? ` · ${item.detail}` : ''}
      </span>
    </Link>
  )
}

function TimeGridBody({
  timed,
  dayStartHour,
  dayEndHour,
}: {
  timed: CalendarItem[]
  dayStartHour: number
  dayEndHour: number
}) {
  return (
    <div
      data-slot="time-grid-body"
      className="relative flex-1"
      style={{ height: (dayEndHour - dayStartHour) * PX_PER_HOUR }}
    >
      {hourRange(dayStartHour, dayEndHour).map((h) => (
        <div
          key={h}
          className="absolute inset-x-0 border-t border-border/50"
          style={{ top: (h - dayStartHour) * PX_PER_HOUR }}
          aria-hidden
        />
      ))}
      {timed
        .slice()
        .sort((a, b) => a.start!.localeCompare(b.start!))
        .map((i) => (
          <GridItem key={`${i.kind}:${i.id}`} item={i} dayStartHour={dayStartHour} />
        ))}
    </div>
  )
}

function AllDayBand({ band }: { band: CalendarItem[] }) {
  return (
    <div data-slot="all-day-band" className="min-h-8 space-y-1 p-1.5">
      {band.length === 0 ? (
        <p className="px-0.5 py-1 text-[10px] text-muted-foreground">Nothing all-day</p>
      ) : (
        band.map((i) => <BandChip key={`${i.kind}:${i.id}`} item={i} />)
      )}
    </div>
  )
}

/**
 * One day as an all-day band (due-that-day kinds + any event lacking hours,
 * shown "time TBD") over a time-grid body that positions only items carrying a
 * projected time (events with hours, drop windows). A due date is never pinned
 * to a fake hour — it lives in the band.
 */
export function TimeGridDay({
  items,
  ymd,
  orgSlug,
  section = 'all',
  withGutter = false,
  dayStartHour = DAY_START_HOUR,
  dayEndHour = DAY_END_HOUR,
}: TimeGridDayProps) {
  // The single rule: an item with a start time is placed on the grid; anything
  // without one (every date-only kind, plus hour-less events) lives in the band.
  const timed = items.filter((i) => i.start)
  const band = items.filter((i) => !i.start)

  if (section === 'band') {
    return <AllDayBand band={band} />
  }
  if (section === 'body') {
    return <TimeGridBody timed={timed} dayStartHour={dayStartHour} dayEndHour={dayEndHour} />
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing scheduled"
        description="Booked jobs, drops, tasks and due dates for this day land here."
        className="px-5 py-10"
        action={
          <Link className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/${orgSlug}/new-event`}>
            Book a job
          </Link>
        }
      />
    )
  }

  return (
    <div data-slot="time-grid-day">
      <div className="flex border-b border-border">
        {withGutter ? (
          <div className="flex w-12 shrink-0 items-start justify-end p-1.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
            all-day
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <AllDayBand band={band} />
        </div>
      </div>
      <div className="flex">
        {withGutter ? <HoursGutter dayStartHour={dayStartHour} dayEndHour={dayEndHour} /> : null}
        <TimeGridBody timed={timed} dayStartHour={dayStartHour} dayEndHour={dayEndHour} />
      </div>
    </div>
  )
}
