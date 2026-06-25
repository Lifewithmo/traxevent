import { describe, it, expect, vi, beforeEach } from 'vitest'

const listCampsGetSpy = vi.hoisted(() => vi.fn())
const familiesGetSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertCampPage: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
}))
vi.mock('@/lib/firebase-admin', () => {
  const familiesCol = { get: familiesGetSpy }
  const campDoc = { collection: vi.fn().mockReturnValue(familiesCol) }
  const campsCol = { orderBy: vi.fn().mockReturnValue({ get: listCampsGetSpy }), doc: vi.fn().mockReturnValue(campDoc) }
  const orgDoc = { collection: vi.fn().mockReturnValue(campsCol) }
  return { adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }) } }
})

import { getOrgHouseholds } from '@/actions/households'

const camp = (id: string, year: number) => ({ data: () => ({ id, name: `Camp ${id}`, year, slug: id, registration_type: 'family', event_type_id: 'summer-camp', features: {}, camp_start: '', camp_end: '', created_at: 'x' }) })
const fam = (email: string, first: string, status: string) => ({ data: () => ({ id: 'f', email, first_name: first, last_name: 'L', phone: '5', registrant_uid: null, created_at: '2026-01-01', registration_status: status, payment_status: 'paid' }) })

describe('getOrgHouseholds', () => {
  beforeEach(() => vi.clearAllMocks())

  it('aggregates families across camps into deduped households', async () => {
    listCampsGetSpy.mockResolvedValue({ docs: [camp('c1', 2025), camp('c2', 2026)] })
    familiesGetSpy
      .mockResolvedValueOnce({ docs: [fam('ann@x.org', 'Ann', 'confirmed')] })
      .mockResolvedValueOnce({ docs: [fam('ann@x.org', 'Ann', 'confirmed'), fam('bo@x.org', 'Bo', 'pending')] })
    const households = await getOrgHouseholds('org-1')
    expect(households).toHaveLength(2)
    const ann = households.find((h) => h.email === 'ann@x.org')!
    expect(ann.event_count).toBe(2)
  })
})
