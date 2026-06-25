import { describe, it, expect, vi, beforeEach } from 'vitest'

const checkinDocSpy = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
}))
const getCheckinDocSpy = vi.hoisted(() => vi.fn())
const getCheckinsByDateSpy = vi.hoisted(() => vi.fn())
const getFamiliesSpy = vi.hoisted(() => vi.fn())
const getMembersSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((col: string) => {
      if (col === 'orgs') {
        return {
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockImplementation((sub: string) => {
              if (sub === 'camps') {
                return {
                  doc: vi.fn().mockReturnValue({
                    collection: vi.fn().mockImplementation((sub2: string) => {
                      if (sub2 === 'checkins') {
                        return {
                          doc: vi.fn().mockReturnValue({ ...checkinDocSpy, get: getCheckinDocSpy }),
                          where: vi.fn().mockReturnValue({ get: getCheckinsByDateSpy }),
                        }
                      }
                      if (sub2 === 'families') {
                        return {
                          get: getFamiliesSpy,
                          doc: vi.fn().mockReturnValue({
                            collection: vi.fn().mockReturnValue({ get: getMembersSpy }),
                          }),
                        }
                      }
                      return {}
                    }),
                  }),
                }
              }
              return {}
            }),
          }),
        }
      }
      return {}
    }),
  },
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertCampPage: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
}))

import {
  listAllEventMembers,
  getCheckinsForDate,
  checkInMember,
  checkOutMember,
  getCheckinSummary,
} from '@/actions/checkins'

describe('listAllEventMembers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('flattens members of non-cancelled families with family context', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: [
        { id: 'fam-1', data: () => ({ id: 'fam-1', last_name: 'Smith', registration_status: 'confirmed' }) },
        { id: 'fam-2', data: () => ({ id: 'fam-2', last_name: 'Jones', registration_status: 'cancelled' }) },
      ],
    })
    getMembersSpy.mockResolvedValueOnce({
      docs: [
        { id: 'm-1', data: () => ({ id: 'm-1', family_id: 'fam-1', first_name: 'Ann', last_name: 'Smith' }) },
        { id: 'm-2', data: () => ({ id: 'm-2', family_id: 'fam-1', first_name: 'Bo', last_name: 'Smith' }) },
      ],
    })

    const members = await listAllEventMembers('org-1', 'camp-1')

    expect(members).toHaveLength(2)
    expect(members[0]).toMatchObject({
      member_id: 'm-1',
      family_id: 'fam-1',
      first_name: 'Ann',
      family_name: 'Smith',
    })
    expect(getMembersSpy).toHaveBeenCalledTimes(1)
  })
})

describe('getCheckinsForDate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns checkin records for a given date', async () => {
    getCheckinsByDateSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: '2026-07-10_m-1', date: '2026-07-10', member_id: 'm-1', status: 'in' }) },
      ],
    })
    const records = await getCheckinsForDate('org-1', 'camp-1', '2026-07-10')
    expect(records).toHaveLength(1)
    expect(records[0].member_id).toBe('m-1')
  })
})

describe('checkInMember', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes a checkin record with deterministic id, status in, and timestamp', async () => {
    const rec = await checkInMember('org-1', 'camp-1', {
      date: '2026-07-10',
      memberId: 'm-1',
      familyId: 'fam-1',
      memberName: 'Ann Smith',
      checkedInBy: 'Admin User',
    })
    expect(checkinDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '2026-07-10_m-1',
        date: '2026-07-10',
        member_id: 'm-1',
        family_id: 'fam-1',
        member_name: 'Ann Smith',
        status: 'in',
        checked_in_at: expect.any(String),
        checked_in_by: 'Admin User',
      })
    )
    expect(rec.status).toBe('in')
    expect(rec.id).toBe('2026-07-10_m-1')
  })
})

describe('checkOutMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCheckinDocSpy.mockResolvedValue({ exists: true })
  })

  it('updates record to status out with checked_out_at', async () => {
    await checkOutMember('org-1', 'camp-1', '2026-07-10_m-1')
    expect(checkinDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'out',
        checked_out_at: expect.any(String),
      })
    )
  })

  it('records guardian pickup name when provided', async () => {
    await checkOutMember('org-1', 'camp-1', '2026-07-10_m-1', 'Jane Smith (mother)')
    expect(checkinDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'out',
        guardian_pickup_name: 'Jane Smith (mother)',
      })
    )
  })

  it('throws when the check-in record does not exist', async () => {
    getCheckinDocSpy.mockResolvedValue({ exists: false })
    await expect(checkOutMember('org-1', 'camp-1', 'missing_id')).rejects.toThrow('Check-in record not found')
    expect(checkinDocSpy.update).not.toHaveBeenCalled()
  })
})

describe('getCheckinSummary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('counts records by status for a date', async () => {
    getCheckinsByDateSpy.mockResolvedValue({
      docs: [
        { data: () => ({ status: 'in' }) },
        { data: () => ({ status: 'in' }) },
        { data: () => ({ status: 'out' }) },
      ],
    })
    const summary = await getCheckinSummary('org-1', 'camp-1', '2026-07-10')
    expect(summary).toEqual({ checkedIn: 2, checkedOut: 1, total: 3 })
  })
})
