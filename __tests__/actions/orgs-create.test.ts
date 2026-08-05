import { describe, it, expect, vi, beforeEach } from 'vitest'

// The brief's mock shape (adminDb.collection().doc() returning a flat object
// with its own `.collection`) fights the real call chain in actions/orgs.ts,
// which does adminDb.collection('orgs').doc(orgId).collection('members').doc(uid).set(...)
// for the member doc. Mirror the nested mock style from orgs-industry.test.ts instead —
// what matters is the returned Org object's fields, which reflect exactly what
// was passed to orgRef.set(org).
const orgSetMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const memberSetMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { setCustomUserClaims: vi.fn().mockResolvedValue(undefined) },
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        id: 'org123',
        set: orgSetMock,
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({ set: memberSetMock }),
        }),
      }),
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
})

describe('createOrg brand stamping', () => {
  it('stamps brand_id and the brand industry pack for a known brand', async () => {
    const org = await createOrg('uid1', 'Bean Scene', 'Ryan', 'r@x.com', 'brewtrax')
    expect(org.brand_id).toBe('brewtrax')
    expect(org.industry_pack_id).toBe('coffee-cart')
  })

  it('creates an identical-to-today org when no brand is given', async () => {
    const org = await createOrg('uid1', 'Bean Scene', 'Ryan', 'r@x.com')
    expect(org).not.toHaveProperty('brand_id')
    expect(org).not.toHaveProperty('industry_pack_id')
  })

  it('ignores unknown brand ids', async () => {
    const org = await createOrg('uid1', 'Bean Scene', 'Ryan', 'r@x.com', 'evilcorp')
    expect(org).not.toHaveProperty('brand_id')
    expect(org).not.toHaveProperty('industry_pack_id')
  })
})
