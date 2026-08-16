import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const push = vi.fn()
const refresh = vi.fn()
let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => search,
}))
const deleteLead = vi.fn().mockResolvedValue(undefined)
const setLeadStage = vi.fn().mockResolvedValue(undefined)
const updateLead = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({
  deleteLead: (...a: unknown[]) => deleteLead(...a),
  updateLead: (...a: unknown[]) => updateLead(...a),
  markLeadLost: vi.fn(),
  setLeadStage: (...a: unknown[]) => setLeadStage(...a),
  setLeadWaiting: vi.fn(),
  clearLeadWaiting: vi.fn(),
}))
vi.mock('@/actions/tasks', () => ({ createTask: vi.fn(), completeTask: vi.fn(), snoozeTask: vi.fn() }))
vi.mock('@/actions/notes', () => ({ createNote: vi.fn() }))
vi.mock('@/actions/proposals', () => ({}))
vi.mock('@/actions/invoices', () => ({ createInvoice: vi.fn(), generateFromProposal: vi.fn() }))
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
  vendors: [],
  acceptedProposals: [],
  today: '2026-08-07',
  calendarItems: [],
}

const base = {
  orgId: 'o1',
  orgSlug: 'acme',
  customer: null,
  tasks: [],
  activity: [],
  job: null,
  eventTypes: [],
  ...docsProps,
}

function openActions() {
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
}

