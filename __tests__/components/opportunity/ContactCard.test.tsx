import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContactCard } from '@/components/admin/opportunity/ContactCard'
import type { Customer, Lead } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'Fallback Person', stage: 'inquiry', created_at: '', organization: 'Fallback Co', email: 'f@x.com' }

// ContactCard renders exactly one layout now. The old non-strip default variant
// was dead in production (OpportunityDetailClient has always passed
// variant="strip") but carried five of this file's six tests, so the tests move
// onto the surviving branch rather than the branch being deleted out from under
// them.
describe('ContactCard', () => {
  it('renders the customer when present', () => {
    const customer: Customer = { id: 'c1', name: 'Ada Lovelace', company: 'Analytical Co', email: 'ada@x.com', phone: '5551234', created_at: '' }
    render(<ContactCard orgSlug="acme" customer={customer} lead={lead} variant="strip" />)
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Analytical Co')).toBeInTheDocument()
    expect(screen.getByText('AL')).toBeInTheDocument() // kit Avatar monogram
    expect(screen.getByRole('link', { name: /email/i })).toHaveAttribute('href', 'mailto:ada@x.com')
  })

  it('falls back to lead contact when no customer', () => {
    render(<ContactCard orgSlug="acme" customer={null} lead={lead} variant="strip" />)
    expect(screen.getByText('Fallback Person')).toBeInTheDocument()
    expect(screen.getByText('Fallback Co')).toBeInTheDocument()
  })

  it('expands to reveal details', () => {
    const customer: Customer = { id: 'c1', name: 'Ada', email: 'ada@x.com', phone: '5551234', created_at: '' }
    render(<ContactCard orgSlug="acme" customer={customer} lead={lead} variant="strip" />)
    expect(screen.queryByText('5551234')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /expand/i }))
    expect(screen.getByText('5551234')).toBeInTheDocument()
  })

  it('links to the customer record when one is linked', () => {
    const customer: Customer = { id: 'c1', name: 'Ada', email: 'ada@x.com', phone: '5551234', created_at: '' }
    render(<ContactCard orgSlug="acme" customer={customer} lead={lead} variant="strip" />)
    expect(screen.getByRole('link', { name: /view customer/i })).toHaveAttribute('href', '/acme/clients/c1')
  })

  it('does not link to a customer record when none is linked', () => {
    render(<ContactCard orgSlug="acme" customer={null} lead={lead} variant="strip" />)
    expect(screen.queryByRole('link', { name: /view customer/i })).not.toBeInTheDocument()
  })

  it('renders the portal action in the strip action row', () => {
    render(
      <ContactCard orgSlug="acme" customer={null} lead={lead} variant="strip" portalAction={<button>Portal link</button>} />
    )
    expect(screen.getByRole('button', { name: 'Portal link' })).toBeInTheDocument()
  })

  // The returning-client count is a figure on OpportunityKpiBand now. It used to
  // be concatenated into a `truncate`d subtitle line where it could be clipped
  // out of existence; the prop stays on the signature (callers still pass it)
  // but the prose must not come back.
  it('does not render the past-bookings prose (the figure lives on the KPI band)', () => {
    const customer: Customer = { id: 'c1', name: 'Ada Lovelace', company: 'Analytical Co', email: 'ada@x.com', created_at: '' }
    render(<ContactCard orgSlug="acme" customer={customer} lead={lead} variant="strip" pastBookings={3} />)
    expect(screen.queryByText(/returning client/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/past event/i)).not.toBeInTheDocument()
    expect(screen.getByText('Analytical Co')).toBeInTheDocument()
  })

  it('paints tags as neutral status pills, not gray badges', () => {
    const customer: Customer = { id: 'c1', name: 'Ada', email: 'a@x.com', tags: ['VIP'], created_at: '' }
    render(<ContactCard orgSlug="acme" customer={customer} lead={lead} variant="strip" />)
    fireEvent.click(screen.getByRole('button', { name: /expand/i }))
    expect(screen.getByText('VIP')).toHaveClass('bg-[var(--status-neutral-bg)]')
  })
})
