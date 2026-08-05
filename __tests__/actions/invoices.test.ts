import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoiceDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const invoiceDocGetSpy = vi.hoisted(() => vi.fn())
const invoiceDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const invoiceDocDeleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listInvoicesSpy = vi.hoisted(() => vi.fn())
const listAllInvoicesSpy = vi.hoisted(() => vi.fn())
const getProposalSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const invoicesCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-invoice-id',
      set: invoiceDocSetSpy,
      get: invoiceDocGetSpy,
      update: invoiceDocUpdateSpy,
      delete: invoiceDocDeleteSpy,
    })),
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({ get: listInvoicesSpy }),
    }),
    orderBy: vi.fn().mockReturnValue({ get: listAllInvoicesSpy }),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => {
      if (sub === 'invoices') return invoicesCol
      return {}
    }),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }),
    },
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))

vi.mock('@/lib/tokens', () => ({
  generateAccessToken: vi.fn().mockReturnValue('tok_test'),
}))

vi.mock('@/actions/proposals', () => ({
  getProposal: getProposalSpy,
}))

import {
  listInvoices,
  listAllInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  sendInvoice,
  recordPayment,
  deleteInvoice,
  generateFromProposal,
} from '@/actions/invoices'

describe('invoices actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createInvoice writes an invoice with generated id, token, org/lead, draft lifecycle, empty payments, created_at, and passed fields', async () => {
    const invoice = await createInvoice('org-1', 'lead-1', {
      title: 'Deposit',
      number: 'INV-001',
      due_date: '2026-08-01',
      notes: 'Due on receipt',
      line_items: [{ description: 'DJ', quantity: 1, unit_price: 500 }],
    })
    expect(invoiceDocSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'org-1',
        lead_id: 'lead-1',
        token: 'tok_test',
        lifecycle: 'draft',
        type: 'quick',
        schema_version: 2,
        title: 'Deposit',
        number: 'INV-001',
        due_date: '2026-08-01',
        notes: 'Due on receipt',
        line_items: [{ description: 'DJ', quantity: 1, unit_price: 500 }],
        payments: [],
        created_at: expect.any(String),
      })
    )
    expect(invoice.id).toBeTruthy()
    expect(invoice.token).toBe('tok_test')
    expect(invoice.org_id).toBe('org-1')
    expect(invoice.lead_id).toBe('lead-1')
    expect(invoice.lifecycle).toBe('draft')
    expect(invoice.type).toBe('quick')
    expect(invoice.schema_version).toBe(2)
    expect(invoice.title).toBe('Deposit')
    expect(invoice.number).toBe('INV-001')
    expect(invoice.due_date).toBe('2026-08-01')
    expect(invoice.payments).toEqual([])
  })

  it('createInvoice defaults line_items to [] when omitted', async () => {
    const invoice = await createInvoice('org-1', 'lead-1', {})
    const written = invoiceDocSetSpy.mock.calls[0][0]
    expect(written.line_items).toEqual([])
    expect(written.payments).toEqual([])
    expect(invoice.line_items).toEqual([])
  })

  it('generateFromProposal builds a draft with proposal-sourced lines and invoice source', async () => {
    getProposalSpy.mockResolvedValue({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', token: 'pt', status: 'accepted',
      line_items: [{ description: 'Package', quantity: 1, unit_price: 1000 }], created_at: '2026-01-01',
    })
    // no prior invoices from this source
    listInvoicesSpy.mockResolvedValue({ docs: [] })

    const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'deposit' })

    expect(inv.lifecycle).toBe('draft')
    expect(inv.type).toBe('deposit')
    expect(inv.source).toEqual({ type: 'proposal', id: 'p1', label: 'Accepted proposal' })
    expect(inv.line_items[0].source).toEqual({ type: 'proposal', id: 'p1' })
    expect(inv.schema_version).toBe(2)
  })

  it('generateFromProposal rejects a non-accepted proposal', async () => {
    getProposalSpy.mockResolvedValue({ id: 'p1', status: 'sent', line_items: [] })
    await expect(generateFromProposal('org-1', 'lead-1', 'p1', { type: 'deposit' }))
      .rejects.toThrow(/not accepted/i)
  })

  it('listInvoices filters by lead_id, orders by created_at desc, and returns mapped docs', async () => {
    listInvoicesSpy.mockResolvedValue({
      docs: [{ data: () => ({ id: 'i1', lead_id: 'lead-1', status: 'draft', created_at: 'x' }) }],
    })
    const list = await listInvoices('org-1', 'lead-1')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('i1')
  })

  it('listAllInvoices returns every invoice across leads ordered by created_at desc (no lead filter)', async () => {
    listAllInvoicesSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'i1', lead_id: 'lead-1', status: 'draft', created_at: 'b' }) },
        { data: () => ({ id: 'i2', lead_id: 'lead-2', status: 'sent', created_at: 'a' }) },
      ],
    })
    const list = await listAllInvoices('org-1')
    expect(list).toHaveLength(2)
    expect(list.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(list.map((i) => i.lead_id)).toEqual(['lead-1', 'lead-2'])
  })

  it('getInvoice returns null when the doc does not exist', async () => {
    invoiceDocGetSpy.mockResolvedValue({ exists: false })
    const invoice = await getInvoice('org-1', 'missing')
    expect(invoice).toBeNull()
  })

  it('getInvoice returns the invoice data when it exists', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'i1', lead_id: 'lead-1', status: 'draft', created_at: 'x' }),
    })
    const invoice = await getInvoice('org-1', 'i1')
    expect(invoice).not.toBeNull()
    expect(invoice?.id).toBe('i1')
  })

  it('updateInvoice passes through fields and always sets updated_at', async () => {
    await updateInvoice('org-1', 'i1', {
      title: 'Updated',
      number: 'INV-002',
      notes: 'hello',
      due_date: '2026-09-01',
      line_items: [{ description: 'DJ', quantity: 2, unit_price: 250 }],
      status: 'sent',
    })
    const written = invoiceDocUpdateSpy.mock.calls[0][0]
    expect(written.title).toBe('Updated')
    expect(written.number).toBe('INV-002')
    expect(written.notes).toBe('hello')
    expect(written.due_date).toBe('2026-09-01')
    expect(written.line_items).toEqual([{ description: 'DJ', quantity: 2, unit_price: 250 }])
    expect(written.status).toBe('sent')
    expect(written.updated_at).toEqual(expect.any(String))
  })

  it('updateInvoice throws "Invalid status" for a bad status and does not write', async () => {
    await expect(
      // @ts-expect-error testing invalid status at runtime
      updateInvoice('org-1', 'i1', { status: 'nope' })
    ).rejects.toThrow('Invalid status')
    expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('sendInvoice updates status to sent and sets updated_at', async () => {
    await sendInvoice('org-1', 'i1')
    expect(invoiceDocUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', updated_at: expect.any(String) })
    )
  })

  it('recordPayment appends a partial payment and sets status to partial', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        line_items: [{ description: 'DJ', quantity: 1, unit_price: 100 }],
        payments: [],
        status: 'sent',
      }),
    })
    await recordPayment('org-1', 'i1', { amount: 40 })
    const written = invoiceDocUpdateSpy.mock.calls[0][0]
    expect(written.status).toBe('partial')
    expect(written.payments).toHaveLength(1)
    expect(written.payments[0]).toEqual(
      expect.objectContaining({ amount: 40, recorded_at: expect.any(String) })
    )
    expect(written.updated_at).toEqual(expect.any(String))
  })

  it('recordPayment sets status to paid when the balance is fully covered', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        line_items: [{ description: 'DJ', quantity: 1, unit_price: 100 }],
        payments: [],
        status: 'sent',
      }),
    })
    await recordPayment('org-1', 'i1', { amount: 100 })
    const written = invoiceDocUpdateSpy.mock.calls[0][0]
    expect(written.status).toBe('paid')
    expect(written.payments).toHaveLength(1)
    expect(written.payments[0]).toEqual(
      expect.objectContaining({ amount: 100, recorded_at: expect.any(String) })
    )
  })

  it('recordPayment throws "Payment amount must be positive" for a non-positive amount and does not write', async () => {
    await expect(recordPayment('org-1', 'i1', { amount: 0 })).rejects.toThrow(
      'Payment amount must be positive'
    )
    expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('recordPayment throws "Cannot record payment on a void invoice" when the invoice is void', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        line_items: [{ description: 'DJ', quantity: 1, unit_price: 100 }],
        payments: [],
        status: 'void',
      }),
    })
    await expect(recordPayment('org-1', 'i1', { amount: 40 })).rejects.toThrow(
      'Cannot record payment on a void invoice'
    )
    expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('deleteInvoice calls .delete()', async () => {
    await deleteInvoice('org-1', 'i1')
    expect(invoiceDocDeleteSpy).toHaveBeenCalled()
  })
})
