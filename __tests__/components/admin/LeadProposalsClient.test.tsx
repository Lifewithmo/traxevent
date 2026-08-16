import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LeadProposalsClient } from '@/components/admin/LeadProposalsClient'
import type { Proposal, ProposalStatus } from '@/lib/types'

const writeText = vi.fn().mockResolvedValue(undefined)

// userEvent.setup() installs its own navigator.clipboard stub, so this has to
// be re-applied after setup() in any test that drives the copy button.
function stubClipboard() {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

beforeEach(() => {
  writeText.mockClear()
  stubClipboard()
})

function proposal(over: Partial<Proposal> & Pick<Proposal, 'id' | 'status'>): Proposal {
  return {
    org_id: 'o1',
    lead_id: 'l1',
    token: `tok-${over.id}`,
    title: 'Wedding package',
    line_items: [{ description: 'Bar service', quantity: 1, unit_price: 100 }],
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  } as Proposal
}

const base = { orgId: 'o1', orgSlug: 'acme', leadId: 'l1' }

describe('LeadProposalsClient', () => {
  it('renders a distinctly toned pill for each of the five statuses', () => {
    const statuses: ProposalStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'voided']
    render(
      <LeadProposalsClient
        {...base}
        proposals={statuses.map((status) => proposal({ id: status, status, title: `P ${status}` }))}
      />,
    )

    for (const label of ['Draft', 'Sent', 'Accepted', 'Rejected', 'Voided']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    // The headline fix: statuses no longer collapse into one grey badge.
    const accepted = screen.getByText('Accepted')
    const draft = screen.getByText('Draft')
    expect(accepted.className).toContain('var(--status-confirmed-bg)')
    expect(draft.className).not.toContain('var(--status-confirmed-bg)')
    expect(draft.className).toContain('var(--status-neutral-bg)')
    expect(accepted.className).not.toEqual(draft.className)
  })

  it('shows the kit empty state with a New proposal link when there are no proposals', () => {
    render(<LeadProposalsClient {...base} proposals={[]} />)

    expect(screen.getByText('No proposals yet')).toBeInTheDocument()
    expect(screen.getByText('Draft one to send this client pricing.')).toBeInTheDocument()

    const links = screen.getAllByRole('link', { name: 'New proposal' })
    expect(links).toHaveLength(2) // header CTA + empty-state CTA
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/acme/leads/l1/proposals/new')
    }
  })

  it('offers Copy client link for a sent proposal but not for a draft', () => {
    const { unmount } = render(
      <LeadProposalsClient {...base} proposals={[proposal({ id: 'p1', status: 'sent' })]} />,
    )
    expect(screen.getByRole('button', { name: 'Copy client link' })).toBeInTheDocument()
    unmount()

    render(<LeadProposalsClient {...base} proposals={[proposal({ id: 'p2', status: 'draft' })]} />)
    expect(screen.queryByRole('button', { name: 'Copy client link' })).not.toBeInTheDocument()
  })

  it('copies the public proposal URL and acknowledges with Copied!', async () => {
    const user = userEvent.setup()
    stubClipboard()
    render(
      <LeadProposalsClient {...base} proposals={[proposal({ id: 'p1', status: 'sent', token: 'tok-abc' })]} />,
    )

    await user.click(screen.getByRole('button', { name: 'Copy client link' }))

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/proposals/tok-abc`)
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument()
  })

  it('reverts Copied! to the resting label after the acknowledgement window', async () => {
    // fireEvent, not userEvent: userEvent's own internal timers deadlock
    // against vi.useFakeTimers() here, and the assertion is about the
    // component's setTimeout, not about pointer-event fidelity.
    vi.useFakeTimers()
    try {
      render(
        <LeadProposalsClient {...base} proposals={[proposal({ id: 'p1', status: 'sent', token: 'tok-abc' })]} />,
      )

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy client link' }))
      })
      expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(2000)
      })
      expect(screen.getByRole('button', { name: 'Copy client link' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('formats the amount with thousands separators', () => {
    render(
      <LeadProposalsClient
        {...base}
        proposals={[
          proposal({
            id: 'p1',
            status: 'accepted',
            line_items: [{ description: 'Full service', quantity: 1, unit_price: 12345 }],
          }),
        ]}
      />,
    )

    expect(screen.getByText('$12,345')).toBeInTheDocument()
  })

  it('links each row to its editor', () => {
    render(<LeadProposalsClient {...base} proposals={[proposal({ id: 'p9', status: 'sent' })]} />)
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/acme/leads/l1/proposals/p9',
    )
  })
})
