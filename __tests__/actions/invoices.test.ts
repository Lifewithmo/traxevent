import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoiceDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const invoiceDocGetSpy = vi.hoisted(() => vi.fn())
const invoiceDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const invoiceDocDeleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listInvoicesSpy = vi.hoisted(() => vi.fn())
const listAllInvoicesSpy = vi.hoisted(() => vi.fn())
const getProposalSpy = vi.hoisted(() => vi.fn())
const counterGetSpy = vi.hoisted(() => vi.fn())
const txSetSpy = vi.hoisted(() => vi.fn())
const txUpdateSpy = vi.hoisted(() => vi.fn())
const getLeadSpy = vi.hoisted(() => vi.fn())
// generateFromProposalCore (lib/crm/invoices.ts) resolves customer_id itself via
// leadsRef(orgId).doc(leadId).get() — a direct Firestore read, not the guarded
// @/actions/leads getLead — so it needs its own mocked doc().get() response.
const leadDocGetSpy = vi.hoisted(() => vi.fn())

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
  const countersCol = {
    doc: vi.fn().mockImplementation(() => ({
      get: counterGetSpy,
    })),
  }
  const leadsCol = {
    doc: vi.fn().mockImplementation(() => ({
      get: leadDocGetSpy,
    })),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => {
      if (sub === 'invoices') return invoicesCol
      if (sub === 'counters') return countersCol
      if (sub === 'leads') return leadsCol
      return {}
    }),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }),
      runTransaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) =>
        cb({
          get: (ref: { get: () => unknown }) => ref.get(),
          set: txSetSpy,
          update: txUpdateSpy,
        })
      ),
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

vi.mock('@/actions/leads', () => ({
  getLead: getLeadSpy,
}))

import {
  listInvoices,
  listAllInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  approveInvoice,
  issueInvoice,
  voidInvoice,
  replaceInvoice,
  recordPayment,
  deleteInvoice,
  generateFromProposal,
} from '@/actions/invoices'
import { issueInvoiceCore } from '@/lib/crm/invoices'
import { invoiceAmountDue } from '@/lib/invoices'

