import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const updateLead = vi.hoisted(() => vi.fn())
const refresh = vi.hoisted(() => vi.fn())
vi.mock('@/actions/leads', () => ({ updateLead }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

import { FactsGrid } from '@/components/admin/opportunity/FactsGrid'
import type { Lead } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'Dana Kim', stage: 'proposal', created_at: '' }
const props = { orgId: 'o1', orgSlug: 'acme', lead, customer: null }

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

  it('reverts on Escape without calling the action', () => {
    render(<FactsGrid {...props} lead={{ ...lead, event_type: 'Wedding' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wedding' }))
    const input = screen.getByLabelText('Event type')
    fireEvent.change(input, { target: { value: 'Gala' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByLabelText('Event type')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wedding' })).toBeInTheDocument()
    expect(updateLead).not.toHaveBeenCalled()
  })

  it('commits on Enter through the existing updateLead action', async () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    const input = screen.getByLabelText('Event type')
    fireEvent.change(input, { target: { value: 'Gala' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(updateLead).toHaveBeenCalledWith('o1', 'l1', { event_type: 'Gala' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('commits a guest count as a number, not a string', async () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Guest count' }))
    const input = screen.getByLabelText('Guest count')
    fireEvent.change(input, { target: { value: '120' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(updateLead).toHaveBeenCalledWith('o1', 'l1', { guest_count: 120 }))
  })

  it('clearing a set fact sends null so the field is deleted', async () => {
    render(<FactsGrid {...props} lead={{ ...lead, event_type: 'Wedding' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wedding' }))
    const input = screen.getByLabelText('Event type')
    fireEvent.change(input, { target: { value: '  ' } })
    fireEvent.blur(input)
    await waitFor(() => expect(updateLead).toHaveBeenCalledWith('o1', 'l1', { event_type: null }))
  })

  it('surfaces a failed save instead of silently dropping the edit', async () => {
    updateLead.mockRejectedValue(new Error('Permission denied'))
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'Gala' } })
    fireEvent.keyDown(screen.getByLabelText('Event type'), { key: 'Enter' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
  })

  // A real browser fires blur when the committing input becomes unfocusable —
  // React flushes `busy` at the end of the discrete keydown, the input goes
  // inert, and the unfocusing steps run on the active element. jsdom implements
  // none of that, so the blur is driven explicitly here. Without the guard in
  // commit(), that second call sees an unchanged `value` prop and writes again.
  it('commits once on Enter even when the save-time blur follows', async () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    const input = screen.getByLabelText('Event type')
    fireEvent.change(input, { target: { value: 'Gala' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    expect(updateLead).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(updateLead).toHaveBeenCalledTimes(1)
  })

  it('never disables the input mid-save, so focus is not ripped away', () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    const input = screen.getByLabelText('Event type') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Gala' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.disabled).toBe(false)
  })

  // router.refresh() returns before the RSC payload lands, so `lead` is still
  // the stale prop for a whole round trip after a successful save.
  it('holds the committed value on screen while the refreshed prop is in flight', async () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    const input = screen.getByLabelText('Event type')
    fireEvent.change(input, { target: { value: 'Gala' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByRole('button', { name: 'Gala' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add Event type' })).toBeNull()
  })

  it('drops the held value the moment the refreshed prop arrives', async () => {
    const { rerender } = render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'Gala' } })
    fireEvent.keyDown(screen.getByLabelText('Event type'), { key: 'Enter' })
    await screen.findByRole('button', { name: 'Gala' })
    rerender(<FactsGrid {...props} lead={{ ...lead, event_type: 'Gala Night' }} />)
    expect(screen.getByRole('button', { name: 'Gala Night' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gala' })).toBeNull()
  })

  it('re-editing the held value does not re-save it unchanged', async () => {
    render(<FactsGrid {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Event type' }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'Gala' } })
    fireEvent.keyDown(screen.getByLabelText('Event type'), { key: 'Enter' })
    const held = await screen.findByRole('button', { name: 'Gala' })
    fireEvent.click(held)
    fireEvent.blur(screen.getByLabelText('Event type'))
    expect(updateLead).toHaveBeenCalledTimes(1)
  })

  it('keeps the full details form as an escape hatch rather than the default view', () => {
    render(<FactsGrid {...props} />)
    expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /edit all details/i }))
    expect(screen.getByLabelText('Notes')).toBeInTheDocument()
  })
})
