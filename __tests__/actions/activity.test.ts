import { describe, it, expect, vi, beforeEach } from 'vitest'

const activityDocSpy = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined) }))
const listActivitySpy = vi.hoisted(() => vi.fn())
const leadsDocSpy = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue(undefined) }))
const activityCollSpy = vi.hoisted(() => ({
  doc: vi.fn(() => activityDocSpy),
  where: vi.fn(),
}))
const leadsCollSpy = vi.hoisted(() => ({
  doc: vi.fn(() => leadsDocSpy),
}))
// where().where().orderBy().get() chain
activityCollSpy.where.mockImplementation(() => ({
  where: vi.fn(() => ({
    orderBy: vi.fn(() => ({ get: listActivitySpy })),
  })),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((collName) => ({
      doc: vi.fn((docId) => ({
        collection: vi.fn().mockImplementation((subcollName) => {
          if (subcollName === 'activity') return activityCollSpy
          if (subcollName === 'leads') return leadsCollSpy
          return {}
        }),
      })),
    })),
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

  it('persists structured stage when provided', async () => {
    await logActivity('o1', { parent_type: 'opportunity', parent_id: 'l1', kind: 'stage', summary: 'Stage → proposal', stage: 'proposal' })
    expect(activityDocSpy.set).toHaveBeenCalledWith(expect.objectContaining({ stage: 'proposal' }))
  })

  it('does not write a stage key when none is provided', async () => {
    await logActivity('o1', { parent_type: 'opportunity', parent_id: 'l1', kind: 'note', summary: 'hi' })
    const payload = activityDocSpy.set.mock.calls[0][0]
    expect('stage' in payload).toBe(false)
  })

  it('is best-effort: does not reject when the underlying write fails', async () => {
    activityDocSpy.set.mockRejectedValueOnce(new Error('firestore down'))
    await expect(
      logActivity('o1', { parent_type: 'opportunity', parent_id: 'p1', kind: 'stage', summary: 'x' })
    ).resolves.toBeUndefined()
  })

  it('stamps last_touch_at on the lead when parent_type is opportunity', async () => {
    await logActivity('o1', { parent_type: 'opportunity', parent_id: 'l1', kind: 'stage', summary: 'Stage → proposal' })
    const callArgs = activityDocSpy.set.mock.calls[0][0]
    expect(leadsDocSpy.update).toHaveBeenCalledWith({
      last_touch_at: callArgs.created_at,
    })
  })

  it('does not stamp last_touch_at when parent_type is not opportunity', async () => {
    await logActivity('o1', { parent_type: 'customer', parent_id: 'c1', kind: 'note', summary: 'Added a note' })
    expect(leadsDocSpy.update).not.toHaveBeenCalled()
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
