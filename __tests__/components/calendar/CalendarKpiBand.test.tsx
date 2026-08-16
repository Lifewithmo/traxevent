import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CalendarKpiBand } from '@/components/admin/calendar/CalendarKpiBand'
import type { WeekRollup } from '@/lib/calendar-week'

const ALERT = 'border-[var(--status-alert-bg)]'

function rollup(overrides: Partial<WeekRollup> = {}): WeekRollup {
  return {
    eventCount: 0,
    guestCount: 0,
    tentativeCount: 0,
    dueAmount: 0,
    overdueDueAmount: 0,
    blockerCount: 0,
    ...overrides,
  }
}

const tileOf = (label: string) => screen.getByText(label).closest('[data-slot="stat-tile"]')

describe('CalendarKpiBand', () => {
  it('renders labels and values for all four tiles', () => {
    render(
      <CalendarKpiBand
        rollup={rollup({ eventCount: 3, guestCount: 1650, dueAmount: 4200 })}
        attentionTotal={2}
      />
    )
    expect(screen.getByText('Events')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Guests')).toBeInTheDocument()
    expect(screen.getByText('1,650')).toBeInTheDocument()
    expect(screen.getByText('Due this week')).toBeInTheDocument()
    expect(screen.getByText('$4,200')).toBeInTheDocument()
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders zeroed tiles rather than hiding them', () => {
    render(<CalendarKpiBand rollup={rollup()} attentionTotal={0} />)
    expect(screen.getByText('Guests')).toBeInTheDocument()
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
    expect(screen.getByText('$0')).toBeInTheDocument()
  })

  it('shows the tentative note only when tentativeCount > 0', () => {
    const { rerender } = render(
      <CalendarKpiBand rollup={rollup({ eventCount: 4, tentativeCount: 2 })} attentionTotal={0} />
    )
    expect(screen.getByText('2 tentative')).toBeInTheDocument()
    expect(screen.queryByText('booked this week')).not.toBeInTheDocument()

    rerender(<CalendarKpiBand rollup={rollup({ eventCount: 4 })} attentionTotal={0} />)
    expect(screen.queryByText('2 tentative')).not.toBeInTheDocument()
    expect(screen.getByText('booked this week')).toBeInTheDocument()
  })

  it('pluralises the Guests note and omits it entirely when eventCount is 0', () => {
    const { rerender } = render(
      <CalendarKpiBand rollup={rollup({ eventCount: 1, guestCount: 165 })} attentionTotal={0} />
    )
    expect(screen.getByText('across 1 event')).toBeInTheDocument()

    rerender(<CalendarKpiBand rollup={rollup({ eventCount: 2, guestCount: 165 })} attentionTotal={0} />)
    expect(screen.getByText('across 2 events')).toBeInTheDocument()

    rerender(<CalendarKpiBand rollup={rollup({ eventCount: 0, guestCount: 0 })} attentionTotal={0} />)
    expect(screen.queryByText(/^across /)).not.toBeInTheDocument()
    expect(screen.getByText('Guests')).toBeInTheDocument()
  })

  it('uses money tone for Due this week normally and alert tone when overdue', () => {
    const { rerender } = render(
      <CalendarKpiBand rollup={rollup({ dueAmount: 4200 })} attentionTotal={0} />
    )
    expect(tileOf('Due this week')).not.toHaveClass(ALERT)
    expect(screen.getByText('nothing overdue')).toBeInTheDocument()

    rerender(
      <CalendarKpiBand
        rollup={rollup({ dueAmount: 4200, overdueDueAmount: 1500 })}
        attentionTotal={0}
      />
    )
    expect(tileOf('Due this week')).toHaveClass(ALERT)
    expect(screen.getByText('$1,500 overdue')).toBeInTheDocument()
  })

  it('notes nothing due when the week has no invoices due', () => {
    render(<CalendarKpiBand rollup={rollup()} attentionTotal={0} />)
    expect(screen.getByText('nothing due')).toBeInTheDocument()
    expect(tileOf('Due this week')).not.toHaveClass(ALERT)
  })

  it('flips Needs attention to alert tone above zero', () => {
    const { rerender } = render(<CalendarKpiBand rollup={rollup()} attentionTotal={3} />)
    expect(tileOf('Needs attention')).toHaveClass(ALERT)

    rerender(<CalendarKpiBand rollup={rollup()} attentionTotal={0} />)
    expect(tileOf('Needs attention')).not.toHaveClass(ALERT)
  })

  it('singularises the blocker note and falls back when nothing blocks', () => {
    const { rerender } = render(
      <CalendarKpiBand rollup={rollup({ blockerCount: 1 })} attentionTotal={1} />
    )
    expect(screen.getByText('1 blocking')).toBeInTheDocument()

    rerender(<CalendarKpiBand rollup={rollup({ blockerCount: 4 })} attentionTotal={4} />)
    expect(screen.getByText('4 blocking')).toBeInTheDocument()

    rerender(<CalendarKpiBand rollup={rollup()} attentionTotal={0} />)
    expect(screen.getByText('nothing blocking')).toBeInTheDocument()
  })

  it('insets the band to match the px-5 header above it', () => {
    const { container } = render(<CalendarKpiBand rollup={rollup()} attentionTotal={0} />)
    const band = container.querySelector('[data-slot="kpi-band"]')
    expect(band).toHaveClass('px-5')
    expect(band).toHaveClass('border-b')
  })
})
