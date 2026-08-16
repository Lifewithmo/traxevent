import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LeadInvoicesClient } from '@/components/admin/LeadInvoicesClient'
import type { NormalizedInvoice } from '@/lib/types'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
const generateFromProposal = vi.fn()
const createInvoice = vi.fn().mockResolvedValue({ id: 'new' })
vi.mock('@/actions/invoices', () => ({
  createInvoice: (...a: unknown[]) => createInvoice(...a),
  generateFromProposal: (...a: unknown[]) => generateFromProposal(...a),
}))

const base = { orgId: 'o', orgSlug: 's', leadId: 'l', invoices: [] as never[] }

// A `sent` invoice one month past due with nothing applied is the only shape
// that reaches the alert pill; `paid`/`draft` differ only in the two fields
// each case overrides.
function invoice(over: Partial<NormalizedInvoice> & { id: string }): NormalizedInvoice {
  return {
    org_id: 'o',
    lead_id: 'l',
    token: `tok-${over.id}`,
    line_items: [{ description: 'Bar service', quantity: 1, unit_price: 500 }],
    payments: [],
    created_at: '2026-01-01T00:00:00.000Z',
    type: 'final',
    lifecycle: 'sent',
    delivery: 'sent',
    accounting: 'not_connected',
    dispute: 'none',
    ...over,
  }
}

const daysFromToday = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

describe('LeadInvoicesClient — generate from proposal', () => {
  it('hides the generate action when there are no accepted proposals', () => {
    render(<LeadInvoicesClient {...base} acceptedProposals={[]} />)
    expect(screen.queryByRole('button', { name: /generate from proposal/i })).not.toBeInTheDocument()
  })

  it('shows it with one accepted proposal and no proposal select', () => {
    render(<LeadInvoicesClient {...base} acceptedProposals={[{ id: 'p1', title: 'Wedding' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /generate from proposal/i }))
    // type select present, proposal select absent (only one)
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/proposal/i)).not.toBeInTheDocument()
  })

  it('shows a proposal select when there is more than one accepted proposal', () => {
    render(<LeadInvoicesClient {...base} acceptedProposals={[{ id: 'p1', title: 'A' }, { id: 'p2', title: 'B' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /generate from proposal/i }))
    expect(screen.getByLabelText(/proposal/i)).toBeInTheDocument()
  })

  it('generates with the chosen type and navigates to the new draft', async () => {
    generateFromProposal.mockResolvedValue({ id: 'inv-9' })
    render(<LeadInvoicesClient {...base} acceptedProposals={[{ id: 'p1', title: 'Wedding' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /generate from proposal/i }))
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'final' } })
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }))
    await waitFor(() => expect(generateFromProposal).toHaveBeenCalledWith('o', 'l', 'p1', { type: 'final' }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/s/leads/l/invoices/inv-9'))
  })

  it('surfaces a generate error inline', async () => {
    generateFromProposal.mockRejectedValue(new Error('Invoice exceeds approved scope by $100.00'))
    render(<LeadInvoicesClient {...base} acceptedProposals={[{ id: 'p1', title: 'Wedding' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /generate from proposal/i }))
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }))
    await waitFor(() => expect(screen.getByText(/exceeds approved scope/i)).toBeInTheDocument())
  })
})

describe('LeadInvoicesClient — status pills', () => {
  it('reads the money state, not the lifecycle, on each row', () => {
    render(
      <LeadInvoicesClient
        {...base}
        invoices={[
          invoice({ id: 'i-late', due_date: daysFromToday(-30) }),
          invoice({
            id: 'i-paid',
            due_date: daysFromToday(-30),
            payments: [{ amount: 500, recorded_at: '2026-01-05T00:00:00.000Z' }],
          }),
          invoice({ id: 'i-draft', lifecycle: 'draft' }),
        ]}
        acceptedProposals={[]}
      />
    )
    // Three `sent`/`draft` rows that a single gray Badge used to flatten.
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('tints the open balance when anything is overdue and excludes void invoices', () => {
    render(
      <LeadInvoicesClient
        {...base}
        invoices={[
          invoice({ id: 'i-late', due_date: daysFromToday(-30) }),
          invoice({ id: 'i-void', lifecycle: 'void' }),
        ]}
        acceptedProposals={[]}
      />
    )
    // Both invoices carry a $500 balance; only the non-void one is owed.
    const balance = screen.getByText('Open balance').nextElementSibling
    expect(balance).toHaveTextContent('$500.00')
    expect(balance).toHaveClass('text-destructive')
  })
})

describe('LeadInvoicesClient — per-row client link', () => {
  it('offers the copy affordance on a sent invoice', () => {
    render(<LeadInvoicesClient {...base} invoices={[invoice({ id: 'i-sent' })]} acceptedProposals={[]} />)
    expect(screen.getByRole('button', { name: /copy client link/i })).toBeInTheDocument()
  })

  it('withholds it on a draft, which has no client link yet', () => {
    render(
      <LeadInvoicesClient {...base} invoices={[invoice({ id: 'i-draft', lifecycle: 'draft' })]} acceptedProposals={[]} />
    )
    expect(screen.queryByRole('button', { name: /copy client link/i })).not.toBeInTheDocument()
  })

  it('copies the public URL and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<LeadInvoicesClient {...base} invoices={[invoice({ id: 'i-sent' })]} acceptedProposals={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /copy client link/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invoices/tok-i-sent`))
    await waitFor(() => expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument())
  })
})

describe('LeadInvoicesClient — empty state', () => {
  it('creates an invoice from the empty-state CTA', async () => {
    createInvoice.mockClear()
    createInvoice.mockResolvedValue({ id: 'inv-1' })
    render(<LeadInvoicesClient {...base} acceptedProposals={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /^create invoice$/i }))
    await waitFor(() => expect(createInvoice).toHaveBeenCalledWith('o', 'l', {}))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/s/leads/l/invoices/inv-1'))
  })
})
