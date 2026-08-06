import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const updateLead = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({ updateLead: (...a: unknown[]) => updateLead(...a) }))

import { OpportunityDetailsForm } from '@/components/admin/opportunity/OpportunityDetailsForm'
import type { Customer, Lead } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'Ada', stage: 'inquiry', created_at: '', estimated_value: 1000 }

describe('OpportunityDetailsForm', () => {
  beforeEach(() => { refresh.mockClear(); updateLead.mockClear() })

  it('saves edits', async () => {
    render(<OpportunityDetailsForm orgId="o1" orgSlug="acme" lead={lead} customer={null} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada L' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(updateLead).toHaveBeenCalledWith('o1', 'l1', expect.objectContaining({ name: 'Ada L' })))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('requires a name', async () => {
    render(<OpportunityDetailsForm orgId="o1" orgSlug="acme" lead={lead} customer={null} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(updateLead).not.toHaveBeenCalled()
  })
})

describe('OpportunityDetailsForm — title and customer linkage', () => {
  const lead2 = { id: 'l1', name: 'Dana Kim', stage: 'inquiry', created_at: 'x' } as Lead
  const customer = { id: 'c1', name: 'Dana Kim', email: 'dana@riv.co', created_at: 'x' } as Customer

  beforeEach(() => { refresh.mockClear(); updateLead.mockClear() })

  it('edits the opportunity title', () => {
    render(<OpportunityDetailsForm orgId="o1" orgSlug="acme" lead={lead2} customer={customer} />)
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
  })

  it('hides contact fields when a customer is linked', () => {
    render(<OpportunityDetailsForm orgId="o1" orgSlug="acme" lead={lead2} customer={customer} />)
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Organization')).not.toBeInTheDocument()
  })

  it('still offers contact fields for an unlinked legacy lead', () => {
    render(<OpportunityDetailsForm orgId="o1" orgSlug="acme" lead={lead2} customer={null} />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('does not blank out stored contact values when saving with a linked customer', async () => {
    const linkedLead = { id: 'l1', name: 'Dana Kim', organization: 'Riverside', email: 'dana@riv.co', phone: '555-1212', stage: 'inquiry', created_at: 'x' } as Lead
    render(<OpportunityDetailsForm orgId="o1" orgSlug="acme" lead={linkedLead} customer={customer} />)
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(updateLead).toHaveBeenCalledWith(
      'o1',
      'l1',
      expect.objectContaining({ name: 'Dana Kim', organization: 'Riverside', email: 'dana@riv.co', phone: '555-1212' })
    ))
  })
})
