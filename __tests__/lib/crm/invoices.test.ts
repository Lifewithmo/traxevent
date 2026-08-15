import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoiceDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const invoiceDocGetSpy = vi.hoisted(() => vi.fn())
const invoiceDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const leadDocGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ exists: false }))

vi.mock('@/lib/firebase-admin', () => {
  const invoicesCol = {
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
    },
  }
})

vi.mock('@/lib/tokens', () => ({
  generateAccessToken: vi.fn().mockReturnValue('tok_test'),
}))

import { createInvoiceCore, recordPaymentCore, generateFromProposalCore } from '@/lib/crm/invoices'
import type { Proposal } from '@/lib/types'

describe('createInvoiceCore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes an invoice with customer_id when passed', async () => {
    const invoice = await createInvoiceCore('org-1', 'lead-1', { customer_id: 'cust-1' })
    expect(invoiceDocSetSpy).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'cust-1' }))
    expect(invoice.customer_id).toBe('cust-1')
  })

  it('omits customer_id when not passed (no undefined written)', async () => {
    const invoice = await createInvoiceCore('org-1', 'lead-1', {})
    const written = invoiceDocSetSpy.mock.calls.at(-1)![0]
    expect('customer_id' in written).toBe(false)
    expect(invoice.customer_id).toBeUndefined()
  })
})

describe('recordPaymentCore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('appends a payment and derives payment_status', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'inv-1', lifecycle: 'sent',
        line_items: [{ description: 'DJ', quantity: 1, unit_price: 100 }],
        payments: [],
        created_at: '',
      }),
    })
    await recordPaymentCore('org-1', 'inv-1', { amount: 100 })
    const written = invoiceDocUpdateSpy.mock.calls.at(-1)![0]
    expect(written.payments).toHaveLength(1)
    expect(written.payments[0]).toEqual(expect.objectContaining({ amount: 100 }))
    expect(written.payment_status).toBe('paid')
  })
})

describe('generateFromProposalCore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deposit type produces a single deposit line = depositAmount(acceptedTotal, proposal.deposit) with source.id === proposalId', async () => {
    const proposal = {
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted',
      line_items: [], deposit: { type: 'percent', value: 25 },
      selection: { optional_item_ids: [], selected_total: 2000, selected_at: '' },
      created_at: '',
    } as unknown as Proposal
    const inv = await generateFromProposalCore('org-1', 'lead-1', proposal, [], { type: 'deposit' })
    expect(inv.line_items).toHaveLength(1)
    expect(inv.line_items[0]).toEqual(expect.objectContaining({ description: 'Deposit', unit_price: 500 })) // 25% of 2000
    expect(inv.source?.id).toBe('p1')
  })
})
