import { describe, it, expect, vi, beforeEach } from 'vitest'

const leadDocSpy = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(leadDocSpy) }),
      }),
    }),
  },
}))
vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }))

import { setLeadWaiting, clearLeadWaiting } from '@/actions/leads'
import { logActivity } from '@/lib/activity'

describe('setLeadWaiting', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires a reason', async () => {
    await expect(setLeadWaiting('o1', 'l1', { reason: '  ' })).rejects.toThrow('reason')
  })

  it('writes the waiting object (with follow-up) and logs activity', async () => {
    await setLeadWaiting('o1', 'l1', { reason: 'Client reviewing', follow_up_date: '2026-08-10' })
    expect(leadDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({ waiting: { reason: 'Client reviewing', follow_up_date: '2026-08-10' } })
    )
    expect(logActivity).toHaveBeenCalledWith('o1', expect.objectContaining({ kind: 'waiting', parent_id: 'l1' }))
  })

  it('omits follow_up_date when blank', async () => {
    await setLeadWaiting('o1', 'l1', { reason: 'x', follow_up_date: '  ' })
    expect(leadDocSpy.update).toHaveBeenCalledWith(expect.objectContaining({ waiting: { reason: 'x' } }))
  })
})

describe('clearLeadWaiting', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes waiting and logs activity', async () => {
    await clearLeadWaiting('o1', 'l1')
    const arg = leadDocSpy.update.mock.calls[0][0]
    expect('waiting' in arg).toBe(true) // set to FieldValue.delete()
    expect(logActivity).toHaveBeenCalledWith('o1', expect.objectContaining({ kind: 'waiting' }))
  })
})
