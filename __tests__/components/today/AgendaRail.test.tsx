import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgendaRail } from '@/components/admin/today/AgendaRail'
import type { Agenda, AgendaOps } from '@/lib/today-moves'

const agenda: Agenda = {
  today: [{ eventId: 'e1', slug: 'smith-wedding', name: 'Smith Wedding', date: '2026-08-05', daysUntil: 0, headcount: 120, multiDay: false }],
  upcoming: [{ eventId: 'e2', slug: 'gala', name: 'Fall Gala', date: '2026-08-07', daysUntil: 2, multiDay: true }],
  windowDays: ['2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12'],
}

describe('AgendaRail', () => {
  it('pins today’s first event as the Next job block, deep-linking to the brief', () => {
    render(<AgendaRail orgSlug="acme" agenda={agenda} />)
    expect(screen.getByText('Next job')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Smith Wedding/ })).toHaveAttribute('href', '/acme/smith-wedding/dashboard')
    expect(screen.getByText(/120 guests/)).toBeInTheDocument()
    // The pinned block IS today's only booking — no false empty state beneath it.
    expect(screen.queryByText('Nothing booked today.')).not.toBeInTheDocument()
    expect(screen.queryByText('On the cart today')).not.toBeInTheDocument()
  })

  it('on a multi-job day pins today[0] (buildAgenda sorts by start) and demotes the rest to Also today', () => {
    const twoToday: Agenda = {
      ...agenda,
      today: [
        { eventId: 'am', slug: 'am', name: 'Morning Market', date: '2026-08-05', daysUntil: 0, multiDay: false },
        { eventId: 'pm', slug: 'pm', name: 'Evening Gala', date: '2026-08-05', daysUntil: 0, multiDay: false },
      ],
    }
    render(<AgendaRail orgSlug="acme" agenda={twoToday} />)
    // The pinned block is the FIRST entry — buildAgenda's physical-start order.
    const pinned = screen.getByText('Next job').closest('a')
    expect(pinned).toHaveAttribute('href', '/acme/am/dashboard')
    expect(pinned).toHaveTextContent('Morning Market')
    expect(screen.getByText('Also today')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Evening Gala' })).toHaveAttribute('href', '/acme/pm/dashboard')
    // A labeled complementary landmark, so AT users can jump straight to it.
    expect(screen.getByRole('complementary', { name: 'Agenda' })).toBeInTheDocument()
  })

  it('renders only the window days that have items, plus the calendar link', () => {
    render(<AgendaRail orgSlug="acme" agenda={agenda} />)
    // Only 2026-08-07 (Fall Gala) has an item; the other 6 window days should render no row at all.
    expect(screen.getByRole('link', { name: 'Fall Gala' })).toBeInTheDocument()
    expect(screen.getAllByText('multi-day')).toHaveLength(1)
    expect(screen.queryByText('Nothing booked')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the Events calendar' })).toHaveAttribute('href', '/acme/calendar')
  })

  it('pins the first upcoming event when nothing is booked today', () => {
    render(<AgendaRail orgSlug="acme" agenda={{ ...agenda, today: [] }} />)
    expect(screen.getByRole('link', { name: /Fall Gala/ })).toHaveAttribute('href', '/acme/gala/dashboard')
    expect(screen.getByText('Nothing booked today.')).toBeInTheDocument()
    // The pinned entry leaves the day list — Fall Gala appears exactly once.
    expect(screen.getAllByText(/Fall Gala/)).toHaveLength(1)
  })

  it('shows a single empty state when the whole week is empty', () => {
    render(<AgendaRail orgSlug="acme" agenda={{ ...agenda, upcoming: [] }} />)
    expect(screen.getByText('Nothing on the books this week')).toBeInTheDocument()
  })

  it('interprets readiness on the pinned job — verdict chip plus packed line, never a bare %', () => {
    const ops: AgendaOps = {
      hasPlan: true,
      readiness: { days_until: 0, done: 3, total: 5, pct: 60, overdue: 2 },
      packed: { done: 2, total: 3 },
    }
    render(<AgendaRail orgSlug="acme" agenda={{ ...agenda, today: [{ ...agenda.today[0], ops }] }} />)
    expect(screen.getByText('Not ready · 2 overdue')).toBeInTheDocument()
    expect(screen.getByText('2 of 3 packed')).toBeInTheDocument()
    expect(screen.queryByText(/60/)).not.toBeInTheDocument()
  })

  it('says Ready when everything trackable is done', () => {
    const ops: AgendaOps = {
      hasPlan: true,
      readiness: { days_until: 0, done: 5, total: 5, pct: 100, overdue: 0 },
      packed: { done: 3, total: 3 },
    }
    render(<AgendaRail orgSlug="acme" agenda={{ ...agenda, today: [{ ...agenda.today[0], ops }] }} />)
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('3 of 3 packed')).toBeInTheDocument()
  })

  it('a client job without a plan says so; an unread event claims nothing', () => {
    render(
      <AgendaRail orgSlug="acme" agenda={{ ...agenda, today: [{ ...agenda.today[0], ops: { hasPlan: false } }] }} />
    )
    expect(screen.getByText('No ops plan yet')).toBeInTheDocument()
    // e2 carries no ops (never read) — its compact row shows no risk chip.
    expect(screen.queryByText('No plan')).not.toBeInTheDocument()
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  })

  it('flags at-risk compact rows with a short chip', () => {
    const ops: AgendaOps = {
      hasPlan: true,
      readiness: { days_until: 2, done: 1, total: 4, pct: 25, overdue: 1 },
      packed: { done: 0, total: 2 },
    }
    render(<AgendaRail orgSlug="acme" agenda={{ ...agenda, upcoming: [{ ...agenda.upcoming[0], ops }] }} />)
    expect(screen.getByText('1 overdue')).toBeInTheDocument()
  })
})
