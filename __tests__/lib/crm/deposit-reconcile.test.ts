import { describe, it, expect, vi, beforeEach } from 'vitest'
import { depositAmount } from '@/lib/proposals'

const proposalsGetSpy = vi.hoisted(() => vi.fn())
const invoicesListGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
const invoiceDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const invoiceDocGetSpy = vi.hoisted(() => vi.fn())
const invoiceDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const leadDocGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ exists: false }))

vi.mock('@/lib/firebase-admin', () => {
  const invoicesCol = {
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({ get: invoicesListGetSpy }),
    }),
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-invoice-id',
      set: invoiceDocSetSpy,
      get: invoiceDocGetSpy,
      update: invoiceDocUpdateSpy,
    })),
  }
  const leadsCol = {
    doc: vi.fn().mockImplementation(() => ({ get: leadDocGetSpy })),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => {
      if (sub === 'invoices') return invoicesCol
      if (sub === 'leads') return leadsCol
      return {}
    }),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }),
      collectionGroup: vi.fn((name: string) => {
        if (name !== 'proposals') throw new Error(`unexpected collectionGroup(${name})`)
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({ get: proposalsGetSpy }),
          }),
        }
      }),
    },
  }
})

vi.mock('@/lib/tokens', () => ({
  generateAccessToken: vi.fn().mockReturnValue('tok_test'),
}))

import { reconcileProposalDeposit } from '@/lib/crm/deposit-reconcile'

// Accepted proposal with selected_total 2000 and a 25% deposit → depositAmount = 500.
function acceptedProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prop-1',
    org_id: 'org-1',
    lead_id: 'lead-1',
    status: 'accepted',
    line_items: [],
    deposit: { type: 'percent', value: 25 },
    selection: { optional_item_ids: [], selected_total: 2000, selected_at: '' },
    created_at: '',
    ...overrides,
  }
}

function mockProposal(data: Record<string, unknown> | null) {
  proposalsGetSpy.mockResolvedValue(
    data ? { empty: false, docs: [{ data: () => data }] } : { empty: true, docs: [] },
  )
}

function mockExistingInvoices(invoices: Record<string, unknown>[]) {
  invoicesListGetSpy.mockResolvedValue({ docs: invoices.map((inv) => ({ data: () => inv })) })
}

const payment = { intent_id: 'pi_123', amount: 500, paid_at: '2026-08-05T00:00:00.000Z' }

