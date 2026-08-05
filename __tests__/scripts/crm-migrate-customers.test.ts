import { describe, it, expect, vi, beforeEach } from 'vitest'
const createCustomerCore = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'c1' }))
const listLeadsCore = vi.hoisted(() => vi.fn())
const updateLeadCore = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/lib/crm/customers', () => ({ createCustomerCore: (...a: unknown[]) => createCustomerCore(...a) }))
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
  beforeEach(() => vi.clearAllMocks())
  it('dry-run counts but writes nothing', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', name: 'A', stage: 'inquiry', created_at: '' }])
    const s = await migrate('o1', { dryRun: true })
    expect(createCustomerCore).not.toHaveBeenCalled()
    expect(updateLeadCore).not.toHaveBeenCalled()
    expect(s).toMatchObject({ totalLeads: 1, created: 1, alreadyLinked: 0 })
  })
  it('real run creates a customer and links the lead', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', name: 'A', email: 'a@x.co', stage: 'inquiry', created_at: '' }])
    await migrate('o1')
    expect(createCustomerCore).toHaveBeenCalledWith('o1', expect.objectContaining({ name: 'A', email: 'a@x.co' }))
    expect(updateLeadCore).toHaveBeenCalledWith('o1', 'l1', { customer_id: 'c1' })
  })
  it('skips leads already linked (idempotent)', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', name: 'A', customer_id: 'c9', stage: 'inquiry', created_at: '' }])
    const s = await migrate('o1')
    expect(createCustomerCore).not.toHaveBeenCalled()
    expect(s).toMatchObject({ alreadyLinked: 1, created: 0 })
  })
})
