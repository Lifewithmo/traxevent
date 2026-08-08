import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CustomerPicker } from '@/components/admin/pipeline/CustomerPicker'
import type { Customer } from '@/lib/types'

const customers: Customer[] = [
  { id: 'c1', name: 'Dana Kim', company: 'Riverside', email: 'dana@riv.co', created_at: 'x' },
  { id: 'c2', name: 'Sam Ortiz', created_at: 'x' },
]

describe('CustomerPicker', () => {
  it('filters by name, company, or email as you type', () => {
    render(<CustomerPicker customers={customers} value={null} onChange={() => {}} />)
    fireEvent.change(screen.getByLabelText(/link to existing customer/i), { target: { value: 'riv' } })
    expect(screen.getByRole('button', { name: /dana kim/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sam ortiz/i })).not.toBeInTheDocument()
  })

  it('reports the picked customer and clears', () => {
    const onChange = vi.fn()
    const { rerender } = render(<CustomerPicker customers={customers} value={null} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/link to existing customer/i), { target: { value: 'sam' } })
    fireEvent.click(screen.getByRole('button', { name: /sam ortiz/i }))
    expect(onChange).toHaveBeenCalledWith(customers[1])
    rerender(<CustomerPicker customers={customers} value={customers[1]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
