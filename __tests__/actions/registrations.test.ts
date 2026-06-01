import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    collectionGroup: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    id: 'family-id-123',
  },
}))

vi.mock('@/actions/access-tokens', () => ({
  attachAccessToken: vi.fn().mockResolvedValue('tok-abc123'),
}))

vi.mock('@/lib/email', () => ({
  sendRegistrationConfirmation: vi.fn().mockResolvedValue(undefined),
}))

import { buildFamilyId } from '@/lib/tokens'

describe('buildFamilyId', () => {
  it('returns a non-empty string', () => {
    const id = buildFamilyId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})
