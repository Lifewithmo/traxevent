import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NewOpportunityForm } from '@/components/admin/pipeline/NewOpportunityForm'
import { createLead } from '@/actions/leads'
import { createEventTypeProfile } from '@/actions/event-type-profiles'
import type { EventTypeProfile } from '@/lib/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
// 'use server' modules backed by firebase-admin — mocked like the sibling
// new-opportunity-form tests do.
vi.mock('@/actions/leads', () => ({ createLead: vi.fn().mockResolvedValue({ id: 'l1', name: 'Jane Doe' }) }))
vi.mock('@/actions/event-type-profiles', () => ({
  createEventTypeProfile: vi.fn().mockResolvedValue({
    id: 'p-new', name: 'Quinceañera', needsMobile: true, needsVenue: false,
  }),
}))

const wedding: EventTypeProfile = { id: 'p-wed', name: 'Wedding', needsMobile: true, needsVenue: true }

/** Renders the form as an admin (canCreateEventTypes) with one listed profile. */
function renderAdminForm(props: Partial<React.ComponentProps<typeof NewOpportunityForm>> = {}) {
  return render(
    <NewOpportunityForm
      orgId="o1"
      orgSlug="brew"
      open
      onClose={() => {}}
      eventTypeProfiles={[wedding]}
      canCreateEventTypes
      {...props}
    />
  )
}

const typeInput = () => screen.getByLabelText('Event type')
/** The admin trigger: the "+ New event type…" option pinned at the bottom of
 *  the ONE event-type select. An action, not a value — see EventTypeSelect. */
const openCreate = () => fireEvent.change(typeInput(), { target: { value: '__create__' } })
/** Free text goes through "Something else…" now (one dropdown, no echo input). */
const chooseSomethingElse = () => fireEvent.change(typeInput(), { target: { value: '__other__' } })
const otherInput = () => screen.getByLabelText('Custom event type')
const popover = () => screen.queryByRole('dialog', { name: 'New event type' })
const nameField = () => screen.getByLabelText('Event type name')

