import { describe, it, expect, vi, beforeEach } from 'vitest'

const getFamiliesSpy = vi.hoisted(() => vi.fn())
const getAssignmentsSpy = vi.hoisted(() => vi.fn())
const signedGroupGetSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const familiesCol = { get: getFamiliesSpy }
  const assignmentsCol = { get: getAssignmentsSpy }
  const campDoc = {
    collection: vi.fn().mockImplementation((sub: string) => {
      if (sub === 'families') return familiesCol
      if (sub === 'form_assignments') return assignmentsCol
      return { get: vi.fn() }
    }),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(campDoc) }) }) }),
      collectionGroup: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ get: signedGroupGetSpy }) }),
      }),
    },
  }
})

import { getFormSubmissionReport } from '@/actions/reports'

describe('getFormSubmissionReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getFamiliesSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'f1', first_name: 'Ann', last_name: 'Lee', email: 'ann@x.org', registration_status: 'confirmed' }) },
        { data: () => ({ id: 'f2', first_name: 'Bo', last_name: 'Ng', email: 'bo@x.org', registration_status: 'pending' }) },
        { data: () => ({ id: 'f3', first_name: 'Cy', last_name: 'Vo', email: 'cy@x.org', registration_status: 'cancelled' }) },
      ],
    })
    getAssignmentsSpy.mockResolvedValue({
      docs: [{ data: () => ({ id: 'a1', template_id: 't1', template_name: 'Waiver', template_version: 1, fields_snapshot: [], audience: 'registrant', required: true, created_at: 'x' }) }],
    })
    // only Ann (f1) signed a1. Signed docs live under families/{familyId}/signed_forms,
    // so the action reads family id from doc.ref.parent.parent.id (NOT a field).
    signedGroupGetSpy.mockResolvedValue({
      docs: [{ ref: { parent: { parent: { id: 'f1' } } }, data: () => ({ assignment_id: 'a1' }) }],
    })
  })

  it('excludes cancelled families and reports missing for the rest', async () => {
    const rows = await getFormSubmissionReport('org-1', 'camp-1')
    expect(rows).toHaveLength(1)
    expect(rows[0].total).toBe(2) // f1 + f2, not cancelled f3
    expect(rows[0].submitted_count).toBe(1)
    expect(rows[0].missing.map((m) => m.family_id)).toEqual(['f2'])
    expect(rows[0].missing[0].name).toBe('Bo Ng')
  })
})
