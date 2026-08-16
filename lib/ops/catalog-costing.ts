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
// costable ingredient among them, or no capacity to price against) and returns
// `costed: false` instead of a number. Callers MUST render costed:false as an
// em dash, never "$0.00", and must never label any of this output "cost" or
// "margin".
//
// The same reasoning applies WITHIN a package, line by line. A line is priced
// only when its resource exists, carries a `unit_cost`, AND carries the `unit`
// that cost is denominated in. Every other consumable line is EXCLUDED from
// the arithmetic and named in `gaps`:
//   - dangling `resource_id` / no `unit_cost` — the engine would silently
//     contribute $0 and the figure would read as complete;
//   - `unit_cost` with no `unit` — the engine's legacy branch multiplies the
//     raw line quantity by the cost without converting, so the SAME physical
//     quantity typed as 0.5 lb vs 8 oz produces different dollars. An
//     arbitrarily-scaled number is worse than no number.
// A package is only costed against a positive `max_guests`; 0 or negative
// capacity yields `no-capacity`, never a $0 or negative figure.
//
// Admitting a line to the arithmetic is NOT the same as pricing it. A line whose
// resource has both `unit_cost` and `unit` still fails if the LINE's own unit has
// no conversion path to that cost unit — `computeCloseoutSummary` names it in
// `cost_gaps` and adds 0. When EVERY admitted line lands in gaps, the sum is 0
// and the package is not costed at all, so the final figure is what decides:
// a non-positive `materials` is `no-costed-ingredient`, never a rendered $0.00.
// This is UI-reachable, not just legacy data — a resource with a custom display
// unit ('bag') resolves to dimension `count`, so its line unit selector offers
// 'each'/'dozen', neither of which converts to 'bag'. It also closes the negative
// door: a negative `unit_cost` or `qty_per_guest` can only ever produce a
// negative figure, and a negative "materials" is not a number worth showing.
import type { OpsResource, WorkPackage, WorkPackageLine } from '@/lib/types'
import { computeCloseoutSummary } from '@/lib/ops/derive'

type ConsumableLine = Extract<WorkPackageLine, { kind: 'consumable' }>

export type UncostedReason = 'no-capacity' | 'no-costed-ingredient' | 'no-consumables'

export interface PackageCosting {
  id: string
  price: number
  costed: boolean          // false => caller renders an em dash, NEVER "$0.00"
  basis?: number           // guests used (p.max_guests); undefined when not costed
  materials: number        // CONSUMABLES ONLY — excludes labor and equipment. Always > 0 when costed, always 0 otherwise.
  /** Ingredients EXCLUDED from this figure — `materials` understates by whatever
   *  they cost. Union of lines that could not be priced (dangling resource, no
   *  unit_cost, or a unit_cost with no unit) and costed lines with no conversion
   *  path. Resource name, or the raw resource_id when the resource is missing.
   *  Populated on `no-costed-ingredient` too: that verdict IS the gap list. */
  gaps: string[]
  reason?: UncostedReason  // why costed === false
}

export function computeCatalogCosting(packages: WorkPackage[], resources: OpsResource[]): PackageCosting[] {
  const byId = new Map(resources.map((r) => [r.id, r]))
  return packages.map((p): PackageCosting => {
    const consumableLines = p.lines.filter((l): l is ConsumableLine => l.kind === 'consumable')
    if (consumableLines.length === 0) {
      return { id: p.id, price: p.price, costed: false, materials: 0, gaps: [], reason: 'no-consumables' }
    }
    // A line is priceable only with resource + unit_cost + the unit that cost is
    // denominated in. Everything else is excluded from the math AND named, so a
    // partial figure can never masquerade as a complete one.
    const costable: ConsumableLine[] = []
    const excluded: string[] = []
    for (const line of consumableLines) {
      const res = byId.get(line.resource_id)
      if (res && res.unit_cost !== undefined && res.unit !== undefined) costable.push(line)
      else excluded.push(res?.name ?? line.resource_id)
    }
    if (costable.length === 0) {
      // Name them even here: "no costed ingredient" is a claim ABOUT these lines,
      // and the contract is that every excluded ingredient is named.
      return { id: p.id, price: p.price, costed: false, materials: 0, gaps: excluded, reason: 'no-costed-ingredient' }
    }
    // 0 or negative capacity scales every per-guest contribution to $0 (or below) —
    // the same "reads as free" trap as an uncosted package, by another door.
    if (p.max_guests === undefined || p.max_guests <= 0) {
      return { id: p.id, price: p.price, costed: false, materials: 0, gaps: [], reason: 'no-capacity' }
    }
    const summary = computeCloseoutSummary({
      packages: [{ ...p, lines: costable }],
      resources,
      guests: p.max_guests,
      actual_consumables: [],
      sales: 0,
    })
    const materials = summary.planned_consumable_cost
    const gaps = [...new Set([...excluded, ...(summary.cost_gaps ?? [])])]
    // Every admitted line failed conversion (or priced to nothing/below): the sum
    // is 0 or negative, which is an absence of a figure, not a figure of zero.
    // Only an all-or-nothing collapse flips this — a partial sum stays costed.
    if (!(materials > 0)) {
      return { id: p.id, price: p.price, costed: false, materials: 0, gaps, reason: 'no-costed-ingredient' }
    }
    return { id: p.id, price: p.price, costed: true, basis: p.max_guests, materials, gaps }
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
