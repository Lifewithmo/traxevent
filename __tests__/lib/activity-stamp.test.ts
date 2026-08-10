import { describe, it, expect, vi, beforeEach } from 'vitest'

// Everything the mock factory touches must be vi.hoisted — a plain module-level
// const is in TDZ when the hoisted factory first runs (the reason every action
// test in this repo uses vi.hoisted for its spies).
const docs = vi.hoisted(() => ({
  activity: { set: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined) },
  leads: { set: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined) },
  customers: { set: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined) },
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        collection: (name: string) => ({ doc: () => docs[name as keyof typeof docs] }),
      }),
    }),
  },
}))

import { logActivity } from '@/lib/activity'

describe('logActivity last_touch_at stamps', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stamps the customer doc for a customer-parented event', async () => {
    await logActivity('o1', { parent_type: 'customer', parent_id: 'c1', kind: 'note', summary: 's' })
    expect(docs.customers.update).toHaveBeenCalledWith({ last_touch_at: expect.any(String) })
    expect(docs.leads.update).not.toHaveBeenCalled()
  })

  it('still stamps the lead doc for an opportunity-parented event', async () => {
    await logActivity('o1', { parent_type: 'opportunity', parent_id: 'l1', kind: 'note', summary: 's' })
    expect(docs.leads.update).toHaveBeenCalledWith({ last_touch_at: expect.any(String) })
    expect(docs.customers.update).not.toHaveBeenCalled()
  })

  it('never throws when the customer stamp fails (best-effort contract)', async () => {
    docs.customers.update.mockRejectedValueOnce(new Error('boom'))
    await expect(
      logActivity('o1', { parent_type: 'customer', parent_id: 'c1', kind: 'note', summary: 's' })
    ).resolves.toBeUndefined()
  })
})
