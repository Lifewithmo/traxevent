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

  it('renders every window day, empty ones included, plus the calendar link', () => {
    render(<AgendaRail orgSlug="acme" agenda={agenda} />)
    expect(screen.getAllByText('Nothing booked')).toHaveLength(6)
    expect(screen.getByRole('link', { name: 'Open the Events calendar' })).toHaveAttribute('href', '/acme/calendar')
  })

  it('shows the quiet empty state when nothing is booked today', () => {
    render(<AgendaRail orgSlug="acme" agenda={{ ...agenda, today: [] }} />)
    expect(screen.getByText('Nothing booked today.')).toBeInTheDocument()
  })
})
