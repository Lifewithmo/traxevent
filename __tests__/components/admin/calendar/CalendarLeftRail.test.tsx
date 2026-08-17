import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { WeekRollup } from '@/lib/calendar-week'
import type { RunwayJob } from '@/lib/calendar-cashflow'

// The rail preserves ?view/?kinds by reading them client-side (a server layout
// can't take searchParams). Selected day comes from the /calendar/[ymd] path.
let pathname = '/acme/calendar/2026-08-20'
// A STALE week param is in the URL (the week of Jul 30–Aug 5), different from the
// days the rail links to — day-targeting links must not forward it.
const search = new URLSearchParams('view=week&kinds=pipeline&week=2026-08-03')
vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
  usePathname: () => pathname,
}))

import { CalendarLeftRail } from '@/components/admin/calendar/CalendarLeftRail'

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

const runway: RunwayJob[] = [
  { eventId: 'e1', title: 'Alder wedding', date: '2026-08-22', inflowBefore: 8000, dueAfter: 2000 },
]

const baseProps = { orgSlug: 'acme', today: '2026-08-18' }

describe('CalendarLeftRail', () => {
  beforeEach(() => {
    pathname = '/acme/calendar/2026-08-20'
  })

  it('surfaces the Booked-$ KPI from rollup.bookedValue', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup({ bookedValue: 12400 })} runway={runway} />)
    expect(screen.getByText('Booked')).toBeInTheDocument()
    expect(screen.getByText('$12,400')).toBeInTheDocument()
  })

  it('renders the runway strip fed by buildRunway output', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    expect(screen.getByText('Alder wedding')).toBeInTheDocument()
    expect(screen.getByText('$8,000')).toBeInTheDocument()
  })

  it('mini-month day links preserve ?view and ?kinds and route to /calendar/[ymd]', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    // The rail shows the selected day's month (Aug 2026).
    const grid = screen.getByRole('grid', { name: /mini calendar/i })
    const cell = within(grid).getByRole('link', { name: /15/ })
    expect(cell).toHaveAttribute('href', '/acme/calendar/2026-08-15?view=week&kinds=pipeline')
  })

  it('does NOT forward a stale ?week onto day-targeting links (mini-month + runway)', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    const grid = screen.getByRole('grid', { name: /mini calendar/i })
    const cell = within(grid).getByRole('link', { name: /15/ }) as HTMLAnchorElement
    // the URL carries week=2026-08-03, but the clicked day is in a different week —
    // forwarding it would make page.tsx render Jul 30–Aug 5 with the 15th invisible.
    expect(cell.getAttribute('href')).not.toContain('week=')
    const runwayRow = screen.getByText('Alder wedding').closest('a') as HTMLAnchorElement
    expect(runwayRow.getAttribute('href')).not.toContain('week=')
    expect(runwayRow.getAttribute('href')).toBe('/acme/calendar/2026-08-22?view=week&kinds=pipeline')
  })

  it('marks the selected day in the mini-month', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    const grid = screen.getByRole('grid', { name: /mini calendar/i })
    const cell = within(grid).getByRole('link', { name: /^20$/ })
    expect(cell).toHaveAttribute('aria-current', 'date')
  })

  it('kind filter preserves the day and view while toggling scope', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    const everything = screen.getByRole('link', { name: /everything/i })
    // toggling back to Everything drops ?kinds but keeps the day + view
    expect(everything).toHaveAttribute('href', '/acme/calendar/2026-08-20?view=week')
    const pipeline = screen.getByRole('link', { name: /pipeline only/i })
    expect(pipeline).toHaveAttribute('aria-current', 'page')
  })

  it('offers an ICS subscribe entry point that reveals the feed URL', () => {
    render(
      <CalendarLeftRail
        {...baseProps}
        rollup={rollup()}
        runway={runway}
        subscribeUrl="https://app.example/ics/acme/tok123"
      />
    )
    expect(screen.queryByText(/calendar sync/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }))
    expect(screen.getByText(/calendar sync/i)).toBeInTheDocument()
    expect(screen.getByText('https://app.example/ics/acme/tok123')).toBeInTheDocument()
  })

  it('lets the mini-month page months without leaving the day', () => {
    render(<CalendarLeftRail {...baseProps} rollup={rollup()} runway={runway} />)
    // Aug 2026 shown; step forward a month → September.
    expect(screen.getByText(/August 2026/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /next month/i }))
    expect(screen.getByText(/September 2026/i)).toBeInTheDocument()
  })
})
