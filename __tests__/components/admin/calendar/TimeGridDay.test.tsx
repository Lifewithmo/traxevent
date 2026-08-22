import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import {
  TimeGridDay,
  layoutTimed,
  maxLanesFor,
  PX_PER_HOUR,
  DAY_START_HOUR,
  DAY_END_HOUR,
  MIN_ITEM_PX,
  MIN_TARGET_PX,
  MIN_LANE_INSET_PX,
  laneInsetFor,
  DEFAULT_BODY_WIDTH_PX,
  DEFAULT_BUSINESS_HOURS,
} from '@/components/admin/calendar/TimeGridDay'
import type { CalendarItem } from '@/lib/calendar'

// W3-J: these grids now import the reschedule engine, which imports its server
// action; without the mock the real module pulls in firebase-admin at load time.
vi.mock('@/actions/calendar-bulk', () => ({
  bulkRescheduleAgenda: vi.fn().mockResolvedValue({ moved: 0, failures: [] }),
  rescheduleCalendarItem: vi.fn().mockResolvedValue({ moved: 1, failures: [] }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))


const day = '2026-08-22'
// Every test runs on a pinned local clock so the now-line is deterministic:
// 2026-08-22 14:30 local = the `day` above, mid-window.
const PINNED_NOW = new Date(2026, 7, 22, 14, 30, 0)

beforeEach(() => {
  // Only Date is faked — setInterval stays real so RTL cleanup can clear it.
  vi.useFakeTimers({ now: PINNED_NOW, toFake: ['Date'] })
})
afterEach(() => {
  vi.useRealTimers()
})

const items: CalendarItem[] = [
  { id: 'e1', title: 'Wedding', date: day, kind: 'event', href: '/acme/wedding/dashboard', start: '16:00', end: '21:00', headcount: 120 },
  { id: 'e2', title: 'Backyard job', date: day, kind: 'event', href: '/acme/backyard/dashboard' }, // no hours
  { id: 'i1', title: 'Deposit invoice', date: day, kind: 'invoice_due', href: '/acme/leads/l1', amount: 500 },
  { id: 'c1', title: 'Permit expires', date: day, kind: 'compliance', href: '/acme/compliance', blocker: true },
  { id: 't1', title: 'Confirm rentals', date: day, kind: 'task', href: '/acme/leads/l2' },
  { id: 'd1', title: 'Drop pickup: Sunday box', date: day, kind: 'drop', href: '/acme/drop-orders/d1', start: '10:00', end: '12:00' },
]

const bandOf = (c: HTMLElement) => within(c.querySelector('[data-slot="all-day-band"]') as HTMLElement)
const bodyOf = (c: HTMLElement) => within(c.querySelector('[data-slot="time-grid-body"]') as HTMLElement)

/** Inline geometry as a number ('0' and '0px' both read 0). */
function pxOf(el: HTMLElement, prop: 'top' | 'left' | 'right' | 'height'): number {
  return Number.parseFloat(el.style[prop] || '0')
}

function chipsIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-slot="grid-item"]'))
}

/** The chip's VISIBLE time line (the sr-only label carries the hours too). */
function visibleTimeLine(chip: HTMLElement): string | null {
  return chip.querySelector('[data-slot="chip-time"]')?.textContent ?? null
}

/** Force the measured body width jsdom otherwise reports as 0. */
function withBodyWidth(width: number, fn: () => void) {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function () {
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  }
  try {
    fn()
  } finally {
    Element.prototype.getBoundingClientRect = original
  }
}

