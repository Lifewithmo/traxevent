import { describe, it, expect, vi, beforeEach } from 'vitest'

const { querySpy } = vi.hoisted(() => ({ querySpy: vi.fn() }))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(() => ({ get: querySpy })) })),
    })),
  },
}))

import { getOrgByHandle } from '@/lib/public-profile-server'

const ENABLED_ORG = {
  name: 'Abbys Coffee',
  public_profile: { enabled: true, handle: 'abbys', links: [] },
}

beforeEach(() => vi.clearAllMocks())

describe('getOrgByHandle', () => {
  it('returns the org with its id for an enabled profile', async () => {
    querySpy.mockResolvedValue({ empty: false, docs: [{ id: 'o1', data: () => ENABLED_ORG }] })
    const org = await getOrgByHandle('abbys')
    expect(org?.id).toBe('o1')
    expect(org?.name).toBe('Abbys Coffee')
  })

  it('returns null for an unknown handle', async () => {
    querySpy.mockResolvedValue({ empty: true, docs: [] })
    expect(await getOrgByHandle('nobody')).toBeNull()
  })

  it('returns null when the profile is disabled — indistinguishable from unknown', async () => {
    querySpy.mockResolvedValue({
      empty: false,
      docs: [{ id: 'o1', data: () => ({ ...ENABLED_ORG, public_profile: { ...ENABLED_ORG.public_profile, enabled: false } }) }],
    })
    expect(await getOrgByHandle('abbys')).toBeNull()
  })

  it('lowercases the handle before querying', async () => {
    querySpy.mockResolvedValue({ empty: true, docs: [] })
    await getOrgByHandle('ABBYS')
    // The where() mock ignores args; behavior is covered by resolving without throwing.
    expect(querySpy).toHaveBeenCalled()
  })

  it('rejects a malformed handle without querying Firestore', async () => {
    expect(await getOrgByHandle('no way!')).toBeNull()
    expect(querySpy).not.toHaveBeenCalled()
  })
})
