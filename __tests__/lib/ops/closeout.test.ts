import { describe, it, expect, vi, beforeEach } from 'vitest'

const closeoutSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const closeoutGetSpy = vi.hoisted(() => vi.fn())
const eventGetSpy = vi.hoisted(() => vi.fn())
const opsDocIdSpy = vi.hoisted(() => vi.fn())
const opsDoc = vi.hoisted(() => ({ set: closeoutSetSpy, get: closeoutGetSpy, update: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/firebase-admin', () => {
  const opsColl = { doc: vi.fn((id?: string) => { opsDocIdSpy(id); return opsDoc }) }
  const eventDoc = { collection: vi.fn(() => opsColl), get: eventGetSpy }
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
import {
  saveActualsCore, closeoutSummaryCore, completeCloseoutCore, listSeriesCloseoutsCore,
  selectSeriesRollupDays, SERIES_ROLLUP_CAP,
} from '@/lib/ops/closeout'

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
  // Default: event doc absent (no booth fee, kind unknown) — the pre-fees behavior.
  eventGetSpy.mockResolvedValue({ exists: false })
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

  // ——— Booth-fee join + closeout-lite (spec 2026-08-23 S1) ————————————————
  it('reads the event doc and joins its booth fee into both margins on the plan path', async () => {
    eventGetSpy.mockResolvedValue({ exists: true, data: () => ({ kind: 'market_day', booth_fee: 45 }) })
    closeoutGetSpy.mockResolvedValue({ exists: false })
    const summary = await closeoutSummaryCore('o1', 'e1')
    expect(summary.fees).toBe(45)
    expect(summary.revenue).toBe(1200)
    expect(summary.planned_margin).toBeCloseTo(1200 - 55 - 45)
    expect(summary.actual_margin).toBeCloseTo(1200 - 0 - 45)
  })

  it('computes closeout-lite for a plan-less market day — no throw, revenue = sales', async () => {
    vi.mocked(getOpsPlanCore).mockResolvedValue(null)
    eventGetSpy.mockResolvedValue({ exists: true, data: () => ({ kind: 'market_day', booth_fee: 35 }) })
    closeoutGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ actuals: { sales: 176 }, completed: false, created_at: 't' }),
    })
    const summary = await closeoutSummaryCore('o1', 'e1')
    expect(summary.revenue).toBe(176)
    expect(summary.fees).toBe(35)
    expect(summary.planned_consumable_cost).toBe(0)
    expect(summary.planned_margin).toBe(141)
    expect(summary.actual_margin).toBe(141)
    expect(getWorkPackagesByIdsCore).not.toHaveBeenCalled()
    // No consumable actuals recorded → the resources read is skipped entirely.
    expect(listResourcesCore).not.toHaveBeenCalled()
  })

  it('lite branch costs recorded consumable actuals against org resources', async () => {
    vi.mocked(getOpsPlanCore).mockResolvedValue(null)
    eventGetSpy.mockResolvedValue({ exists: true, data: () => ({ kind: 'market_day', booth_fee: 35 }) })
    closeoutGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ actuals: { sales: 176, consumables: [{ resource_id: 'res-beans', qty_used: 10 }] }, completed: false, created_at: 't' }),
    })
    const summary = await closeoutSummaryCore('o1', 'e1')
    expect(listResourcesCore).toHaveBeenCalled()
    expect(summary.actual_consumable_cost).toBeCloseTo(5.5)
    expect(summary.actual_margin).toBeCloseTo(176 - 5.5 - 35)
  })

  it('still requires a plan for client jobs (kind absent = client_job)', async () => {
    vi.mocked(getOpsPlanCore).mockResolvedValue(null)
    eventGetSpy.mockResolvedValue({ exists: true, data: () => ({ booth_fee: 35 }) })
    await expect(closeoutSummaryCore('o1', 'e1')).rejects.toThrow('No ops plan')
  })
})

describe('listSeriesCloseoutsCore', () => {
  it('maps read docs, keeps a missing doc as null, and drops FAILED reads entirely', async () => {
    closeoutGetSpy
      .mockResolvedValueOnce({ exists: true, data: () => ({ actuals: { sales: 100 }, completed: true, created_at: 't' }) })
      .mockResolvedValueOnce({ exists: false })
      .mockRejectedValueOnce(new Error('unavailable'))
    const out = await listSeriesCloseoutsCore('o1', ['d1', 'd2', 'd3'])
    expect(out['d1']?.actuals?.sales).toBe(100)
    expect(out['d2']).toBeNull()          // read succeeded, no closeout — honest "not closed out"
    expect('d3' in out).toBe(false)       // failed ≠ missing — never a false $0 day
  })

  it('caps at 30 direct doc gets', async () => {
    closeoutGetSpy.mockResolvedValue({ exists: false })
    const ids = Array.from({ length: 35 }, (_, i) => `d${i}`)
    const out = await listSeriesCloseoutsCore('o1', ids)
    expect(closeoutGetSpy).toHaveBeenCalledTimes(30)
    expect(Object.keys(out)).toHaveLength(30)
  })
})

describe('selectSeriesRollupDays', () => {
  // A weekly day per index: day(0) = 2026-01-04, day(1) = 2026-01-11, …
  const day = (i: number) => {
    const d = new Date(Date.UTC(2026, 0, 4 + i * 7))
    return { id: `d${i}`, event_start: d.toISOString().slice(0, 10) }
  }

  it('an extended season reads the NEWEST 30 days <= today — never the oldest 30', () => {
    // 34-week season, all past (the "created 30 + one extend" case): the 4
    // OLDEST days fall beyond the cap; yesterday's market is always read.
    const days = Array.from({ length: 34 }, (_, i) => day(i))
    const today = '2027-01-01' // after every day in the season
    const { readIds, beyondCapIds } = selectSeriesRollupDays(days, today)
    expect(readIds).toHaveLength(SERIES_ROLLUP_CAP)
    expect(readIds[0]).toBe('d33')                        // newest first
    expect(readIds).toContain('d33')
    expect(readIds).toContain('d4')
    expect(beyondCapIds.sort()).toEqual(['d0', 'd1', 'd2', 'd3'])
  })

  it('days that can hold a closeout (<= today) win the budget over future days', () => {
    // Mid-season: 28 past + 6 future. All 28 past days are read; the two
    // soonest future days take the remaining budget; the rest sit beyond.
    const days = Array.from({ length: 34 }, (_, i) => day(i))
    const today = day(27).event_start // day 27 is "today" — 28 days <= today
    const { readIds, beyondCapIds } = selectSeriesRollupDays(days, today)
    for (let i = 0; i <= 27; i++) expect(readIds).toContain(`d${i}`)
    expect(readIds).toContain('d28')                      // soonest future
    expect(readIds).toContain('d29')
    expect(beyondCapIds.sort()).toEqual(['d30', 'd31', 'd32', 'd33'])
  })

  it('a season inside the cap reads every day — nothing beyond', () => {
    const days = Array.from({ length: 12 }, (_, i) => day(i))
    const { readIds, beyondCapIds } = selectSeriesRollupDays(days, day(5).event_start)
    expect(readIds).toHaveLength(12)
    expect(beyondCapIds).toEqual([])
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
