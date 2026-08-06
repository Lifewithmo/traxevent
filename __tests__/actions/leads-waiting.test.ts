import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateLeadCore = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const logActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/firebase-admin', () => ({ adminDb: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({}) }) }) }) } }))
vi.mock('@/lib/crm/leads', async (orig) => ({
  ...(await orig<typeof import('@/lib/crm/leads')>()),
  updateLeadCore,
}))
vi.mock('@/lib/activity', () => ({ logActivity }))
vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue(undefined),
  assertOrgAdmin: vi.fn().mockResolvedValue(undefined),
}))

import { setLeadWaiting, clearLeadWaiting } from '@/actions/leads'

describe('lead waiting mutations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires a reason', async () => {
    await expect(setLeadWaiting('o1', 'l1', { reason: '  ' })).rejects.toThrow('A reason is required')
    expect(updateLeadCore).not.toHaveBeenCalled()
  })

  it('sets waiting with a trimmed reason and omits an absent follow-up date', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    await setLeadWaiting('o1', 'l1', { reason: '  awaiting deposit  ' })
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(updateLeadCore).toHaveBeenCalledWith('o1', 'l1', { waiting: { reason: 'awaiting deposit' } })
    expect(logActivity).toHaveBeenCalledWith('o1', {
      parent_type: 'opportunity', parent_id: 'l1', kind: 'waiting', summary: 'Waiting: awaiting deposit',
    })
  })

  it('keeps a present follow-up date', async () => {
    await setLeadWaiting('o1', 'l1', { reason: 'client travelling', follow_up_date: '2026-09-01' })
    expect(updateLeadCore).toHaveBeenCalledWith('o1', 'l1', {
      waiting: { reason: 'client travelling', follow_up_date: '2026-09-01' },
    })
  })

  it('clears waiting by passing null through the core', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    await clearLeadWaiting('o1', 'l1')
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(updateLeadCore).toHaveBeenCalledWith('o1', 'l1', { waiting: null })
    expect(logActivity).toHaveBeenCalledWith('o1', {
      parent_type: 'opportunity', parent_id: 'l1', kind: 'waiting', summary: 'Resumed — cleared waiting',
    })
  })
})
