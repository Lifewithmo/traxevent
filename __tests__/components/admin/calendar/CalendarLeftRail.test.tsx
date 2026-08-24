import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { WeekRollup } from '@/lib/calendar-week'
import type { RunwayJob } from '@/lib/calendar-cashflow'
import { CALENDAR_KINDS, CALENDAR_KIND_LABELS } from '@/lib/calendar'
import type { UnscheduledRow } from '@/lib/calendar-unscheduled'
import type { BookabilityCtx } from '@/lib/calendar-bookability'

// The rail preserves ?view/?kinds by reading them client-side (a server layout
// can't take searchParams). Selected day comes from the /calendar/[ymd] path.
let pathname = '/acme/calendar/2026-08-20'
// A STALE week param is in the URL (the week of Jul 30–Aug 5), different from the
// days the rail links to — day-targeting links must not forward it.
const search = new URLSearchParams('view=week&kinds=pipeline&week=2026-08-03')
vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
  usePathname: () => pathname,
}))

import { CalendarLeftRail } from '@/components/admin/calendar/CalendarLeftRail'

function rollup(overrides: Partial<WeekRollup> = {}): WeekRollup {
  return {
    eventCount: 0,
    guestCount: 0,
    tentativeCount: 0,
    taskCount: 0,
    dueAmount: 0,
    overdueDueAmount: 0,
    blockerCount: 0,
    bookedValue: 0,
    ...overrides,
  }
}

const runway: RunwayJob[] = [
  {
    eventId: 'e1', title: 'Alder wedding', date: '2026-08-22', pastDue: 0, inflowBefore: 8000,
    dueAfter: 2000, contributions: [], billing: 'outstanding', untimedOwed: 0, leadId: 'L1',
    boothFee: 150, windowFrom: '2026-08-18', carriedIn: 0, cashIn: 8000, cashInThisJob: 8000,
    cashInOther: 0, agedAr: 0, cumulative: 7850, firstShortfall: false,
  },
]

const baseProps = { orgSlug: 'acme', today: '2026-08-18' }

/** Enough context for the rail to draw the next-open line and the bookability
 *  key. The verdict maths itself is covered in bookability-render.test.tsx. */
const bookCtx: BookabilityCtx = {
  today: '2026-08-18',
  prepLeadDays: 14,
  orgSlug: 'acme',
  radar: { mode: 'degraded', conflictDates: [], bookedCounts: {} },
}

// Same list the rail traps Tab against.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// jsdom has no matchMedia, and the rail has to know its breakpoint in JS
// (`inert` is an attribute, not something CSS can toggle). Default: desktop.
let belowMd = false
function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) =>
      ({
        media: query,
        get matches() {
          return belowMd
        },
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  })
}

function panelOf(): HTMLElement {
  const el = document.getElementById('calendar-left-rail')
  if (!el) throw new Error('rail panel not found')
  return el
}

