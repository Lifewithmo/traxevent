'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { addDays } from '@/lib/opportunity-detail'
import { cn } from '@/lib/utils'
import type { CalendarItem, CalendarKind } from '@/lib/calendar'
import { rescheduleCalendarItem, type AgendaMove } from '@/actions/calendar-bulk'

/**
 * W3-J — DIRECT MANIPULATION for the calendar cockpit.
 *
 * The audit's disqualifying finding: a surface named a scheduling cockpit could
 * not schedule. Every chip on it was a `next/link`, so moving a booked job — the
 * commonest reason anyone opens a calendar — cost ~11 clicks and five route
 * changes, none of them on the calendar. This module is the shared engine that
 * turns the grids into an EDITING surface: drag a job to another day, drag it to
 * another time, edge-drag its duration, or do all three from the keyboard.
 *
 * It owns four things so the three grids never each grow their own copy:
 *   1. the actionability rule (which kinds own their own date),
 *   2. the optimistic feed + a real Undo,
 *   3. the Pointer-Events gesture (mouse, pen AND touch),
 *   4. the announcements a screen-reader user needs to know it moved.
 *
 * It deliberately imports NOTHING from TimeGridDay: the grid geometry it needs
 * (px-per-hour, the window's first hour) travels on the drop zone's own data
 * attributes. That keeps the dependency one-way — TimeGridDay imports this —
 * and makes the drop maths testable without rendering a time grid.
 */

// ─────────────────────────────────────────────────────────────────────────────
// The actionability rule — the SAME one W2-G established for the agenda's bulk
// bar (see RESCHEDULABLE in AgendaView). The two surfaces must agree, or
// "movable" quietly means something different in each view.
//
//   event — a booked job     → Event.event_start/_end (+ hours) + Lead.event_date
//   lead  — a tentative hold → Lead.event_date
//
// Everything else carries a date the operator does not own AT THAT ROW: an
// `invoice_due` belongs to the invoice's payment terms, a `compliance` date is
// an expiry set by the issuing authority (moving it is a lie, not a
// reschedule), a `drop` date belongs to a pickup WINDOW edited on the drop, and
// `task`/`follow_up` are sub-records with their own snooze. Those get no drag
// affordance at all, rather than a handle that cannot honestly fire.
// ─────────────────────────────────────────────────────────────────────────────
export const RESCHEDULABLE: ReadonlySet<CalendarKind> = new Set<CalendarKind>(['event', 'lead'])

/** Only a booked job carries working hours (`Event.hours`), so only a booked job
 *  can be moved in TIME or resized. A hold has no Event document to put them on,
 *  and a drop's window belongs to the drop. */
export const RETIMEABLE: ReadonlySet<CalendarKind> = new Set<CalendarKind>(['event'])

export function canReschedule(item: Pick<CalendarItem, 'kind'>): boolean {
  return RESCHEDULABLE.has(item.kind)
}

export function canRetime(item: Pick<CalendarItem, 'kind' | 'start'>): boolean {
  return RETIMEABLE.has(item.kind) && !!item.start
}

/** Mouse/pen: how far the pointer must travel before a click becomes a drag. */
export const DRAG_THRESHOLD_PX = 6
/**
 * Touch: how long the finger must be held STILL before the drag arms.
 *
 * This is the whole answer to "a drag must not fight page scroll". The van
 * operator scrolls the cockpit with the same finger they drag with, so a chip
 * that grabbed every touch would make the calendar unscrollable. Instead each
 * chip keeps `touch-action: pan-y` — a swipe scrolls the page exactly as
 * before — and only a deliberate press-and-hold lifts the job. Move the finger
 * before the hold fires and the gesture is abandoned to the scroller.
 */
