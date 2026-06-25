import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCurrentUserSpy = vi.hoisted(() => vi.fn())
const getProfileSpy = vi.hoisted(() => vi.fn())
const groupGetSpy = vi.hoisted(() => vi.fn())
const famGetSpy = vi.hoisted(() => vi.fn())
const famUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: getCurrentUserSpy }))
vi.mock('@/actions/registrant-auth', () => ({ getRegistrantProfile: getProfileSpy }))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ get: groupGetSpy }) }),
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockReturnValue({
              doc: vi.fn().mockReturnValue({ get: famGetSpy, update: famUpdateSpy }),
            }),
          }),
        }),
      }),
    }),
  },
}))

import { getClaimableRegistrations, claimRegistration } from '@/actions/registrations'

describe('getClaimableRegistrations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns only unclaimed families matching the caller profile email', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1' })
    getProfileSpy.mockResolvedValue({ uid: 'u1', email: 'ann@x.org' })
    groupGetSpy.mockResolvedValue({ docs: [
      { data: () => ({ id: 'f1', email: 'ann@x.org', registrant_uid: null, created_at: '2026-01-02' }) },
      { data: () => ({ id: 'f2', email: 'ann@x.org', registrant_uid: 'someone', created_at: '2026-01-01' }) },
    ] })
    const out = await getClaimableRegistrations()
    expect(out.map((f) => f.id)).toEqual(['f1'])
  })

  it('returns [] when not logged in', async () => {
    getCurrentUserSpy.mockResolvedValue(null)
    expect(await getClaimableRegistrations()).toEqual([])
  })

  it('returns [] when the profile has no email', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1' })
    getProfileSpy.mockResolvedValue({ uid: 'u1', email: '' })
    expect(await getClaimableRegistrations()).toEqual([])
  })
})

describe('claimRegistration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('links an unclaimed family whose email matches the caller', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1' })
    getProfileSpy.mockResolvedValue({ email: 'Ann@x.org' })
    famGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'f1', email: 'ann@x.org ', registrant_uid: null }) })
    await claimRegistration('o', 'c', 'f1')
    expect(famUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ registrant_uid: 'u1' }))
  })

  it('refuses to claim an already-claimed family', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1' })
    getProfileSpy.mockResolvedValue({ email: 'ann@x.org' })
    famGetSpy.mockResolvedValue({ exists: true, data: () => ({ email: 'ann@x.org', registrant_uid: 'other' }) })
    await expect(claimRegistration('o', 'c', 'f1')).rejects.toThrow('Forbidden')
    expect(famUpdateSpy).not.toHaveBeenCalled()
  })

  it('refuses to claim a family with a different email', async () => {
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1' })
    getProfileSpy.mockResolvedValue({ email: 'ann@x.org' })
    famGetSpy.mockResolvedValue({ exists: true, data: () => ({ email: 'bob@x.org', registrant_uid: null }) })
    await expect(claimRegistration('o', 'c', 'f1')).rejects.toThrow('Forbidden')
    expect(famUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws Unauthorized when not logged in', async () => {
    getCurrentUserSpy.mockResolvedValue(null)
    await expect(claimRegistration('o', 'c', 'f1')).rejects.toThrow('Unauthorized')
  })
})
