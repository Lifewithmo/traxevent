import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProposalResponseClient } from '@/components/proposals/ProposalResponseClient'
import type { PublicProposal } from '@/actions/proposals-public'

vi.mock('@/actions/proposals-public', () => ({
  respondToProposal: vi.fn(),
  signProposal: vi.fn(),
  recordProposalView: vi.fn().mockResolvedValue(undefined),
  getPublicProposal: vi.fn(),
}))
vi.mock('@/components/proposals/ProposalDepositPayment', () => ({
  ProposalDepositPayment: () => null,
}))

const proposal: PublicProposal = {
  status: 'sent',
  line_items: [{ id: 'i1', description: 'Coffee cart', quantity: 1, unit_price: 500 }],
  created_at: '2026-08-09T00:00:00.000Z',
  terms: 'A 50% deposit reserves your date.',
}

describe('ProposalResponseClient terms', () => {
  it('renders the terms card below the sign form (spec §4.1: terms sits after accept)', () => {
    render(<ProposalResponseClient token="tok" proposal={proposal} />)
    expect(screen.getByText('Terms')).toBeInTheDocument()
    expect(screen.getByText('A 50% deposit reserves your date.')).toBeInTheDocument()
    // Order: the Terms heading must FOLLOW the sign form heading in the document
    const headings = screen.getAllByText(/Terms|Sign to accept/)
    expect(headings[0]).toHaveTextContent('Sign to accept')
    expect(headings[headings.length - 1]).toHaveTextContent('Terms')
  })

  it('renders no terms card when the proposal has none', () => {
    render(<ProposalResponseClient token="tok" proposal={{ ...proposal, terms: undefined }} />)
    expect(screen.queryByText('Terms')).not.toBeInTheDocument()
  })
})
