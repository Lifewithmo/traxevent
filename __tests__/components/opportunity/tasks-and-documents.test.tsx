import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TasksAndDocuments, type TasksAndDocumentsHandle } from '@/components/admin/opportunity/TasksAndDocuments'
import type { Task } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/demo/leads/l1' }))
vi.mock('@/actions/tasks', () => ({ createTask: vi.fn(), completeTask: vi.fn() }))
vi.mock('@/actions/proposals', () => ({}))
vi.mock('@/actions/invoices', () => ({ createInvoice: vi.fn(), generateFromProposal: vi.fn() }))
vi.mock('@/actions/vendors', () => ({ createVendor: vi.fn(), updateVendor: vi.fn(), deleteVendor: vi.fn() }))

const base = {
  orgId: 'o1', orgSlug: 'demo', leadId: 'l1',
  tasks: [] as Task[], proposals: [], invoices: [],
  vendors: [], acceptedProposals: [],
  today: '2026-08-07',
}

describe('TasksAndDocuments', () => {
  it('renders the pill row with Tasks selected by default and one pane open', () => {
    render(<TasksAndDocuments {...base} />)
    expect(screen.getByText('Tasks & documents')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tasks/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Proposals/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/No tasks/)).toBeInTheDocument()          // Tasks pane
    expect(screen.queryByText(/New proposal/i)).not.toBeInTheDocument() // Proposals pane closed
  })
  it('switches panes and keeps only one open', async () => {
    const user = userEvent.setup()
    render(<TasksAndDocuments {...base} />)
    await user.click(screen.getByRole('button', { name: /Proposals/ }))
    expect(screen.getByRole('button', { name: /Proposals/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Tasks/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(/No tasks/)).not.toBeInTheDocument()
  })
  it('shows danger hints in the destructive color', async () => {
    const user = userEvent.setup()
    render(<TasksAndDocuments {...base} tasks={[{ id: 't1', lead_id: 'l1', title: 'Call venue', done: false, due_date: '2026-08-01', created_at: '' } as Task]} />)
    // Danger styling only applies to unselected chips, so switch off Tasks first.
    await user.click(screen.getByRole('button', { name: /Proposals/ }))
    expect(screen.getByText('· 1 overdue')).toHaveClass('text-destructive')
  })
  it('openTaskComposer selects the Tasks pill and opens the composer, even from another pane', async () => {
    const user = userEvent.setup()
    const ref = createRef<TasksAndDocumentsHandle>()
    render(<TasksAndDocuments {...base} tasks={[{ id: 't1', lead_id: 'l1', title: 'Call venue', done: false, created_at: '' } as Task]} ref={ref} />)
    await user.click(screen.getByRole('button', { name: /Proposals/ }))
    expect(screen.getByRole('button', { name: /Tasks/ })).toHaveAttribute('aria-pressed', 'false')

    act(() => { ref.current!.openTaskComposer() })

    expect(screen.getByRole('button', { name: /Tasks/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByPlaceholderText('Add a task…')).toBeInTheDocument()
  })
})
