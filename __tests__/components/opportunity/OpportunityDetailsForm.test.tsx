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

  it('routes the customer escape hatch through the link token, not inherited muted prose', () => {
    render(<OpportunityDetailsForm orgId="o1" orgSlug="acme" lead={lead2} customer={customer} />)
    const link = screen.getByRole('link', { name: /edit dana kim/i })
    expect(link).toHaveAttribute('href', '/acme/clients/c1')
    expect(link.className).toContain('text-primary')
  })
})

describe('OpportunityDetailsForm — kit skin', () => {
  beforeEach(() => { refresh.mockClear(); updateLead.mockClear() })

  it('sets numeric fields in tabular figures so digits line up', () => {
    render(<OpportunityDetailsForm orgId="o1" orgSlug="acme" lead={lead} customer={null} />)
    for (const label of ['Estimated value', 'Guest count']) {
      expect(screen.getByLabelText(label).className).toContain('tabular-nums')
    }
  })

  it('renders every control through the kit rather than a bespoke equivalent', () => {
    render(<OpportunityDetailsForm orgId="o1" orgSlug="acme" lead={lead} customer={null} />)
    expect(screen.getByRole('button', { name: /^save$/i })).toHaveAttribute('data-slot', 'button')
    // The kit ships no Textarea, so this one is hand-rolled by necessity — but it
    // has to wear the kit Input's skin (border-input, rounded-lg, ring-3) or the
    // notes field reads as a control from a different product.
    const notes = screen.getByLabelText('Notes')
    expect(notes.tagName).toBe('TEXTAREA')
    for (const cls of ['border-input', 'rounded-lg', 'focus-visible:ring-3', 'focus-visible:border-ring']) {
      expect(notes.className).toContain(cls)
    }
    expect(notes.className).not.toContain('shadow-sm')
  })

  it('collapses both field grids to one column below sm', () => {
    const { container } = render(<OpportunityDetailsForm orgId="o1" orgSlug="acme" lead={lead} customer={null} />)
    const all = Array.from(container.querySelectorAll('div.grid'))
    const fieldGrids = all.filter((g) => g.className.includes('sm:grid-cols-2'))
    expect(fieldGrids).toHaveLength(2)
    // A breakpointed column count with no BASE one leaves an implicit `auto`
    // track that grows to min-content and scrolls the page sideways at 375px —
    // the trap P5 hit on the detail spine. Holds for every grid in the form.
    for (const grid of all) {
      if (/(sm|md|lg|xl):grid-cols-/.test(grid.className)) {
        expect(grid.className).toMatch(/(^|\s)grid-cols-\d/)
      }
    }
  })
})
