import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarketDayOverview } from '@/components/admin/occasions/MarketDayOverview'
import type { Event } from '@/lib/types'

const EVENT: Event = {
  id: 'e1', name: 'City Market', slug: 'cm-1', year: 2026,
  status: 'active', event_type_id: 'event',
  event_start: '2026-08-23', event_end: '2026-08-23', created_at: 'x',
  kind: 'market_day', booth_fee: 35,
  location: { name: 'Capitol Plaza' }, hours: { start: '08:00', end: '13:00' },
} as Event

const base = { orgSlug: 'acme', event: EVENT, series: null, isAdmin: true }

describe('MarketDayOverview money tile', () => {
  it('pre-date: quiet fee tile, no CTA, and the apology paragraph is gone', () => {
    render(<MarketDayOverview {...base} today="2026-08-20" closeoutNet={null} />)
    expect(screen.getByText('$35 booth fee')).toBeInTheDocument()
    expect(screen.getByText('Closeout opens on the day.')).toBeInTheDocument()
    expect(screen.queryByText(/close out the day/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/next increment/i)).not.toBeInTheDocument()
  })

  it('day-of with no closeout: the tile IS the primary CTA, linking the lite route', () => {
    render(<MarketDayOverview {...base} today="2026-08-23" closeoutNet={null} />)
    const cta = screen.getByRole('link', { name: /close out the day/i })
    expect(cta).toHaveAttribute('href', '/acme/cm-1/closeout')
    expect(screen.getByText(/sales − \$35 booth fee = net/)).toBeInTheDocument()
  })

  it('after the day it stays a CTA — an unclosed day still owes its number', () => {
    render(<MarketDayOverview {...base} today="2026-09-01" closeoutNet={null} />)
    expect(screen.getByRole('link', { name: /close out the day/i })).toBeInTheDocument()
  })

  it('closed out: net with its interpretation and a view link — no CTA', () => {
    render(<MarketDayOverview {...base} today="2026-08-23" closeoutNet={141} />)
    expect(screen.getByText('Net $141')).toBeInTheDocument()
    expect(screen.getByText(/after the \$35 booth fee/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'view' })).toHaveAttribute('href', '/acme/cm-1/closeout')
    expect(screen.queryByRole('link', { name: /close out the day/i })).not.toBeInTheDocument()
  })

  it('a negative net renders as a loss, not a silent number', () => {
    render(<MarketDayOverview {...base} today="2026-08-23" closeoutNet={-15} />)
    expect(screen.getByText('Net −$15')).toBeInTheDocument()
  })

  it('non-admins keep the plain booth-fee tile and never see money or the CTA', () => {
    render(<MarketDayOverview {...base} isAdmin={false} today="2026-08-23" closeoutNet={null} />)
    expect(screen.getByText('Booth fee')).toBeInTheDocument()
    expect(screen.getByText('$35')).toBeInTheDocument()
    expect(screen.queryByText(/close out the day/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/net/i)).not.toBeInTheDocument()
  })
})
