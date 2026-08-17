import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DayView } from '@/components/admin/calendar/DayView'
import { DAY_START_HOUR, PX_PER_HOUR } from '@/components/admin/calendar/TimeGridDay'
import type { CalendarItem } from '@/lib/calendar'

const ymd = '2026-08-22'

const items: CalendarItem[] = [
  { id: 'e1', title: 'Wedding', date: ymd, kind: 'event', href: '/acme/wedding/dashboard', start: '16:00', end: '19:00' },
  { id: 'i1', title: 'Deposit invoice', date: ymd, kind: 'invoice_due', href: '/acme/leads/l1', amount: 500 },
  { id: 'other', title: 'Different day', date: '2026-08-25', kind: 'event', href: '/acme/x/dashboard', start: '09:00', end: '10:00' },
]

const bodyOf = (c: HTMLElement) => within(c.querySelector('[data-slot="time-grid-body"]') as HTMLElement)
const bandOf = (c: HTMLElement) => within(c.querySelector('[data-slot="all-day-band"]') as HTMLElement)

describe('DayView', () => {
  it('shows the day heading', () => {
    render(<DayView orgSlug="acme" items={items} ymd={ymd} today={ymd} />)
    expect(screen.getByText(/August 22, 2026/)).toBeInTheDocument()
  })

  it('positions the day’s timed event and scopes to the given day', () => {
    const { container } = render(<DayView orgSlug="acme" items={items} ymd={ymd} today={ymd} />)
    const wedding = bodyOf(container).getByText('Wedding').closest('a')!
    expect(wedding).toHaveStyle({ top: `${(16 - DAY_START_HOUR) * PX_PER_HOUR}px` })
    // an item on another day is not shown
    expect(screen.queryByText('Different day')).not.toBeInTheDocument()
  })

  it('keeps the due-date invoice in the all-day band', () => {
    const { container } = render(<DayView orgSlug="acme" items={items} ymd={ymd} today={ymd} />)
    expect(bandOf(container).getByText('Deposit invoice')).toBeInTheDocument()
  })

  it('renders a specific CTA when the day is empty', () => {
    render(<DayView orgSlug="acme" items={[]} ymd={ymd} today={ymd} />)
    expect(screen.getByText(/nothing scheduled/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /book a job/i })).toHaveAttribute('href', '/acme/new-event?date=2026-08-22')
  })
})
