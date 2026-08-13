// Pure unit/conversion engine — spec 2026-08-13 §3. NO backend/DB imports;
// everything here is unit-testable with plain objects. Universal conversions
// are code, never data: no org configures them, no AI touches them. The only
// dynamic inputs are per-resource ConversionBridges (AI-inferred or
// operator-entered), which convert() traverses as extra graph edges.
import type { ConversionBridge, Dimension, Quantity } from '@/lib/types'

export const CANONICAL_UNIT: Record<Dimension, string> = { volume: 'ml', weight: 'g', count: 'each' }

/** factor = how many canonical units one of this unit is. 'oz' is WEIGHT; volume ounces are 'fl-oz'. */
export const UNIVERSAL_UNITS: Record<string, { dimension: Dimension; factor: number }> = {
  ml: { dimension: 'volume', factor: 1 },
  l: { dimension: 'volume', factor: 1000 },
  'fl-oz': { dimension: 'volume', factor: 29.5735295625 },
  cup: { dimension: 'volume', factor: 236.5882365 },
  pint: { dimension: 'volume', factor: 473.176473 },
  quart: { dimension: 'volume', factor: 946.352946 },
  gal: { dimension: 'volume', factor: 3785.411784 },
  g: { dimension: 'weight', factor: 1 },
  kg: { dimension: 'weight', factor: 1000 },
  oz: { dimension: 'weight', factor: 28.349523125 },
  lb: { dimension: 'weight', factor: 453.59237 },
  each: { dimension: 'count', factor: 1 },
  dozen: { dimension: 'count', factor: 12 },
}

export function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase()
}

export function unitDimension(unit: string): Dimension | null {
  return UNIVERSAL_UNITS[normalizeUnit(unit)]?.dimension ?? null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Legacy bare numbers and unit-aware quantities share call sites via these two. */
export function qtyValue(v: number | Quantity): number {
  return typeof v === 'number' ? v : v.qty
}

export function asQuantity(v: number | Quantity, fallbackUnit: string): Quantity {
  return typeof v === 'number' ? { qty: v, unit: fallbackUnit } : v
}

/** Stored dimension wins; else inferred from a universal display unit; else count (spec §3.3). */
export function resolveDimension(r: { dimension?: Dimension; unit?: string }): Dimension {
  if (r.dimension) return r.dimension
  if (r.unit) {
    const d = unitDimension(r.unit)
    if (d) return d
  }
  return 'count'
}

/**
 * Conversion graph walk (spec §3.4). Edges: universal units ↔ their dimension's
 * canonical unit, plus the given bridges (both directions). BFS = shortest path;
 * operator-sourced bridge edges are explored before AI-sourced on ties.
 * Returns null when no path exists — callers must degrade softly, never guess.
 */
export function convert(value: Quantity, targetUnit: string, bridges: ConversionBridge[] = []): Quantity | null {
  const from = normalizeUnit(value.unit)
  const target = normalizeUnit(targetUnit)
  if (from === target) return { qty: value.qty, unit: target }

  type Edge = { to: string; rate: number; pri: number } // value_in_to = value_in_from × rate
  const graph = new Map<string, Edge[]>()
  const addEdge = (a: string, b: string, rate: number, pri: number) => {
    if (!graph.has(a)) graph.set(a, [])
    graph.get(a)!.push({ to: b, rate, pri })
  }
  for (const [unit, def] of Object.entries(UNIVERSAL_UNITS)) {
    const canon = CANONICAL_UNIT[def.dimension]
    if (unit === canon) continue
    addEdge(unit, canon, def.factor, 0)
    addEdge(canon, unit, 1 / def.factor, 0)
  }
  for (const b of bridges) {
    if (!(b.from.qty > 0) || !(b.to.qty > 0) || !Number.isFinite(b.from.qty) || !Number.isFinite(b.to.qty)) continue
    const a = normalizeUnit(b.from.unit)
    const c = normalizeUnit(b.to.unit)
    const rate = b.to.qty / b.from.qty
    const pri = b.source === 'operator' ? 1 : 2
    addEdge(a, c, rate, pri)
    addEdge(c, a, 1 / rate, pri)
  }
  for (const edges of graph.values()) edges.sort((a, b) => a.pri - b.pri)

  const queue: { unit: string; mult: number }[] = [{ unit: from, mult: 1 }]
  const seen = new Set([from])
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const e of graph.get(cur.unit) ?? []) {
      if (seen.has(e.to)) continue
      const mult = cur.mult * e.rate
      if (e.to === target) return { qty: value.qty * mult, unit: target }
      seen.add(e.to)
      queue.push({ unit: e.to, mult })
    }
  }
  return null
}

/**
 * Human display (spec §3.5): largest universal unit of the dimension where the
 * value is ≥ 1, else the smallest. Count always renders as 'each' (12.5 dozen
 * is not a human quantity). Custom units pass through as entered. 2dp rounding.
 */
export function formatQuantity(q: Quantity): Quantity {
  const unit = normalizeUnit(q.unit)
  const def = UNIVERSAL_UNITS[unit]
  if (!def) return { qty: round2(q.qty), unit }
  if (def.dimension === 'count') return { qty: round2(q.qty * def.factor), unit: 'each' }
  const canonical = q.qty * def.factor
  const candidates = Object.entries(UNIVERSAL_UNITS)
    .filter(([, d]) => d.dimension === def.dimension)
    .sort((a, b) => b[1].factor - a[1].factor)
  for (const [u, d] of candidates) {
    const v = canonical / d.factor
    if (v >= 1) return { qty: round2(v), unit: u }
  }
  const [u, d] = candidates[candidates.length - 1]
  return { qty: round2(canonical / d.factor), unit: u }
}

/**
 * Boundary validation (spec §6.4): bridges must be positive/finite, and must not
 * restate the universal table — two universal endpoints of the SAME dimension are
 * rejected whatever the ratio (the table already covers them exactly).
 * Cross-dimension and custom-unit endpoints are the whole point and are allowed.
 */
export function validateBridges(bridges: ConversionBridge[]): void {
  for (const b of bridges) {
    for (const q of [b.from, b.to]) {
      if (!Number.isFinite(q.qty) || q.qty <= 0) throw new Error('Conversion quantities must be positive')
      if (!q.unit?.trim()) throw new Error('Conversion units are required')
    }
    const fromDim = unitDimension(b.from.unit)
    const toDim = unitDimension(b.to.unit)
    if (fromDim && toDim && fromDim === toDim) {
      throw new Error('This conversion is built-in and cannot be overridden')
    }
  }
}

/** Units offered in the package-line unit selector: display unit first, then the dimension's universal units, then bridge endpoints. */
export function unitOptionsForResource(r: { dimension?: Dimension; unit?: string; conversions?: ConversionBridge[] }): string[] {
  const dim = resolveDimension(r)
  const opts: string[] = []
  const push = (u: string) => {
    const n = normalizeUnit(u)
    if (!opts.includes(n)) opts.push(n)
  }
  if (r.unit) push(r.unit)
  for (const [u, d] of Object.entries(UNIVERSAL_UNITS)) if (d.dimension === dim) push(u)
  for (const b of r.conversions ?? []) {
    push(b.from.unit)
    push(b.to.unit)
  }
  return opts
}
