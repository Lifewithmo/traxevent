import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ exists: false }),
  },
}))

import { buildEmptyProfile } from '@/actions/registrant-auth'

describe('buildEmptyProfile', () => {
  it('returns a profile with the given uid and email', () => {
    const profile = buildEmptyProfile('uid-123', 'test@example.com', 'Jane Doe')
    expect(profile.uid).toBe('uid-123')
    expect(profile.email).toBe('test@example.com')
    expect(profile.display_name).toBe('Jane Doe')
    expect(profile.saved_members).toEqual([])
  })
})
