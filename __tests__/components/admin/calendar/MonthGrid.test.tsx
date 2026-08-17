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

// 3 items on the 10th; 6 items on the 15th (overflows MAX_DOTS)
const items: CalendarItem[] = [
  mk('a', '2026-08-10', 'event'),
  mk('b', '2026-08-10', 'task'),
  mk('c', '2026-08-10', 'invoice_due'),
  ...Array.from({ length: 6 }, (_, i) => mk(`m${i}`, '2026-08-15', i % 2 ? 'task' : 'event')),
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

  it('marks today', () => {
    const { container } = render(<MonthGrid orgSlug="acme" items={items} month="2026-08" today="2026-08-15" />)
    expect(cellEl(container, '2026-08-15')).toHaveAttribute('aria-current', 'date')
  })

  it('renders a specific CTA when the month is empty', () => {
    render(<MonthGrid orgSlug="acme" items={[]} month="2026-08" today="2026-08-01" />)
    expect(screen.getByText(/nothing scheduled/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /book a job/i })).toHaveAttribute('href', '/acme/new-event')
  })
})
