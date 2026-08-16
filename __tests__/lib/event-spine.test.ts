import { describe, it, expect, vi, beforeEach } from 'vitest'

const familiesGet = vi.hoisted(() => vi.fn())
const familiesOrderBy = vi.hoisted(() => vi.fn(() => ({ get: familiesGet })))
const planGet = vi.hoisted(() => vi.fn())
// orgs/{o}/events/{e}/{families|ops} — the leaf collection call branches on name:
// 'families' gets the orderBy query stub, anything else the ops plan doc stub.
const leafCollection = vi.hoisted(() =>
  vi.fn((name: string) =>
    name === 'families'
      ? { orderBy: familiesOrderBy }
      : { doc: vi.fn(() => ({ get: planGet })) }
  )
)

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({ collection: leafCollection }),
        }),
      }),
    }),
  },
}))

import { getEventSpineKpis } from '@/lib/event-spine'
import type { EventPage } from '@/lib/types'

const EVENT = { event_start: '2099-09-12' }
const ALL_PAGES: EventPage[] = ['dashboard', 'families', 'ops', 'reports']

const FAMILY_DOCS = [
  { registration_status: 'confirmed', payment_status: 'paid', amount_due: 500, amount_paid: 500, created_at: '2026-08-01T00:00:00.000Z' },
  { registration_status: 'confirmed', payment_status: 'partial', amount_due: 400, amount_paid: 100, created_at: '2026-08-02T00:00:00.000Z' },
  { registration_status: 'pending', payment_status: 'unpaid', amount_due: 300, amount_paid: 0, created_at: '2026-08-03T00:00:00.000Z' },
].map((data, i) => ({ id: `fam-${i}`, data: () => data }))

// flags: deadlines [true, false] + shopping [true] + packing [false] +
// checklist steps [false] → done 2 / total 5 → 40%; no overdue (d2 is future).
const PLAN = {
  deadlines: [
    { id: 'd1', due: '2020-01-01', done: true },
    { id: 'd2', due: '2099-01-01', done: false },
  ],
  shopping_list: [{ resource_id: 'r1', checked: true }],
  packing_list: [{ resource_id: 'r2', checked: false }],
  checklists: [{ id: 'c1', steps: [{ text: 'x', done: false }] }],
}

beforeEach(() => {
  vi.clearAllMocks()
  familiesGet.mockResolvedValue({ docs: FAMILY_DOCS })
  planGet.mockResolvedValue({ exists: true, data: () => PLAN })
})

describe('getEventSpineKpis', () => {
  it('aggregates registrations, financials, and readiness when everything is readable', async () => {
    const kpis = await getEventSpineKpis({ orgId: 'o1', eventId: 'e1', event: EVENT, allowedPages: ALL_PAGES })

    expect(kpis.registrations).toMatchObject({
      total: 3,
      byStatus: { confirmed: 2, pending: 1 },
    })
    expect(kpis.financial).toMatchObject({ totalDue: 1200, totalPaid: 600, outstanding: 600 })
    expect(kpis.readiness).toMatchObject({ done: 2, total: 5, pct: 40, overdue: 0 })
    // Mirrors the getAdminFamilies query shape exactly.
    expect(familiesOrderBy).toHaveBeenCalledWith('created_at', 'desc')
  })

  it('skips the families read entirely when neither families nor reports is an allowed page', async () => {
    const kpis = await getEventSpineKpis({ orgId: 'o1', eventId: 'e1', event: EVENT, allowedPages: ['dashboard', 'ops'] })

    expect(kpis.registrations).toBeNull()
    expect(kpis.financial).toBeNull()
    expect(familiesGet).not.toHaveBeenCalled()
    // Ops is still allowed, so readiness survives the gate.
    expect(kpis.readiness).toMatchObject({ pct: 40 })
  })

  it('allows the families read on a reports-only grant — Reports shows the same figures', async () => {
    const kpis = await getEventSpineKpis({ orgId: 'o1', eventId: 'e1', event: EVENT, allowedPages: ['dashboard', 'reports'] })

    expect(kpis.registrations).toMatchObject({ total: 3, byStatus: { confirmed: 2, pending: 1 } })
    expect(kpis.financial).toMatchObject({ totalDue: 1200, totalPaid: 600, outstanding: 600 })
    // Ops stays gated off for this member.
    expect(kpis.readiness).toBeNull()
    expect(planGet).not.toHaveBeenCalled()
  })

  it('skips the ops read when ops is not an allowed page', async () => {
    const kpis = await getEventSpineKpis({ orgId: 'o1', eventId: 'e1', event: EVENT, allowedPages: ['dashboard', 'families'] })

    expect(kpis.readiness).toBeNull()
    expect(planGet).not.toHaveBeenCalled()
    expect(kpis.registrations).toMatchObject({ total: 3 })
  })

  it('yields readiness = null when the event has no ops plan yet', async () => {
    planGet.mockResolvedValue({ exists: false })
    const kpis = await getEventSpineKpis({ orgId: 'o1', eventId: 'e1', event: EVENT, allowedPages: ALL_PAGES })

    expect(kpis.readiness).toBeNull()
    expect(kpis.registrations).toMatchObject({ total: 3 })
    expect(kpis.financial).toMatchObject({ outstanding: 600 })
  })

  it('swallows a throwing families read — that section is null, nothing throws', async () => {
    familiesGet.mockRejectedValue(new Error('firestore unavailable'))
    const kpis = await getEventSpineKpis({ orgId: 'o1', eventId: 'e1', event: EVENT, allowedPages: ALL_PAGES })

    expect(kpis.registrations).toBeNull()
    expect(kpis.financial).toBeNull()
    expect(kpis.readiness).toMatchObject({ pct: 40 })
  })

  it('swallows a throwing ops read independently of the families section', async () => {
    planGet.mockRejectedValue(new Error('firestore unavailable'))
    const kpis = await getEventSpineKpis({ orgId: 'o1', eventId: 'e1', event: EVENT, allowedPages: ALL_PAGES })

    expect(kpis.readiness).toBeNull()
    expect(kpis.registrations).toMatchObject({ total: 3 })
  })
})
