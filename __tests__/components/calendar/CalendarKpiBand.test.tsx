import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CalendarKpiBand } from '@/components/admin/calendar/CalendarKpiBand'
import type { CalendarItem } from '@/lib/calendar'
import type { AttentionGroup, AttentionReason, WeekRollup } from '@/lib/calendar-week'

const ALERT = 'border-[var(--status-alert-bg)]'
const MONEY = 'text-[var(--money-green)]'

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

const item = (id: string): CalendarItem => ({
  id,
  title: 'Untitled',
  href: '/acme/calendar',
  date: '2026-08-12',
  kind: 'compliance',
})

/** n entries under one reason — only the counts matter to this component. */
function group(key: AttentionReason, n: number): AttentionGroup {
  return {
    key,
    label: key,
    entries: Array.from({ length: n }, (_, i) => ({ item: item(`${key}-${i}`), reason: key, overdue: false })),
  }
}

const tileOf = (label: string) => screen.getByText(label).closest('[data-slot="stat-tile"]')
const valueOf = (label: string) => tileOf(label)?.querySelectorAll('span')[1]

describe('CalendarKpiBand', () => {
  it('renders labels and values for all four tiles', () => {
    render(
      <CalendarKpiBand
        rollup={rollup({ eventCount: 3, guestCount: 1650, dueAmount: 4200 })}
        attention={[group('money', 2)]}
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
    render(<CalendarKpiBand rollup={rollup()} attention={[]} />)
    expect(screen.getByText('Guests')).toBeInTheDocument()
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
    expect(screen.getByText('$0')).toBeInTheDocument()
  })

  // Holds are `kind: 'lead'` items; events are `kind: 'event'`. buildCalendarFeed
  // never sets `tentative` on an event, so the note must not read as a subset.
  it('presents tentative holds as additive to the booked events, not a subset', () => {
    const { rerender } = render(
      <CalendarKpiBand rollup={rollup({ eventCount: 4, tentativeCount: 2 })} attention={[]} />
    )
    expect(screen.getByText('+2 tentative holds')).toBeInTheDocument()
    expect(screen.queryByText(/^2 tentative$/)).not.toBeInTheDocument()

    rerender(<CalendarKpiBand rollup={rollup({ eventCount: 4, tentativeCount: 1 })} attention={[]} />)
    expect(screen.getByText('+1 tentative hold')).toBeInTheDocument()

    rerender(<CalendarKpiBand rollup={rollup({ eventCount: 4 })} attention={[]} />)
    expect(screen.getByText('all booked')).toBeInTheDocument()

    rerender(<CalendarKpiBand rollup={rollup()} attention={[]} />)
    expect(screen.getByText('nothing booked')).toBeInTheDocument()
  })

  it('pluralises the Guests note and omits it entirely when eventCount is 0', () => {
    const { rerender } = render(
      <CalendarKpiBand rollup={rollup({ eventCount: 1, guestCount: 165 })} attention={[]} />
    )
    expect(screen.getByText('across 1 event')).toBeInTheDocument()

    rerender(<CalendarKpiBand rollup={rollup({ eventCount: 2, guestCount: 165 })} attention={[]} />)
    expect(screen.getByText('across 2 events')).toBeInTheDocument()

    rerender(<CalendarKpiBand rollup={rollup({ eventCount: 0, guestCount: 0 })} attention={[]} />)
    expect(screen.queryByText(/^across /)).not.toBeInTheDocument()
    expect(screen.getByText('Guests')).toBeInTheDocument()
  })

  it('uses money tone for Due this week normally and alert tone when overdue', () => {
    const { rerender } = render(<CalendarKpiBand rollup={rollup({ dueAmount: 4200 })} attention={[]} />)
    expect(tileOf('Due this week')).not.toHaveClass(ALERT)
    expect(valueOf('Due this week')).toHaveClass(MONEY)
    expect(screen.getByText('nothing overdue')).toBeInTheDocument()

    rerender(
      <CalendarKpiBand rollup={rollup({ dueAmount: 4200, overdueDueAmount: 1500 })} attention={[]} />
    )
    expect(tileOf('Due this week')).toHaveClass(ALERT)
    expect(valueOf('Due this week')).not.toHaveClass(MONEY)
    expect(screen.getByText('$1,500 overdue')).toBeInTheDocument()
  })

  // Green means money that is real. $0 owed is neutral, not a collected win.
  it('drops the money tone when nothing is due, so $0 does not read as collected', () => {
    render(<CalendarKpiBand rollup={rollup()} attention={[]} />)
    expect(screen.getByText('nothing due')).toBeInTheDocument()
    expect(tileOf('Due this week')).not.toHaveClass(ALERT)
    expect(valueOf('Due this week')).not.toHaveClass(MONEY)
  })

  it('flips Needs attention to alert tone above zero', () => {
    const { rerender } = render(<CalendarKpiBand rollup={rollup()} attention={[group('money', 3)]} />)
    expect(tileOf('Needs attention')).toHaveClass(ALERT)

    rerender(<CalendarKpiBand rollup={rollup()} attention={[]} />)
    expect(tileOf('Needs attention')).not.toHaveClass(ALERT)
  })

  it('sums the value across every attention group', () => {
    render(
      <CalendarKpiBand
        rollup={rollup()}
        attention={[group('blocker', 1), group('overdue', 2), group('money', 3)]}
      />
    )
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('1 blocking')).toBeInTheDocument()
  })

  // Regression: the value came from the feed-wide `attention` while the note came
  // from the week-scoped `rollup.blockerCount`, so paging to a week beyond the
  // 30-day horizon could render "0" directly above "1 blocking".
  it('never contradicts itself when the shown week has blockers outside the horizon', () => {
    render(<CalendarKpiBand rollup={rollup({ blockerCount: 1 })} attention={[]} />)
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.queryByText('1 blocking')).not.toBeInTheDocument()
    expect(screen.getByText('nothing blocking')).toBeInTheDocument()
  })

  it('notes the horizon when work is pending but nothing is blocking', () => {
    render(<CalendarKpiBand rollup={rollup()} attention={[group('unbooked', 2)]} />)
    expect(screen.getByText('next 30 days')).toBeInTheDocument()
  })

  it('singularises the blocker note and falls back when nothing blocks', () => {
    const { rerender } = render(<CalendarKpiBand rollup={rollup()} attention={[group('blocker', 1)]} />)
    expect(screen.getByText('1 blocking')).toBeInTheDocument()

    rerender(<CalendarKpiBand rollup={rollup()} attention={[group('blocker', 4)]} />)
    expect(screen.getByText('4 blocking')).toBeInTheDocument()

    rerender(<CalendarKpiBand rollup={rollup()} attention={[]} />)
    expect(screen.getByText('nothing blocking')).toBeInTheDocument()
  })

  it('insets the band to match the px-5 header above it', () => {
    const { container } = render(<CalendarKpiBand rollup={rollup()} attention={[]} />)
    const band = container.querySelector('[data-slot="kpi-band"]')
    expect(band).toHaveClass('px-5')
    expect(band).toHaveClass('border-b')
  })
})
