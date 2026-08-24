'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatMoney } from '@/lib/money'
import { todayYmd } from '@/lib/opportunity-detail'
import { cn } from '@/lib/utils'
import { CALENDAR_KIND_LABELS, type CalendarItem } from '@/lib/calendar'
import type { BusinessHours } from '@/lib/types'
import { KIND_DOT } from '@/components/admin/calendar/kind-color'
import { KindDot } from '@/components/admin/calendar/KindDot'
import { useReschedule, type HandleProps } from '@/components/admin/calendar/reschedule-drag'

// Hybrid time-grid geometry. Exported so callers (and tests) share the exact
// px-per-hour scale — a timed item's `top` is derived from these, never guessed.
export const PX_PER_HOUR = 48
export const DAY_START_HOUR = 6 // 6am — earlier than most prep starts
export const DAY_END_HOUR = 22 // 10pm — covers evening events

/** HEIGHT floor: WCAG 2.5.8 (AA) target minimum. It is deliberately the BARE
 *  minimum, not the comfortable 44px, because every pixel of height floor is a
 *  pixel of lie — a 15-minute drop window painted 44px tall claims 55 minutes,
 *  and three back-to-back windows then pile on top of each other. 24px halves
 *  the inflation (and the resulting lane pressure) while still clearing AA. */
export const MIN_ITEM_PX = 24
/** WIDTH floor: WCAG 2.5.5 (AAA) comfortable target — the size an operator
 *  needs from a van, with gloves on. Horizontal room is free of honesty cost:
 *  a wider chip never misstates the time, so width gets the generous number. */
export const MIN_TARGET_PX = 44
/** Narrowest an offset lane's exposed strip may get. Lane k starts `k * inset`
 *  from the left and runs to the right edge, so `inset` is exactly the grab
 *  strip the lane above leaves uncovered (Google-Calendar-style layering). */
export const MIN_LANE_INSET_PX = MIN_TARGET_PX
/** Natural (un-floored) height a chip must have before it earns a second line.
 *  Below this the chip prints its title only — vertical position already encodes
 *  the time, and the time text is what forced the old 44px floor. */
export const TWO_LINE_MIN_PX = 32
/** Body width assumed before the element has been measured (server render and
 *  the first client paint). Only the lane cap reads it; chip widths are derived
 *  from `right: 0`, so they are container-correct at every width regardless. */
export const DEFAULT_BODY_WIDTH_PX = 320

/** Org fallback when `Org.business_hours` is unset — no migration needed. */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = { start: '08:00', end: '18:00' }

/**
 * Height of an edge-resize strip. Deliberately below the 24px AA target: a
 * resize grip has to be a fraction of the block it resizes, or a 30-minute job
 * would be nothing but handles.
 *
 * The exception this rides on is WCAG 2.5.8 "Equivalent" — "a different control
 * that meets the criterion provides an equivalent function". It is NOT the
 * essential-presentation exception this comment used to cite: that one has to
 * claim no larger target could exist without defeating the feature, and the
 * claim is false here. The same resize is reachable at full size from the
 * keyboard with `<` / `>` (see reschedule-drag.tsx), and the chip itself is
 * floored to MIN_ITEM_PX. An equivalent control exists, so the strip is free to
 * be as small as the geometry needs.
 */
export const RESIZE_HANDLE_PX = 10
/** A chip shorter than this is all grip and no body, so it gets no strips —
 *  the keyboard resize still works on it. */
export const RESIZE_MIN_CHIP_PX = 32

/** Split the drag props' own className/style out so a chip can merge them with
 *  the geometry it must keep owning. */
function splitDragProps(props: Partial<HandleProps>) {
  const { className, style, ...rest } = props
  return { dragClass: className, dragStyle: style, dragRest: rest }
}

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

/** The full 'start–end' string for a timed item, always from the TRUE hours —
 *  never the window-clamped ones. */
function rangeLabel(item: CalendarItem): string {
  return `${timeLabel(item.start!)}${item.end ? `–${timeLabel(item.end)}` : ''}`
}

