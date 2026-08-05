import { describe, it, expect, vi, beforeEach } from 'vitest'

const closeoutSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const closeoutGetSpy = vi.hoisted(() => vi.fn())
const opsDocIdSpy = vi.hoisted(() => vi.fn())
const opsDoc = vi.hoisted(() => ({ set: closeoutSetSpy, get: closeoutGetSpy, update: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/firebase-admin', () => {
  const opsColl = { doc: vi.fn((id?: string) => { opsDocIdSpy(id); return opsDoc }) }
  const eventDoc = { collection: vi.fn(() => opsColl) }
  const eventsColl = { doc: vi.fn(() => eventDoc) }
  const orgDoc = { collection: vi.fn(() => eventsColl) }
  return { adminDb: { collection: vi.fn(() => ({ doc: vi.fn(() => orgDoc) })) } }
})
vi.mock('@/lib/ops/event-ops', () => ({ getOpsPlanCore: vi.fn() }))
vi.mock('@/lib/ops/work-packages', () => ({ getWorkPackagesByIdsCore: vi.fn() }))
vi.mock('@/lib/ops/resources', () => ({ listResourcesCore: vi.fn() }))

import { getOpsPlanCore } from '@/lib/ops/event-ops'
import { getWorkPackagesByIdsCore } from '@/lib/ops/work-packages'
import { listResourcesCore } from '@/lib/ops/resources'
import { saveActualsCore, closeoutSummaryCore, completeCloseoutCore } from '@/lib/ops/closeout'

const PLAN = {
  package_ids: ['wp1'], requirements: { guests: 100 },
  deadlines: [], shopping_list: [], packing_list: [], checklists: [],
  needs_review: false, change_log: [], created_at: 't',
}
const PKG = {
  id: 'wp1', name: 'Espresso Bar', price: 1200, created_at: 't',
  lines: [{ kind: 'consumable' as const, resource_id: 'res-beans', qty_per_guest: 1 }],
}
const RES = [{ id: 'res-beans', name: 'Beans', kind: 'consumable' as const, unit_cost: 0.55, created_at: 't' }]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getOpsPlanCore).mockResolvedValue(PLAN as never)
  vi.mocked(getWorkPackagesByIdsCore).mockResolvedValue([PKG])
  vi.mocked(listResourcesCore).mockResolvedValue(RES)
})

describe('saveActualsCore', () => {
  it('upserts actuals with merge semantics and stamps timestamps', async () => {
    closeoutGetSpy.mockResolvedValue({ exists: false })
    await saveActualsCore('o1', 'e1', { sales: 150, hours_worked: 6 })
    const [payload, opts] = closeoutSetSpy.mock.calls[0]
    expect(payload.actuals.sales).toBe(150)
    expect(payload.completed).toBe(false)
    expect(payload.created_at).toBeTruthy()
    expect(opts).toEqual({ merge: true })
    expect(opsDocIdSpy).toHaveBeenCalledWith('closeout')
  })

  it('preserves completed=true on later actual edits', async () => {
    closeoutGetSpy.mockResolvedValue({ exists: true, data: () => ({ actuals: {}, completed: true, created_at: 't' }) })
    await saveActualsCore('o1', 'e1', { sales: 200 })
    expect(closeoutSetSpy.mock.calls[0][0].completed).toBe(true)
  })

  it('rejects negative quantities', async () => {
    await expect(saveActualsCore('o1', 'e1', { sales: -1 })).rejects.toThrow('Quantities must be non-negative')
    await expect(saveActualsCore('o1', 'e1', { hours_worked: -2 })).rejects.toThrow('Quantities must be non-negative')
    await expect(saveActualsCore('o1', 'e1', { consumables: [{ resource_id: 'res-beans', qty_used: -5 }] }))
      .rejects.toThrow('Quantities must be non-negative')
  })
})

describe('closeoutSummaryCore', () => {
  it('combines plan, packages, resources, and recorded actuals', async () => {
    closeoutGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ actuals: { consumables: [{ resource_id: 'res-beans', qty_used: 90 }], sales: 150 }, completed: false, created_at: 't' }),
    })
    const summary = await closeoutSummaryCore('o1', 'e1')
    expect(summary.planned_consumable_cost).toBeCloseTo(55)
    expect(summary.actual_consumable_cost).toBeCloseTo(49.5)
    expect(summary.revenue).toBe(1350)
  })

  it('throws when there is no ops plan', async () => {
    vi.mocked(getOpsPlanCore).mockResolvedValue(null)
    await expect(closeoutSummaryCore('o1', 'e1')).rejects.toThrow('No ops plan')
  })

  it('works with no closeout doc yet (zero actuals)', async () => {
    closeoutGetSpy.mockResolvedValue({ exists: false })
    const summary = await closeoutSummaryCore('o1', 'e1')
    expect(summary.actual_consumable_cost).toBe(0)
    expect(summary.revenue).toBe(1200)
  })

  it('is null-safe against a malformed closeout doc with no actuals field', async () => {
    closeoutGetSpy.mockResolvedValue({ exists: true, data: () => ({ completed: false, created_at: 't' }) })
    const summary = await closeoutSummaryCore('o1', 'e1')
    expect(summary.actual_consumable_cost).toBe(0)
    expect(summary.revenue).toBe(1200)
  })

  it('throws when a package referenced by the plan no longer exists', async () => {
    closeoutGetSpy.mockResolvedValue({ exists: false })
    vi.mocked(getWorkPackagesByIdsCore).mockResolvedValue([])
    await expect(closeoutSummaryCore('o1', 'e1')).rejects.toThrow('Package no longer exists: wp1')
  })
})

describe('completeCloseoutCore', () => {
  it('marks completed with a timestamp', async () => {
    closeoutGetSpy.mockResolvedValue({ exists: true, data: () => ({ actuals: { sales: 150 }, completed: false, created_at: 't' }) })
    await completeCloseoutCore('o1', 'e1')
    const payload = closeoutSetSpy.mock.calls[0][0]
    expect(payload.completed).toBe(true)
    expect(payload.completed_at).toBeTruthy()
    expect(opsDocIdSpy).toHaveBeenCalledWith('closeout')
  })

  it('refuses when no closeout doc was ever created', async () => {
    closeoutGetSpy.mockResolvedValue({ exists: false })
    await expect(completeCloseoutCore('o1', 'e1')).rejects.toThrow('Record actuals before completing closeout')
  })

  it('refuses when the closeout doc exists but actuals has no populated field', async () => {
    closeoutGetSpy.mockResolvedValue({ exists: true, data: () => ({ actuals: {}, completed: false, created_at: 't' }) })
    await expect(completeCloseoutCore('o1', 'e1')).rejects.toThrow('Record actuals before completing closeout')
  })
})
