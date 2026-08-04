import { describe, it, expect, vi, beforeEach } from 'vitest'

const listEventsGetSpy = vi.hoisted(() => vi.fn())
const familiesGetSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const familiesCol = { get: familiesGetSpy }
  const eventDoc = { collection: vi.fn().mockReturnValue(familiesCol) }
  const eventsCol = {
    orderBy: vi.fn().mockReturnValue({ get: listEventsGetSpy }),
    doc: vi.fn().mockReturnValue(eventDoc),
  }
  const orgDoc = { collection: vi.fn().mockReturnValue(eventsCol) }
  return {
    adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }) },
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
  assertEventPage: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
}))

import { getOrgReportData } from '@/actions/reports'

const event = (id: string, department_id?: string) => ({
  data: () => ({ id, name: `Camp ${id}`, year: 2026, status: 'active', slug: id, registration_type: 'family', event_type_id: 'event', features: {}, event_start: '', event_end: '', created_at: 'x', ...(department_id ? { department_id } : {}) }),
})
const fam = (status: string, due: number, paid: number, payment: string) => ({
  data: () => ({ registration_status: status, payment_status: payment, amount_due: due, amount_paid: paid }),
})

describe('getOrgReportData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('aggregates active families across all camps and excludes cancelled', async () => {
    listEventsGetSpy.mockResolvedValue({ docs: [event('c1', 'd1'), event('c2')] })
    familiesGetSpy
      .mockResolvedValueOnce({ docs: [fam('confirmed', 100, 100, 'paid'), fam('cancelled', 100, 0, 'unpaid')] })
      .mockResolvedValueOnce({ docs: [fam('pending', 50, 0, 'unpaid')] })
    const report = await getOrgReportData('org-1')
    expect(report.rows).toHaveLength(2)
    expect(report.totals.events).toBe(2)
    expect(report.totals.registrants).toBe(2)
    expect(report.totals.outstanding).toBe(50)
  })

  it('filters to a single department when departmentId is given', async () => {
    listEventsGetSpy.mockResolvedValue({ docs: [event('c1', 'd1'), event('c2', 'd2')] })
    familiesGetSpy.mockResolvedValue({ docs: [fam('confirmed', 100, 100, 'paid')] })
    const report = await getOrgReportData('org-1', 'd1')
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0].event_id).toBe('c1')
  })
})
