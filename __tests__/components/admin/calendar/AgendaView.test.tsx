import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgendaView } from '@/components/admin/calendar/AgendaView'
import type { CalendarItem } from '@/lib/calendar'

const items: CalendarItem[] = [
  { id: 'e1', title: 'Wedding', date: '2026-08-19', kind: 'event', href: '/acme/wedding/dashboard' },
  { id: 'i1', title: 'Deposit invoice', date: '2026-08-20', kind: 'invoice_due', href: '/acme/leads/l1', amount: 500 },
  { id: 'far', title: 'Autumn gala', date: '2026-09-05', kind: 'event', href: '/acme/gala/dashboard' },
]

describe('AgendaView', () => {
  it('groups the whole feed by month', () => {
    render(<AgendaView orgSlug="acme" items={items} />)
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wedding' })).toHaveAttribute('href', '/acme/wedding/dashboard')
  })

  it('shows an invoice amount alongside its row', () => {
    render(<AgendaView orgSlug="acme" items={items} />)
    expect(screen.getByText('$500')).toBeInTheDocument()
  })

  // The old multi-select "Reschedule / Tag" toolbar was inert (no handler was ever
  // wired), so it was removed rather than shipped as no-op controls. Bulk agenda
  // actions are a documented fast-follow.
  it('renders no inert bulk controls', () => {
    render(<AgendaView orgSlug="acme" items={items} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reschedule/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /tag/i })).not.toBeInTheDocument()
  })

  it('renders one specific CTA when the feed is empty', () => {
    render(<AgendaView orgSlug="acme" items={[]} />)
    expect(screen.getByText(/nothing on the calendar/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /book a job/i })).toHaveAttribute('href', '/acme/new-event')
  })
})
