import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ClientsTable } from '@/components/admin/ClientsTable'
import { rollupCustomer } from '@/lib/crm/customer-rollup'
import type { CustomerRollup } from '@/lib/crm/customer-rollup'
import type { Customer } from '@/lib/types'

const row: { customer: Customer; rollup: CustomerRollup } = {
  customer: {
    id: 'c1',
    name: 'Dana Kim',
    company: 'Riverside',
    email: 'dana@riv.co',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  rollup: {
    openCount: 1,
    wonCount: 2,
    lostCount: 0,
    totalWonValue: 1500,
    openValue: 250,
    lastContactAt: '2026-03-05T00:00:00.000Z',
  },
}

const newCustomerRow: { customer: Customer; rollup: CustomerRollup } = {
  customer: {
    id: 'c2',
    name: 'No Jobs Yet',
    company: 'Fresh Co',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  rollup: rollupCustomer({}, []),
}

describe('ClientsTable', () => {
  it('links each customer to their detail page', () => {
    render(<ClientsTable orgSlug="acme" rows={[row]} />)
    expect(screen.getByRole('link', { name: 'Dana Kim' })).toHaveAttribute('href', '/acme/clients/c1')
  })

  it('shows repeat-business figures', () => {
    render(<ClientsTable orgSlug="acme" rows={[row]} />)
    expect(screen.getByText('$1,500')).toBeInTheDocument()
    expect(screen.getByText(/2 won/i)).toBeInTheDocument()
  })

  it('renders an empty state with no customers', () => {
    render(<ClientsTable orgSlug="acme" rows={[]} />)
    expect(screen.getByText(/no clients yet/i)).toBeInTheDocument()
  })

  it('labels the last-contact column honestly', () => {
    render(<ClientsTable orgSlug="acme" rows={[row]} />)
    expect(screen.getByText('Last contact')).toBeInTheDocument()
    expect(screen.queryByText('Last update')).not.toBeInTheDocument()
  })

  it('renders a customer with zero opportunities and no last contact sensibly', () => {
    render(<ClientsTable orgSlug="acme" rows={[newCustomerRow]} />)
    expect(screen.getByText('$0')).toBeInTheDocument()
    expect(screen.getByText('0 won')).toBeInTheDocument()

    const tableRow = screen.getByRole('row', { name: /No Jobs Yet/i })
    const cells = within(tableRow).getAllByRole('cell')
    const lastContactCell = cells[cells.length - 1]
    expect(lastContactCell).toHaveTextContent('—')
    expect(lastContactCell.textContent).toBe('—')
  })
})
