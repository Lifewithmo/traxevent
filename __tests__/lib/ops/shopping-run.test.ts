import { describe, it, expect } from 'vitest'
import {
  RUN_CAP, RUN_DAYS,
  carryExcludedIds, computeShoppingRun, constituentKey, parseRunDays, selectShoppingRunWindow, shoppingRunStats,
  type ShoppingRunPair,
} from '@/lib/ops/shopping-run'
import { selectHorizonWindow } from '@/lib/ops/readiness-horizon'
import type { Event, OpsListItem, OpsPlan, OpsResource } from '@/lib/types'

const TODAY = '2026-08-10'

let seq = 0
function event(overrides: Partial<Event> = {}): Event {
  seq += 1
  const id = overrides.id ?? `e${seq}`
  return {
    id,
    name: `Event ${id}`,
    slug: `event-${id}`,
    year: 2026,
    status: 'active',
    event_type_id: 'general',
    event_start: '2026-08-12',
    event_end: '2026-08-12',
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function plan(shopping: OpsListItem[]): OpsPlan {
  return {
    package_ids: ['p1'],
    requirements: { guests: 50 },
    deadlines: [],
    shopping_list: shopping,
    packing_list: [],
    checklists: [],
    needs_review: false,
    change_log: [],
    created_at: '2026-08-01T00:00:00.000Z',
  }
}

function pair(e: Event, shopping: OpsListItem[]): ShoppingRunPair {
  return { event: { id: e.id, name: e.name, slug: e.slug, event_start: e.event_start }, plan: plan(shopping) }
}

function resource(overrides: Partial<OpsResource> & { id: string; name: string }): OpsResource {
  return { kind: 'consumable', created_at: '2026-08-01T00:00:00.000Z', ...overrides }
}

describe('parseRunDays', () => {
  it('whitelists the window options and falls back to the default', () => {
    expect(parseRunDays('3')).toBe(3)
    expect(parseRunDays('7')).toBe(7)
    expect(parseRunDays('14')).toBe(14)
    expect(parseRunDays('5')).toBe(RUN_DAYS)
    expect(parseRunDays('nope')).toBe(RUN_DAYS)
    expect(parseRunDays(undefined)).toBe(RUN_DAYS)
  })
})

describe('selectShoppingRunWindow', () => {
  it('keeps client jobs from today through today+days inclusive, drops past/beyond/archived/market days', () => {
    const inToday = event({ id: 'a', event_start: '2026-08-10' })
    const inEdge = event({ id: 'b', event_start: '2026-08-17' }) // today+7
    const past = event({ id: 'c', event_start: '2026-08-09' })
    const beyond = event({ id: 'd', event_start: '2026-08-18' }) // today+8
    const market = event({ id: 'm', event_start: '2026-08-12', kind: 'market_day' })
    const archived = event({ id: 'x', event_start: '2026-08-12', status: 'archived' })
    const ids = selectShoppingRunWindow([past, beyond, market, archived, inEdge, inToday], TODAY, 7).map((e) => e.id)
    expect(ids).toEqual(['a', 'b'])
  })

  it('sorts soonest first, name as tiebreak, and caps at RUN_CAP', () => {
    const many = Array.from({ length: RUN_CAP + 3 }, (_, i) =>
      event({ id: `e${i}`, name: `Job ${String(i).padStart(2, '0')}`, event_start: '2026-08-12' }))
    const sooner = event({ id: 'soon', name: 'ZZZ but sooner', event_start: '2026-08-11' })
    const out = selectShoppingRunWindow([...many, sooner], TODAY, 7)
    expect(out).toHaveLength(RUN_CAP)
    expect(out[0].id).toBe('soon')
    expect(out[1].name).toBe('Job 00')
  })

  it('PARITY: the horizon window restricted to ≤ RUN_DAYS equals the run window — the org-home chip depends on this', () => {
    // More in-window jobs than the cap, spread across both windows.
    const jobs = [
      ...Array.from({ length: 15 }, (_, i) =>
        event({ id: `w${i}`, name: `Wk ${String(i).padStart(2, '0')}`, event_start: i % 2 === 0 ? '2026-08-11' : '2026-08-16' })),
      ...Array.from({ length: 5 }, (_, i) => event({ id: `far${i}`, event_start: '2026-08-21' })),
    ]
    const horizon = selectHorizonWindow(jobs, TODAY).filter((e) => e.event_start.slice(0, 10) <= '2026-08-17')
    const run = selectShoppingRunWindow(jobs, TODAY, RUN_DAYS)
    expect(horizon.map((e) => e.id)).toEqual(run.map((e) => e.id))
  })
})

describe('computeShoppingRun', () => {
  it('merges the same resource across events via canonical units, formatted in the resource unit system, with canonical total carried', () => {
    const milk = resource({ id: 'r-milk', name: 'Whole milk', unit: 'gal', dimension: 'volume' })
    const a = pair(event({ id: 'a', name: 'Wedding' }), [{ resource_id: 'r-milk', name: 'Whole milk', qty: 2, unit: 'quart', checked: false }])
    const b = pair(event({ id: 'b', name: 'Corporate' }), [{ resource_id: 'r-milk', name: 'Whole milk', qty: 1, unit: 'gal', checked: false }])
    const rows = computeShoppingRun([a, b], [milk])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ resource_id: 'r-milk', qty: 1.5, unit: 'gal', checked: 'none' })
    // Vendor-books forward-compat: the canonical total rides in the row shape NOW.
    expect(rows[0].canonical).toEqual({ qty: 5678.12, unit: 'ml' })
    expect(rows[0].constituents.map((c) => c.event_name)).toEqual(['Wedding', 'Corporate'])
  })

  it('sums count resources as integers', () => {
    const cups = resource({ id: 'r-cups', name: 'Cups', unit: 'each' })
    const a = pair(event({ id: 'a' }), [{ resource_id: 'r-cups', name: 'Cups', qty: 75, unit: 'each', checked: false }])
    const b = pair(event({ id: 'b' }), [{ resource_id: 'r-cups', name: 'Cups', qty: 120, unit: 'each', checked: false }])
    const rows = computeShoppingRun([a, b], [cups])
    expect(rows[0]).toMatchObject({ qty: 195, unit: 'each', canonical: { qty: 195, unit: 'each' } })
  })

  it('sums same-display-unit custom items directly, never flagged (custom-unit resources must not regress)', () => {
    const bags = resource({ id: 'r-ice', name: 'Ice', unit: 'bag' })
    const a = pair(event({ id: 'a' }), [{ resource_id: 'r-ice', name: 'Ice', qty: 3, unit: 'bag', checked: false }])
    const b = pair(event({ id: 'b' }), [{ resource_id: 'r-ice', name: 'Ice', qty: 2, unit: 'bag', checked: false }])
    const rows = computeShoppingRun([a, b], [bags])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ qty: 5, unit: 'bag' })
    expect(rows[0].needs_conversion).toBeUndefined()
    expect(rows[0].canonical).toBeUndefined()
  })

  it('keys a canonical and a display row from the SAME resource distinctly (mixed each + custom-unit items)', () => {
    // A bag-unit resource with no stored dimension resolves to 'count': an
    // 'each' item converts trivially into the canonical bucket while a 'bag'
    // item (no bridge) lands in the display bucket — ONE resource, TWO rows.
    // Regression: both rows carried the bare id 'r-ice' as their key, so the
    // client's key-addressed expanded/busy/error state (and React's list
    // reconciliation) cross-wired between them — a failed bulk's Retry on the
    // twin row bulk-wrote the WRONG row's constituents.
    const bags = resource({ id: 'r-ice', name: 'Ice', unit: 'bag' })
    const a = pair(event({ id: 'a' }), [
      { resource_id: 'r-ice', name: 'Ice', qty: 10, unit: 'each', checked: false },
      { resource_id: 'r-ice', name: 'Ice', qty: 3, unit: 'bag', checked: false },
    ])
    const rows = computeShoppingRun([a], [bags])
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
    const eachRow = rows.find((r) => r.unit === 'each')!
    const bagRow = rows.find((r) => r.unit === 'bag')!
    expect(eachRow).toMatchObject({ key: 'r-ice', resource_id: 'r-ice', qty: 10, checked: 'none' })
    expect(bagRow).toMatchObject({ key: 'r-ice|bag', resource_id: 'r-ice', qty: 3, checked: 'none' })
    expect(bagRow.needs_conversion).toBeUndefined() // still the never-flagged display bucket
  })

  it('converts bridged custom units so mixed-unit events still merge into one row', () => {
    const beans = resource({
      id: 'r-beans', name: 'Beans', unit: 'lb', dimension: 'weight',
      conversions: [{ from: { qty: 1, unit: 'bag' }, to: { qty: 5, unit: 'lb' }, source: 'operator' }],
    })
    const a = pair(event({ id: 'a' }), [{ resource_id: 'r-beans', name: 'Beans', qty: 2, unit: 'bag', checked: false }])
    const b = pair(event({ id: 'b' }), [{ resource_id: 'r-beans', name: 'Beans', qty: 3, unit: 'lb', checked: false }])
    const rows = computeShoppingRun([a, b], [beans])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ qty: 13, unit: 'lb' }) // 2 bags = 10 lb, + 3 lb
  })

  it('keeps no-path items per resource_id|unit, flagged needs_conversion, alongside the converted row', () => {
    const syrup = resource({ id: 'r-syrup', name: 'Syrup', unit: 'each' })
    const a = pair(event({ id: 'a' }), [
      { resource_id: 'r-syrup', name: 'Syrup', qty: 2, unit: 'each', checked: false },
      { resource_id: 'r-syrup', name: 'Syrup', qty: 40, unit: 'pump', checked: false, needs_conversion: true },
    ])
    const b = pair(event({ id: 'b' }), [
      { resource_id: 'r-syrup', name: 'Syrup', qty: 25, unit: 'pump', checked: false, needs_conversion: true },
    ])
    const rows = computeShoppingRun([a, b], [syrup])
    expect(rows).toHaveLength(2)
    const converted = rows.find((r) => r.unit === 'each')!
    const stuck = rows.find((r) => r.unit === 'pump')!
    expect(converted).toMatchObject({ qty: 2, checked: 'none' })
    expect(converted.needs_conversion).toBeUndefined()
    expect(stuck).toMatchObject({ qty: 65, needs_conversion: true })
    expect(stuck.constituents).toHaveLength(2)
  })

  it('merges deleted-resource items per resource_id|unit under the stored name, carrying stored flags', () => {
    const a = pair(event({ id: 'a' }), [{ resource_id: 'r-gone', name: 'Mystery mix', qty: 2, unit: 'box', checked: false }])
    const b = pair(event({ id: 'b' }), [{ resource_id: 'r-gone', name: 'Mystery mix', qty: 1, unit: 'box', checked: false, needs_conversion: true }])
    const rows = computeShoppingRun([a, b], [])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ resource_id: 'r-gone', name: 'Mystery mix', qty: 3, unit: 'box', needs_conversion: true })
  })

  it('reads unit-less legacy items in the resource display unit', () => {
    const cups = resource({ id: 'r-cups', name: 'Cups', unit: 'each' })
    const a = pair(event({ id: 'a' }), [{ resource_id: 'r-cups', name: 'Cups', qty: 75, checked: false }])
    const b = pair(event({ id: 'b' }), [{ resource_id: 'r-cups', name: 'Cups', qty: 25, unit: 'each', checked: false }])
    const rows = computeShoppingRun([a, b], [cups])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ qty: 100, unit: 'each' })
  })

  it('tri-states checked from the constituents: none / partial / all', () => {
    const cups = resource({ id: 'r-cups', name: 'Cups', unit: 'each' })
    const run = (aChecked: boolean, bChecked: boolean) => computeShoppingRun([
      pair(event({ id: 'a' }), [{ resource_id: 'r-cups', name: 'Cups', qty: 1, unit: 'each', checked: aChecked }]),
      pair(event({ id: 'b' }), [{ resource_id: 'r-cups', name: 'Cups', qty: 1, unit: 'each', checked: bChecked }]),
    ], [cups])[0].checked
    expect(run(false, false)).toBe('none')
    expect(run(true, false)).toBe('partial')
    expect(run(true, true)).toBe('all')
  })

  it('orders rows alphabetically by name — stable regardless of checked state', () => {
    const rs = [
      resource({ id: 'r-b', name: 'beans', unit: 'each' }),
      resource({ id: 'r-a', name: 'Apples', unit: 'each' }),
      resource({ id: 'r-c', name: 'Cups', unit: 'each' }),
    ]
    const a = pair(event({ id: 'a' }), [
      { resource_id: 'r-c', name: 'Cups', qty: 1, unit: 'each', checked: true },
      { resource_id: 'r-b', name: 'beans', qty: 1, unit: 'each', checked: false },
      { resource_id: 'r-a', name: 'Apples', qty: 1, unit: 'each', checked: false },
    ])
    expect(computeShoppingRun([a], rs).map((r) => r.name)).toEqual(['Apples', 'beans', 'Cups'])
  })

  it('returns nothing for no pairs', () => {
    expect(computeShoppingRun([], [])).toEqual([])
  })
})

