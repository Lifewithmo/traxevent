import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NewOpportunityForm } from '@/components/admin/pipeline/NewOpportunityForm'
import { createLead } from '@/actions/leads'
import type { Customer } from '@/lib/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
// 'use server' module backed by firebase-admin — mocked like CustomerDetailClient.test.tsx does.
vi.mock('@/actions/leads', () => ({ createLead: vi.fn().mockResolvedValue({ id: 'l1' }) }))

const customer: Customer = {
  id: 'c1', name: 'Dana Kim', company: 'Riverside', email: 'dana@riv.co', created_at: '2026-01-01T00:00:00.000Z',
}

describe('NewOpportunityForm linked mode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('hides contact inputs and shows who it is for', () => {
    render(<NewOpportunityForm orgId="o1" open onClose={() => {}} customer={customer} />)
    expect(screen.getByText(/for dana kim/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Organization')).not.toBeInTheDocument()
  })

  it('submits customer_id without contact fields and can save with no name typed', async () => {
    render(<NewOpportunityForm orgId="o1" open onClose={() => {}} customer={customer} />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Fall gala' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(createLead).toHaveBeenCalledWith('o1', expect.objectContaining({
      customer_id: 'c1', title: 'Fall gala',
    })))
    const input = vi.mocked(createLead).mock.calls[0][1]
    expect(input).not.toHaveProperty('name')
    expect(input).not.toHaveProperty('email')
  })

  it('still requires a name in standalone mode', () => {
    render(<NewOpportunityForm orgId="o1" open onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
