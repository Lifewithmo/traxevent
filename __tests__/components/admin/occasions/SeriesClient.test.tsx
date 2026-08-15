import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const updateSeriesSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const extendSeriesSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ created: 2 }))
const endSeriesSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ archived: 1 }))
const updateEventSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/actions/series', () => ({ updateSeries: updateSeriesSpy, extendSeries: extendSeriesSpy, endSeries: endSeriesSpy }))
vi.mock('@/actions/events', () => ({ updateEvent: updateEventSpy }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { SeriesClient } from '@/components/admin/occasions/SeriesClient'

const SERIES = {
  id: 's1', name: 'Boise Farmers Market', kind: 'market_day' as const,
  location: { name: 'Capitol Blvd' }, hours: { start: '08:00', end: '13:00' },
  recurrence: { freq: 'weekly' as const, weekday: 6, from: '2026-05-02', until: '2026-05-16' },
  booth_fee: 45, active: true, created_at: 'x',
}
const DAYS = [
  { id: 'd1', name: 'Boise Farmers Market', slug: 'bfm-1', year: 2026, status: 'active' as const, event_type_id: 'event', event_start: '2026-05-02', event_end: '2026-05-02', created_at: 'x', kind: 'market_day' as const, series_id: 's1' },
  { id: 'd2', name: 'Boise Farmers Market', slug: 'bfm-2', year: 2026, status: 'archived' as const, event_type_id: 'event', event_start: '2026-05-09', event_end: '2026-05-09', created_at: 'x', kind: 'market_day' as const, series_id: 's1' },
]

describe('SeriesClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the cadence, day rows with status, and links each day', () => {
    render(<SeriesClient orgId="org-1" orgSlug="acme" series={SERIES} days={DAYS} isAdmin />)
    expect(screen.getByText(/every saturday/i)).toBeInTheDocument()
    const row = screen.getByTestId('day-d2')
    expect(within(row).getByText(/skipped/i)).toBeInTheDocument()
    expect(within(screen.getByTestId('day-d1')).getByRole('link')).toHaveAttribute('href', '/acme/bfm-1/dashboard')
  })

  it('renders new days once the days prop is extended (list is prop-derived)', () => {
    const { rerender } = render(<SeriesClient orgId="org-1" orgSlug="acme" series={SERIES} days={DAYS} isAdmin />)
    expect(screen.queryByTestId('day-d3')).not.toBeInTheDocument()
    const extended = [
      ...DAYS,
      { id: 'd3', name: 'Boise Farmers Market', slug: 'bfm-3', year: 2026, status: 'active' as const, event_type_id: 'event', event_start: '2026-05-16', event_end: '2026-05-16', created_at: 'x', kind: 'market_day' as const, series_id: 's1' },
    ]
    rerender(<SeriesClient orgId="org-1" orgSlug="acme" series={SERIES} days={extended} isAdmin />)
    expect(screen.getByTestId('day-d3')).toBeInTheDocument()
  })

  it('skips a day after confirm and dims it optimistically', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SeriesClient orgId="org-1" orgSlug="acme" series={SERIES} days={DAYS} isAdmin />)
    const row = screen.getByTestId('day-d1')
    fireEvent.click(within(row).getByRole('button', { name: /skip/i }))
    await waitFor(() => expect(updateEventSpy).toHaveBeenCalledWith('org-1', 'd1', { status: 'archived' }))
    await waitFor(() => expect(within(row).getByText(/skipped/i)).toBeInTheDocument())
    expect(row.className).toMatch(/opacity-60/)
    confirmSpy.mockRestore()
  })

  it('saves edits with propagation when the checkbox is on', async () => {
    render(<SeriesClient orgId="org-1" orgSlug="acme" series={SERIES} days={DAYS} isAdmin />)
    fireEvent.click(screen.getByRole('button', { name: /edit series/i }))
    fireEvent.change(screen.getByLabelText(/booth fee/i), { target: { value: '55' } })
    fireEvent.click(screen.getByLabelText(/apply to remaining days/i))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(updateSeriesSpy).toHaveBeenCalledWith('org-1', 's1',
      expect.objectContaining({ booth_fee: 55 }), { propagate: true }))
  })

  it('keeps the edit panel open and shows the error when Save fails', async () => {
    updateSeriesSpy.mockRejectedValueOnce(new Error('boom'))
    render(<SeriesClient orgId="org-1" orgSlug="acme" series={SERIES} days={DAYS} isAdmin />)
    fireEvent.click(screen.getByRole('button', { name: /edit series/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument())
    expect(screen.getByLabelText(/booth fee/i)).toBeInTheDocument()
  })

  it('extends and ends the season', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SeriesClient orgId="org-1" orgSlug="acme" series={SERIES} days={DAYS} isAdmin />)
    fireEvent.change(screen.getByLabelText(/extend through/i), { target: { value: '2026-06-27' } })
    fireEvent.click(screen.getByRole('button', { name: /extend/i }))
    await waitFor(() => expect(extendSeriesSpy).toHaveBeenCalledWith('org-1', 's1', '2026-06-27'))
    await waitFor(() => expect(screen.getByLabelText(/extend through/i)).toHaveValue(''))
    fireEvent.click(screen.getByRole('button', { name: /end season/i }))
    await waitFor(() => expect(endSeriesSpy).toHaveBeenCalledWith('org-1', 's1'))
    confirmSpy.mockRestore()
  })
})
