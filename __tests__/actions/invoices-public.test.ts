import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getSpy, docSpy } = vi.hoisted(() => ({
  getSpy: vi.fn(),
  docSpy: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: getSpy,
    doc: docSpy,
  },
}))

import { getPublicInvoice } from '@/actions/invoices-public'

// Configures the token lookup snapshot. `null` → empty snapshot.
function mockSnapshot(data: Record<string, unknown> | null) {
  if (data === null) {
    getSpy.mockResolvedValue({ empty: true, docs: [] })
    return
  }
  getSpy.mockResolvedValue({
    empty: false,
    docs: [{ data: () => data }],
  })
}

// Configures adminDb.doc(path).get() to resolve from a path→data map.
// Paths absent from the map read as nonexistent docs.
function mockDocs(byPath: Record<string, Record<string, unknown>>) {
  docSpy.mockImplementation((path: string) => ({
    get: async () => ({
      exists: path in byPath,
      data: () => byPath[path],
    }),
  }))
}

beforeEach(() => {
  getSpy.mockReset()
  docSpy.mockReset()
  // Default: every doc lookup misses, so parties are simply omitted.
  mockDocs({})
})

describe('getPublicInvoice', () => {
  // A full Firestore doc as it exists at rest, including the secret/internal
  // fields that must NEVER reach a public caller.
  function fullDoc(status: string) {
    return {
      id: 'inv1',
      org_id: 'org-1',
      lead_id: 'lead-1',
      token: 'super-secret-token',
      number: 'INV-001',
      title: 'Event Services',
      status,
      line_items: [{ description: 'Catering', quantity: 1, unit_price: 100 }],
      payments: [{ amount: 30, recorded_at: '2026-06-01T00:00:00.000Z' }],
      notes: 'Balance due on receipt',
      due_date: '2026-07-01',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-15T00:00:00.000Z',
    }
  }

  it('returns null for an unknown token (empty snapshot)', async () => {
    mockSnapshot(null)
    expect(await getPublicInvoice('nope')).toBeNull()
  })

  it('returns null for a draft invoice (drafts are never exposed)', async () => {
    mockSnapshot(fullDoc('draft'))
    expect(await getPublicInvoice('tok')).toBeNull()
  })

  it('projects a public-safe DTO for an issued (legacy sent) invoice with computed totals', async () => {
    mockSnapshot(fullDoc('sent'))
    const result = await getPublicInvoice('tok')
    expect(result).toEqual({
      title: 'Event Services',
      number: 'INV-001',
      type: 'quick',
      tips_enabled: false,
      line_items: [{ description: 'Catering', quantity: 1, unit_price: 100 }],
      amount_paid: 30,
      balance: 70,
      subtotal: 100,
      discount_amount: 0,
      tax_amount: 0,
      credits: [],
      total: 100,
      notes: 'Balance due on receipt',
      due_date: '2026-07-01',
      created_at: '2026-05-01T00:00:00.000Z',
    })
  })

  it('never leaks the secret token or internal ids in the DTO', async () => {
    mockSnapshot(fullDoc('partial'))
    const result = await getPublicInvoice('tok')
    expect(result).not.toBeNull()
    // These fields are seeded on the mocked doc; the DTO must strip them.
    expect('token' in (result as object)).toBe(false)
    expect('org_id' in (result as object)).toBe(false)
    expect('lead_id' in (result as object)).toBe(false)
    expect('id' in (result as object)).toBe(false)
    // No stray internal fields either.
    expect('updated_at' in (result as object)).toBe(false)
    expect('payments' in (result as object)).toBe(false)
    expect('status' in (result as object)).toBe(false)
    expect(Object.keys(result as object).sort()).toEqual(
      [
        'amount_paid',
        'balance',
        'created_at',
        'credits',
        'discount_amount',
        'due_date',
        'line_items',
        'notes',
        'number',
        'subtotal',
        'tax_amount',
        'tips_enabled',
        'title',
        'total',
        'type',
      ].sort(),
    )
  })

  it('omits optional fields that are absent on the doc', async () => {
    // Minimal doc: no title/number/notes/due_date, but still carries
    // secret fields that must be stripped.
    mockSnapshot({
      id: 'inv1',
      org_id: 'org-1',
      lead_id: 'lead-1',
      token: 'super-secret-token',
      status: 'paid',
      line_items: [{ description: 'Catering', quantity: 1, unit_price: 100 }],
      payments: [{ amount: 100, recorded_at: '2026-06-01T00:00:00.000Z' }],
      created_at: '2026-05-01T00:00:00.000Z',
    })
    const result = await getPublicInvoice('tok')
    expect(result).toEqual({
      type: 'quick',
      tips_enabled: false,
      line_items: [{ description: 'Catering', quantity: 1, unit_price: 100 }],
      amount_paid: 100,
      balance: 0,
      subtotal: 100,
      discount_amount: 0,
      tax_amount: 0,
      credits: [],
      total: 100,
      created_at: '2026-05-01T00:00:00.000Z',
    })
    expect('token' in (result as object)).toBe(false)
    expect('org_id' in (result as object)).toBe(false)
    expect('lead_id' in (result as object)).toBe(false)
    expect('id' in (result as object)).toBe(false)
  })

  it('exposes an issued invoice with type and resolved tips flag, hides drafts', async () => {
    // issued (legacy 'sent') doc
    mockSnapshot({
      id: 'i1', org_id: 'o1', lead_id: 'l1', token: 't', status: 'sent', type: 'deposit',
      line_items: [{ description: 'x', quantity: 1, unit_price: 100 }], payments: [], created_at: '', tips_enabled: true,
    })
    const pub = await getPublicInvoice('t')
    expect(pub).not.toBeNull()
    expect(pub!.type).toBe('deposit')
    expect(pub!.tips_enabled).toBe(true)
    expect(pub!.balance).toBe(100)
  })

  it('returns null for a draft (explicit lifecycle)', async () => {
    mockSnapshot({ id: 'i1', lifecycle: 'draft', line_items: [], payments: [], created_at: '' })
    expect(await getPublicInvoice('t')).toBeNull()
  })

  it('projects From (branding display name + address) and Bill-to (customer identity)', async () => {
    mockDocs({
      'orgs/org-1': {
        name: 'Acme Events LLC',
        branding: { display_name: 'Acme Events', address: '123 Main St\nSpringfield, ID 83000' },
      },
      'orgs/org-1/customers/cust-1': {
        name: 'Dana Kim',
        company: 'Riverside',
        email: 'dana@riv.co',
        phone: '555-1234',
        notes: 'internal note — never public',
      },
    })
    mockSnapshot({ ...fullDoc('sent'), customer_id: 'cust-1' })
    const result = await getPublicInvoice('tok')
    expect(result!.from).toEqual({ name: 'Acme Events', address: '123 Main St\nSpringfield, ID 83000' })
    expect(result!.bill_to).toEqual({ name: 'Dana Kim', company: 'Riverside', email: 'dana@riv.co' })
    // Identity fields only — phone/notes never cross the public boundary.
    expect('phone' in result!.bill_to!).toBe(false)
    expect('notes' in result!.bill_to!).toBe(false)
  })

  it('falls back to org name and lead contact when branding/customer are absent', async () => {
    mockDocs({
      'orgs/org-1': { name: 'Acme Events LLC' },
      'orgs/org-1/leads/lead-1': { name: 'Sam Ortiz', organization: 'Oakline', email: 'sam@oakline.co' },
    })
    mockSnapshot(fullDoc('sent'))
    const result = await getPublicInvoice('tok')
    expect(result!.from).toEqual({ name: 'Acme Events LLC' })
    expect(result!.bill_to).toEqual({ name: 'Sam Ortiz', company: 'Oakline', email: 'sam@oakline.co' })
  })

  it('omits parties entirely when the lookups miss (never fails the invoice)', async () => {
    mockSnapshot(fullDoc('sent'))
    const result = await getPublicInvoice('tok')
    expect(result).not.toBeNull()
    expect('from' in (result as object)).toBe(false)
    expect('bill_to' in (result as object)).toBe(false)
  })

  it('exposes the money breakdown (subtotal/discount/tax/credits/total) for an issued invoice', async () => {
    mockSnapshot({
      id: 'i1',
      org_id: 'o1',
      lead_id: 'l1',
      token: 't',
      status: 'sent',
      line_items: [{ description: 'Venue', quantity: 1, unit_price: 1000 }],
      discount: { type: 'percent', value: 10 },
      tax_rate: 10,
      credits: [{ description: 'Deposit', amount: 300 }],
      payments: [],
      created_at: '2026-05-01T00:00:00.000Z',
    })
    const result = await getPublicInvoice('t')
    expect(result).not.toBeNull()
    expect(result!.subtotal).toBe(1000)
    expect(result!.discount_amount).toBe(100)
    expect(result!.tax_amount).toBe(90)
    expect(result!.total).toBe(690)
    expect(result!.balance).toBe(690)
    expect(result!.credits).toEqual([{ description: 'Deposit', amount: 300 }])
    expect(result!.credits).toHaveLength(1)
  })
})