describe('reconcileProposalDeposit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    leadDocGetSpy.mockResolvedValue({ exists: false })
    invoicesListGetSpy.mockResolvedValue({ docs: [] })
  })

  it('returns early (no writes) when the proposal is not accepted', async () => {
    mockProposal(acceptedProposal({ status: 'sent' }))
    await reconcileProposalDeposit('org-1', 'lead-1', 'prop-1', payment)
    expect(invoiceDocSetSpy).not.toHaveBeenCalled()
    expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('returns early (no writes) when the proposal cannot be found', async () => {
    mockProposal(null)
    await reconcileProposalDeposit('org-1', 'lead-1', 'ghost', payment)
    expect(invoiceDocSetSpy).not.toHaveBeenCalled()
    expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('returns early (no writes) when the caller-supplied orgId/leadId do not match the resolved proposal', async () => {
    // The resolved proposal actually belongs to org-1/lead-1, but the caller
    // (e.g. a tampered or mismatched webhook payload) asks us to reconcile it
    // under a different org/lead scope. Must never write into that scope.
    mockProposal(acceptedProposal({ org_id: 'org-1', lead_id: 'lead-1' }))
    await reconcileProposalDeposit('org-OTHER', 'lead-OTHER', 'prop-1', payment)
    expect(invoiceDocSetSpy).not.toHaveBeenCalled()
    expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
    expect(invoicesListGetSpy).not.toHaveBeenCalled()
  })

  it('creates a deposit invoice and records the Stripe payment when none exists', async () => {
    mockProposal(acceptedProposal())
    mockExistingInvoices([])
    // recordPaymentCore fetches the just-created invoice back from Firestore.
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'new-invoice-id',
        lifecycle: 'draft',
        type: 'deposit',
        source: { type: 'proposal', id: 'prop-1' },
        line_items: [{ description: 'Deposit', quantity: 1, unit_price: 500 }],
        payments: [],
        created_at: '',
      }),
    })

    await reconcileProposalDeposit('org-1', 'lead-1', 'prop-1', payment)

    // A new invoice was created.
    expect(invoiceDocSetSpy).toHaveBeenCalledTimes(1)
    const created = invoiceDocSetSpy.mock.calls[0][0]
    expect(created.type).toBe('deposit')

    // A payment of the Stripe amount was recorded, referencing the intent id.
    const updateCalls = invoiceDocUpdateSpy.mock.calls
    const paymentUpdate = updateCalls.find((c) => Array.isArray(c[0].payments))
    expect(paymentUpdate).toBeDefined()
    expect(paymentUpdate![0].payments).toHaveLength(1)
    expect(paymentUpdate![0].payments[0]).toEqual(
      expect.objectContaining({ amount: 500, method: 'card', note: expect.stringContaining('pi_123') }),
    )
    expect(paymentUpdate![0].payment_status).toBe('paid')

    // Lifecycle was moved to issued.
    const lifecycleUpdate = updateCalls.find((c) => c[0].lifecycle === 'issued')
    expect(lifecycleUpdate).toBeDefined()
    expect(lifecycleUpdate![0].issued_at).toBe(payment.paid_at)
  })

  it('is idempotent: a second call against an already-reconciled deposit invoice writes nothing', async () => {
    mockProposal(acceptedProposal())
    mockExistingInvoices([
      {
        id: 'inv-existing',
        lifecycle: 'issued',
        type: 'deposit',
        source: { type: 'proposal', id: 'prop-1' },
        line_items: [{ description: 'Deposit', quantity: 1, unit_price: 500 }],
        payments: [{ amount: 500, recorded_at: '2026-08-01T00:00:00.000Z', method: 'card' }],
        created_at: '',
      },
    ])

    await reconcileProposalDeposit('org-1', 'lead-1', 'prop-1', payment)

    expect(invoiceDocSetSpy).not.toHaveBeenCalled()
    expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
    expect(invoiceDocGetSpy).not.toHaveBeenCalled()
  })

  it('records onto an existing unpaid deposit invoice instead of creating a new one', async () => {
    mockProposal(acceptedProposal())
    mockExistingInvoices([
      {
        id: 'inv-existing',
        lifecycle: 'draft',
        type: 'deposit',
        source: { type: 'proposal', id: 'prop-1' },
        line_items: [{ description: 'Deposit', quantity: 1, unit_price: 500 }],
        payments: [],
        created_at: '',
      },
    ])
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'inv-existing',
        lifecycle: 'draft',
        type: 'deposit',
        source: { type: 'proposal', id: 'prop-1' },
        line_items: [{ description: 'Deposit', quantity: 1, unit_price: 500 }],
        payments: [],
        created_at: '',
      }),
    })

    await reconcileProposalDeposit('org-1', 'lead-1', 'prop-1', payment)

    // No new invoice was created.
    expect(invoiceDocSetSpy).not.toHaveBeenCalled()

    // The payment was recorded and lifecycle updated on the existing invoice.
    const updateCalls = invoiceDocUpdateSpy.mock.calls
    const paymentUpdate = updateCalls.find((c) => Array.isArray(c[0].payments))
    expect(paymentUpdate).toBeDefined()
    expect(paymentUpdate![0].payments).toHaveLength(1)
    expect(paymentUpdate![0].payments[0]).toEqual(expect.objectContaining({ amount: 500 }))
    const lifecycleUpdate = updateCalls.find((c) => c[0].lifecycle === 'issued')
    expect(lifecycleUpdate).toBeDefined()
  })

  it('records the Stripe payment amount, not a recompute of the deposit amount', async () => {
    const stripePayment = { intent_id: 'pi_diff', amount: 625, paid_at: '2026-08-05T00:00:00.000Z' }
    const proposal = acceptedProposal()
    // Sanity: the computed deposit differs from the Stripe amount we're about to pass.
    expect(depositAmount((proposal.selection as { selected_total: number }).selected_total, proposal.deposit as never)).toBe(500)
    expect(stripePayment.amount).not.toBe(500)

    mockProposal(proposal)
    mockExistingInvoices([])
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'new-invoice-id',
        lifecycle: 'draft',
        type: 'deposit',
        source: { type: 'proposal', id: 'prop-1' },
        line_items: [{ description: 'Deposit', quantity: 1, unit_price: 500 }],
        payments: [],
        created_at: '',
      }),
    })

    await reconcileProposalDeposit('org-1', 'lead-1', 'prop-1', stripePayment)

    const updateCalls = invoiceDocUpdateSpy.mock.calls
    const paymentUpdate = updateCalls.find((c) => Array.isArray(c[0].payments))
    expect(paymentUpdate).toBeDefined()
    expect(paymentUpdate![0].payments[0].amount).toBe(625)
  })
})
