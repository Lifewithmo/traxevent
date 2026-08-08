import { describe, it, expect, vi, beforeEach } from 'vitest'

const convertOpportunityToWorkCore = vi.hoisted(() => vi.fn())
const logActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

// actions/leads.ts imports '@/lib/crm/leads' at module scope for its other
// exports, which eagerly imports '@/lib/firebase-admin' and throws without
// real credentials. Stub it the same way __tests__/actions/leads-waiting.test.ts
// does — this file never exercises that path since convertOpportunityToWorkCore
// itself is mocked below.
vi.mock('@/lib/firebase-admin', () => ({ adminDb: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({}) }) }) }) } }))
vi.mock('@/lib/crm/convert', () => ({ convertOpportunityToWorkCore }))
vi.mock('@/lib/activity', () => ({ logActivity }))
vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue(undefined),
  assertOrgAdmin: vi.fn().mockResolvedValue(undefined),
}))

import { assertOrgAdmin } from '@/lib/auth/assert'
import { convertOpportunityToWork } from '@/actions/leads'

const input = {
  name: 'Nguyen Wedding',
  date: '2026-09-12',
  event_type_id: 'coffee-service',
  registration_type: 'individual' as const,
}

describe('convertOpportunityToWork', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convertOpportunityToWorkCore.mockResolvedValue({ id: 'e1', name: 'Nguyen Wedding', slug: 'nguyen-wedding-2026' })
  })

  it('authorizes as admin, delegates, and returns the event', async () => {
    const event = await convertOpportunityToWork('o1', 'l1', input)
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(convertOpportunityToWorkCore).toHaveBeenCalledWith('o1', 'l1', input)
    expect(event.slug).toBe('nguyen-wedding-2026')
  })

  it('logs a converted activity event naming the job', async () => {
    await convertOpportunityToWork('o1', 'l1', input)
    expect(logActivity).toHaveBeenCalledWith('o1', {
      parent_type: 'opportunity',
      parent_id: 'l1',
      kind: 'converted',
      summary: 'Scheduled as Nguyen Wedding',
    })
  })

  it('does not log when the core rejects', async () => {
    convertOpportunityToWorkCore.mockRejectedValue(new Error('This opportunity is already scheduled'))
    await expect(convertOpportunityToWork('o1', 'l1', input)).rejects.toThrow('This opportunity is already scheduled')
    expect(logActivity).not.toHaveBeenCalled()
  })
})
