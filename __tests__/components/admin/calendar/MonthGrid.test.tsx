import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MonthGrid, MAX_DOTS } from '@/components/admin/calendar/MonthGrid'
import type { CalendarItem } from '@/lib/calendar'

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

const cellEl = (c: HTMLElement, d: string) =>
  c.querySelector(`[data-slot="month-cell"][data-day="${d}"]`) as HTMLElement
const cell = (c: HTMLElement, d: string) => within(cellEl(c, d))

describe('MonthGrid', () => {
  it('shows one density dot per item up to the cap', () => {
    const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
    expect(cell(container, '2026-08-10').queryAllByTestId('density-dot')).toHaveLength(3)
    expect(cell(container, '2026-08-10').queryByText(/^\+/)).not.toBeInTheDocument()
  })

  it('caps dots and shows an overflow count on a busy day', () => {
    const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-01" />)
    const busy = cell(container, '2026-08-15')
    expect(busy.queryAllByTestId('density-dot')).toHaveLength(MAX_DOTS)
    expect(busy.getByText(`+${6 - MAX_DOTS}`)).toBeInTheDocument()
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
    expect(today.querySelector('.bg-foreground')).not.toBeNull()
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
    const marks = Array.from(
      cellEl(container, '2026-08-10').querySelectorAll('[data-slot="kind-dot"]')
    )
    expect(marks).toHaveLength(3)
    // event / task / invoice_due — three kinds, three silhouettes.
    expect(new Set(marks.map((m) => m.getAttribute('data-shape'))).size).toBe(3)
    for (const m of marks) expect(m.querySelector('svg')).toBeTruthy()
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
