import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}))

const rescheduleCalendarItem = vi.fn()
vi.mock('@/actions/calendar-bulk', () => ({
  bulkRescheduleAgenda: vi.fn().mockResolvedValue({ moved: 0, failures: [] }),
  rescheduleCalendarItem: (...a: unknown[]) => rescheduleCalendarItem(...a),
}))

import { MonthGrid } from '@/components/admin/calendar/MonthGrid'
import { WeekGrid } from '@/components/admin/calendar/WeekGrid'
import { DayView } from '@/components/admin/calendar/DayView'
import { DAY_START_HOUR, PX_PER_HOUR } from '@/components/admin/calendar/TimeGridDay'
import {
  DRAG_THRESHOLD_PX,
  TOUCH_HOLD_MS,
  TOUCH_SLOP_PX,
  canReschedule,
  canRetime,
  dropTargetAt,
  hhmmOfHour,
  hourOfHhmm,
  movedWindow,
  resizedWindow,
  snapHour,
} from '@/components/admin/calendar/reschedule-drag'
import type { CalendarItem } from '@/lib/calendar'

/**
 * W3-J — the cockpit can finally schedule.
 *
 * These tests drive the REAL grids, not a harness: the whole point of the
 * feature is that the calendar surface itself is the editing surface, so a test
 * that stubbed the grid away would prove nothing about it.
 */

// ─────────────────────────────────────────────────────────────────────────────
// jsdom has neither `elementFromPoint` nor layout. The drop engine reads both,
// and degrades to "no drop" without them, so a drag test has to supply them.
// ─────────────────────────────────────────────────────────────────────────────
let dropAt: Element | null = null
const restore: Array<() => void> = []

function pointAt(el: Element | null) {
  dropAt = el
}

beforeEach(() => {
  refresh.mockClear()
  rescheduleCalendarItem.mockReset()
  rescheduleCalendarItem.mockResolvedValue({ moved: 1, failures: [] })
  dropAt = null
  const doc = document as unknown as { elementFromPoint?: (x: number, y: number) => Element | null }
  doc.elementFromPoint = () => dropAt
  restore.push(() => {
    delete doc.elementFromPoint
  })
})

afterEach(() => {
  restore.splice(0).forEach((fn) => fn())
})

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const handleFor = (c: HTMLElement, key: string) =>
  c.querySelector(`[data-item-key="${key}"]`) as HTMLElement

/** The announcement channel every grid mounts, drag or no drag. */
const liveRegion = (c: HTMLElement) => c.querySelector('[data-slot="reschedule-live"]') as HTMLElement

/** One complete mouse drag: press, cross the threshold onto `target`, release. */
function dragTo(handle: HTMLElement, target: Element | null, y = 0) {
  fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerType: 'mouse', button: 0 })
  pointAt(target)
  fireEvent.pointerMove(window, { clientX: DRAG_THRESHOLD_PX * 4, clientY: y, pointerType: 'mouse' })
  fireEvent.pointerUp(window, { clientX: DRAG_THRESHOLD_PX * 4, clientY: y, pointerType: 'mouse' })
}

/** The y offset inside a time-grid body that means `hour`. */
const yForHour = (hour: number) => (hour - DAY_START_HOUR) * PX_PER_HOUR

