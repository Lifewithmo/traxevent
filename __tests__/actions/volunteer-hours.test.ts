import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertCampPage: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
}))

const entryDocSpy = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined) }))
const getEntriesSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockReturnValue({
              doc: vi.fn().mockReturnValue(entryDocSpy),
              orderBy: vi.fn().mockReturnValue({ get: getEntriesSpy }),
            }),
          }),
        }),
      }),
    }),
  },
}))

import { listVolunteerHours, logVolunteerHours, deleteVolunteerHours } from '@/actions/volunteer-hours'

describe('listVolunteerHours', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns all entries', async () => {
    getEntriesSpy.mockResolvedValue({
      docs: [{ data: () => ({ id: 'h1', person_id: 'p1', person_name: 'Ann', date: '2026-07-10', hours: 4, created_at: 'x' }) }],
    })
    const entries = await listVolunteerHours('org-1', 'camp-1')
    expect(entries).toHaveLength(1)
    expect(entries[0].hours).toBe(4)
  })
})

describe('logVolunteerHours', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an entry with the given fields and a generated id', async () => {
    const e = await logVolunteerHours('org-1', 'camp-1', {
      personId: 'p1', personName: 'Ann', date: '2026-07-10', hours: 4, note: 'Kitchen',
    })
    expect(entryDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({ person_id: 'p1', person_name: 'Ann', date: '2026-07-10', hours: 4, note: 'Kitchen', created_at: expect.any(String) })
    )
    expect(e.hours).toBe(4)
    expect(e.id).toBeTruthy()
  })

  it('omits note when not provided', async () => {
    await logVolunteerHours('org-1', 'camp-1', { personId: 'p1', personName: 'Ann', date: '2026-07-10', hours: 2 })
    expect(entryDocSpy.set.mock.calls[0][0]).not.toHaveProperty('note')
  })
})

describe('deleteVolunteerHours', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the entry', async () => {
    await deleteVolunteerHours('org-1', 'camp-1', 'h1')
    expect(entryDocSpy.delete).toHaveBeenCalled()
  })
})
