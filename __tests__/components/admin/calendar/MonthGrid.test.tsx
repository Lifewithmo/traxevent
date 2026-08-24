import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import {
  MonthGrid,
  MAX_DOTS,
  MAX_LOAD_SHAPES,
  MARK_PX,
  MARK_REVEAL_PX,
  cellContentPx,
  loadShapes,
  loadStripPx,
  marksRowPx,
} from '@/components/admin/calendar/MonthGrid'
import { CALENDAR_KINDS, type CalendarItem } from '@/lib/calendar'

// W3-J: these grids now import the reschedule engine, which imports its server
// action; without the mock the real module pulls in firebase-admin at load time.
vi.mock('@/actions/calendar-bulk', () => ({
  bulkRescheduleAgenda: vi.fn().mockResolvedValue({ moved: 0, failures: [] }),
  rescheduleCalendarItem: vi.fn().mockResolvedValue({ moved: 1, failures: [] }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))


const mk = (id: string, date: string, kind: CalendarItem['kind'] = 'event'): CalendarItem => ({
  id,
  title: `${kind} ${id}`,
  date,
  kind,
  href: `/acme/x/${id}`,
})

// 3 items on the 10th; 6 items on the 15th (overflows MAX_DOTS); 1 on the 16th
const items: CalendarItem[] = [
  mk('a', '2026-08-10', 'event'),
  mk('b', '2026-08-10', 'task'),
  mk('c', '2026-08-10', 'invoice_due'),
  ...Array.from({ length: 6 }, (_, i) => mk(`m${i}`, '2026-08-15', i % 2 ? 'task' : 'event')),
  mk('solo', '2026-08-16', 'event'),
]

/**
 * The day LINK. W3-J made the cell a box with a stretched overlay link inside
 * it, so that a booked job can carry its own focusable grab handle — an `<a>`
 * may not contain interactive content. `cellEl` is still the link (href,
 * aria-label, aria-current, the selection ring all live there); `boxEl` is the
 * cell it fills, which is what actually contains the day number and the dots.
 */
const cellEl = (c: HTMLElement, d: string) =>
  c.querySelector(`a[data-slot="month-cell"][data-day="${d}"]`) as HTMLElement
const boxEl = (c: HTMLElement, d: string) =>
  c.querySelector(`[data-slot="month-cell-box"][data-day="${d}"]`) as HTMLElement
const cell = (c: HTMLElement, d: string) => within(boxEl(c, d))
/** The one-line row that holds the marks, the load strip and the count. */
const loadRow = (c: HTMLElement, d: string) =>
  boxEl(c, d).querySelector('[data-slot="month-load"]') as HTMLElement
const marksRow = (c: HTMLElement, d: string) =>
  boxEl(c, d).querySelector('[data-slot="month-marks"]') as HTMLElement
const stripRow = (c: HTMLElement, d: string) =>
  boxEl(c, d).querySelector('[data-slot="month-load-strip"]') as HTMLElement

describe('MonthGrid', () => {
  it('shows one density dot per item up to the cap', () => {
    const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
    expect(within(marksRow(container, '2026-08-10')).queryAllByTestId('density-dot')).toHaveLength(3)
  })

  it('caps the individual marks and prints the day TOTAL, not the overflow', () => {
    const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
    const busy = cell(container, '2026-08-15')
    expect(within(marksRow(container, '2026-08-15')).queryAllByTestId('density-dot')).toHaveLength(MAX_DOTS)
    // "+2" made the reader add 4+2 to learn "6", and it welded the number to how
    // many marks happened to render — which is exactly what would stop the
    // container-query reveal from being allowed to drop one.
    expect(busy.getByText('6')).toBeInTheDocument()
    expect(busy.queryByText(`+${6 - MAX_DOTS}`)).not.toBeInTheDocument()
  })

  it('prints no count on a one-item day — a lone mark IS one item', () => {
    const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
    expect(boxEl(container, '2026-08-16').querySelector('[data-slot="month-load-count"]')).toBeNull()
    // …and it is the count, not the marks, that carries the number.
    expect(boxEl(container, '2026-08-10').querySelector('[data-slot="month-load-count"]')?.textContent).toBe('3')
  })

  it('links each in-month day to its day route, preserving ?kinds and ?view', () => {
    const { container } = render(
      <MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" kinds="pipeline" view="month" />
    )
    expect(cellEl(container, '2026-08-10')).toHaveAttribute(
      'href',
      '/acme/calendar/2026-08-10?kinds=pipeline&view=month'
    )
  })

  it('marks today with a visual marker but not aria-current (reserved for selection)', () => {
    const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-15" />)
    const today = cellEl(container, '2026-08-15')
    // today is a visual state, not the current selection — matches WeekGrid's convention
    expect(today).not.toHaveAttribute('aria-current')
    expect(boxEl(container, '2026-08-15').querySelector('.bg-foreground')).not.toBeNull()
  })

  it('marks the selected day with aria-current and the ring, even when it is not today', () => {
    const { container } = render(
      <MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" selected="2026-08-15" />
    )
    const sel = cellEl(container, '2026-08-15')
    expect(sel).toHaveAttribute('aria-current', 'date')
    expect(sel).toHaveClass('ring-1')
    // a different, non-selected day carries neither
    const other = cellEl(container, '2026-08-10')
    expect(other).not.toHaveAttribute('aria-current')
    expect(other).not.toHaveClass('ring-1')
  })

  it('gives each in-month day an accessible name with the date and item count', () => {
    const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
    expect(cellEl(container, '2026-08-10')).toHaveAttribute('aria-label', expect.stringMatching(/Aug 10.*3 items/))
    // an empty in-month day says so
    expect(cellEl(container, '2026-08-12')).toHaveAttribute('aria-label', expect.stringMatching(/nothing scheduled/i))
    // a single item is singular
    expect(cellEl(container, '2026-08-16')).toHaveAttribute('aria-label', expect.stringMatching(/1 item(?!s)/))
  })

  it('renders a specific CTA when the month is empty', () => {
    render(<MonthGrid orgSlug="acme" items={[]} month="2026-08" today="2026-08-01" />)
    expect(screen.getByText(/nothing scheduled/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /book a job/i })).toHaveAttribute('href', '/acme/new-event?date=2026-08-01')
  })

  // ── WCAG 1.4.1 Use of Colour ──────────────────────────────────────────────
  it('names the KINDS in the cell label, not just how many items there are', () => {
    // The cell's own aria-label swallows its subtree, so the dots' sr-only
    // names never reach a reader. "3 items" alone hid the fact that one of
    // them was an invoice coming due.
    const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
    const label = cellEl(container, '2026-08-10').getAttribute('aria-label') ?? ''
    expect(label).toMatch(/3 items/)
    expect(label).toMatch(/1 Booked event/)
    expect(label).toMatch(/1 Task/)
    expect(label).toMatch(/1 Invoice due/)
  })

  it('draws each density mark with a shape, not colour alone', () => {
    const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
    const marks = Array.from(marksRow(container, '2026-08-10').querySelectorAll('[data-slot="kind-dot"]'))
    expect(marks).toHaveLength(3)
    // event / task / invoice_due — three kinds, three silhouettes.
    expect(new Set(marks.map((m) => m.getAttribute('data-shape'))).size).toBe(3)
    for (const m of marks) expect(m.querySelector('svg')).toBeTruthy()
  })

  // ── W4-P: the week row may never inflate ──────────────────────────────────
  //
  // The shipped bug: the marks row was `flex-wrap`, a 24px mark plus its gap
  // costs 28px, and a phone cell has 40.57px of content — so any day with two
  // items wrapped, and because a CSS Grid row shares its height across all
  // seven cells, one busy Wednesday stretched the whole Mon–Sun row from 64px
  // to ~148px.
  //
  // The old suite asserted NODE COUNTS, which is why it shipped green: four
  // dots is four dots whether they sit on one line or four. These assert the
  // GEOMETRY instead — the arithmetic that decides whether they fit — so they
  // fail if MAX_DOTS grows, if a reveal threshold drops, if the mark or the gap
  // grows, or if the row is allowed to wrap again.
  describe('cell geometry', () => {
    /** container width → cell content width, for the layouts this grid ships in.
     *  Rail is a 280px in-flow column at md+, off-canvas below; the day spine is
     *  360px at lg+ on /calendar/[ymd]. */
    const LAYOUTS = [
      { name: 'phone 375, rail off-canvas, no spine', container: 375 },
      { name: 'tablet 768, rail in-flow, no spine', container: 768 - 280 },
      { name: 'laptop 1024, rail, no spine', container: 1024 - 280 },
      { name: 'desktop 1280, rail + spine open', container: 1280 - 280 - 360 },
      { name: 'desktop 1280, rail, no spine', container: 1280 - 280 },
      { name: 'wide 1920, rail + spine open', container: 1920 - 280 - 360 },
    ]

    /** How many 24px marks the container queries actually reveal at this width. */
    const revealed = (containerPx: number) =>
      MARK_REVEAL_PX.filter((min) => containerPx >= min).length

    it('measures the phone cell at the width the bug was found at', () => {
      // 375 / 7 = 53.571 per column; minus the 1px border-l and 2 × 6px of
      // p-1.5 = 40.571 of content. Two 24px marks and a 4px gap need 52.
      expect(cellContentPx(375)).toBeCloseTo(40.571, 3)
      expect(marksRowPx(2)).toBeGreaterThan(cellContentPx(375))
    })

    it('has exactly one reveal threshold per mark', () => {
      expect(MARK_REVEAL_PX).toHaveLength(MAX_DOTS)
    })

    it.each(LAYOUTS)('never asks a $name cell for more width than it has', ({ container }) => {
      const content = cellContentPx(container)
      const n = revealed(container)
      // The load strip is always in the layout (it is the narrow-width channel),
      // so it has to fit at every width, not just the narrow ones.
      expect(loadStripPx(MAX_LOAD_SHAPES)).toBeLessThanOrEqual(content)
      if (n > 0) expect(marksRowPx(n)).toBeLessThanOrEqual(content)
    })

    it.each([...MARK_REVEAL_PX].map((px, n) => ({ px, n })))(
      'reveal threshold $px is wide enough for mark #$n',
      ({ px, n }) => {
        expect(marksRowPx(n + 1)).toBeLessThanOrEqual(cellContentPx(px))
      }
    )

    it('keeps every target at the 24px WCAG 2.5.8 floor — fewer marks, never smaller ones', () => {
      expect(MARK_PX).toBeGreaterThanOrEqual(24)
      const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
      for (const mark of marksRow(container, '2026-08-15').children) {
        expect(mark.className).toMatch(/\bsize-6\b/)
      }
    })

    it('holds the marks on ONE line at any count — the row can never wrap', () => {
      const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
      // The busiest cell in the fixture: 6 items, MAX_DOTS marks.
      for (const d of ['2026-08-10', '2026-08-15', '2026-08-16']) {
        expect(loadRow(container, d).className).toMatch(/\bflex-nowrap\b/)
        expect(loadRow(container, d).className).not.toMatch(/\bflex-wrap\b/)
        expect(marksRow(container, d).className).toMatch(/\bflex-nowrap\b/)
        expect(stripRow(container, d).className).toMatch(/\bflex-nowrap\b/)
      }
    })

    it('gates each mark beyond the second on a CONTAINER query, not a viewport one', () => {
      // 1280px is BOTH 78.43px and 129.86px of cell depending on whether the day
      // spine is open, so a `md:` / `lg:` breakpoint cannot be right here.
      const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
      expect(container.querySelector('[data-slot="month-container"]')?.className).toMatch(/@container\/month/)
      const marks = Array.from(marksRow(container, '2026-08-15').children)
      expect(marks).toHaveLength(MAX_DOTS)
      expect(marks[2].className).toMatch(/@min-\[800px\]\/month:inline-flex/)
      expect(marks[3].className).toMatch(/@min-\[1000px\]\/month:inline-flex/)
      // …and they are display:none until then, so they leave the tab order too
      // rather than becoming clipped phantom focus stops.
      expect(marks[2].className).toMatch(/\bhidden\b/)
      expect(marks[3].className).toMatch(/\bhidden\b/)
      // The hidden state has to actually WIN. Both `hidden` and the mark's own
      // base `inline-flex` set `display`, and Tailwind emits `.inline-flex`
      // AFTER `.hidden` in the sheet — so if tailwind-merge ever stopped
      // collapsing that pair, every gated mark would silently render at every
      // width and the wrap would be back with no test the wiser.
      for (const m of [marks[2], marks[3]]) {
        expect(m.className.split(/\s+/), m.className).not.toContain('inline-flex')
        expect(m.className.split(/\s+/), m.className).not.toContain('flex')
      }
      // No viewport breakpoint may decide this.
      expect(marksRow(container, '2026-08-15').className).not.toMatch(/(^|\s)(sm|md|lg|xl):/)
    })

    it('swaps the 24px marks for a kind-carrying load strip below the first threshold', () => {
      const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
      const strip = stripRow(container, '2026-08-15')
      const marks = marksRow(container, '2026-08-15')
      // Exactly one of the two is on at any container width.
      expect(strip.className).toMatch(/@min-\[600px\]\/month:hidden/)
      expect(marks.className).toMatch(/\bhidden\b/)
      expect(marks.className).toMatch(/@min-\[600px\]\/month:flex/)
      // The strip is the KIND channel, deduplicated — not anonymous dots.
      const shapes = within(strip).getAllByTestId('load-shape')
      expect(shapes.length).toBeGreaterThan(0)
      expect(shapes.length).toBeLessThanOrEqual(MAX_LOAD_SHAPES)
      for (const s of shapes) {
        expect(s.getAttribute('data-shape')).toBeTruthy()
        expect(s.querySelector('svg')).toBeTruthy()
      }
      // …and it stays non-interactive, so the whole cell remains the tap target.
      expect(strip.querySelector('button, a, [tabindex]')).toBeNull()
    })

    it('leaves a keyboard path to every item at narrow widths — the day link', () => {
      const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
      // The strip replaces the handles, so the route to the individual items is
      // the cell's own stretched link → the day page, which lists every one of
      // them full size with its own handle.
      const link = cellEl(container, '2026-08-15')
      expect(link.tagName).toBe('A')
      expect(link).toHaveAttribute('href', '/acme/calendar/2026-08-15')
      expect(link.getAttribute('aria-label')).toMatch(/6 items/)
    })

    it('does not regress the drag affordances or the bookability slot', () => {
      const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
      const box = boxEl(container, '2026-08-15')
      expect(box).toHaveAttribute('data-drop-day', '2026-08-15')
      // The stretched overlay link still contains no interactive content.
      expect(cellEl(container, '2026-08-15').querySelector('button, a, [tabindex]')).toBeNull()
      // …and the handles are still inside the BOX, addressable by item key.
      expect(box.querySelector('[data-slot="month-job-handle"]')).not.toBeNull()
    })
  })

  describe('loadShapes', () => {
    it('names the busiest kinds first and deduplicates them', () => {
      // The busiest kind is deliberately LAST in the canonical order and the
      // rarest is first, so a comparator that quietly dropped the count term
      // and fell back to canonical order would produce the exact reverse.
      const day = [
        mk('1', '2026-08-10', 'event'),
        mk('2', '2026-08-10', 'drop'),
        mk('3', '2026-08-10', 'drop'),
        mk('4', '2026-08-10', 'drop'),
        mk('5', '2026-08-10', 'task'),
      ]
      expect(loadShapes(day, 3)).toEqual(['drop', 'event', 'task'])
      expect(loadShapes(day)).toEqual(['drop', 'event'])
      expect(loadShapes(day)).toHaveLength(MAX_LOAD_SHAPES)
    })

    it('breaks ties on the canonical kind order, so the strip is a total order', () => {
      // Same count each: the comparator must be transitive and deterministic,
      // whatever order the feed happens to arrive in.
      const kinds = CALENDAR_KINDS.slice(0, 4)
      const forward = kinds.map((k, i) => mk(`f${i}`, '2026-08-10', k))
      const reversed = [...forward].reverse()
      expect(loadShapes(forward, 4)).toEqual(kinds)
      expect(loadShapes(reversed, 4)).toEqual(kinds)
    })

    it('is empty for an empty day', () => {
      expect(loadShapes([])).toEqual([])
    })
  })

  it('is not empty when a multi-day event only spans into the month', () => {
    const spanning: CalendarItem[] = [
      { id: 'span', title: 'Festival', date: '2026-07-30', endDate: '2026-08-02', kind: 'event', href: '/acme/fest' },
    ]
    const { container } = render(<MonthGrid orgSlug="acme" items={spanning} month="2026-08" today="2026-08-01" />)
    // starts in July, spans into August — the month is populated, not empty
    expect(screen.queryByText(/nothing scheduled this month/i)).not.toBeInTheDocument()
    expect(cell(container, '2026-08-01').queryAllByTestId('density-dot').length).toBeGreaterThan(0)
  })
})
