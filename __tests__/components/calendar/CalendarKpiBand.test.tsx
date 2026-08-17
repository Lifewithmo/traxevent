import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CalendarKpiBand } from '@/components/admin/calendar/CalendarKpiBand'
import type { WeekRollup } from '@/lib/calendar-week'

const ALERT = 'border-[var(--status-alert-bg)]'
const MONEY = 'text-[var(--money-green)]'

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

const tileOf = (label: string) => screen.getByText(label).closest('[data-slot="stat-tile"]')
const valueOf = (label: string) => tileOf(label)?.querySelectorAll('span')[1]

describe('CalendarKpiBand (rail)', () => {
  it('renders the five week tiles: Events, Guests, Booked, Due, Blockers', () => {
    render(<CalendarKpiBand rollup={rollup({ eventCount: 3, guestCount: 1650, bookedValue: 12400, dueAmount: 4200, blockerCount: 1 })} />)
    expect(screen.getByText('Events')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Guests')).toBeInTheDocument()
    expect(screen.getByText('1,650')).toBeInTheDocument()
    expect(screen.getByText('Booked')).toBeInTheDocument()
    expect(screen.getByText('$12,400')).toBeInTheDocument()
    expect(screen.getByText('Due this week')).toBeInTheDocument()
    expect(screen.getByText('$4,200')).toBeInTheDocument()
    expect(screen.getByText('Blockers')).toBeInTheDocument()
  })

  it('has no "Needs attention" tile (folded into the day spine)', () => {
    render(<CalendarKpiBand rollup={rollup()} />)
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument()
  })

  it('gives Booked a money tone only when something is booked', () => {
    const { rerender } = render(<CalendarKpiBand rollup={rollup({ bookedValue: 8000 })} />)
    expect(valueOf('Booked')).toHaveClass(MONEY)
    rerender(<CalendarKpiBand rollup={rollup({ bookedValue: 0 })} />)
    expect(valueOf('Booked')).not.toHaveClass(MONEY)
  })

  it('flips Due this week to alert tone when overdue', () => {
    const { rerender } = render(<CalendarKpiBand rollup={rollup({ dueAmount: 4200 })} />)
    expect(tileOf('Due this week')).not.toHaveClass(ALERT)
    expect(valueOf('Due this week')).toHaveClass(MONEY)
    rerender(<CalendarKpiBand rollup={rollup({ dueAmount: 4200, overdueDueAmount: 1500 })} />)
    expect(tileOf('Due this week')).toHaveClass(ALERT)
    expect(screen.getByText('$1,500 overdue')).toBeInTheDocument()
  })

  it('flips Blockers to alert tone above zero', () => {
    const { rerender } = render(<CalendarKpiBand rollup={rollup({ blockerCount: 2 })} />)
    expect(tileOf('Blockers')).toHaveClass(ALERT)
    rerender(<CalendarKpiBand rollup={rollup({ blockerCount: 0 })} />)
    expect(tileOf('Blockers')).not.toHaveClass(ALERT)
  })

  it('omits the Guests note when there are no events', () => {
    const { rerender } = render(<CalendarKpiBand rollup={rollup({ eventCount: 2, guestCount: 165 })} />)
    expect(screen.getByText('across 2 events')).toBeInTheDocument()
    rerender(<CalendarKpiBand rollup={rollup({ eventCount: 0, guestCount: 0 })} />)
    expect(screen.queryByText(/^across /)).not.toBeInTheDocument()
  })

  it('insets the band to match the px-5 gutter above it', () => {
    const { container } = render(<CalendarKpiBand rollup={rollup()} />)
    const band = container.querySelector('[data-slot="kpi-band"]')
    expect(band).toHaveClass('px-5')
    expect(band).toHaveClass('border-b')
  })
})
