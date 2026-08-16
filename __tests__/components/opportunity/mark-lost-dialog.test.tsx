import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const markLeadLost = vi.hoisted(() => vi.fn())
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/actions/leads', () => ({ markLeadLost }))

import { MarkLostDialog } from '@/components/admin/opportunity/MarkLostDialog'

describe('MarkLostDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    markLeadLost.mockResolvedValue(undefined)
  })

  // The trigger and the confirm button share the accessible name "Mark lost";
  // this runs BEFORE the dialog exists, so the query is unambiguous. Every
  // assertion afterwards is scoped with within(dialog).
  function openDialog() {
    fireEvent.click(screen.getByRole('button', { name: 'Mark lost' }))
    return screen.getByRole('dialog', { name: 'Mark lost' })
  }

  it('offers the four reasons and an optional note', () => {
    render(<MarkLostDialog orgId="o1" leadId="l1" onDone={() => {}} />)
    const dialog = openDialog()
    for (const label of ['Over budget', 'Went elsewhere', 'Date fell through', 'No response']) {
      expect(within(dialog).getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(within(dialog).getByPlaceholderText(/note/i)).toBeInTheDocument()
  })

  it('requires a reason before confirming', () => {
    render(<MarkLostDialog orgId="o1" leadId="l1" onDone={() => {}} />)
    const dialog = openDialog()
    expect(within(dialog).getByRole('button', { name: 'Mark lost' })).toBeDisabled()
  })

  it('marks lost with the chosen reason, omitting an empty note', async () => {
    const onDone = vi.fn()
    render(<MarkLostDialog orgId="o1" leadId="l1" onDone={onDone} />)
    const dialog = openDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Over budget' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark lost' }))
    await waitFor(() => expect(markLeadLost).toHaveBeenCalledWith('o1', 'l1', { reason: 'over_budget' }))
    expect(onDone).toHaveBeenCalled()
  })

  it('passes a trimmed note through', async () => {
    render(<MarkLostDialog orgId="o1" leadId="l1" onDone={() => {}} />)
    const dialog = openDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'No response' }))
    fireEvent.change(within(dialog).getByPlaceholderText(/note/i), { target: { value: ' went quiet ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark lost' }))
    await waitFor(() => expect(markLeadLost).toHaveBeenCalledWith('o1', 'l1', { reason: 'no_response', note: 'went quiet' }))
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<MarkLostDialog orgId="o1" leadId="l1" onDone={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'Mark lost' })
    // userEvent (unlike fireEvent) focuses the element on click, matching real
    // browser behavior — needed for focus restoration to have a target.
    await userEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Mark lost' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Mark lost' })).not.toBeInTheDocument()
    // Focus restoration lands after the popup unmounts, not in the same tick.
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('closes on a press outside the panel', () => {
    render(<MarkLostDialog orgId="o1" leadId="l1" onDone={() => {}} />)
    openDialog()
    expect(screen.getByRole('dialog', { name: 'Mark lost' })).toBeInTheDocument()
    // The modal backdrop covers everything outside the panel, so "outside" is
    // a press on it — a bare pointerdown on <body> never reaches the dialog.
    fireEvent.click(document.querySelector('[data-slot="dialog-overlay"]')!)
    expect(screen.queryByRole('dialog', { name: 'Mark lost' })).not.toBeInTheDocument()
  })

  it('can be driven as a controlled dialog with no trigger of its own', () => {
    const onOpenChange = vi.fn()
    render(<MarkLostDialog orgId="o1" leadId="l1" onDone={() => {}} open onOpenChange={onOpenChange} />)
    const dialog = screen.getByRole('dialog', { name: 'Mark lost' })
    expect(within(dialog).getByRole('button', { name: 'Over budget' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
