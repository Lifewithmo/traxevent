import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CustomerPicker } from '@/components/admin/pipeline/CustomerPicker'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { Customer } from '@/lib/types'

const customers: Customer[] = [
  { id: 'c1', name: 'Dana Kim', company: 'Riverside', email: 'dana@riv.co', created_at: 'x' },
  { id: 'c2', name: 'Sam Ortiz', created_at: 'x' },
]

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText(/link to existing customer/i), { target: { value } })

describe('CustomerPicker', () => {
  it('filters by name, company, or email as you type', () => {
    render(<CustomerPicker customers={customers} value={null} onChange={() => {}} />)
    type('riv')
    expect(screen.getByRole('button', { name: /dana kim/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sam ortiz/i })).not.toBeInTheDocument()
  })

  it('reports the picked customer and clears', () => {
    const onChange = vi.fn()
    const { rerender } = render(<CustomerPicker customers={customers} value={null} onChange={onChange} />)
    type('sam')
    fireEvent.click(screen.getByRole('button', { name: /sam ortiz/i }))
    expect(onChange).toHaveBeenCalledWith(customers[1])
    rerender(<CustomerPicker customers={customers} value={customers[1]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('announces itself as a collapsed combobox until there are matches', () => {
    render(<CustomerPicker customers={customers} value={null} onChange={() => {}} />)
    const input = screen.getByRole('combobox', { name: /link to existing customer/i })
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    type('a')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('moves the active option with the arrow keys and picks it with Enter', () => {
    const onChange = vi.fn()
    render(<CustomerPicker customers={customers} value={null} onChange={onChange} />)
    const input = screen.getByRole('combobox', { name: /link to existing customer/i })
    type('a')

    expect(input).not.toHaveAttribute('aria-activedescendant')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    let options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    options = screen.getAllByRole('option')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(options[0]).toHaveAttribute('aria-selected', 'false')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(customers[0])
  })

  it('dismisses the list on Escape and on a click outside, and reopens on the next keystroke', () => {
    render(
      <div>
        <CustomerPicker customers={customers} value={null} onChange={() => {}} />
        <button type="button">Somewhere else</button>
      </div>
    )
    const input = screen.getByRole('combobox', { name: /link to existing customer/i })

    type('a')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    type('an')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Somewhere else' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  // The real mount is inside a kit Dialog (NewOpportunityForm at both Pipeline
  // call sites). Base UI's dismiss hook listens for Escape on `document` and
  // never checks `defaultPrevented`, so preventDefault alone let one Escape
  // close the suggestion list AND tear down the dialog, discarding the
  // half-filled form. The bare-picker test above can never see that.
  it('dismisses only the list — not the enclosing dialog — on Escape', () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>New opportunity</DialogTitle>
          <CustomerPicker customers={customers} value={null} onChange={() => {}} />
        </DialogContent>
      </Dialog>
    )
    const input = screen.getByRole('combobox', { name: /link to existing customer/i })

    type('a')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByText('New opportunity')).toBeInTheDocument()
  })
})
