import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NewOpportunityForm } from '@/components/admin/pipeline/NewOpportunityForm'
import { addBusinessDays, defaultFollowUpYmd } from '@/components/admin/pipeline/FollowUpField'
import { createLead } from '@/actions/leads'
import { todayYmd, addDays } from '@/lib/opportunity-detail'
import { shortDayLabel, type BookabilityCtx } from '@/lib/calendar-bookability'
import type { Customer } from '@/lib/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
// 'use server' module backed by firebase-admin — mocked like CustomerDetailClient.test.tsx does.
vi.mock('@/actions/leads', () => ({
  createLead: vi.fn().mockResolvedValue({
    id: 'l1', name: 'Jane Doe', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z',
  }),
}))

const dana: Customer = {
  id: 'c1', name: 'Dana Kim', company: 'Riverside', email: 'dana@riv.co',
  phone: '(208) 555-0142', created_at: '2026-01-01T00:00:00.000Z',
}
const sam: Customer = { id: 'c2', name: 'Sam Ortiz', created_at: '2026-01-01T00:00:00.000Z' }

const today = todayYmd()
// 30 days out with prepLeadDays 0: lead time never binds, so the degraded-arm
// conflict is the only constraint in play and the verdict is deterministic.
const conflictDate = addDays(today, 30)
const degradedCtx: BookabilityCtx = {
  today,
  prepLeadDays: 0,
  orgSlug: 'brew',
  radar: { mode: 'degraded', conflictDates: [conflictDate], bookedCounts: { [conflictDate]: 2 } },
}

function renderForm(props: Partial<React.ComponentProps<typeof NewOpportunityForm>> = {}) {
  const onClose = vi.fn()
  const utils = render(
    <NewOpportunityForm orgId="o1" orgSlug="brew" open onClose={onClose} {...props} />
  )
  return { onClose, ...utils }
}

const nameInput = () => screen.getByRole('textbox', { name: 'Name' })
const banner = () => document.body.querySelector('[data-slot="bookability-banner"]')

