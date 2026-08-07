import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CustomerDetailClient } from '@/components/admin/CustomerDetailClient'
import { updateCustomer } from '@/actions/customers'
import type { CustomerRollup } from '@/lib/crm/customer-rollup'
import type { Customer, Lead, Note } from '@/lib/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
// CustomerDetailClient's notes composer calls createNote from '@/actions/notes',
// a 'use server' module that imports lib/firebase-admin.ts, which throws at
// import time without live Firebase credentials. Mocked here the same way
// ActivityTimeline.test.tsx and OpportunityDetailClient.test.tsx mock it.
vi.mock('@/actions/notes', () => ({ createNote: vi.fn().mockResolvedValue({}) }))
// Same reasoning: updateCustomer is a 'use server' export backed by firebase-admin.
vi.mock('@/actions/customers', () => ({ updateCustomer: vi.fn().mockResolvedValue(undefined) }))

const customer: Customer = {
  id: 'c1', name: 'Dana Kim', company: 'Riverside', email: 'dana@riv.co',
  tags: ['vip'], created_at: '2026-01-01T00:00:00.000Z',
}
const opportunities: Lead[] = [
  { id: 'l1', name: 'Dana Kim', title: 'Spring gala', stage: 'closed_won', estimated_value: 1000, created_at: '2026-02-01T00:00:00.000Z' },
  { id: 'l2', name: 'Dana Kim', stage: 'inquiry', estimated_value: 250, created_at: '2026-01-15T00:00:00.000Z' },
]
const rollup: CustomerRollup = { openCount: 1, wonCount: 1, lostCount: 0, totalWonValue: 1000, openValue: 250 }
const notes: Note[] = []

const props = { orgId: 'o1', orgSlug: 'acme', customer, opportunities, rollup, notes }

describe('CustomerDetailClient', () => {
  it('shows the customer identity and tags', () => {
    render(<CustomerDetailClient {...props} />)
    expect(screen.getByRole('heading', { name: 'Dana Kim' })).toBeInTheDocument()
    expect(screen.getByText('vip')).toBeInTheDocument()
  })

  it('rolls up every opportunity, open and past, each linking to its detail page', () => {
    render(<CustomerDetailClient {...props} />)
    expect(screen.getByRole('link', { name: 'Spring gala' })).toHaveAttribute('href', '/acme/leads/l1')
    expect(screen.getByRole('link', { name: 'Dana Kim' })).toHaveAttribute('href', '/acme/leads/l2')
  })

  it('surfaces lifetime won value', () => {
    render(<CustomerDetailClient {...props} />)
    // Scoped to the roll-up tile: the "Spring gala" opportunity row also
    // shows $1,000 (same underlying value), so an unscoped query would match twice.
    const tile = screen.getByText('Lifetime won').closest('div') as HTMLElement
    expect(within(tile).getByText('$1,000')).toBeInTheDocument()
  })

  it('renders an empty state when the customer has no opportunities', () => {
    render(<CustomerDetailClient {...props} opportunities={[]} />)
    expect(screen.getByText(/no opportunities yet/i)).toBeInTheDocument()
  })

  it('shows a relative last-update time when the roll-up has one', () => {
    render(<CustomerDetailClient {...props} rollup={{ ...rollup, lastActivityAt: '2020-01-01T00:00:00.000Z' }} />)
    const tile = screen.getByText('Last update').closest('div') as HTMLElement
    expect(within(tile).getByText(/ago$/)).toBeInTheDocument()
  })

  it('shows an em dash for last update when the roll-up has none', () => {
    render(<CustomerDetailClient {...props} />)
    const tile = screen.getByText('Last update').closest('div') as HTMLElement
    expect(within(tile).getByText('—')).toBeInTheDocument()
  })

  it('labels the roll-up tile "Last update"', () => {
    render(<CustomerDetailClient {...props} />)
    expect(screen.getByText('Last update')).toBeInTheDocument()
    expect(screen.queryByText('Last contact')).not.toBeInTheDocument()
  })
})

describe('CustomerDetailClient — editing contact details', () => {
  beforeEach(() => { refresh.mockClear(); vi.mocked(updateCustomer).mockClear() })

  it('offers editable name/company/email/phone fields', () => {
    render(<CustomerDetailClient {...props} />)
    expect(screen.getByLabelText('Name')).toHaveValue('Dana Kim')
    expect(screen.getByLabelText('Company')).toHaveValue('Riverside')
    expect(screen.getByLabelText('Email')).toHaveValue('dana@riv.co')
    expect(screen.getByLabelText('Phone')).toHaveValue('')
  })

  it('saves the payload for a normal edit and refreshes', async () => {
    render(<CustomerDetailClient {...props} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dana K. Kim' } })
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Riverside Events' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(updateCustomer).toHaveBeenCalledWith('o1', 'c1', {
        name: 'Dana K. Kim',
        company: 'Riverside Events',
        email: 'dana@riv.co',
        phone: null,
      })
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('sends null, not an empty string, when an optional field is cleared', async () => {
    render(<CustomerDetailClient {...props} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(updateCustomer).toHaveBeenCalledWith('o1', 'c1', expect.objectContaining({ email: null }))
    )
  })

  it('blocks saving a blank name and does not call updateCustomer', async () => {
    render(<CustomerDetailClient {...props} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(updateCustomer).not.toHaveBeenCalled()
  })

  it('confirms a successful contact save', async () => {
    render(<CustomerDetailClient {...props} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dana K' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
  })

  it('clears a stale "Saved." notice when a subsequent save fails', async () => {
    render(<CustomerDetailClient {...props} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dana K' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText('Saved.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
  })
})
