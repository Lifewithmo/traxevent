import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TotalsCanvas } from '@/components/admin/proposal-builder/TotalsCanvas'
import type { ProposalDraftUpdate } from '@/lib/proposals/draft'

let update: ReturnType<typeof vi.fn<(patch: Partial<ProposalDraftUpdate>) => void>>

const draft: ProposalDraftUpdate = {
  tax_rate: 8.5,
  discount: { type: 'percent', value: 10 },
  deposit: { type: 'percent', value: 50 },
  deposit_gate: 'after_accept',
}

beforeEach(() => {
  update = vi.fn<(patch: Partial<ProposalDraftUpdate>) => void>()
})

function mount(over: Partial<{ draft: ProposalDraftUpdate; disabled: boolean }> = {}) {
  return render(
    <TotalsCanvas
      draft={over.draft ?? draft}
      update={update}
      range={{ min: 100, max: 100 }}
      disabled={over.disabled ?? false}
    />,
  )
}

describe('TotalsCanvas', () => {
  it('renders Total, Discount, Tax, Deposit due rows and an expiry ghost', () => {
    mount()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('$100.00')).toBeInTheDocument()
    expect(screen.getByText('Discount')).toBeInTheDocument()
    expect(screen.getByText('Tax')).toBeInTheDocument()
    expect(screen.getByText('Deposit due')).toBeInTheDocument()
    expect(screen.getByText('+ Add expiry')).toBeInTheDocument()
  })

  it('discount popover: None clears, value change patches with existing type', () => {
    mount()
    fireEvent.click(screen.getByText('Discount'))
    const typeSelect = screen.getByLabelText('Discount') as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'none' } })
    expect(update).toHaveBeenCalledWith({ discount: undefined })

    const valueInput = screen.getByLabelText('Value')
    fireEvent.change(valueInput, { target: { value: '15' } })
    expect(update).toHaveBeenCalledWith({ discount: { type: 'percent', value: 15 } })
  })

  it('deposit popover: shows gate radios + terms textarea; None clears gate/terms too', () => {
    mount()
    fireEvent.click(screen.getByText('Deposit due'))
    expect(screen.getByLabelText('Request deposit after acceptance')).toBeInTheDocument()
    expect(screen.getByLabelText('Require deposit before accepting')).toBeInTheDocument()
    expect(screen.getByLabelText('Cancellation / refund policy')).toBeInTheDocument()

    const typeSelect = screen.getByLabelText('Deposit') as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'none' } })
    expect(update).toHaveBeenCalledWith({ deposit: undefined, deposit_gate: undefined, deposit_terms: undefined })
  })

  it('expiry ghost reveals a date input; setting a date patches expires_at', () => {
    mount()
    fireEvent.click(screen.getByText('+ Add expiry'))
    const dateInput = screen.getByLabelText('Expiry')
    fireEvent.change(dateInput, { target: { value: '2026-09-01' } })
    expect(update).toHaveBeenCalledWith({ expires_at: '2026-09-01' })
  })

  it('clearing the expiry date patches expires_at as undefined', () => {
    mount({ draft: { ...draft, expires_at: '2026-09-01' } })
    const dateInput = screen.getByLabelText('Expiry')
    fireEvent.change(dateInput, { target: { value: '' } })
    expect(update).toHaveBeenCalledWith({ expires_at: undefined })
  })

  it('notes textarea patches notes', () => {
    mount()
    const notes = screen.getByLabelText('Notes for the client')
    fireEvent.change(notes, { target: { value: 'x' } })
    expect(update).toHaveBeenCalledWith({ notes: 'x' })
  })

  it('clearing notes patches undefined', () => {
    mount({ draft: { ...draft, notes: 'existing' } })
    const notes = screen.getByLabelText('Notes for the client')
    fireEvent.change(notes, { target: { value: '' } })
    expect(update).toHaveBeenCalledWith({ notes: undefined })
  })

  it('disabled renders every row as plain text — no buttons, no ghosts', () => {
    mount({ disabled: true })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('Discount')).toBeInTheDocument()
    expect(screen.getByText('Tax')).toBeInTheDocument()
    expect(screen.getByText('Deposit due')).toBeInTheDocument()
  })
})
