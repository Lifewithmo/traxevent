import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CustomerDetailClient } from '@/components/admin/CustomerDetailClient'
import { updateCustomer } from '@/actions/customers'
import type { Customer, Lead, Note } from '@/lib/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))
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
  { id: 'l1', name: 'Dana Kim', title: 'Spring gala', stage: 'closed_won', estimated_value: 1000, event_date: '2025-04-01', created_at: '2026-02-01T00:00:00.000Z' },
  { id: 'l2', name: 'Dana Kim', stage: 'inquiry', estimated_value: 250, created_at: '2026-01-15T00:00:00.000Z' },
]
const notes: Note[] = []

const props = { orgId: 'o1', orgSlug: 'acme', customer, opportunities, notes }

describe('CustomerDetailClient', () => {
  it('headlines the company and shows the contact as one line', () => {
    render(<CustomerDetailClient {...props} />)
    expect(screen.getByRole('heading', { name: 'Riverside' })).toBeInTheDocument()
    expect(screen.getByText(/Dana Kim · dana@riv\.co/)).toBeInTheDocument()
  })

  it('tells the client story from the opportunities', () => {
    render(<CustomerDetailClient {...props} />)
    expect(screen.getByText(/1 event since Apr 2025, \$1,000 paid/)).toBeInTheDocument()
  })

  it('timelines every opportunity, each linking to its detail page', () => {
    render(<CustomerDetailClient {...props} />)
    expect(screen.getByRole('link', { name: 'Spring gala' })).toHaveAttribute('href', '/acme/leads/l1')
    expect(screen.getByRole('link', { name: 'Dana Kim' })).toHaveAttribute('href', '/acme/leads/l2')
  })

  it('renders an empty timeline state when the customer has no opportunities', () => {
    render(<CustomerDetailClient {...props} opportunities={[]} />)
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
  })

  it('collapses long timelines behind a show-more control', () => {
    const many: Lead[] = Array.from({ length: 6 }, (_, i) => ({
      id: `w${i}`, name: 'Dana Kim', title: `Event ${i}`, stage: 'closed_won' as const,
      event_date: `2025-0${i + 1}-10`, created_at: '2026-01-01T00:00:00.000Z',
    }))
    render(<CustomerDetailClient {...props} opportunities={many} />)
    expect(screen.queryByRole('link', { name: 'Event 1' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }))
    expect(screen.getByRole('link', { name: 'Event 1' })).toBeInTheDocument()
  })
})

describe('CustomerDetailClient — editing contact details', () => {
  beforeEach(() => { refresh.mockClear(); vi.mocked(updateCustomer).mockClear() })

  const startEditing = () => fireEvent.click(screen.getByRole('button', { name: 'edit' }))

  it('rests as a single line and expands to name/company/email/phone fields', () => {
    render(<CustomerDetailClient {...props} />)
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    startEditing()
    expect(screen.getByLabelText('Name')).toHaveValue('Dana Kim')
    expect(screen.getByLabelText('Company')).toHaveValue('Riverside')
    expect(screen.getByLabelText('Email')).toHaveValue('dana@riv.co')
    expect(screen.getByLabelText('Phone')).toHaveValue('')
  })

  it('saves the payload for a normal edit and refreshes', async () => {
    render(<CustomerDetailClient {...props} />)
    startEditing()
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
    startEditing()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(updateCustomer).toHaveBeenCalledWith('o1', 'c1', expect.objectContaining({ email: null }))
    )
  })

  it('blocks saving a blank name and does not call updateCustomer', async () => {
    render(<CustomerDetailClient {...props} />)
    startEditing()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(updateCustomer).not.toHaveBeenCalled()
  })

  it('collapses back to the resting line after a successful save', async () => {
    render(<CustomerDetailClient {...props} />)
    startEditing()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dana K' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument())
  })
})
