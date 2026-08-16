import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ClientQueueRail } from '@/components/admin/clients/ClientQueueRail'
import type { ClientRow } from '@/lib/crm/client-list'

vi.mock('next/navigation', () => ({ usePathname: () => '/acme/clients/vega' }))

// Minimal builder bound to the REAL ClientRow shape (nested customer/rollup) —
// not the flattened { customerId, name, company } sketch in the task brief.
function makeRow(over: {
  id: string
  name: string
  company?: string
  group: ClientRow['group']
  wonCount?: number
  lastEventDate?: string
  monthsSinceLastEvent?: number
  detail?: string
}): ClientRow {
  return {
    customer: { id: over.id, name: over.name, company: over.company, created_at: '2026-01-01T00:00:00.000Z' },
    rollup: {
      openCount: 0,
      wonCount: over.wonCount ?? 0,
      lostCount: 0,
      totalWonValue: 0,
      openValue: 0,
    },
    group: over.group,
    lastEventDate: over.lastEventDate,
    monthsSinceLastEvent: over.monthsSinceLastEvent,
    detail: over.detail ?? '',
  }
}

const rows: ClientRow[] = [
  makeRow({
    id: 'vega',
    name: 'Marisol Vega',
    company: 'Vega & Co.',
    group: 'booked_now',
    wonCount: 2,
    lastEventDate: '2026-07-01',
    monthsSinceLastEvent: 1,
    detail: 'Vega & Co. · 2 events',
  }),
  makeRow({ id: 'lund', name: 'Tessa Lund', company: '', group: 'never_booked' }),
  makeRow({
    id: 'reyes',
    name: 'Cass Reyes',
    company: 'Reyes Catering',
    group: 'dormant_repeat',
    wonCount: 3,
    lastEventDate: '2025-06-01',
    monthsSinceLastEvent: 14,
    detail: 'Reyes Catering · 3 events',
  }),
]

describe('ClientQueueRail', () => {
  it('filters the list by the search box', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(<ClientQueueRail orgSlug="acme" rows={rows} />)
    expect(screen.getByText('Marisol Vega')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText(/search clients/i), 'tessa')
    expect(screen.queryByText('Marisol Vega')).not.toBeInTheDocument()
    expect(screen.getByText('Tessa Lund')).toBeInTheDocument()
  })

  it('marks the row matching the current path as active', () => {
    render(<ClientQueueRail orgSlug="acme" rows={rows} />)
    expect(screen.getByRole('link', { name: /Marisol Vega/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Tessa Lund/ })).not.toHaveAttribute('aria-current')
  })

  it('links each row to the client detail route', () => {
    render(<ClientQueueRail orgSlug="acme" rows={rows} />)
    expect(screen.getByRole('link', { name: /Marisol Vega/ })).toHaveAttribute('href', '/acme/clients/vega')
  })

  it('the Dormant chip isolates the dormant-repeat group', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(<ClientQueueRail orgSlug="acme" rows={rows} />)
    await user.click(screen.getByRole('button', { name: 'Dormant' }))
    expect(screen.getByText('Cass Reyes')).toBeInTheDocument()
    expect(screen.queryByText('Marisol Vega')).not.toBeInTheDocument()
    expect(screen.queryByText('Tessa Lund')).not.toBeInTheDocument()
  })

  it('the Leads chip isolates rows that have never won business', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(<ClientQueueRail orgSlug="acme" rows={rows} />)
    await user.click(screen.getByRole('button', { name: 'Leads' }))
    expect(screen.getByText('Tessa Lund')).toBeInTheDocument()
    expect(screen.queryByText('Marisol Vega')).not.toBeInTheDocument()
    expect(screen.queryByText('Cass Reyes')).not.toBeInTheDocument()
  })

  it('shows the group count in the header', () => {
    render(<ClientQueueRail orgSlug="acme" rows={rows} />)
    // Two "3"s exist now: the in-flow header (md+) and the mobile bar's own
    // count (md:hidden) — both are in the DOM regardless of viewport, since
    // the mobile/desktop split is CSS-only.
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
  })
})
