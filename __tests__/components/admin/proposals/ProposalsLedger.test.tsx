import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProposalsLedger } from '@/components/admin/proposals/ProposalsLedger'
import { buildProposalLedger, type ProposalLedgerInput } from '@/lib/proposals/ledger'
import type { ProposalStatus } from '@/lib/types'

const NOW = new Date('2026-08-16T12:00:00.000Z')
const OPENED = '2026-08-02T00:00:00.000Z'

// One $100 required line item unless overridden, mirroring the builder's tests.
function p(over: Partial<ProposalLedgerInput> & { id: string; status: ProposalStatus }): ProposalLedgerInput {
  return {
    org_id: 'o1',
    lead_id: `lead-${over.id}`,
    token: `tok-${over.id}`,
    title: `Proposal ${over.id}`,
    clientName: 'Acme Co',
    line_items: [{ description: 'x', quantity: 1, unit_price: 100 }],
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  } as ProposalLedgerInput
}

function ledgerOf(rows: ProposalLedgerInput[]) {
  return buildProposalLedger(rows, NOW)
}

describe('ProposalsLedger — empty', () => {
  it('renders the empty state with a pipeline link', () => {
    render(<ProposalsLedger ledger={ledgerOf([])} orgSlug="acme" />)
    expect(screen.getByText('No proposals yet')).toBeInTheDocument()
    expect(screen.getByText('Proposals start from a job in your pipeline.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View pipeline' })).toHaveAttribute('href', '/acme/leads')
  })
})

describe('ProposalsLedger — groups', () => {
  it('renders a header per group with its count and money roll-up', () => {
    render(
      <ProposalsLedger
        orgSlug="acme"
        ledger={ledgerOf([
          p({ id: 'cold', status: 'sent' }),
          p({
            id: 'live',
            status: 'sent',
            first_opened_at: OPENED,
            line_items: [{ description: 'x', quantity: 1, unit_price: 2400 }],
          }),
          p({ id: 'd1', status: 'draft' }),
        ])}
      />
    )
    expect(screen.getByText('Needs attention · 1')).toBeInTheDocument()
    expect(screen.getByText('Out for signature · 1')).toBeInTheDocument()
    expect(screen.getByText('Drafts · 1')).toBeInTheDocument()
    // Once in the group header roll-up, once on the row itself.
    expect(screen.getAllByText('$2,400')).toHaveLength(2)
  })

  it('omits groups that have no rows', () => {
    render(<ProposalsLedger orgSlug="acme" ledger={ledgerOf([p({ id: 'd1', status: 'draft' })])} />)
    expect(screen.getByText('Drafts · 1')).toBeInTheDocument()
    expect(screen.queryByText(/^Accepted ·/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Closed ·/)).not.toBeInTheDocument()
  })
})

describe('ProposalsLedger — rows', () => {
  it('links each row to the builder route under its own lead', () => {
    render(
      <ProposalsLedger
        orgSlug="acme"
        ledger={ledgerOf([
          p({ id: 'prop-9', status: 'draft', lead_id: 'L9', title: 'Spring gala', clientName: 'Globex' }),
        ])}
      />
    )
    expect(screen.getByRole('link', { name: /Spring gala/ })).toHaveAttribute(
      'href',
      '/acme/leads/L9/proposals/prop-9'
    )
    expect(screen.getByText('Globex')).toBeInTheDocument()
  })

  it('shows the status label for a row with no signal', () => {
    render(<ProposalsLedger orgSlug="acme" ledger={ledgerOf([p({ id: 'a', status: 'draft' })])} />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('shows the signal instead of a redundant Sent pill', () => {
    render(
      <ProposalsLedger
        orgSlug="acme"
        ledger={ledgerOf([
          p({ id: 'exp', status: 'sent', expires_at: '2026-08-10', first_opened_at: OPENED }),
          p({ id: 'soon', status: 'sent', expires_at: '2026-08-20', first_opened_at: OPENED }),
          p({ id: 'cold', status: 'sent' }),
        ])}
      />
    )
    expect(screen.getByText('Expired')).toBeInTheDocument()
    expect(screen.getByText('Expiring soon')).toBeInTheDocument()
    expect(screen.getByText('Not opened')).toBeInTheDocument()
    expect(screen.queryByText('Sent')).not.toBeInTheDocument()
  })

  it('keeps the Sent pill for a healthy out-for-signature row', () => {
    render(
      <ProposalsLedger
        orgSlug="acme"
        ledger={ledgerOf([p({ id: 'live', status: 'sent', first_opened_at: OPENED })])}
      />
    )
    expect(screen.getByText('Sent')).toBeInTheDocument()
  })

  it('renders a price range with an en-dash and a fixed price without one', () => {
    render(
      <ProposalsLedger
        orgSlug="acme"
        ledger={ledgerOf([
          p({
            id: 'range',
            status: 'draft',
            title: 'Tiered',
            line_items: [],
            packages: [
              { id: 'p1', name: 'Basic', includes: [], price: 1100 },
              { id: 'p2', name: 'Deluxe', includes: [], price: 3300 },
            ],
          }),
        ])}
      />
    )
    expect(screen.getByText('$1,100–$3,300')).toBeInTheDocument()
  })

  it('falls back to an em-dash and an Unknown avatar when the client name is missing', () => {
    render(
      <ProposalsLedger
        orgSlug="acme"
        ledger={ledgerOf([p({ id: 'a', status: 'draft', clientName: '' })])}
      />
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Unknown' })).toBeInTheDocument()
  })
})