export const TOUCH_HOLD_MS = 300
/** How far a finger may drift during the hold before it counts as a scroll. */
export const TOUCH_SLOP_PX = 10
/** Time drags snap to the quarter hour — the unit an operator actually books in. */
export const SNAP_MINUTES = 15
/** The shortest window a resize may produce. */
export const MIN_DURATION_MINUTES = 15
/** The latest hour a dragged window may reach. 23:45 rather than 24:00 because
 *  `Event.hours` is an 'HH:mm' pair the settings form edits with a time input,
 *  and '24:00' is not a value that control can round-trip. */
export const MAX_HOUR = 23.75

const DAY_MS = 86_400_000

export const ymdOf = (date: string) => date.slice(0, 10)
export const keyOf = (item: Pick<CalendarItem, 'kind' | 'id'>) => `${item.kind}:${item.id}`

/** UTC-anchored, never a bare `new Date(ymd)`. */
const utcDate = (date: string) => new Date(`${ymdOf(date)}T00:00:00.000Z`)

export function spanDays(from: string, to: string): number {
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / DAY_MS)
}

export function dayLabel(date: string): string {
  return utcDate(date).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

// ── time helpers (pure, unit-tested) ─────────────────────────────────────────

/** 'HH:mm' → fractional hour. '16:30' → 16.5. */
export function hourOfHhmm(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) + (Number.isFinite(m) ? m : 0) / 60
}