// ─────────────────────────────────────────────────────────────────────────────
// Pure maths first — the parts the grids only compose.
// ─────────────────────────────────────────────────────────────────────────────
describe('reschedule-drag — the time maths', () => {
  it('round-trips HH:mm through fractional hours', () => {
    expect(hourOfHhmm('16:30')).toBe(16.5)
    expect(hhmmOfHour(16.5)).toBe('16:30')
    expect(hhmmOfHour(6)).toBe('06:00')
  })

  it('snaps to the quarter hour an operator actually books in', () => {
    expect(snapHour(10.17)).toBe(10.25)
    expect(snapHour(10.3)).toBe(10.25)
    expect(snapHour(10.4)).toBe(10.5)
  })

  it('keeps a moved window’s DURATION, not its end time', () => {
    expect(movedWindow({ start: '16:00', end: '20:00' }, 9)).toEqual({ start: '09:00', end: '13:00' })
  })

  it('pins a window dragged past midnight instead of wrapping it onto another date', () => {
    const moved = movedWindow({ start: '16:00', end: '20:00' }, 23)
    expect(moved.end <= '23:45').toBe(true)
    expect(hourOfHhmm(moved.end) - hourOfHhmm(moved.start)).toBeCloseTo(4)
  })

  it('never lets a resize invert or collapse a window', () => {
    // dragged the bottom edge up past the top
    expect(resizedWindow({ start: '16:00', end: '20:00' }, 'end', 12)).toEqual({ start: '16:00', end: '16:15' })
    // dragged the top edge down past the bottom
    expect(resizedWindow({ start: '16:00', end: '20:00' }, 'start', 23)).toEqual({ start: '19:45', end: '20:00' })
  })

  it('resizes one edge and leaves the other alone', () => {
    expect(resizedWindow({ start: '16:00', end: '20:00' }, 'end', 18.5)).toEqual({ start: '16:00', end: '18:30' })
    expect(resizedWindow({ start: '16:00', end: '20:00' }, 'start', 14.25)).toEqual({ start: '14:15', end: '20:00' })
  })
})

describe('reschedule-drag — the actionability rule matches the agenda’s', () => {
  const kinds = ['event', 'lead', 'task', 'follow_up', 'compliance', 'invoice_due', 'drop'] as const
  it('only a booked job and a tentative hold own their own date', () => {
    const movable = kinds.filter((kind) => canReschedule({ kind }))
    expect(movable).toEqual(['event', 'lead'])
  })

  it('only a booked job with hours can be moved in TIME', () => {
    expect(canRetime({ kind: 'event', start: '16:00' })).toBe(true)
    // an all-day job has no window to move
    expect(canRetime({ kind: 'event' })).toBe(false)
    // a drop pickup window is timed, but the window belongs to the drop
    expect(canRetime({ kind: 'drop', start: '10:00' })).toBe(false)
    expect(canRetime({ kind: 'lead', start: '10:00' })).toBe(false)
  })
})

