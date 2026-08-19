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
import type { CapacityUnit, Lead, NormalizedInvoice } from '@/lib/types'

// Only the fields the assignment picker reads; the rest satisfy the type.
function unit(p: Partial<CapacityUnit> & Pick<CapacityUnit, 'id' | 'name' | 'kind'>): CapacityUnit {
  return { active: true, blockouts: [], created_at: '2026-01-01T00:00:00.000Z', ...p }
}

// Only the fields the money helpers and the invoice pills read.
function invoice(p: Partial<NormalizedInvoice>): NormalizedInvoice {
  return {
    id: 'i1', org_id: 'o1', lead_id: 'l1', token: 'tok', type: 'final', lifecycle: 'sent',
    delivery: 'not_sent', accounting: 'not_connected', dispute: 'none',
    line_items: [{ description: 'Cart', quantity: 1, unit_price: 5000 }],
    payments: [], created_at: '2026-01-01T00:00:00.000Z', ...p,
  } as NormalizedInvoice
}

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

  // StageChip's "Mark lost" on the list AND the board pushes
  // /{org}/leads/{id}?focus=lost. Until this landed, nothing read `focus=lost`:
  // the destructive menu item dumped the operator on the opportunity page with
  // nothing focused and no dialog open, and they had to find "Mark lost" a
  // second time in the actions menu.
  describe('the ?focus=lost deep link', () => {
    it('opens the mark-lost dialog on arrival', async () => {
      search = new URLSearchParams('focus=lost')
      render(<OpportunityDetailClient {...base} lead={lead} />)
      const dialog = await screen.findByRole('dialog', { name: /mark lost/i })
      expect(within(dialog).getByText(/lost reasons/i)).toBeInTheDocument()
    })

    it('does not open it without the parameter', () => {
      render(<OpportunityDetailClient {...base} lead={lead} />)
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    // A latch, not a derived value: `searchParams` does not change when the
    // dialog is dismissed, so anything recomputed from it on every render would
    // slam the dialog back open the moment the tree re-rendered.
    it('stays shut once dismissed, across a re-render', async () => {
      search = new URLSearchParams('focus=lost')
      const { rerender } = render(<OpportunityDetailClient {...base} lead={lead} />)
      const dialog = await screen.findByRole('dialog', { name: /mark lost/i })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /mark lost/i })).toBeNull())
      rerender(<OpportunityDetailClient {...base} lead={lead} />)
      expect(screen.queryByRole('dialog', { name: /mark lost/i })).toBeNull()
    })

    it('leaves exactly one mark-lost dialog reachable, not two stacked', async () => {
      search = new URLSearchParams('focus=lost')
      render(<OpportunityDetailClient {...base} lead={lead} />)
      await screen.findByRole('dialog', { name: /mark lost/i })
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
    })
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

    // The Save button is disabled while saving, but the Enter path bypassed it
    // and `value` is not cleared until the await resolves — so held Enter wrote
    // the lead once per keypress and fired a router.refresh() for each.
    // FactsGrid guards the identical case one file away.
    it('writes once however many times Enter is pressed during the save', async () => {
      let settle: () => void = () => {}
      updateLead.mockImplementationOnce(() => new Promise<void>((res) => { settle = res }))
      render(<OpportunityDetailClient {...base} lead={lead} />)
      const dialog = await openFact('+ Add value', /estimated value/i)
      const input = within(dialog).getByLabelText('Estimated value')
      fireEvent.change(input, { target: { value: '500' } })

      fireEvent.keyDown(input, { key: 'Enter' })
      fireEvent.keyDown(input, { key: 'Enter' })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(updateLead).toHaveBeenCalledTimes(1)
      settle()
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
      expect(updateLead).toHaveBeenCalledTimes(1)
    })

    // money(-500) renders "$-500" in the money-green token on this page's own
    // tile, and the figure feeds the board column sums and the list rollups.
    it('refuses a negative estimated value instead of banking it', async () => {
      render(<OpportunityDetailClient {...base} lead={lead} />)
      const dialog = await openFact('+ Add value', /estimated value/i)
      fill(dialog, 'Estimated value', '-500')
      save(dialog)
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter a positive amount.')
      expect(updateLead).not.toHaveBeenCalled()
    })
  })

  /**
   * The Critical: the KPI band and the rail's invoices card print the SAME
   * label, "Open balance", ~400px apart. The band computed it as
   * `lifecycle !== 'void'` and LeadInvoicesClient (main's file, the invoice
   * module of record) as `lifecycle === 'sent'`, so every draft with a balance
   * was counted by one and excluded by the other. No test could catch it while
   * every composed case passed `invoices: []` and RelatedRecordCard only
   * renders its footer when rows exist.
   */
  describe('the two "Open balance" figures on this page', () => {
    function bandOpenBalance(container: HTMLElement): string {
      const band = container.querySelector('[data-slot="kpi-band"]') as HTMLElement
      const tile = within(band).getByText('Open balance').closest('[data-slot="stat-tile"]') as HTMLElement
      return tile.textContent ?? ''
    }
    function invoicesFooter(): string {
      // The card's own footer row, not the tile: same label, its own money format.
      const labels = screen.getAllByText('Open balance')
      const footer = labels.find((el) => el.closest('[data-slot="stat-tile"]') === null)
      return footer?.parentElement?.textContent ?? ''
    }

    it('agrees with the invoices card on a never-sent draft, past its due date', () => {
      const { container } = render(
        <OpportunityDetailClient
          {...base}
          lead={lead}
          invoices={[invoice({ lifecycle: 'draft', due_date: '2026-08-01' })]}
        />
      )
      // Nothing is owed: the client has never been handed this invoice.
      expect(bandOpenBalance(container)).toContain('$0')
      expect(bandOpenBalance(container)).toContain('nothing outstanding')
      expect(bandOpenBalance(container)).not.toContain('past due')
      expect(bandOpenBalance(container)).not.toContain('5,000')
      expect(invoicesFooter()).toContain('$0.00')
    })

    it('agrees with the invoices card when a sent invoice sits beside the draft', () => {
      const { container } = render(
        <OpportunityDetailClient
          {...base}
          lead={lead}
          invoices={[
            invoice({ id: 'i1', lifecycle: 'draft' }),
            invoice({ id: 'i2', lifecycle: 'sent', line_items: [{ description: 'Bar', quantity: 1, unit_price: 1200 }] }),
          ]}
        />
      )
      // Same figure, two formatters: money() on the tile ("$1,200") and money2()
      // in the invoice module ("$1200.00"). The formatter divergence is logged
      // as a separate minor against files this branch does not own; what matters
      // here is that both derive from the same invoice set.
      expect(bandOpenBalance(container)).toContain('$1,200')
      expect(invoicesFooter()).toContain('1200.00')
      expect(invoicesFooter()).not.toContain('6200')
    })
  })

  /**
   * The unit-assignment control (business tier + units + a date). It prevents a
   * double-booking AT THE PICK — an inline alert the moment the current
   * selection is a unit another same-date booking already holds — rather than
   * only flagging it downstream on the pipeline row.
   */
  describe('the unit-assignment control', () => {
    const k1 = unit({ id: 'k1', name: 'Kart 1', kind: 'mobile' })
    const k2 = unit({ id: 'k2', name: 'Kart 2', kind: 'mobile' })
    const roomA = unit({ id: 'r1', name: 'Room A', kind: 'venue' })

    it('renders Unassigned plus one annotated option per unit', () => {
      render(
        <OpportunityDetailClient
          {...base}
          lead={{ ...lead, event_date: '2026-09-27' }}
          showAssignment
          capacityUnits={[k1, k2]}
          unitAnnotations={{ k1: { takenBy: 'Benoit shower' }, k2: {} }}
        />
      )
      const select = screen.getByLabelText('Serving unit') as HTMLSelectElement
      const options = Array.from(select.options).map((o) => o.textContent)
      expect(options).toContain('Unassigned')
      expect(options).toContain('Kart 1 — taken by Benoit shower')
      expect(options).toContain('Kart 2 — free')
    })

    it('persists a MERGED assignment that keeps the existing room', async () => {
      render(
        <OpportunityDetailClient
          {...base}
          lead={{ ...lead, event_date: '2026-09-27', delivery_mode: 'onsite', assigned_units: { venue: 'r1' } }}
          showAssignment
          capacityUnits={[k1, roomA]}
          unitAnnotations={{ k1: {}, r1: {} }}
        />
      )
      fireEvent.change(screen.getByLabelText('Serving unit'), { target: { value: 'k1' } })
      await waitFor(() =>
        expect(updateLead).toHaveBeenCalledWith('o1', 'l1', { assigned_units: { venue: 'r1', mobile: 'k1' } })
      )
    })

    it('warns inline the moment the current serving unit is double-booked', () => {
      render(
        <OpportunityDetailClient
          {...base}
          lead={{ ...lead, event_date: '2026-09-27', assigned_units: { mobile: 'k1' } }}
          showAssignment
          capacityUnits={[k1, k2]}
          unitAnnotations={{ k1: { takenBy: 'Benoit shower' }, k2: {} }}
        />
      )
      expect(screen.getByRole('alert')).toHaveTextContent('Double-booked with Benoit shower')
    })

    it('warns inline when the current serving unit is blocked on the date', () => {
      render(
        <OpportunityDetailClient
          {...base}
          lead={{ ...lead, event_date: '2026-09-27', assigned_units: { mobile: 'k2' } }}
          showAssignment
          capacityUnits={[k1, k2]}
          unitAnnotations={{ k1: {}, k2: { blocked: true } }}
        />
      )
      expect(screen.getByRole('alert')).toHaveTextContent(/Unavailable — blocked/)
    })

    it('hides the room picker when the lead is offsite, shows it on-site', () => {
      const { rerender } = render(
        <OpportunityDetailClient
          {...base}
          lead={{ ...lead, event_date: '2026-09-27', delivery_mode: 'offsite' }}
          showAssignment
          capacityUnits={[k1, roomA]}
          unitAnnotations={{ k1: {}, r1: {} }}
        />
      )
      expect(screen.getByLabelText('Serving unit')).toBeInTheDocument()
      expect(screen.queryByLabelText('Room')).toBeNull()

      rerender(
        <OpportunityDetailClient
          {...base}
          lead={{ ...lead, event_date: '2026-09-27', delivery_mode: 'onsite' }}
          showAssignment
          capacityUnits={[k1, roomA]}
          unitAnnotations={{ k1: {}, r1: {} }}
        />
      )
      expect(screen.getByLabelText('Room')).toBeInTheDocument()
    })

    it('is absent entirely when showAssignment is false', () => {
      render(<OpportunityDetailClient {...base} lead={lead} />)
      expect(screen.queryByLabelText('Serving unit')).toBeNull()
    })
  })

  /**
   * P5 built the sticky header and P6 kept ContactCard's buttons; neither saw
   * the other's file. On any opportunity with an email and a phone that put two
   * identically-named "Email" links and two "Call" links on screen at once,
   * both in the links rotor.
   */
  it('offers exactly one Email and one Call control on the whole page', () => {
    render(
      <OpportunityDetailClient
        {...base}
        lead={{ ...lead, email: 'ada@x.com', phone: '5551234' }}
      />
    )
    expect(document.querySelectorAll('a[href^="mailto:"]')).toHaveLength(1)
    expect(document.querySelectorAll('a[href^="tel:"]')).toHaveLength(1)
  })

  /**
   * R3. The rail stacked seven panels beside a spine that, on a fresh inquiry,
   * is a KPI band plus two near-empty cards — a 656px column of nothing next to
   * a 1,200px single-file stack. Proposals and invoices are the two related
   * panes an operator ACTS on, so they belong with the decision.
   */
  describe('the spine/rail split', () => {
    it('puts the panes an operator acts on in the spine, not the reference rail', () => {
      const { container } = render(<OpportunityDetailClient {...base} lead={lead} />)
      const spine = container.querySelector('[data-slot="cockpit-spine"]') as HTMLElement
      const rail = container.querySelector('[data-slot="cockpit-rail"]') as HTMLElement

      expect(within(spine).getByText('Proposals')).toBeInTheDocument()
      expect(within(spine).getByText('Invoices')).toBeInTheDocument()
      expect(within(rail).queryByText('Proposals')).toBeNull()
      expect(within(rail).queryByText('Invoices')).toBeNull()
      // Reference stays in the rail.
      expect(within(rail).getByText('Details')).toBeInTheDocument()
    })

    // The blocked convert card's "Go to proposals" is a fragment link, so its
    // target id has to actually exist on the page it is rendered in.
    it('gives the proposals pane the id the blocked convert card links to', () => {
      const { container } = render(<OpportunityDetailClient {...base} lead={lead} />)
      const anchorTarget = container.querySelector('#lead-proposals') as HTMLElement
      expect(anchorTarget).not.toBeNull()
      expect(within(anchorTarget).getByText('Proposals')).toBeInTheDocument()
    })

    // LeadVendorsClient (main's file) hard-codes a 3-up money band whose only
    // escape hatch is a max-[420px] VIEWPORT query — which never fires when the
    // window is wide and only the 432px rail column is narrow. Overridden at the
    // call site because that module is not this branch's to edit. jsdom cannot
    // measure, so this pins the override's presence, not the pixels; a browser
    // pass at 1024/1280/1440 is still owed.
    it('overrides the vendors money band to one column inside the narrow rail', () => {
      const { container } = render(<OpportunityDetailClient {...base} lead={lead} />)
      const rail = container.querySelector('[data-slot="cockpit-rail"]') as HTMLElement
      const band = rail.querySelector('[data-slot="kpi-band"]') as HTMLElement
      expect(band).not.toBeNull()
      // The generated class name is full of CSS metacharacters, so walk the
      // ancestors rather than trying to escape it into a selector.
      let ancestor: HTMLElement | null = band
      let overridden = false
      while (ancestor && ancestor !== rail.parentElement) {
        if (ancestor.className.includes('[&_[data-slot=kpi-band]]:grid-cols-1')) overridden = true
        ancestor = ancestor.parentElement
      }
      expect(overridden).toBe(true)
    })
  })
})
