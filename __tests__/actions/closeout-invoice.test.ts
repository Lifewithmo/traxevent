import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ uid: 'u1', role: 'staff', event_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ uid: 'a1', role: 'admin', event_access: {} }),
}))
vi.mock('@/lib/ops/closeout', () => ({
  getCloseoutCore: vi.fn().mockResolvedValue({ actuals: { hours_worked: 6 }, completed: true, created_at: 'x' }),
}))
vi.mock('@/lib/ops/event-ops', () => ({
  getOpsPlanCore: vi.fn().mockResolvedValue({ package_ids: ['p1', 'p2'], requirements: { guests: 50 } }),
}))
vi.mock('@/lib/ops/work-packages', () => ({
  getWorkPackagesByIdsCore: vi.fn().mockResolvedValue([
    { id: 'p1', name: 'Espresso Bar', price: 900, lines: [] },
    { id: 'p2', name: 'Cold Brew Add-on', price: 150, lines: [] },
  ]),
}))
vi.mock('@/lib/crm/invoices', () => ({
  invoicesRef: vi.fn(),
  listInvoicesCore: vi.fn(),
  createInvoiceCore: vi.fn().mockResolvedValue({ id: 'inv1' }),
  generateFromProposalCore: vi.fn(),
  recordPaymentCore: vi.fn(),
  markInvoiceSentCore: vi.fn(),
}))
vi.mock('@/actions/leads', () => ({
  getLead: vi.fn().mockResolvedValue({ id: 'l1', name: 'Dana', customer_id: 'cust1' }),
}))
vi.mock('@/actions/proposals', () => ({ getProposal: vi.fn() }))
const eventData = vi.hoisted(() => ({ current: { name: 'Nguyen Wedding' } as Record<string, unknown> }))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({ get: vi.fn().mockResolvedValue({ exists: true, data: () => eventData.current }) }),
        }),
      }),
    }),
  },
}))

import { assertOrgAdmin } from '@/lib/auth/assert'
import { getCloseoutCore } from '@/lib/ops/closeout'
import { getWorkPackagesByIdsCore } from '@/lib/ops/work-packages'
import { createInvoiceCore } from '@/lib/crm/invoices'
import { getLead } from '@/actions/leads'
import { generateCloseoutInvoice } from '@/actions/invoices'

beforeEach(() => {
  vi.clearAllMocks()
  eventData.current = { name: 'Nguyen Wedding' }
})

describe('generateCloseoutInvoice', () => {
  it('creates a final invoice with one line per package', async () => {
    const inv = await generateCloseoutInvoice('o1', 'e1', 'l1')
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(createInvoiceCore).toHaveBeenCalledWith('o1', 'l1', {
      type: 'final',
      title: 'Final invoice — Nguyen Wedding',
      line_items: [
        { description: 'Espresso Bar', quantity: 1, unit_price: 900 },
        { description: 'Cold Brew Add-on', quantity: 1, unit_price: 150 },
      ],
      customer_id: 'cust1',
    })
    expect(inv).toEqual({ id: 'inv1' })
  })

  it('refuses when closeout is not complete', async () => {
    vi.mocked(getCloseoutCore).mockResolvedValueOnce({ actuals: {}, completed: false, created_at: 'x' })
    await expect(generateCloseoutInvoice('o1', 'e1', 'l1')).rejects.toThrow('Complete closeout before generating the final invoice')
  })

  it('refuses when the lead no longer exists', async () => {
    vi.mocked(getLead).mockResolvedValueOnce(null)
    await expect(generateCloseoutInvoice('o1', 'e1', 'l1')).rejects.toThrow('Lead not found')
    expect(createInvoiceCore).not.toHaveBeenCalled()
  })

  it('refuses when a plan package no longer exists in the catalog', async () => {
    vi.mocked(getWorkPackagesByIdsCore).mockResolvedValueOnce([
      { id: 'p1', name: 'Espresso Bar', price: 900, lines: [], created_at: 'x' },
    ])
    await expect(generateCloseoutInvoice('o1', 'e1', 'l1')).rejects.toThrow(/Package no longer exists: p2/)
    expect(createInvoiceCore).not.toHaveBeenCalled()
  })

  it('derives the opportunity from the event when no leadId is passed', async () => {
    eventData.current = { name: 'Nguyen Wedding', lead_id: 'l-linked' }
    await generateCloseoutInvoice('o1', 'e1')
    expect(getLead).toHaveBeenCalledWith('o1', 'l-linked')
    expect(createInvoiceCore).toHaveBeenCalledWith('o1', 'l-linked', expect.objectContaining({ type: 'final' }))
  })

  it('prefers an explicitly passed leadId over the linked one', async () => {
    eventData.current = { name: 'Nguyen Wedding', lead_id: 'l-linked' }
    await generateCloseoutInvoice('o1', 'e1', 'l-chosen')
    expect(createInvoiceCore).toHaveBeenCalledWith('o1', 'l-chosen', expect.objectContaining({ type: 'final' }))
  })

  it('refuses when the event has no link and no leadId is passed', async () => {
    eventData.current = { name: 'Nguyen Wedding' }
    await expect(generateCloseoutInvoice('o1', 'e1')).rejects.toThrow('No opportunity linked to this event')
  })
})
