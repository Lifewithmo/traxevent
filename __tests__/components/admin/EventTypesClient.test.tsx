import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const routerRefresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn() }),
}))

const createEventTypeProfile = vi.hoisted(() => vi.fn())
const renameEventTypeProfile = vi.hoisted(() => vi.fn())
const mergeEventTypeProfiles = vi.hoisted(() => vi.fn())
const deleteEventTypeProfile = vi.hoisted(() => vi.fn())
const adoptEventTypesFromHistory = vi.hoisted(() => vi.fn())
vi.mock('@/actions/event-type-profiles', () => ({
  createEventTypeProfile,
  renameEventTypeProfile,
  mergeEventTypeProfiles,
  deleteEventTypeProfile,
  adoptEventTypesFromHistory,
}))

const updateEventTypeProfiles = vi.hoisted(() => vi.fn())
vi.mock('@/actions/capacity-config', () => ({
  updateEventTypeProfiles,
}))

import { EventTypesClient } from '@/components/admin/EventTypesClient'
import type { EventTypeUsage } from '@/lib/crm/event-type-admin'
import type { EventTypeProfile } from '@/lib/types'

beforeEach(() => vi.clearAllMocks())

const wedding: EventTypeProfile = { id: 'et1', name: 'Wedding', needsMobile: true, needsVenue: true }
const corporate: EventTypeProfile = { id: 'et2', name: 'Corporate', needsMobile: true, needsVenue: false }

function usage(over: Partial<EventTypeUsage> = {}): EventTypeUsage {
  return { byProfileId: {}, unadopted: [], ...over }
}

const base = {
  orgId: 'o1',
  orgSlug: 'brewtrax',
  kindLabels: { mobileOne: 'cart', venueOne: 'room' },
}

/** The whole-array payload updateEventTypeProfiles received on call n (default: last). */
function savedArray(call = -1): EventTypeProfile[] {
  const calls = updateEventTypeProfiles.mock.calls
  return calls.at(call)![1] as EventTypeProfile[]
}

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: `${name} — actions` }))
}

