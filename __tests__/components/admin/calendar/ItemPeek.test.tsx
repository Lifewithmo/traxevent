import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { CalendarItem } from '@/lib/calendar'

const push = vi.fn()
const refresh = vi.fn()
let search = new URLSearchParams('view=week')
let pathname = '/acme/calendar'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh }),
  useSearchParams: () => search,
  usePathname: () => pathname,
}))

const rescheduleCalendarItem = vi.fn()
vi.mock('@/actions/calendar-bulk', () => ({
  bulkRescheduleAgenda: vi.fn().mockResolvedValue({ moved: 0, failures: [] }),
  rescheduleCalendarItem: (...a: unknown[]) => rescheduleCalendarItem(...a),
}))

import { CalendarCanvas } from '@/components/admin/calendar/CalendarCanvas'
import { DRAG_THRESHOLD_PX } from '@/components/admin/calendar/reschedule-drag'
import { dismissLayerCount } from '@/components/admin/calendar/dismiss-stack'

/**
 * W4-R part 2 — open an item in place.
 *
 * These drive the REAL cockpit (CalendarCanvas over the real grids and the real
 * agenda), because the whole feature is delegation: a peek that only worked in
 * a harness would prove nothing about a click landing on a chip the drag engine
 * also owns.
 *
 * Dates are far in the future so the agenda's "anchored on today" window always
 * contains them regardless of the day the suite runs.
 */

const WEDDING: CalendarItem = {
  id: 'e1',
  title: 'Harper wedding',
  date: '2099-08-19',
  kind: 'event',
  href: '/acme/harper/dashboard',
  start: '16:00',
  end: '20:00',
  detail: 'Harper & Cole',
  location: 'The Barn, 12 Mill Rd',
  headcount: 120,
  bookedValue: 2400,
}
const HOLD: CalendarItem = {
  id: 'l1',
  title: 'Tentative hold',
  date: '2099-08-21',
  kind: 'lead',
  href: '/acme/leads/l1',
  tentative: true,
}
const INVOICE: CalendarItem = {
  id: 'i1',
  title: 'Deposit invoice',
  date: '2099-08-20',
  kind: 'invoice_due',
  href: '/acme/invoices/i1',
  amount: 500,
}

/** Timed AND non-reschedulable — a drop window gets no drag props, so it is the
 *  only thing whose peek depends on GridItem carrying `data-item-key` itself. */
const PICKUP = {
  id: 'd1',
  title: 'Drop pickup: Weekend box',
  date: '2099-08-19',
  kind: 'drop' as const,
  href: '/acme/drop-orders/d1',
  start: '10:00',
  end: '11:00',
}

const items = [WEDDING, HOLD, INVOICE, PICKUP]
// `feed` is the palette's search index (the whole book); here the window IS the
// whole book, which is what these fixtures mean.
const base = { orgSlug: 'acme', items, feed: items, today: '2099-08-18', anchor: '2099-08-19' }

/** The chips the peek keys off — the drag engine's own contract. */
const chipFor = (key: string) =>
  document.querySelector<HTMLElement>(`a[data-item-key="${key}"], button[data-item-key="${key}"]`)!

const peek = () => document.querySelector<HTMLElement>('[data-slot="item-peek"]')
const pane = () => document.querySelector<HTMLElement>('[data-slot="canvas-pane"]')!

/** jsdom has neither layout nor elementFromPoint; the drop engine needs both. */
let dropAt: Element | null = null
beforeEach(() => {
  push.mockClear()
  refresh.mockClear()
  rescheduleCalendarItem.mockReset().mockResolvedValue({ moved: 1, failures: [] })
  search = new URLSearchParams('view=week')
  pathname = '/acme/calendar'
  dropAt = null
  ;(document as unknown as { elementFromPoint: () => Element | null }).elementFromPoint = () => dropAt
})
afterEach(() => {
  delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint
})

