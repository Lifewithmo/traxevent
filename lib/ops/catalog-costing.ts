// Pure catalog costing module. NO backend/DB imports of any kind — unit-testable
// with plain objects, same discipline as lib/ops/derive.ts.
//
// This computes CONSUMABLE MATERIALS ONLY for a work package, at its declared
// capacity (`max_guests`). It is NOT a "cost" and the result is NOT a "margin":
//   - Labor is structurally uncostable. The labor line
//     (`{ kind: 'labor'; role: string; count: number }`) carries no rate
//     anywhere in the schema, so there is no data to derive a labor cost from.
//   - Equipment lines are reusable/serialized gear that isn't consumed per
//     event; there is no per-event cost to attribute to them here.
//   - A package's price is untouched by any of this — this module says
//     nothing about profitability, only about ingredient/consumable spend.
//
// `computeCloseoutSummary` (lib/ops/derive.ts) is built for an actual event
// closeout, where an operator is present and a missing `unit_cost` silently
// degrades to a $0 contribution with no flag. That's fine there. It is NOT
// fine for a catalog listing shown with no operator in the loop — a $0
// "materials" figure would read as "this package costs nothing to fulfill."
// So this module detects "uncosted" explicitly (no consumable lines, no
// costed ingredient among them, or no capacity to price against) and returns
// `costed: false` instead of a number. Callers MUST render costed:false as an
// em dash, never "$0.00", and must never label any of this output "cost" or
// "margin".
import type { OpsResource, WorkPackage } from '@/lib/types'
import { computeCloseoutSummary } from '@/lib/ops/derive'

export type UncostedReason = 'no-capacity' | 'no-costed-ingredient' | 'no-consumables'

export interface PackageCosting {
  id: string
  price: number
  costed: boolean          // false => caller renders an em dash, NEVER "$0.00"
  basis?: number           // guests used (p.max_guests); undefined when not costed
  materials: number        // CONSUMABLES ONLY — excludes labor and equipment
  gaps: string[]           // resource names with a unit_cost but no conversion path
  reason?: UncostedReason  // why costed === false
}

export function computeCatalogCosting(packages: WorkPackage[], resources: OpsResource[]): PackageCosting[] {
  const byId = new Map(resources.map((r) => [r.id, r]))
  return packages.map((p): PackageCosting => {
    const consumableLines = p.lines.filter((l) => l.kind === 'consumable')
    if (consumableLines.length === 0) {
      return { id: p.id, price: p.price, costed: false, materials: 0, gaps: [], reason: 'no-consumables' }
    }
    const hasCostedIngredient = consumableLines.some((l) => byId.get(l.resource_id)?.unit_cost !== undefined)
    if (!hasCostedIngredient) {
      return { id: p.id, price: p.price, costed: false, materials: 0, gaps: [], reason: 'no-costed-ingredient' }
    }
    if (p.max_guests === undefined) {
      return { id: p.id, price: p.price, costed: false, materials: 0, gaps: [], reason: 'no-capacity' }
    }
    const summary = computeCloseoutSummary({
      packages: [p],
      resources,
      guests: p.max_guests,
      actual_consumables: [],
      sales: 0,
    })
    return {
      id: p.id,
      price: p.price,
      costed: true,
      basis: p.max_guests,
      materials: summary.planned_consumable_cost,
      gaps: summary.cost_gaps ?? [],
    }
  })
}

/** Consumable resources with no unit_cost recorded — the catalog-wide "still needs pricing" list. */
export function uncostedConsumables(resources: OpsResource[]): OpsResource[] {
  return resources.filter((r) => r.kind === 'consumable' && r.unit_cost === undefined)
}

/** Min/max package price across the catalog. undefined for an empty catalog (guards Math.min/max on []). */
export function priceRange(packages: WorkPackage[]): { min: number; max: number } | undefined {
  if (packages.length === 0) return undefined
  const prices = packages.map((p) => p.price)
  return { min: Math.min(...prices), max: Math.max(...prices) }
}
