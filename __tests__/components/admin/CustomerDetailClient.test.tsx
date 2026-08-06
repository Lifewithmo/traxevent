import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CustomerDetailClient } from '@/components/admin/CustomerDetailClient'
import type { CustomerRollup } from '@/lib/crm/customer-rollup'
import type { Customer, Lead, Note } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
// CustomerDetailClient's notes composer calls createNote from '@/actions/notes',
// a 'use server' module that imports lib/firebase-admin.ts, which throws at
// import time without live Firebase credentials. Mocked here the same way
// ActivityTimeline.test.tsx and OpportunityDetailClient.test.tsx mock it.
vi.mock('@/actions/notes', () => ({ createNote: vi.fn().mockResolvedValue({}) }))

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
    expect(screen.getByText('$1,000')).toBeInTheDocument()
  })

  it('renders an empty state when the customer has no opportunities', () => {
    render(<CustomerDetailClient {...props} opportunities={[]} />)
    expect(screen.getByText(/no opportunities yet/i)).toBeInTheDocument()
  })
})
