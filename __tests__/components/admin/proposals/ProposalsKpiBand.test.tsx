import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProposalsKpiBand } from '@/components/admin/proposals/ProposalsKpiBand'
import type { ProposalLedgerTiles } from '@/lib/proposals/ledger'

const ZERO: ProposalLedgerTiles = {
  outstandingValue: 0,
  outstandingCount: 0,
  needsAttention: 0,
  acceptedValue: 0,
  acceptedCount: 0,
  depositsDue: 0,
}

describe('ProposalsKpiBand', () => {
  it('renders all four money figures with thousands separators', () => {
    render(
      <ProposalsKpiBand
        tiles={{
          outstandingValue: 42000,
          outstandingCount: 3,
          needsAttention: 2,
          acceptedValue: 118500,
          acceptedCount: 7,
          depositsDue: 5250,
        }}
      />
    )
    expect(screen.getByText('Out for signature')).toBeInTheDocument()
    expect(screen.getByText('$42,000')).toBeInTheDocument()
    expect(screen.getByText('3 proposals')).toBeInTheDocument()

    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()

    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(screen.getByText('$118,500')).toBeInTheDocument()
    expect(screen.getByText('7 won')).toBeInTheDocument()

    expect(screen.getByText('Deposits due')).toBeInTheDocument()
    expect(screen.getByText('$5,250')).toBeInTheDocument()
  })

  it('singularizes the outstanding note for one proposal', () => {
    render(<ProposalsKpiBand tiles={{ ...ZERO, outstandingCount: 1, outstandingValue: 900 }} />)
    expect(screen.getByText('1 proposal')).toBeInTheDocument()
  })

  it('uses alert tone for Needs attention when > 0, default tone when 0', () => {
    const { rerender } = render(<ProposalsKpiBand tiles={{ ...ZERO, needsAttention: 4 }} />)
    expect(screen.getByText('Needs attention').closest('[data-slot="stat-tile"]')).toHaveClass(
      'border-[var(--status-alert-bg)]'
    )

    rerender(<ProposalsKpiBand tiles={ZERO} />)
    expect(screen.getByText('Needs attention').closest('[data-slot="stat-tile"]')).not.toHaveClass(
      'border-[var(--status-alert-bg)]'
    )
  })

  it('uses alert tone for Deposits due only when money is owed', () => {
    const { rerender } = render(<ProposalsKpiBand tiles={{ ...ZERO, depositsDue: 1200 }} />)
    expect(screen.getByText('Deposits due').closest('[data-slot="stat-tile"]')).toHaveClass(
      'border-[var(--status-alert-bg)]'
    )

    rerender(<ProposalsKpiBand tiles={ZERO} />)
    expect(screen.getByText('Deposits due').closest('[data-slot="stat-tile"]')).not.toHaveClass(
      'border-[var(--status-alert-bg)]'
    )
  })
})
