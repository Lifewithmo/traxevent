import { describe, it, expect, vi, beforeEach } from 'vitest'

const orgsWhereGetSpy = vi.hoisted(() => vi.fn())
// camps `.get()` keyed by org id; families `.get()` keyed by `${orgId}:${campId}`.
const campsGetByOrg = vi.hoisted(() => new Map<string, unknown>())
const familiesGetByKey = vi.hoisted(() => new Map<string, unknown>())

vi.mock('@/lib/firebase-admin', () => {
  // The orgs root collection is accessed two ways:
  //   .where('network_id','==',id).get()  -> the member-orgs list
  //   .doc(orgId).collection('camps')...  -> per-org camps/families reads
  const orgsCollection = {
    where: vi.fn().mockReturnValue({ get: orgsWhereGetSpy }),
    doc: vi.fn((orgId: string) => ({
      collection: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          get: vi.fn().mockImplementation(() => Promise.resolve(campsGetByOrg.get(orgId) ?? { docs: [] })),
        }),
        doc: vi.fn((campId: string) => ({
          collection: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(() =>
              Promise.resolve(familiesGetByKey.get(`${orgId}:${campId}`) ?? { docs: [] })
            ),
          }),
        })),
      }),
    })),
  }
  return {
    adminDb: {
      collection: vi.fn((name: string) => {
        if (name === 'orgs') return orgsCollection
        throw new Error(`unexpected collection ${name}`)
      }),
    },
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertNetworkAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
  assertNetworkMember: vi.fn().mockResolvedValue({ uid: 'admin-uid', role: 'admin' }),
}))

import { getNetworkReportData } from '@/actions/reports'

const orgDoc = (id: string, name: string) => ({ id, data: () => ({ name }) })
const camp = (id: string) => ({
  data: () => ({ id, name: `Camp ${id}`, year: 2026, status: 'active' }),
})
const fam = (status: string, due: number, paid: number, payment: string) => ({
  data: () => ({ registration_status: status, payment_status: payment, amount_due: due, amount_paid: paid }),
})

describe('getNetworkReportData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    campsGetByOrg.clear()
    familiesGetByKey.clear()
  })

  it('aggregates camps/registrants across all member orgs', async () => {
    orgsWhereGetSpy.mockResolvedValue({ docs: [orgDoc('o1', 'Org 1'), orgDoc('o2', 'Org 2')] })

    campsGetByOrg.set('o1', { docs: [camp('c1')] })
    campsGetByOrg.set('o2', { docs: [camp('c2'), camp('c3')] })

    familiesGetByKey.set('o1:c1', { docs: [fam('confirmed', 100, 100, 'paid'), fam('cancelled', 100, 0, 'unpaid')] })
    familiesGetByKey.set('o2:c2', { docs: [fam('pending', 50, 0, 'unpaid')] })
    familiesGetByKey.set('o2:c3', { docs: [fam('confirmed', 80, 40, 'partial'), fam('confirmed', 20, 20, 'paid')] })

    const report = await getNetworkReportData('net-1')

    expect(report.totals.orgs).toBe(2)
    expect(report.orgs).toHaveLength(2)
    // o1: 1 active registrant; o2: 1 + 2 = 3 active registrants -> 4 total
    expect(report.totals.registrants).toBe(4)
    expect(report.totals.camps).toBe(3)
    expect(report.orgs.find((o) => o.org_id === 'o1')?.report.totals.registrants).toBe(1)
    expect(report.orgs.find((o) => o.org_id === 'o2')?.report.totals.registrants).toBe(3)
  })
})
