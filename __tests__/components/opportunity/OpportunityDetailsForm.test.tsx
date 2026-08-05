import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const updateLead = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({ updateLead: (...a: unknown[]) => updateLead(...a) }))

import { OpportunityDetailsForm } from '@/components/admin/opportunity/OpportunityDetailsForm'
import type { Lead } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'Ada', stage: 'inquiry', created_at: '', estimated_value: 1000 }

describe('OpportunityDetailsForm', () => {
  beforeEach(() => { refresh.mockClear(); updateLead.mockClear() })

  it('saves edits', async () => {
    render(<OpportunityDetailsForm orgId="o1" lead={lead} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada L' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(updateLead).toHaveBeenCalledWith('o1', 'l1', expect.objectContaining({ name: 'Ada L' })))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('requires a name', async () => {
    render(<OpportunityDetailsForm orgId="o1" lead={lead} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(updateLead).not.toHaveBeenCalled()
  })
})
