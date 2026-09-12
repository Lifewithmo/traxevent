import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DayView } from '@/components/admin/calendar/DayView'
import { DAY_START_HOUR, PX_PER_HOUR } from '@/components/admin/calendar/TimeGridDay'
import type { CalendarItem } from '@/lib/calendar'

// W3-J: these grids now import the reschedule engine, which imports its server
// action; without the mock the real module pulls in firebase-admin at load time.
vi.mock('@/actions/calendar-bulk', () => ({
  bulkRescheduleAgenda: vi.fn().mockResolvedValue({ moved: 0, failures: [] }),
  rescheduleCalendarItem: vi.fn().mockResolvedValue({ moved: 1, failures: [] }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))


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

describe('DayView — the window follows the day, it does not clamp it', () => {
  const early: CalendarItem[] = [
    { id: 'li', title: 'Load in', date: ymd, kind: 'event', href: '/acme/li', start: '04:30', end: '06:00' },
    { id: 'td', title: 'Teardown', date: ymd, kind: 'event', href: '/acme/td', start: '22:30', end: '23:30' },
  ]

  it('grows to the day’s real extremes instead of clipping a 4:30am load-in', () => {
    const { container } = render(<DayView orgSlug="acme" items={early} ymd={ymd} today={ymd} />)
    const loadIn = bodyOf(container).getByText('Load in').closest('a') as HTMLElement
    const teardown = bodyOf(container).getByText('Teardown').closest('a') as HTMLElement
    // nothing is flagged as running outside the shown hours…
    expect(loadIn).not.toHaveAttribute('data-clipped')
    expect(teardown).not.toHaveAttribute('data-clipped')
    // …because the grid now starts at 4am, so 04:30 sits half an hour down
    expect(loadIn.style.top).toBe(`${0.5 * PX_PER_HOUR}px`)
    // 04:30 → 06:00 is an hour and a half, drawn at full duration
    expect(loadIn.style.height).toBe(`${1.5 * PX_PER_HOUR}px`)
    // and the gutter runs 4am → midnight (21 hourly labels)
    const grid = container.querySelector('[data-slot="time-grid-body"]') as HTMLElement
    expect(grid.style.height).toBe(`${(24 - 4) * PX_PER_HOUR}px`)
  })

  it('keeps the default 6am–10pm window when the day fits inside it', () => {
    const { container } = render(<DayView orgSlug="acme" items={items} ymd={ymd} today={ymd} />)
    const grid = container.querySelector('[data-slot="time-grid-body"]') as HTMLElement
    expect(grid.style.height).toBe(`${(22 - DAY_START_HOUR) * PX_PER_HOUR}px`)
  })
})
