import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TasksAndDocuments } from '@/components/admin/opportunity/TasksAndDocuments'
import type { Contract, Task } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/demo/leads/l1' }))
vi.mock('@/actions/tasks', () => ({ createTask: vi.fn(), completeTask: vi.fn() }))
vi.mock('@/actions/contracts', () => ({ createContract: vi.fn() }))
vi.mock('@/actions/proposals', () => ({}))
vi.mock('@/actions/invoices', () => ({ createInvoice: vi.fn(), generateFromProposal: vi.fn() }))
vi.mock('@/actions/vendors', () => ({ createVendor: vi.fn(), updateVendor: vi.fn(), deleteVendor: vi.fn() }))

const base = {
  orgId: 'o1', orgSlug: 'demo', leadId: 'l1',
  tasks: [] as Task[], proposals: [], invoices: [],
  contracts: [{ id: 'c1', status: 'sent' } as Contract], vendors: [], acceptedProposals: [],
}

describe('TasksAndDocuments', () => {
  it('renders the pill row with Tasks selected by default and one pane open', () => {
    render(<TasksAndDocuments {...base} />)
    expect(screen.getByText('Tasks & documents')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tasks/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Contracts/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/No tasks/)).toBeInTheDocument()          // Tasks pane
    expect(screen.queryByText(/New contract/i)).not.toBeInTheDocument() // Contracts pane closed
  })
  it('switches panes and keeps only one open', async () => {
    const user = userEvent.setup()
    render(<TasksAndDocuments {...base} />)
    await user.click(screen.getByRole('button', { name: /Contracts/ }))
    expect(screen.getByRole('button', { name: /Contracts/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Tasks/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(/No tasks/)).not.toBeInTheDocument()
  })
  it('shows danger hints in the destructive color', () => {
    render(<TasksAndDocuments {...base} />)
    expect(screen.getByText('· unsigned')).toHaveClass('text-destructive')
  })
})
