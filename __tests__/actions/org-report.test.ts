import { describe, it, expect, vi, beforeEach } from 'vitest'

const listCampsGetSpy = vi.hoisted(() => vi.fn())
const familiesGetSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const familiesCol = { get: familiesGetSpy }
  const campDoc = { collection: vi.fn().mockReturnValue(familiesCol) }
  const campsCol = {
    orderBy: vi.fn().mockReturnValue({ get: listCampsGetSpy }),
    doc: vi.fn().mockReturnValue(campDoc),
  }
  const orgDoc = { collection: vi.fn().mockReturnValue(campsCol) }
  return {
    adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }) },
  }
})

import { getOrgReportData } from '@/actions/reports'

const camp = (id: string, department_id?: string) => ({
  data: () => ({ id, name: `Camp ${id}`, year: 2026, status: 'active', slug: id, registration_type: 'family', event_type_id: 'summer-camp', features: {}, camp_start: '', camp_end: '', created_at: 'x', ...(department_id ? { department_id } : {}) }),
})
const fam = (status: string, due: number, paid: number, payment: string) => ({
  data: () => ({ registration_status: status, payment_status: payment, amount_due: due, amount_paid: paid }),
})

describe('getOrgReportData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('aggregates active families across all camps and excludes cancelled', async () => {
    listCampsGetSpy.mockResolvedValue({ docs: [camp('c1', 'd1'), camp('c2')] })
    familiesGetSpy
      .mockResolvedValueOnce({ docs: [fam('confirmed', 100, 100, 'paid'), fam('cancelled', 100, 0, 'unpaid')] })
      .mockResolvedValueOnce({ docs: [fam('pending', 50, 0, 'unpaid')] })
    const report = await getOrgReportData('org-1')
    expect(report.rows).toHaveLength(2)
    expect(report.totals.camps).toBe(2)
    expect(report.totals.registrants).toBe(2)
    expect(report.totals.outstanding).toBe(50)
  })

  it('filters to a single department when departmentId is given', async () => {
    listCampsGetSpy.mockResolvedValue({ docs: [camp('c1', 'd1'), camp('c2', 'd2')] })
    familiesGetSpy.mockResolvedValue({ docs: [fam('confirmed', 100, 100, 'paid')] })
    const report = await getOrgReportData('org-1', 'd1')
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0].camp_id).toBe('c1')
  })
})
