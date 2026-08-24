import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { renderToString } from 'react-dom/server'

vi.mock('@/actions/proposals-public', () => ({
  recordProposalView: vi.fn().mockResolvedValue(undefined),
  getPublicProposal: vi.fn().mockResolvedValue(null),
  respondToProposal: vi.fn().mockResolvedValue(undefined),
  signProposal: vi.fn().mockResolvedValue({ deposit_due: 0, payment_status: 'not_required' }),
}))
// Stripe Elements need a live publishable key and a network round trip.
vi.mock('@/components/proposals/ProposalDepositPayment', () => ({
  ProposalDepositPayment: () => <div data-testid="deposit-payment" />,
}))

import { ProposalResponseClient } from '@/components/proposals/ProposalResponseClient'
import type { PublicProposal } from '@/actions/proposals-public'

function proposal(overrides: Partial<PublicProposal> = {}): PublicProposal {
  return {
    status: 'sent',
    line_items: [],
    created_at: '2026-08-01T00:00:00.000Z',
    title: 'Backyard Bar Service',
    ...overrides,
  }
}

// The sticky footer's total: the <p> immediately after the "Total" label.
function totalText(): string {
  return screen.getByText('Total').nextElementSibling?.textContent ?? ''
}

beforeEach(() => vi.clearAllMocks())

