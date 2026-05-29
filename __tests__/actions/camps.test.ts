import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    id: 'camp-id-123',
    orderBy: vi.fn().mockReturnThis(),
    get: vi.fn(),
  },
}))

import { buildCampSlug } from '@/actions/camps'

describe('buildCampSlug', () => {
  it('appends the year to the name slug', () => {
    expect(buildCampSlug('Family Camp', 2026)).toBe('family-camp-2026')
  })

  it('handles special characters', () => {
    expect(buildCampSlug("Women's Retreat", 2026)).toBe('womens-retreat-2026')
  })
})
