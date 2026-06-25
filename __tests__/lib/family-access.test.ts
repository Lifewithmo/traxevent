import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCurrentUserSpy = vi.hoisted(() => vi.fn())
const famGetSpy = vi.hoisted(() => vi.fn())
const memberGetSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: getCurrentUserSpy }))
vi.mock('@/lib/firebase-admin', () => {
  // orgs/{orgId} → doc; .collection('camps').doc(campId).collection('families').doc(familyId).get() = famGetSpy
  //              ; .collection('members').doc(uid).get() = memberGetSpy
  const familiesChain = { doc: vi.fn().mockReturnValue({ get: famGetSpy }) }
  const campDoc = { collection: vi.fn().mockReturnValue(familiesChain) }
  const campsChain = { doc: vi.fn().mockReturnValue(campDoc) }
  const membersChain = { doc: vi.fn().mockReturnValue({ get: memberGetSpy }) }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => {
      if (sub === 'camps') return campsChain
      if (sub === 'members') return membersChain
      return { doc: vi.fn() }
    }),
  }
  return { adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }) } }
})

import { assertFamilyAccess } from '@/lib/auth/family-access'
import { canAccessCampPage } from '@/lib/auth/access' // real — pure

const FUTURE = '2099-01-01T00:00:00.000Z'
const PAST = '2000-01-01T00:00:00.000Z'
const fam = (o = {}) => ({ exists: true, data: () => ({ id: 'fam1', registrant_uid: null, access_token: null, access_token_expires_at: null, ...o }) })

describe('assertFamilyAccess', () => {
  beforeEach(() => { vi.clearAllMocks(); getCurrentUserSpy.mockResolvedValue(null) })

  it('throws Not found when the family does not exist', async () => {
    famGetSpy.mockResolvedValue({ exists: false })
    await expect(assertFamilyAccess('o', 'c', 'fam1', {})).rejects.toThrow('Not found')
  })
  it('allows a valid unexpired access token', async () => {
    famGetSpy.mockResolvedValue(fam({ access_token: 'tok', access_token_expires_at: FUTURE }))
    await expect(assertFamilyAccess('o', 'c', 'fam1', { token: 'tok' })).resolves.toBeTruthy()
  })
  it('rejects an expired token', async () => {
    famGetSpy.mockResolvedValue(fam({ access_token: 'tok', access_token_expires_at: PAST }))
    await expect(assertFamilyAccess('o', 'c', 'fam1', { token: 'tok' })).rejects.toThrow('Forbidden')
  })
  it('rejects a wrong token', async () => {
    famGetSpy.mockResolvedValue(fam({ access_token: 'tok', access_token_expires_at: FUTURE }))
    await expect(assertFamilyAccess('o', 'c', 'fam1', { token: 'nope' })).rejects.toThrow('Forbidden')
  })
  it('allows the logged-in owning registrant', async () => {
    famGetSpy.mockResolvedValue(fam({ registrant_uid: 'u1' }))
    getCurrentUserSpy.mockResolvedValue({ uid: 'u1' })
    await expect(assertFamilyAccess('o', 'c', 'fam1', {})).resolves.toBeTruthy()
  })
  it('denies a logged-in non-owner with no org membership', async () => {
    famGetSpy.mockResolvedValue(fam({ registrant_uid: 'other' }))
    getCurrentUserSpy.mockResolvedValue({ uid: 'u2' })
    await expect(assertFamilyAccess('o', 'c', 'fam1', {})).rejects.toThrow('Forbidden')
  })
  it('allows an org member with the camp-page grant', async () => {
    famGetSpy.mockResolvedValue(fam({ registrant_uid: 'other' }))
    getCurrentUserSpy.mockResolvedValue({ uid: 'admin1', orgId: 'o', role: 'admin' })
    memberGetSpy.mockResolvedValue({ exists: true, data: () => ({ uid: 'admin1', role: 'admin', camp_access: {} }) })
    await expect(assertFamilyAccess('o', 'c', 'fam1', { page: 'families' })).resolves.toBeTruthy()
  })
})
