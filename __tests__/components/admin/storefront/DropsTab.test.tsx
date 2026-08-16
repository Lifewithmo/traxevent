import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { DropsTab } from '@/components/admin/storefront/DropsTab'

const DROPS = [
  { id: 'd1', title: 'Weekend Drop', status: 'scheduled' as const, opens_at: '2000-01-01T00:00:00.000Z', closes_at: '2999-01-01T00:00:00.000Z', timezone: 'UTC', pickup: { location_name: 'SW Boise', windows: [] }, items: [], channels: [], created_at: 'x' },
  { id: 'd2', title: 'Draft Drop', status: 'draft' as const, opens_at: '2999-01-01T00:00:00.000Z', closes_at: '2999-01-02T00:00:00.000Z', timezone: 'UTC', pickup: { location_name: 'x', windows: [] }, items: [], channels: [], created_at: 'x' },
]

describe('DropsTab', () => {
  it('shows phase badges, per-drop stats, and links to editor, board, and new-drop', () => {
    render(<DropsTab orgSlug="acme" drops={DROPS} stats={{ d1: { count: 12, revenue: 66 } }} isAdmin />)
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText(/12 orders/)).toBeInTheDocument()
    expect(screen.getByText(/\$66\.00/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /new drop/i })).toHaveAttribute('href', '/acme/drops/new')
    expect(screen.getByRole('link', { name: /orders/i })).toHaveAttribute('href', '/acme/drop-orders/d1')
  })
})