function hourRange(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

/**
 * The window a single day must render so nothing is clamped: the default
 * [dayStartHour, dayEndHour] widened to the day's real extremes. A 5am load-in
 * or a 1am teardown grows the grid instead of being silently squashed into the
 * default band. Used by the Day view; the Week view keeps the shared window
 * (seven columns share one gutter) and flags clipped items on the chip instead.
 */
export function dayWindowFor(
  items: CalendarItem[],
  dayStartHour: number = DAY_START_HOUR,
  dayEndHour: number = DAY_END_HOUR
): { dayStartHour: number; dayEndHour: number } {
  let lo = dayStartHour
  let hi = dayEndHour
  for (const i of items) {
    if (!i.start) continue
    const a = hourOf(i.start)
    const b = i.end ? hourOf(i.end) : a + 1
    lo = Math.min(lo, Math.floor(Math.min(a, b)))
    hi = Math.max(hi, Math.ceil(Math.max(a, b)))
  }
  lo = Math.max(0, lo)
  hi = Math.min(24, Math.max(hi, lo + 1))
  return { dayStartHour: lo, dayEndHour: hi }
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
  /** Org working window; out-of-hours rows are shaded. Defaults to 8am–6pm. */
  businessHours?: BusinessHours
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
  const { dragClass, dragStyle, dragRest } = splitDragProps(useReschedule().handleProps(item))
  return (
    <Link
      href={item.href}
      // Before {...dragRest}: reschedulable kinds get the same value from the
      // drag engine, but invoice/task/drop/compliance/follow-up carry no drag
      // props and would otherwise be unpeekable.
      data-item-key={`${item.kind}:${item.id}`}
      {...dragRest}
      style={dragStyle}
      className={cn(
        'flex min-h-6 items-center gap-1.5 rounded-sm border border-border bg-card px-1.5 py-1.5 text-[11px] leading-tight transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none',
        dragClass
      )}
    >
      {/* KindDot carries colour + SHAPE + the sr-only kind name. A bare coloured
          dot here was a WCAG 1.4.1 hole: hue was the only channel. */}
      <KindDot kind={item.kind} />
      <span className={cn('min-w-0 flex-1 truncate', item.blocker && 'text-destructive')}>{item.title}</span>
      {tbd ? <span className="shrink-0 text-[10px] text-muted-foreground">Time TBD</span> : null}
      {item.kind === 'invoice_due' && item.amount != null ? (
        <span className="shrink-0 font-semibold tabular-nums text-[var(--money-green)]">{formatMoney(item.amount)}</span>
      ) : null}
    </Link>
  )
}

export type ClipEdge = 'top' | 'bottom' | 'both'

export interface PlacedItem {
  item: CalendarItem
  top: number
  height: number
  /** Inset from the body's left edge, in px. The chip renders `left: leftPx`
   *  with `right: 0`, so its rendered width IS (bodyWidth − leftPx) — which the
   *  inset rule plus the lane cap guarantee is at least MIN_TARGET_PX. */
  leftPx: number
  lane: number
  zIndex: number
  invalid: boolean
  /** Set when the item's TRUE hours run outside the rendered window. */
  clipped?: ClipEdge
  /** Whether the chip has room for its time/detail line. */
  twoLine: boolean
}

export interface OverflowChip {
  key: string
  top: number
  count: number
}

export interface TimeGridLayout {
  placed: PlacedItem[]
  overflow: OverflowChip[]
  /** The width the lane cap was computed against. Every placed chip satisfies
   *  `bodyWidthPx − leftPx >= MIN_TARGET_PX` (or the body is itself narrower). */
  bodyWidthPx: number
  /** Lanes the body can host at MIN_TARGET_PX each. */
  maxLanes: number
}

/** Lanes a body of `bodyWidthPx` can show while every chip keeps a
 *  MIN_TARGET_PX-wide grab strip AND a MIN_TARGET_PX-wide box. */
export function maxLanesFor(bodyWidthPx: number): number {
  return Math.max(1, Math.floor(bodyWidthPx / MIN_TARGET_PX))
}

/**
 * Per-cluster lane inset. An even split (`width / lanes`) keeps the stack
 * balanced — a fixed inset would leave lane 0 with a 44px sliver of title while
 * the top lane got everything — but it is floored at MIN_LANE_INSET_PX so the
 * strip never shrinks below a target. When the floor has to bite, `maxLanesFor`
 * has already capped the lane count, so both the strip and the box still clear
 * MIN_TARGET_PX.
 */
export function laneInsetFor(bodyWidthPx: number, laneCount: number): number {
  return Math.max(MIN_LANE_INSET_PX, Math.floor(bodyWidthPx / Math.max(1, laneCount)))
}

/** Stable, transitive ordering key so equal geometry never sorts randomly. */
function itemKey(item: CalendarItem): string {
  return `${item.kind}:${item.id}`
}

/**
 * Position + lane layout for the timed items of one day.
 *
 * Lanes are packed against RENDERED GEOMETRY — `[top, top + height]`, the box
 * the operator actually sees — not the raw hours. Packing on raw hours was a
 * real rendering defect: the min-height floor inflates a short window past its
 * own time slot, so three consecutive 15-minute drop windows all won lane 0 and
 * painted on top of each other.
 *
 * Lanes are laid out overlapping-offset (Google Calendar style): lane k starts
 * `k * laneInsetFor(...)` from the left and runs to the right edge. That floors the
 * rendered WIDTH instead of dividing it into slivers. When the body is too
 * narrow to host another MIN_TARGET_PX target, the surplus lanes collapse into
 * a `+N` overflow chip rather than shrinking below the floor.
 *
 * Items whose true hours fall outside the window keep their real times on the
 * chip and are flagged `clipped` — never silently squashed.
 */
export function layoutTimed(
  timed: CalendarItem[],
  dayStartHour: number,
  dayEndHour: number,
  bodyWidthPx: number = DEFAULT_BODY_WIDTH_PX
): TimeGridLayout {
  const gridHeight = (dayEndHour - dayStartHour) * PX_PER_HOUR
  const maxLanes = maxLanesFor(bodyWidthPx)

  // 1. Rendered geometry FIRST — height floor included — so the packer below
  //    sees the same boxes the browser will paint.
  const boxes = timed
    .map((item) => {
      const a = hourOf(item.start!)
      const b = item.end ? hourOf(item.end) : a + 1
      const invalid = b <= a
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const vs = Math.min(Math.max(lo, dayStartHour), dayEndHour)
      const ve = Math.min(Math.max(hi, dayStartHour), dayEndHour)
      const naturalHeight = (ve - vs) * PX_PER_HOUR
      const under = lo < dayStartHour
      const over = hi > dayEndHour
      const clipped: ClipEdge | undefined = under && over ? 'both' : under ? 'top' : over ? 'bottom' : undefined
      // A clipped chip MUST be able to print its real hours, so it is floored to
      // two lines; an in-window chip is floored only to the AA target.
      const twoLine = !!clipped || naturalHeight >= TWO_LINE_MIN_PX
      const height = Math.max(twoLine ? TWO_LINE_MIN_PX : MIN_ITEM_PX, naturalHeight)
      const rawTop = (vs - dayStartHour) * PX_PER_HOUR
      const top = Math.min(Math.max(0, rawTop), Math.max(0, gridHeight - height))
      return { item, top, height, invalid, clipped, twoLine }
    })
    // Lexicographic and therefore transitive: earliest box first, taller first
    // on a tie (the long anchor takes lane 0), then a stable key.
    .sort(
      (x, y) =>
        x.top - y.top ||
        y.height - x.height ||
        (itemKey(x.item) < itemKey(y.item) ? -1 : itemKey(x.item) > itemKey(y.item) ? 1 : 0)
    )

  type Box = (typeof boxes)[number]
  type Row = Box & { lane: number; laneCount: number; clusterTop: number }

  // 2. Cluster transitively-overlapping BOXES, then greedily pack each cluster
  //    into the fewest lanes. Boxes are half-open: a box starting exactly where
  //    another ends re-uses that lane.
  const rows: Row[] = []
  let cluster: Box[] = []
  let clusterEnd = -Infinity
  let clusterTop = 0
  const flush = () => {
    const laneEnds: number[] = []
    const lanes: number[] = []
    for (const b of cluster) {
      const bottom = b.top + b.height
      let lane = laneEnds.findIndex((end) => b.top >= end)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(bottom)
      } else {
        laneEnds[lane] = bottom
      }
      lanes.push(lane)
    }
    const laneCount = laneEnds.length
    cluster.forEach((b, i) => rows.push({ ...b, lane: lanes[i], laneCount, clusterTop }))
    cluster = []
  }
  for (const b of boxes) {
    if (cluster.length > 0 && b.top >= clusterEnd) {
      flush()
      clusterEnd = -Infinity
    }
    if (cluster.length === 0) clusterTop = b.top
    cluster.push(b)
    clusterEnd = Math.max(clusterEnd, b.top + b.height)
  }
  if (cluster.length > 0) flush()

  // 3. Offset the lanes, capping at what the body can actually host.
  const placed: PlacedItem[] = []
  // One `+N` per cluster, anchored at the topmost item it stands in for.
  const hidden = new Map<number, { count: number; top: number }>()
  for (const r of rows) {
    if (r.lane >= maxLanes) {
      const seen = hidden.get(r.clusterTop)
      hidden.set(r.clusterTop, { count: (seen?.count ?? 0) + 1, top: Math.min(seen?.top ?? r.top, r.top) })
      continue
    }
    placed.push({
      item: r.item,
      top: r.top,
      height: r.height,
      leftPx: r.lane * laneInsetFor(bodyWidthPx, Math.min(r.laneCount, maxLanes)),
      lane: r.lane,
      zIndex: r.lane + 1,
      invalid: r.invalid,
      clipped: r.clipped,
      twoLine: r.twoLine,
    })
  }
  const overflow: OverflowChip[] = [...hidden.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([clusterTop, { count, top }]) => ({ key: `overflow:${clusterTop}`, top, count }))

  return { placed, overflow, bodyWidthPx, maxLanes }
}

