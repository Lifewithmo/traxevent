import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { renderToString } from 'react-dom/server'

vi.mock('@/components/storefront/DropCheckout', () => ({
  DropCheckout: () => <div data-testid="checkout" />,
}))
// DropStorefront now mounts the real SubscribeCard (upcoming/ended states),
// which imports the real subscribeToDrops server action — that module chain
// reaches lib/firebase-admin, which throws without Firebase env vars. Mock
// it the same way SubscribeCard.test.tsx does; these tests only assert on
// rendering, not the action's behavior.
vi.mock('@/actions/storefront-public', () => ({ subscribeToDrops: vi.fn().mockResolvedValue({ ok: true }) }))

import { DropStorefront, formatOpensAt } from '@/components/storefront/DropStorefront'

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

  it('mounts the subscribe card in the ended state so drop-page traffic can capture the reminder list', () => {
    render(<DropStorefront drop={{ ...DROP, phase: 'ended' }} />)
    expect(screen.getByText(/don't miss the next drop/i)).toBeInTheDocument()
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

// ── SSR zone safety ────────────────────────────────────────────────────────
// The "Orders open …" clock face is pinned to the DROP's own timezone:
// pickup happens at a physical place, and a pinned zone is byte-identical
// between the server pass and hydration. The ambient-zone version was the
// /checkin crash class (React #418 → hydration abort → inert page — on THIS
// surface, customers cannot order).

// 05:30 UTC is 11:30 PM the PREVIOUS day in Boise — if the zone pin is ever
// dropped, the rendered DATE itself flips, not just the hour.
const NEAR_MIDNIGHT = '2026-08-22T05:30:00.000Z'
const BOISE_FACE = 'Aug 21, 2026, 11:30 PM MDT'
const UPCOMING_BOISE = {
  ...DROP,
  phase: 'upcoming' as const,
  opens_at: NEAR_MIDNIGHT,
  timezone: 'America/Boise',
}

// Node re-reads TZ per Intl call on POSIX, so a per-assertion zone swap
// simulates "server in zone A, viewer in zone B" inside one process.
function withProcessTZ<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.TZ
    else process.env.TZ = prev
  }
}

describe('formatOpensAt — pinned to the drop timezone', () => {
  it('renders the drop-zone clock face, zone-labeled (near-midnight: the date differs from UTC)', () => {
    expect(formatOpensAt(NEAR_MIDNIGHT, 'America/Boise')).toBe(BOISE_FACE)
  })

  it('is identical under different process timezones — the SSR/client stability property', () => {
    const utc = withProcessTZ('UTC', () => formatOpensAt(NEAR_MIDNIGHT, 'America/Boise'))
    const nz = withProcessTZ('Pacific/Auckland', () => formatOpensAt(NEAR_MIDNIGHT, 'America/Boise'))
    expect(utc).toBe(BOISE_FACE)
    expect(nz).toBe(BOISE_FACE)
  })

  it('degrades a malformed stored zone to a LABELED UTC face — never the ambient zone', () => {
    expect(formatOpensAt(NEAR_MIDNIGHT, 'Not/AZone')).toBe('Aug 22, 2026, 5:30 AM UTC')
  })
})

describe('DropStorefront (upcoming) — SSR payload zone-deterministic, hydration clean', () => {
  it('bakes the SAME drop-zone face into the HTML whatever zone the server runs in', () => {
    const utcHtml = withProcessTZ('UTC', () => renderToString(<DropStorefront drop={UPCOMING_BOISE} />))
    const nzHtml = withProcessTZ('Pacific/Auckland', () => renderToString(<DropStorefront drop={UPCOMING_BOISE} />))
    // The crash mechanics: an ambient-zone face differs between a UTC server
    // and the viewer's browser. Payload equality across server zones is the
    // property that makes hydration safe for EVERY viewer.
    expect(utcHtml).toBe(nzHtml)
    expect(utcHtml).toContain(BOISE_FACE)
    // The faces the unpinned version would have baked in:
    expect(utcHtml).not.toContain('Aug 22, 2026, 5:30 AM') // a UTC server's face
    expect(nzHtml).not.toContain('5:30 PM') // an Auckland server's face
  })

  it('hydrates UTC-server HTML in a non-UTC "browser" with zero console.error and live handlers', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    // Server pass in one zone…
    container.innerHTML = withProcessTZ('UTC', () => renderToString(<DropStorefront drop={UPCOMING_BOISE} />))

    // …hydrated in another — the production shape (UTC server, local viewer).
    // No suppressHydrationWarning anywhere, so any divergence surfaces as a
    // React console.error right here.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      withProcessTZ('Pacific/Auckland', () => {
        render(<DropStorefront drop={UPCOMING_BOISE} />, { container, hydrate: true })
      })
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
    expect(screen.getByText(/Orders open Aug 21, 2026, 11:30 PM MDT\./)).toBeInTheDocument()

    // Handlers ALIVE — the production symptom of this crash class is an inert
    // page. The subscribe form must accept input after hydration.
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'jane@example.com' } })
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('jane@example.com')
    container.remove()
  })
})