describe('EventTypesClient', () => {
  it('renders each profile as a row: inline name, kindLabel policy pills, and a usage count with its noun', () => {
    render(
      <EventTypesClient
        {...base}
        initialProfiles={[wedding, corporate]}
        usage={usage({ byProfileId: { et1: 12, et2: 1 } })}
      />,
    )
    expect(screen.getByDisplayValue('Wedding')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Corporate')).toBeInTheDocument()
    // Policy pills speak the operator's kind vocabulary and expose state via aria-pressed.
    expect(screen.getByRole('button', { name: 'Wedding — needs cart' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Wedding — needs room' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Corporate — needs room' })).toHaveAttribute('aria-pressed', 'false')
    // Usage counts, singular handled.
    expect(screen.getByText('12 jobs')).toBeInTheDocument()
    expect(screen.getByText('1 job')).toBeInTheDocument()
  })

  it('always states the default rule in a hint line, routed through the operator kind labels', () => {
    render(<EventTypesClient {...base} initialProfiles={[wedding]} usage={usage()} />)
    expect(
      screen.getByText(/Types not on this list use the default — a cart always, a room when on-site\./i),
    ).toBeInTheDocument()
  })

  it('toggling a policy pill persists the WHOLE array (ids intact) through updateEventTypeProfiles', async () => {
    updateEventTypeProfiles.mockResolvedValue(undefined)
    render(<EventTypesClient {...base} initialProfiles={[wedding, corporate]} usage={usage()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Wedding — needs room' }))
    await waitFor(() =>
      expect(updateEventTypeProfiles).toHaveBeenCalledWith('o1', [
        { id: 'et1', name: 'Wedding', needsMobile: true, needsVenue: false },
        corporate,
      ]),
    )
    expect(screen.getByRole('button', { name: 'Wedding — needs room' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('rolls the optimistic toggle back and surfaces the error in the aria-live region when the save rejects', async () => {
    updateEventTypeProfiles.mockRejectedValue(new Error('Forbidden'))
    render(<EventTypesClient {...base} initialProfiles={[wedding]} usage={usage()} />)

    const pill = screen.getByRole('button', { name: 'Wedding — needs room' })
    fireEvent.click(pill)
    expect(await screen.findByText('Forbidden')).toBeInTheDocument()
    // Rolled back to the pre-toggle state.
    expect(pill).toHaveAttribute('aria-pressed', 'true')
    // The message lives inside the polite live region.
    expect(screen.getByText('Forbidden').closest('[aria-live="polite"]')).not.toBeNull()
  })

  it('renames through renameEventTypeProfile (the backfilling action), not the whole-array save', async () => {
    renameEventTypeProfile.mockResolvedValue({ updated: 4 })
    render(<EventTypesClient {...base} initialProfiles={[wedding]} usage={usage()} />)

    const input = screen.getByDisplayValue('Wedding')
    fireEvent.change(input, { target: { value: 'Reception' } })
    fireEvent.blur(input)
    await waitFor(() => expect(renameEventTypeProfile).toHaveBeenCalledWith('o1', 'et1', 'Reception'))
    expect(updateEventTypeProfiles).not.toHaveBeenCalled()
  })

  it('a name collision rolls the rename back and surfaces the merge-instead message', async () => {
    renameEventTypeProfile.mockRejectedValue(
      new Error('An event type with that name already exists — merge instead'),
    )
    render(<EventTypesClient {...base} initialProfiles={[wedding, corporate]} usage={usage()} />)

    const input = screen.getByDisplayValue('Wedding')
    fireEvent.change(input, { target: { value: 'corporate' } })
    fireEvent.blur(input)
    expect(await screen.findByText(/already exists — merge instead/i)).toBeInTheDocument()
    expect(screen.getByText(/merge instead/i).closest('[aria-live="polite"]')).not.toBeNull()
    // The optimistic name change reverted.
    expect(screen.getByDisplayValue('Wedding')).toBeInTheDocument()
  })

  it('renaming a legacy id-less entry first materialises its id via the idempotent create', async () => {
    const legacy: EventTypeProfile = { name: 'Legacy', needsMobile: true, needsVenue: false }
    createEventTypeProfile.mockResolvedValue({ id: 'lx1', name: 'Legacy', needsMobile: true, needsVenue: false })
    renameEventTypeProfile.mockResolvedValue({ updated: 0 })
    render(<EventTypesClient {...base} initialProfiles={[legacy]} usage={usage()} />)

    const input = screen.getByDisplayValue('Legacy')
    fireEvent.change(input, { target: { value: 'Legacy 2' } })
    fireEvent.blur(input)
    await waitFor(() => expect(renameEventTypeProfile).toHaveBeenCalledWith('o1', 'lx1', 'Legacy 2'))
    expect(createEventTypeProfile).toHaveBeenCalledWith('o1', {
      name: 'Legacy',
      needsMobile: true,
      needsVenue: false,
    })
  })

  it('archives from the row menu via the whole-array save, keeps the row listed, and flags it Archived', async () => {
    const user = userEvent.setup()
    updateEventTypeProfiles.mockResolvedValue(undefined)
    render(<EventTypesClient {...base} initialProfiles={[wedding, corporate]} usage={usage()} />)

    await openRowMenu(user, 'Wedding')
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))

    await waitFor(() => expect(updateEventTypeProfiles).toHaveBeenCalled())
    expect(savedArray()[0]).toMatchObject({ id: 'et1', archived: true })
    // Still on the list — archive hides it from pickers, not from settings.
    expect(screen.getByDisplayValue('Wedding')).toBeInTheDocument()
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('an archived row offers Restore, which clears the flag through the whole-array save', async () => {
    const user = userEvent.setup()
    updateEventTypeProfiles.mockResolvedValue(undefined)
    render(
      <EventTypesClient
        {...base}
        initialProfiles={[{ ...wedding, archived: true }, corporate]}
        usage={usage()}
      />,
    )
    expect(screen.getByText('Archived')).toBeInTheDocument()

    await openRowMenu(user, 'Wedding')
    await user.click(await screen.findByRole('menuitem', { name: 'Restore' }))
    await waitFor(() => expect(updateEventTypeProfiles).toHaveBeenCalled())
    expect(savedArray()[0]).toMatchObject({ id: 'et1', archived: false })
  })

  it('reorders with Move down by persisting the swapped whole array', async () => {
    const user = userEvent.setup()
    updateEventTypeProfiles.mockResolvedValue(undefined)
    render(<EventTypesClient {...base} initialProfiles={[wedding, corporate]} usage={usage()} />)

    await openRowMenu(user, 'Wedding')
    await user.click(await screen.findByRole('menuitem', { name: 'Move down' }))
    await waitFor(() =>
      expect(updateEventTypeProfiles).toHaveBeenCalledWith('o1', [corporate, wedding]),
    )
  })

  it('disables Move up on the first row and Move down on the last', async () => {
    const user = userEvent.setup()
    render(<EventTypesClient {...base} initialProfiles={[wedding, corporate]} usage={usage()} />)

    await openRowMenu(user, 'Wedding')
    expect(await screen.findByRole('menuitem', { name: 'Move up' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: 'Move down' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('Merge into… opens a destructive ConfirmDialog carrying the usage count, then calls mergeEventTypeProfiles', async () => {
    const user = userEvent.setup()
    mergeEventTypeProfiles.mockResolvedValue({ updated: 3 })
    render(
      <EventTypesClient
        {...base}
        initialProfiles={[wedding, corporate]}
        usage={usage({ byProfileId: { et1: 3, et2: 5 } })}
      />,
    )

    await openRowMenu(user, 'Wedding')
    await user.click(await screen.findByRole('menuitem', { name: 'Merge into “Corporate”' }))

    // The dialog names both types and the blast radius before the verb.
    expect(await screen.findByText('Merge “Wedding” into “Corporate”?')).toBeInTheDocument()
    expect(screen.getByText(/3 opportunities will be reclassified/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Merge' }))

    await waitFor(() => expect(mergeEventTypeProfiles).toHaveBeenCalledWith('o1', 'et1', 'et2'))
    // The source row leaves the list.
    await waitFor(() => expect(screen.queryByDisplayValue('Wedding')).not.toBeInTheDocument())
  })

  it('disables Delete with the archive-or-merge hint while the type is in use', async () => {
    const user = userEvent.setup()
    render(
      <EventTypesClient
        {...base}
        initialProfiles={[wedding, corporate]}
        usage={usage({ byProfileId: { et1: 12, et2: 0 } })}
      />,
    )

    await openRowMenu(user, 'Wedding')
    const del = await screen.findByRole('menuitem', { name: /Delete/ })
    expect(del).toHaveAttribute('aria-disabled', 'true')
    expect(del).toHaveAttribute('title', 'In use — archive or merge instead')
  })

  it('deletes a zero-usage type behind a ConfirmDialog through deleteEventTypeProfile', async () => {
    const user = userEvent.setup()
    deleteEventTypeProfile.mockResolvedValue({ ok: true })
    render(
      <EventTypesClient
        {...base}
        initialProfiles={[wedding, corporate]}
        usage={usage({ byProfileId: { et1: 0, et2: 2 } })}
      />,
    )

    await openRowMenu(user, 'Wedding')
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    expect(await screen.findByText('Delete “Wedding”?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteEventTypeProfile).toHaveBeenCalledWith('o1', 'et1'))
    await waitFor(() => expect(screen.queryByDisplayValue('Wedding')).not.toBeInTheDocument())
  })

  it('restores the row and reports the server-verified usage when delete loses the race', async () => {
    const user = userEvent.setup()
    // The guard is a RETURN VALUE (never a throw): another session booked jobs since render.
    deleteEventTypeProfile.mockResolvedValue({ ok: false, usage: 2 })
    render(
      <EventTypesClient
        {...base}
        initialProfiles={[wedding]}
        usage={usage({ byProfileId: { et1: 0 } })}
      />,
    )

    await openRowMenu(user, 'Wedding')
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/2 jobs.*archive or merge instead/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Wedding')).toBeInTheDocument()
  })

  it('adds an event type through createEventTypeProfile and appends the returned (id-bearing) profile', async () => {
    const user = userEvent.setup()
    createEventTypeProfile.mockResolvedValue({
      id: 'new1', name: 'Photo package', needsMobile: false, needsVenue: false,
    })
    render(<EventTypesClient {...base} initialProfiles={[wedding]} usage={usage()} />)

    await user.click(screen.getByRole('button', { name: 'Add event type' }))
    await user.type(screen.getByLabelText('Event type name'), 'Photo package')
    // A photo shoot needs neither kind — switch the default off.
    await user.click(screen.getByRole('button', { name: 'needs cart' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(createEventTypeProfile).toHaveBeenCalledWith('o1', {
        name: 'Photo package', needsMobile: false, needsVenue: false,
      }),
    )
    expect(await screen.findByDisplayValue('Photo package')).toBeInTheDocument()
  })

  describe('adopt from history', () => {
    const drift = usage({
      byProfileId: { et1: 4 },
      unadopted: [
        { name: 'Corporate offsite', count: 3, onsiteMajority: true },
        { name: 'Collaboration', count: 1, onsiteMajority: false },
      ],
    })

    it('renders pre-checked rows with counts and inference-prefilled policy pills', () => {
      render(<EventTypesClient {...base} initialProfiles={[wedding]} usage={drift} />)

      expect(screen.getByRole('checkbox', { name: 'Adopt Corporate offsite' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'Adopt Collaboration' })).toBeChecked()
      expect(screen.getByText('3 jobs')).toBeInTheDocument()
      // needsMobile always prefilled on; needsVenue follows the onsite majority.
      expect(screen.getByRole('button', { name: 'Corporate offsite — needs cart' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Corporate offsite — needs room' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Collaboration — needs room' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('creates exactly the checked rows with their (possibly re-toggled) policies', async () => {
      const user = userEvent.setup()
      adoptEventTypesFromHistory.mockResolvedValue({ created: 1, adopted: 3 })
      render(<EventTypesClient {...base} initialProfiles={[wedding]} usage={drift} />)

      expect(screen.getByRole('button', { name: 'Create 2 event types' })).toBeInTheDocument()
      await user.click(screen.getByRole('checkbox', { name: 'Adopt Collaboration' }))
      // The operator overrides the inferred venue policy before adopting.
      await user.click(screen.getByRole('button', { name: 'Corporate offsite — needs room' }))
      await user.click(screen.getByRole('button', { name: 'Create 1 event type' }))

      await waitFor(() =>
        expect(adoptEventTypesFromHistory).toHaveBeenCalledWith('o1', [
          { name: 'Corporate offsite', needsMobile: true, needsVenue: false },
        ]),
      )
      // The trust loop closes with the receipt.
      expect(await screen.findByText(/1 event type created.*3 jobs classified/i)).toBeInTheDocument()
    })

    it('shows no adopt section when history is fully adopted', () => {
      render(<EventTypesClient {...base} initialProfiles={[wedding]} usage={usage()} />)
      expect(screen.queryByText(/from your history/i)).not.toBeInTheDocument()
    })
  })

  it('shows an EmptyState onboarding action for a truly-empty org (no profiles, no history)', async () => {
    const user = userEvent.setup()
    render(<EventTypesClient {...base} initialProfiles={[]} usage={usage()} />)

    expect(screen.getByText('Add your first event type')).toBeInTheDocument()
    // The action opens the same add form.
    await user.click(screen.getByRole('button', { name: 'Add your first event type' }))
    expect(screen.getByLabelText('Event type name')).toBeInTheDocument()
  })
})
