import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/components/storefront/DropCheckout', () => ({
  DropCheckout: () => <div data-testid="checkout" />,
}))

import { DropStorefront } from '@/components/storefront/DropStorefront'

const DROP = {
  id: 'd1', title: 'Weekend Drop', note: 'Thanks for the love!', phase: 'open' as const,
  opens_at: '2026-08-20T15:00:00.000Z', closes_at: '2026-08-21T15:00:00.000Z', timezone: 'UTC',
  pickup: { location_name: 'SW Boise', windows: [{ id: 'w1', day: '2026-08-22', start: '08:00', end: '11:00' }] },
  items: [
    { product_id: 'p1', name: 'Vanilla Latte', price: 5.5, sold_out: false },
    { product_id: 'p2', name: 'Cinnamon Roll', price: 5.5, sold_out: true },
  ],
  tips_enabled: false,
  org: { display_name: 'Love Brew', handle: 'lovebrew' },
}

describe('DropStorefront', () => {
  it('renders menu, disables sold-out items, and builds a cart with a running total', () => {
    render(<DropStorefront drop={DROP} />)
    expect(screen.getByText('Weekend Drop')).toBeInTheDocument()
    expect(screen.getByText('Sold out')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /add vanilla latte/i }))
    fireEvent.click(screen.getByRole('button', { name: /add vanilla latte/i }))
    // subtotal equals total here (no tax/tip on this fixture), so scope to
    // the total row's testid rather than an ambiguous text match
    expect(screen.getByTestId('total')).toHaveTextContent('$11.00')
    // sold-out item has no add button
    expect(screen.queryByRole('button', { name: /add cinnamon roll/i })).not.toBeInTheDocument()
  })

  it('shows the ended banner instead of a cart when the phase is ended', () => {
    render(<DropStorefront drop={{ ...DROP, phase: 'ended' }} />)
    expect(screen.getByText(/sales have ended/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add vanilla latte/i })).not.toBeInTheDocument()
  })

  it('shows opens-at info when upcoming', () => {
    render(<DropStorefront drop={{ ...DROP, phase: 'upcoming' }} />)
    expect(screen.getByText(/orders open/i)).toBeInTheDocument()
  })

  it('advances to checkout once the cart has items and pickup is chosen', () => {
    render(<DropStorefront drop={DROP} />)
    fireEvent.click(screen.getByRole('button', { name: /add vanilla latte/i }))
    // buyer details are required before the intent request can be built
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Jane Buyer' } })
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'jane@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /check out/i }))
    expect(screen.getByTestId('checkout')).toBeInTheDocument()
  })

  it('recomputes the selected tip percent against the current subtotal as the cart changes', () => {
    render(<DropStorefront drop={{ ...DROP, tips_enabled: true }} />)
    fireEvent.click(screen.getByRole('button', { name: /add vanilla latte/i })) // subtotal $5.50
    fireEvent.click(screen.getByRole('button', { name: '20%' }))
    // 20% of $5.50 = $1.10 -> total $6.60
    expect(screen.getByTestId('total')).toHaveTextContent('$6.60')
    fireEvent.click(screen.getByRole('button', { name: /add vanilla latte/i })) // subtotal $11.00
    // tip percent stays selected but recomputes against the new subtotal:
    // 20% of $11.00 = $2.20 -> total $13.20
    expect(screen.getByTestId('total')).toHaveTextContent('$13.20')
  })

  it('hides the quantity and tip controls once checkout starts', () => {
    render(<DropStorefront drop={{ ...DROP, tips_enabled: true }} />)
    fireEvent.click(screen.getByRole('button', { name: /add vanilla latte/i }))
    fireEvent.click(screen.getByRole('button', { name: '20%' }))
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Jane Buyer' } })
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'jane@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /check out/i }))
    expect(screen.getByTestId('checkout')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add vanilla latte/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove vanilla latte/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '20%' })).not.toBeInTheDocument()
  })
})
