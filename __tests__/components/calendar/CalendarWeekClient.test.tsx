import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
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

/** The grid and the rail both list some of the same items — always scope. */
const grid = () => within(screen.getByRole('region', { name: 'Week grid' }))
const rail = () => within(screen.getByRole('complementary'))
// "Needs attention" is both a KPI tile label and the rail heading — scope to the band.
const tile = (label: string) => {
  const band = document.body.querySelector('[data-slot="kpi-band"]') as HTMLElement
  return within(band).getByText(label).closest('[data-slot="stat-tile"]') as HTMLElement
}

describe('CalendarWeekClient — week view', () => {
  it('summarises the week on the KPI band rather than a prose line', () => {
    render(<CalendarWeekClient {...props} />)
    expect(within(tile('Events')).getByText('1')).toBeInTheDocument()
    // the hold is additive to the booked event, not a subset of it
    expect(within(tile('Events')).getByText('+1 tentative hold')).toBeInTheDocument()
    expect(within(tile('Guests')).getByText('165')).toBeInTheDocument()
    expect(within(tile('Guests')).getByText('across 1 event')).toBeInTheDocument()
    expect(within(tile('Due this week')).getByText('$1,567.5')).toBeInTheDocument()
    expect(within(tile('Due this week')).getByText('nothing overdue')).toBeInTheDocument()
    // blocker + past-due task + invoice + tentative hold across the whole feed
    expect(within(tile('Needs attention')).getByText('4')).toBeInTheDocument()
    expect(within(tile('Needs attention')).getByText('1 blocking')).toBeInTheDocument()
    // the old duplicated prose summary is gone
    expect(screen.queryByText('1 event · 165 guests · 1 blocker')).not.toBeInTheDocument()
  })

  it('renders the KPI band in the agenda view too', () => {
    render(<CalendarWeekClient {...props} view="agenda" />)
    expect(screen.getByText('Due this week')).toBeInTheDocument()
    expect(within(tile('Needs attention')).getByText('4')).toBeInTheDocument()
  })

  it('splits time from owed: events and holds in the top band, the rest below', () => {
    render(<CalendarWeekClient {...props} />)
    const g = grid()
    expect(g.getByRole('link', { name: /^Mission Co-op/ })).toHaveAttribute('href', '/acme/mission/dashboard')
    expect(g.getByText('165 guests')).toBeInTheDocument()
    expect(g.getByRole('link', { name: /Farmers market stall/ })).toBeInTheDocument()
    expect(g.getByText(/tentative · not booked/)).toBeInTheDocument()
    expect(g.getByText('Owed')).toBeInTheDocument()
    expect(g.getByText('Confirm power access')).toBeInTheDocument()
    expect(g.getByRole('link', { name: /Send Mission Co-op invoice/ })).toBeInTheDocument()
    expect(g.getByText(/\$1,567\.5/)).toBeInTheDocument()
  })

  it('keeps out-of-week items off the grid', () => {
    render(<CalendarWeekClient {...props} />)
    expect(grid().queryByText('Next month')).not.toBeInTheDocument()
  })

  it('lists the blocker and the invoice on the attention rail', () => {
    render(<CalendarWeekClient {...props} />)
    const r = rail()
    expect(r.getByRole('heading', { name: 'Blocking a booked event' })).toBeInTheDocument()
    expect(r.getByRole('link', { name: /Fire extinguisher tag expires/ })).toHaveAttribute('href', '/acme/compliance')
    expect(r.getByRole('heading', { name: 'Money owed' })).toBeInTheDocument()
    expect(r.getByRole('link', { name: /Send Mission Co-op invoice/ })).toHaveAttribute('href', '/acme/leads/l3')
    // scans the whole feed, not just the shown week — the past-due task is here
    expect(r.getByRole('heading', { name: 'Past due' })).toBeInTheDocument()
    expect(r.getByRole('link', { name: /Confirm power access/ })).toBeInTheDocument()
  })

  it('week navigation links move by seven days from the shown week', () => {
    render(<CalendarWeekClient {...props} />)
    expect(screen.getByRole('link', { name: 'Previous week' })).toHaveAttribute('href', '/acme/calendar?week=2026-08-03')
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/acme/calendar?week=2026-08-12')
    expect(screen.getByRole('link', { name: 'Next week' })).toHaveAttribute('href', '/acme/calendar?week=2026-08-17')
  })

  it('drives the view switch off the URL through the shared tab group', () => {
    render(<CalendarWeekClient {...props} />)
    const tabs = within(screen.getByRole('navigation', { name: 'Calendar view' }))
    expect(tabs.getByRole('link', { name: 'Week' })).toHaveAttribute('href', '/acme/calendar?week=2026-08-10&view=week')
    expect(tabs.getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/acme/calendar?week=2026-08-10&view=agenda')
    expect(tabs.getByRole('link', { name: 'Week' })).toHaveAttribute('aria-current', 'page')
    expect(tabs.getByRole('link', { name: 'Agenda' })).not.toHaveAttribute('aria-current')
  })

  it('opens the subscribe panel on demand', () => {
    render(<CalendarWeekClient {...props} />)
    expect(screen.queryByText('Calendar sync')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe in Outlook / Google' }))
    expect(screen.getByText('Calendar sync')).toBeInTheDocument()
    expect(screen.getByText('https://app.example/ics/acme/tok123')).toBeInTheDocument()
  })

  it('offers one way out when the shown week is empty, keeping the day headers', () => {
    render(<CalendarWeekClient {...props} items={[]} />)
    const g = grid()
    expect(g.getByText('Nothing on the calendar this week')).toBeInTheDocument()
    expect(g.getByText('Booked events, holds, tasks and invoice due dates all land here.')).toBeInTheDocument()
    expect(g.getByRole('link', { name: 'Open the pipeline' })).toHaveAttribute('href', '/acme/leads')
    expect(g.queryByText('Owed')).not.toBeInTheDocument()
    // an empty week is still a week — the day headers stay
    expect(g.getByText(/Mon/)).toBeInTheDocument()
  })

  it('renders the footnote under the left column', () => {
    render(<CalendarWeekClient {...props} footnote={<p>3 open opportunities have no date yet</p>} />)
    expect(screen.getByText('3 open opportunities have no date yet')).toBeInTheDocument()
  })
})

describe('CalendarWeekClient — agenda view', () => {
  it('groups every item by month, out-of-week included', () => {
    render(<CalendarWeekClient {...props} view="agenda" />)
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Next month' })).toBeInTheDocument()
  })

  it('shows the same empty state and CTA when nothing is scheduled', () => {
    render(<CalendarWeekClient {...props} items={[]} view="agenda" />)
    expect(screen.queryByText('Nothing scheduled yet.')).not.toBeInTheDocument()
    expect(screen.getByText('Nothing on the calendar this week')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the pipeline' })).toHaveAttribute('href', '/acme/leads')
  })
})
