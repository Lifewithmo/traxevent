import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const push = vi.fn()
const refresh = vi.fn()
let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => search,
}))
const deleteLead = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({
  deleteLead: (...a: unknown[]) => deleteLead(...a),
  updateLead: vi.fn(),
  markLeadLost: vi.fn(),
  setLeadStage: vi.fn(),
  setLeadWaiting: vi.fn(),
  clearLeadWaiting: vi.fn(),
}))
vi.mock('@/actions/tasks', () => ({ createTask: vi.fn(), completeTask: vi.fn(), snoozeTask: vi.fn() }))
vi.mock('@/actions/notes', () => ({ createNote: vi.fn() }))
vi.mock('@/actions/proposals', () => ({}))
vi.mock('@/actions/invoices', () => ({ createInvoice: vi.fn(), generateFromProposal: vi.fn() }))
vi.mock('@/actions/contracts', () => ({ createContract: vi.fn() }))
vi.mock('@/actions/vendors', () => ({ createVendor: vi.fn(), updateVendor: vi.fn(), deleteVendor: vi.fn() }))
vi.mock('@/actions/calendar', () => ({ listCalendarRange: vi.fn().mockResolvedValue([]) }))
vi.mock('@/actions/client-portal', () => ({ ensureClientPortalToken: vi.fn() }))

import { OpportunityDetailClient } from '@/components/admin/OpportunityDetailClient'
import type { Lead } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'Ada Wedding', stage: 'proposal', created_at: '' }
const titledLead: Lead = { id: 'l2', name: 'Dana Kim', title: 'Riverside gala', stage: 'proposal', created_at: '' }

const docsProps = {
  proposals: [],
  invoices: [],
  contracts: [],
  vendors: [],
  acceptedProposals: [],
  today: '2026-08-07',
  calendarItems: [],
}

describe('OpportunityDetailClient', () => {
  beforeEach(() => { push.mockClear(); deleteLead.mockClear(); search = new URLSearchParams() })

  it('renders header, banner, tasks and activity', () => {
    render(<OpportunityDetailClient orgId="o1" orgSlug="acme" lead={lead} customer={null} tasks={[]} activity={[]} job={null} eventTypes={[]} {...docsProps} />)
    expect(screen.getByRole('heading', { name: 'Ada Wedding' })).toBeInTheDocument()
    expect(screen.getByText(/No tasks/)).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    // needs_attention banner CTA present (no tasks, open stage)
    expect(screen.getByRole('button', { name: /add next step/i })).toBeInTheDocument()
  })

  it('shows the stage as a badge with mark-lost and move-stage controls', () => {
    render(<OpportunityDetailClient orgId="o1" orgSlug="acme" lead={lead} customer={null} tasks={[]} activity={[]} job={null} eventTypes={[]} {...docsProps} />)
    const header = screen.getByRole('heading', { name: 'Ada Wedding' }).parentElement!
    expect(header).toHaveTextContent('Proposal')
    expect(screen.getByRole('button', { name: 'Mark lost' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move stage' })).toBeInTheDocument()
  })

  it('deletes from the overflow menu after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<OpportunityDetailClient orgId="o1" orgSlug="acme" lead={lead} customer={null} tasks={[]} activity={[]} job={null} eventTypes={[]} {...docsProps} />)
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }))
    await waitFor(() => expect(deleteLead).toHaveBeenCalledWith('o1', 'l1'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/acme/leads'))
  })

  it('confirms deletion using the opportunity title, not the contact name', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<OpportunityDetailClient orgId="o1" orgSlug="acme" lead={titledLead} customer={null} tasks={[]} activity={[]} job={null} eventTypes={[]} {...docsProps} />)
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }))
    expect(confirmSpy).toHaveBeenCalledWith('Delete "Riverside gala"? This cannot be undone.')
  })

  it('focuses the task input when opened with ?focus=task', () => {
    search = new URLSearchParams('focus=task')
    render(<OpportunityDetailClient orgId="o1" orgSlug="acme" lead={lead} customer={null} tasks={[]} activity={[]} job={null} eventTypes={[]} {...docsProps} />)
    expect(screen.getByPlaceholderText(/add a task/i)).toHaveFocus()
  })
})