describe('peek — opening', () => {
  // The Day view's TIMED chip and its all-day BAND chip are separate renderers
  // from the week/month cell, and `data-item-key` reaches them through a
  // different path (they carry it directly, because non-reschedulable kinds get
  // no drag props to supply it). Removing it from either used to fail nothing.
  it('opens from a timed chip in Day view', () => {
    render(<CalendarCanvas {...base} view="day" selectedDay="2099-08-19" />)
    // A DROP, not the event: an event is reschedulable, so the drag engine's
    // props already carry `data-item-key` and the chip's own attribute is
    // redundant. A drop window is timed but not draggable — it is the only case
    // GridItem's explicit key actually serves, and testing the event instead
    // let a mutation removing that key survive.
    const chip = chipFor('drop:d1')
    expect(chip.closest('[data-slot="grid-item"]')).not.toBeNull()
    expect(chip.getAttribute('data-draggable')).toBeNull()
    fireEvent.click(chip)
    expect(peek()).not.toBeNull()
  })

  it('opens from an all-day band chip in Day view', () => {
    render(<CalendarCanvas {...base} view="day" selectedDay="2099-08-20" />)
    const chip = chipFor('invoice_due:i1')
    fireEvent.click(chip)
    expect(peek()).not.toBeNull()
  })

  it('a click on a grid chip opens the peek instead of navigating', () => {
    render(<CalendarCanvas {...base} view="week" />)
    const chip = chipFor('event:e1')
    // The href is left intact so ⌘-click / middle-click still open the record.
    expect(chip).toHaveAttribute('href', '/acme/harper/dashboard')

    // fireEvent returns false when the default was prevented — which is how the
    // link is stopped from navigating. Asserting the peek alone cannot see that.
    expect(fireEvent.click(chip)).toBe(false)

    const panel = peek()!
    expect(panel).toBeInTheDocument()
    expect(within(panel).getByText('Harper wedding')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('opens from the keyboard on Enter and on Space', () => {
    const { unmount } = render(<CalendarCanvas {...base} view="week" />)
    const chip = chipFor('event:e1')
    chip.focus()
    fireEvent.keyDown(chip, { key: 'Enter' })
    expect(peek()).toBeInTheDocument()
    unmount()

    render(<CalendarCanvas {...base} view="week" />)
    const again = chipFor('event:e1')
    again.focus()
    fireEvent.keyDown(again, { key: ' ' })
    expect(peek()).toBeInTheDocument()
  })

  it('leaves the chip’s own reschedule bindings alone', () => {
    render(<CalendarCanvas {...base} view="week" />)
    const chip = chipFor('event:e1')
    chip.focus()
    // `]` moves the job a day. It must reschedule, and it must NOT peek.
    // NOTE this one passes for two reasons at once — the pane only listens for
    // Enter/Space, AND reschedule-drag stops `]` propagating. The test below is
    // the one that can actually see the pane's key filter.
    fireEvent.keyDown(chip, { key: ']' })
    expect(rescheduleCalendarItem).toHaveBeenCalledTimes(1)
    expect(peek()).toBeNull()
  })

  it('opens for the activation keys and for nothing else', () => {
    render(<CalendarCanvas {...base} view="week" />)
    const chip = chipFor('event:e1')
    chip.focus()
    // Keys nothing else on the chip claims, so they reach the pane's listener
    // and are turned away by its own filter rather than by someone else's
    // stopPropagation.
    for (const key of ['x', 'Tab', 'ArrowDown', 'Escape', 'Backspace']) {
      fireEvent.keyDown(chip, { key })
      expect(peek()).toBeNull()
    }
    // …and a modifier combo is never an activation either.
    fireEvent.keyDown(chip, { key: 'Enter', metaKey: true })
    expect(peek()).toBeNull()
  })

  it('a resize grip is a grip, not a chip', () => {
    render(<CalendarCanvas {...base} view="week" />)
    // The edge strips carry the same data-item-key as the chip they resize.
    const grip = document.querySelector<HTMLElement>('[data-slot="grid-resize"]')!
    expect(grip).toHaveAttribute('data-item-key', 'event:e1')
    fireEvent.click(grip)
    expect(peek()).toBeNull()
  })

  it('a modified click is left to the browser', () => {
    render(<CalendarCanvas {...base} view="week" />)
    fireEvent.click(chipFor('event:e1'), { metaKey: true })
    expect(peek()).toBeNull()
  })

  it('a click that is not on a chip does nothing', () => {
    render(<CalendarCanvas {...base} view="week" />)
    fireEvent.click(pane())
    expect(peek()).toBeNull()
  })

  it('works on the agenda too, for kinds that carry no drag handle', () => {
    render(<CalendarCanvas {...base} view="agenda" />)
    fireEvent.click(chipFor('invoice_due:i1'))
    const panel = peek()!
    expect(within(panel).getByText('Deposit invoice')).toBeInTheDocument()
    expect(within(panel).getByText('$500')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})

describe('peek — a drag is not a click', () => {
  it('a completed drag does NOT open the peek', () => {
    render(<CalendarCanvas {...base} view="week" />)
    const chip = chipFor('event:e1')
    const zone = document.querySelector('[data-drop-day="2099-08-21"]')

    fireEvent.pointerDown(chip, { clientX: 0, clientY: 0, pointerType: 'mouse', button: 0 })
    dropAt = zone
    fireEvent.pointerMove(window, { clientX: DRAG_THRESHOLD_PX * 4, clientY: 0, pointerType: 'mouse' })
    // The gesture really ARMED. Without this the rest of the test could pass on
    // a drag that never started.
    expect(chip).toHaveAttribute('data-dragging', 'true')
    fireEvent.pointerUp(window, { clientX: DRAG_THRESHOLD_PX * 4, clientY: 0, pointerType: 'mouse' })
    expect(rescheduleCalendarItem).toHaveBeenCalledTimes(1)

    // Re-query: the optimistic move re-parents the chip into another day column,
    // so the node captured above is detached — and a click on a DETACHED node
    // reaches no React listener at all, which would make this test pass for a
    // reason that has nothing to do with the peek.
    const dropped = chipFor('event:e1')
    expect(dropped.isConnected).toBe(true)

    // A real drag ends with a click on the chip. It must not peek.
    fireEvent.click(dropped)
    expect(peek()).toBeNull()
  })

  it('a press that never crossed the threshold is still a click, and still peeks', () => {
    render(<CalendarCanvas {...base} view="week" />)
    const chip = chipFor('event:e1')
    fireEvent.pointerDown(chip, { clientX: 0, clientY: 0, pointerType: 'mouse', button: 0 })
    fireEvent.pointerMove(window, { clientX: 1, clientY: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(window, { clientX: 1, clientY: 1, pointerType: 'mouse' })
    fireEvent.click(chip)

    expect(rescheduleCalendarItem).not.toHaveBeenCalled()
    expect(peek()).toBeInTheDocument()
  })

  it('a touch that drifted before the hold armed is a scroll, and still peeks', () => {
    render(<CalendarCanvas {...base} view="week" />)
    const chip = chipFor('event:e1')
    fireEvent.pointerDown(chip, { clientX: 0, clientY: 0, pointerType: 'touch', button: 0 })
    // Drifted past TOUCH_SLOP_PX before TOUCH_HOLD_MS — abandoned to the scroller.
    fireEvent.pointerMove(window, { clientX: 0, clientY: 40, pointerType: 'touch' })
    fireEvent.pointerUp(window, { clientX: 0, clientY: 40, pointerType: 'touch' })
    fireEvent.click(chip)

    expect(rescheduleCalendarItem).not.toHaveBeenCalled()
    expect(peek()).toBeInTheDocument()
  })
})

describe('peek — closing', () => {
  it('Escape closes it and puts focus back on the chip that opened it', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    const chip = chipFor('event:e1')
    chip.focus()
    fireEvent.click(chip)
    const panel = peek()!
    expect(panel).toBeInTheDocument()

    fireEvent.keyDown(panel, { key: 'Escape' })
    await waitFor(() => expect(peek()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(chip))
  })

  it('lands focus on the CHIP even when the chip never had it', async () => {
    // A mouse click does not move focus to a link in every browser (and never
    // does in jsdom), so "restore whatever was focused before" — the Dialog's
    // own default, and what the previous test would settle for — puts the
    // keyboard user back where they were, not on the job they were just
    // looking at. The peek promises `[` / `]` work the moment it closes, so
    // focus has to land on the chip itself.
    render(
      <div>
        <button type="button">elsewhere</button>
        <CalendarCanvas {...base} view="week" />
      </div>
    )
    const elsewhere = screen.getByRole('button', { name: 'elsewhere' })
    elsewhere.focus()
    const chip = chipFor('event:e1')
    fireEvent.click(chip)
    expect(peek()).toBeInTheDocument()
    expect(document.activeElement).not.toBe(chip)

    fireEvent.keyDown(peek()!, { key: 'Escape' })
    await waitFor(() => expect(peek()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(chip))
  })

  it('registers and releases exactly one dismiss layer', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    expect(dismissLayerCount()).toBe(0)
    const chip = chipFor('event:e1')
    fireEvent.click(chip)
    expect(dismissLayerCount()).toBe(1)
    fireEvent.keyDown(peek()!, { key: 'Escape' })
    await waitFor(() => expect(dismissLayerCount()).toBe(0))
  })
})

describe('peek — the grid stays put behind it', () => {
  it('does not remount the canvas pane, the grid, or the chip', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    const paneBefore = pane()
    const gridBefore = screen.getByRole('region', { name: /week grid/i })
    const chipBefore = chipFor('event:e1')
    paneBefore.scrollTop = 420

    fireEvent.click(chipBefore)
    expect(peek()).toBeInTheDocument()
    // Mid-peek the grid is STILL THERE — not replaced by the overlay.
    expect(pane()).toBe(paneBefore)
    expect(screen.getByRole('region', { name: /week grid/i })).toBe(gridBefore)

    fireEvent.keyDown(peek()!, { key: 'Escape' })
    await waitFor(() => expect(peek()).toBeNull())

    // Identity, not just presence: a remount would give new nodes and the
    // pane's `${view}:${anchor}:${selectedDay}` key would have re-run the grid's
    // scroll-to-now effect from the top.
    expect(pane()).toBe(paneBefore)
    expect(screen.getByRole('region', { name: /week grid/i })).toBe(gridBefore)
    expect(chipFor('event:e1')).toBe(chipBefore)
    expect(paneBefore.scrollTop).toBe(420)
    // …and nothing navigated, which is the only other way to lose the grid.
    expect(push).not.toHaveBeenCalled()
  })
})

describe('Escape dismisses exactly one surface', () => {
  it('closing the peek leaves an agenda bulk selection intact', async () => {
    render(<CalendarCanvas {...base} view="agenda" />)
    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[1])
    fireEvent.click(boxes[2])
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    fireEvent.click(chipFor('event:e1'))
    expect(peek()).toBeInTheDocument()

    fireEvent.keyDown(peek()!, { key: 'Escape' })
    await waitFor(() => expect(peek()).toBeNull())
    // The selection is STILL THERE. One Escape, one dismissal.
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    // The next Escape is the selection's, because it is topmost again.
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('2 selected')).toBeNull())
  })

  it('closing the ⌘K palette leaves an agenda bulk selection intact', async () => {
    render(<CalendarCanvas {...base} view="agenda" />)
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog')
    // The palette holds the top of the dismiss stack for as long as it is open.
    // Asserting this and not only the outcome is deliberate: Base UI 1.5.0 also
    // calls stopPropagation() on the Escape it consumes, so the OUTCOME below
    // would survive deleting the layer entirely. The count is what actually
    // pins this app's own guarantee.
    // 2 = the agenda's selection, plus the palette on top of it.
    expect(dismissLayerCount()).toBe(2)

    fireEvent.keyDown(within(dialog).getByRole('combobox'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await waitFor(() => expect(dismissLayerCount()).toBe(1))
  })

  it('the ? sheet shields the selection the same way', async () => {
    render(<CalendarCanvas {...base} view="agenda" />)
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: /keyboard shortcuts/i }))
    await screen.findByText('Keyboard shortcuts')
    expect(dismissLayerCount()).toBe(2)
  })

  it('an Escape another handler already consumed is not consumed again', () => {
    render(<CalendarCanvas {...base} view="agenda" />)
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    handled.preventDefault()
    window.dispatchEvent(handled)
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })
})

/**
 * ── C5: ⌘K was the one door the dismiss stack does not cover ─────────────────
 *
 * Every other way into an overlay is state the cockpit guards (`onCockpitKeyDown`
 * stands down while anything is open) or a chip behind a modal backdrop. ⌘K is a
 * `window` listener, so it fired straight through an open peek and mounted a
 * SECOND `aria-modal` dialog with its own focus trap over the first — two live
 * Escape handlers, and a shared `returnFocus` ref that the palette overwrote
 * with an element inside the dying peek (focus then fell to <body>, WCAG 2.4.3).
 */
describe('⌘K never stacks a second modal', () => {
  const dialogs = () => document.querySelectorAll('[role="dialog"]')

  it('supersedes an open peek instead of opening over it', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    const chip = chipFor('event:e1')
    chip.focus()
    fireEvent.click(chip)
    expect(peek()).not.toBeNull()
    expect(dialogs()).toHaveLength(1)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await waitFor(() => expect(document.querySelector('[role="combobox"]')).not.toBeNull())
    // ONE dialog on screen, and it is the palette — not the palette ON the peek.
    expect(dialogs()).toHaveLength(1)
    expect(peek()).toBeNull()
    // …and exactly one dismiss layer, so one Escape is still one dismissal.
    expect(dismissLayerCount()).toBe(1)
  })

  it('supersedes the ? sheet the same way', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    const trigger = screen.getByRole('button', { name: /keyboard shortcuts/i })
    trigger.focus()
    fireEvent.click(trigger)
    await screen.findByText('Keyboard shortcuts')
    expect(dialogs()).toHaveLength(1)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await waitFor(() => expect(document.querySelector('[role="combobox"]')).not.toBeNull())
    expect(dialogs()).toHaveLength(1)
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull()
    expect(dismissLayerCount()).toBe(1)
  })

  it('returns focus to the CHIP when the superseding palette closes, never <body>', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    const chip = chipFor('event:e1')
    chip.focus()
    fireEvent.click(chip)

    // FOCUS HAS TO BE INSIDE THE PEEK before ⌘K, or this test proves nothing.
    // A real browser puts it there on open; jsdom leaves it on the chip, and
    // with focus still on the chip "capture whatever is focused" happens to
    // produce the right answer — a mutation removing the inheritance survived
    // until this line existed. This is also a real operator state: tab into the
    // peek, then search.
    const record = document.querySelector<HTMLElement>('[data-slot="peek-record"]')!
    record.focus()
    expect(document.activeElement).toBe(record)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    const box = (await screen.findByRole('combobox')) as HTMLElement
    await waitFor(() => expect(document.activeElement).toBe(box))
    fireEvent.keyDown(box, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())

    // The peek's own return target survives being superseded: the operator lands
    // back on the job they were looking at, ready for `[` / `]`.
    await waitFor(() => expect(document.activeElement).toBe(chip))
    expect(document.activeElement).not.toBe(document.body)
    await waitFor(() => expect(dismissLayerCount()).toBe(0))
  })

  it('returns focus to the ? button when the superseding palette closes', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    const trigger = screen.getByRole('button', { name: /keyboard shortcuts/i })
    trigger.focus()
    fireEvent.click(trigger)
    const sheet = await screen.findByRole('dialog', { name: /keyboard shortcuts/i })

    // Same reason as the peek above: park focus INSIDE the sheet, where the
    // browser puts it, so "capture live focus" cannot pass by accident.
    const close = within(sheet).getByRole('button', { name: /close/i })
    close.focus()
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const box = (await screen.findByRole('combobox')) as HTMLElement
    fireEvent.keyDown(box, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('one Escape leaves nothing else open behind it', async () => {
    // The pre-fix shape of this: BOTH dialogs' Escape handlers were live, so the
    // single keypress closed the palette AND the peek. Post-fix there is only
    // ever one thing to close — assert the state directly rather than the count
    // of things that happened to close.
    render(<CalendarCanvas {...base} view="week" />)
    const chip = chipFor('event:e1')
    chip.focus()
    fireEvent.click(chip)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const box = (await screen.findByRole('combobox')) as HTMLElement
    fireEvent.keyDown(box, { key: 'Escape' })
    await waitFor(() => expect(dialogs()).toHaveLength(0))
    expect(peek()).toBeNull()
  })

  /**
   * jsdom implements no Web Animations API, so Base UI unmounts a closing popup
   * IMMEDIATELY (useAnimationsFinished's `typeof getAnimations !== 'function'`
   * fast path). That hides the browser's ~100ms `data-closed:animate-out`, and a
   * surface left mounted through it is a second `aria-modal` node sitting under
   * the palette for the whole transition — exactly the state C5 is about, and
   * one no ordinary test in this suite can see. So model the browser: an
   * animation that never finishes.
   */
  function withExitAnimations(body: () => Promise<void>) {
    const proto = Element.prototype as unknown as { getAnimations?: () => unknown[] }
    const had = Object.prototype.hasOwnProperty.call(proto, 'getAnimations')
    proto.getAnimations = () => [{ finished: new Promise(() => {}) }]
    return body().finally(() => {
      if (!had) delete proto.getAnimations
    })
  }

  it('does not stack on a ? sheet that is still fading out', async () => {
    await withExitAnimations(async () => {
      render(<CalendarCanvas {...base} view="week" />)
      fireEvent.click(screen.getByRole('button', { name: /keyboard shortcuts/i }))
      await screen.findByRole('dialog', { name: /keyboard shortcuts/i })
      fireEvent.keyDown(window, { key: 'k', metaKey: true })
      await screen.findByRole('combobox')
      expect(dialogs()).toHaveLength(1)
    })
  })

  it('does not stack on a peek that is still fading out', async () => {
    await withExitAnimations(async () => {
      render(<CalendarCanvas {...base} view="week" />)
      fireEvent.click(chipFor('event:e1'))
      expect(peek()).not.toBeNull()
      fireEvent.keyDown(window, { key: 'k', metaKey: true })
      await screen.findByRole('combobox')
      expect(dialogs()).toHaveLength(1)
    })
  })

  it('does not let the ? sheet open over a palette that is still fading out', async () => {
    // The mirror image, and the reason all three overlays mount only while
    // open rather than just the two ⌘K can replace: `onCockpitKeyDown` stands
    // down while `paletteOpen`, so the moment ⌘K flips it false the `?` key is
    // live again — over a palette the browser would still be animating away.
    await withExitAnimations(async () => {
      render(<CalendarCanvas {...base} view="week" />)
      fireEvent.keyDown(window, { key: 'k', metaKey: true })
      await screen.findByRole('combobox')
      fireEvent.keyDown(window, { key: 'k', metaKey: true })
      await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())

      const cockpit = document.querySelector<HTMLElement>('[data-slot="calendar-cockpit"]')!
      fireEvent.keyDown(cockpit, { key: '?' })
      await screen.findByRole('dialog', { name: /keyboard shortcuts/i })
      expect(dialogs()).toHaveLength(1)
    })
  })

  it('an ordinary close still restores focus AFTER a supersede has happened', async () => {
    // The "do not restore" flag is set for exactly one close and cleared in the
    // commit that follows it. Left set, the very next ordinary Escape out of a
    // peek would silently stop returning focus to its chip — a regression the
    // supersede tests alone cannot see, because they never close a surface
    // normally afterwards.
    render(<CalendarCanvas {...base} view="week" />)

    // 1. supersede a peek with ⌘K, then close the palette.
    const chip = chipFor('event:e1')
    chip.focus()
    fireEvent.click(chip)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const box = (await screen.findByRole('combobox')) as HTMLElement
    fireEvent.keyDown(box, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())

    // 2. open the peek again, the ordinary way, and close it the ordinary way.
    const again = chipFor('event:e1')
    again.focus()
    fireEvent.click(again)
    expect(peek()).not.toBeNull()
    // Focus INSIDE the peek, where the browser puts it. jsdom leaves it on the
    // chip, and a peek that has stopped restoring focus altogether then looks
    // identical to one that restored correctly.
    document.querySelector<HTMLElement>('[data-slot="peek-record"]')!.focus()
    fireEvent.keyDown(peek()!, { key: 'Escape' })
    await waitFor(() => expect(peek()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(again))
  })

  it('the ? sheet still returns focus to its trigger on an ordinary Escape', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    const trigger = screen.getByRole('button', { name: /keyboard shortcuts/i })
    trigger.focus()
    fireEvent.click(trigger)
    const sheet = await screen.findByRole('dialog', { name: /keyboard shortcuts/i })
    within(sheet).getByRole('button', { name: /close/i }).focus()
    fireEvent.keyDown(sheet, { key: 'Escape' })
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /keyboard shortcuts/i })).toBeNull()
    )
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('still toggles itself closed on a second ⌘K', async () => {
    render(<CalendarCanvas {...base} view="week" />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await screen.findByRole('combobox')
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())
  })

  it('still opens over a NON-modal dismiss layer — a bulk selection must not kill ⌘K', async () => {
    // The guard is deliberately NOT `dismissLayerCount() > 0`. That counts every
    // dismissible surface, modal or not, and an agenda bulk selection registers
    // one (AgendaView's `useDismissLayer`). Standing ⌘K down for it would kill
    // search in a completely ordinary state.
    render(<CalendarCanvas {...base} view="agenda" />)
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(dismissLayerCount()).toBe(1)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const box = await screen.findByRole('combobox')
    expect(box).toBeInTheDocument()
    // The selection is untouched — the palette layered ON it, it did not replace it.
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(dismissLayerCount()).toBe(2)
  })
})

