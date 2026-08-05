import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LeadInvoicesClient } from '@/components/admin/LeadInvoicesClient'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
const generateFromProposal = vi.fn()
vi.mock('@/actions/invoices', () => ({
  createInvoice: vi.fn().mockResolvedValue({ id: 'new' }),
  generateFromProposal: (...a: unknown[]) => generateFromProposal(...a),
}))

const base = { orgId: 'o', orgSlug: 's', leadId: 'l', invoices: [] as never[] }

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