/** A timed item positioned by start, sized by duration, inset into its lane. */
function GridItem({ placed }: { placed: PlacedItem }) {
  const { item, top, height, leftPx, lane, zIndex, invalid, clipped, twoLine } = placed
  const range = rangeLabel(item)
  const marker = clipped === 'both' ? '↕' : clipped === 'top' ? '↑' : clipped === 'bottom' ? '↓' : null
  const { dragClass, dragStyle, dragRest } = splitDragProps(useReschedule().handleProps(item))
  return (
    <Link
      href={item.href}
      data-slot="grid-item"
      data-item-key={`${item.kind}:${item.id}`}
      data-lane={lane}
      data-clipped={clipped}
      data-invalid-hours={invalid ? 'true' : undefined}
      title={invalid ? `Check the start / end times · ${range}` : range}
      {...dragRest}
      style={{ top, height, left: leftPx, right: 0, zIndex, borderLeftColor: KIND_DOT[item.kind], ...dragStyle }}
      className={cn(
        'absolute overflow-hidden rounded-sm border border-border border-l-[3px] bg-card px-1.5 py-0.5 text-[11px] leading-tight shadow-xs transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none',
        invalid && 'border-dashed border-destructive',
        dragClass
      )}
    >
      <span className="sr-only">
        {CALENDAR_KIND_LABELS[item.kind]}, {range}
        {clipped ? ', runs outside the hours shown' : ''}:{' '}
      </span>
      <span className="flex items-center gap-1">
        {marker ? (
          <span aria-hidden className="shrink-0 text-[10px] leading-none text-muted-foreground">
            {marker}
          </span>
        ) : null}
        {/* The 3px border-l tint was the ONLY kind channel on the primary timed
            chip — hue alone (WCAG 1.4.1). The glyph adds the shape channel;
            hideLabel because the sr-only line above already names the kind. */}
        <KindDot kind={item.kind} hideLabel />
        <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
      </span>
      {twoLine ? (
        <span data-slot="chip-time" className="block truncate text-[10px] text-muted-foreground tabular-nums">
          {range}
          {item.detail ? ` · ${item.detail}` : ''}
        </span>
      ) : null}
    </Link>
  )
}

