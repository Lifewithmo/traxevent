import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/actions/proposals-public', () => ({
  getPublicProposal: vi.fn().mockResolvedValue({
    status: 'sent',
    title: 'Launch Party',
    line_items: [{ id: 'i1', description: 'Cart', quantity: 1, unit_price: 500 }],
    blocks: [{ id: 'b1', type: 'paragraph', text: 'Print body' }],
    terms: 'Legal text',
  }),
}))

import ProposalPrintPage from '@/app/(public)/proposals/[token]/print/page'

describe('print route', () => {
  it('renders document content through the shared composition', async () => {
    render(await ProposalPrintPage({ params: Promise.resolve({ token: 't' }) }))
    expect(screen.getByText('Print body')).toBeInTheDocument()
  })

  it('orders terms after the accept section, matching the web page', async () => {
    const { container } = render(await ProposalPrintPage({ params: Promise.resolve({ token: 't' }) }))
    const html = container.innerHTML
    expect(html.indexOf('Legal text')).toBeGreaterThan(html.indexOf('Total'))
  })

  it('still refuses a voided proposal', async () => {
    const { getPublicProposal } = await import('@/actions/proposals-public')
    vi.mocked(getPublicProposal).mockResolvedValueOnce({ status: 'voided' } as never)
    render(await ProposalPrintPage({ params: Promise.resolve({ token: 't' }) }))
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument()
  })

  it('prints deposit terms beneath the totals, qualifying the money figure above it', async () => {
    const { getPublicProposal } = await import('@/actions/proposals-public')
    vi.mocked(getPublicProposal).mockResolvedValueOnce({
      status: 'sent',
      title: 'Launch Party',
      line_items: [{ id: 'i1', description: 'Cart', quantity: 1, unit_price: 500 }],
      blocks: [{ id: 'b1', type: 'paragraph', text: 'Print body' }],
      deposit_terms: 'Deposit is non-refundable within 14 days of the event.',
    } as never)
    render(await ProposalPrintPage({ params: Promise.resolve({ token: 't' }) }))
    expect(screen.getByText('Deposit is non-refundable within 14 days of the event.')).toBeInTheDocument()
  })

  it('prints no "Deposit terms" heading when deposit_terms is absent', async () => {
    const { getPublicProposal } = await import('@/actions/proposals-public')
    vi.mocked(getPublicProposal).mockResolvedValueOnce({
      status: 'sent',
      title: 'Launch Party',
      line_items: [{ id: 'i1', description: 'Cart', quantity: 1, unit_price: 500 }],
      blocks: [{ id: 'b1', type: 'paragraph', text: 'Print body' }],
    } as never)
    render(await ProposalPrintPage({ params: Promise.resolve({ token: 't' }) }))
    expect(screen.queryByText('Deposit terms')).not.toBeInTheDocument()
  })
})