describe('dropTargetAt', () => {
  it('reads the day off the zone, and the hour off a TIME zone’s own geometry', () => {
    const zone = document.createElement('div')
    zone.setAttribute('data-drop-day', '2026-08-22')
    zone.setAttribute('data-grid-start-hour', '6')
    zone.setAttribute('data-grid-px-per-hour', '48')
    document.body.appendChild(zone)
    pointAt(zone)
    expect(dropTargetAt(0, 0)).toEqual({ date: '2026-08-22', hour: 6 })
    expect(dropTargetAt(0, 240)).toEqual({ date: '2026-08-22', hour: 11 })
    zone.remove()
  })

  it('a day-only zone yields no hour, so a drop there never rewrites the time', () => {
    const zone = document.createElement('div')
    zone.setAttribute('data-drop-day', '2026-08-22')
    document.body.appendChild(zone)
    pointAt(zone)
    expect(dropTargetAt(0, 240)).toEqual({ date: '2026-08-22' })
    zone.remove()
  })

  it('is null over anything that is not a drop zone', () => {
    const stray = document.createElement('div')
    document.body.appendChild(stray)
    pointAt(stray)
    expect(dropTargetAt(0, 0)).toBeNull()
    stray.remove()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// MONTH — drag a job to another day
// ─────────────────────────────────────────────────────────────────────────────
const monthItems: CalendarItem[] = [
  { id: 'a', title: 'Smith Wedding', date: '2026-08-10', kind: 'event', href: '/acme/smith/dashboard' },
  { id: 'h', title: 'Jones hold', date: '2026-08-10', kind: 'lead', href: '/acme/leads/h', tentative: true },
  { id: 'i', title: 'Deposit invoice', date: '2026-08-10', kind: 'invoice_due', href: '/acme/leads/l1', amount: 500 },
  { id: 'c', title: 'Permit expires', date: '2026-08-11', kind: 'compliance', href: '/acme/compliance' },
  { id: 'd', title: 'Drop pickup', date: '2026-08-11', kind: 'drop', href: '/acme/drop-orders/d' },
  { id: 't', title: 'Confirm rentals', date: '2026-08-11', kind: 'task', href: '/acme/leads/l2' },
]

const monthBox = (c: HTMLElement, d: string) =>
  c.querySelector(`[data-slot="month-cell-box"][data-day="${d}"]`) as HTMLElement

function renderMonth() {
  return render(<MonthGrid orgSlug="acme" items={monthItems} month="2026-08" today="2026-08-01" />)
}

describe('MonthGrid — direct manipulation', () => {
  it('drags a booked job onto another day and writes it through the reschedule action', async () => {
    const { container } = renderMonth()
    dragTo(handleFor(container, 'event:a'), monthBox(container, '2026-08-14'))

    await waitFor(() => expect(rescheduleCalendarItem).toHaveBeenCalledTimes(1))
    expect(rescheduleCalendarItem).toHaveBeenCalledWith('acme', {
      kind: 'event',
      id: 'a',
      date: '2026-08-14',
    })
  })

  it('drags a tentative hold too — it owns its date just as a booking does', async () => {
    const { container } = renderMonth()
    dragTo(handleFor(container, 'lead:h'), monthBox(container, '2026-08-12'))
    await waitFor(() =>
      expect(rescheduleCalendarItem).toHaveBeenCalledWith('acme', { kind: 'lead', id: 'h', date: '2026-08-12' })
    )
  })

  it('shows the move INSTANTLY, before the server has answered', async () => {
    const pending = deferred<{ moved: number; failures: [] }>()
    rescheduleCalendarItem.mockReturnValue(pending.promise)
    const { container } = renderMonth()
    expect(monthBox(container, '2026-08-10').querySelector('[data-item-key="event:a"]')).not.toBeNull()

    dragTo(handleFor(container, 'event:a'), monthBox(container, '2026-08-14'))

    // Optimistic: it is already on the 14th while the request is still open.
    await waitFor(() =>
      expect(monthBox(container, '2026-08-14').querySelector('[data-item-key="event:a"]')).not.toBeNull()
    )
    expect(monthBox(container, '2026-08-10').querySelector('[data-item-key="event:a"]')).toBeNull()

    await act(async () => {
      pending.resolve({ moved: 1, failures: [] })
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('offers a real Undo that moves the job back through the same action', async () => {
    const { container } = renderMonth()
    dragTo(handleFor(container, 'event:a'), monthBox(container, '2026-08-14'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(rescheduleCalendarItem).toHaveBeenCalledTimes(2))
    expect(rescheduleCalendarItem).toHaveBeenLastCalledWith('acme', {
      kind: 'event',
      id: 'a',
      date: '2026-08-10',
    })
    // …and the row is back on the day it started from.
    await waitFor(() =>
      expect(monthBox(container, '2026-08-10').querySelector('[data-item-key="event:a"]')).not.toBeNull()
    )
  })

  it('restores the row AND says why when the move fails — never a silent revert', async () => {
    rescheduleCalendarItem.mockRejectedValue(new Error('Job not found'))
    const { container } = renderMonth()
    dragTo(handleFor(container, 'event:a'), monthBox(container, '2026-08-14'))

    await waitFor(() => expect(screen.getByText(/could not move — Job not found/i)).toBeInTheDocument())
    expect(monthBox(container, '2026-08-10').querySelector('[data-item-key="event:a"]')).not.toBeNull()
    expect(monthBox(container, '2026-08-14').querySelector('[data-item-key="event:a"]')).toBeNull()
    // a per-item refusal from the server reads the same way
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('surfaces a per-item refusal the action reports rather than throws', async () => {
    rescheduleCalendarItem.mockResolvedValue({
      moved: 0,
      failures: [{ kind: 'event', id: 'a', message: 'Job not found' }],
    })
    const { container } = renderMonth()
    dragTo(handleFor(container, 'event:a'), monthBox(container, '2026-08-14'))

    await waitFor(() => expect(screen.getByText(/could not move — Job not found/i)).toBeInTheDocument())
    expect(monthBox(container, '2026-08-10').querySelector('[data-item-key="event:a"]')).not.toBeNull()
  })

  it('gives NO drag affordance to a kind that does not own its own date', () => {
    const { container } = renderMonth()
    // the two that do
    expect(handleFor(container, 'event:a')).not.toBeNull()
    expect(handleFor(container, 'lead:h')).not.toBeNull()
    // …and the five that do not — an invoice due date belongs to the payment
    // terms, a compliance expiry to the issuing authority, a drop window to the
    // drop, a task to its own snooze.
    for (const key of ['invoice_due:i', 'compliance:c', 'drop:d', 'task:t']) {
      expect(handleFor(container, key), key).toBeNull()
    }
    expect(container.querySelectorAll('[data-draggable]')).toHaveLength(2)
  })

  it('keeps the day link working: the cell still opens its day', () => {
    const { container } = renderMonth()
    const link = container.querySelector('a[data-slot="month-cell"][data-day="2026-08-10"]')
    expect(link).toHaveAttribute('href', '/acme/calendar/2026-08-10')
    // the handle is a sibling of the link, never a descendant — an <a> may not
    // contain interactive content
    expect(link!.querySelector('[data-draggable]')).toBeNull()
  })

  it('highlights the day under the pointer while the job is in the air', () => {
    const { container } = renderMonth()
    fireEvent.pointerDown(handleFor(container, 'event:a'), { clientX: 0, clientY: 0, pointerType: 'mouse', button: 0 })
    pointAt(monthBox(container, '2026-08-14'))
    fireEvent.pointerMove(window, { clientX: 40, clientY: 0, pointerType: 'mouse' })

    expect(monthBox(container, '2026-08-14')).toHaveAttribute('data-drop-active', 'true')
    expect(monthBox(container, '2026-08-10')).not.toHaveAttribute('data-drop-active')
    expect(screen.getByText(/Moving Smith Wedding/)).toBeInTheDocument()
    fireEvent.pointerUp(window, { clientX: 40, clientY: 0 })
  })

  it('Escape abandons a drag in flight and nothing is written', async () => {
    const { container } = renderMonth()
    fireEvent.pointerDown(handleFor(container, 'event:a'), { clientX: 0, clientY: 0, pointerType: 'mouse', button: 0 })
    pointAt(monthBox(container, '2026-08-14'))
    fireEvent.pointerMove(window, { clientX: 40, clientY: 0, pointerType: 'mouse' })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(window, { clientX: 40, clientY: 0 })

    await waitFor(() => expect(liveRegion(container)).toHaveTextContent(/Move cancelled/i))
    expect(rescheduleCalendarItem).not.toHaveBeenCalled()
    expect(monthBox(container, '2026-08-10').querySelector('[data-item-key="event:a"]')).not.toBeNull()
  })

  it('a drop back onto the SAME day writes nothing', async () => {
    const { container } = renderMonth()
    dragTo(handleFor(container, 'event:a'), monthBox(container, '2026-08-10'))
    await Promise.resolve()
    expect(rescheduleCalendarItem).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD — WCAG 2.1.1. Drag that is mouse-only is not an option.
// ─────────────────────────────────────────────────────────────────────────────
describe('the keyboard equivalent', () => {
  it('] moves a focused job a day later and ANNOUNCES it', async () => {
    const { container } = renderMonth()
    const handle = handleFor(container, 'event:a')
    handle.focus()
    fireEvent.keyDown(handle, { key: ']' })

    await waitFor(() =>
      expect(rescheduleCalendarItem).toHaveBeenCalledWith('acme', { kind: 'event', id: 'a', date: '2026-08-11' })
    )
    const live = liveRegion(container)
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveAttribute('role', 'status')
    expect(live).toHaveTextContent(/Smith Wedding moved to/i)
  })

  it('[ moves it a day earlier and { } move it a whole week', async () => {
    const { container } = renderMonth()
    fireEvent.keyDown(handleFor(container, 'event:a'), { key: '[' })
    await waitFor(() =>
      expect(rescheduleCalendarItem).toHaveBeenLastCalledWith('acme', { kind: 'event', id: 'a', date: '2026-08-09' })
    )

    rescheduleCalendarItem.mockClear()
    fireEvent.keyDown(handleFor(container, 'lead:h'), { key: '}' })
    await waitFor(() =>
      expect(rescheduleCalendarItem).toHaveBeenLastCalledWith('acme', { kind: 'lead', id: 'h', date: '2026-08-17' })
    )
  })

  it('publishes its bindings on the chip so a screen reader can find them', () => {
    const { container } = renderMonth()
    // an all-day month row has no window, so no time keys are advertised
    expect(handleFor(container, 'event:a')).toHaveAttribute('aria-keyshortcuts', '[ ] { }')
  })

  it('keeps focus on the job after it re-parents into another day cell', async () => {
    const { container } = renderMonth()
    const handle = handleFor(container, 'event:a')
    handle.focus()
    fireEvent.keyDown(handle, { key: ']' })
    await waitFor(() =>
      expect(monthBox(container, '2026-08-11').querySelector('[data-item-key="event:a"]')).not.toBeNull()
    )
    // …otherwise the shortcut could never be pressed twice.
    await waitFor(() => expect(document.activeElement).toBe(handleFor(container, 'event:a')))
  })

  it('ignores a modifier combo, so ⌘] stays the browser’s', async () => {
    const { container } = renderMonth()
    fireEvent.keyDown(handleFor(container, 'event:a'), { key: ']', metaKey: true })
    await Promise.resolve()
    expect(rescheduleCalendarItem).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TOUCH — the operator is in a van, on a phone.
// ─────────────────────────────────────────────────────────────────────────────
describe('touch — a drag must not fight page scroll', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('declares pan-y, so a swipe that starts on a chip still scrolls the cockpit', () => {
    const { container } = renderMonth()
    expect(handleFor(container, 'event:a')).toHaveStyle({ touchAction: 'pan-y' })
  })

  it('needs a press-and-HOLD to lift a job; a swipe is left to the scroller', async () => {
    vi.useFakeTimers()
    const { container } = renderMonth()
    fireEvent.pointerDown(handleFor(container, 'event:a'), { clientX: 0, clientY: 0, pointerType: 'touch', button: 0 })
    // the finger moves straight away → this was a scroll
    pointAt(monthBox(container, '2026-08-14'))
    fireEvent.pointerMove(window, { clientX: 0, clientY: TOUCH_SLOP_PX + 20, pointerType: 'touch' })
    act(() => {
      vi.advanceTimersByTime(TOUCH_HOLD_MS + 50)
    })
    fireEvent.pointerUp(window, { clientX: 0, clientY: TOUCH_SLOP_PX + 20, pointerType: 'touch' })

    expect(screen.queryByText(/Moving Smith Wedding/)).not.toBeInTheDocument()
    expect(rescheduleCalendarItem).not.toHaveBeenCalled()
  })

  it('lifts the job once the finger has been held still, then follows it', () => {
    vi.useFakeTimers()
    const { container } = renderMonth()
    fireEvent.pointerDown(handleFor(container, 'event:a'), { clientX: 0, clientY: 0, pointerType: 'touch', button: 0 })
    act(() => {
      vi.advanceTimersByTime(TOUCH_HOLD_MS + 1)
    })
    expect(screen.getByText(/Moving Smith Wedding/)).toBeInTheDocument()

    pointAt(monthBox(container, '2026-08-14'))
    fireEvent.pointerMove(window, { clientX: 0, clientY: 60, pointerType: 'touch' })
    expect(monthBox(container, '2026-08-14')).toHaveAttribute('data-drop-active', 'true')
    fireEvent.pointerUp(window, { clientX: 0, clientY: 60, pointerType: 'touch' })
  })

  it('lets touchmove scroll BEFORE the lift and blocks it AFTER — the actual anti-scroll mechanism', () => {
    vi.useFakeTimers()
    const { container } = renderMonth()
    fireEvent.pointerDown(handleFor(container, 'event:a'), { clientX: 0, clientY: 0, pointerType: 'touch', button: 0 })

    const before = new Event('touchmove', { bubbles: true, cancelable: true })
    window.dispatchEvent(before)
    expect(before.defaultPrevented).toBe(false)

    act(() => {
      vi.advanceTimersByTime(TOUCH_HOLD_MS + 1)
    })
    const after = new Event('touchmove', { bubbles: true, cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(true)

    fireEvent.pointerUp(window, { clientX: 0, clientY: 0, pointerType: 'touch' })
    // …and the block is lifted with the gesture, not left latched on the window.
    const afterDrop = new Event('touchmove', { bubbles: true, cancelable: true })
    window.dispatchEvent(afterDrop)
    expect(afterDrop.defaultPrevented).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REDUCED MOTION
// ─────────────────────────────────────────────────────────────────────────────
describe('prefers-reduced-motion', () => {
  it('never animates a chip, and turns its only transition off', () => {
    const { container } = renderMonth()
    fireEvent.pointerDown(handleFor(container, 'event:a'), { clientX: 0, clientY: 0, pointerType: 'mouse', button: 0 })
    pointAt(monthBox(container, '2026-08-14'))
    fireEvent.pointerMove(window, { clientX: 40, clientY: 0, pointerType: 'mouse' })

    const handle = handleFor(container, 'event:a')
    expect(handle).toHaveAttribute('data-dragging', 'true')
    // There is no fly-back to suppress: the chip never leaves its place, so a
    // cancelled drag simply clears. The one transition is a colour/opacity
    // fade, and reduced motion switches it off.
    expect(handle.className).toMatch(/motion-reduce:transition-none/)
    expect(handle.className).not.toMatch(/animate-/)
    // the drop highlight is held to the same rule
    expect(monthBox(container, '2026-08-14').className).toMatch(/motion-reduce:transition-none/)
    expect(monthBox(container, '2026-08-14').className).not.toMatch(/animate-/)
    fireEvent.pointerUp(window, { clientX: 40, clientY: 0 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WEEK — drag across the seven columns
// ─────────────────────────────────────────────────────────────────────────────
const weekStart = '2026-08-17'
const weekItems: CalendarItem[] = [
  { id: 'e1', title: 'Wedding', date: '2026-08-19', kind: 'event', href: '/acme/wedding/dashboard', start: '16:00', end: '20:00' },
  { id: 'e2', title: 'Backyard job', date: '2026-08-19', kind: 'event', href: '/acme/backyard/dashboard' },
  { id: 'i1', title: 'Deposit invoice', date: '2026-08-20', kind: 'invoice_due', href: '/acme/leads/l1', amount: 500 },
]

const weekBody = (c: HTMLElement, d: string) =>
  c.querySelector(`[data-slot="week-body-cell"][data-day="${d}"] [data-slot="time-grid-body"]`) as HTMLElement
const weekBand = (c: HTMLElement, d: string) =>
  c.querySelector(`[data-slot="week-band-cell"][data-day="${d}"]`) as HTMLElement

describe('WeekGrid — drag a job to another day', () => {
  it('moves a timed job across columns at the same hour, changing only the day', async () => {
    const { container } = render(
      <WeekGrid orgSlug="acme" items={weekItems} weekStart={weekStart} today="2026-08-18" />
    )
    fireEvent.pointerDown(handleFor(container, 'event:e1'), { clientX: 0, clientY: 0, pointerType: 'mouse', button: 0 })
    pointAt(weekBody(container, '2026-08-21'))
    fireEvent.pointerMove(window, { clientX: 200, clientY: yForHour(16), pointerType: 'mouse' })
    fireEvent.pointerUp(window, { clientX: 200, clientY: yForHour(16), pointerType: 'mouse' })

    await waitFor(() => expect(rescheduleCalendarItem).toHaveBeenCalledTimes(1))
    // Dropped at the same hour, so the window is untouched and no `hours` are
    // sent — a day move must never rewrite the time as a side effect.
    expect(rescheduleCalendarItem).toHaveBeenCalledWith('acme', { kind: 'event', id: 'e1', date: '2026-08-21' })
  })

  it('moves an all-day job dropped on another day’s band', async () => {
    const { container } = render(
      <WeekGrid orgSlug="acme" items={weekItems} weekStart={weekStart} today="2026-08-18" />
    )
    dragTo(handleFor(container, 'event:e2'), weekBand(container, '2026-08-22'))
    await waitFor(() =>
      expect(rescheduleCalendarItem).toHaveBeenCalledWith('acme', { kind: 'event', id: 'e2', date: '2026-08-22' })
    )
  })

  it('carries the job to the new column optimistically', async () => {
    const pending = deferred<{ moved: number; failures: [] }>()
    rescheduleCalendarItem.mockReturnValue(pending.promise)
    const { container } = render(
      <WeekGrid orgSlug="acme" items={weekItems} weekStart={weekStart} today="2026-08-18" />
    )
    dragTo(handleFor(container, 'event:e2'), weekBand(container, '2026-08-22'))
    await waitFor(() => expect(within(weekBand(container, '2026-08-22')).getByText('Backyard job')).toBeInTheDocument())
    await act(async () => {
      pending.resolve({ moved: 1, failures: [] })
    })
  })

  it('leaves the invoice undraggable in the week band too — one rule, both surfaces', () => {
    const { container } = render(
      <WeekGrid orgSlug="acme" items={weekItems} weekStart={weekStart} today="2026-08-18" />
    )
    expect(handleFor(container, 'invoice_due:i1')).toBeNull()
    expect(within(weekBand(container, '2026-08-20')).getByText('Deposit invoice')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DAY — drag the TIME, and edge-drag the duration
// ─────────────────────────────────────────────────────────────────────────────
const dayYmd = '2026-08-22'
const dayItems: CalendarItem[] = [
  { id: 'e1', title: 'Wedding', date: dayYmd, kind: 'event', href: '/acme/wedding/dashboard', start: '16:00', end: '19:00' },
  { id: 'd1', title: 'Drop pickup: box', date: dayYmd, kind: 'drop', href: '/acme/drop-orders/d1', start: '10:00', end: '12:00' },
]

const dayBody = (c: HTMLElement) => c.querySelector('[data-slot="time-grid-body"]') as HTMLElement

function renderDay() {
  return render(<DayView orgSlug="acme" items={dayItems} ymd={dayYmd} today={dayYmd} />)
}

describe('DayView — drag the time, edge-drag the duration', () => {
  it('drags a job to another time and writes the WINDOW, keeping its duration', async () => {
    const { container } = renderDay()
    fireEvent.pointerDown(handleFor(container, 'event:e1'), { clientX: 0, clientY: 0, pointerType: 'mouse', button: 0 })
    pointAt(dayBody(container))
    fireEvent.pointerMove(window, { clientX: 0, clientY: yForHour(9), pointerType: 'mouse' })
    fireEvent.pointerUp(window, { clientX: 0, clientY: yForHour(9), pointerType: 'mouse' })

    await waitFor(() => expect(rescheduleCalendarItem).toHaveBeenCalledTimes(1))
    expect(rescheduleCalendarItem).toHaveBeenCalledWith('acme', {
      kind: 'event',
      id: 'e1',
      date: dayYmd,
      // 3 hours before, 3 hours after
      hours: { start: '09:00', end: '12:00' },
    })
  })

  it('edge-drags the bottom to resize, writing the time-of-day and moving only that edge', async () => {
    const { container } = renderDay()
    const handle = container.querySelector('[data-slot="grid-resize"][data-edge="end"]') as HTMLElement
    expect(handle).not.toBeNull()
    fireEvent.pointerDown(handle, { clientX: 0, clientY: yForHour(19), pointerType: 'mouse', button: 0 })
    pointAt(dayBody(container))
    fireEvent.pointerMove(window, { clientX: 0, clientY: yForHour(21), pointerType: 'mouse' })
    fireEvent.pointerUp(window, { clientX: 0, clientY: yForHour(21), pointerType: 'mouse' })

    await waitFor(() => expect(rescheduleCalendarItem).toHaveBeenCalledTimes(1))
    expect(rescheduleCalendarItem).toHaveBeenCalledWith('acme', {
      kind: 'event',
      id: 'e1',
      date: dayYmd,
      hours: { start: '16:00', end: '21:00' },
    })
  })

  it('edge-drags the top without touching the end', async () => {
    const { container } = renderDay()
    const handle = container.querySelector('[data-slot="grid-resize"][data-edge="start"]') as HTMLElement
    fireEvent.pointerDown(handle, { clientX: 0, clientY: yForHour(16), pointerType: 'mouse', button: 0 })
    pointAt(dayBody(container))
    fireEvent.pointerMove(window, { clientX: 0, clientY: yForHour(14.5), pointerType: 'mouse' })
    fireEvent.pointerUp(window, { clientX: 0, clientY: yForHour(14.5), pointerType: 'mouse' })

    await waitFor(() =>
      expect(rescheduleCalendarItem).toHaveBeenCalledWith('acme', {
        kind: 'event',
        id: 'e1',
        date: dayYmd,
        hours: { start: '14:30', end: '19:00' },
      })
    )
  })

  it('gives a drop pickup window NO grab handle and NO resize strips', () => {
    const { container } = renderDay()
    expect(handleFor(container, 'drop:d1')).toBeNull()
    // exactly one resizable chip on the grid — the booked job
    const strips = container.querySelectorAll('[data-slot="grid-resize"]')
    expect(strips).toHaveLength(2)
    for (const s of strips) expect(s.getAttribute('data-item-key')).toBe('event:e1')
  })

  it(', and . nudge the window by a quarter hour from the keyboard', async () => {
    const { container } = renderDay()
    fireEvent.keyDown(handleFor(container, 'event:e1'), { key: '.' })
    await waitFor(() =>
      expect(rescheduleCalendarItem).toHaveBeenLastCalledWith('acme', {
        kind: 'event',
        id: 'e1',
        date: dayYmd,
        hours: { start: '16:15', end: '19:15' },
      })
    )
  })

  it('> lengthens the job from the keyboard — the drag has a key for every gesture', async () => {
    const { container } = renderDay()
    fireEvent.keyDown(handleFor(container, 'event:e1'), { key: '>' })
    await waitFor(() =>
      expect(rescheduleCalendarItem).toHaveBeenLastCalledWith('acme', {
        kind: 'event',
        id: 'e1',
        date: dayYmd,
        hours: { start: '16:00', end: '19:15' },
      })
    )
  })

  it('< shortens it, and each keystroke starts from the window the last one left', async () => {
    const { container } = renderDay()
    fireEvent.keyDown(handleFor(container, 'event:e1'), { key: '<' })
    await waitFor(() =>
      expect(rescheduleCalendarItem).toHaveBeenLastCalledWith('acme', {
        kind: 'event',
        id: 'e1',
        date: dayYmd,
        hours: { start: '16:00', end: '18:45' },
      })
    )
    // The optimistic window is what the SECOND press reads — otherwise holding
    // the key would send the same 15-minute nudge over and over.
    fireEvent.keyDown(handleFor(container, 'event:e1'), { key: '<' })
    await waitFor(() =>
      expect(rescheduleCalendarItem).toHaveBeenLastCalledWith('acme', {
        kind: 'event',
        id: 'e1',
        date: dayYmd,
        hours: { start: '16:00', end: '18:30' },
      })
    )
  })

  it('drops the resize strips on a chip too short to carry them, keeping the keys', async () => {
    const short: CalendarItem[] = [
      { id: 'q', title: 'Quick pour', date: dayYmd, kind: 'event', href: '/acme/q', start: '10:00', end: '10:15' },
    ]
    const { container } = render(<DayView orgSlug="acme" items={short} ymd={dayYmd} today={dayYmd} />)
    // a 15-minute chip is floored to 24px; two 10px grips would be the whole box
    expect(container.querySelectorAll('[data-slot="grid-resize"]')).toHaveLength(0)
    // …so the keyboard is the resize, and it still works
    fireEvent.keyDown(handleFor(container, 'event:q'), { key: '>' })
    await waitFor(() =>
      expect(rescheduleCalendarItem).toHaveBeenLastCalledWith('acme', {
        kind: 'event',
        id: 'q',
        date: dayYmd,
        hours: { start: '10:00', end: '10:30' },
      })
    )
  })

  it('exposes the grid geometry the drop engine reads, rather than importing it', () => {
    const { container } = renderDay()
    const body = dayBody(container)
    expect(body).toHaveAttribute('data-drop-day', dayYmd)
    expect(body).toHaveAttribute('data-grid-start-hour', String(DAY_START_HOUR))
    expect(body).toHaveAttribute('data-grid-px-per-hour', String(PX_PER_HOUR))
  })

  it('advertises the time keys only on a chip that has a window', () => {
    const { container } = renderDay()
    expect(handleFor(container, 'event:e1')).toHaveAttribute('aria-keyshortcuts', '[ ] { } , . < >')
  })

  it('repaints the chip at its new time before the server answers', async () => {
    const pending = deferred<{ moved: number; failures: [] }>()
    rescheduleCalendarItem.mockReturnValue(pending.promise)
    const { container } = renderDay()
    expect(handleFor(container, 'event:e1')).toHaveStyle({ top: `${yForHour(16)}px` })

    fireEvent.keyDown(handleFor(container, 'event:e1'), { key: '.' })
    await waitFor(() => expect(handleFor(container, 'event:e1')).toHaveStyle({ top: `${yForHour(16.25)}px` }))
    await act(async () => {
      pending.resolve({ moved: 1, failures: [] })
    })
  })
})