describe('TimeGridDay', () => {
  it('positions a timed event on the grid by its start hour and duration', () => {
    render(<TimeGridDay orgSlug="acme" ymd={day} items={items} />)
    const wedding = screen.getByText('Wedding').closest('a')!
    expect(wedding).toHaveStyle({ top: `${(16 - DAY_START_HOUR) * PX_PER_HOUR}px` })
    // 16:00 → 21:00 is five hours tall
    expect(wedding).toHaveStyle({ height: `${5 * PX_PER_HOUR}px` })
  })

  it('places a drop pickup window on the time grid at its start', () => {
    const { container } = render(<TimeGridDay orgSlug="acme" ymd={day} items={items} />)
    const drop = bodyOf(container).getByText(/Sunday box/).closest('a')!
    expect(drop).toHaveStyle({ top: `${(10 - DAY_START_HOUR) * PX_PER_HOUR}px` })
  })

  it('shows an event lacking hours in the all-day band as "time TBD"', () => {
    const { container } = render(<TimeGridDay orgSlug="acme" ymd={day} items={items} />)
    expect(bandOf(container).getByText('Backyard job')).toBeInTheDocument()
    expect(bandOf(container).getByText(/time tbd/i)).toBeInTheDocument()
    // it must NOT be positioned on the grid
    expect(bodyOf(container).queryByText('Backyard job')).not.toBeInTheDocument()
  })

  it('keeps due-that-day kinds (invoice/compliance/task) in the all-day band, never the grid', () => {
    const { container } = render(<TimeGridDay orgSlug="acme" ymd={day} items={items} />)
    for (const label of ['Deposit invoice', 'Permit expires', 'Confirm rentals']) {
      expect(bandOf(container).getByText(label)).toBeInTheDocument()
      expect(bodyOf(container).queryByText(label)).not.toBeInTheDocument()
    }
    // an invoice keeps its amount in the band
    expect(bandOf(container).getByText(/\$500/)).toBeInTheDocument()
  })

  it('renders a single specific CTA when the day is empty', () => {
    render(<TimeGridDay orgSlug="acme" ymd={day} items={[]} />)
    expect(screen.getByText(/nothing scheduled/i)).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /book a job/i })
    // prefilled with the day it was launched from (anticipation)
    expect(cta).toHaveAttribute('href', '/acme/new-event?date=2026-08-22')
  })
})

