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

import { buildCampSlug } from '@/lib/slug'
import { createCamp } from '@/actions/camps'

describe('buildCampSlug', () => {
  it('appends the year to the name slug', () => {
    expect(buildCampSlug('Family Camp', 2026)).toBe('family-camp-2026')
  })

  it('handles special characters', () => {
    expect(buildCampSlug("Women's Retreat", 2026)).toBe('womens-retreat-2026')
  })
})

describe('createCamp — event_type_id', () => {
  it('stores event_type_id when provided', async () => {
    const camp = await createCamp('org-1', {
      name: 'Summer Camp',
      year: 2026,
      registration_type: 'family',
      event_type_id: 'gala',
      camp_start: '2026-06-01',
      camp_end: '2026-06-07',
    })
    expect(camp.event_type_id).toBe('gala')
  })

  it('defaults event_type_id to summer-camp when omitted', async () => {
    const camp = await createCamp('org-1', {
      name: 'Summer Camp',
      year: 2026,
      registration_type: 'family',
      camp_start: '2026-06-01',
      camp_end: '2026-06-07',
    })
    expect(camp.event_type_id).toBe('summer-camp')
  })
})
