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
// a materials total that would not render as a real dollar figure (see the
// rendered-cent floor below) is `no-costed-ingredient`, never a rendered $0.00.
// This is UI-reachable, not just legacy data — a resource with a custom display
// unit ('bag') resolves to dimension `count`, so its line unit selector offers
// 'each'/'dozen', neither of which converts to 'bag'. It also closes the negative
// door: a negative `unit_cost` or `qty_per_guest` can only ever produce a
// negative figure, and a negative "materials" is not a number worth showing.
//
// The invariant above is NOT "materials is positive" — it is "materials
// renders as a real, nonzero figure at the precision the UI actually displays
// it with". Callers format with `formatMoney` (lib/utils.ts: `n.toFixed(2)`),
// and `0.004 > 0` is true while `formatMoney(0.004) === "$0.00"`. A sub-cent
// total reaches the exact "reads as free" misrepresentation this module exists
// to prevent, through rounding rather than a raw zero. So the floor is a
// RENDERED cent, not zero: `materials >= 0.005`. 0.005 is the smallest total
// `toFixed(2)` rounds UP to a nonzero cent ("$0.01"); anything strictly below
// it rounds DOWN to "$0.00" (see MIN_RENDERED_MATERIALS below). Below that
// floor is `no-costed-ingredient`, exactly like a $0 or negative total.
import type { OpsResource, WorkPackage, WorkPackageLine } from '@/lib/types'
import { computeCloseoutSummary } from '@/lib/ops/derive'

type ConsumableLine = Extract<WorkPackageLine, { kind: 'consumable' }>

export type UncostedReason = 'no-capacity' | 'no-costed-ingredient' | 'no-consumables'

// The smallest total that `formatMoney` (lib/utils.ts, `n.toFixed(2)`) rounds UP
// to a nonzero rendered cent ("$0.01"). Deliberately NOT 0 (a $0.004 total is
// "> 0" but still displays as "$0.00" — the exact misrepresentation the
// costed:true invariant exists to forbid) and NOT 0.01 (a real $0.0075 total
// clears this floor and correctly rounds to "$0.01"; requiring a full cent
// would wrongly reject it). 0.005 is the rounding midpoint itself, so the
// boundary matches what the UI will actually render, not an arbitrary minimum.
const MIN_RENDERED_MATERIALS = 0.005

export interface PackageCosting {
  id: string
  price: number
  costed: boolean          // false => caller renders an em dash, NEVER "$0.00"
  basis?: number           // guests used (p.max_guests); undefined when not costed
  // CONSUMABLES ONLY — excludes labor and equipment. When costed, always
  // >= MIN_RENDERED_MATERIALS (i.e. renders as a real, nonzero figure via
  // formatMoney) — never merely "> 0". Always exactly 0 otherwise.
  materials: number
  /** Ingredients EXCLUDED from this figure — `materials` understates by whatever
   *  they cost. Union of lines that could not be priced (dangling resource, no
   *  unit_cost, or a unit_cost with no unit) and costed lines with no conversion
   *  path. Resource name, or the raw resource_id when the resource is missing.
   *  Populated on every uncosted branch that has excluded lines to name
   *  (`no-costed-ingredient` and `no-capacity`) — that verdict IS the gap list.
   *  `no-consumables` has no lines at all, so its gaps are always empty. */
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
    // Capacity is checked BEFORE "any costable ingredient among the lines" so a
    // package missing both is told the simpler fix first: set a guest count.
    // (Reordered from the original capacity-last sequence. No existing fixture
    // exercises both conditions at once — every no-capacity test here has at
    // least one costable line, and every no-costed-ingredient test has valid
    // capacity — so this reorder does not flip any existing `reason`
    // expectation; it only decides a case no test previously covered.)
    // 0 or negative capacity scales every per-guest contribution to $0 (or below) —
    // the same "reads as free" trap as an uncosted package, by another door.
    // gaps is `excluded`, not `[]`: the module's contract is "name every excluded
    // ingredient" on every uncosted branch that has one to name, not only the
    // branches that happen to reach the arithmetic — an operator who later sets
    // max_guests should not see a "N excluded" pill appear from nowhere.
    if (p.max_guests === undefined || p.max_guests <= 0) {
      return { id: p.id, price: p.price, costed: false, materials: 0, gaps: excluded, reason: 'no-capacity' }
    }
    if (costable.length === 0) {
      // Name them even here: "no costed ingredient" is a claim ABOUT these lines,
      // and the contract is that every excluded ingredient is named.
      return { id: p.id, price: p.price, costed: false, materials: 0, gaps: excluded, reason: 'no-costed-ingredient' }
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
    // Every admitted line failed conversion (or priced to nothing/below), OR the
    // real sum is positive but rounds to "$0.00" at the precision the UI renders
    // with (see MIN_RENDERED_MATERIALS above): either way that is an absence of
    // a figure worth showing, not a figure of zero (or a misleadingly-precise
    // fraction of a cent). Only an all-or-nothing (or sub-cent) collapse flips
    // this — a partial sum that clears the floor stays costed.
    if (!(materials >= MIN_RENDERED_MATERIALS)) {
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
