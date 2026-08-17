import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RunwayStrip } from '@/components/admin/calendar/RunwayStrip'
import type { RunwayJob } from '@/lib/calendar-cashflow'

const jobs: RunwayJob[] = [
  { eventId: 'e1', title: 'Alder wedding', date: '2026-08-22', inflowBefore: 8000, dueAfter: 2000 },
  { eventId: 'e2', title: 'Mission gala', date: '2026-09-05', inflowBefore: 0, dueAfter: 5000 },
]

describe('RunwayStrip', () => {
  it('lists upcoming booked jobs with the receivables landing before each', () => {
    render(<RunwayStrip orgSlug="acme" runway={jobs} />)
    expect(screen.getByText('Alder wedding')).toBeInTheDocument()
    expect(screen.getByText('$8,000')).toBeInTheDocument()
    // receivables-timing wording — "before this job", never "profit"/"P&L".
    expect(screen.getAllByText(/before this job/i).length).toBeGreaterThan(0)
  })

  it('labels the strip as receivables timing, never profit or P&L', () => {
    const { container } = render(<RunwayStrip orgSlug="acme" runway={jobs} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/profit/i)
    expect(text).not.toMatch(/P&L/i)
    // it must name what the number is — money owed / expected to land.
    expect(text).toMatch(/expected|owed|lands|before/i)
  })

  it('links each row to that job’s day, preserving params via dayHref', () => {
    render(
      <RunwayStrip
        orgSlug="acme"
        runway={jobs}
        dayHref={(ymd) => `/acme/calendar/${ymd}?view=week&kinds=pipeline`}
      />
    )
    const row = screen.getByText('Alder wedding').closest('a')!
    expect(row).toHaveAttribute('href', '/acme/calendar/2026-08-22?view=week&kinds=pipeline')
  })

  it('defaults each row link to the plain day route when no dayHref is given', () => {
    render(<RunwayStrip orgSlug="acme" runway={jobs} />)
    const row = screen.getByText('Mission gala').closest('a')!
    expect(row).toHaveAttribute('href', '/acme/calendar/2026-09-05')
  })

  it('renders a single specific CTA when there are no booked jobs ahead', () => {
    render(<RunwayStrip orgSlug="acme" runway={[]} />)
    expect(screen.getByText(/no booked jobs ahead/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open (the )?pipeline/i })).toHaveAttribute('href', '/acme/leads')
  })

  it('caps the visible rows and notes the remainder', () => {
    const many: RunwayJob[] = Array.from({ length: 8 }, (_, i) => ({
      eventId: `e${i}`,
      title: `Job ${i}`,
      date: `2026-09-0${(i % 9) + 1}`,
      inflowBefore: 100 * i,
      dueAfter: 0,
    }))
    render(<RunwayStrip orgSlug="acme" runway={many} />)
    // Miller: keep the visible list to a scannable few.
    const list = screen.getByRole('list', { name: /runway/i })
    expect(within(list).getAllByRole('listitem').length).toBeLessThanOrEqual(5)
    expect(screen.getByText(/\+3 more/i)).toBeInTheDocument()
  })
})