describe('peek — what it says', () => {
  it('names the kind, the day, the hours and both exits', () => {
    render(<CalendarCanvas {...base} view="week" />)
    fireEvent.click(chipFor('event:e1'))
    const panel = peek()!

    expect(within(panel).getByText(/Booked event/)).toBeInTheDocument()
    // UTC-anchored and deterministic — never the host machine's timezone.
    expect(within(panel).getByText(/Wednesday, 19 August 2099 · 4p–8p/)).toBeInTheDocument()
    expect(within(panel).getByText('Harper & Cole')).toBeInTheDocument()
    expect(within(panel).getByText('$2,400')).toBeInTheDocument()
    expect(within(panel).getByText('120')).toBeInTheDocument()

    expect(within(panel).getByRole('link', { name: /open the job/i })).toHaveAttribute(
      'href',
      '/acme/harper/dashboard'
    )
    expect(within(panel).getByRole('link', { name: /open wednesday, 19 august 2099/i })).toHaveAttribute(
      'href',
      '/acme/calendar/2099-08-19?view=week'
    )
    // The address is a directions target, not just text.
    expect(within(panel).getByRole('link', { name: /the barn/i })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=The%20Barn%2C%2012%20Mill%20Rd'
    )
  })

  it('says a hold is a hold', () => {
    render(<CalendarCanvas {...base} view="agenda" />)
    fireEvent.click(chipFor('lead:l1'))
    const panel = peek()!
    expect(within(panel).getByText(/hold, not booked/i)).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: /open the opportunity/i })).toBeInTheDocument()
  })

  it('every animated element in it is switched off under prefers-reduced-motion', () => {
    render(<CalendarCanvas {...base} view="week" />)
    fireEvent.click(chipFor('event:e1'))
    const popup = document.querySelector<HTMLElement>('[data-slot="dialog-content"]')!
    const backdrop = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')!
    expect(popup.className).toContain('motion-reduce:animate-none')
    expect(backdrop.className).toContain('motion-reduce:animate-none')

    // Nothing inside may introduce motion of its own without a guard. This is
    // the check that survives a future edit to the panel's contents.
    const own = popup.querySelector<HTMLElement>('[data-slot="item-peek"]')!
    const animated = Array.from(own.querySelectorAll<HTMLElement>('*')).filter((el) =>
      /(^|\s)(transition-|animate-)/.test(el.className)
    )
    for (const el of animated) {
      expect(el.className).toMatch(/motion-reduce:(transition-none|animate-none)/)
    }
  })
})