/**
 * One edge-resize strip, laid over the chip's top or bottom edge.
 *
 * It is a SIBLING of the chip, not a child: the chip is an `<a>`, and an
 * interactive descendant of a link is invalid HTML and a mess for assistive
 * tech. Being absolutely positioned in the same body coordinate space, it lands
 * exactly on the edge anyway. It is `aria-hidden` and unfocusable on purpose —
 * the keyboard path to the same function is `<` / `>` on the chip itself, which
 * keeps the tab order to one stop per job instead of three.
 */
function ResizeHandle({ placed, edge }: { placed: PlacedItem; edge: 'start' | 'end' }) {
  const props = useReschedule().resizeProps(placed.item, edge) as Partial<HandleProps>
  const { dragClass, dragStyle, dragRest } = splitDragProps(props)
  if (!props['data-draggable'] || placed.height < RESIZE_MIN_CHIP_PX) return null
  return (
    <span
      {...dragRest}
      aria-hidden
      data-slot="grid-resize"
      data-edge={edge}
      style={{
        ...dragStyle,
        position: 'absolute',
        top: edge === 'start' ? placed.top : placed.top + placed.height - RESIZE_HANDLE_PX,
        height: RESIZE_HANDLE_PX,
        left: placed.leftPx,
        right: 0,
        zIndex: placed.zIndex + 20,
      }}
      className={cn(
        'block bg-transparent hover:bg-ring/40 [&[data-dragging]]:bg-ring/50',
        'motion-safe:transition-colors motion-reduce:transition-none',
        dragClass,
        'cursor-ns-resize active:cursor-ns-resize'
      )}
    />
  )
}

