import { describe, it, expect, vi, beforeEach } from 'vitest'

// The brief's mock shape (adminDb.collection().doc() returning a flat object
// with its own `.collection`) fights the real call chain in actions/orgs.ts,
// which does adminDb.collection('orgs').doc(orgId).collection('members').doc(uid).set(...)
// for the member doc. Mirror the nested mock style from orgs-industry.test.ts instead —
// what matters is the returned Org object's fields, which reflect exactly what
// was passed to orgRef.set(org).
//
// createOrg also reads adminDb.collection('users').doc(uid).get() as a fallback
// when no explicit brandId param is given, so the mock branches on collection name.
const orgSetMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const memberSetMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const userGetMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ exists: false, data: () => undefined })
)

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { setCustomUserClaims: vi.fn().mockResolvedValue(undefined) },
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'users') {
        return { doc: vi.fn().mockReturnValue({ get: userGetMock }) }
      }
      return {
        doc: vi.fn().mockReturnValue({
          id: 'org123',
          set: orgSetMock,
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({ set: memberSetMock }),
          }),
        }),
      }
    }),
  },
}))

vi.mock('@/actions/auth', () => ({
  setOrgClaims: vi.fn().mockResolvedValue(undefined),
}))

import { createOrg } from '@/actions/orgs'

beforeEach(() => {
  orgSetMock.mockClear()
  memberSetMock.mockClear()
  userGetMock.mockReset().mockResolvedValue({ exists: false, data: () => undefined })
})

describe('createOrg brand stamping', () => {
  it('stamps brand_id and the brand industry pack for a known brand', async () => {
    const org = await createOrg('uid1', 'Bean Scene', 'Ryan', 'r@x.com', 'brewtrax')
    expect(org.brand_id).toBe('brewtrax')
    expect(org.industry_pack_id).toBe('coffee-cart')
  })

  it('creates an identical-to-today org when no brand is given anywhere', async () => {
    const org = await createOrg('uid1', 'Bean Scene', 'Ryan', 'r@x.com')
    expect(org).not.toHaveProperty('brand_id')
    expect(org).not.toHaveProperty('industry_pack_id')
  })

  it('ignores unknown brand ids passed explicitly', async () => {
    const org = await createOrg('uid1', 'Bean Scene', 'Ryan', 'r@x.com', 'evilcorp')
    expect(org).not.toHaveProperty('brand_id')
    expect(org).not.toHaveProperty('industry_pack_id')
  })

  it('explicit brandId param wins over a stored user-doc brand_id', async () => {
    userGetMock.mockResolvedValue({ exists: true, data: () => ({ brand_id: 'traxevent-other' }) })
    const org = await createOrg('uid1', 'Bean Scene', 'Ryan', 'r@x.com', 'brewtrax')
    expect(org.brand_id).toBe('brewtrax')
  })

  it('falls back to the brand_id stamped on the user doc when no param is given', async () => {
    userGetMock.mockResolvedValue({ exists: true, data: () => ({ brand_id: 'brewtrax' }) })
    const org = await createOrg('uid1', 'Bean Scene', 'Ryan', 'r@x.com')
    expect(org.brand_id).toBe('brewtrax')
    expect(org.industry_pack_id).toBe('coffee-cart')
  })

  it('validates the stored fallback too — an unknown stored brand_id stamps nothing', async () => {
    userGetMock.mockResolvedValue({ exists: true, data: () => ({ brand_id: 'evilcorp' }) })
    const org = await createOrg('uid1', 'Bean Scene', 'Ryan', 'r@x.com')
    expect(org).not.toHaveProperty('brand_id')
    expect(org).not.toHaveProperty('industry_pack_id')
  })

  it('no brand anywhere (no param, no user doc, no stored brand_id) stamps nothing', async () => {
    userGetMock.mockResolvedValue({ exists: false, data: () => undefined })
    const org = await createOrg('uid1', 'Bean Scene', 'Ryan', 'r@x.com')
    expect(org).not.toHaveProperty('brand_id')
    expect(org).not.toHaveProperty('industry_pack_id')
  })
})
