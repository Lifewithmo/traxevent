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