describe('OpportunityDetailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteLead.mockResolvedValue(undefined)
    setLeadStage.mockResolvedValue(undefined)
    updateLead.mockResolvedValue(undefined)
    search = new URLSearchParams()
  })

  it('renders header, banner, tasks and activity', () => {
    render(<OpportunityDetailClient {...base} lead={lead} />)
    expect(screen.getByRole('heading', { name: 'Ada Wedding' })).toBeInTheDocument()
    expect(screen.getByText(/No tasks/)).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    // needs_attention banner CTA present (no tasks, open stage)
    expect(screen.getByRole('button', { name: /add next step/i })).toBeInTheDocument()
  })

  it('shows the stage as a status pill, not a flat badge', () => {
    render(<OpportunityDetailClient {...base} lead={lead} />)
    expect(screen.getByText('Proposal').closest('[data-slot="status-pill"]')).not.toBeNull()
  })

  it('puts stage moves and mark-lost behind the one actions menu', () => {
    render(<OpportunityDetailClient {...base} lead={lead} />)
    expect(screen.queryByRole('button', { name: 'Move stage' })).toBeNull()
    openActions()
    expect(screen.getByRole('menuitem', { name: 'Consultation' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Mark lost/ })).toBeInTheDocument()
  })

  it('deletes from the actions menu after a kit-dialog confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<OpportunityDetailClient {...base} lead={lead} />)
    openActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    expect(confirmSpy).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteLead).toHaveBeenCalledWith('o1', 'l1'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/acme/leads'))
  })

  it('confirms deletion using the opportunity title, not the contact name', () => {
    render(<OpportunityDetailClient {...base} lead={titledLead} />)
    openActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Riverside gala/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/Dana Kim/)).toBeNull()
  })

  it('focuses the task input when opened with ?focus=task', () => {
    search = new URLSearchParams('focus=task')
    render(<OpportunityDetailClient {...base} lead={lead} />)
    expect(screen.getByPlaceholderText(/add a task/i)).toHaveFocus()
  })

  it('opens the scheduler when the deal is won from the actions menu', async () => {
    const { rerender } = render(<OpportunityDetailClient {...base} lead={lead} />)
    openActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Closed Won' }))
    await waitFor(() => expect(setLeadStage).toHaveBeenCalledWith('o1', 'l1', 'closed_won'))
    // router.refresh() re-renders the tree with the won stage; the convert latch survives it.
    rerender(<OpportunityDetailClient {...base} lead={{ ...lead, stage: 'closed_won' }} />)
    expect(await screen.findByLabelText('Job name')).toBeInTheDocument()
  })

  it('opens the scheduler from a ?convert=1 deep link', async () => {
    search = new URLSearchParams('convert=1')
    render(<OpportunityDetailClient {...base} lead={{ ...lead, stage: 'closed_won' }} />)
    expect(await screen.findByLabelText('Job name')).toBeInTheDocument()
  })

  it('promotes the rollup figures onto the KPI band', () => {
    const { container } = render(
      <OpportunityDetailClient
        {...base}
        lead={{ ...lead, estimated_value: 4800, event_date: '2026-09-04', guest_count: 60 }}
        pastBookings={3}
      />
    )
    // Scoped: FactsGrid (P6's file, untouched here) still prints the same
    // estimated value in its details table, so the bare text is ambiguous.
    const band = within(container.querySelector('[data-slot="kpi-band"]') as HTMLElement)
    expect(band.getByText('$4,800').className).toContain('text-[var(--money-green)]')
    expect(band.getByText('28 days')).toBeInTheDocument()
    expect(band.getByText('Sep 4, 2026')).toBeInTheDocument()
    expect(band.getByText('returning client')).toBeInTheDocument()
  })

  it('offers + Add affordances instead of dashes when value and date are unset', () => {
    render(<OpportunityDetailClient {...base} lead={lead} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add value' }))
    expect(screen.getByRole('dialog', { name: /estimated value/i })).toBeInTheDocument()
  })

  // The + Add affordances are only worth having if they WRITE. Asserting the
  // dialog opens says nothing about the payload, which is how a bare '500'
  // reached Lead.event_date past a green suite.
  describe('the quick-fact dialogs', () => {
    function openFact(name: '+ Add value' | '+ Add date', dialogName: RegExp) {
      fireEvent.click(screen.getByRole('button', { name }))
      return screen.findByRole('dialog', { name: dialogName })
    }

    function fill(dialog: HTMLElement, label: string, value: string) {
      fireEvent.change(within(dialog).getByLabelText(label), { target: { value } })
    }

    function save(dialog: HTMLElement) {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    }

    it('writes the estimated value the operator typed', async () => {
      render(<OpportunityDetailClient {...base} lead={lead} />)
      const dialog = await openFact('+ Add value', /estimated value/i)
      fill(dialog, 'Estimated value', '500')
      save(dialog)
      await waitFor(() => expect(updateLead).toHaveBeenCalledWith('o1', 'l1', { estimated_value: 500 }))
      await waitFor(() => expect(refresh).toHaveBeenCalled())
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /estimated value/i })).toBeNull())
    })

    it('writes the event date the operator picked', async () => {
      render(<OpportunityDetailClient {...base} lead={lead} />)
      const dialog = await openFact('+ Add date', /event date/i)
      fill(dialog, 'Event date', '2026-09-04')
      save(dialog)
      await waitFor(() => expect(updateLead).toHaveBeenCalledWith('o1', 'l1', { event_date: '2026-09-04' }))
    })

    it('refuses a value that is not a number', async () => {
      render(<OpportunityDetailClient {...base} lead={lead} />)
      const dialog = await openFact('+ Add value', /estimated value/i)
      save(dialog)
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter a number.')
      expect(updateLead).not.toHaveBeenCalled()
    })

    // The regression: one `value` state serves both facts. Set the estimated
    // value, open the date dialog straight after, and the un-reset '500' rides
    // through a `if (!value)` guard into event_date while type="date" shows the
    // operator an empty field.
    it('never lets a non-date reach event_date after the value dialog was used', async () => {
      render(<OpportunityDetailClient {...base} lead={lead} />)
      const valueDialog = await openFact('+ Add value', /estimated value/i)
      fill(valueDialog, 'Estimated value', '500')
      save(valueDialog)
      await waitFor(() => expect(updateLead).toHaveBeenCalledWith('o1', 'l1', { estimated_value: 500 }))

      const dateDialog = await openFact('+ Add date', /event date/i)
      // Holds before AND after the fix — that is the point. type="date"
      // sanitises the stale '500' out of the rendered value, so the field the
      // operator sees is identical either way and the corruption is invisible
      // until it reaches the record. The assertions below are the biting ones.
      expect(within(dateDialog).getByLabelText('Event date')).toHaveValue('')
      save(dateDialog)

      expect(await within(dateDialog).findByRole('alert')).toHaveTextContent('Pick a date.')
      expect(updateLead).toHaveBeenCalledTimes(1)
      for (const call of updateLead.mock.calls) {
        expect(call[2]).not.toHaveProperty('event_date')
      }
    })

    it('keeps the dialog open and says why when the save is rejected', async () => {
      updateLead.mockRejectedValueOnce(new Error('boom'))
      render(<OpportunityDetailClient {...base} lead={lead} />)
      const dialog = await openFact('+ Add value', /estimated value/i)
      fill(dialog, 'Estimated value', '500')
      save(dialog)
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('boom')
      expect(screen.getByRole('dialog', { name: /estimated value/i })).toBeInTheDocument()
      expect(refresh).not.toHaveBeenCalled()
    })

    it('does not carry a failed save error into the next quick-fact dialog', async () => {
      updateLead.mockRejectedValueOnce(new Error('boom'))
      render(<OpportunityDetailClient {...base} lead={lead} />)
      const valueDialog = await openFact('+ Add value', /estimated value/i)
      fill(valueDialog, 'Estimated value', '500')
      save(valueDialog)
      expect(await within(valueDialog).findByRole('alert')).toHaveTextContent('boom')
      fireEvent.click(within(valueDialog).getByRole('button', { name: 'Cancel' }))

      const dateDialog = await openFact('+ Add date', /event date/i)
      expect(within(dateDialog).queryByRole('alert')).toBeNull()
    })
  })
})
