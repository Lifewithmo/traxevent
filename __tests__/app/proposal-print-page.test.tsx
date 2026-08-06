import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

const getPublicProposalSpy = vi.hoisted(() => vi.fn())
const notFoundSpy = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
)

vi.mock('@/actions/proposals-public', () => ({
  getPublicProposal: getPublicProposalSpy,
}))
vi.mock('next/navigation', () => ({ notFound: notFoundSpy }))

import ProposalPrintPage from '@/app/(public)/proposals/[token]/print/page'
import type { PublicProposal } from '@/actions/proposals-public'

async function renderPage(token = 'tok') {
  const ui = (await ProposalPrintPage({ params: Promise.resolve({ token }) })) as ReactElement
  return render(ui)
}

function proposal(overrides: Partial<PublicProposal> = {}): PublicProposal {
  return {
    status: 'sent',
    line_items: [],
    created_at: '2026-08-01T00:00:00.000Z',
    title: 'Backyard Bar Service',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  notFoundSpy.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
})

// C1 — the print route reimplemented the page from scratch and inherited none
// of the status handling that lives in ProposalResponseClient.
describe('proposal print route — status gate', () => {
  it('404s when the projection is null (draft / unknown token)', async () => {
    getPublicProposalSpy.mockResolvedValue(null)
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFoundSpy).toHaveBeenCalled()
  })

  it('refuses a voided proposal with the same message the main page shows', async () => {
    getPublicProposalSpy.mockResolvedValue(
      proposal({
        status: 'voided',
        notes: 'Confidential internal note',
        line_items: [{ id: 'l1', description: 'Bar service', quantity: 1, unit_price: 900 }],
      }),
    )
    await renderPage()
    expect(screen.getByText('This proposal is no longer available.')).toBeInTheDocument()
  })

  it('prints nothing about the offer once voided', async () => {
    // The whole point of C1: the customer still holds the emailed link and the
    // Download PDF link, and must not be able to print a revoked offer with
    // its pricing and notes as though it were live.
    getPublicProposalSpy.mockResolvedValue(
      proposal({
        status: 'voided',
        notes: 'Confidential internal note',
        blocks: [{ id: 'b1', type: 'paragraph', text: 'Our finest package' }],
        line_items: [{ id: 'l1', description: 'Bar service', quantity: 1, unit_price: 900 }],
      }),
    )
    await renderPage()
    expect(screen.queryByText('Backyard Bar Service')).not.toBeInTheDocument()
    expect(screen.queryByText(/Bar service/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Confidential internal note/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Our finest package/)).not.toBeInTheDocument()
    expect(screen.queryByText('$900.00')).not.toBeInTheDocument()
  })

  it('marks a declined proposal on the printout', async () => {
    getPublicProposalSpy.mockResolvedValue(
      proposal({
        status: 'rejected',
        line_items: [{ id: 'l1', description: 'Bar service', quantity: 1, unit_price: 900 }],
      }),
    )
    await renderPage()
    expect(screen.getByText(/declined/i)).toBeInTheDocument()
    expect(screen.getByText(/Bar service/)).toBeInTheDocument()
  })

  it('surfaces the signature so a signed printout is not mistaken for a live offer', async () => {
    getPublicProposalSpy.mockResolvedValue(
      proposal({
        status: 'accepted',
        line_items: [{ id: 'l1', description: 'Bar service', quantity: 1, unit_price: 900 }],
        signed: { signer_name: 'Dana Reyes', signed_at: '2026-08-02T17:30:00.000Z' },
        selection: {
          optional_item_ids: [],
          selected_total: 900,
          selected_at: '2026-08-02T17:30:00.000Z',
        },
      }),
    )
    await renderPage()
    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(screen.getByText(/Signed by Dana Reyes/)).toBeInTheDocument()
  })
})

// I1 — the printed pricing must agree with what the public page shows.
describe('proposal print route — pricing', () => {
  it('prices a packaged proposal (its prices live in packages, not line_items)', async () => {
    getPublicProposalSpy.mockResolvedValue(
      proposal({
        line_items: [],
        packages: [
          { id: 'p1', name: 'Good', includes: [], price: 500 },
          { id: 'p2', name: 'Best', includes: [], price: 1500, recommended: true },
        ],
      }),
    )
    await renderPage()
    expect(screen.getByText('Good')).toBeInTheDocument()
    expect(screen.getByText('$500.00')).toBeInTheDocument()
    expect(screen.getByText('$1500.00')).toBeInTheDocument()
    // Unselected packaged proposal => a span, never a single invented figure.
    expect(screen.getByText('$500.00 – $1500.00')).toBeInTheDocument()
  })

  it('applies discount and tax to the printed total', async () => {
    // subtotal 1000, less 10% discount = 900, plus 10% tax = 990.
    getPublicProposalSpy.mockResolvedValue(
      proposal({
        line_items: [{ id: 'l1', description: 'Bar service', quantity: 1, unit_price: 1000 }],
        discount: { type: 'percent', value: 10 },
        tax_rate: 10,
      }),
    )
    await renderPage()
    expect(screen.getByText('$990.00')).toBeInTheDocument()
    // The raw subtotal must not be presented as the total.
    expect(screen.queryByText('Total')).toBeInTheDocument()
  })

  it('marks optional add-ons as not included rather than printing them as base scope', async () => {
    getPublicProposalSpy.mockResolvedValue(
      proposal({
        line_items: [
          { id: 'l1', description: 'Bar service', quantity: 1, unit_price: 1000 },
          { id: 'l2', description: 'Champagne tower', quantity: 1, unit_price: 400, optional: true },
        ],
      }),
    )
    await renderPage()
    expect(screen.getByText(/Champagne tower/)).toBeInTheDocument()
    expect(screen.getByText('(not included)')).toBeInTheDocument()
    // Base total excludes the add-on; the span's top end includes it.
    expect(screen.getByText('$1000.00 – $1400.00')).toBeInTheDocument()
  })

  it('prints the locked selection total for a signed proposal, not a recomputed guess', async () => {
    // The agreed figure is 1500 (the "Best" tier). A recompute that ignored
    // `selection` would print the range, i.e. a price nobody signed.
    getPublicProposalSpy.mockResolvedValue(
      proposal({
        status: 'accepted',
        line_items: [],
        packages: [
          { id: 'p1', name: 'Good', includes: [], price: 500 },
          { id: 'p2', name: 'Best', includes: [], price: 1500 },
        ],
        signed: { signer_name: 'Dana Reyes', signed_at: '2026-08-02T17:30:00.000Z' },
        selection: {
          package_id: 'p2',
          optional_item_ids: [],
          selected_total: 1500,
          selected_at: '2026-08-02T17:30:00.000Z',
        },
      }),
    )
    await renderPage()
    expect(screen.getByText('Selected')).toBeInTheDocument()
    expect(screen.queryByText('$500.00 – $1500.00')).not.toBeInTheDocument()
    // The headline figure is the locked total.
    expect(screen.getByText('Total').nextElementSibling).toHaveTextContent('$1500.00')
  })

  it('prints the deposit due, derived from the same helper as the web page', async () => {
    getPublicProposalSpy.mockResolvedValue(
      proposal({
        line_items: [{ id: 'l1', description: 'Bar service', quantity: 1, unit_price: 1000 }],
        deposit: { type: 'percent', value: 25 },
        deposit_gate: 'before_accept',
      }),
    )
    await renderPage()
    expect(screen.getByText(/Deposit due to accept: \$250\.00/)).toBeInTheDocument()
  })
})
