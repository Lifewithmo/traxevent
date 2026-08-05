import { describe, it, expect, vi, beforeEach } from 'vitest'

const activityDocSpy = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined) }))
const listActivitySpy = vi.hoisted(() => vi.fn())
const activityCollSpy = vi.hoisted(() => ({
  doc: vi.fn(() => activityDocSpy),
  where: vi.fn(),
}))
// where().where().orderBy().get() chain
activityCollSpy.where.mockImplementation(() => ({
  where: vi.fn(() => ({
    orderBy: vi.fn(() => ({ get: listActivitySpy })),
  })),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue(activityCollSpy),
      }),
    }),
  },
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({}),
  assertOrgAdmin: vi.fn().mockResolvedValue({}),
}))

import { logActivity } from '@/lib/activity'
import { listActivity } from '@/actions/activity'

describe('logActivity', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes an activity event with a generated id and timestamp', async () => {
    await logActivity('o1', { parent_type: 'opportunity', parent_id: 'l1', kind: 'stage', summary: 'Stage → proposal' })
    expect(activityDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        created_at: expect.any(String),
        parent_type: 'opportunity',
        parent_id: 'l1',
        kind: 'stage',
        summary: 'Stage → proposal',
      })
    )
  })
})

describe('listActivity', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns activity events for a parent', async () => {
    listActivitySpy.mockResolvedValue({
      docs: [
        {
          data: () => ({
            id: 'a1',
            parent_type: 'opportunity',
            parent_id: 'l1',
            kind: 'stage',
            summary: 'Stage → proposal',
            created_at: 'x',
          }),
        },
      ],
    })
    const events = await listActivity('o1', 'opportunity', 'l1')
    expect(events).toHaveLength(1)
    expect(events[0].summary).toBe('Stage → proposal')
  })
})
