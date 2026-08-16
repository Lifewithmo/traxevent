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

  // Voiding does not clear `selection.selected_total`, so a dead proposal still
  // carries its locked price. Rolling those up would print them in the same
  // money slot the live groups use for real pipeline value.
  it('renders the closed group with rows but no money roll-up', () => {
    render(
      <ProposalsLedger
        orgSlug="acme"
        ledger={ledgerOf([
          p({
            id: 'dead',
            status: 'voided',
            title: 'Cancelled retreat',
            selection: {
              optional_item_ids: [],
              selected_total: 50000,
              selected_at: '2026-08-05T00:00:00.000Z',
            },
          }),
        ])}
      />
    )
    expect(screen.getByRole('link', { name: /Cancelled retreat/ })).toBeInTheDocument()

    const header = screen.getByText('Closed · 1').parentElement!
    // The header must carry the label alone — no money slot at all.
    expect(header.textContent).toBe('Closed · 1')
    expect(header.textContent).not.toContain('$')

    // The row still shows its own locked price; the roll-up is what must not
    // exist, so restoring it makes this figure appear twice instead of once.
    expect(screen.getAllByText('$50,000')).toHaveLength(1)
  })

  it('still rolls up the live groups', () => {
    render(
      <ProposalsLedger
        orgSlug="acme"
        ledger={ledgerOf([
          p({ id: 'a', status: 'draft', line_items: [{ description: 'x', quantity: 1, unit_price: 700 }] }),
          p({ id: 'b', status: 'draft', line_items: [{ description: 'x', quantity: 1, unit_price: 300 }] }),
        ])}
      />
    )
    expect(screen.getByText('Drafts · 2').parentElement!.textContent).toContain('$1,000')
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

  // A whitespace-only name is truthy, so `||` let it through — an avatar with no
  // monogram over a blank line where the client should be.
  it('treats a whitespace-only client name as missing', () => {
    render(
      <ProposalsLedger
        orgSlug="acme"
        ledger={ledgerOf([p({ id: 'a', status: 'draft', clientName: '   ' })])}
      />
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Unknown' })).toBeInTheDocument()
  })

  // Nothing asserted tone before, so `expired` and `expiring` could both have
  // rendered `pending` with every test still green.
  it('gives the expired and expiring signals distinct pill tones', () => {
    render(
      <ProposalsLedger
        orgSlug="acme"
        ledger={ledgerOf([
          p({ id: 'exp', status: 'sent', expires_at: '2026-08-10', first_opened_at: OPENED }),
          p({ id: 'soon', status: 'sent', expires_at: '2026-08-20', first_opened_at: OPENED }),
        ])}
      />
    )
    expect(screen.getByText('Expired')).toHaveClass('bg-[var(--status-alert-bg)]')
    expect(screen.getByText('Expiring soon')).not.toHaveClass('bg-[var(--status-alert-bg)]')
    expect(screen.getByText('Expiring soon')).toHaveClass('bg-[var(--status-pending-bg)]')
  })

  it('accents the expired row with a left border', () => {
    render(
      <ProposalsLedger
        orgSlug="acme"
        ledger={ledgerOf([
          p({ id: 'exp', status: 'sent', title: 'Late gala', expires_at: '2026-08-10', first_opened_at: OPENED }),
          p({ id: 'soon', status: 'sent', title: 'Soon gala', expires_at: '2026-08-20', first_opened_at: OPENED }),
        ])}
      />
    )
    expect(screen.getByRole('link', { name: /Late gala/ })).toHaveClass('border-l-destructive')
    expect(screen.getByRole('link', { name: /Soon gala/ })).not.toHaveClass('border-l-destructive')
  })

  // The local formatter this replaced printed "$1,234.5" — cents are all-or-none.
  it('renders both cents of a non-integer amount', () => {
    render(
      <ProposalsLedger
        orgSlug="acme"
        ledger={ledgerOf([
          p({
            id: 'cents',
            status: 'draft',
            line_items: [{ description: 'x', quantity: 1, unit_price: 1234.5 }],
          }),
        ])}
      />
    )
    // Once on the row, once in the Drafts roll-up.
    expect(screen.getAllByText('$1,234.50')).toHaveLength(2)
    expect(screen.queryByText('$1,234.5')).not.toBeInTheDocument()
  })
})
