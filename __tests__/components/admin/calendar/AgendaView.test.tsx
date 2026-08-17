import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

  it('reveals a bulk action bar once a row is selected', () => {
    render(<AgendaView orgSlug="acme" items={items} />)
    // no bar until something is picked
    expect(screen.queryByRole('button', { name: /reschedule/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /select wedding/i }))
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reschedule/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tag/i })).toBeInTheDocument()
  })

  it('passes the selected ids to the bulk handler', () => {
    const onBulk = vi.fn()
    render(<AgendaView orgSlug="acme" items={items} onBulk={onBulk} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /select wedding/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select deposit invoice/i }))
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /reschedule/i }))
    expect(onBulk).toHaveBeenCalledWith(['event:e1', 'invoice_due:i1'], 'reschedule')
  })

  it('toggling a row off hides the bar again', () => {
    render(<AgendaView orgSlug="acme" items={items} />)
    const box = screen.getByRole('checkbox', { name: /select wedding/i })
    fireEvent.click(box)
    expect(screen.getByRole('button', { name: /reschedule/i })).toBeInTheDocument()
    fireEvent.click(box)
    expect(screen.queryByRole('button', { name: /reschedule/i })).not.toBeInTheDocument()
  })

  it('renders one specific CTA when the feed is empty', () => {
    render(<AgendaView orgSlug="acme" items={[]} />)
    expect(screen.getByText(/nothing on the calendar/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /book a job/i })).toHaveAttribute('href', '/acme/new-event')
  })
})
