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
    render(<NewOpportunityForm orgId="o1" orgSlug="brew" open onClose={() => {}} customer={customer} />)
    expect(screen.getByText(/for dana kim/i)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument()
    // The More-details disclosure carries email/org for a NEW contact only —
    // linked mode snapshots them from the customer record.
    fireEvent.click(screen.getByRole('button', { name: /more details/i }))
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Organization')).not.toBeInTheDocument()
  })

  it('submits customer_id without contact fields and can save with no name typed', async () => {
    render(<NewOpportunityForm orgId="o1" orgSlug="brew" open onClose={() => {}} customer={customer} />)
    fireEvent.click(screen.getByRole('button', { name: /more details/i }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Fall gala' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create opportunity' }))
    await waitFor(() => expect(createLead).toHaveBeenCalledWith('o1', expect.objectContaining({
      customer_id: 'c1', title: 'Fall gala',
    })))
    const input = vi.mocked(createLead).mock.calls[0][1]
    expect(input).not.toHaveProperty('name')
    expect(input).not.toHaveProperty('email')
  })

  it('keeps Create enabled with no name in standalone mode and errors on submit instead', async () => {
    render(<NewOpportunityForm orgId="o1" orgSlug="brew" open onClose={() => {}} />)
    const submit = screen.getByRole('button', { name: 'Create opportunity' })
    // Defect #8: validation happens on submit with a field error — never a
    // disabled button the operator has to reverse-engineer.
    expect(submit).not.toBeDisabled()
    fireEvent.click(submit)
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true')
    )
    expect(createLead).not.toHaveBeenCalled()
  })

  it('shows a single identity display when picking a customer via the typeahead', () => {
    render(<NewOpportunityForm orgId="o1" orgSlug="brew" open onClose={() => {}} customers={[customer]} />)
    // The picker is the explicit fallback, collapsed to one line until asked for.
    fireEvent.click(screen.getByRole('button', { name: /search clients/i }))
    fireEvent.change(screen.getByLabelText(/link to existing customer/i), { target: { value: 'dana' } })
    fireEvent.click(screen.getByRole('button', { name: /dana kim/i }))
    expect(screen.getByText(/linked to/i)).toBeInTheDocument()
    expect(screen.getByText('Dana Kim')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    expect(screen.queryByText(/^for /i)).not.toBeInTheDocument()
  })

  /*
    DELIVERY MODE (capacity increment 1). The offsite / on-site toggle exists
    only for a business-tier org with a room to host in — the server hands that
    down as `showDeliveryMode`. Off by default, so no control and no persisted
    flag; on, the operator's choice rides along on createLead (offsite is the
    default and stays unwritten).
  */
  describe('delivery-mode toggle', () => {
    it('renders no delivery control unless showDeliveryMode is set', () => {
      render(<NewOpportunityForm orgId="o1" orgSlug="brew" open onClose={() => {}} customer={customer} />)
      expect(screen.queryByRole('group', { name: 'Where' })).not.toBeInTheDocument()
    })

    it('offers a labelled offsite / on-site group when showDeliveryMode is set', () => {
      render(<NewOpportunityForm orgId="o1" orgSlug="brew" open onClose={() => {}} customer={customer} showDeliveryMode />)
      const group = screen.getByRole('group', { name: 'Where' })
      expect(group).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Offsite', pressed: true })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'On-site', pressed: false })).toBeInTheDocument()
    })

    it('persists an on-site choice through createLead', async () => {
      render(<NewOpportunityForm orgId="o1" orgSlug="brew" open onClose={() => {}} customer={customer} showDeliveryMode />)
      fireEvent.click(screen.getByRole('button', { name: 'On-site' }))
      expect(screen.getByRole('button', { name: 'On-site', pressed: true })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Create opportunity' }))
      await waitFor(() => expect(createLead).toHaveBeenCalledWith('o1', expect.objectContaining({
        delivery_mode: 'onsite',
      })))
    })

    it('leaves delivery_mode unwritten when the operator keeps the offsite default', async () => {
      render(<NewOpportunityForm orgId="o1" orgSlug="brew" open onClose={() => {}} customer={customer} showDeliveryMode />)
      fireEvent.click(screen.getByRole('button', { name: 'Create opportunity' }))
      await waitFor(() => expect(createLead).toHaveBeenCalled())
      expect(vi.mocked(createLead).mock.calls[0][1]).not.toHaveProperty('delivery_mode')
    })
  })
})
