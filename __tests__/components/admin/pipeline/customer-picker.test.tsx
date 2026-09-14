import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  // A screen-reader user hears the highlighted row via aria-activedescendant
  // but nothing about how many rows there are; the sr-only live region fills
  // that gap. The visible "No matching clients" line exists because an empty
  // dropdown that silently never opens reads as a broken search.
  describe('result feedback', () => {
    it('announces the match count through a polite live region', () => {
      render(<CustomerPicker customers={customers} value={null} onChange={() => {}} />)
      type('a')
      expect(screen.getByText('2 clients match')).toBeInTheDocument()
      type('riv')
      expect(screen.getByText('1 client matches')).toBeInTheDocument()
    })

    it('shows a No-matching-clients state once the query is two characters', () => {
      render(<CustomerPicker customers={customers} value={null} onChange={() => {}} />)
      type('z')
      // One character finds half the book — the "nothing" claim waits for two.
      expect(screen.queryByText('No matching clients')).not.toBeInTheDocument()
      type('zz')
      expect(screen.getAllByText('No matching clients').length).toBeGreaterThan(0)
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('dismisses the no-matches note on Escape without closing an enclosing dialog', () => {
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
      type('zz')
      // Visible note + the sr-only live region both carry the text…
      expect(screen.getAllByText('No matching clients')).toHaveLength(2)
      fireEvent.keyDown(input, { key: 'Escape' })
      // …Escape removes the visible note (live region text just goes stale)
      // and must NOT fall through to tear down the dialog.
      expect(screen.getAllByText('No matching clients')).toHaveLength(1)
      expect(onOpenChange).not.toHaveBeenCalled()
    })
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

  it('wraps the highlight: ArrowUp from none lands on the last option, ArrowDown from the last on the first', () => {
    render(<CustomerPicker customers={customers} value={null} onChange={() => {}} />)
    const input = screen.getByRole('combobox', { name: /link to existing customer/i })
    type('a')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    let options = screen.getAllByRole('option')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(options[1]).toHaveAttribute('aria-selected', 'false')

    // From a dismissed (closed) list, ArrowUp reopens straight onto the last row.
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
  })

  // MID-SEARCH ENTER (the lead-creating fall-through): `active` resets to -1 on
  // every keystroke, so Enter with the list open but nothing highlighted used
  // to reach the browser's implicit form submission and CREATE a lead. While
  // the popup or the no-matches note is showing, Enter belongs to the combobox.
  describe('Enter while searching', () => {
    function renderInForm() {
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
      const onChange = vi.fn()
      render(
        <form onSubmit={onSubmit}>
          <CustomerPicker customers={customers} value={null} onChange={onChange} />
          <button type="submit">Create opportunity</button>
        </form>
      )
      return {
        onSubmit,
        onChange,
        input: screen.getByRole('combobox', { name: /link to existing customer/i }),
      }
    }

    it('does not submit the form when the list is open with nothing highlighted', async () => {
      const user = userEvent.setup()
      const { onSubmit, onChange, input } = renderInForm()
      await user.type(input, 'a') // list open; active is -1 after the keystroke
      await user.keyboard('{Enter}')
      expect(onSubmit).not.toHaveBeenCalled()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('picks the highlighted row on Enter without submitting the form', async () => {
      const user = userEvent.setup()
      const { onSubmit, onChange, input } = renderInForm()
      await user.type(input, 'a')
      await user.keyboard('{ArrowDown}{Enter}')
      expect(onChange).toHaveBeenCalledWith(customers[0])
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('does not submit the form from the no-matches state either', async () => {
      const user = userEvent.setup()
      const { onSubmit, input } = renderInForm()
      await user.type(input, 'zz')
      expect(screen.getAllByText('No matching clients').length).toBeGreaterThan(0)
      await user.keyboard('{Enter}')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('leaves Enter to implicit submission when the picker is quiet', async () => {
      const user = userEvent.setup()
      const { onSubmit, input } = renderInForm()
      await user.click(input)
      await user.keyboard('{Enter}')
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
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
