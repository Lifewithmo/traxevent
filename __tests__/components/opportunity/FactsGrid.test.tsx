import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const updateLead = vi.hoisted(() => vi.fn())
const refresh = vi.hoisted(() => vi.fn())
vi.mock('@/actions/leads', () => ({ updateLead }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

import { FactsGrid } from '@/components/admin/opportunity/FactsGrid'
import type { EventTypeProfile, Lead } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'Dana Kim', stage: 'proposal', created_at: '' }
// Event types inc 1 (spec §5d): FactsGrid's Event type fact now picks from
// the org's active profiles via EventTypeSelect — most tests exercise that
// path, with a dedicated group below covering the 0-profiles fallback.
const eventTypeProfiles: EventTypeProfile[] = [
  { id: 'et-wedding', name: 'Wedding', needsMobile: true, needsVenue: true },
  { id: 'et-corporate', name: 'Corporate', needsMobile: true, needsVenue: false },
]
const props = { orgId: 'o1', orgSlug: 'acme', lead, customer: null, eventTypeProfiles }

describe('FactsGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateLead.mockResolvedValue(undefined)
  })

  it('offers "+ Add" affordances for unset facts and never renders an em dash', () => {
    render(<FactsGrid {...props} />)
    expect(screen.getByRole('button', { name: '+ Add Guest count' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add Event type' })).toBeInTheDocument()
    expect(screen.queryByText('—')).toBeNull()
  })

  it('renders a set fact as a click-to-edit value, not a dash', () => {
    render(<FactsGrid {...props} lead={{ ...lead, guest_count: 150, event_type: 'Wedding' }} />)
    expect(screen.getByRole('button', { name: '150 guests' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wedding' })).toBeInTheDocument()
    expect(screen.queryByText('—')).toBeNull()
  })

  it('opens an inline input on the field itself, without swapping out the whole card', () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Guest count' }))
    expect(screen.getByLabelText('Guest count')).toBeInTheDocument()
    // The other facts stay put — the card did not reflow into a form.
    expect(screen.getByRole('button', { name: '+ Add Event type' })).toBeInTheDocument()
  })

  // The event date is a figure on OpportunityKpiBand, whose "+ Add date" tile
  // action opens QuickFactDialog and writes the same `event_date`. Keeping it
  // here too shipped TWO editors for one field and printed the same date twice
  // under two labels on one screen — the exact thing the estimated-value note
  // in this file's docblock forbids.
  it('does not render or edit the event date — the KPI band owns it', () => {
    const { rerender } = render(<FactsGrid {...props} />)
    expect(screen.queryByRole('button', { name: '+ Add Event date' })).toBeNull()
    expect(screen.queryByText('Event date')).toBeNull()

    rerender(<FactsGrid {...props} lead={{ ...lead, event_date: '2026-09-12' }} />)
    expect(screen.queryByText('Sep 12, 2026')).toBeNull()
    expect(screen.queryByText('2026-09-12')).toBeNull()
  })

  // router.refresh() returns before the RSC payload lands, so the committed
  // value is held locally for a whole round trip. Held RAW it read "150" and
  // then flipped to "150 guests" — a formatter the card applies to the prop but
  // not to its own optimistic value.
  it('formats the held value while the refreshed prop is in flight', async () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Guest count' }))
    const input = screen.getByLabelText('Guest count')
    fireEvent.change(input, { target: { value: '150' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByRole('button', { name: '150 guests' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '150' })).toBeNull()
  })

  it('commits a guest count as a number, not a string', async () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Guest count' }))
    const input = screen.getByLabelText('Guest count')
    fireEvent.change(input, { target: { value: '120' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(updateLead).toHaveBeenCalledWith('o1', 'l1', { guest_count: 120 }))
  })

  it('keeps the full details form as an escape hatch rather than the default view', () => {
    render(<FactsGrid {...props} />)
    expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /edit all details/i }))
    expect(screen.getByLabelText('Notes')).toBeInTheDocument()
  })
})

// Event types inc 1 (spec §5d): the Event type fact switches to
// EventTypeSelect — a select of the org's active profiles + "Other…". Picking
// a listed profile is a discrete, save-worthy action and commits immediately
// (EventTypeSelect's `onCommitSelect`); the revealed Other free-text field
// keeps the exact commit-on-blur/Enter, revert-on-Escape lifecycle every
// other fact here uses (EditableFact's contract, specialized because the
// value is now the compound `{event_type, event_type_id}`, not one string).
describe('FactsGrid — Event type picker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateLead.mockResolvedValue(undefined)
  })

  it('opens the select on a blank fact, defaulted to no choice', () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    const select = screen.getByLabelText('Event type') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('')
    expect(screen.queryByLabelText('Custom event type')).not.toBeInTheDocument()
  })

  it('opens a SET fact with the matching profile pre-selected', () => {
    render(<FactsGrid {...props} lead={{ ...lead, event_type: 'Wedding', event_type_id: 'et-wedding' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wedding' }))
    const select = screen.getByLabelText('Event type') as HTMLSelectElement
    expect(select.value).toBe('Wedding')
  })

  it('picking a listed profile commits immediately with its id', async () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'Corporate' } })
    await waitFor(() =>
      expect(updateLead).toHaveBeenCalledWith('o1', 'l1', { event_type: 'Corporate', event_type_id: 'et-corporate' })
    )
    expect(await screen.findByRole('button', { name: 'Corporate' })).toBeInTheDocument()
  })

  it('reverts on Escape without calling the action', () => {
    render(<FactsGrid {...props} lead={{ ...lead, event_type: 'Wedding', event_type_id: 'et-wedding' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wedding' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '__other__' } })
    const input = screen.getByLabelText('Custom event type')
    fireEvent.change(input, { target: { value: 'Gala' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByLabelText('Custom event type')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wedding' })).toBeInTheDocument()
    expect(updateLead).not.toHaveBeenCalled()
  })

  it('commits the Other free text on Enter through the existing updateLead action', async () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '__other__' } })
    const input = screen.getByLabelText('Custom event type')
    fireEvent.change(input, { target: { value: 'Gala' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(updateLead).toHaveBeenCalledWith('o1', 'l1', { event_type: 'Gala', event_type_id: null }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('choosing Other… and leaving it blank clears the field on blur (null, not undefined)', async () => {
    render(<FactsGrid {...props} lead={{ ...lead, event_type: 'Wedding', event_type_id: 'et-wedding' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wedding' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '__other__' } })
    fireEvent.blur(screen.getByLabelText('Custom event type'))
    await waitFor(() => expect(updateLead).toHaveBeenCalledWith('o1', 'l1', { event_type: null, event_type_id: null }))
  })

  // THE INTO-OTHER HANDOFF. Picking "Other…" clears the draft (so the operator
  // can type) and mounts the autofocused Other input — at which point, in a
  // real browser, the SELECT blurs with relatedTarget = that input. The host's
  // commit-on-blur must not treat that hand-off blur as "operator left the
  // control": it would commit the just-cleared draft, saving event_type: null
  // over a set value (or closing the editor on a blank one) before a single
  // keystroke. jsdom never runs the focus cascade — nine green tests missed
  // this — so the hand-off blur is driven explicitly below to pin it.
  it('picking "Other…" on a set fact saves nothing and leaves the editor open in Other mode', () => {
    render(<FactsGrid {...props} lead={{ ...lead, event_type: 'Wedding', event_type_id: 'et-wedding' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wedding' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '__other__' } })
    expect(updateLead).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Custom event type')).toBeInTheDocument()
  })

  it('the select blur during the into-Other handoff never commits the cleared draft', async () => {
    render(<FactsGrid {...props} lead={{ ...lead, event_type: 'Wedding', event_type_id: 'et-wedding' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wedding' }))
    const select = screen.getByLabelText('Event type')
    fireEvent.change(select, { target: { value: '__other__' } })
    fireEvent.blur(select, { relatedTarget: screen.getByLabelText('Custom event type') })
    await Promise.resolve()
    expect(updateLead).not.toHaveBeenCalled()
    // Editor still open in Other mode, ready for typing.
    expect(screen.getByLabelText('Custom event type')).toBeInTheDocument()
  })

  it('typing in the Other field after the handoff commits exactly the typed value on blur', async () => {
    render(<FactsGrid {...props} lead={{ ...lead, event_type: 'Wedding', event_type_id: 'et-wedding' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wedding' }))
    const select = screen.getByLabelText('Event type')
    fireEvent.change(select, { target: { value: '__other__' } })
    fireEvent.blur(select, { relatedTarget: screen.getByLabelText('Custom event type') })
    const other = screen.getByLabelText('Custom event type')
    fireEvent.change(other, { target: { value: 'Gala' } })
    fireEvent.blur(other)
    await waitFor(() =>
      expect(updateLead).toHaveBeenCalledWith('o1', 'l1', { event_type: 'Gala', event_type_id: null })
    )
    expect(updateLead).toHaveBeenCalledTimes(1)
  })

  it('surfaces a failed save instead of silently dropping the edit', async () => {
    updateLead.mockRejectedValue(new Error('Permission denied'))
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '__other__' } })
    fireEvent.change(screen.getByLabelText('Custom event type'), { target: { value: 'Gala' } })
    fireEvent.keyDown(screen.getByLabelText('Custom event type'), { key: 'Enter' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
  })

  // A real browser fires blur when the committing input becomes unfocusable —
  // React flushes `busy` at the end of the discrete keydown, the input goes
  // inert, and the unfocusing steps run on the active element. jsdom does not
  // implement any of that, so the blur is driven explicitly here. Without the
  // guard in commit(), that second call sees an unchanged draft and writes
  // again.
  it('commits once on Enter even when the save-time blur follows', async () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '__other__' } })
    const input = screen.getByLabelText('Custom event type')
    fireEvent.change(input, { target: { value: 'Gala' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    expect(updateLead).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(updateLead).toHaveBeenCalledTimes(1)
  })

  // Unlike a plain text EditableFact, this control can be disabled mid-save
  // via a `disabled` prop on EventTypeSelect (a native `<select>` has no
  // `readOnly` equivalent) — so FactsGrid deliberately never sets it, the
  // same "stay focusable" contract EditableFact keeps with `readOnly` instead
  // of `disabled`.
  it('never disables the Other field mid-save, so focus is not ripped away', () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '__other__' } })
    const input = screen.getByLabelText('Custom event type') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Gala' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.disabled).toBe(false)
  })

  // router.refresh() returns before the RSC payload lands, so `lead` is still
  // the stale prop for a whole round trip after a successful save.
  it('holds the committed value on screen while the refreshed prop is in flight', async () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '__other__' } })
    fireEvent.change(screen.getByLabelText('Custom event type'), { target: { value: 'Gala' } })
    fireEvent.keyDown(screen.getByLabelText('Custom event type'), { key: 'Enter' })
    expect(await screen.findByRole('button', { name: 'Gala' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add Event type' })).toBeNull()
  })

  it('drops the held value the moment the refreshed prop arrives', async () => {
    const { rerender } = render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '__other__' } })
    fireEvent.change(screen.getByLabelText('Custom event type'), { target: { value: 'Gala' } })
    fireEvent.keyDown(screen.getByLabelText('Custom event type'), { key: 'Enter' })
    await screen.findByRole('button', { name: 'Gala' })
    rerender(<FactsGrid {...props} lead={{ ...lead, event_type: 'Gala Night' }} />)
    expect(screen.getByRole('button', { name: 'Gala Night' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gala' })).toBeNull()
  })

  it('re-editing the held value does not re-save it unchanged', async () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '__other__' } })
    fireEvent.change(screen.getByLabelText('Custom event type'), { target: { value: 'Gala' } })
    fireEvent.keyDown(screen.getByLabelText('Custom event type'), { key: 'Enter' })
    const held = await screen.findByRole('button', { name: 'Gala' })
    fireEvent.click(held)
    fireEvent.blur(screen.getByLabelText('Custom event type'))
    expect(updateLead).toHaveBeenCalledTimes(1)
  })

  it('passes the active profiles through to the "Edit all details" escape hatch', () => {
    render(<FactsGrid {...props} lead={{ ...lead, event_type: 'Wedding', event_type_id: 'et-wedding' }} />)
    fireEvent.click(screen.getByRole('button', { name: /edit all details/i }))
    // OpportunityDetailsForm's own Event type control — a select, not the
    // bare text input it used to render.
    const select = screen.getByLabelText('Event type') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('Wedding')
  })
})

describe('FactsGrid — Event type with zero configured profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateLead.mockResolvedValue(undefined)
  })

  it('falls back to a plain free-text input, matching pre-inc1 behavior', async () => {
    render(<FactsGrid {...props} eventTypeProfiles={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    const input = screen.getByLabelText('Event type')
    expect(input.tagName).toBe('INPUT')
    fireEvent.change(input, { target: { value: 'Gala' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(updateLead).toHaveBeenCalledWith('o1', 'l1', { event_type: 'Gala', event_type_id: null })
    )
  })
})
