import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgendaRail } from '@/components/admin/today/AgendaRail'
import type { Agenda } from '@/lib/today-moves'

const agenda: Agenda = {
  today: [{ eventId: 'e1', slug: 'smith-wedding', name: 'Smith Wedding', date: '2026-08-05', headcount: 120, multiDay: false }],
  upcoming: [{ eventId: 'e2', slug: 'gala', name: 'Fall Gala', date: '2026-08-07', multiDay: true }],
  windowDays: ['2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12'],
}

describe('AgendaRail', () => {
  it('shows today’s booked events with their details', () => {
    render(<AgendaRail orgSlug="acme" agenda={agenda} />)
    expect(screen.getByRole('link', { name: 'Smith Wedding' })).toHaveAttribute('href', '/acme/smith-wedding/dashboard')
    expect(screen.getByText('120 guests')).toBeInTheDocument()
    expect(screen.getByText('multi-day')).toBeInTheDocument()
  })

  it('renders only the window days that have items, plus the calendar link', () => {
    render(<AgendaRail orgSlug="acme" agenda={agenda} />)
    // Only 2026-08-07 (Fall Gala) has an item; the other 6 window days should render no row at all.
    expect(screen.getByRole('link', { name: 'Fall Gala' })).toBeInTheDocument()
    expect(screen.getAllByText('multi-day')).toHaveLength(1)
    expect(screen.queryByText('Nothing booked')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the Events calendar' })).toHaveAttribute('href', '/acme/calendar')
  })

  it('shows the quiet empty state when nothing is booked today', () => {
    render(<AgendaRail orgSlug="acme" agenda={{ ...agenda, today: [] }} />)
    expect(screen.getByText('Nothing booked today.')).toBeInTheDocument()
  })

  it('shows a single empty state when the whole week is empty', () => {
    render(<AgendaRail orgSlug="acme" agenda={{ ...agenda, upcoming: [] }} />)
    expect(screen.getByText('Nothing on the books this week')).toBeInTheDocument()
  })
})
