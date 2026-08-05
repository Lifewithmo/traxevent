import { describe, it, expect, vi, beforeEach } from 'vitest'
const leadDoc = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue(undefined) }))
const orderGet = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
const collRef = vi.hoisted(() => ({ doc: vi.fn(() => leadDoc), orderBy: vi.fn(() => ({ get: orderGet })) }))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))
import { listLeadsCore, updateLeadCore } from '@/lib/crm/leads'

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
