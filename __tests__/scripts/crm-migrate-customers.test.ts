import { describe, it, expect, vi, beforeEach } from 'vitest'
const findOrCreateCustomerCore = vi.hoisted(() => vi.fn())
const listLeadsCore = vi.hoisted(() => vi.fn())
const updateLeadCore = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const existingCustomerDocs = vi.hoisted(() => ({ docs: [] as Array<{ data: () => unknown }> }))
const customersQuery = vi.hoisted(() => ({
  limit: vi.fn(() => ({ get: vi.fn(async () => ({ empty: existingCustomerDocs.docs.length === 0, docs: existingCustomerDocs.docs })) })),
}))
const customersCollRef = vi.hoisted(() => ({ where: vi.fn(() => customersQuery) }))
vi.mock('@/lib/crm/customers', () => ({
  findOrCreateCustomerCore: (...a: unknown[]) => findOrCreateCustomerCore(...a),
  customersRef: () => customersCollRef,
  normalizeEmail: (email?: string) => {
    const e = email?.trim().toLowerCase()
    return e ? e : undefined
  },
}))
vi.mock('@/lib/crm/leads', () => ({
  listLeadsCore: (...a: unknown[]) => listLeadsCore(...a),
  updateLeadCore: (...a: unknown[]) => updateLeadCore(...a),
}))
import { leadToCustomerInput, migrate } from '@/scripts/crm-migrate-customers'

describe('leadToCustomerInput', () => {
  it('maps present contact fields', () => {
    expect(leadToCustomerInput({ id: 'l', name: 'Dana Kim', organization: 'Riverside Corp', email: 'dana@riv.co', phone: '555', stage: 'inquiry', created_at: '' } as never))
      .toEqual({ name: 'Dana Kim', company: 'Riverside Corp', email: 'dana@riv.co', phone: '555' })
  })
  it('omits missing optional fields', () => {
    expect(leadToCustomerInput({ id: 'l', name: 'Sam', stage: 'inquiry', created_at: '' } as never)).toEqual({ name: 'Sam' })
  })
})

describe('migrate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existingCustomerDocs.docs = []
  })

  it('dry-run counts but writes nothing', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', name: 'A', stage: 'inquiry', created_at: '' }])
    const s = await migrate('o1', { dryRun: true })
    expect(findOrCreateCustomerCore).not.toHaveBeenCalled()
    expect(updateLeadCore).not.toHaveBeenCalled()
    expect(s).toMatchObject({ totalLeads: 1, created: 1, alreadyLinked: 0 })
  })

  it('dry-run counts a repeated email within the run as deduped, not a second create', async () => {
    listLeadsCore.mockResolvedValue([
      { id: 'l1', name: 'A', email: 'a@x.co', stage: 'inquiry', created_at: '' },
      { id: 'l2', name: 'A2', email: 'A@X.co', stage: 'inquiry', created_at: '' },
    ])
    const s = await migrate('o1', { dryRun: true })
    expect(updateLeadCore).not.toHaveBeenCalled()
    expect(s).toMatchObject({ totalLeads: 2, created: 1, deduped: 1 })
  })

  it('real run uses findOrCreateCustomerCore and links the lead to the returned customer', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', name: 'A', email: 'a@x.co', stage: 'inquiry', created_at: '' }])
    findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c1', name: 'A', created_at: 'x' }, created: true })
    const s = await migrate('o1')
    expect(findOrCreateCustomerCore).toHaveBeenCalledWith('o1', expect.objectContaining({ name: 'A', email: 'a@x.co' }))
    expect(updateLeadCore).toHaveBeenCalledWith('o1', 'l1', { customer_id: 'c1' })
    expect(s).toMatchObject({ totalLeads: 1, created: 1, deduped: 0 })
  })

  it('links to an already-existing Customer instead of creating a second one — the bug this fix closes', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', name: 'A', email: 'dana@riv.co', stage: 'inquiry', created_at: '' }])
    // findOrCreateCustomerCore itself owns the durable email_lower dedup; simulate
    // it reusing a Customer that already exists (e.g. from a prior crm:migrate run
    // or from post-merge createLead) rather than creating a duplicate.
    findOrCreateCustomerCore.mockResolvedValue({
      customer: { id: 'c-existing', name: 'Dana Kim', email: 'dana@riv.co', email_lower: 'dana@riv.co', created_at: 'x' },
      created: false,
    })
    const s = await migrate('o1')
    expect(updateLeadCore).toHaveBeenCalledWith('o1', 'l1', { customer_id: 'c-existing' })
    expect(s).toMatchObject({ totalLeads: 1, created: 0, deduped: 1 })
  })

  it('skips leads already linked (idempotent)', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', name: 'A', customer_id: 'c9', stage: 'inquiry', created_at: '' }])
    const s = await migrate('o1')
    expect(findOrCreateCustomerCore).not.toHaveBeenCalled()
    expect(s).toMatchObject({ alreadyLinked: 1, created: 0 })
  })
})