/** Fractional hour → 'HH:mm', clamped into a single day. */
export function hhmmOfHour(hour: number): string {
  const clamped = Math.min(24, Math.max(0, hour))
  const total = Math.round(clamped * 60)
  const h = Math.min(23, Math.floor(total / 60))
  const m = Math.min(59, total - Math.floor(total / 60) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Snap a fractional hour to the nearest SNAP_MINUTES. */
export function snapHour(hour: number, snapMinutes: number = SNAP_MINUTES): number {
  const per = snapMinutes / 60
  return Math.round(hour / per) * per
}

export interface Hours {
  start: string
  end: string
}

/**
 * Move a window to a new START, keeping its DURATION. Clamped so a job dragged
 * past midnight is pinned to the end of the day rather than silently wrapping
 * onto a date the operator never chose.
 */
export function movedWindow(hours: Hours, newStartHour: number): Hours {
  const duration = Math.max(hourOfHhmm(hours.end) - hourOfHhmm(hours.start), MIN_DURATION_MINUTES / 60)
  const start = Math.max(0, Math.min(snapHour(newStartHour), MAX_HOUR - duration))
  return { start: hhmmOfHour(start), end: hhmmOfHour(start + duration) }
}

/**
 * Resize one EDGE of a window to `hour`, never letting it collapse past
 * MIN_DURATION_MINUTES or invert — an inverted window is what the grid paints
 * as `data-invalid-hours`, and the action rejects it outright.
 */
export function resizedWindow(hours: Hours, edge: 'start' | 'end', hour: number): Hours {
  const min = MIN_DURATION_MINUTES / 60
  const startH = hourOfHhmm(hours.start)
  const endH = hourOfHhmm(hours.end)
  if (edge === 'start') {
    const next = Math.min(Math.max(0, snapHour(hour)), endH - min)
    return { start: hhmmOfHour(next), end: hours.end }
  }
  const next = Math.max(Math.min(MAX_HOUR, snapHour(hour)), startH + min)
  return { start: hours.start, end: hhmmOfHour(next) }
}

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ap = h < 12 ? 'a' : 'p'
  const hh = h % 12 === 0 ? 12 : h % 12
  return m ? `${hh}:${String(m).padStart(2, '0')}${ap}` : `${hh}${ap}`
}

/** "Sat, Aug 22" / "Sat, Aug 22 · 4p–8p" — one formatter for the visible
 *  readout AND the live region, so what is seen and what is announced can never
 *  drift apart. */
export function moveLabel(date: string, hours?: Hours): string {
  return hours ? `${dayLabel(date)} · ${clock(hours.start)}–${clock(hours.end)}` : dayLabel(date)
}

// ── the optimistic override ──────────────────────────────────────────────────

export interface Override {
  date: string
  hours?: Hours
}

/** Apply the optimistic moves to a feed. A multi-day job keeps its span, exactly
 *  as `shiftEventWindow` does on the server. */
export function applyOverrides(items: CalendarItem[], overrides: Record<string, Override>): CalendarItem[] {
  if (Object.keys(overrides).length === 0) return items
  return items.map((item) => {
    const o = overrides[keyOf(item)]
    if (!o) return item
    const span = item.endDate ? spanDays(item.date, item.endDate) : 0
    return {
      ...item,
      date: o.date,
      ...(item.endDate ? { endDate: addDays(o.date, span) } : {}),
      ...(o.hours ? { start: o.hours.start, end: o.hours.end } : {}),
    }
  })
}

// ── drop-zone contract ───────────────────────────────────────────────────────

/** Every drop zone carries the day it stands for. */
export const DROP_DAY_ATTR = 'data-drop-day'
/** A TIME zone additionally carries the geometry needed to read an hour off a y
 *  coordinate — as data attributes, so this module never imports the grid. */
export const GRID_START_HOUR_ATTR = 'data-grid-start-hour'
export const GRID_PX_PER_HOUR_ATTR = 'data-grid-px-per-hour'

export interface DropTarget {
  date: string
  /** Present only when the pointer is over a TIME grid. */
  hour?: number
}

/**
 * Resolve the drop zone under a point. Split out from the gesture so it can be
 * unit-tested without a pointer, and so a host without `elementFromPoint`
 * (jsdom, and any exotic embedding) degrades to "no drop" instead of throwing.
 */
export function dropTargetAt(x: number, y: number): DropTarget | null {
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return null
  const el = document.elementFromPoint(x, y)
  const zone = el && typeof el.closest === 'function' ? (el.closest(`[${DROP_DAY_ATTR}]`) as HTMLElement | null) : null
  const date = zone?.getAttribute(DROP_DAY_ATTR)
  if (!zone || !date) return null
  const startAttr = zone.getAttribute(GRID_START_HOUR_ATTR)
  const pxAttr = zone.getAttribute(GRID_PX_PER_HOUR_ATTR)
  if (startAttr == null || pxAttr == null) return { date }
  const pxPerHour = Number(pxAttr)
  if (!Number.isFinite(pxPerHour) || pxPerHour <= 0) return { date }
  const rect = zone.getBoundingClientRect()
  return { date, hour: Number(startAttr) + (y - rect.top) / pxPerHour }
}

// ── context ──────────────────────────────────────────────────────────────────

export type DragMode = 'move' | 'resize-start' | 'resize-end'

export interface DragPreview {
  key: string
  title: string
  date: string
  hours?: Hours
  mode: DragMode
}

export interface HandleProps {
  onPointerDown: (e: React.PointerEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onClickCapture: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  'data-item-key': string
  'data-draggable': 'true'
  'data-dragging'?: 'true'
  'aria-keyshortcuts': string
  draggable: false
  style: React.CSSProperties
  className: string
}

export type MaybeHandleProps = HandleProps | Record<string, never>

interface RescheduleContextValue {
  /** The feed with every optimistic move applied. */
  items: CalendarItem[]
  /** Props for the chip itself — drag to move, keys to nudge. `{}` for any kind
   *  that does not own its own date, so a non-reschedulable row ends up with no
   *  drag affordance whatsoever. */
  handleProps: (item: CalendarItem) => MaybeHandleProps
  /** Props for one edge-resize strip. `{}` unless the item is a timed job. */
  resizeProps: (item: CalendarItem, edge: 'start' | 'end') => MaybeHandleProps
  /** The day currently under the pointer, for the drop highlight. */
  activeDropDay: string | null
  preview: DragPreview | null
  busy: boolean
  enabled: boolean
}

const NOOP_HANDLES = (): MaybeHandleProps => ({})
/** Stable identity so a consumer that only wants the handles (a chip, not a
 *  grid) does not rebuild the fallback context on every render. */
const NO_ITEMS: CalendarItem[] = []

interface RescheduleBarState {
  announcement: string
  preview: DragPreview | null
  status: string | null
  error: string | null
  canUndo: boolean
  busy: boolean
  conflicts: number
  onUndo: () => void
  onDismiss: () => void
}

const RescheduleContext = createContext<RescheduleContextValue | null>(null)
const RescheduleBarContext = createContext<RescheduleBarState | null>(null)

/**
 * Grids render outside a provider in isolation (and in unit tests). They then
 * get their feed straight through and no drag affordances, rather than crashing.
 */
export function useReschedule(items: CalendarItem[] = NO_ITEMS): RescheduleContextValue {
  const ctx = useContext(RescheduleContext)
  const fallback = useMemo<RescheduleContextValue>(
    () => ({
      items,
      handleProps: NOOP_HANDLES,
      resizeProps: NOOP_HANDLES,
      activeDropDay: null,
      preview: null,
      busy: false,
      enabled: false,
    }),
    [items]
  )
  return ctx ?? fallback
}

// ─────────────────────────────────────────────────────────────────────────────

interface ProviderProps {
  orgSlug: string
  items: CalendarItem[]
  children: React.ReactNode
}

export function RescheduleProvider({ orgSlug, items, children }: ProviderProps) {
  const router = useRouter()

  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The inverse move, plus the title to name it by. Carried together so the
   *  Undo button never has to go looking for a row that has already moved. */
  const [undo, setUndo] = useState<{ move: AgendaMove; title: string } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [preview, setPreview] = useState<DragPreview | null>(null)
  /** The chip to put focus back on once a move has re-parented it. */
  const refocusRef = useRef<string | null>(null)
  // Where to put focus when the moved chip is NOT re-rendered at all. Day view
  // shows exactly one day, so `[`/`]` moves the item clean out of the DOM; the
  // key-based re-focus below then finds nothing and focus silently falls to
  // <body> (WCAG 2.4.3). We remember the chip's parent so focus lands somewhere
  // real, and say out loud that the item left the view.
  const refocusFallbackRef = useRef<HTMLElement | null>(null)
  const leftViewRef = useRef<string | null>(null)

  // Server truth wins the moment a fresh feed arrives (the same reconcile stance
  // the agenda's bulk bar takes): a client fiction must never outlive the round
  // trip that was supposed to make it true.
  const itemsRef = useRef(items)
  useEffect(() => {
    if (itemsRef.current === items) return
    itemsRef.current = items
    setOverrides({})
  }, [items])

  const feed = useMemo(() => applyOverrides(items, overrides), [items, overrides])

  // A move re-parents the chip into another day cell, which unmounts and
  // remounts it — without this, keyboard focus would land back on <body> after
  // every single keystroke, and the shortcut could not be pressed twice.
  useEffect(() => {
    const key = refocusRef.current
    if (!key) return
    refocusRef.current = null
    const chip = document.querySelector<HTMLElement>(`[data-item-key="${cssEscape(key)}"]`)
    if (chip) {
      refocusFallbackRef.current = null
      leftViewRef.current = null
      chip.focus()
      return
    }
    // The chip is genuinely gone — Day view renders one day, Week view seven, so
    // a day/week shift can move the item out of the rendered range entirely.
    // Focus must not be allowed to fall to <body>: park it on the container the
    // chip lived in and tell the operator where the job went.
    const fallback = refocusFallbackRef.current
    refocusFallbackRef.current = null
    const message = leftViewRef.current
    leftViewRef.current = null
    if (fallback?.isConnected) {
      if (!fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1')
      fallback.focus()
    }
    if (message) setAnnouncement((prev) => (prev === message ? `${message} ` : message))
  }, [feed])

  const announce = useCallback((message: string) => {
    // Re-announce identical text by nudging the string: a live region handed the
    // same value twice stays silent, and "moved a day later" is often repeated.
    setAnnouncement((prev) => (prev === message ? `${message} ` : message))
  }, [])

  /**
   * ONE mutation path for move, resize and undo — optimistic first, then the
   * server, then either a fresh feed or a full restore. Nothing fails silently
   * and nothing reverts without saying why.
   */
  const applyMove = useCallback(
    async (move: AgendaMove, title: string, inverse: AgendaMove | null) => {
      const key = `${move.kind}:${move.id}`
      const label = moveLabel(move.date, move.hours)
      const previous = overrides
      const optimistic = { ...overrides, [key]: { date: move.date, ...(move.hours ? { hours: move.hours } : {}) } }

      setBusy(true)
      setError(null)
      setStatus(null)
      setUndo(null)
      setOverrides(optimistic)
      refocusRef.current = key
      refocusFallbackRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement.parentElement : null
      leftViewRef.current = `${title} moved to ${label}, and is no longer shown in this view`
      announce(`${title} moved to ${label}`)

      const fail = (why: string) => {
        // Restore the optimistic state to exactly what it was, and SAY SO — a
        // silent snap-back reads as a bug, not as a refusal.
        setOverrides(previous)
        refocusRef.current = key
        setError(`${title} could not move — ${why}`)
        announce(`${title} could not move. ${why}. It is back where it was.`)
      }

      try {
        const result = await rescheduleCalendarItem(orgSlug, move)
        if (result.failures.length > 0) {
          fail(result.failures[0].message)
          return
        }
        setStatus(`${title} moved to ${label}`)
        setUndo(inverse ? { move: inverse, title } : null)
        router.refresh()
      } catch (err) {
        fail(err instanceof Error ? err.message : 'Reschedule failed')
      } finally {
        setBusy(false)
      }
    },
    [announce, orgSlug, overrides, router]
  )

  const commit = useCallback(
    (item: CalendarItem, date: string, hours: Hours | undefined) => {
      const fromDate = ymdOf(item.date)
      const fromHours = item.start && item.end ? { start: item.start, end: item.end } : undefined
      const hoursChanged =
        !!hours && (!fromHours || hours.start !== fromHours.start || hours.end !== fromHours.end)
      if (date === fromDate && !hoursChanged) return
      const kind = item.kind as AgendaMove['kind']
      void applyMove(
        { kind, id: item.id, date, ...(hoursChanged ? { hours } : {}) },
        item.title,
        { kind, id: item.id, date: fromDate, ...(hoursChanged && fromHours ? { hours: fromHours } : {}) }
      )
    },
    [applyMove]
  )

  // ── the gesture ────────────────────────────────────────────────────────────

  interface Gesture {
    key: string
    item: CalendarItem
    mode: DragMode
    pointerType: string
    startX: number
    startY: number
    /** Where inside the chip the pointer grabbed it, in hours — keeps the block
     *  under the finger instead of snapping its top edge to the cursor. */
    grabOffsetHours: number
    armed: boolean
    holdTimer: ReturnType<typeof setTimeout> | null
    latest: { date: string; hours?: Hours } | null
  }

  const gestureRef = useRef<Gesture | null>(null)
  /** Set when a gesture really dragged, so the click it ends with does not also
   *  follow the chip's href. */
  const suppressClickRef = useRef<string | null>(null)
  const teardownRef = useRef<(() => void) | null>(null)

  const detachWindowListeners = useCallback(() => {
    teardownRef.current?.()
    teardownRef.current = null
  }, [])

  const endGesture = useCallback(
    (commitDrop: boolean) => {
      const g = gestureRef.current
      gestureRef.current = null
      detachWindowListeners()
      setPreview(null)
      if (!g) return
      if (g.holdTimer) clearTimeout(g.holdTimer)
      if (!g.armed) return
      suppressClickRef.current = g.key
      if (commitDrop) {
        if (g.latest) commit(g.item, g.latest.date, g.latest.hours)
      } else {
        announce('Move cancelled')
      }
    },
    [announce, commit, detachWindowListeners]
  )

  const resolveDrop = useCallback((g: Gesture, drop: DropTarget): { date: string; hours?: Hours } => {
    const hours = itemHours(g.item)
    if (!hours || drop.hour == null) return { date: drop.date }
    if (g.mode === 'move') return { date: drop.date, hours: movedWindow(hours, drop.hour - g.grabOffsetHours) }
    return { date: drop.date, hours: resizedWindow(hours, g.mode === 'resize-start' ? 'start' : 'end', drop.hour) }
  }, [])

  const onPointerDown = useCallback(
    (item: CalendarItem, mode: DragMode, e: React.PointerEvent) => {
      if (busy) return
      if (e.button != null && e.button > 0) return // right / middle click is not a drag
      // A tap that follows an earlier drag must still open the job.
      suppressClickRef.current = null

      const target = e.currentTarget as HTMLElement
      const rect = target.getBoundingClientRect?.()
      const hours = itemHours(item)
      const grabOffsetHours =
        mode === 'move' && hours && rect && rect.height > 0
          ? ((e.clientY - rect.top) / rect.height) * (hourOfHhmm(hours.end) - hourOfHhmm(hours.start))
          : 0

      const g: Gesture = {
        key: keyOf(item),
        item,
        mode,
        pointerType: e.pointerType || 'mouse',
        startX: e.clientX,
        startY: e.clientY,
        grabOffsetHours,
        armed: false,
        holdTimer: null,
        latest: null,
      }
      gestureRef.current = g

      const arm = () => {
        const cur = gestureRef.current
        if (!cur || cur.armed) return
        cur.armed = true
        cur.holdTimer = null
        setPreview({
          key: cur.key,
          title: cur.item.title,
          date: ymdOf(cur.item.date),
          hours: itemHours(cur.item),
          mode: cur.mode,
        })
      }

      const onMove = (ev: PointerEvent) => {
        const cur = gestureRef.current
        if (!cur) return
        const dist = Math.hypot(ev.clientX - cur.startX, ev.clientY - cur.startY)
        if (!cur.armed) {
          if (cur.pointerType === 'touch') {
            // Drifted before the hold fired → this was a scroll, not a lift.
            if (dist > TOUCH_SLOP_PX) endGesture(false)
            return
          }
          if (dist < DRAG_THRESHOLD_PX) return
          arm()
        }
        const drop = dropTargetAt(ev.clientX, ev.clientY)
        if (!drop) return
        const next = resolveDrop(cur, drop)
        // Only re-render when the TARGET actually changes: pointermove fires at
        // display rate, and every chip on the grid reads the preview.
        if (sameTarget(cur.latest, next)) return
        cur.latest = next
        setPreview({ key: cur.key, title: cur.item.title, date: next.date, hours: next.hours, mode: cur.mode })
      }
      const onUp = () => endGesture(true)
      const onCancel = () => endGesture(false)
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape') return
        ev.preventDefault()
        endGesture(false)
      }
      const onTouchMove = (ev: TouchEvent) => {
        // Only once the job is LIFTED. Before that the browser keeps the gesture
        // and the cockpit scrolls exactly as it always has.
        if (gestureRef.current?.armed && ev.cancelable) ev.preventDefault()
      }

      detachWindowListeners()
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      window.addEventListener('keydown', onKey)
      window.addEventListener('touchmove', onTouchMove, { passive: false })
      teardownRef.current = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('touchmove', onTouchMove)
      }

      if (g.pointerType === 'touch') g.holdTimer = setTimeout(arm, TOUCH_HOLD_MS)
    },
    [busy, detachWindowListeners, endGesture, resolveDrop]
  )

  useEffect(() => detachWindowListeners, [detachWindowListeners])

  // ── the keyboard equivalent (WCAG 2.1.1) ───────────────────────────────────
  //
  //   [ / ]   a day back / forward         { / }   a week back / forward
  //   , / .   15 minutes earlier / later   < / >   15 minutes shorter / longer
  //
  // Direct manipulation that only listens for a pointer fails 2.1.1 outright, so
  // every drag above has a key here — including the resize. These are single
  // characters, so WCAG 2.1.4 applies too: they fire only while the chip itself
  // has focus, which is that criterion's own focus exception and the same stance
  // the cockpit's m/w/d/a/t bindings already take.
  const onKeyDown = useCallback(
    (item: CalendarItem, e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || busy) return
      const hours = itemHours(item)
      const from = ymdOf(item.date)
      let date: string | null = null
      let next: Hours | undefined
      switch (e.key) {
        case '[': date = addDays(from, -1); break
        case ']': date = addDays(from, 1); break
        case '{': date = addDays(from, -7); break
        case '}': date = addDays(from, 7); break
        case ',':
          if (!hours) return
          date = from
          next = movedWindow(hours, hourOfHhmm(hours.start) - SNAP_MINUTES / 60)
          break
        case '.':
          if (!hours) return
          date = from
          next = movedWindow(hours, hourOfHhmm(hours.start) + SNAP_MINUTES / 60)
          break
        case '<':
          if (!hours) return
          date = from
          next = resizedWindow(hours, 'end', hourOfHhmm(hours.end) - SNAP_MINUTES / 60)
          break
        case '>':
          if (!hours) return
          date = from
          next = resizedWindow(hours, 'end', hourOfHhmm(hours.end) + SNAP_MINUTES / 60)
          break
        default:
          return
      }
      e.preventDefault()
      // Never let a nudge bubble into the cockpit's own single-key bindings.
      e.stopPropagation()
      commit(item, date, next)
    },
    [busy, commit]
  )

  const handleProps = useCallback(
    (item: CalendarItem): MaybeHandleProps =>
      canReschedule(item)
        ? buildHandleProps(item, 'move', preview, onPointerDown, onKeyDown, suppressClickRef)
        : {},
    [onKeyDown, onPointerDown, preview]
  )

  const resizeProps = useCallback(
    (item: CalendarItem, edge: 'start' | 'end'): MaybeHandleProps =>
      canRetime(item)
        ? buildHandleProps(
            item,
            edge === 'start' ? 'resize-start' : 'resize-end',
            preview,
            onPointerDown,
            onKeyDown,
            suppressClickRef
          )
        : {},
    [onKeyDown, onPointerDown, preview]
  )

  const value = useMemo<RescheduleContextValue>(
    () => ({
      items: feed,
      handleProps,
      resizeProps,
      activeDropDay: preview?.date ?? null,
      preview,
      busy,
      enabled: true,
    }),
    [busy, feed, handleProps, preview, resizeProps]
  )

  /** Pre-flight the target day the same way the agenda's bulk bar does: count
   *  what is ALREADY booked there, at the point of the drop, before it lands. */
  const conflicts = useMemo(() => {
    if (!preview) return 0
    return feed.filter((i) => canReschedule(i) && ymdOf(i.date) === preview.date && keyOf(i) !== preview.key).length
  }, [feed, preview])

  const barValue = useMemo<RescheduleBarState>(
    () => ({
      announcement,
      preview,
      status,
      error,
      canUndo: !!undo,
      busy,
      conflicts,
      onUndo: () => {
        if (!undo) return
        void applyMove(undo.move, undo.title, null)
      },
      onDismiss: () => {
        setStatus(null)
        setError(null)
        setUndo(null)
      },
    }),
    [announcement, applyMove, busy, conflicts, error, preview, status, undo]
  )

  return (
    <RescheduleContext.Provider value={value}>
      <RescheduleBarContext.Provider value={barValue}>{children}</RescheduleBarContext.Provider>
    </RescheduleContext.Provider>
  )
}

