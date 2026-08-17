import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TimeGridDay, PX_PER_HOUR, DAY_START_HOUR } from '@/components/admin/calendar/TimeGridDay'
import type { CalendarItem } from '@/lib/calendar'

const day = '2026-08-22'

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
    expect(cta).toHaveAttribute('href', '/acme/new-event')
  })
})

describe('TimeGridDay — grid geometry', () => {
  const gridItem = (label: string) => screen.getByText(label).closest('a')!

  it('lays overlapping timed items into side-by-side lanes (no collision)', () => {
    const overlap: CalendarItem[] = [
      { id: 'ev', title: 'Ceremony', date: day, kind: 'event', href: '/acme/ev', start: '16:00', end: '18:00' },
      { id: 'dr', title: 'Pickup window', date: day, kind: 'drop', href: '/acme/dr', start: '17:00', end: '19:00' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={overlap} />)
    // two lanes: each takes half the width, offset so they never paint over each other
    expect(gridItem('Ceremony')).toHaveStyle({ left: '0%', width: '50%' })
    expect(gridItem('Pickup window')).toHaveStyle({ left: '50%', width: '50%' })
  })

  it('gives non-overlapping items the full column width', () => {
    const apart: CalendarItem[] = [
      { id: 'a', title: 'Morning', date: day, kind: 'event', href: '/acme/a', start: '09:00', end: '10:00' },
      { id: 'b', title: 'Noon', date: day, kind: 'event', href: '/acme/b', start: '11:00', end: '12:00' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={apart} />)
    expect(gridItem('Morning')).toHaveStyle({ left: '0%', width: '100%' })
    expect(gridItem('Noon')).toHaveStyle({ left: '0%', width: '100%' })
  })

  it('clamps an item running past day-end to the grid bottom', () => {
    const late: CalendarItem[] = [
      { id: 'l', title: 'Late night', date: day, kind: 'event', href: '/acme/l', start: '21:00', end: '23:00' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={late} />)
    const el = gridItem('Late night')
    // day-end is 22:00 → the box stops at the grid bottom, never bleeding past it
    expect(el).toHaveStyle({ top: `${(21 - DAY_START_HOUR) * PX_PER_HOUR}px` })
    expect(el).toHaveStyle({ height: `${1 * PX_PER_HOUR}px` })
  })

  it('clamps an item starting before day-start to the visible remainder', () => {
    const early: CalendarItem[] = [
      { id: 'e', title: 'Load in', date: day, kind: 'event', href: '/acme/e', start: '06:00', end: '10:00' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={early} dayStartHour={8} dayEndHour={22} />)
    const el = gridItem('Load in')
    expect(el).toHaveStyle({ top: '0px' })
    // 06:00–10:00 against an 08:00 start shows only the 08:00–10:00 remainder
    expect(el).toHaveStyle({ height: `${2 * PX_PER_HOUR}px` })
  })

  it('floors a very short window to a tappable height (>= 24px, prefer 44)', () => {
    const tiny: CalendarItem[] = [
      { id: 't', title: 'Quick drop', date: day, kind: 'drop', href: '/acme/t', start: '10:00', end: '10:15' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={tiny} />)
    const el = gridItem('Quick drop')
    const h = Number((el.style.height || '').replace('px', ''))
    expect(h).toBeGreaterThanOrEqual(24)
    expect(h).toBe(44)
  })

  it('flags an item with end <= start instead of silently collapsing', () => {
    const bad: CalendarItem[] = [
      { id: 'x', title: 'Reversed', date: day, kind: 'event', href: '/acme/x', start: '18:00', end: '16:00' },
    ]
    render(<TimeGridDay orgSlug="acme" ymd={day} items={bad} />)
    expect(gridItem('Reversed')).toHaveAttribute('data-invalid-hours', 'true')
  })
})
