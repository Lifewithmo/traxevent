import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { setCustomUserClaims: vi.fn().mockResolvedValue(undefined) },
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
  },
}))

import { setOrgClaims } from '@/actions/auth'
import { adminAuth } from '@/lib/firebase-admin'

describe('setOrgClaims', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets orgId, orgSlug, and role on the user token', async () => {
    await setOrgClaims('uid-123', 'org-abc', 'first-hills', 'admin')

    expect(adminAuth.setCustomUserClaims).toHaveBeenCalledWith('uid-123', {
      orgId: 'org-abc',
      orgSlug: 'first-hills',
      role: 'admin',
    })
  })
})