function sameTarget(a: { date: string; hours?: Hours } | null, b: { date: string; hours?: Hours }): boolean {
  if (!a) return false
  return a.date === b.date && a.hours?.start === b.hours?.start && a.hours?.end === b.hours?.end
}

function itemHours(item: CalendarItem): Hours | undefined {
  return canRetime(item) && item.start && item.end ? { start: item.start, end: item.end } : undefined
}

/** `CSS.escape` is absent from jsdom and the keys are `kind:id`, so escape the
 *  one character an attribute selector actually cares about. */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

function buildHandleProps(
  item: CalendarItem,
  mode: DragMode,
  preview: DragPreview | null,
  onPointerDown: (item: CalendarItem, mode: DragMode, e: React.PointerEvent) => void,
  onKeyDown: (item: CalendarItem, e: React.KeyboardEvent) => void,
  suppressClickRef: React.RefObject<string | null>
): HandleProps {
  const key = keyOf(item)
  const dragging = preview?.key === key
  return {
    onPointerDown: (e) => onPointerDown(item, mode, e),
    onKeyDown: (e) => onKeyDown(item, e),
    onClickCapture: (e) => {
      // A drag ends with a click. Without this the chip would ALSO navigate to
      // the job it was just dropped onto another day.
      if (suppressClickRef.current !== key) return
      suppressClickRef.current = null
      e.preventDefault()
      e.stopPropagation()
    },
    // The native HTML5 drag API is deliberately unused — it has no touch support
    // at all — so suppress the browser's default image/link drag, which would
    // otherwise hijack the gesture halfway through.
    onDragStart: (e) => e.preventDefault(),
    draggable: false,
    'data-item-key': key,
    'data-draggable': 'true',
    ...(dragging ? { 'data-dragging': 'true' as const } : {}),
    'aria-keyshortcuts': canRetime(item) ? '[ ] { } , . < >' : '[ ] { }',
    // `pan-y` is the load-bearing half of "a drag must not fight page scroll":
    // a vertical swipe still scrolls the cockpit, and only the press-and-hold
    // lifts the job. The callout suppression stops iOS turning that same hold
    // into a text-selection loupe.
    style: { touchAction: 'pan-y', WebkitTouchCallout: 'none' },
    className: cn(
      'cursor-grab select-none active:cursor-grabbing',
      // The ONLY motion in this whole feature is a colour/opacity fade, and it
      // is off under prefers-reduced-motion. There is no fly-back to animate:
      // the chip never leaves its place, so a cancelled drag just clears.
      'motion-safe:transition-[opacity,box-shadow] motion-reduce:transition-none',
      dragging && 'opacity-60 ring-2 ring-inset ring-ring'
    ),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The bar: the live region, the in-flight readout, the result and the Undo.
// ─────────────────────────────────────────────────────────────────────────────

export function RescheduleBar() {
  const bar = useContext(RescheduleBarContext)
  if (!bar) return null
  const { announcement, preview, status, error, canUndo, busy, conflicts, onUndo, onDismiss } = bar
  const showBar = !!preview || !!status || !!error

  return (
    <>
      {/* Always mounted: a live region inserted at the same moment as its text
          is not reliably announced. */}
      <p className="sr-only" role="status" aria-live="polite" data-slot="reschedule-live">
        {announcement}
      </p>
      {showBar ? (
        <div
          data-slot="reschedule-bar"
          className="sticky bottom-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-background/95 px-3 py-2 backdrop-blur sm:px-5"
        >
          {preview ? (
            <>
              <p className="text-sm font-semibold">
                {preview.mode === 'move' ? 'Moving' : 'Resizing'} {preview.title}
              </p>
              <p data-slot="reschedule-readout" className="text-sm tabular-nums text-muted-foreground">
                → {moveLabel(preview.date, preview.hours)}
              </p>
              <p className="text-xs text-muted-foreground">Release to drop · Esc to cancel</p>
              {conflicts > 0 ? (
                <p className="basis-full text-xs text-[var(--status-pending-fg)]">
                  Heads up: {conflicts} booked {conflicts === 1 ? 'item is' : 'items are'} already on{' '}
                  {dayLabel(preview.date)}.
                </p>
              ) : null}
            </>
          ) : (
            <>
              {status ? <p className="text-sm text-foreground">{status}</p> : null}
              {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
              {status && canUndo ? (
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={onUndo} disabled={busy}>
                  Undo
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="xs" onClick={onDismiss}>
                Dismiss
              </Button>
            </>
          )}
        </div>
      ) : null}
    </>
  )
}
