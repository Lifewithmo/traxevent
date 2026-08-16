import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const markPickedUpSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const cancelOrderSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/actions/orders', () => ({ markOrderPickedUp: markPickedUpSpy, cancelOrder: cancelOrderSpy }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { OrdersBoardClient } from '@/components/admin/storefront/OrdersBoardClient'

const DROP = {
  id: 'd1', title: 'Weekend Drop', status: 'scheduled' as const,
  opens_at: 'x', closes_at: 'x', timezone: 'UTC',
  pickup: { location_name: 'SW Boise', windows: [{ id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00' }] },
  items: [], channels: [], created_at: 'x',
}
const ORDERS = [
  { id: 'o1', org_id: 'org-1', channel: 'drop' as const, drop_id: 'd1', status: 'confirmed' as const, number: 1,
    buyer: { name: 'Jane', email: 'j@x.co' }, lines: [{ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, qty: 2 }],
    pickup_window_id: 'w1', subtotal: 11, tax: 0, total: 11, token: 't1', created_at: '2026-08-20T01:00:00Z' },
  { id: 'o2', org_id: 'org-1', channel: 'drop' as const, drop_id: 'd1', status: 'picked_up' as const, number: 2,
    buyer: { name: 'Sam', email: 's@x.co' }, lines: [{ product_id: 'p1', name: 'Vanilla Latte', price: 5.5, qty: 1 }],
    pickup_window_id: 'w1', subtotal: 5.5, tax: 0, total: 5.5, token: 't2', created_at: '2026-08-20T02:00:00Z' },
]

describe('OrdersBoardClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('groups orders under their pickup window and shows revenue', () => {
    render(<OrdersBoardClient orgId="org-1" orgSlug="acme" drop={DROP} orders={ORDERS} isAdmin />)
    expect(screen.getByText(/2026-08-22/)).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText(/\$16\.50/)).toBeInTheDocument()   // confirmed+picked_up revenue
  })

  it('marks orders picked up', async () => {
    render(<OrdersBoardClient orgId="org-1" orgSlug="acme" drop={DROP} orders={ORDERS} isAdmin />)
    fireEvent.click(screen.getByRole('button', { name: /picked up/i }))
    await waitFor(() => expect(markPickedUpSpy).toHaveBeenCalledWith('org-1', 'o1'))
  })

  it('prep view aggregates quantities per product', () => {
    render(<OrdersBoardClient orgId="org-1" orgSlug="acme" drop={DROP} orders={ORDERS} isAdmin />)
    fireEvent.click(screen.getByRole('tab', { name: /prep/i }))
    expect(screen.getByText('3 ×')).toBeInTheDocument()
    expect(screen.getByText('Vanilla Latte')).toBeInTheDocument()
  })

  it('cancel asks for confirmation before refunding', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<OrdersBoardClient orgId="org-1" orgSlug="acme" drop={DROP} orders={ORDERS} isAdmin />)
    const card1 = screen.getByTestId('order-o1')
    fireEvent.click(within(card1).getByRole('button', { name: /cancel & refund/i }))
    await waitFor(() => expect(cancelOrderSpy).toHaveBeenCalledWith('org-1', 'o1'))
    confirmSpy.mockRestore()
  })

  it('also allows canceling an already picked-up order (post-handoff correction)', () => {
    render(<OrdersBoardClient orgId="org-1" orgSlug="acme" drop={DROP} orders={ORDERS} isAdmin />)
    const card2 = screen.getByTestId('order-o2')
    expect(within(card2).getByRole('button', { name: /cancel & refund/i })).toBeInTheDocument()
  })
})
