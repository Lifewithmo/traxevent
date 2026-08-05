import { describe, it, expect } from 'vitest'
import {
  computeShoppingList, computePackingList, deriveDeadlines, instantiateChecklists,
  computeCloseoutSummary, DEADLINE_TEMPLATES,
} from '@/lib/ops/derive'
import type { WorkPackage, OpsResource, ChecklistTemplate } from '@/lib/types'

const resources: OpsResource[] = [
  { id: 'res-beans', name: 'Espresso beans', kind: 'consumable', unit: 'oz', unit_cost: 0.55, created_at: 't' },
  { id: 'res-cups', name: '12oz cups', kind: 'consumable', unit: 'each', unit_cost: 0.12, created_at: 't' },
  { id: 'res-machine', name: 'Espresso Machine 02', kind: 'serialized', created_at: 't' },
]

const pkg = (over: Partial<WorkPackage>): WorkPackage => ({
  id: 'wp1', name: 'Espresso Bar', price: 1200, lines: [], created_at: 't', ...over,
})

describe('computeShoppingList', () => {
  it('scales consumables by guests, applies base_qty, rounds up', () => {
    const p = pkg({ lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 0.75, base_qty: 4 }] })
    const list = computeShoppingList([p], resources, 101)
    // 4 + 0.75*101 = 79.75 → ceil 80
    expect(list).toEqual([{ resource_id: 'res-beans', name: 'Espresso beans', qty: 80, unit: 'oz', checked: false }])
  })

  it('merges duplicate resources across packages', () => {
    const a = pkg({ id: 'a', lines: [{ kind: 'consumable', resource_id: 'res-cups', qty_per_guest: 1 }] })
    const b = pkg({ id: 'b', lines: [{ kind: 'consumable', resource_id: 'res-cups', qty_per_guest: 0.5 }] })
    const list = computeShoppingList([a, b], resources, 100)
    expect(list).toEqual([{ resource_id: 'res-cups', name: '12oz cups', qty: 150, unit: 'each', checked: false }])
  })

  it('ignores equipment and labor lines; unknown resources become named placeholders', () => {
    const p = pkg({
      lines: [
        { kind: 'equipment', resource_id: 'res-machine', qty: 1 },
        { kind: 'labor', role: 'barista', count: 2 },
        { kind: 'consumable', resource_id: 'res-gone', qty_per_guest: 1 },
      ],
    })
    const list = computeShoppingList([p], resources, 10)
    expect(list).toEqual([{ resource_id: 'res-gone', name: 'Unknown resource', qty: 10, checked: false }])
  })
})

describe('computePackingList', () => {
  it('collects equipment lines with quantities, merged across packages', () => {
    const a = pkg({ id: 'a', lines: [{ kind: 'equipment', resource_id: 'res-machine', qty: 1 }] })
    const b = pkg({ id: 'b', lines: [{ kind: 'equipment', resource_id: 'res-machine', qty: 1 }] })
    const list = computePackingList([a, b], resources)
    expect(list).toEqual([{ resource_id: 'res-machine', name: 'Espresso Machine 02', qty: 2, checked: false }])
  })
})

describe('deriveDeadlines', () => {
  it('works backward from the event date using the pack template', () => {
    const deadlines = deriveDeadlines('2026-09-12', 'coffee-cart')
    expect(deadlines.length).toBe(DEADLINE_TEMPLATES['coffee-cart'].length)
    const permit = deadlines.find((d) => d.id === 'dl-confirm-permit')!
    expect(permit.due).toBe('2026-08-29') // 14 days before
    expect(permit.done).toBe(false)
  })

  it('falls back to the general template for unknown packs', () => {
    const deadlines = deriveDeadlines('2026-09-12', undefined)
    expect(deadlines.length).toBe(DEADLINE_TEMPLATES['general'].length)
  })
})

describe('instantiateChecklists', () => {
  it('copies template steps as un-done instance steps', () => {
    const template: ChecklistTemplate = {
      id: 'ct1', name: 'Prep', phase: 'prep',
      steps: [{ text: 'Test machine', evidence: 'photo' }],
      created_at: 't',
    }
    const [cl] = instantiateChecklists([template])
    expect(cl.id).toBe('ct1')
    expect(cl.steps).toEqual([{ text: 'Test machine', evidence: 'photo', done: false }])
  })
})

describe('computeCloseoutSummary', () => {
  it('computes planned vs actual consumable cost and margins', () => {
    const p = pkg({ price: 1200, lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 1 }] })
    const summary = computeCloseoutSummary({
      packages: [p],
      resources,
      guests: 100,
      actual_consumables: [{ resource_id: 'res-beans', qty_used: 90 }],
      sales: 150,
    })
    expect(summary.planned_consumable_cost).toBeCloseTo(55)   // 100 × 0.55
    expect(summary.actual_consumable_cost).toBeCloseTo(49.5)  // 90 × 0.55
    expect(summary.revenue).toBe(1350)                        // 1200 + 150
    expect(summary.planned_margin).toBeCloseTo(1295)
    expect(summary.actual_margin).toBeCloseTo(1300.5)
  })

  it('treats resources without unit_cost as zero cost', () => {
    const p = pkg({ lines: [{ kind: 'consumable', resource_id: 'res-machine', qty_per_guest: 1 }] })
    const summary = computeCloseoutSummary({ packages: [p], resources, guests: 10, actual_consumables: [], sales: 0 })
    expect(summary.planned_consumable_cost).toBe(0)
  })
})