/** The `+N` chip standing in for lanes the body is too narrow to host. It is a
 *  target in its own right — it opens the day at full width, where they fit. */
function MoreChip({ chip, orgSlug, ymd }: { chip: OverflowChip; orgSlug: string; ymd: string }) {
  return (
    <Link
      href={`/${orgSlug}/calendar/${ymd}`}
      data-slot="grid-overflow"
      style={{ top: chip.top }}
      className="absolute right-0 z-40 inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm border border-border bg-muted px-1 text-[10px] font-semibold tabular-nums text-foreground shadow-xs transition-colors hover:bg-accent focus-visible:bg-accent motion-reduce:transition-none"
    >
      <span aria-hidden>+{chip.count}</span>
      <span className="sr-only">{chip.count} more overlapping items — open the day view</span>
    </Link>
  )
}

/** The red "now" rule. Client-only: it is absent from the server HTML and from
 *  the first client render (state starts null), so hydration always matches.
 *  It never animates — the line is static in every motion preference. */
function NowLine({ top, nowRef }: { top: number; nowRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={nowRef}
      data-slot="now-line"
      className="pointer-events-none absolute inset-x-0 z-30 h-0 border-t border-destructive"
      style={{ top }}
    >
      <span className="sr-only">Current time</span>
      <span aria-hidden className="absolute left-0 top-0 size-[7px] -translate-y-1/2 rounded-full bg-destructive" />
    </div>
  )
}

