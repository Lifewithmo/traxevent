import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ClientWorkingRail } from '@/components/admin/clients/ClientWorkingRail'
import { updateCustomer } from '@/actions/customers'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))
// 'use server' modules pull in firebase-admin at module scope; mocked the same
// way CustomerDetailClient.test.tsx mocks '@/actions/customers'.
vi.mock('@/actions/customers', () => ({ updateCustomer: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/actions/proposals', () => ({ listProposals: vi.fn().mockResolvedValue([]) }))
// No '@/actions/leads' mock any more: the rail lost its NewOpportunityForm
// instance (New Opportunity inc 1 — ONE form per page, owned by ClientCockpit),
// so nothing in its import graph reaches firebase-admin through that module.

describe('ClientWorkingRail', () => {
  beforeEach(() => {
    vi.mocked(updateCustomer).mockReset()
    vi.mocked(updateCustomer).mockResolvedValue(undefined)
    refresh.mockClear()
  })

  /*
    ONE FORM INSTANCE PER PAGE (New Opportunity inc 1). The rail used to mount
    its own NewOpportunityForm next to the cockpit's — two instances, duplicate
    ids on one page. The rail now only TRIGGERS: every empty-state CTA that used
    to open its private form calls `onNewJob`, and the cockpit owns the single
    instance.
  */
  describe('onNewJob (the rail triggers, the cockpit owns the form)', () => {
    const bareProps = {
      orgId: 'o',
      orgSlug: 'acme',
      customer: { id: 'c1', name: 'Tessa Lund' } as never,
      opportunities: [],
      invoices: [],
      ar: { invoiced: 0, paid: 0, outstanding: 0, overdueAmount: 0, openCount: 0 },
    }

    it('renders no form or dialog of its own', () => {
      render(<ClientWorkingRail {...bareProps} onNewJob={() => {}} />)
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('routes the empty Jobs CTA to onNewJob', () => {
      const onNewJob = vi.fn()
      render(<ClientWorkingRail {...bareProps} onNewJob={onNewJob} />)
      fireEvent.click(screen.getByRole('button', { name: 'Book a job' }))
      expect(onNewJob).toHaveBeenCalledTimes(1)
    })

    it('routes the proposal and invoice empty CTAs to onNewJob when the client has no job yet', () => {
      const onNewJob = vi.fn()
      render(<ClientWorkingRail {...bareProps} onNewJob={onNewJob} />)
      // With no lead to hang them on, both CTAs fall back to booking the job first.
      fireEvent.click(screen.getByRole('button', { name: 'Draft one' }))
      fireEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
      expect(onNewJob).toHaveBeenCalledTimes(2)
    })
  })

  it('shows the open-balance footer on the invoices card and an empty CTA when there are none', () => {
    render(
      <ClientWorkingRail
        orgId="o"
        orgSlug="acme"
        customer={{ id: 'c1', name: 'Tessa Lund' } as any}
        opportunities={[]}
        invoices={[]}
        ar={{ invoiced: 0, paid: 0, outstanding: 0, overdueAmount: 0, openCount: 0 }}
      />
    )
    expect(screen.getByText(/no invoices yet/i)).toBeInTheDocument()
    expect(screen.getByText(/create invoice/i)).toBeInTheDocument()
  })

  it('shows a + Add affordance for an empty metadata field and the value for a filled one', () => {
    render(
      <ClientWorkingRail
        orgId="o"
        orgSlug="acme"
        customer={{ id: 'c1', name: 'Tessa Lund', email: 'tessa@example.com' } as any}
        opportunities={[]}
        invoices={[]}
        ar={{ invoiced: 0, paid: 0, outstanding: 0, overdueAmount: 0, openCount: 0 }}
      />
    )
    expect(screen.getByText('tessa@example.com')).toBeInTheDocument()
    expect(screen.getByText(/\+ Add Phone/i)).toBeInTheDocument()
  })

  it('shows an alert-toned open balance when the AR is overdue', () => {
    render(
      <ClientWorkingRail
        orgId="o"
        orgSlug="acme"
        customer={{ id: 'c1', name: 'Tessa Lund' } as any}
        opportunities={[]}
        invoices={[
          {
            id: 'inv1',
            org_id: 'o',
            lead_id: 'l1',
            token: 't1',
            line_items: [{ description: 'Bar package', quantity: 1, unit_price: 500 }],
            payments: [],
            lifecycle: 'sent',
            due_date: '2020-01-01',
            created_at: '2020-01-01T00:00:00.000Z',
          } as any,
        ]}
        ar={{ invoiced: 500, paid: 0, outstanding: 500, overdueAmount: 500, openCount: 1, nextDueDate: '2020-01-01' }}
      />
    )
    const balances = screen.getAllByText('$500')
    expect(balances.some((el) => el.classList.contains('text-destructive'))).toBe(true)
    expect(screen.getByText(/Next due 2020-01-01/)).toBeInTheDocument()
  })

  it('blocks an invalid email and does not save, keeping the draft', async () => {
    render(
      <ClientWorkingRail
        orgId="o"
        orgSlug="acme"
        customer={{ id: 'c1', name: 'Tessa Lund', email: 'tessa@example.com' } as any}
        opportunities={[]}
        invoices={[]}
        ar={{ invoiced: 0, paid: 0, outstanding: 0, overdueAmount: 0, openCount: 0 }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'tessa@example.com' }))
    const input = screen.getByLabelText('Email')
    fireEvent.change(input, { target: { value: 'not-an-email' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(updateCustomer).not.toHaveBeenCalled()
    // draft is kept in the still-open input
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('not-an-email')
  })

  it('saves a valid email', async () => {
    render(
      <ClientWorkingRail
        orgId="o"
        orgSlug="acme"
        customer={{ id: 'c1', name: 'Tessa Lund', email: 'tessa@example.com' } as any}
        opportunities={[]}
        invoices={[]}
        ar={{ invoiced: 0, paid: 0, outstanding: 0, overdueAmount: 0, openCount: 0 }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'tessa@example.com' }))
    const input = screen.getByLabelText('Email')
    fireEvent.change(input, { target: { value: 'new@example.com' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(updateCustomer).toHaveBeenCalledWith('o', 'c1', { email: 'new@example.com' }))
  })

  it('flags a save failure with an alert and keeps the draft', async () => {
    vi.mocked(updateCustomer).mockRejectedValueOnce(new Error('network down'))
    render(
      <ClientWorkingRail
        orgId="o"
        orgSlug="acme"
        customer={{ id: 'c1', name: 'Tessa Lund', email: 'tessa@example.com' } as any}
        opportunities={[]}
        invoices={[]}
        ar={{ invoiced: 0, paid: 0, outstanding: 0, overdueAmount: 0, openCount: 0 }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'tessa@example.com' }))
    const input = screen.getByLabelText('Email')
    fireEvent.change(input, { target: { value: 'new@example.com' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/network down/i))
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('new@example.com')
  })
})