describe('CalendarLeftRail', () => {
  beforeEach(() => {
    pathname = '/acme/calendar/2026-08-20'
    belowMd = false
    stubMatchMedia()
    // The Unscheduled disclosure persists its collapsed state; a test that
    // collapses it must not decide the next test's starting shape.
    window.localStorage.clear()
  })

  it('surfaces the Booked-$ KPI from rollup.bookedValue', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup({ bookedValue: 12400 })} runway={runway} />)
    // The five tiles are one tap away now (see the composition block below);
    // the value itself is never hidden — it rides the collapsed summary too.
    expect(screen.getByText('$12,400')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    expect(screen.getByText('Booked')).toBeInTheDocument()
    expect(screen.getAllByText('$12,400').length).toBeGreaterThan(0)
  })

  it('renders the runway strip fed by buildRunway output', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    expect(screen.getByText('Alder wedding')).toBeInTheDocument()
    expect(screen.getByText('$8,000')).toBeInTheDocument()
  })

  it('mini-month day links preserve ?view and ?kinds and route to /calendar/[ymd]', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    // The rail shows the selected day's month (Aug 2026).
    const grid = screen.getByRole('group', { name: /mini calendar/i })
    const cell = within(grid).getByRole('link', { name: /15/ })
    expect(cell).toHaveAttribute('href', '/acme/calendar/2026-08-15?view=week&kinds=pipeline')
  })

  it('does NOT forward a stale ?week onto day-targeting links (mini-month + runway)', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    const grid = screen.getByRole('group', { name: /mini calendar/i })
    const cell = within(grid).getByRole('link', { name: /15/ }) as HTMLAnchorElement
    // the URL carries week=2026-08-03, but the clicked day is in a different week —
    // forwarding it would make page.tsx render Jul 30–Aug 5 with the 15th invisible.
    expect(cell.getAttribute('href')).not.toContain('week=')
    const runwayRow = screen.getByText('Alder wedding').closest('a') as HTMLAnchorElement
    expect(runwayRow.getAttribute('href')).not.toContain('week=')
    expect(runwayRow.getAttribute('href')).toBe('/acme/calendar/2026-08-22?view=week&kinds=pipeline')
  })

  it('marks the selected day in the mini-month', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    const grid = screen.getByRole('group', { name: /mini calendar/i })
    const cell = within(grid).getByRole('link', { name: /^20$/ })
    expect(cell).toHaveAttribute('aria-current', 'date')
  })

  it('kind filter preserves the day and view while toggling scope', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    const everything = screen.getByRole('link', { name: /everything/i })
    // toggling back to Everything drops ?kinds but keeps the day + view
    expect(everything).toHaveAttribute('href', '/acme/calendar/2026-08-20?view=week')
    const pipeline = screen.getByRole('link', { name: /pipeline only/i })
    expect(pipeline).toHaveAttribute('aria-current', 'page')
  })

  it('offers an ICS subscribe entry point that reveals the feed URL', () => {
    render(
      <CalendarLeftRail
        {...baseProps}
        rollup={rollup()}
        runway={runway}
        subscribeUrl="https://app.example/ics/acme/tok123"
      />
    )
    expect(screen.queryByText(/calendar sync/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }))
    expect(screen.getByText(/calendar sync/i)).toBeInTheDocument()
    expect(screen.getByText('https://app.example/ics/acme/tok123')).toBeInTheDocument()
  })

  it('keeps the rail controls reachable on mobile via an off-canvas drawer', () => {
    render(
      <CalendarLeftRail
        {...baseProps}
        rollup={rollup()}
        runway={runway}
        subscribeUrl="https://app.example/ics/acme/tok123"
      />
    )
    const trigger = screen.getByRole('button', { name: /open calendar panel/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // the controls are rendered (the drawer makes them reachable, not a dead-end)
    expect(screen.getByRole('link', { name: /everything/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /subscribe/i })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /mini calendar/i })).toBeInTheDocument()
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  // ── WCAG 2.4.3 Focus Order / 2.4.7 Focus Visible ──────────────────────────
  // The drawer was "hidden" by `-translate-x-full` alone: still rendered, still
  // focusable, ~40 controls collecting Tab stops off the left edge of a phone.
  describe('mobile drawer focus management', () => {
    beforeEach(() => {
      belowMd = true
    })

    it('takes the closed drawer out of the tab order with inert', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
      const panel = panelOf()
      expect(panel).toHaveAttribute('inert')
      // Not a token gesture — there really are a lot of stops behind it.
      expect(panel.querySelectorAll(FOCUSABLE).length).toBeGreaterThan(20)
    })

    it('drops inert the moment the drawer opens', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
      fireEvent.click(screen.getByRole('button', { name: /open calendar panel/i }))
      expect(panelOf()).not.toHaveAttribute('inert')
    })

    it('moves focus INTO the drawer on open and gives it dialog semantics', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
      fireEvent.click(screen.getByRole('button', { name: /open calendar panel/i }))
      const panel = panelOf()
      expect(document.activeElement).toBe(panel)
      expect(panel).toHaveAttribute('role', 'dialog')
      expect(panel).toHaveAttribute('aria-modal', 'true')
    })

    it('traps Tab inside the open drawer, both directions', () => {
      render(
        <CalendarLeftRail
          {...baseProps}
          rollup={rollup()}
          runway={runway}
          subscribeUrl="https://app.example/ics/acme/tok123"
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /open calendar panel/i }))
      const panel = panelOf()
      const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      const [first, last] = [stops[0], stops[stops.length - 1]]

      // Shift+Tab off the panel itself wraps to the end…
      fireEvent.keyDown(panel, { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(last)
      // …and Tab off the last control wraps to the start.
      fireEvent.keyDown(last, { key: 'Tab' })
      expect(document.activeElement).toBe(first)
    })

    it('restores focus to the opener when the drawer closes', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
      const trigger = screen.getByRole('button', { name: /open calendar panel/i })
      fireEvent.click(trigger)
      expect(document.activeElement).not.toBe(trigger)
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('never makes the md+ rail inert or a dialog — it is the in-flow column', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    const panel = panelOf()
    expect(panel).not.toHaveAttribute('inert')
    expect(panel).not.toHaveAttribute('role')
    expect(panel).not.toHaveAttribute('aria-modal')
  })

  // ── WCAG 1.4.11 ─── the rail's hover/focus was `bg-card` over `bg-sidebar`,
  // and both are #ffffff in light mode: 1.000 contrast, a literal no-op.
  it('gives the rail a hover/focus surface that is not the no-op bg-card', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    const grid = screen.getByRole('group', { name: /mini calendar/i })
    const day = within(grid).getByRole('link', { name: /^15$/ })
    expect(day.className).not.toMatch(/\bhover:bg-card\b/)
    expect(day.className).toMatch(/hover:bg-sidebar-hover/)
    expect(day.className).toMatch(/focus-visible:bg-sidebar-hover/)
    const stepper = screen.getByRole('button', { name: /next month/i })
    expect(stepper.className).not.toMatch(/\bhover:bg-card\b/)
    expect(stepper.className).toMatch(/hover:bg-sidebar-hover/)
  })

  // ── WCAG 1.4.1 ─── the marks are only an accessible channel if decodable.
  it('carries a persistent key for every calendar kind', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    expect(screen.getByText('Key')).toBeInTheDocument()
    for (const kind of CALENDAR_KINDS) {
      expect(screen.getByText(CALENDAR_KIND_LABELS[kind])).toBeInTheDocument()
    }
    // …and each entry shows the SHAPE, not just a colour swatch.
    const shapes = Array.from(document.querySelectorAll('[data-slot="kind-dot"]')).map((n) =>
      n.getAttribute('data-shape')
    )
    expect(new Set(shapes).size).toBe(CALENDAR_KINDS.length)
  })

  // ── the work that has NO date ──────────────────────────────────────────────
  // buildCalendarFeed drops undated events and leads, so this section is the
  // only place on any calendar surface they exist.
  describe('unscheduled work', () => {
    const unscheduled: UnscheduledRow[] = [
      {
        id: 'e1', title: 'Payette barn dance', kind: 'event', href: '/acme/payette/dashboard',
        createdAt: '2026-08-01T00:00:00.000Z', committed: true, leadId: 'L1', value: 8000,
        bookByDate: '2026-08-30',
      },
      {
        id: 'l2', title: 'Kuna market day', kind: 'lead', href: '/acme/leads/l2',
        createdAt: '2026-08-05T00:00:00.000Z', committed: false, leadId: 'l2', value: 900,
      },
    ]

    it('surfaces the undated rows and their count', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} unscheduled={unscheduled} />)
      const section = screen.getByRole('region', { name: /unscheduled work/i })
      expect(within(section).getByText('Payette barn dance')).toBeInTheDocument()
      expect(within(section).getByText('Kuna market day')).toBeInTheDocument()
      expect(within(screen.getByRole('button', { name: /needs a date/i })).getByText('2')).toBeInTheDocument()
    })

    /**
     * COMPOSITION, and it is the whole reason this went where it did. Zone 1 is
     * "which day" (scope filter + mini-month + next-open); zones 3–5 are
     * reporting and reference. This is neither — it is a queue the operator
     * acts on, and the drag source a later increment drags onto the grid beside
     * it. A drag source parked under three reporting panes on a scrolling 280px
     * rail is unreachable, so it sits second, directly under the date zone.
     */
    it('sits below the mini-month and ABOVE the week KPIs', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} unscheduled={unscheduled} />)
      const grid = screen.getByRole('group', { name: /mini calendar/i })
      const section = screen.getByRole('region', { name: /unscheduled work/i })
      const weekKpis = screen.getByText('This week')
      const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING
      expect(grid.compareDocumentPosition(section) & FOLLOWING).toBeTruthy()
      expect(section.compareDocumentPosition(weekKpis) & FOLLOWING).toBeTruthy()
    })

    it('renders its empty state rather than vanishing when nothing is undated', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} unscheduled={[]} />)
      expect(screen.getByText('Everything is scheduled.')).toBeInTheDocument()
    })

    it('survives being rendered without the prop at all', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
      expect(screen.getByText('Everything is scheduled.')).toBeInTheDocument()
    })

    it('keeps working inside the mobile drawer, under the focus trap', () => {
      belowMd = true
      render(
        <CalendarLeftRail
          {...baseProps}
          rollup={rollup()}
          runway={runway}
          unscheduled={unscheduled}
          subscribeUrl="https://app.example/ics/acme/tok123"
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /open calendar panel/i }))
      const panel = panelOf()
      const rowLink = within(panel).getByText('Payette barn dance').closest('a') as HTMLAnchorElement
      // reachable: it is inside the trapped panel and in its focusable list
      expect(Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))).toContain(rowLink)
      // …and collapsing it takes those stops back OUT of the trap rather than
      // leaving focusable anchors behind a display:none subtree.
      fireEvent.click(within(panel).getByRole('button', { name: /needs a date/i }))
      expect(within(panel).queryByText('Payette barn dance')).not.toBeInTheDocument()
    })
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * COMPOSITION — the rail's focal element.
   *
   * The whole-branch design review found seven sections in one scroll, each
   * wearing the identical 11px/600/uppercase eyebrow "so it adds no fourth
   * hierarchy level", and the sum with no hierarchy at all. These assert the
   * fix STRUCTURALLY — which zones exist, in what order, which one is dominant,
   * and that nothing which used to be visible became unreachable.
   * ───────────────────────────────────────────────────────────────────────────
   */
  describe('composition', () => {
    const unscheduled: UnscheduledRow[] = [
      {
        id: 'e1', title: 'Payette barn dance', kind: 'event', href: '/acme/payette/dashboard',
        createdAt: '2026-08-01T00:00:00.000Z', committed: true, leadId: 'L1', value: 8000,
        bookByDate: '2026-08-30',
      },
    ]
    const loudRollup = rollup({
      eventCount: 3, guestCount: 1650, bookedValue: 12400, dueAmount: 4200, blockerCount: 1,
    })
    const full = (
      <CalendarLeftRail
        {...baseProps}
        rollup={loudRollup}
        runway={runway}
        unscheduled={unscheduled}
        subscribeUrl="https://app.example/ics/acme/tok123"
      />
    )

    const zones = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-rail-section]')).map((el) =>
        el.getAttribute('data-rail-section')
      )

    it('is five zones, in the order the operator decides in', () => {
      render(full)
      // which day → what needs a day → this week → the money → the key.
      // NOT the seven co-equal sections the review found.
      expect(zones()).toEqual(['dates', 'unscheduled', 'week', 'runway', 'key'])
    })

    it('has exactly ONE focal element, and it is the queue', () => {
      render(full)
      const focal = document.querySelectorAll('[data-rail-focal]')
      expect(focal).toHaveLength(1)
      expect(focal[0].getAttribute('data-rail-section')).toBe('unscheduled')
    })

    it('makes the focal element the largest thing in the rail — tiles expanded and all', () => {
      render(full)
      fireEvent.click(screen.getByRole('button', { name: /this week/i }))
      const panel = panelOf()
      const value = panel.querySelector('[data-slot="rail-focal-value"]') as HTMLElement
      expect(value).not.toBeNull()
      // getAttribute, not .className — SVG nodes carry an SVGAnimatedString.
      const sizes = Array.from(panel.querySelectorAll<Element>('[class]'))
        .filter((el) => el !== value)
        .flatMap((el) => Array.from((el.getAttribute('class') ?? '').matchAll(/text-\[(\d+)px\]/g)))
        .map((m) => Number(m[1]))
      // StatTile's own 20px value is the nearest rival, and it loses.
      expect(Math.max(...sizes)).toBeLessThan(26)
      expect(value.className).toMatch(/text-\[26px\]/)
    })

    it('gives the focal element the rail’s only bordered container', () => {
      render(full)
      const all = Array.from(document.querySelectorAll<HTMLElement>('[data-rail-section]'))
      const boxed = all.filter((el) => /(^|\s)border(\s|$)/.test(el.className))
      expect(boxed).toHaveLength(1)
      expect(boxed[0].getAttribute('data-rail-section')).toBe('unscheduled')
      // every other zone groups with a hairline rule or with whitespace
      for (const el of all) {
        if (el.getAttribute('data-rail-section') === 'unscheduled') continue
        expect(el.className).not.toMatch(/(^|\s)border(\s|$)/)
      }
    })

    // ── nothing became unreachable ───────────────────────────────────────────

    it('keeps the scope filter, mini-month and next-open chips in the ONE date zone', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} bookability={bookCtx} />)
      const dates = document.querySelector('[data-rail-section="dates"]') as HTMLElement
      expect(within(dates).getByRole('link', { name: /everything/i })).toBeInTheDocument()
      expect(within(dates).getByRole('link', { name: /pipeline only/i })).toBeInTheDocument()
      expect(within(dates).getByRole('group', { name: /mini calendar/i })).toBeInTheDocument()
      expect(dates.querySelector('[data-slot="rail-bookability"]')).not.toBeNull()
      expect(within(dates).getByText(/next open/i)).toBeInTheDocument()
    })

    it('collapses the week tiles by default but never hides a week number', () => {
      render(full)
      // the five StatTiles are NOT painted…
      expect(document.querySelectorAll('[data-slot="stat-tile"]')).toHaveLength(0)
      // …yet every value is still on screen, in the summary line
      const summary = document.querySelector('[data-slot="week-summary"]') as HTMLElement
      expect(summary).toHaveTextContent('3 events')
      expect(summary).toHaveTextContent('1,650 guests')
      expect(summary).toHaveTextContent('$12,400 booked')
      expect(summary).toHaveTextContent('$4,200 due')
      expect(summary).toHaveTextContent('1 blocker')
    })

    it('escalates the two week ALARMS in the summary, so no alert hides behind a disclosure', () => {
      render(
        <CalendarLeftRail
          {...baseProps}
          rollup={rollup({ eventCount: 1, dueAmount: 4200, overdueDueAmount: 1500, blockerCount: 2 })}
          runway={runway}
        />
      )
      const summary = document.querySelector('[data-slot="week-summary"]') as HTMLElement
      const overdue = within(summary).getByText('overdue', { exact: false, selector: 'span.font-semibold' })
      expect(overdue.className).toMatch(/var\(--danger-fg\)/)
      const blockers = within(summary).getByText('blockers', { exact: false, selector: 'span.font-semibold' })
      expect(blockers.className).toMatch(/var\(--danger-fg\)/)
      expect(summary).toHaveTextContent('$1,500 overdue')
      expect(summary).toHaveTextContent('2 blockers')
    })

    it('reads "nothing booked" rather than four zeroes on a quiet week', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
      expect(screen.getByText('Nothing booked this week.')).toBeInTheDocument()
    })

    it('puts the five tiles one tap away, with their data intact', () => {
      render(full)
      const toggle = screen.getByRole('button', { name: /this week/i })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      const panelId = toggle.getAttribute('aria-controls') as string
      expect(document.getElementById(panelId)).not.toBeNull()
      fireEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      expect(document.querySelectorAll('[data-slot="stat-tile"]')).toHaveLength(5)
      for (const label of ['Events', 'Guests', 'Booked', 'Due this week', 'Blockers']) {
        expect(screen.getByText(label)).toBeInTheDocument()
      }
    })

    it('keeps BOTH mark legends always-on in the Key footer — no disclosure', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} bookability={bookCtx} />)
      const key = document.querySelector('[data-rail-section="key"]') as HTMLElement
      expect(within(key).getByText('Key')).toBeInTheDocument()
      for (const kind of CALENDAR_KINDS) {
        expect(within(key).getByText(CALENDAR_KIND_LABELS[kind])).toBeInTheDocument()
      }
      expect(within(key).getByText(/Tight — capacity is spoken for/)).toBeInTheDocument()
      expect(within(key).getByText(/No mark — open to book/)).toBeInTheDocument()
      // the shapes are still the accessible channel, not the colours
      const shapes = Array.from(key.querySelectorAll('[data-slot="kind-dot"]')).map((n) =>
        n.getAttribute('data-shape')
      )
      expect(new Set(shapes).size).toBe(CALENDAR_KINDS.length)
    })

    it('demotes ICS subscribe to a footer link that still reveals the feed URL', () => {
      render(full)
      const key = document.querySelector('[data-rail-section="key"]') as HTMLElement
      const btn = within(key).getByRole('button', { name: /subscribe/i })
      // …and it names the panel it controls, which the shipped version did not
      const panelId = btn.getAttribute('aria-controls') as string
      expect(document.getElementById(panelId)).not.toBeNull()
      expect(btn).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(btn)
      expect(btn).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('https://app.example/ics/acme/tok123')).toBeInTheDocument()
    })
  })

  // ── the 280px drawer ───────────────────────────────────────────────────────
  describe('the 280px mobile drawer', () => {
    beforeEach(() => {
      belowMd = true
    })

    it('gives the drawer a visible way OUT, pinned so a scroll cannot lose it', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
      fireEvent.click(screen.getByRole('button', { name: /open calendar panel/i }))
      const close = screen.getByRole('button', { name: /close calendar panel/i })
      // Escape needs a keyboard and the scrim scrolls away; this is the only
      // affordance a thumb 600px down the drawer can actually reach.
      expect(close.closest('.sticky')).not.toBeNull()
      expect(close.className).toMatch(/size-11/)
    })

    it('closes on that button and hands focus back to the opener', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
      const trigger = screen.getByRole('button', { name: /open calendar panel/i })
      fireEvent.click(trigger)
      fireEvent.click(screen.getByRole('button', { name: /close calendar panel/i }))
      expect(panelOf()).toHaveAttribute('inert')
      expect(document.activeElement).toBe(trigger)
    })

    it('is materially shorter: no tile stack, no card stack, three runway rows', () => {
      const many: RunwayJob[] = Array.from({ length: 8 }, (_, i) => ({
        ...runway[0], eventId: `e${i}`, title: `Job ${i}`, date: `2026-09-0${i + 1}`,
      }))
      render(
        <CalendarLeftRail {...baseProps} rollup={rollup({ eventCount: 2, bookedValue: 900 })} runway={many} />
      )
      // the two blocks that owned ~500px of the old rail
      expect(document.querySelectorAll('[data-slot="stat-tile"]')).toHaveLength(0)
      const list = screen.getByRole('list', { name: /runway/i })
      expect(within(list).getAllByRole('listitem')).toHaveLength(3)
      // …and the runway rows are no longer five bordered cards
      for (const li of within(list).getAllByRole('listitem')) {
        expect(li.className).not.toMatch(/\bborder\b/)
      }
    })

    it('still traps Tab, still restores focus, with the new header in the panel', () => {
      render(
        <CalendarLeftRail
          {...baseProps}
          rollup={rollup()}
          runway={runway}
          subscribeUrl="https://app.example/ics/acme/tok123"
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /open calendar panel/i }))
      const panel = panelOf()
      const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      // the close button is the drawer's FIRST stop — the way out comes first
      expect(stops[0]).toBe(screen.getByRole('button', { name: /close calendar panel/i }))
      fireEvent.keyDown(panel, { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(stops[stops.length - 1])
    })
  })

  it('lets the mini-month page months without leaving the day', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    // Aug 2026 shown; step forward a month → September.
    expect(screen.getByText(/August 2026/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /next month/i }))
    expect(screen.getByText(/September 2026/i)).toBeInTheDocument()
  })
})