function TimeGridBody({
  timed,
  ymd,
  orgSlug,
  dayStartHour,
  dayEndHour,
  businessHours,
}: {
  timed: CalendarItem[]
  ymd: string
  orgSlug: string
  dayStartHour: number
  dayEndHour: number
  businessHours: BusinessHours
}) {
  const dropActive = useReschedule().activeDropDay === ymd
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const nowRef = useRef<HTMLDivElement | null>(null)
  const scrolled = useRef(false)
  const [bodyWidth, setBodyWidth] = useState<number | null>(null)
  // null on the server AND on the first client render — the now-line depends on
  // the client clock, so it must not exist until after hydration.
  const [nowHour, setNowHour] = useState<number | null>(null)

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setBodyWidth(w)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      // todayYmd() reads local date parts, the same basis the page's `today` uses.
      setNowHour(todayYmd(d) === ymd ? d.getHours() + d.getMinutes() / 60 : null)
    }
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [ymd])

  const gridHeight = (dayEndHour - dayStartHour) * PX_PER_HOUR
  const { placed, overflow } = layoutTimed(timed, dayStartHour, dayEndHour, bodyWidth ?? DEFAULT_BODY_WIDTH_PX)

  const nowVisible = nowHour != null && nowHour >= dayStartHour && nowHour <= dayEndHour
  const nowTop = nowVisible ? (nowHour! - dayStartHour) * PX_PER_HOUR : 0

  // Open on the current hour rather than always on 6am — once, on mount, and
  // instantly (never 'smooth', so reduced-motion users get no animation).
  useEffect(() => {
    if (scrolled.current || !nowVisible) return
    const el = nowRef.current
    if (!el || typeof el.scrollIntoView !== 'function') return
    scrolled.current = true
    el.scrollIntoView({ block: 'center' })
  }, [nowVisible])

  const bizStart = Math.min(Math.max(hourOf(businessHours.start), dayStartHour), dayEndHour)
  const bizEnd = Math.min(Math.max(hourOf(businessHours.end), bizStart), dayEndHour)
  const beforeHeight = (bizStart - dayStartHour) * PX_PER_HOUR
  const afterTop = (bizEnd - dayStartHour) * PX_PER_HOUR

  return (
    <div
      ref={bodyRef}
      data-slot="time-grid-body"
      // ── the drop-zone contract (W3-J) ──────────────────────────────────────
      // The body is BOTH a day target and a TIME target. The two geometry
      // attributes are how the drag engine turns a y coordinate into an hour
      // without importing this module (which would make the dependency a
      // cycle): it reads them off the element it hit.
      data-drop-day={ymd}
      data-grid-start-hour={dayStartHour}
      data-grid-px-per-hour={PX_PER_HOUR}
      data-drop-active={dropActive || undefined}
      className={cn(
        'relative flex-1 overflow-hidden',
        dropActive && 'bg-primary/5 ring-2 ring-inset ring-ring',
        'motion-safe:transition-colors motion-reduce:transition-none'
      )}
      style={{ height: gridHeight }}
    >
      {beforeHeight > 0 ? (
        <div
          data-slot="off-hours"
          data-edge="before"
          aria-hidden
          className="absolute inset-x-0 bg-muted/60"
          style={{ top: 0, height: beforeHeight }}
        />
      ) : null}
      {afterTop < gridHeight ? (
        <div
          data-slot="off-hours"
          data-edge="after"
          aria-hidden
          className="absolute inset-x-0 bg-muted/60"
          style={{ top: afterTop, height: gridHeight - afterTop }}
        />
      ) : null}
      {hourRange(dayStartHour, dayEndHour).map((h) => (
        <div
          key={h}
          className="absolute inset-x-0 border-t border-border/50"
          style={{ top: (h - dayStartHour) * PX_PER_HOUR }}
          aria-hidden
        />
      ))}
      {placed.map((p) => (
        <Fragment key={`${p.item.kind}:${p.item.id}`}>
          <GridItem placed={p} />
          <ResizeHandle placed={p} edge="start" />
          <ResizeHandle placed={p} edge="end" />
        </Fragment>
      ))}
      {overflow.map((o) => (
        <MoreChip key={o.key} chip={o} orgSlug={orgSlug} ymd={ymd} />
      ))}
      {nowVisible ? <NowLine top={nowTop} nowRef={nowRef} /> : null}
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
  businessHours = DEFAULT_BUSINESS_HOURS,
}: TimeGridDayProps) {
  // The single rule: an item with a start time is placed on the grid; anything
  // without one (every date-only kind, plus hour-less events) lives in the band.
  const timed = items.filter((i) => i.start)
  const band = items.filter((i) => !i.start)

  if (section === 'band') {
    return <AllDayBand band={band} placeholder={false} />
  }
  if (section === 'body') {
    return (
      <TimeGridBody
        timed={timed}
        ymd={ymd}
        orgSlug={orgSlug}
        dayStartHour={dayStartHour}
        dayEndHour={dayEndHour}
        businessHours={businessHours}
      />
    )
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
        <TimeGridBody
          timed={timed}
          ymd={ymd}
          orgSlug={orgSlug}
          dayStartHour={dayStartHour}
          dayEndHour={dayEndHour}
          businessHours={businessHours}
        />
      </div>
    </div>
  )
}