describe('TimeGridDay — lanes are packed on rendered geometry, not raw hours', () => {
  /** Two chips may only share a lane if their PAINTED boxes are disjoint.
   *  Returns how many on-screen overlaps it checked, so the caller can prove
   *  the case is not vacuous. */
  function assertLanesSeparateOverlaps(els: HTMLElement[]): number {
    const boxes = els.map((el) => ({
      lane: el.dataset.lane,
      top: pxOf(el, 'top'),
      bottom: pxOf(el, 'top') + pxOf(el, 'height'),
      label: el.textContent ?? '',
    }))
    let overlaps = 0
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        if (a.top < b.bottom && b.top < a.bottom) {
          overlaps += 1
          expect(
            a.lane,
            `"${a.label}" [${a.top},${a.bottom}] and "${b.label}" [${b.top},${b.bottom}] overlap on screen but share lane ${a.lane}`
          ).not.toBe(b.lane)
        }
      }
    }
    return overlaps
  }

  it('never paints three consecutive 15-minute drop windows on top of each other', () => {
    // The reported defect: these three do NOT overlap in time, so raw-hour lane
    // assignment gave all three lane 0 — but the min-height floor inflates each
    // box past its own slot, so they collided on screen.
    const windows: CalendarItem[] = [
      { id: 'w1', title: 'Pickup 10:00', date: day, kind: 'drop', href: '/acme/w1', start: '10:00', end: '10:15' },
      { id: 'w2', title: 'Pickup 10:15', date: day, kind: 'drop', href: '/acme/w2', start: '10:15', end: '10:30' },
      { id: 'w3', title: 'Pickup 10:30', date: day, kind: 'drop', href: '/acme/w3', start: '10:30', end: '10:45' },
    ]
    const { container } = render(<TimeGridDay orgSlug="acme" ymd={day} items={windows} />)
    const els = chipsIn(container)
    expect(els).toHaveLength(3)
    // Every box is floored, so at least one pair really does overlap on screen —
    // this is what makes the lane assertion below meaningful rather than vacuous.
    const overlaps = assertLanesSeparateOverlaps(els)
    expect(overlaps).toBeGreaterThan(0)
  })

  it('keeps a whole morning of back-to-back 15-minute windows collision-free', () => {
    const windows: CalendarItem[] = Array.from({ length: 8 }, (_, i) => {
      const m = i * 15
      const hh = 9 + Math.floor(m / 60)
      const mm = m % 60
      const eh = 9 + Math.floor((m + 15) / 60)
      const em = (m + 15) % 60
      const two = (n: number) => String(n).padStart(2, '0')
      return {
        id: `w${i}`,
        title: `Window ${i}`,
        date: day,
        kind: 'drop' as const,
        href: `/acme/w${i}`,
        start: `${two(hh)}:${two(mm)}`,
        end: `${two(eh)}:${two(em)}`,
      }
    })
    const { container } = render(<TimeGridDay orgSlug="acme" ymd={day} items={windows} />)
    const els = chipsIn(container)
    expect(els).toHaveLength(8)
    expect(assertLanesSeparateOverlaps(els)).toBeGreaterThan(0)
  })

  it('lays genuinely overlapping items into offset lanes that both stay reachable', () => {
    const overlap: CalendarItem[] = [
      { id: 'ev', title: 'Ceremony', date: day, kind: 'event', href: '/acme/ev', start: '16:00', end: '18:00' },
      { id: 'dr', title: 'Pickup window', date: day, kind: 'drop', href: '/acme/dr', start: '17:00', end: '19:00' },
    ]
    const { container } = render(<TimeGridDay orgSlug="acme" ymd={day} items={overlap} />)
    const ceremony = screen.getByText('Ceremony').closest('a') as HTMLElement
    const pickup = screen.getByText('Pickup window').closest('a') as HTMLElement
    // Lane 0 runs the full width; lane 1 is inset and also runs to the right
    // edge, so the inset IS the grab strip lane 0 keeps to itself.
    const inset = laneInsetFor(DEFAULT_BODY_WIDTH_PX, 2)
    expect(inset).toBeGreaterThanOrEqual(MIN_LANE_INSET_PX)
    expect(pxOf(ceremony, 'left')).toBe(0)
    expect(pxOf(pickup, 'left')).toBe(inset)
    for (const el of [ceremony, pickup]) {
      expect(pxOf(el, 'right')).toBe(0)
      expect(el.tagName).toBe('A')
    }
    expect(assertLanesSeparateOverlaps(chipsIn(container))).toBe(1)
  })

  it('gives non-overlapping items the full column width', () => {
    const apart: CalendarItem[] = [
      { id: 'a', title: 'Morning', date: day, kind: 'event', href: '/acme/a', start: '09:00', end: '10:00' },
      { id: 'b', title: 'Noon', date: day, kind: 'event', href: '/acme/b', start: '11:00', end: '12:00' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={apart} />)
    for (const label of ['Morning', 'Noon']) {
      const el = screen.getByText(label).closest('a') as HTMLElement
      expect(pxOf(el, 'left')).toBe(0)
      expect(pxOf(el, 'right')).toBe(0)
    }
  })

  it('flags an item with end <= start instead of silently collapsing', () => {
    const bad: CalendarItem[] = [
      { id: 'x', title: 'Reversed', date: day, kind: 'event', href: '/acme/x', start: '18:00', end: '16:00' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={bad} />)
    expect(screen.getByText('Reversed').closest('a')).toHaveAttribute('data-invalid-hours', 'true')
  })
})

