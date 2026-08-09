import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContactCard } from '@/components/admin/opportunity/ContactCard'
import type { Customer, Lead } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'Fallback Person', stage: 'inquiry', created_at: '', organization: 'Fallback Co', email: 'f@x.com' }

describe('ContactCard', () => {
  it('renders the customer when present', () => {
    const customer: Customer = { id: 'c1', name: 'Ada Lovelace', company: 'Analytical Co', email: 'ada@x.com', phone: '5551234', created_at: '' }
    render(<ContactCard orgSlug="acme" customer={customer} lead={lead} />)
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Analytical Co')).toBeInTheDocument()
    expect(screen.getByText('AL')).toBeInTheDocument() // initials avatar
    expect(screen.getByRole('link', { name: /email/i })).toHaveAttribute('href', 'mailto:ada@x.com')
  })

  it('falls back to lead contact when no customer', () => {
    render(<ContactCard orgSlug="acme" customer={null} lead={lead} />)
    expect(screen.getByText('Fallback Person')).toBeInTheDocument()
    expect(screen.getByText('Fallback Co')).toBeInTheDocument()
  })

  it('expands to reveal details', () => {
    const customer: Customer = { id: 'c1', name: 'Ada', email: 'ada@x.com', phone: '5551234', created_at: '' }
    render(<ContactCard orgSlug="acme" customer={customer} lead={lead} />)
    expect(screen.queryByText('5551234')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /expand/i }))
    expect(screen.getByText('5551234')).toBeInTheDocument()
  })

  it('links to the customer record when one is linked', () => {
    const customer: Customer = { id: 'c1', name: 'Ada', email: 'ada@x.com', phone: '5551234', created_at: '' }
    render(<ContactCard orgSlug="acme" customer={customer} lead={lead} />)
    expect(screen.getByRole('link', { name: /view customer/i })).toHaveAttribute('href', '/acme/clients/c1')
  })

  it('does not link to a customer record when none is linked', () => {
    render(<ContactCard orgSlug="acme" customer={null} lead={lead} />)
    expect(screen.queryByRole('link', { name: /view customer/i })).not.toBeInTheDocument()
  })

  it('renders the portal action in the strip action row', () => {
    render(
      <ContactCard orgSlug="acme" customer={null} lead={lead} variant="strip" portalAction={<button>Portal link</button>} />
    )
    expect(screen.getByRole('button', { name: 'Portal link' })).toBeInTheDocument()
  })
})
