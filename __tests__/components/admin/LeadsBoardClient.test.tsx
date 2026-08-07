import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const createLead = vi.fn().mockResolvedValue({})
const setLeadStage = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({
  createLead: (...a: unknown[]) => createLead(...a),
  setLeadStage: (...a: unknown[]) => setLeadStage(...a),
}))

import { LeadsBoardClient } from '@/components/admin/LeadsBoardClient'
import type { Lead } from '@/lib/types'

const titledLead: Lead = {
  id: 'l1',
  name: 'Dana Kim',
  title: 'Riverside gala',
  stage: 'inquiry',
  created_at: 'x',
}

const untitledLead: Lead = {
  id: 'l2',
  name: 'Sam Rivera',
  stage: 'inquiry',
  created_at: 'x',
}

describe('LeadsBoardClient', () => {
  beforeEach(() => { createLead.mockClear(); setLeadStage.mockClear() })

  it('renders the card with the opportunity title, not the contact name', () => {
    render(<LeadsBoardClient orgId="o1" orgSlug="acme" leads={[titledLead]} />)
    expect(screen.getByText('Riverside gala')).toBeInTheDocument()
    expect(screen.queryByText('Dana Kim')).not.toBeInTheDocument()
  })

  it('uses the opportunity title in the stage select accessible name', () => {
    render(<LeadsBoardClient orgId="o1" orgSlug="acme" leads={[titledLead]} />)
    expect(screen.getByRole('combobox', { name: 'Stage for Riverside gala' })).toBeInTheDocument()
  })

  it('falls back to the contact name when the lead has no title', () => {
    render(<LeadsBoardClient orgId="o1" orgSlug="acme" leads={[untitledLead]} />)
    expect(screen.getByText('Sam Rivera')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Stage for Sam Rivera' })).toBeInTheDocument()
  })
})