describe('TimeGridDay — target size (WCAG 2.5.8)', () => {
  const twoLanes: CalendarItem[] = [
    { id: 'a', title: 'A', date: day, kind: 'event', href: '/acme/a', start: '10:00', end: '12:00' },
    { id: 'b', title: 'B', date: day, kind: 'event', href: '/acme/b', start: '11:00', end: '13:00' },
  ]
  const threeLanes: CalendarItem[] = [
    ...twoLanes,
    { id: 'c', title: 'C', date: day, kind: 'drop', href: '/acme/c', start: '11:30', end: '12:30' },
  ]

  // At a 375px viewport the Day view's body is the viewport minus the 48px
  // hours gutter; a Week view column is that width split seven ways — the
  // ~47px column where the old `100 / laneCount` percentage produced 23px
  // (2 lanes) and 15px (3 lanes) slivers.
  const DAY_BODY_375 = 375 - 48
  const WEEK_COL_375 = (375 - 48) / 7

  for (const [name, width] of [
    ['the day body', DAY_BODY_375],
    ['a week column', WEEK_COL_375],
  ] as const) {
    for (const [lanes, feed] of [
      [2, twoLanes],
      [3, threeLanes],
    ] as const) {
      it(`floors every rendered chip to ${MIN_TARGET_PX}px wide in ${name} at 375px with ${lanes} lanes`, () => {
        const layout = layoutTimed(feed, DAY_START_HOUR, DAY_END_HOUR, width)
        expect(layout.placed.length).toBeGreaterThan(0)
        for (const p of layout.placed) {
          // Chips render `left: leftPx; right: 0`, so this IS the painted width.
          const rendered = width - p.leftPx
          expect(rendered, `lane ${p.lane} chip is ${rendered.toFixed(1)}px wide`).toBeGreaterThanOrEqual(
            Math.min(MIN_TARGET_PX, width)
          )
        }
        // Each chip also keeps its own uncovered grab strip — the gap to the
        // lane stacked on top of it — so every one stays separately tappable.
        const lefts = [...new Set(layout.placed.map((p) => p.leftPx))].sort((a, b) => a - b)
        for (let i = 1; i < lefts.length; i++) {
          expect(lefts[i] - lefts[i - 1]).toBeGreaterThanOrEqual(Math.min(MIN_TARGET_PX, width))
        }
        // Nothing is dropped on the floor: anything the width cannot host is
        // accounted for by a +N chip.
        const shown = layout.placed.length
        const spilled = layout.overflow.reduce((n, o) => n + o.count, 0)
        expect(shown + spilled).toBe(feed.length)
      })
    }
  }

  it('caps lanes at what the body can host and offers the surplus as a +N link', () => {
    const layout = layoutTimed(threeLanes, DAY_START_HOUR, DAY_END_HOUR, WEEK_COL_375)
    expect(maxLanesFor(WEEK_COL_375)).toBe(1)
    expect(layout.placed).toHaveLength(1)
    expect(layout.overflow).toHaveLength(1)
    expect(layout.overflow[0].count).toBe(2)
  })

  it('renders the +N chip as its own activatable link into the day view', () => {
    withBodyWidth(WEEK_COL_375, () => {
      const { container } = render(
        <TimeGridDay orgSlug="acme" ymd={day} items={threeLanes} section="body" />
      )
      // one chip fits the column; the other two are represented, not dropped
      expect(chipsIn(container)).toHaveLength(1)
      const more = container.querySelector('[data-slot="grid-overflow"]') as HTMLElement
      expect(more.tagName).toBe('A')
      expect(more).toHaveAttribute('href', `/acme/calendar/${day}`)
      expect(more).toHaveTextContent('+2')
      // anchored at the topmost item it stands in for (11:00)
      expect(pxOf(more, 'top')).toBe((11 - DAY_START_HOUR) * PX_PER_HOUR)
    })
  })

  it('floors a short window to the AA target height without inflating it to 44px', () => {
    const tiny: CalendarItem[] = [
      { id: 't', title: 'Quick drop', date: day, kind: 'drop', href: '/acme/t', start: '10:00', end: '10:15' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={tiny} />)
    const el = screen.getByText('Quick drop').closest('a') as HTMLElement
    expect(pxOf(el, 'height')).toBe(MIN_ITEM_PX)
    expect(MIN_ITEM_PX).toBeGreaterThanOrEqual(24)
    // The old 44px floor claimed 55 minutes for a 15-minute window.
    expect(MIN_ITEM_PX).toBeLessThan(44)
  })

  it('drops the redundant time line on a short chip but keeps the hours reachable', () => {
    const tiny: CalendarItem[] = [
      { id: 't', title: 'Quick drop', date: day, kind: 'drop', href: '/acme/t', start: '10:00', end: '10:15' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={tiny} />)
    const el = screen.getByText('Quick drop').closest('a') as HTMLElement
    // No visible second line — vertical position already encodes the time…
    expect(visibleTimeLine(el)).toBeNull()
    // …but the hours are still in the accessible name and the tooltip.
    expect(el).toHaveAttribute('title', '10a–10:15a')
    expect(el).toHaveAccessibleName(/10a–10:15a/)
  })

  it('keeps the time line on a chip tall enough to carry it', () => {
    const long: CalendarItem[] = [
      { id: 'l', title: 'Wedding', date: day, kind: 'event', href: '/acme/l', start: '16:00', end: '21:00' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={long} />)
    const el = screen.getByText('Wedding').closest('a') as HTMLElement
    expect(visibleTimeLine(el)).toMatch(/4p–9p/)
  })
})

describe('TimeGridDay — now line, scroll-to-now, business hours', () => {
  it('renders a now indicator on today', () => {
    const { container } = render(<TimeGridDay orgSlug="acme" ymd={day} items={items} />)
    const now = container.querySelector('[data-slot="now-line"]') as HTMLElement
    expect(now).toBeTruthy()
    // 14:30 against a 6am grid start
    expect(pxOf(now, 'top')).toBe((14.5 - DAY_START_HOUR) * PX_PER_HOUR)
    expect(within(now).getByText(/current time/i)).toBeInTheDocument()
  })

  it('renders no now indicator on any other day', () => {
    const other = '2026-08-25'
    const otherItems = items.map((i) => ({ ...i, date: other }))
    const { container } = render(<TimeGridDay orgSlug="acme" ymd={other} items={otherItems} />)
    expect(container.querySelector('[data-slot="now-line"]')).toBeNull()
  })

  it('never animates the now indicator', () => {
    const { container } = render(<TimeGridDay orgSlug="acme" ymd={day} items={items} />)
    const now = container.querySelector('[data-slot="now-line"]') as HTMLElement
    expect(now.className).not.toMatch(/animate|transition/)
  })

  it('scrolls the now indicator into view on mount', () => {
    const spy = vi.fn()
    // jsdom has no scrollIntoView; the component feature-detects it.
    ;(Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView = spy
    try {
      render(<TimeGridDay orgSlug="acme" ymd={day} items={items} />)
      expect(spy).toHaveBeenCalledTimes(1)
      // instant, never 'smooth' — nothing to animate under reduced motion
      expect(spy.mock.calls[0][0]).toEqual({ block: 'center' })
    } finally {
      delete (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView
    }
  })

  it('is absent from the server HTML and hydrates without a mismatch', async () => {
    const node = <TimeGridDay orgSlug="acme" ymd={day} items={items} />
    const html = renderToString(node)
    // The now-line depends on the client clock, so the server must not emit it.
    expect(html).not.toContain('now-line')

    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errors.push(String(a[0]))
    })
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(host, node)
    })
    spy.mockRestore()
    expect(errors.filter((e) => /hydrat|did not match|Text content/i.test(e))).toEqual([])
    // …and once mounted it appears.
    expect(host.querySelector('[data-slot="now-line"]')).toBeTruthy()
    await act(async () => {
      root?.unmount()
    })
    host.remove()
  })

  it('shades the hours outside the org business window', () => {
    const { container } = render(<TimeGridDay orgSlug="acme" ymd={day} items={items} />)
    const before = container.querySelector('[data-slot="off-hours"][data-edge="before"]') as HTMLElement
    const after = container.querySelector('[data-slot="off-hours"][data-edge="after"]') as HTMLElement
    // default 08:00–18:00 against a 6am–10pm grid
    expect(DEFAULT_BUSINESS_HOURS).toEqual({ start: '08:00', end: '18:00' })
    expect(pxOf(before, 'top')).toBe(0)
    expect(pxOf(before, 'height')).toBe((8 - DAY_START_HOUR) * PX_PER_HOUR)
    expect(pxOf(after, 'top')).toBe((18 - DAY_START_HOUR) * PX_PER_HOUR)
    expect(pxOf(after, 'height')).toBe((DAY_END_HOUR - 18) * PX_PER_HOUR)
  })

  it('honours a custom org business_hours setting', () => {
    const { container } = render(
      <TimeGridDay orgSlug="acme" ymd={day} items={items} businessHours={{ start: '06:00', end: '14:00' }} />
    )
    expect(container.querySelector('[data-slot="off-hours"][data-edge="before"]')).toBeNull()
    const after = container.querySelector('[data-slot="off-hours"][data-edge="after"]') as HTMLElement
    expect(pxOf(after, 'top')).toBe((14 - DAY_START_HOUR) * PX_PER_HOUR)
  })
})

describe('TimeGridDay — items outside the rendered window are never silently clamped', () => {
  it('flags an item running past day-end and keeps its real hours on the chip', () => {
    const late: CalendarItem[] = [
      { id: 'l', title: 'Late night', date: day, kind: 'event', href: '/acme/l', start: '21:00', end: '23:00' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={late} />)
    const el = screen.getByText('Late night').closest('a') as HTMLElement
    expect(el).toHaveAttribute('data-clipped', 'bottom')
    // the TRUE end time, not the 10pm the box stops at
    expect(visibleTimeLine(el)).toMatch(/9p–11p/)
    expect(el).toHaveAccessibleName(/runs outside the hours shown/i)
  })

  it('flags an item starting before day-start and keeps its real hours on the chip', () => {
    const early: CalendarItem[] = [
      { id: 'e', title: 'Load in', date: day, kind: 'event', href: '/acme/e', start: '06:00', end: '10:00' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={early} dayStartHour={8} dayEndHour={22} />)
    const el = screen.getByText('Load in').closest('a') as HTMLElement
    expect(pxOf(el, 'top')).toBe(0)
    expect(el).toHaveAttribute('data-clipped', 'top')
    expect(visibleTimeLine(el)).toMatch(/6a–10a/)
  })

  it('still states the hours of an item that falls entirely outside the window', () => {
    const overnight: CalendarItem[] = [
      { id: 'o', title: 'Teardown', date: day, kind: 'event', href: '/acme/o', start: '23:00', end: '23:45' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={overnight} />)
    const el = screen.getByText('Teardown').closest('a') as HTMLElement
    expect(el).toHaveAttribute('data-clipped', 'bottom')
    expect(visibleTimeLine(el)).toMatch(/11p–11:45p/)
  })

  it('leaves an in-window item unflagged', () => {
    render(<TimeGridDay orgSlug="acme" ymd={day} items={items} />)
    const el = screen.getByText('Wedding').closest('a') as HTMLElement
    expect(el).not.toHaveAttribute('data-clipped')
  })
})

describe('TimeGridDay — accessibility & polish', () => {
  it('names the kind for assistive tech, not colour alone', () => {
    const { container } = render(<TimeGridDay orgSlug="acme" ymd={day} items={items} />)
    // the compliance chip carries its kind name in its accessible label
    expect(bandOf(container).getByRole('link', { name: /Compliance/ })).toBeInTheDocument()
    // a timed grid item does too
    expect(bodyOf(container).getByRole('link', { name: /Booked event/ })).toBeInTheDocument()
  })

  it('gives band chips a touch-safe min height', () => {
    const { container } = render(<TimeGridDay orgSlug="acme" ymd={day} items={items} />)
    const chip = bandOf(container).getByText('Deposit invoice').closest('a')!
    expect(chip).toHaveClass('min-h-6')
  })

  it('suppresses the per-cell "nothing all-day" placeholder in the week band section', () => {
    render(<TimeGridDay orgSlug="acme" ymd={day} items={[]} section="band" />)
    expect(screen.queryByText(/nothing all-day/i)).not.toBeInTheDocument()
  })

  it('keeps the "nothing all-day" hint on the single day view', () => {
    const timedOnly: CalendarItem[] = [
      { id: 'e1', title: 'Wedding', date: day, kind: 'event', href: '/acme/w', start: '16:00', end: '18:00' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={timedOnly} section="all" withGutter />)
    expect(screen.getByText(/nothing all-day/i)).toBeInTheDocument()
  })
})
