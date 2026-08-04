import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { setCustomUserClaims: vi.fn() },
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    collectionGroup: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn(),
  },
}))

vi.mock('@/actions/auth', () => ({
  setOrgClaims: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
  assertEventPage: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
}))

import { buildInviteToken, validateEventPages } from '@/lib/tokens'
import { EVENT_PAGES } from '@/lib/types'
import { adminDb } from '@/lib/firebase-admin'
import {
  updateStaffEventAccess,
  updateStaffDepartmentAccess,
} from '@/actions/members'

// adminDb is mocked above; cast to reach the mocked .update spy.
const updateSpy = (adminDb as unknown as { update: ReturnType<typeof vi.fn> }).update

describe('buildInviteToken', () => {
  it('returns a 32-char hex string', () => {
    const token = buildInviteToken()
    expect(token).toMatch(/^[a-f0-9]{32}$/)
  })

  it('returns a unique value each call', () => {
    expect(buildInviteToken()).not.toBe(buildInviteToken())
  })
})

describe('validateCampPages', () => {
  it('filters out invalid page names', () => {
    expect(validateEventPages(['dashboard', 'bogus', 'teams'])).toEqual([
      'dashboard',
      'teams',
    ])
  })

  it('passes all valid pages through unchanged', () => {
    const all = [...EVENT_PAGES]
    expect(validateEventPages(all)).toEqual(all)
  })
})

describe('updateStaffCampAccess', () => {
  it('updates the event_access pages field with validated pages', async () => {
    updateSpy.mockClear()
    await updateStaffEventAccess('org1', 'uid1', 'camp1', ['dashboard', 'bogus', 'teams'])
    expect(updateSpy).toHaveBeenCalledWith({
      'event_access.camp1.pages': ['dashboard', 'teams'],
    })
  })
})

describe('updateStaffDepartmentAccess', () => {
  it('updates the department_access pages field with validated pages', async () => {
    updateSpy.mockClear()
    await updateStaffDepartmentAccess('org1', 'uid1', 'dept1', ['dashboard', 'bogus', 'teams'])
    expect(updateSpy).toHaveBeenCalledWith({
      'department_access.dept1.pages': ['dashboard', 'teams'],
    })
  })
})