describe('peek — it never duplicates the day spine', () => {
  const wide = (matches: boolean) => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) =>
        ({
          media: query,
          matches: matches && query.includes('1024px'),
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    })
  }

  it('stands down for an item on the open spine day when the spine is beside the grid', () => {
    wide(true)
    pathname = '/acme/calendar/2099-08-19'
    render(<CalendarCanvas {...base} view="week" selectedDay="2099-08-19" />)
    fireEvent.click(chipFor('event:e1'))
    // No modal restating a pane that is permanently on screen 300px to the right.
    expect(peek()).toBeNull()
  })

  it('still peeks at an item on ANY OTHER day, spine or no spine', () => {
    wide(true)
    pathname = '/acme/calendar/2099-08-19'
    render(<CalendarCanvas {...base} view="week" selectedDay="2099-08-19" />)
    fireEvent.click(chipFor('lead:l1'))
    expect(peek()).toBeInTheDocument()
  })

  it('peeks at the spine day’s own item when the spine is stacked out of sight', () => {
    // Below `lg` the spine is under the grid, off-screen — there is nothing to
    // duplicate, so the peek is the only in-place answer available.
    wide(false)
    pathname = '/acme/calendar/2099-08-19'
    render(<CalendarCanvas {...base} view="week" selectedDay="2099-08-19" />)
    fireEvent.click(chipFor('event:e1'))
    expect(peek()).toBeInTheDocument()
  })
})
