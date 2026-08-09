import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CalendarWeekClient } from '@/components/admin/calendar/CalendarWeekClient'
import type { CalendarItem } from '@/lib/calendar'

const items: CalendarItem[] = [
  { id: 'e1', title: 'Mission Co-op', date: '2026-08-10', kind: 'event', href: '/acme/mission/dashboard', detail: '165 guests', headcount: 165 },
  { id: 'l1', title: 'Farmers market stall', date: '2026-08-15', kind: 'lead', href: '/acme/leads/l1', tentative: true, detail: 'not booked' },
  { id: 't1', title: 'Confirm power access', date: '2026-08-11', kind: 'task', href: '/acme/leads/l2', detail: 'Alder & Vine' },
  { id: 'c1', title: 'Fire extinguisher tag expires', date: '2026-08-12', kind: 'compliance', href: '/acme/compliance', blocker: true, detail: 'blocks Mission Co-op' },
  { id: 'i1', title: 'Send Mission Co-op invoice', date: '2026-08-13', kind: 'invoice_due', href: '/acme/leads/l3', amount: 1567.5 },
  { id: 'far', title: 'Next month', date: '2026-09-20', kind: 'event', href: '/acme/next/dashboard' },
]

const props = {
  orgSlug: 'acme',
  items,
  today: '2026-08-12',
  weekFrom: '2026-08-10',
  view: 'week' as const,
  subscribeUrl: 'https://app.example/ics/acme/tok123',
}

describe('CalendarWeekClient — week view', () => {
  it('summarises the week: events, guests, blockers', () => {
    render(<CalendarWeekClient {...props} />)
    expect(screen.getByText('1 event · 165 guests · 1 blocker')).toBeInTheDocument()
  })

  it('splits time from owed: events and holds in the top band, the rest below', () => {
    render(<CalendarWeekClient {...props} />)
    expect(screen.getByRole('link', { name: /^Mission Co-op/ })).toHaveAttribute('href', '/acme/mission/dashboard')
    expect(screen.getByText('165 guests')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Farmers market stall/ })).toBeInTheDocument()
    expect(screen.getByText(/tentative · not booked/)).toBeInTheDocument()
    expect(screen.getByText('Owed')).toBeInTheDocument()
    expect(screen.getByText('Confirm power access')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Send Mission Co-op invoice/ })).toBeInTheDocument()
    expect(screen.getByText(/\$1,567.5/)).toBeInTheDocument()
  })

  it('keeps out-of-week items off the grid', () => {
    render(<CalendarWeekClient {...props} />)
    expect(screen.queryByText('Next month')).not.toBeInTheDocument()
  })

  it('week navigation links move by seven days from the shown week', () => {
    render(<CalendarWeekClient {...props} />)
    expect(screen.getByRole('link', { name: 'Previous week' })).toHaveAttribute('href', '/acme/calendar?week=2026-08-03')
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/acme/calendar?week=2026-08-12')
    expect(screen.getByRole('link', { name: 'Next week' })).toHaveAttribute('href', '/acme/calendar?week=2026-08-17')
  })

  it('opens the subscribe panel on demand', () => {
    render(<CalendarWeekClient {...props} />)
    expect(screen.queryByText('Calendar sync')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe in Outlook / Google' }))
    expect(screen.getByText('Calendar sync')).toBeInTheDocument()
    expect(screen.getByText('https://app.example/ics/acme/tok123')).toBeInTheDocument()
  })
})

describe('CalendarWeekClient — agenda view', () => {
  it('groups every item by month, out-of-week included', () => {
    render(<CalendarWeekClient {...props} view="agenda" />)
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Next month' })).toBeInTheDocument()
  })
})