describe('NewEventTypePopover (inline create-in-flow)', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('opening', () => {
    it('opens from the "+ New event type…" option with focus on the name field, empty when nothing is typed', async () => {
      renderAdminForm()
      openCreate()
      expect(popover()).toBeInTheDocument()
      // The outer New-opportunity dialog stays mounted underneath (inert
      // while the child is up, so a text query, not a role query).
      expect(screen.getByText('New opportunity')).toBeInTheDocument()
      expect(nameField()).toHaveValue('')
      await waitFor(() => expect(nameField()).toHaveFocus())
      // The option is an ACTION: the sentinel never committed, so the select
      // still sits on its placeholder.
      expect(document.getElementById('leadEventType')).toHaveValue('')
    })

    it('prefills the name from unrecognized free text via the hint action', async () => {
      renderAdminForm()
      chooseSomethingElse()
      fireEvent.change(otherInput(), { target: { value: '  Quinceañera ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add as event type' }))
      expect(popover()).toBeInTheDocument()
      expect(nameField()).toHaveValue('Quinceañera')
    })

    it('does NOT prefill from a pick that already matches a profile', () => {
      renderAdminForm()
      fireEvent.change(typeInput(), { target: { value: 'Wedding' } })
      openCreate()
      expect(nameField()).toHaveValue('')
    })
  })

  describe('policy toggles', () => {
    it('prefills needs-mobile pressed and needs-venue unpressed by default', () => {
      renderAdminForm()
      openCreate()
      expect(screen.getByRole('button', { name: 'needs serving unit', pressed: true })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'needs room', pressed: false })).toBeInTheDocument()
    })

    it('prefills needs-venue pressed when Where is currently On-site', () => {
      renderAdminForm({ showDeliveryMode: true })
      fireEvent.click(screen.getByRole('button', { name: 'On-site' }))
      openCreate()
      expect(screen.getByRole('button', { name: 'needs room', pressed: true })).toBeInTheDocument()
    })

    it("speaks the operator's own resource words via resourceLabels", () => {
      renderAdminForm({
        resourceLabels: { mobile: { one: 'cart', many: 'carts' }, venue: { one: 'taproom', many: 'taprooms' } },
      })
      openCreate()
      expect(screen.getByRole('button', { name: 'needs cart' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'needs taproom' })).toBeInTheDocument()
    })

    it('renders AA status tokens and stays motion-reduce safe', () => {
      renderAdminForm()
      openCreate()
      const pressed = screen.getByRole('button', { name: 'needs serving unit' })
      const unpressed = screen.getByRole('button', { name: 'needs room' })
      expect(pressed.className).toContain('--status-confirmed-bg')
      expect(unpressed.className).toContain('--status-neutral-bg')
      for (const pill of [pressed, unpressed]) {
        expect(pill.className).toContain('motion-reduce:transition-none')
        expect(pill.className).toContain('focus-visible:ring-3')
      }
    })
  })

  describe('create', () => {
    it('creates the profile, selects the new type in the dropdown, resolves the id, and returns focus to the flow', async () => {
      renderAdminForm()
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Jane Doe' } })
      chooseSomethingElse()
      fireEvent.change(otherInput(), { target: { value: 'Quinceañera' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add as event type' }))
      fireEvent.click(screen.getByRole('button', { name: 'Create type' }))

      await waitFor(() =>
        expect(createEventTypeProfile).toHaveBeenCalledWith('o1', {
          name: 'Quinceañera', needsMobile: true, needsVenue: false,
        })
      )
      // Popover closes; the created type is now a listed option AND the
      // select's current pick — Other mode stands down (the free text became
      // a real, configured type with the server-canonical name).
      await waitFor(() => expect(popover()).not.toBeInTheDocument())
      // The popover's submit must NEVER leak into the outer form (React
      // portals bubble through the React tree): no premature lead create.
      expect(createLead).not.toHaveBeenCalled()
      expect(typeInput()).toHaveValue('Quinceañera')
      expect(screen.getByRole('option', { name: 'Quinceañera' })).toBeInTheDocument()
      expect(screen.queryByLabelText('Custom event type')).not.toBeInTheDocument()
      // The hint stands down — the type is configured now.
      expect(screen.queryByText(/not a configured event type/i)).not.toBeInTheDocument()
      // Focus returns to the event-type select (never leave the flow).
      await waitFor(() => expect(typeInput()).toHaveFocus())

      // The very next lead create carries the new id.
      fireEvent.click(screen.getByRole('button', { name: 'Create opportunity' }))
      await waitFor(() =>
        expect(createLead).toHaveBeenCalledWith('o1', expect.objectContaining({
          event_type: 'Quinceañera', event_type_id: 'p-new',
        }))
      )
    })

    it('honors the toggles as pressed at create time', async () => {
      renderAdminForm()
      openCreate()
      fireEvent.change(nameField(), { target: { value: 'Festival' } })
      fireEvent.click(screen.getByRole('button', { name: 'needs serving unit' }))
      fireEvent.click(screen.getByRole('button', { name: 'needs room' }))
      fireEvent.click(screen.getByRole('button', { name: 'Create type' }))
      await waitFor(() =>
        expect(createEventTypeProfile).toHaveBeenCalledWith('o1', {
          name: 'Festival', needsMobile: false, needsVenue: true,
        })
      )
    })

    it('never calls the action with a blank name', async () => {
      renderAdminForm()
      openCreate()
      fireEvent.click(screen.getByRole('button', { name: 'Create type' }))
      expect(await screen.findByText(/enter a name/i)).toBeInTheDocument()
      expect(createEventTypeProfile).not.toHaveBeenCalled()
      expect(popover()).toBeInTheDocument()
    })

    // F8: createEventTypeProfile is idempotent on a case-insensitive name
    // match and returns the EXISTING profile with ITS policy — the toggles
    // the operator just set are then silently discarded. The flow must say so.
    it('announces when the name already existed and its saved policy overrides the toggles', async () => {
      // Existing "Wedding" needs a venue; the popover's defaults submit
      // needsVenue: false → policy mismatch.
      vi.mocked(createEventTypeProfile).mockResolvedValueOnce({
        id: 'p-wed', name: 'Wedding', needsMobile: true, needsVenue: true,
      })
      renderAdminForm()
      openCreate()
      fireEvent.change(nameField(), { target: { value: 'wedding' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create type' }))
      await waitFor(() => expect(popover()).not.toBeInTheDocument())
      // One line in the flow's announce region (aria-live), not a silent swap.
      const notice = screen.getByText('“Wedding” already existed — using its saved policy.')
      expect(notice.closest('[aria-live="polite"]')).not.toBeNull()
      // The existing type is still selected with its canonical casing.
      expect(typeInput()).toHaveValue('Wedding')
    })

    it('stays quiet when the created profile matches the submitted policy exactly', async () => {
      renderAdminForm() // default mock: needsMobile true / needsVenue false = the popover defaults
      openCreate()
      fireEvent.change(nameField(), { target: { value: 'Quinceañera' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create type' }))
      await waitFor(() => expect(popover()).not.toBeInTheDocument())
      expect(screen.queryByText(/already existed/i)).not.toBeInTheDocument()
    })

    it('surfaces a server failure in a live region and stays open for a retry', async () => {
      vi.mocked(createEventTypeProfile).mockRejectedValueOnce(new Error('Only an org admin can do that'))
      renderAdminForm()
      openCreate()
      fireEvent.change(nameField(), { target: { value: 'Festival' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create type' }))
      const error = await screen.findByText('Only an org admin can do that')
      expect(error.closest('[aria-live="polite"]')).not.toBeNull()
      expect(popover()).toBeInTheDocument()
      // Free text still never blocks: the outer form remains fully usable
      // (text query — the outer dialog is inert while the child is up).
      expect(screen.getByText('Create opportunity').closest('button')).not.toBeDisabled()
    })
  })

  describe('closing', () => {
    it('Escape closes only the popover and returns focus to the event-type input', async () => {
      renderAdminForm()
      openCreate()
      await waitFor(() => expect(nameField()).toHaveFocus())
      fireEvent.keyDown(nameField(), { key: 'Escape' })
      await waitFor(() => expect(popover()).not.toBeInTheDocument())
      // The outer dialog survives its child's Escape…
      expect(screen.getByRole('heading', { level: 2, name: 'New opportunity' })).toBeInTheDocument()
      // …and focus lands back on the flow's event-type input.
      await waitFor(() => expect(typeInput()).toHaveFocus())
      expect(createEventTypeProfile).not.toHaveBeenCalled()
    })

    it('Cancel does the same', async () => {
      renderAdminForm()
      openCreate()
      // Scoped: the outer New-opportunity dialog has its own Cancel button.
      const pop = screen.getByRole('dialog', { name: 'New event type' })
      fireEvent.click(within(pop).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(popover()).not.toBeInTheDocument())
      await waitFor(() => expect(typeInput()).toHaveFocus())
    })

    it('reopening starts a fresh draft (no stale name from the last open)', async () => {
      renderAdminForm()
      openCreate()
      fireEvent.change(nameField(), { target: { value: 'Stale draft' } })
      fireEvent.keyDown(nameField(), { key: 'Escape' })
      await waitFor(() => expect(popover()).not.toBeInTheDocument())
      openCreate()
      expect(nameField()).toHaveValue('')
    })
  })
})
