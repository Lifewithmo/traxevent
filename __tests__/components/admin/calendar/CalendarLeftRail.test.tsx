import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { WeekRollup } from '@/lib/calendar-week'
import type { RunwayJob } from '@/lib/calendar-cashflow'
import { CALENDAR_KINDS, CALENDAR_KIND_LABELS } from '@/lib/calendar'
import type { UnscheduledRow } from '@/lib/calendar-unscheduled'

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
    eventId: 'e1', title: 'Alder wedding', date: '2026-08-22', inflowBefore: 8000, dueAfter: 2000,
    contributions: [], overdueBefore: 0, billing: 'outstanding', untimedOwed: 0, leadId: 'L1',
    boothFee: 150, carriedIn: 0, cashIn: 8000, cumulative: 7850, firstShortfall: false,
  },
]

const baseProps = { orgSlug: 'acme', today: '2026-08-18' }

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
    expect(screen.getByText('Booked')).toBeInTheDocument()
    expect(screen.getByText('$12,400')).toBeInTheDocument()
  })

  it('renders the runway strip fed by buildRunway output', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    expect(screen.getByText('Alder wedding')).toBeInTheDocument()
    expect(screen.getByText('$8,000')).toBeInTheDocument()
  })

  it('mini-month day links preserve ?view and ?kinds and route to /calendar/[ymd]', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    // The rail shows the selected day's month (Aug 2026).
    const grid = screen.getByRole('grid', { name: /mini calendar/i })
    const cell = within(grid).getByRole('link', { name: /15/ })
    expect(cell).toHaveAttribute('href', '/acme/calendar/2026-08-15?view=week&kinds=pipeline')
  })

  it('does NOT forward a stale ?week onto day-targeting links (mini-month + runway)', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    const grid = screen.getByRole('grid', { name: /mini calendar/i })
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
    const grid = screen.getByRole('grid', { name: /mini calendar/i })
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
    expect(screen.getByRole('grid', { name: /mini calendar/i })).toBeInTheDocument()
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
    const grid = screen.getByRole('grid', { name: /mini calendar/i })
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
      expect(within(screen.getByRole('button', { name: /unscheduled/i })).getByText('2')).toBeInTheDocument()
    })

    /**
     * COMPOSITION, and it is the whole reason this went where it did. The rail's
     * top half is orientation (scope filter, legend, mini-month) and its bottom
     * half is reporting (week KPIs, cash runway, ICS). This is neither — it is a
     * queue the operator acts on, and the drag source a later increment drags
     * onto the grid beside it. A drag source parked under two reporting panes on
     * a scrolling 280px rail is unreachable, so the KPI band gave up the first
     * slot below the mini-month.
     */
    it('sits below the mini-month and ABOVE the week KPIs', () => {
      render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} unscheduled={unscheduled} />)
      const grid = screen.getByRole('grid', { name: /mini calendar/i })
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
      fireEvent.click(within(panel).getByRole('button', { name: /unscheduled/i }))
      expect(within(panel).queryByText('Payette barn dance')).not.toBeInTheDocument()
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
