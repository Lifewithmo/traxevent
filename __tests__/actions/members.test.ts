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
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertCampPage: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
}))

import { buildInviteToken, validateCampPages } from '@/lib/tokens'
import { CAMP_PAGES } from '@/lib/types'

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
    expect(validateCampPages(['dashboard', 'bogus', 'teams'])).toEqual([
      'dashboard',
      'teams',
    ])
  })

  it('passes all valid pages through unchanged', () => {
    const all = [...CAMP_PAGES]
    expect(validateCampPages(all)).toEqual(all)
  })
})
