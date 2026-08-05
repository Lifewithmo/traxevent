import { describe, it, expect, vi, beforeEach } from 'vitest'

const userSetMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    getUser: vi.fn().mockResolvedValue({ customClaims: { orgId: 'o1', orgSlug: 'org', role: 'owner' } }),
  },
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: userSetMock,
  },
}))

import { setOrgClaims, createUser } from '@/actions/auth'
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

describe('createUser', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates the user doc without a brand_id when none is given', async () => {
    await createUser('uid-1', 'a@x.com', 'Ada')

    expect(userSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@x.com', display_name: 'Ada' })
    )
    expect(userSetMock.mock.calls[0][0]).not.toHaveProperty('brand_id')
  })

  it('stamps brand_id when a valid brand is given', async () => {
    await createUser('uid-1', 'a@x.com', 'Ada', 'brewtrax')

    expect(userSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ brand_id: 'brewtrax' })
    )
  })

  it('does not stamp brand_id for an unknown or default brand', async () => {
    await createUser('uid-1', 'a@x.com', 'Ada', 'evilcorp')
    expect(userSetMock.mock.calls[0][0]).not.toHaveProperty('brand_id')

    userSetMock.mockClear()
    await createUser('uid-1', 'a@x.com', 'Ada', 'traxevent')
    expect(userSetMock.mock.calls[0][0]).not.toHaveProperty('brand_id')
  })
})
