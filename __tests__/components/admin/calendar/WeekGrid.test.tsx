import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { WeekGrid } from '@/components/admin/calendar/WeekGrid'
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


// Monday-start week: 2026-08-17 (Mon) … 2026-08-23 (Sun)
const weekStart = '2026-08-17'

const items: CalendarItem[] = [
  { id: 'e1', title: 'Wedding', date: '2026-08-19', kind: 'event', href: '/acme/wedding/dashboard', start: '16:00', end: '20:00' },
  { id: 'i1', title: 'Deposit invoice', date: '2026-08-20', kind: 'invoice_due', href: '/acme/leads/l1', amount: 500 },
  { id: 'e2', title: 'Backyard job', date: '2026-08-21', kind: 'event', href: '/acme/backyard/dashboard' }, // no hours
  { id: 'far', title: 'Next week', date: '2026-08-31', kind: 'event', href: '/acme/next/dashboard' },
]

const bandCell = (c: HTMLElement, d: string) =>
  within(c.querySelector(`[data-slot="week-band-cell"][data-day="${d}"]`) as HTMLElement)
const bodyCell = (c: HTMLElement, d: string) =>
  within(c.querySelector(`[data-slot="week-body-cell"][data-day="${d}"]`) as HTMLElement)

describe('WeekGrid', () => {
  it('positions a timed event on the correct day column', () => {
    const { container } = render(
      <WeekGrid orgSlug="acme" items={items} weekStart={weekStart} today="2026-08-18" />
    )
    const wedding = bodyCell(container, '2026-08-19').getByText('Wedding').closest('a')!
    expect(wedding).toHaveStyle({ top: `${(16 - DAY_START_HOUR) * PX_PER_HOUR}px` })
  })

  it('places an hour-less event in the all-day band as "time TBD"', () => {
    const { container } = render(
      <WeekGrid orgSlug="acme" items={items} weekStart={weekStart} today="2026-08-18" />
    )
    expect(bandCell(container, '2026-08-21').getByText('Backyard job')).toBeInTheDocument()
    expect(bandCell(container, '2026-08-21').getByText(/time tbd/i)).toBeInTheDocument()
    // the due-date invoice sits in the band, not the grid
    expect(bandCell(container, '2026-08-20').getByText('Deposit invoice')).toBeInTheDocument()
  })

  it('keeps out-of-week items off the grid', () => {
    render(<WeekGrid orgSlug="acme" items={items} weekStart={weekStart} today="2026-08-18" />)
    expect(screen.queryByText('Next week')).not.toBeInTheDocument()
  })

  it('shows a multi-day event on its interior days even when it starts before the week', () => {
    const spanning: CalendarItem[] = [
      { id: 'span', title: 'Festival', date: '2026-08-15', endDate: '2026-08-19', kind: 'event', href: '/acme/fest' },
    ]
    // 08-15 is before the Mon 08-17 week start, but the span reaches into 08-18/08-19
    const { container } = render(
      <WeekGrid orgSlug="acme" items={spanning} weekStart={weekStart} today="2026-08-18" />
    )
    expect(bandCell(container, '2026-08-18').getByText('Festival')).toBeInTheDocument()
    // …and a week that only holds the tail of a span is NOT rendered as empty
    expect(screen.queryByText(/nothing on the calendar this week/i)).not.toBeInTheDocument()
  })

  it('links each day header to its day route, preserving ?kinds and ?view', () => {
    const { container } = render(
      <WeekGrid orgSlug="acme" items={items} weekStart={weekStart} today="2026-08-18" kinds="pipeline" view="week" />
    )
    const wed = container.querySelector('[data-slot="week-day-header"][data-day="2026-08-19"]')!
    expect(wed).toHaveAttribute('href', '/acme/calendar/2026-08-19?kinds=pipeline&view=week')
    expect(wed.textContent).toMatch(/19/)
  })

  it('marks the selected day', () => {
    const { container } = render(
      <WeekGrid orgSlug="acme" items={items} weekStart={weekStart} today="2026-08-18" selected="2026-08-19" />
    )
    const wed = container.querySelector('[data-slot="week-day-header"][data-day="2026-08-19"]')!
    expect(wed).toHaveAttribute('aria-current', 'date')
  })

  it('renders one specific CTA when the whole week is empty', () => {
    render(<WeekGrid orgSlug="acme" items={[]} weekStart={weekStart} today="2026-08-18" />)
    expect(screen.getByText(/nothing on the calendar this week/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /book a job/i })).toHaveAttribute('href', '/acme/new-event?date=2026-08-17')
  })
})
