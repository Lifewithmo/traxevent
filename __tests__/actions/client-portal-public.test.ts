import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getSpy, proposalsSpy, invoicesSpy } = vi.hoisted(() => ({
  getSpy: vi.fn(),
  proposalsSpy: vi.fn(),
  invoicesSpy: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: getSpy,
  },
}))

import { getClientPortal } from '@/actions/client-portal-public'

// Builds the collectionGroup('leads') snapshot. The single lead doc carries a
// `ref` whose parent.parent is the orgRef — the org is resolved SOLELY from
// this path. That orgRef's proposals/invoices/contracts subcollection queries
// resolve to proposalsSpy / invoicesSpy / contractsSpy.
function mockLead(data: Record<string, unknown> | null) {
  if (data === null) {
    getSpy.mockResolvedValue({ empty: true, docs: [] })
    return
  }
  const orgRef = {
    id: 'org-1',
    collection: vi.fn().mockImplementation((sub: string) => {
      const get = sub === 'proposals' ? proposalsSpy : invoicesSpy
      const q = { where: vi.fn().mockReturnThis(), get }
      return q
    }),
  }
  const ref = { parent: { parent: orgRef } }
  getSpy.mockResolvedValue({
    empty: false,
    docs: [{ id: 'lead-1', data: () => data, ref }],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  proposalsSpy.mockResolvedValue({ docs: [] })
  invoicesSpy.mockResolvedValue({ docs: [] })
})

// A full lead doc at rest, including internal fields that must NEVER be exposed.
function fullLead() {
  return {
    id: 'lead-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '555-1234',
    organization: 'Analytical Engines Co',
    event_type: 'Corporate gala',
    event_date: '2026-09-01',
    estimated_value: 25000,
    stage: 'proposal',
    notes: 'VIP client, be responsive',
    portal_token: 'tok_client',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }
}

describe('getClientPortal', () => {
  it('returns null for an unknown token (empty snapshot)', async () => {
    mockLead(null)
    expect(await getClientPortal('nope')).toBeNull()
  })

  it('returns a client-facing DTO with client fields, stage, and timeline', async () => {
    mockLead(fullLead())
    const result = await getClientPortal('tok_client')
    expect(result).not.toBeNull()
    expect(result?.client_name).toBe('Ada Lovelace')
    expect(result?.organization).toBe('Analytical Engines Co')
    expect(result?.event_type).toBe('Corporate gala')
    expect(result?.event_date).toBe('2026-09-01')
    expect(result?.stage).toBe('proposal')
    expect(Array.isArray(result?.timeline)).toBe(true)
    expect(result!.timeline.length).toBeGreaterThan(0)
    expect(result?.timeline.some((s) => s.current && s.stage === 'proposal')).toBe(true)
  })

  it('includes only non-draft, non-voided proposals with { status, total, token, title? }', async () => {
    mockLead(fullLead())
    proposalsSpy.mockResolvedValue({
      docs: [
        {
          data: () => ({
            id: 'p1',
            org_id: 'org-1',
            lead_id: 'lead-1',
            token: 'ptok',
            title: 'Gala Package',
            status: 'sent',
            line_items: [{ description: 'Venue', quantity: 1, unit_price: 5000 }],
            notes: 'secret',
            created_at: 'x',
          }),
        },
        {
          data: () => ({
            id: 'p2',
            org_id: 'org-1',
            lead_id: 'lead-1',
            token: 'draftptok',
            status: 'draft',
            line_items: [{ description: 'X', quantity: 1, unit_price: 999 }],
            created_at: 'x',
          }),
        },
        {
          data: () => ({
            id: 'p3',
            org_id: 'org-1',
            lead_id: 'lead-1',
            token: 'voidedptok',
            status: 'voided',
            line_items: [{ description: 'Y', quantity: 1, unit_price: 777 }],
            voided_at: 'x',
            void_reason: 'Superseded',
            created_at: 'x',
          }),
        },
      ],
    })
    const result = await getClientPortal('tok_client')
    expect(result?.proposals).toHaveLength(1)
    expect(result?.proposals[0]).toEqual({
      status: 'sent',
      total: 5000,
      token: 'ptok',
      title: 'Gala Package',
    })
  })

  it('includes only finalized invoices (hides draft and approved) with { lifecycle, total, balance, token, title?, number? }', async () => {
    mockLead(fullLead())
    invoicesSpy.mockResolvedValue({
      docs: [
        {
          data: () => ({
            id: 'i1',
            org_id: 'org-1',
            lead_id: 'lead-1',
            token: 'itok',
            title: 'Deposit',
            number: 'INV-001',
            lifecycle: 'issued',
            line_items: [{ description: 'DJ', quantity: 1, unit_price: 1000 }],
            payments: [{ amount: 400, recorded_at: 'x' }],
            notes: 'secret',
            created_at: 'x',
          }),
        },
        {
          data: () => ({
            id: 'i2',
            org_id: 'org-1',
            lead_id: 'lead-1',
            token: 'draftitok',
            lifecycle: 'draft',
            line_items: [{ description: 'Y', quantity: 1, unit_price: 500 }],
            payments: [],
            created_at: 'x',
          }),
        },
        {
          data: () => ({
            id: 'i3',
            org_id: 'org-1',
            lead_id: 'lead-1',
            token: 'approveditok',
            lifecycle: 'approved',
            line_items: [{ description: 'Z', quantity: 1, unit_price: 500 }],
            payments: [],
            created_at: 'x',
          }),
        },
      ],
    })
    const result = await getClientPortal('tok_client')
    expect(result?.invoices).toHaveLength(1)
    expect(result?.invoices[0]).toEqual({
      lifecycle: 'issued',
      total: 1000,
      balance: 600,
      token: 'itok',
      title: 'Deposit',
      number: 'INV-001',
    })
  })

  it('never leaks internal lead fields in the DTO', async () => {
    mockLead(fullLead())
    const result = await getClientPortal('tok_client')
    expect(result).not.toBeNull()
    const r = result as object
    expect('notes' in r).toBe(false)
    expect('estimated_value' in r).toBe(false)
    expect('email' in r).toBe(false)
    expect('phone' in r).toBe(false)
    expect('id' in r).toBe(false)
    expect('portal_token' in r).toBe(false)
  })

  it('omits optional lead fields absent on the doc', async () => {
    mockLead({
      id: 'lead-1',
      name: 'Minimal Client',
      stage: 'inquiry',
      portal_token: 'tok_client',
      created_at: 'x',
    })
    const result = await getClientPortal('tok_client')
    expect(result?.client_name).toBe('Minimal Client')
    expect('organization' in (result as object)).toBe(false)
    expect('event_type' in (result as object)).toBe(false)
    expect('event_date' in (result as object)).toBe(false)
  })
})