describe('constituentKey', () => {
  it('is unique per event + resource + unit', () => {
    expect(constituentKey({ event_id: 'e1', resource_id: 'r1', unit: 'lb' })).toBe('e1:r1|lb')
    expect(constituentKey({ event_id: 'e1', resource_id: 'r1' })).toBe('e1:r1|')
    expect(constituentKey({ event_id: 'e2', resource_id: 'r1', unit: 'lb' })).not.toBe(
      constituentKey({ event_id: 'e1', resource_id: 'r1', unit: 'lb' }))
  })
})

describe('carryExcludedIds', () => {
  it('keeps exclusions for events still inside the widest window; drops what left range (and unknowns)', () => {
    const far = event({ id: 'far', event_start: '2026-08-20' })       // outside 3d/7d, inside 14d
    const near = event({ id: 'near', event_start: '2026-08-11' })
    const past = event({ id: 'past', event_start: '2026-08-01' })
    const beyond = event({ id: 'beyond', event_start: '2026-08-30' }) // beyond even the 14d window
    const gone = event({ id: 'gone', event_start: '2026-08-12', status: 'archived' })
    // 'far' is the exact round-trip case: excluded in the 14-day view, then a
    // trip through the 3-day view must not drop it from the carried scope.
    expect(carryExcludedIds(['far', 'near', 'past', 'beyond', 'gone', 'ghost'], [far, near, past, beyond, gone], TODAY))
      .toEqual(['far', 'near'])
  })

  it('carries nothing when nothing was excluded', () => {
    expect(carryExcludedIds([], [event({ id: 'a' })], TODAY)).toEqual([])
  })
})

describe('shoppingRunStats', () => {
  it('counts constituent items and only jobs that contribute shopping items', () => {
    const stats = shoppingRunStats([
      pair(event({ id: 'a' }), [
        { resource_id: 'r1', name: 'Beans', qty: 1, checked: true },
        { resource_id: 'r2', name: 'Milk', qty: 1, checked: false },
      ]),
      pair(event({ id: 'b' }), [{ resource_id: 'r1', name: 'Beans', qty: 1, checked: false }]),
      pair(event({ id: 'c' }), []), // no shopping lines — not a run job
    ])
    expect(stats).toEqual({ unchecked: 2, total: 3, jobs: 2 })
  })

  it('is merge-independent: two jobs sharing a resource still count their own items (chip/page parity)', () => {
    const shared = (id: string) => pair(event({ id }), [{ resource_id: 'r1', name: 'Beans', qty: 1, checked: false }])
    expect(shoppingRunStats([shared('a'), shared('b')])).toEqual({ unchecked: 2, total: 2, jobs: 2 })
  })

  it('reports empty honestly', () => {
    expect(shoppingRunStats([])).toEqual({ unchecked: 0, total: 0, jobs: 0 })
  })
})
