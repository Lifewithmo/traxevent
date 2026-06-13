import { describe, it, expect, vi, beforeEach } from 'vitest'

const getFamiliesSpy = vi.hoisted(() => vi.fn())
const getMembersSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((col: string) => {
      if (col === 'orgs') {
        return {
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockImplementation((sub: string) => {
              if (sub === 'camps') {
                return {
                  doc: vi.fn().mockReturnValue({
                    collection: vi.fn().mockImplementation((sub2: string) => {
                      if (sub2 === 'families') {
                        return {
                          orderBy: vi.fn().mockReturnValue({ get: getFamiliesSpy }),
                          doc: vi.fn().mockReturnValue({
                            collection: vi.fn().mockReturnValue({ get: getMembersSpy }),
                          }),
                        }
                      }
                      return {}
                    }),
                  }),
                }
              }
              return {}
            }),
          }),
        }
      }
      return {}
    }),
  },
}))

import { getEventReportData, buildCustomReportCsv } from '@/actions/reports'

function familyDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => ({ id, ...data }) }
}
function memberDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => ({ id, ...data }) }
}

const baseFamily = {
  last_name: 'Smith', first_name: 'Jane', email: 'jane@example.com', phone: '555',
  registration_status: 'confirmed', payment_status: 'paid', amount_due: 100, amount_paid: 100,
  created_at: '2026-01-01T00:00:00.000Z',
}
const baseMember = {
  family_id: 'fam-1', first_name: 'Ann', last_name: 'Smith', birth_year: 2015,
  gender: 'F', grade: '4', allergies: 'Peanuts', dietary_restrictions: '', tshirt_size: 'M', medical_notes: '',
}

describe('getEventReportData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns aggregated reports for the event', async () => {
    getFamiliesSpy.mockResolvedValue({ docs: [familyDoc('fam-1', baseFamily)] })
    getMembersSpy.mockResolvedValue({ docs: [memberDoc('m-1', baseMember)] })

    const data = await getEventReportData('org-1', 'camp-1')

    expect(data.summary.total).toBe(1)
    expect(data.summary.byStatus).toEqual({ confirmed: 1 })
    expect(data.financial.totalPaid).toBe(100)
    expect(data.dietary).toHaveLength(1)
    expect(data.dietary[0].name).toBe('Ann Smith')
    expect(data.tshirt.bySize).toEqual({ M: 1 })
    expect(data.medical).toHaveLength(0)
  })

  it('tolerates member docs missing optional string fields', async () => {
    getFamiliesSpy.mockResolvedValue({ docs: [familyDoc('fam-1', baseFamily)] })
    // member doc with ONLY first_name/last_name/family_id — no allergies/medical/tshirt/etc.
    getMembersSpy.mockResolvedValue({
      docs: [{ id: 'm-1', data: () => ({ id: 'm-1', family_id: 'fam-1', first_name: 'Ann', last_name: 'Smith' }) }],
    })

    const data = await getEventReportData('org-1', 'camp-1')
    // Should not throw; member has no allergies/medical/tshirt so those reports are empty
    expect(data.dietary).toHaveLength(0)
    expect(data.medical).toHaveLength(0)
    expect(data.tshirt.total).toBe(0)
  })
})

describe('buildCustomReportCsv', () => {
  beforeEach(() => vi.clearAllMocks())

  it('builds a CSV with one row per member for selected fields', async () => {
    getFamiliesSpy.mockResolvedValue({ docs: [familyDoc('fam-1', baseFamily)] })
    getMembersSpy.mockResolvedValue({ docs: [memberDoc('m-1', baseMember)] })

    const csv = await buildCustomReportCsv('org-1', 'camp-1', ['member_first_name', 'tshirt_size'])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('"member_first_name","tshirt_size"')
    expect(lines[1]).toBe('"Ann","M"')
  })

  it('excludes members of cancelled families', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: [
        familyDoc('fam-1', baseFamily),
        familyDoc('fam-2', { ...baseFamily, registration_status: 'cancelled' }),
      ],
    })
    getMembersSpy.mockResolvedValue({ docs: [memberDoc('m-1', baseMember)] })

    const csv = await buildCustomReportCsv('org-1', 'camp-1', ['member_first_name'])
    expect(csv.split('\n')).toHaveLength(2)
    expect(getMembersSpy).toHaveBeenCalledTimes(1)
  })
})