describe('NewOpportunityForm', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('dialog shell', () => {
    it('owns its dialog and shows a visible level-2 heading', () => {
      renderForm()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2, name: 'New opportunity' })).toBeInTheDocument()
    })

    it('never disables the submit button for validation reasons', () => {
      renderForm()
      expect(screen.getByRole('button', { name: 'Create opportunity' })).not.toBeDisabled()
    })
  })

  describe('submit paths', () => {
    it('submits on Enter in a text input', async () => {
      const user = userEvent.setup()
      renderForm()
      await user.type(nameInput(), 'Jane Doe{Enter}')
      await waitFor(() =>
        expect(createLead).toHaveBeenCalledWith('o1', expect.objectContaining({ name: 'Jane Doe' }))
      )
    })

    it('submits on Cmd/Ctrl+Enter from the notes textarea', async () => {
      renderForm()
      fireEvent.change(nameInput(), { target: { value: 'Jane Doe' } })
      fireEvent.click(screen.getByRole('button', { name: /more details/i }))
      const notes = screen.getByLabelText('Notes')
      fireEvent.change(notes, { target: { value: 'called about a wedding' } })
      fireEvent.keyDown(notes, { key: 'Enter', metaKey: true })
      await waitFor(() =>
        expect(createLead).toHaveBeenCalledWith('o1', expect.objectContaining({
          name: 'Jane Doe', notes: 'called about a wedding',
        }))
      )
    })

    it('closes, resets and refreshes after a normal create', async () => {
      const { onClose } = renderForm()
      fireEvent.change(nameInput(), { target: { value: 'Jane Doe' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create opportunity' }))
      await waitFor(() => expect(createLead).toHaveBeenCalled())
      expect(onClose).toHaveBeenCalled()
      expect(refresh).toHaveBeenCalled()
    })

    it('fires onCreated with the created lead', async () => {
      const onCreated = vi.fn()
      renderForm({ onCreated })
      fireEvent.change(nameInput(), { target: { value: 'Jane Doe' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create opportunity' }))
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' })))
    })
  })

  describe('save and create another (Cmd/Ctrl+Shift+Enter)', () => {
    it('keeps what-and-when, clears who, stays open, refocuses Name', async () => {
      const { onClose } = renderForm({ eventTypeOptions: ['Wedding', 'Market'] })
      fireEvent.change(nameInput(), { target: { value: 'Jane Doe' } })
      fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '208-555-9999' } })
      fireEvent.click(screen.getByRole('button', { name: 'Wedding' }))
      const dateInput = screen.getByLabelText('Event date')
      fireEvent.change(dateInput, { target: { value: conflictDate } })
      fireEvent.change(screen.getByLabelText('Guests'), { target: { value: '120' } })

      fireEvent.keyDown(nameInput(), { key: 'Enter', ctrlKey: true, shiftKey: true })
      await waitFor(() =>
        expect(createLead).toHaveBeenCalledWith('o1', expect.objectContaining({
          name: 'Jane Doe', event_type: 'Wedding', event_date: conflictDate, guest_count: 120,
        }))
      )

      // Still open — the who half is fresh, the what-and-when half is kept.
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(nameInput()).toHaveValue('')
      expect(screen.getByLabelText('Phone')).toHaveValue('')
      expect(screen.getByLabelText('Guests')).toHaveValue(null)
      expect(screen.getByLabelText('Event type')).toHaveValue('Wedding')
      expect(screen.getByLabelText('Event date')).toHaveValue(conflictDate)
      // Follow-up resets to the default, name gets focus, list still refreshes.
      expect(screen.getByLabelText('Follow up by')).toHaveValue(defaultFollowUpYmd(today))
      await waitFor(() => expect(nameInput()).toHaveFocus())
      expect(refresh).toHaveBeenCalled()
    })
  })

  describe('validation', () => {
    it('shows a field error wired via aria on submit and focuses the field', async () => {
      renderForm()
      // Let the dialog's own initial focus land first, then move focus away so
      // the assertion below can only pass if submit really moves it back.
      await waitFor(() => expect(nameInput()).toHaveFocus())
      const submit = screen.getByRole('button', { name: 'Create opportunity' })
      submit.focus()
      fireEvent.click(submit)
      const error = await screen.findByText('Please enter your name.')
      const input = nameInput()
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input).toHaveAttribute('aria-describedby', error.id)
      await waitFor(() => expect(input).toHaveFocus())
      expect(createLead).not.toHaveBeenCalled()
    })

    it('marks Name as required to assistive tech', () => {
      renderForm()
      expect(nameInput()).toHaveAttribute('aria-required', 'true')
    })

    it('reopens the More-details disclosure to focus an invalid email', async () => {
      renderForm()
      // Settle the dialog's delayed initial focus before interacting — in a
      // real browser it lands long before the first keystroke; in jsdom the
      // whole test would otherwise outrun it and the late focus would stomp
      // the submit-time focus this test asserts.
      await waitFor(() => expect(nameInput()).toHaveFocus())
      fireEvent.change(nameInput(), { target: { value: 'Jane Doe' } })
      const toggle = screen.getByRole('button', { name: /more details/i })
      fireEvent.click(toggle)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
      fireEvent.click(toggle) // collapse again — the error must reopen it
      expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Create opportunity' }))
      const error = await screen.findByText('Please enter a valid email address.')
      const email = screen.getByLabelText('Email')
      expect(email).toHaveAttribute('aria-invalid', 'true')
      expect(email).toHaveAttribute('aria-describedby', error.id)
      await waitFor(() => expect(email).toHaveFocus())
      expect(createLead).not.toHaveBeenCalled()
    })
  })

  describe('caller recognition', () => {
    it('recognizes a typed phone number by its digits and links on request', async () => {
      renderForm({ customers: [dana, sam] })
      // Bare digits typed against the customer's formatted "(208) 555-0142".
      fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '2085550142' } })
      expect(screen.getByText(/looks like/i)).toHaveTextContent('Dana Kim')

      fireEvent.click(screen.getByRole('button', { name: 'Link' }))
      expect(screen.getByText(/linked to/i)).toBeInTheDocument()
      // Linking snaps to the customer_id path: contact fields leave the form.
      expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Create opportunity' }))
      await waitFor(() =>
        expect(createLead).toHaveBeenCalledWith('o1', expect.objectContaining({ customer_id: 'c1' }))
      )
      expect(vi.mocked(createLead).mock.calls[0][1]).not.toHaveProperty('name')
    })

    it('recognizes an exactly matching name but never auto-links', () => {
      renderForm({ customers: [dana, sam] })
      fireEvent.change(nameInput(), { target: { value: 'sam ortiz' } })
      expect(screen.getByText(/looks like/i)).toHaveTextContent('Sam Ortiz')
      // Hint only — the name path is still the new-client path until Link is pressed.
      expect(screen.queryByText(/linked to/i)).not.toBeInTheDocument()
    })

    it('stays dismissed for the rest of the open once declined', () => {
      renderForm({ customers: [dana] })
      const phone = screen.getByLabelText('Phone')
      fireEvent.change(phone, { target: { value: '2085550142' } })
      expect(screen.getByText(/looks like/i)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'No, new client' }))
      expect(screen.queryByText(/looks like/i)).not.toBeInTheDocument()

      // Re-typing the same identity must not nag again this open.
      fireEvent.change(phone, { target: { value: '' } })
      fireEvent.change(phone, { target: { value: '(208) 555-0142' } })
      expect(screen.queryByText(/looks like/i)).not.toBeInTheDocument()
    })
  })

  describe('bookability verdict at the date field', () => {
    it('renders the live verdict for a conflicted date from a preloaded ctx', () => {
      renderForm({ bookabilityCtx: degradedCtx })
      fireEvent.change(screen.getByLabelText('Event date'), { target: { value: conflictDate } })
      const el = banner()
      expect(el).not.toBeNull()
      expect(el).toHaveAttribute('data-verdict', 'tight')
      expect(el).toHaveTextContent(/more than one job already shares/i)
    })

    it('adopts an alternative date with one tap on its chip', () => {
      renderForm({ bookabilityCtx: degradedCtx })
      fireEvent.change(screen.getByLabelText('Event date'), { target: { value: conflictDate } })
      const alt = addDays(conflictDate, 7)
      fireEvent.click(screen.getByRole('button', { name: shortDayLabel(alt) }))
      expect(screen.getByLabelText('Event date')).toHaveValue(alt)
      // The adopted date is clear, so the verdict relaxes to the quiet open line.
      expect(banner()).toHaveAttribute('data-verdict', 'open')
    })

    it('shows the amber past-date note instead of an engine verdict', () => {
      renderForm({ bookabilityCtx: degradedCtx })
      fireEvent.change(screen.getByLabelText('Event date'), { target: { value: addDays(today, -7) } })
      expect(screen.getByText(/that date is in the past/i)).toBeInTheDocument()
      expect(banner()).toBeNull()
    })

    it('degrades silently when no ctx is available', () => {
      renderForm()
      fireEvent.change(screen.getByLabelText('Event date'), { target: { value: conflictDate } })
      expect(banner()).toBeNull()
      expect(screen.getByRole('button', { name: 'Create opportunity' })).not.toBeDisabled()
    })

    it('lazy-loads the ctx once on first open when only a loader is given', async () => {
      const loadBookabilityCtx = vi.fn().mockResolvedValue(degradedCtx)
      const { rerender } = renderForm({ loadBookabilityCtx })
      await waitFor(() => expect(loadBookabilityCtx).toHaveBeenCalledTimes(1))
      fireEvent.change(screen.getByLabelText('Event date'), { target: { value: conflictDate } })
      await waitFor(() => expect(banner()).toHaveAttribute('data-verdict', 'tight'))

      // Close and reopen: the loader is not called again.
      rerender(<NewOpportunityForm orgId="o1" orgSlug="brew" open={false} onClose={() => {}} loadBookabilityCtx={loadBookabilityCtx} />)
      rerender(<NewOpportunityForm orgId="o1" orgSlug="brew" open onClose={() => {}} loadBookabilityCtx={loadBookabilityCtx} />)
      expect(loadBookabilityCtx).toHaveBeenCalledTimes(1)
    })
  })

  describe('event-type chips', () => {
    it('selects and toggles a chip, mirroring the free-text input', () => {
      renderForm({ eventTypeOptions: ['Wedding', 'Market'] })
      const chip = screen.getByRole('button', { name: 'Wedding' })
      fireEvent.click(chip)
      expect(screen.getByRole('button', { name: 'Wedding' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByLabelText('Event type')).toHaveValue('Wedding')
      fireEvent.click(screen.getByRole('button', { name: 'Wedding' }))
      expect(screen.getByLabelText('Event type')).toHaveValue('')
    })

    it('hints quietly when a typed value matches no configured type', () => {
      renderForm({ eventTypeOptions: ['Wedding'] })
      fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'Birthday' } })
      expect(screen.getByText(/not a configured event type/i)).toBeInTheDocument()
    })

    it('renders a plain input with no chips and no hint when there are no options', () => {
      renderForm()
      fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'Birthday' } })
      expect(screen.queryByText(/not a configured event type/i)).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: /common event types/i })).not.toBeInTheDocument()
    })
  })

  describe('follow-up at birth', () => {
    it('defaults to two business days out and rides along on create', async () => {
      renderForm()
      expect(screen.getByLabelText('Follow up by')).toHaveValue(defaultFollowUpYmd(today))
      fireEvent.change(nameInput(), { target: { value: 'Jane Doe' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create opportunity' }))
      await waitFor(() =>
        expect(createLead).toHaveBeenCalledWith('o1', expect.objectContaining({
          follow_up_date: defaultFollowUpYmd(today),
        }))
      )
    })

    it('creates no task when cleared', async () => {
      renderForm()
      fireEvent.change(nameInput(), { target: { value: 'Jane Doe' } })
      fireEvent.change(screen.getByLabelText('Follow up by'), { target: { value: '' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create opportunity' }))
      await waitFor(() => expect(createLead).toHaveBeenCalled())
      expect(vi.mocked(createLead).mock.calls[0][1]).not.toHaveProperty('follow_up_date')
    })

    it('skips weekends when adding business days', () => {
      // 2026-09-09 is a Wednesday; 2026-09-11 a Friday; 2026-09-12 a Saturday.
      expect(addBusinessDays('2026-09-09', 2)).toBe('2026-09-11') // Wed -> Fri
      expect(addBusinessDays('2026-09-11', 2)).toBe('2026-09-15') // Fri -> Tue (over the weekend)
      expect(addBusinessDays('2026-09-12', 2)).toBe('2026-09-15') // Sat -> Tue
      expect(defaultFollowUpYmd('2026-09-11')).toBe('2026-09-15')
    })
  })

  describe('close semantics', () => {
    it('resets the draft on Cancel', () => {
      const { onClose, rerender } = renderForm()
      fireEvent.change(nameInput(), { target: { value: 'Jane Doe' } })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onClose).toHaveBeenCalled()

      rerender(<NewOpportunityForm orgId="o1" orgSlug="brew" open={false} onClose={onClose} />)
      rerender(<NewOpportunityForm orgId="o1" orgSlug="brew" open onClose={onClose} />)
      expect(nameInput()).toHaveValue('')
    })

    it('resets the draft on Escape too — one consistent close behavior', () => {
      const { onClose, rerender } = renderForm()
      fireEvent.change(nameInput(), { target: { value: 'Jane Doe' } })
      fireEvent.keyDown(nameInput(), { key: 'Escape' })
      expect(onClose).toHaveBeenCalled()

      rerender(<NewOpportunityForm orgId="o1" orgSlug="brew" open={false} onClose={onClose} />)
      rerender(<NewOpportunityForm orgId="o1" orgSlug="brew" open onClose={onClose} />)
      expect(nameInput()).toHaveValue('')
    })
  })

  describe('who section states', () => {
    it('welcomes the first client when the org has no customers yet', () => {
      renderForm({ customers: [] })
      expect(screen.getByText(/this will be your first client/i)).toBeInTheDocument()
    })

    it('keeps the picker collapsed to one line until asked for', () => {
      renderForm({ customers: [dana, sam] })
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /search clients/i }))
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('moves focus to the event-type input after picking a client', async () => {
      renderForm({ customers: [dana, sam] })
      fireEvent.click(screen.getByRole('button', { name: /search clients/i }))
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dana' } })
      fireEvent.click(screen.getByRole('button', { name: /dana kim/i }))
      expect(screen.getByText(/linked to/i)).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText('Event type')).toHaveFocus())
    })
  })

  describe('cockpit prefill', () => {
    it('prefills event type and guests from initialValues', () => {
      renderForm({ customer: dana, initialValues: { event_type: 'Wedding', guest_count: 80 } })
      expect(screen.getByLabelText('Event type')).toHaveValue('Wedding')
      expect(screen.getByLabelText('Guests')).toHaveValue(80)
    })
  })
})
