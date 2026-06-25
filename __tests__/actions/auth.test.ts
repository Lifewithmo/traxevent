import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    getUser: vi.fn().mockResolvedValue({ customClaims: { orgId: 'o1', orgSlug: 'org', role: 'owner' } }),
  },
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
  },
}))

import { setOrgClaims, setNetworkClaims } from '@/actions/auth'
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

describe('setNetworkClaims (merge)', () => {
  it('adds network claims without clobbering existing org claims', async () => {
    await setNetworkClaims('uid-1', 'net-1', 'first-network')
    expect(adminAuth.setCustomUserClaims).toHaveBeenCalledWith('uid-1', {
      orgId: 'o1', orgSlug: 'org', role: 'owner',
      networkId: 'net-1', networkSlug: 'first-network', networkRole: 'admin',
    })
  })
})
