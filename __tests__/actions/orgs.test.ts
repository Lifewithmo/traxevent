import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { setCustomUserClaims: vi.fn().mockResolvedValue(undefined) },
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn(),
  },
}))

vi.mock('@/actions/auth', () => ({
  setOrgClaims: vi.fn().mockResolvedValue(undefined),
}))

import { slugify } from '@/actions/orgs'

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('First Hills Fellowship')).toBe('first-hills-fellowship')
  })

  it('strips special characters', () => {
    expect(slugify("St. Mary's Church")).toBe('st-marys-church')
  })

  it('collapses multiple spaces/hyphens', () => {
    expect(slugify('A  B')).toBe('a-b')
  })
})