// Guards the presentational extraction shared with the print route: the
// selection behaviour these assert is exactly what must not change.
describe('ProposalResponseClient — selection still drives the total', () => {
  it('shows the recommended package preselected and its price as the total', () => {
    render(<ProposalResponseClient token="tok" proposal={proposal({
      packages: [
        { id: 'p1', name: 'Good', includes: [], price: 500 },
        { id: 'p2', name: 'Best', includes: ['Everything'], price: 1500, recommended: true },
      ],
    })} />)
    expect(screen.getByRole('button', { name: /Best/ })).toHaveAttribute('aria-pressed', 'true')
    expect(totalText()).toContain('$1500.00')
  })

  it('recomputes the total when another package is picked', () => {
    render(<ProposalResponseClient token="tok" proposal={proposal({
      packages: [
        { id: 'p1', name: 'Good', includes: [], price: 500 },
        { id: 'p2', name: 'Best', includes: [], price: 1500, recommended: true },
      ],
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /Good/ }))
    expect(screen.getByRole('button', { name: /Good/ })).toHaveAttribute('aria-pressed', 'true')
    expect(totalText()).toContain('$500.00')
  })

  it('adds an optional item to the total when its checkbox is ticked', () => {
    render(<ProposalResponseClient token="tok" proposal={proposal({
      line_items: [
        { id: 'l1', description: 'Bar service', quantity: 1, unit_price: 1000 },
        { id: 'l2', description: 'Champagne tower', quantity: 1, unit_price: 400, optional: true },
      ],
    })} />)
    expect(totalText()).toContain('$1000.00')
    fireEvent.click(screen.getByLabelText(/Champagne tower/))
    expect(totalText()).toContain('$1400.00')
  })

  it('applies discount and tax to the displayed total', () => {
    render(<ProposalResponseClient token="tok" proposal={proposal({
      line_items: [{ id: 'l1', description: 'Bar service', quantity: 1, unit_price: 1000 }],
      discount: { type: 'percent', value: 10 },
      tax_rate: 10,
    })} />)
    expect(totalText()).toContain('$990.00')
  })

  it('shows the deposit due for the before_accept gate', () => {
    render(<ProposalResponseClient token="tok" proposal={proposal({
      line_items: [{ id: 'l1', description: 'Bar service', quantity: 1, unit_price: 1000 }],
      deposit: { type: 'percent', value: 25 },
      deposit_gate: 'before_accept',
    })} />)
    expect(screen.getByText(/Deposit due to accept: \$250\.00/)).toBeInTheDocument()
  })

  it('short-circuits a voided proposal — the rule the print route now mirrors', () => {
    render(<ProposalResponseClient token="tok" proposal={proposal({
      status: 'voided',
      line_items: [{ id: 'l1', description: 'Bar service', quantity: 1, unit_price: 1000 }],
    })} />)
    expect(screen.getByText('This proposal is no longer available.')).toBeInTheDocument()
    expect(screen.queryByText(/Bar service/)).not.toBeInTheDocument()
  })
})

describe('ProposalResponseClient — themed presentation (behavior-preserving restyle)', () => {
  const branding = {
    display_name: 'BrewTrax Events',
    logo_url: 'https://cdn/logo.png',
    cover_image_url: 'https://cdn/cover.jpg',
    accent_color: '#336699',
  }

  it('renders a branded hero with cover and logo when branding is present', () => {
    render(<ProposalResponseClient token="tok" proposal={proposal()} branding={branding} />)
    const hero = screen.getByTestId('proposal-hero')
    expect(hero).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /brewtrax events logo/i })).toHaveAttribute(
      'src', 'https://cdn/logo.png',
    )
    expect(screen.getByRole('heading', { name: 'Backyard Bar Service' })).toBeInTheDocument()
  })

  it('renders the plain heading with no hero when branding is absent', () => {
    render(<ProposalResponseClient token="tok" proposal={proposal()} />)
    expect(screen.queryByTestId('proposal-hero')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Backyard Bar Service' })).toBeInTheDocument()
  })

  it('never renders placeholder blocks to the customer', () => {
    render(<ProposalResponseClient token="tok" proposal={proposal({
      blocks: [
        { id: 'b1', type: 'paragraph', text: 'Real paragraph' },
        { id: 'ph', type: 'paragraph', text: 'Replace this intro', placeholder: true } as never,
      ],
    })} />)
    expect(screen.getByText('Real paragraph')).toBeInTheDocument()
    expect(screen.queryByText('Replace this intro')).not.toBeInTheDocument()
  })

  it('renders composed package bullets from the member items', () => {
    render(<ProposalResponseClient token="tok" proposal={proposal({
      line_items: [
        { id: 'i1', description: 'Setup crew', quantity: 1, unit_price: 200 },
        { id: 'i2', description: 'Espresso bar', quantity: 1, unit_price: 500 },
      ],
      packages: [
        { id: 'pa', name: 'Basic', includes: [], price: 200, item_ids: ['i1'] } as never,
        { id: 'pb', name: 'Better', includes: [], price: 700, item_ids: ['i1', 'i2'] } as never,
      ],
    })} />)
    // Better ⊇ Basic → collapsed to "Everything in Basic" + its own extras.
    expect(screen.getByText('Everything in Basic')).toBeInTheDocument()
    const better = screen.getByRole('button', { name: /Better/ })
    expect(better).toHaveTextContent('Espresso bar')
    expect(better).not.toHaveTextContent('Setup crew')
  })

  it("excludes package member items from the What's included base-scope list", () => {
    // Browser-walk regression: member items rendered as always-included base
    // scope, double-displaying them regardless of which tier is chosen.
    render(<ProposalResponseClient token="tok" proposal={proposal({
      line_items: [
        { id: 'i1', description: 'Espresso bar', quantity: 1, unit_price: 500 },
        { id: 'i2', description: 'Venue liaison', quantity: 1, unit_price: 100 },
      ],
      packages: [
        { id: 'pa', name: 'Basic', includes: [], price: 500, item_ids: ['i1'] } as never,
      ],
    })} />)
    // Non-member item is base scope; the member renders ONCE (tier card only).
    // The bug rendered members twice: in the tier card and again as base scope.
    expect(screen.getByText("What's included")).toBeInTheDocument()
    expect(screen.getAllByText(/Venue liaison/)).toHaveLength(1)
    expect(screen.getAllByText(/Espresso bar/)).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Zone-safe date rendering — the /checkin crash class (PR #134) on the one
// page a CUSTOMER signs and pays from. The signature stamp and the expiry
// line formatted via bare toLocale* at first render, so SSR baked the
// server's zone/ICU rendering into the payload and the browser's hydration
// pass produced the viewer's — React #418, hydration aborted, every handler
// dead: a customer who could not sign. Mirrors the CheckinClient regression
// shape: SSR-payload assertion + hydrate-mode zero console.error + a live
// handler.
// ─────────────────────────────────────────────────────────────────────────────

// 2:38 AM UTC is the previous evening (and previous DAY) anywhere west of
// UTC, and Aug 30's end-of-day-UTC guard instant is already Aug 31 east of
// it — both fixtures diverge under any zone-following rendering.
const SIGNED_AT = '2026-08-20T02:38:00.000Z'
const SIGNED_STAMP = 'on Aug 20, 2026, 2:38 AM UTC'
const EXPIRES = '2026-08-30'

const signedProposal = () => proposal({
  status: 'accepted',
  line_items: [{ id: 'l1', description: 'Bar service', quantity: 1, unit_price: 1000 }],
  signed: { signer_name: 'Jane Smith', signed_at: SIGNED_AT },
  expires_at: EXPIRES,
})

describe('ProposalResponseClient — zone-safe stamps, no hydration crash', () => {
  it('SSR payload pins the signature stamp and expiry — never the runtime zone', () => {
    const html = renderToString(<ProposalResponseClient token="tok" proposal={signedProposal()} />)
    const text = html.replace(/<!-- -->/g, '') // strip JSX child separators
    // Byte-deterministic renderings: the hydration pass reproduces these
    // exactly on any browser, so the page can never abort over them.
    expect(text).toContain(SIGNED_STAMP)
    expect(text).toContain('This proposal expires Aug 30, 2026')
    // The defect's output: the runtime-zone toLocale* renderings. (In this
    // process both "server" and viewer share a zone, so ANY appearance of
    // these means the value was formatted zone-following again.)
    expect(text).not.toContain(new Date(SIGNED_AT).toLocaleString())
    expect(text).not.toContain(
      new Date(`${EXPIRES}T23:59:59.999Z`).toLocaleDateString(),
    )
  })

  it('hydrates the signed page with zero console.error and shows the pinned stamp', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = renderToString(
      <ProposalResponseClient token="tok" proposal={signedProposal()} />,
    )

    // No suppressHydrationWarning anywhere on these lines — a server/client
    // divergence would surface right here as a console.error from React.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<ProposalResponseClient token="tok" proposal={signedProposal()} />, {
        container,
        hydrate: true,
      })
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }

    expect(screen.getByText(new RegExp(SIGNED_STAMP))).toBeInTheDocument()
    container.remove()
  })

  it('hydrates the open (signable) page alive: zero console.error and working selection', () => {
    const openProposal = () => proposal({
      line_items: [
        { id: 'l1', description: 'Bar service', quantity: 1, unit_price: 1000 },
        { id: 'l2', description: 'Champagne tower', quantity: 1, unit_price: 400, optional: true },
      ],
      expires_at: EXPIRES,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = renderToString(
      <ProposalResponseClient token="tok" proposal={openProposal()} />,
    )

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<ProposalResponseClient token="tok" proposal={openProposal()} />, {
        container,
        hydrate: true,
      })
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }

    // The production symptom was an inert page — hydration aborted, nothing
    // attached, the customer unable to sign. The selection handlers must be
    // ALIVE after hydrating the exact SSR payload.
    expect(totalText()).toContain('$1000.00')
    fireEvent.click(screen.getByLabelText(/Champagne tower/))
    expect(totalText()).toContain('$1400.00')
    container.remove()
  })
})
