import { describe, it, expect, vi, beforeEach } from 'vitest'

const orgDocSpy = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue(orgDocSpy),
    }),
  },
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
}))

// orgs.ts imports setOrgClaims from '@/actions/auth'; stub it so the module graph
// does not pull real auth/firebase during import.
vi.mock('@/actions/auth', () => ({ setOrgClaims: vi.fn().mockResolvedValue(undefined) }))

import { setOrgIndustry } from '@/actions/orgs'

describe('setOrgIndustry', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes a valid pack id onto the org doc', async () => {
    await setOrgIndustry('org-1', 'coffee-cart')
    expect(orgDocSpy.update).toHaveBeenCalledWith({ industry_pack_id: 'coffee-cart' })
  })

  it('rejects an unknown pack id and does not write', async () => {
    await expect(setOrgIndustry('org-1', 'nope')).rejects.toThrow('Unknown industry pack')
    expect(orgDocSpy.update).not.toHaveBeenCalled()
  })
})
