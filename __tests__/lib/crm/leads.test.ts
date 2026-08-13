import { describe, it, expect, vi, beforeEach } from 'vitest'
const leadDoc = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
}))
const orderGet = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
const collRef = vi.hoisted(() => ({ doc: vi.fn(() => leadDoc), orderBy: vi.fn(() => ({ get: orderGet })) }))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))
import { createLeadCore, listLeadsCore, updateLeadCore } from '@/lib/crm/leads'

describe('updateLeadCore', () => {
  beforeEach(() => vi.clearAllMocks())
  it('rejects an invalid stage', async () => {
    await expect(updateLeadCore('o1', 'l1', { stage: 'bogus' as never })).rejects.toThrow('Invalid stage')
    expect(leadDoc.update).not.toHaveBeenCalled()
  })
  it('writes cleaned updates with updated_at', async () => {
    await updateLeadCore('o1', 'l1', { customer_id: 'c1', stage: 'proposal' })
    expect(leadDoc.update).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 'c1', stage: 'proposal', updated_at: expect.any(String) })
    )
  })
  it('does NOT log activity (no import of @/lib/activity needed)', async () => {
    // updateLeadCore performs only the write; activity logging lives in the action wrapper.
    await updateLeadCore('o1', 'l1', { stage: 'closed_won' })
    expect(leadDoc.update).toHaveBeenCalledTimes(1)
  })
})

describe('listLeadsCore', () => {
  beforeEach(() => vi.clearAllMocks())
  it('maps ordered docs', async () => {
    orderGet.mockResolvedValueOnce({ docs: [{ data: () => ({ id: 'l1', name: 'A', stage: 'inquiry', created_at: '' }) }] })
    const leads = await listLeadsCore('o1')
    expect(leads).toEqual([{ id: 'l1', name: 'A', stage: 'inquiry', created_at: '' }])
  })
})

describe('createLeadCore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes a lead with id, trimmed fields, stage, customer_id, created_at', async () => {
    const lead = await createLeadCore('o1', {
      name: '  Ada  ', stage: 'inquiry', customer_id: 'c1',
      email: 'ada@example.com', event_type: ' Wedding ',
    })
    expect(lead.name).toBe('Ada')
    expect(lead.stage).toBe('inquiry')
    expect(lead.customer_id).toBe('c1')
    expect(lead.event_type).toBe('Wedding')
    expect(lead.id).toMatch(/^[0-9a-f]{16}$/)
    expect(lead.created_at).toEqual(expect.any(String))
    expect(leadDoc.set).toHaveBeenCalledWith(lead)
  })

  it('stamps source when provided', async () => {
    const lead = await createLeadCore('o1', { name: 'A', stage: 'inquiry', customer_id: 'c1', source: 'intake' })
    expect(lead.source).toBe('intake')
  })

  it('omits source when not provided', async () => {
    const lead = await createLeadCore('o1', { name: 'A', stage: 'inquiry', customer_id: 'c1' })
    expect('source' in lead).toBe(false)
  })

  it('omits blank optional fields entirely', async () => {
    const lead = await createLeadCore('o1', {
      name: 'Ada', stage: 'inquiry', customer_id: 'c1', phone: '   ', notes: '',
    })
    expect('phone' in lead).toBe(false)
    expect('notes' in lead).toBe(false)
  })

  it('rejects a blank name and an invalid stage', async () => {
    await expect(
      createLeadCore('o1', { name: '  ', stage: 'inquiry', customer_id: 'c1' })
    ).rejects.toThrow('Name is required')
    await expect(
      createLeadCore('o1', { name: 'A', stage: 'bogus' as never, customer_id: 'c1' })
    ).rejects.toThrow('Invalid stage')
    expect(leadDoc.set).not.toHaveBeenCalled()
  })
})