describe('invoices actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks() clears call history but not queued mockResolvedValueOnce
    // implementations; a prior test that queued more .get() responses than it
    // consumed can otherwise leak a stale response into the next test.
    invoiceDocGetSpy.mockReset()
    getLeadSpy.mockResolvedValue(null)
    leadDocGetSpy.mockResolvedValue({ exists: false })
  })

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

  it('generateFromProposal builds a draft with a proposal-sourced summary line and invoice source', async () => {
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
    // no deposit terms on the proposal -> depositAmount is 0
    expect(inv.line_items).toHaveLength(1)
    expect(inv.line_items[0]).toEqual(expect.objectContaining({ description: 'Deposit', unit_price: 0 }))
    expect(inv.line_items[0].source).toEqual({ type: 'proposal', id: 'p1' })
    expect(inv.schema_version).toBe(2)
  })

  it('generateFromProposal rejects a non-accepted proposal', async () => {
    getProposalSpy.mockResolvedValue({ id: 'p1', status: 'sent', line_items: [] })
    await expect(generateFromProposal('org-1', 'lead-1', 'p1', { type: 'deposit' }))
      .rejects.toThrow(/not accepted/i)
  })

  it('generateFromProposal deposit seeds depositAmount from the accepted total', async () => {
    getProposalSpy.mockResolvedValue({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted', line_items: [],
      deposit: { type: 'percent', value: 25 },
      selection: { optional_item_ids: [], selected_total: 2000, selected_at: '' },
      created_at: '',
    })
    listInvoicesSpy.mockResolvedValue({ docs: [] })
    const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'deposit' })
    expect(inv.line_items).toHaveLength(1)
    expect(inv.line_items[0]).toEqual(expect.objectContaining({ description: 'Deposit', unit_price: 500 })) // 25% of 2000
    expect(inv.line_items[0].source).toEqual({ type: 'proposal', id: 'p1' })
  })

  it('generateFromProposal final itemizes the accepted scope and credits the remaining accepted total', async () => {
    getProposalSpy.mockResolvedValue({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted',
      line_items: [{ description: 'Base', quantity: 1, unit_price: 2000 }],
      selection: { optional_item_ids: [], selected_total: 2000, selected_at: '' }, created_at: '',
    })
    // one prior issued invoice billed 500 against this source
    listInvoicesSpy.mockResolvedValue({ docs: [{ data: () => ({
      id: 'iA', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'issued',
      source: { type: 'proposal', id: 'p1' }, line_items: [{ description: 'Deposit', quantity: 1, unit_price: 500 }],
      payments: [], created_at: '',
    }) }] })
    const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'final' })
    expect(inv.line_items[0]).toEqual(expect.objectContaining({ description: 'Base', unit_price: 2000 }))
    expect(inv.credits).toEqual([{ description: 'Less: previously billed', amount: 500 }])
    expect(invoiceAmountDue(inv)).toBe(1500)
  })

  it('generateFromProposal scope guardrail uses the accepted total (package proposal)', async () => {
    getProposalSpy.mockResolvedValue({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted', line_items: [],
      packages: [{ id: 'best', name: 'Best', includes: [], price: 1000 }],
      selection: { package_id: 'best', optional_item_ids: [], selected_total: 1000, selected_at: '' }, created_at: '',
    })
    // already billed 1000 (fully) against this source
    listInvoicesSpy.mockResolvedValue({ docs: [{ data: () => ({
      id: 'iA', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'issued',
      source: { type: 'proposal', id: 'p1' }, line_items: [{ description: 'x', quantity: 1, unit_price: 1000 }],
      payments: [], created_at: '',
    }) }] })
    // final still itemizes the full accepted package, but credits the amount already billed
    // so the amount due nets to 0 -> nothing left to bill.
    const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'final' })
    expect(inv.line_items[0]).toEqual(expect.objectContaining({ description: 'Best', unit_price: 1000 }))
    expect(inv.credits).toEqual([{ description: 'Less: previously billed', amount: 1000 }])
    expect(invoiceAmountDue(inv)).toBe(0)
  })

  it('generateFromProposal quick itemizes and copies discount/tax (total = accepted)', async () => {
    getProposalSpy.mockResolvedValue({ id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted',
      line_items: [{ id: 'r1', description: 'Base', quantity: 1, unit_price: 1000 }],
      discount: { type: 'percent', value: 10 }, tax_rate: 10,
      selection: { optional_item_ids: [], selected_total: 990, selected_at: '' }, created_at: '' })
    listInvoicesSpy.mockResolvedValue({ docs: [] })
    const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'quick' })
    expect(inv.line_items).toEqual([expect.objectContaining({ description: 'Base', unit_price: 1000 })])
    expect(inv.discount).toEqual({ type: 'percent', value: 10 })
    expect(inv.tax_rate).toBe(10)
    expect(invoiceAmountDue(inv)).toBe(990)
  })

  it('generateFromProposal final itemizes full scope and credits previously billed', async () => {
    getProposalSpy.mockResolvedValue({ id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted',
      line_items: [{ id: 'r1', description: 'Base', quantity: 1, unit_price: 1000 }],
      selection: { optional_item_ids: [], selected_total: 1000, selected_at: '' }, created_at: '' })
    listInvoicesSpy.mockResolvedValue({ docs: [{ data: () => ({ id: 'iA', org_id: 'org-1', lead_id: 'lead-1',
      token: 't', lifecycle: 'issued', source: { type: 'proposal', id: 'p1' },
      line_items: [{ description: 'Deposit', quantity: 1, unit_price: 400 }], payments: [], created_at: '' }) }] })
    const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'final' })
    expect(inv.line_items).toEqual([expect.objectContaining({ description: 'Base', unit_price: 1000 })])
    expect(inv.credits).toEqual([{ description: 'Less: previously billed', amount: 400 }])
    expect(invoiceAmountDue(inv)).toBe(600) // 1000 - 400
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
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'i1', lifecycle: 'draft', line_items: [], payments: [], created_at: '' }),
    })
    await updateInvoice('org-1', 'i1', {
      title: 'Updated',
      number: 'INV-002',
      notes: 'hello',
      due_date: '2026-09-01',
      line_items: [{ description: 'DJ', quantity: 2, unit_price: 250 }],
    })
    const written = invoiceDocUpdateSpy.mock.calls[0][0]
    expect(written.title).toBe('Updated')
    expect(written.number).toBe('INV-002')
    expect(written.notes).toBe('hello')
    expect(written.due_date).toBe('2026-09-01')
    expect(written.line_items).toEqual([{ description: 'DJ', quantity: 2, unit_price: 250 }])
    expect(written.updated_at).toEqual(expect.any(String))
  })

  it('updateInvoice never passes a raw undefined to Firestore .update() — clears undefined fields via FieldValue.delete() instead', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'inv-1', lifecycle: 'draft', line_items: [], payments: [], created_at: '' }),
    })
    await updateInvoice('org-1', 'inv-1', { notes: 'x', discount: undefined })
    const arg = invoiceDocUpdateSpy.mock.calls[0][0]
    expect(arg.notes).toBe('x')
    // Firestore Admin throws "Cannot use \"undefined\" as a Firestore value" when
    // ignoreUndefinedProperties is off — a cleared field must become a FieldValue.delete()
    // sentinel, not a raw undefined (and not be silently dropped, which would leave a stale value).
    expect(arg.discount).not.toBeUndefined()
    expect('discount' in arg).toBe(true)
  })

  it('updateInvoice rejects financial edits on an issued invoice', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'inv-1', lifecycle: 'issued', line_items: [], payments: [], created_at: '' }),
    })
    await expect(updateInvoice('org-1', 'inv-1', { line_items: [] })).rejects.toThrow(/locked/i)
    expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('updateInvoice allows editing notes on an issued invoice', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'inv-1', lifecycle: 'issued', line_items: [], payments: [], created_at: '' }),
    })
    await updateInvoice('org-1', 'inv-1', { notes: 'call before delivery' })
    expect(invoiceDocUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ notes: 'call before delivery' }))
  })

  it('approveInvoice moves draft to approved', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'inv-1', lifecycle: 'draft', line_items: [], payments: [], created_at: '' }),
    })
    await approveInvoice('org-1', 'inv-1')
    expect(invoiceDocUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'approved' }))
  })

  it('approveInvoice throws when the invoice is not a draft', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'inv-1', lifecycle: 'issued', line_items: [], payments: [], created_at: '' }),
    })
    await expect(approveInvoice('org-1', 'inv-1')).rejects.toThrow(/draft/i)
    expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('issueInvoice assigns the next sequential number and locks the invoice', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'inv-1', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'draft', type: 'quick',
        line_items: [{ description: 'x', quantity: 1, unit_price: 500 }], payments: [], created_at: '2026-01-01',
      }),
    })
    counterGetSpy.mockResolvedValue({ exists: true, data: () => ({ seq: 1000, prefix: 'INV-' }) })

    const res = await issueInvoice('org-1', 'inv-1')

    expect(res.number).toBe('INV-1001')
    expect(txSetSpy).toHaveBeenCalledWith(expect.anything(), { seq: 1001 }, { merge: true })
    expect(txSetSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lifecycle: 'issued', number: 'INV-1001' }),
      { merge: true }
    )
    expect(txUpdateSpy).not.toHaveBeenCalled()
  })

  it('issueInvoice seeds the counter doc via set({ merge: true }) when it does not exist yet (first issuance in the org)', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'inv-1', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'draft', type: 'quick',
        line_items: [{ description: 'x', quantity: 1, unit_price: 500 }], payments: [], created_at: '2026-01-01',
      }),
    })
    // No counter doc has ever been created for this org yet.
    counterGetSpy.mockResolvedValue({ exists: false })

    const res = await issueInvoice('org-1', 'inv-1')

    expect(res.number).toBe('1001')
    expect(txSetSpy).toHaveBeenCalledWith(expect.anything(), { seq: 1001 }, { merge: true })
    expect(txUpdateSpy).not.toHaveBeenCalled()
  })

  it('issueInvoice throws when the invoice is not draft or approved', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'inv-1', lifecycle: 'voided', line_items: [], payments: [], created_at: '' }),
    })
    await expect(issueInvoice('org-1', 'inv-1')).rejects.toThrow(/cannot issue/i)
    expect(txSetSpy).not.toHaveBeenCalled()
  })

  it('issueInvoice enforces the proposal scope invariant across sibling drafts, not just at generate time', async () => {
    const proposal = {
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', token: 'pt', status: 'accepted',
      line_items: [{ description: 'Package', quantity: 1, unit_price: 1000 }], created_at: '2026-01-01',
    }
    getProposalSpy.mockResolvedValue(proposal)

    const draftA = {
      id: 'inv-a', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'draft', type: 'progress',
      line_items: [{ description: 'Milestone 1', quantity: 1, unit_price: 600, source: { type: 'proposal', id: 'p1' } }],
      payments: [], created_at: '2026-02-01',
      source: { type: 'proposal', id: 'p1', label: 'Accepted proposal' },
    }
    const draftB = {
      id: 'inv-b', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'draft', type: 'progress',
      line_items: [{ description: 'Milestone 2', quantity: 1, unit_price: 600, source: { type: 'proposal', id: 'p1' } }],
      payments: [], created_at: '2026-02-02',
      source: { type: 'proposal', id: 'p1', label: 'Accepted proposal' },
    }

    // Issuing draftA: pre-check read + tx.get both see draftA; no sibling invoices issued yet.
    invoiceDocGetSpy
      .mockResolvedValueOnce({ exists: true, data: () => draftA })
      .mockResolvedValueOnce({ exists: true, data: () => draftA })
    listInvoicesSpy.mockResolvedValueOnce({ docs: [] })
    counterGetSpy.mockResolvedValue({ exists: true, data: () => ({ seq: 1000 }) })

    const first = await issueInvoice('org-1', 'inv-a')
    expect(first.number).toBe('1001')

    // Issuing draftB: pre-check read + tx.get both see draftB; draftA now shows up as
    // already-issued in the sibling list, at $600 already billed against the $1000 proposal.
    invoiceDocGetSpy
      .mockResolvedValueOnce({ exists: true, data: () => draftB })
      .mockResolvedValueOnce({ exists: true, data: () => draftB })
    listInvoicesSpy.mockResolvedValueOnce({
      docs: [{ data: () => ({ ...draftA, lifecycle: 'issued', number: '1001' }) }],
    })

    await expect(issueInvoice('org-1', 'inv-b')).rejects.toThrow(/exceeds approved scope/i)
  })

  it('issueInvoice scope check uses the accepted total, not invoiceTotal(proposal.line_items) (package proposal)', async () => {
    // proposal.line_items sums to 5000 (would let old, buggy `invoiceTotal(proposal.line_items)`
    // scope math wave through over-billing) but the accepted (selected) total is only 1000.
    const proposal = {
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', token: 'pt', status: 'accepted',
      line_items: [{ description: 'x', quantity: 1, unit_price: 5000 }],
      packages: [{ id: 'best', name: 'Best', includes: [], price: 1000 }],
      selection: { package_id: 'best', optional_item_ids: [], selected_total: 1000, selected_at: '' },
      created_at: '2026-01-01',
    }
    getProposalSpy.mockResolvedValue(proposal)

    const draft = {
      id: 'inv-c', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'draft', type: 'progress',
      line_items: [{ description: 'Extra', quantity: 1, unit_price: 1, source: { type: 'proposal', id: 'p1' } }],
      payments: [], created_at: '2026-02-03',
      source: { type: 'proposal', id: 'p1', label: 'Accepted proposal' },
    }
    invoiceDocGetSpy
      .mockResolvedValueOnce({ exists: true, data: () => draft })
      .mockResolvedValueOnce({ exists: true, data: () => draft })
    // a sibling already issued for the full accepted total (1000)
    listInvoicesSpy.mockResolvedValueOnce({
      docs: [{ data: () => ({
        id: 'iA', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'issued',
        source: { type: 'proposal', id: 'p1' }, line_items: [{ description: 'Package', quantity: 1, unit_price: 1000 }],
        payments: [], created_at: '2026-02-01',
      }) }],
    })
    counterGetSpy.mockResolvedValue({ exists: true, data: () => ({ seq: 1000 }) })

    await expect(issueInvoice('org-1', 'inv-c')).rejects.toThrow(/exceeds approved scope/i)
  })

  it('issueInvoiceCore assigns the next sequential number, honors a caller-supplied issuedAt, and increments the counter', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'inv-1', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'draft', type: 'quick',
        line_items: [{ description: 'x', quantity: 1, unit_price: 500 }], payments: [], created_at: '2026-01-01',
      }),
    })
    counterGetSpy.mockResolvedValue({ exists: true, data: () => ({ seq: 1000, prefix: 'INV-' }) })

    const res = await issueInvoiceCore('org-1', 'inv-1', { issuedAt: '2026-08-01T00:00:00.000Z' })

    expect(res.number).toBe('INV-1001')
    expect(txSetSpy).toHaveBeenCalledWith(expect.anything(), { seq: 1001 }, { merge: true })
    expect(txSetSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lifecycle: 'issued', number: 'INV-1001', issued_at: '2026-08-01T00:00:00.000Z' }),
      { merge: true }
    )
  })

  it('issueInvoiceCore also accepts an approved invoice and defaults issued_at to now when opts is omitted', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'inv-1', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'approved', type: 'quick',
        line_items: [], payments: [], created_at: '2026-01-01',
      }),
    })
    counterGetSpy.mockResolvedValue({ exists: false })

    const res = await issueInvoiceCore('org-1', 'inv-1')

    expect(res.number).toBe('1001')
    const invoiceSetCall = txSetSpy.mock.calls.find((c) => (c[1] as { lifecycle?: string })?.lifecycle === 'issued')
    expect(invoiceSetCall).toBeDefined()
    expect((invoiceSetCall![1] as { issued_at?: string }).issued_at).toEqual(expect.any(String))
  })

  it('issueInvoiceCore throws when the invoice is not draft or approved and writes nothing', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'inv-1', lifecycle: 'voided', line_items: [], payments: [], created_at: '' }),
    })
    await expect(issueInvoiceCore('org-1', 'inv-1')).rejects.toThrow(/cannot issue/i)
    expect(txSetSpy).not.toHaveBeenCalled()
  })

  it('voidInvoice sets lifecycle voided and keeps the number', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'inv-1', lifecycle: 'issued', number: 'INV-1001', line_items: [], payments: [], created_at: '' }),
    })
    await voidInvoice('org-1', 'inv-1', 'duplicate')
    expect(invoiceDocUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: 'voided', void_reason: 'duplicate' })
    )
  })

  it('voidInvoice rejects a draft (delete instead)', async () => {
    invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({
      id: 'inv-1', lifecycle: 'draft', line_items: [], payments: [], created_at: '' }) })
    await expect(voidInvoice('org-1', 'inv-1')).rejects.toThrow(/delete the draft/i)
    expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('voidInvoice rejects an already-voided invoice', async () => {
    invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({
      id: 'inv-1', lifecycle: 'voided', line_items: [], payments: [], created_at: '' }) })
    await expect(voidInvoice('org-1', 'inv-1')).rejects.toThrow(/already voided/i)
    expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('replaceInvoice rejects a non-issued invoice', async () => {
    invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({
      id: 'inv-1', lifecycle: 'draft', line_items: [], payments: [], created_at: '' }) })
    await expect(replaceInvoice('org-1', 'inv-1')).rejects.toThrow(/issued/i)
  })

  it('replaceInvoice voids the original and creates a linked draft copy', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'inv-1', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'issued', type: 'quick',
        line_items: [{ description: 'x', quantity: 1, unit_price: 500 }], payments: [], created_at: '2026-01-01',
        source: { type: 'proposal', id: 'p1', label: 'Accepted proposal' },
      }),
    })

    const draft = await replaceInvoice('org-1', 'inv-1')

    expect(draft.lifecycle).toBe('draft')
    expect(draft.replaces_id).toBe('inv-1')
    expect(invoiceDocUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: 'replaced', replaced_by_id: draft.id })
    )
    expect(invoiceDocUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        replaces_id: 'inv-1',
        source: { type: 'proposal', id: 'p1', label: 'Accepted proposal' },
      })
    )
  })

  it('recordPayment appends a partial payment and sets payment_status to partial', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'i1', lifecycle: 'issued',
        line_items: [{ description: 'DJ', quantity: 1, unit_price: 100 }],
        payments: [],
        created_at: '',
      }),
    })
    await recordPayment('org-1', 'i1', { amount: 40 })
    const written = invoiceDocUpdateSpy.mock.calls[0][0]
    expect(written.payment_status).toBe('partial')
    expect(written.lifecycle).toBeUndefined()
    expect(written.payments).toHaveLength(1)
    expect(written.payments[0]).toEqual(
      expect.objectContaining({ amount: 40, recorded_at: expect.any(String) })
    )
    expect(written.updated_at).toEqual(expect.any(String))
  })

  it('recordPayment sets payment_status to paid when the balance is fully covered', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'i1', lifecycle: 'issued',
        line_items: [{ description: 'DJ', quantity: 1, unit_price: 100 }],
        payments: [],
        created_at: '',
      }),
    })
    await recordPayment('org-1', 'i1', { amount: 100 })
    const written = invoiceDocUpdateSpy.mock.calls[0][0]
    expect(written.payment_status).toBe('paid')
    expect(written.lifecycle).toBeUndefined()
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

  it('recordPayment throws "Cannot record payment on a voided invoice" when the invoice is voided', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'i1', lifecycle: 'voided',
        line_items: [{ description: 'DJ', quantity: 1, unit_price: 100 }],
        payments: [],
        created_at: '',
      }),
    })
    await expect(recordPayment('org-1', 'i1', { amount: 40 })).rejects.toThrow(
      'Cannot record payment on a voided invoice'
    )
    expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('recordPayment stores tip_amount separately and recomputes payment_status', async () => {
    invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({
      id: 'inv-1', lifecycle: 'issued', line_items: [{ description: 'x', quantity: 1, unit_price: 100 }], payments: [], created_at: '',
    }) })
    await recordPayment('org-1', 'inv-1', { amount: 100, tip_amount: 20 })
    const arg = invoiceDocUpdateSpy.mock.calls.at(-1)![0]
    expect(arg.payments[0]).toEqual(expect.objectContaining({ amount: 100, tip_amount: 20 }))
    expect(arg.payment_status).toBe('paid') // tip does not overpay
  })

  it('deleteInvoice calls .delete() for a draft invoice', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'i1', lifecycle: 'draft', line_items: [], payments: [], created_at: '' }),
    })
    await deleteInvoice('org-1', 'i1')
    expect(invoiceDocDeleteSpy).toHaveBeenCalled()
  })

  it('deleteInvoice refuses to delete an issued invoice', async () => {
    invoiceDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'inv-1', lifecycle: 'issued', line_items: [], payments: [], created_at: '' }),
    })
    await expect(deleteInvoice('org-1', 'inv-1')).rejects.toThrow(/cannot delete/i)
    expect(invoiceDocDeleteSpy).not.toHaveBeenCalled()
  })

  it('createInvoice copies customer_id from the lead when the lead has one', async () => {
    getLeadSpy.mockResolvedValue({ id: 'lead-1', name: 'Acme', stage: 'booked', customer_id: 'cust-9', created_at: '' })
    const inv = await createInvoice('org-1', 'lead-1', {})
    expect(inv.customer_id).toBe('cust-9')
    const written = invoiceDocSetSpy.mock.calls.at(-1)![0]
    expect(written.customer_id).toBe('cust-9')
  })

  it('createInvoice omits customer_id when the lead has none (no undefined written)', async () => {
    getLeadSpy.mockResolvedValue({ id: 'lead-1', name: 'Acme', stage: 'booked', created_at: '' })
    const inv = await createInvoice('org-1', 'lead-1', {})
    expect(inv.customer_id).toBeUndefined()
    const written = invoiceDocSetSpy.mock.calls.at(-1)![0]
    expect('customer_id' in written).toBe(false)
  })

  it('createInvoice omits customer_id when the lead is missing', async () => {
    getLeadSpy.mockResolvedValue(null)
    const inv = await createInvoice('org-1', 'lead-1', {})
    expect(inv.customer_id).toBeUndefined()
  })

  it('generateFromProposal inherits the lead customer_id', async () => {
    // generateFromProposalCore resolves customer_id itself via leadsRef, not @/actions/leads.
    leadDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'lead-1', name: 'Acme', stage: 'booked', customer_id: 'cust-9', created_at: '' }) })
    getProposalSpy.mockResolvedValue({ id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted',
      line_items: [{ description: 'Pkg', quantity: 1, unit_price: 1000 }], created_at: '' })
    listInvoicesSpy.mockResolvedValue({ docs: [] })
    const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'deposit' })
    expect(inv.customer_id).toBe('cust-9')
  })
})
