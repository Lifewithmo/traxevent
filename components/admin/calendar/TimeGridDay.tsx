import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { CALENDAR_KIND_LABELS, type CalendarItem } from '@/lib/calendar'
import { KIND_DOT } from '@/components/admin/calendar/kind-color'

// Hybrid time-grid geometry. Exported so callers (and tests) share the exact
// px-per-hour scale — a timed item's `top` is derived from these, never guessed.
export const PX_PER_HOUR = 48
export const DAY_START_HOUR = 6 // 6am — earlier than most prep starts
export const DAY_END_HOUR = 22 // 10pm — covers evening events
// Floor so even a 15-minute window clears the WCAG touch target (44px > 24px min).
const MIN_ITEM_PX = 44

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
      className="flex min-h-6 items-center gap-1.5 rounded-sm border border-border bg-card px-1.5 py-1.5 text-[11px] leading-tight transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none"
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: KIND_DOT[item.kind] }}
        aria-hidden
      />
      <span className="sr-only">{CALENDAR_KIND_LABELS[item.kind]}: </span>
      <span className={cn('min-w-0 flex-1 truncate', item.blocker && 'text-destructive')}>{item.title}</span>
      {tbd ? <span className="shrink-0 text-[10px] text-muted-foreground">Time TBD</span> : null}
      {item.kind === 'invoice_due' && item.amount != null ? (
        <span className="shrink-0 font-semibold tabular-nums text-[var(--money-green)]">{formatMoney(item.amount)}</span>
      ) : null}
    </Link>
  )
}

interface PlacedItem {
  item: CalendarItem
  top: number
  height: number
  leftPct: number
  widthPct: number
  invalid: boolean
}

/**
 * Position + lane-layout for the timed items of one day. Endpoints are clamped
 * to [dayStart, dayEnd] so nothing bleeds past the grid; overlapping items are
 * split into side-by-side lanes so a later item never paints over an earlier one.
 * Reversed hours (end <= start) are normalised (min/max) and flagged.
 */
function layoutTimed(timed: CalendarItem[], dayStartHour: number, dayEndHour: number): PlacedItem[] {
  const gridHeight = (dayEndHour - dayStartHour) * PX_PER_HOUR
  const norm = timed
    .map((item) => {
      const a = hourOf(item.start!)
      const b = item.end ? hourOf(item.end) : a + 1
      const invalid = b <= a
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const s = Math.min(Math.max(lo, dayStartHour), dayEndHour)
      const e = Math.min(Math.max(hi, dayStartHour), dayEndHour)
      return { item, s, e, invalid }
    })
    .sort((x, y) => x.s - y.s || x.e - y.e)

  // Cluster transitively-overlapping items, then greedily pack each cluster into
  // the fewest lanes; the cluster's lane count sets every member's width.
  type Row = (typeof norm)[number] & { lane: number; laneCount: number }
  const rows: Row[] = []
  let cluster: Array<(typeof norm)[number] & { lane?: number }> = []
  let clusterEnd = -Infinity
  const flush = () => {
    const laneEnds: number[] = []
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => it.s >= end)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(it.e)
      } else {
        laneEnds[lane] = it.e
      }
      it.lane = lane
    }
    for (const it of cluster) rows.push({ ...it, lane: it.lane!, laneCount: laneEnds.length })
    cluster = []
  }
  for (const it of norm) {
    if (cluster.length > 0 && it.s >= clusterEnd) {
      flush()
      clusterEnd = -Infinity
    }
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.e)
  }
  if (cluster.length > 0) flush()

  return rows.map(({ item, s, e, invalid, lane, laneCount }) => {
    const height = Math.max(MIN_ITEM_PX, (e - s) * PX_PER_HOUR)
    const rawTop = (s - dayStartHour) * PX_PER_HOUR
    // Keep the box wholly inside the grid even after the min-height floor.
    const top = Math.min(Math.max(0, rawTop), Math.max(0, gridHeight - height))
    const widthPct = 100 / laneCount
    return { item, top, height, leftPct: lane * widthPct, widthPct, invalid }
  })
}

/** A timed item positioned by start, sized by duration, offset into its lane. */
function GridItem({ placed }: { placed: PlacedItem }) {
  const { item, top, height, leftPct, widthPct, invalid } = placed
  return (
    <Link
      href={item.href}
      data-slot="grid-item"
      data-invalid-hours={invalid ? 'true' : undefined}
      title={invalid ? 'Check the start / end times' : undefined}
      style={{ top, height, left: `${leftPct}%`, width: `${widthPct}%`, borderLeftColor: KIND_DOT[item.kind] }}
      className={cn(
        'absolute overflow-hidden rounded-sm border border-border border-l-[3px] bg-card px-1.5 py-0.5 text-[11px] leading-tight shadow-xs transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none',
        invalid && 'border-dashed border-destructive'
      )}
    >
      <span className="sr-only">{CALENDAR_KIND_LABELS[item.kind]}: </span>
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
  const placed = layoutTimed(timed, dayStartHour, dayEndHour)
  return (
    <div
      data-slot="time-grid-body"
      className="relative flex-1 overflow-hidden"
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
      {placed.map((p) => (
        <GridItem key={`${p.item.kind}:${p.item.id}`} placed={p} />
      ))}
    </div>
  )
}

function AllDayBand({ band, placeholder = true }: { band: CalendarItem[]; placeholder?: boolean }) {
  return (
    <div data-slot="all-day-band" className="min-h-8 space-y-1 p-1.5">
      {band.length === 0
        ? // In the week view the band is one row of seven cells — a placeholder in
          // every empty cell would repeat "Nothing all-day" across the week, so it
          // is suppressed there and kept only for the single Day view.
          placeholder
          ? <p className="px-0.5 py-1 text-[10px] text-muted-foreground">Nothing all-day</p>
          : null
        : band.map((i) => <BandChip key={`${i.kind}:${i.id}`} item={i} />)}
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
    return <AllDayBand band={band} placeholder={false} />
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
          <Link
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            href={`/${orgSlug}/new-event?date=${ymd}`}
          >
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
