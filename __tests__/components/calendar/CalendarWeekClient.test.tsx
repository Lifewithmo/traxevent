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

/** What `filterFeed(feed, PIPELINE_KINDS)` can actually yield — no events, no invoices. */
const pipelineItems: CalendarItem[] = [
  { id: 't1', title: 'Confirm power access', date: '2026-08-11', kind: 'task', href: '/acme/leads/l2', detail: 'Alder & Vine' },
  { id: 'f1', title: 'Follow up: Dana', date: '2026-08-14', kind: 'follow_up', href: '/acme/leads/l4', detail: 'waiting on venue' },
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
    expect(within(tile('Due this week')).getByText('$1,567.50')).toBeInTheDocument()
    expect(within(tile('Due this week')).getByText('nothing overdue')).toBeInTheDocument()
    // blocker + past-due task + invoice + tentative hold across the whole feed
    expect(within(tile('Needs attention')).getByText('4')).toBeInTheDocument()
    expect(within(tile('Needs attention')).getByText('1 blocking · next 30 days')).toBeInTheDocument()
    // the old duplicated prose summary is gone
    expect(screen.queryByText('1 event · 165 guests · 1 blocker')).not.toBeInTheDocument()
  })

  it('keeps the week-scoped band and week stepping off the agenda', () => {
    render(<CalendarWeekClient {...props} view="agenda" />)
    // the agenda lists the whole feed by month, so "this week" figures would
    // describe something the reader is not looking at
    expect(document.body.querySelector('[data-slot="kpi-band"]')).toBeNull()
    expect(screen.queryByText('Due this week')).not.toBeInTheDocument()
    // week stepping moved nothing on this view, so it is gone too
    expect(screen.queryByRole('link', { name: 'Previous week' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Agenda' })).toBeInTheDocument()
    // the feed-scoped rail still answers "what should I go fix"
    expect(rail().getByRole('heading', { name: 'Blocking a booked event' })).toBeInTheDocument()
  })

  it('promotes the week’s own blocker count beside the Owed band', () => {
    render(<CalendarWeekClient {...props} />)
    // week-scoped, so it stays true however far ahead the operator pages —
    // unlike the feed-scoped "Needs attention" tile
    expect(grid().getByRole('heading', { name: /Owed\s+1 blocker this week/ })).toBeInTheDocument()
  })

  it('shows a pipeline-shaped band instead of claiming nothing is booked or due', () => {
    // the real filtered feed — with the unfiltered fixture these assertions
    // could pass even if `scope` were ignored entirely
    render(<CalendarWeekClient {...props} items={pipelineItems} scope="pipeline" undated={3} />)
    expect(screen.getByText('Holds')).toBeInTheDocument()
    expect(within(tile('Tasks due')).getByText('2')).toBeInTheDocument()
    expect(within(tile('Undated')).getByText('3')).toBeInTheDocument()
    // the filtered-out kinds must not be asserted as absent
    expect(screen.queryByText('Events')).not.toBeInTheDocument()
    expect(screen.queryByText('Due this week')).not.toBeInTheDocument()
    expect(screen.queryByText('nothing booked')).not.toBeInTheDocument()
    expect(screen.queryByText('nothing due')).not.toBeInTheDocument()
    // …and the legend drops the swatches that mode can never produce
    expect(grid().queryByText('Booked event')).not.toBeInTheDocument()
    expect(grid().queryByText('Blocker')).not.toBeInTheDocument()
    expect(grid().getByText('Task / follow-up')).toBeInTheDocument()
  })

  // The stacked fallback is a separate string from the band and was missed by
  // the first pipeline pass — in a mode that filters events out, "Nothing booked
  // this week" is the same falsehood the band was fixed to stop telling.
  it('never says "nothing booked" in a mode that filters bookings out', () => {
    render(<CalendarWeekClient {...props} items={pipelineItems} scope="pipeline" />)
    expect(screen.queryByText('Nothing booked this week.')).not.toBeInTheDocument()
    expect(screen.getByText('No dates held this week.')).toBeInTheDocument()
  })

  it('keeps every navigation control on the active filter', () => {
    render(<CalendarWeekClient {...props} items={pipelineItems} scope="pipeline" />)
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href')
    expect(href('Previous week')).toBe('/acme/calendar?kinds=pipeline&week=2026-08-03')
    expect(href('Today')).toBe('/acme/calendar?kinds=pipeline&week=2026-08-12')
    expect(href('Next week')).toBe('/acme/calendar?kinds=pipeline&week=2026-08-17')
    const tabs = within(screen.getByRole('navigation', { name: 'Calendar view' }))
    expect(tabs.getByRole('link', { name: 'Week' })).toHaveAttribute(
      'href',
      '/acme/calendar?kinds=pipeline&week=2026-08-10&view=week'
    )
    expect(tabs.getByRole('link', { name: 'Agenda' })).toHaveAttribute(
      'href',
      '/acme/calendar?kinds=pipeline&week=2026-08-10&view=agenda'
    )
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

  // Below lg the 7 columns stack, empty days drop out, and only the last day
  // that is actually SHOWN loses its bottom rule — `last:` would pick the DOM-last
  // cell, which is usually hidden, doubling a hairline against the band border.
  it('stacks the grid below lg: empty days hidden, rules on all but the last shown day', () => {
    const { container } = render(<CalendarWeekClient {...props} />)
    const bands = container.querySelectorAll('section[aria-label="Week grid"] > div.grid')
    expect(bands).toHaveLength(2)

    // `md:border-b-0` contains the substring "border-b", so compare class TOKENS
    const has = (el: Element, cls: string) => el.classList.contains(cls)

    // time band: event Mon 10 (0) … hold Sat 15 (5); Sun 16 (6) is empty
    const time = Array.from(bands[0].children)
    expect(time).toHaveLength(7)
    expect(has(time[0], 'border-b')).toBe(true)
    expect(has(time[5], 'border-b')).toBe(false) // last shown day — no doubled rule
    expect(has(time[6], 'hidden')).toBe(true)
    expect(has(time[6], 'lg:block')).toBe(true)

    // owed band: task Tue 11 (1), compliance Wed 12 (2), invoice Thu 13 (3)
    const owed = Array.from(bands[1].children)
    expect(has(owed[1], 'border-b')).toBe(true)
    expect(has(owed[3], 'border-b')).toBe(false)
    expect(has(owed[0], 'hidden')).toBe(true)

    // today (Wed 12, index 2) has NO time items but must never be dropped —
    // "you are here" is the point of the screen and the marker row is desktop-only
    expect(has(time[2], 'hidden')).toBe(false)
    expect(within(time[2] as HTMLElement).getByText(/today/)).toBeInTheDocument()

    // the desktop column rule sits on every cell but the seventh, so the
    // section never ends on a stray hairline
    for (const cell of [...time.slice(0, 6), ...owed.slice(0, 6)]) {
      expect(has(cell, 'lg:border-r')).toBe(true)
    }
    expect(has(time[6], 'lg:border-r')).toBe(false)
    expect(has(owed[6], 'lg:border-r')).toBe(false)
  })
})

describe('CalendarWeekClient — agenda view', () => {
  it('groups every item by month, out-of-week included', () => {
    render(<CalendarWeekClient {...props} view="agenda" />)
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Next month' })).toBeInTheDocument()
  })

  it('shows a feed-wide empty state and CTA when nothing is scheduled', () => {
    render(<CalendarWeekClient {...props} items={[]} view="agenda" />)
    expect(screen.queryByText('Nothing scheduled yet.')).not.toBeInTheDocument()
    // the agenda spans the whole feed, so the copy must not say "this week"
    expect(screen.getByText('Nothing on the calendar')).toBeInTheDocument()
    expect(screen.queryByText('Nothing on the calendar this week')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the pipeline' })).toHaveAttribute('href', '/acme/leads')
  })
})
