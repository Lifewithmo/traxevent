import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateLeadCore = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const logActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const leadDocGet = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({ adminDb: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({}) }) }) }) } }))
vi.mock('@/lib/crm/leads', async (orig) => ({
  ...(await orig<typeof import('@/lib/crm/leads')>()),
  updateLeadCore,
  leadsRef: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ get: leadDocGet }) }),
}))
vi.mock('@/lib/activity', () => ({ logActivity }))
vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue(undefined),
  assertOrgAdmin: vi.fn().mockResolvedValue(undefined),
}))

import { markLeadLost } from '@/actions/leads'

describe('markLeadLost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    leadDocGet.mockResolvedValue({ exists: true, data: () => ({ id: 'l1', stage: 'proposal' }) })
  })

  it('sets stage, lost reason, closed_at, and logs', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    await markLeadLost('org1', 'l1', { reason: 'over_budget', note: 'went with a food truck' })
    expect(assertOrgAdmin).toHaveBeenCalledWith('org1')
    const patch = updateLeadCore.mock.calls[0][2]
    expect(patch.stage).toBe('closed_lost')
    expect(patch.lost).toEqual({ reason: 'over_budget', note: 'went with a food truck' })
    expect(typeof patch.closed_at).toBe('string')
    expect(logActivity).toHaveBeenCalledWith('org1', expect.objectContaining({
      parent_type: 'opportunity', parent_id: 'l1',
      kind: 'lost', summary: 'Lost — Over budget · went with a food truck',
    }))
  })

  it('omits a blank note from the patch and the summary', async () => {
    await markLeadLost('org1', 'l1', { reason: 'no_response', note: '   ' })
    const patch = updateLeadCore.mock.calls[0][2]
    expect(patch.lost).toEqual({ reason: 'no_response' })
    expect(logActivity).toHaveBeenCalledWith('org1', expect.objectContaining({
      summary: 'Lost — No response',
    }))
  })

  it('throws when the lead does not exist and writes nothing', async () => {
    leadDocGet.mockResolvedValue({ exists: false })
    await expect(markLeadLost('org1', 'missing', { reason: 'over_budget' })).rejects.toThrow('Lead not found')
    expect(updateLeadCore).not.toHaveBeenCalled()
  })

  it('does not restamp closed_at when the lead is already closed', async () => {
    leadDocGet.mockResolvedValue({ exists: true, data: () => ({ id: 'l1', stage: 'closed_won' }) })
    await markLeadLost('org1', 'l1', { reason: 'went_elsewhere' })
    const patch = updateLeadCore.mock.calls[0][2]
    expect(patch).not.toHaveProperty('closed_at')
  })
})
