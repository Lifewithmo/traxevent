import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ClientsTable } from '@/components/admin/ClientsTable'
import type { Customer, Lead } from '@/lib/types'

const customer = (over: Partial<Customer>): Customer => ({
  id: 'c1', name: 'Dana Kim', created_at: '2026-01-01T00:00:00.000Z', ...over,
})
const lead = (over: Partial<Lead>): Lead => ({
  id: 'l', name: 'Dana Kim', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z', ...over,
})

// Two past wins, nothing open or upcoming — a dormant repeat client.
const dormantLeads: Lead[] = [
  lead({ id: 'w1', stage: 'closed_won', event_date: '2024-05-10', estimated_value: 1000 }),
  lead({ id: 'w2', stage: 'closed_won', event_date: '2024-11-10', estimated_value: 500 }),
]

describe('ClientsTable', () => {
  it('links each client to their detail page, company-first', () => {
    render(
      <ClientsTable
        orgSlug="acme"
        customers={[customer({ company: 'Riverside' })]}
        leadsByCustomerId={{ c1: dormantLeads }}
      />
    )
    expect(screen.getByRole('link', { name: 'Riverside' })).toHaveAttribute('href', '/acme/clients/c1')
  })

  it('puts dormant repeat clients in the urgent group with their lifetime value', () => {
    render(<ClientsTable orgSlug="acme" customers={[customer({})]} leadsByCustomerId={{ c1: dormantLeads }} />)
    expect(screen.getByText('Repeat clients with nothing booked · 1')).toBeInTheDocument()
    expect(screen.getByText('$1,500')).toBeInTheDocument()
  })

  it('counts the header stats: total, lifetime, worth-a-call, repeat', () => {
    render(<ClientsTable orgSlug="acme" customers={[customer({})]} leadsByCustomerId={{ c1: dormantLeads }} />)
    expect(screen.getByText('1 · $1,500 lifetime')).toBeInTheDocument()
    expect(screen.getByText('Worth a call (1)')).toBeInTheDocument()
    expect(screen.getByText('Repeat (1)')).toBeInTheDocument()
  })

  it('renders an empty state with no customers', () => {
    render(<ClientsTable orgSlug="acme" customers={[]} leadsByCustomerId={{}} />)
    expect(screen.getByText(/no clients yet/i)).toBeInTheDocument()
  })

  it('a client with no history shows em dashes, never fake zeros', () => {
    render(<ClientsTable orgSlug="acme" customers={[customer({ name: 'Fresh Co' })]} leadsByCustomerId={{}} />)
    expect(screen.getByText('Never booked · 1')).toBeInTheDocument()
    // Last event, open, won, and lifetime all render as em dashes.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
    expect(screen.queryByText('$0')).not.toBeInTheDocument()
  })
})
