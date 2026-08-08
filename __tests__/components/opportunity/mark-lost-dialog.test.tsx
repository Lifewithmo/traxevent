import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

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
})
