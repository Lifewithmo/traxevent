# Units Core (Ops Catalog Increment 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the deterministic unit/conversion engine (universal unit table, per-ingredient conversion bridges, `convert()`), make catalog quantities unit-aware, and upgrade the derive engine to convert-then-merge — Increment 1 of `docs/superpowers/specs/2026-08-13-ops-catalog-units-vendors-design.md`.

**Architecture:** A new pure module `lib/ops/units.ts` (no DB imports, mirroring `lib/ops/derive.ts`) holds the universal table and all conversion math. `OpsResource` gains `dimension` + `conversions[]`; consumable `WorkPackageLine` quantities become `number | Quantity` (legacy bare numbers read as the resource's display unit — no migration). `derive.ts` converts every contribution to the resource's canonical unit before merging, buckets unconvertible quantities with a `needs_conversion` flag, and ceils only count-dimension totals. PackagesTab gains a unit selector on consumable lines.

**Tech Stack:** Next.js (App Router — **this repo's Next version has breaking changes; read `node_modules/next/dist/docs/` before writing any Next-specific code**), TypeScript, Firestore via `firebase-admin`, Vitest + Testing Library.

## Global Constraints

- `lib/ops/derive.ts` and `lib/ops/units.ts` are pure: **NO backend/DB imports of any kind** (existing rule, derive.ts:1).
- Firestore rejects `undefined` values — optional fields are spread in conditionally (`...(x !== undefined ? { x } : {})`), never written as `undefined`.
- Never re-export a type from a `'use server'` module — it breaks `next build` while tsc passes.
- The branch is not green until both `npx vitest run` AND `npx next build` pass.
- If running vitest from the primary checkout, use `--exclude '**/.claude/**'` (stale worktrees under `.claude/worktrees/` otherwise pollute the run). Fresh worktrees need `npm install` and a copied `.env.local` before building.
- All work in this repo only (github.com/Lifewithmo/traxevent). Pushing requires `gh auth switch` to the Lifewithmo account.
- Unit strings are normalized lowercase (`'oz'`, `'gal'`, `'fl-oz'`). `'oz'` is **weight**; volume ounces are `'fl-oz'`.

---

### Task 1: Types + universal unit table + `convert()`

**Files:**
- Modify: `lib/types.ts` (add types near line 726, the "Operations core" section)
- Create: `lib/ops/units.ts`
- Test: `__tests__/lib/ops/units.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 2–5):
  - Types from `@/lib/types`: `Dimension`, `Quantity`, `ConversionBridge`
  - From `@/lib/ops/units`: `CANONICAL_UNIT: Record<Dimension, string>`, `UNIVERSAL_UNITS`, `normalizeUnit(u: string): string`, `unitDimension(u: string): Dimension | null`, `convert(value: Quantity, targetUnit: string, bridges?: ConversionBridge[]): Quantity | null`, `formatQuantity(q: Quantity): Quantity`, `qtyValue(v: number | Quantity): number`, `asQuantity(v: number | Quantity, fallbackUnit: string): Quantity`, `resolveDimension(r: { dimension?: Dimension; unit?: string }): Dimension`, `validateBridges(bridges: ConversionBridge[]): void`, `unitOptionsForResource(r: { dimension?: Dimension; unit?: string; conversions?: ConversionBridge[] }): string[]`

- [ ] **Step 1: Add the shared types to `lib/types.ts`**

Insert immediately after the `// ── Operations core (spec 2026-08-05 §3) ──` comment (line 726) and before `export type ResourceKind`:

```ts
// ── Units & conversions (spec 2026-08-13 §3) ─────────────────────────

export type Dimension = 'volume' | 'weight' | 'count'

/** A physical quantity: amount + unit string (normalized lowercase). */
export interface Quantity {
  qty: number
  unit: string
}

/**
 * Ingredient-specific conversion, AI-inferred or operator-entered:
 * density (weight↔volume), yield (1 lb beans → 40 shot), or custom
 * serving units (1 keg → 124 pint). Never duplicates the universal table.
 */
export interface ConversionBridge {
  from: Quantity
  to: Quantity
  source: 'ai' | 'operator'
  note?: string
}
```

- [ ] **Step 2: Write the failing tests**

Create `__tests__/lib/ops/units.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  convert, formatQuantity, normalizeUnit, unitDimension, resolveDimension,
  validateBridges, qtyValue, asQuantity, unitOptionsForResource, CANONICAL_UNIT,
} from '@/lib/ops/units'
import type { ConversionBridge } from '@/lib/types'

const lbToShot: ConversionBridge = {
  from: { qty: 1, unit: 'lb' }, to: { qty: 40, unit: 'shot' }, source: 'ai',
}

describe('normalizeUnit / unitDimension', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeUnit(' OZ ')).toBe('oz')
    expect(normalizeUnit('Gal')).toBe('gal')
  })
  it('maps universal units to dimensions; unknown units to null', () => {
    expect(unitDimension('oz')).toBe('weight')
    expect(unitDimension('fl-oz')).toBe('volume')
    expect(unitDimension('each')).toBe('count')
    expect(unitDimension('shot')).toBeNull()
  })
})

describe('convert — universal table', () => {
  it('converts within a dimension exactly', () => {
    expect(convert({ qty: 1, unit: 'gal' }, 'ml')).toEqual({ qty: 3785.411784, unit: 'ml' })
    expect(convert({ qty: 2, unit: 'lb' }, 'oz')?.qty).toBeCloseTo(32)
    expect(convert({ qty: 3, unit: 'dozen' }, 'each')?.qty).toBe(36)
  })
  it('round-trips without drift beyond float epsilon', () => {
    const there = convert({ qty: 7.3, unit: 'cup' }, 'gal')!
    const back = convert(there, 'cup')!
    expect(back.qty).toBeCloseTo(7.3, 10)
  })
  it('is identity for same unit', () => {
    expect(convert({ qty: 5, unit: 'oz' }, 'oz')).toEqual({ qty: 5, unit: 'oz' })
  })
  it('returns null across dimensions without a bridge', () => {
    expect(convert({ qty: 1, unit: 'lb' }, 'gal')).toBeNull()
  })
  it('returns null for unknown units without a bridge', () => {
    expect(convert({ qty: 1, unit: 'shot' }, 'oz')).toBeNull()
  })
})

describe('convert — bridges', () => {
  it('crosses dimensions through a bridge', () => {
    // 2 kg → g → lb → shot: 2000 / 453.59237 * 40 ≈ 176.37
    expect(convert({ qty: 2, unit: 'kg' }, 'shot', [lbToShot])?.qty).toBeCloseTo(176.37, 2)
  })
  it('traverses bridges in reverse', () => {
    // 80 shot → 2 lb
    expect(convert({ qty: 80, unit: 'shot' }, 'lb', [lbToShot])?.qty).toBeCloseTo(2)
  })
  it('normalizes bridge ratios (from.qty ≠ 1)', () => {
    const b: ConversionBridge = { from: { qty: 5, unit: 'lb' }, to: { qty: 1, unit: 'keg' }, source: 'ai' }
    expect(convert({ qty: 10, unit: 'lb' }, 'keg', [b])?.qty).toBeCloseTo(2)
  })
  it('chains custom units: keg → pint → fl-oz', () => {
    const kegToPint: ConversionBridge = { from: { qty: 1, unit: 'keg' }, to: { qty: 124, unit: 'pint' }, source: 'ai' }
    expect(convert({ qty: 1, unit: 'keg' }, 'fl-oz', [kegToPint])?.qty).toBeCloseTo(124 * 16)
  })
})

describe('formatQuantity', () => {
  it('renders the largest universal unit where the value is ≥ 1', () => {
    expect(formatQuantity({ qty: 5678, unit: 'ml' })).toEqual({ qty: 1.5, unit: 'gal' })
    expect(formatQuantity({ qty: 2260.87, unit: 'g' })).toEqual({ qty: 4.98, unit: 'lb' })
  })
  it('falls back to the smallest unit below 1', () => {
    expect(formatQuantity({ qty: 0.5, unit: 'ml' })).toEqual({ qty: 0.5, unit: 'ml' })
  })
  it('count always renders as each — never dozens', () => {
    expect(formatQuantity({ qty: 150, unit: 'each' })).toEqual({ qty: 150, unit: 'each' })
    expect(formatQuantity({ qty: 2, unit: 'dozen' })).toEqual({ qty: 24, unit: 'each' })
  })
  it('leaves custom units as entered (rounded to 2dp)', () => {
    expect(formatQuantity({ qty: 40.333333, unit: 'shot' })).toEqual({ qty: 40.33, unit: 'shot' })
  })
})

describe('qtyValue / asQuantity (legacy bare numbers)', () => {
  it('reads bare numbers and Quantity objects', () => {
    expect(qtyValue(3)).toBe(3)
    expect(qtyValue({ qty: 2.5, unit: 'oz' })).toBe(2.5)
  })
  it('wraps bare numbers in the fallback unit', () => {
    expect(asQuantity(3, 'oz')).toEqual({ qty: 3, unit: 'oz' })
    expect(asQuantity({ qty: 1, unit: 'lb' }, 'oz')).toEqual({ qty: 1, unit: 'lb' })
  })
})

describe('resolveDimension', () => {
  it('prefers the stored dimension', () => {
    expect(resolveDimension({ dimension: 'volume', unit: 'oz' })).toBe('volume')
  })
  it('infers from a universal display unit', () => {
    expect(resolveDimension({ unit: 'oz' })).toBe('weight')
    expect(resolveDimension({ unit: 'gal' })).toBe('volume')
  })
  it('defaults to count', () => {
    expect(resolveDimension({ unit: 'bag' })).toBe('count')
    expect(resolveDimension({})).toBe('count')
  })
})

describe('validateBridges', () => {
  it('accepts cross-dimension and custom-unit bridges', () => {
    expect(() => validateBridges([lbToShot])).not.toThrow()
  })
  it('rejects non-positive or non-finite quantities', () => {
    expect(() => validateBridges([{ from: { qty: 0, unit: 'lb' }, to: { qty: 40, unit: 'shot' }, source: 'ai' }]))
      .toThrow('Conversion quantities must be positive')
    expect(() => validateBridges([{ from: { qty: 1, unit: 'lb' }, to: { qty: Infinity, unit: 'shot' }, source: 'ai' }]))
      .toThrow('Conversion quantities must be positive')
  })
  it('rejects bridges between two universal units of the same dimension', () => {
    expect(() => validateBridges([{ from: { qty: 1, unit: 'oz' }, to: { qty: 2, unit: 'lb' }, source: 'ai' }]))
      .toThrow('built-in')
  })
})

describe('unitOptionsForResource', () => {
  it('lists the display unit first, then dimension units, then bridge units', () => {
    const opts = unitOptionsForResource({ unit: 'oz', conversions: [lbToShot] })
    expect(opts[0]).toBe('oz')
    expect(opts).toContain('lb')
    expect(opts).toContain('kg')
    expect(opts).toContain('shot')
    expect(opts).not.toContain('gal')
  })
  it('falls back to count units for unitless resources', () => {
    expect(unitOptionsForResource({})).toEqual(['each', 'dozen'])
  })
})

describe('CANONICAL_UNIT', () => {
  it('is ml / g / each', () => {
    expect(CANONICAL_UNIT).toEqual({ volume: 'ml', weight: 'g', count: 'each' })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/ops/units.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ops/units'` (or equivalent resolve error).

- [ ] **Step 4: Implement `lib/ops/units.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/ops/units.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/ops/units.ts __tests__/lib/ops/units.test.ts
git commit -m "feat(ops): universal unit table, conversion bridges, convert() engine"
```

---

### Task 2: Resource dimension + bridges persistence

**Files:**
- Modify: `lib/types.ts:730-739` (`OpsResource`)
- Modify: `lib/ops/resources.ts`
- Test: `__tests__/lib/ops/units.test.ts` covers the pure parts (Task 1); this task's core changes are exercised by typecheck + the existing `ResourcesTab.test.tsx` remaining green.

**Interfaces:**
- Consumes: `Dimension`, `ConversionBridge` (Task 1 types); `resolveDimension`, `validateBridges` from `@/lib/ops/units`.
- Produces: `OpsResource.dimension?: Dimension` and `OpsResource.conversions?: ConversionBridge[]`; `listResourcesCore` always returns resources with `dimension` filled; `CreateResourceInput`/`ResourceUpdate` accept the two new fields. Tasks 3–5 rely on `dimension` being present after `listResourcesCore`.

- [ ] **Step 1: Extend `OpsResource` in `lib/types.ts`**

Replace the `OpsResource` interface (lines 730–739) with:

```ts
export interface OpsResource {
  id: string
  name: string
  kind: ResourceKind
  unit?: string        // display unit for quantities: 'oz', 'each', 'gal'
  unit_cost?: number   // dollars per `unit`; feeds closeout margin
  dimension?: Dimension            // fundamental measure; legacy docs inferred on read (spec §3.3)
  conversions?: ConversionBridge[] // AI/operator bridges: density, yields, custom serving units
  notes?: string
  created_at: string
  updated_at?: string
}
```

- [ ] **Step 2: Wire dimension + bridges through `lib/ops/resources.ts`**

Apply these edits:

1. Update the type import:
```ts
import type { ConversionBridge, Dimension, OpsResource, ResourceKind } from '@/lib/types'
import { resolveDimension, validateBridges } from '@/lib/ops/units'
```

2. Add to `CreateResourceInput` (after `unit_cost?: number`):
```ts
  dimension?: Dimension
  conversions?: ConversionBridge[]
```

3. Add to `ResourceUpdate` (after `unit_cost?: number | null`):
```ts
  dimension?: Dimension | null
  conversions?: ConversionBridge[] | null
```

4. Replace `listResourcesCore` so legacy docs come back with a dimension (inferred, not persisted — spec §3.3):
```ts
export async function listResourcesCore(orgId: string): Promise<OpsResource[]> {
  const snap = await resourcesRef(orgId).orderBy('name').get()
  return snap.docs.map((d) => {
    const r = d.data() as OpsResource
    return r.dimension ? r : { ...r, dimension: resolveDimension(r) }
  })
}
```

5. In `createResourceCore`, after the kind check add:
```ts
  if (input.conversions) validateBridges(input.conversions)
```
and in the `resource` object literal, after the `unit_cost` spread add:
```ts
    dimension: input.dimension ?? resolveDimension(input),
    ...(input.conversions !== undefined ? { conversions: input.conversions } : {}),
```

6. In `updateResourceCore`, after the name check add:
```ts
  if (updates.conversions) validateBridges(updates.conversions)
```
and after the `cleaned` loop (before the `.update(...)` call) add the persist-on-save inference — when the display unit changes without an explicit dimension, recompute it:
```ts
  if (updates.unit !== undefined && updates.dimension === undefined) {
    cleaned.dimension = resolveDimension({ unit: updates.unit ?? undefined })
  }
```

- [ ] **Step 3: Verify types and existing tests**

Run: `npx tsc --noEmit && npx vitest run __tests__/lib/ops/units.test.ts __tests__/components/admin/ops/ResourcesTab.test.tsx`
Expected: PASS, no type errors. (ResourcesTab doesn't touch the new optional fields.)

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/ops/resources.ts
git commit -m "feat(ops): resource dimension + conversion bridges, inferred for legacy docs"
```

---

### Task 3: Unit-aware package lines

**Files:**
- Modify: `lib/types.ts:741-744` (`WorkPackageLine`)
- Modify: `lib/ops/work-packages.ts:33-43` (`validateLines`)
- Test: existing suites stay green (`npx tsc --noEmit`, derive + PackagesTab tests updated in Tasks 4–5)

**Interfaces:**
- Consumes: `Quantity` (Task 1); `qtyValue` from `@/lib/ops/units`.
- Produces: consumable `WorkPackageLine` where `qty_per_guest: number | Quantity` and `base_qty?: number | Quantity`. **Legacy rule (spec §4.1): a bare `number` is read as a quantity in the resource's display unit** — every consumer must go through `asQuantity(v, resource.unit ?? 'each')`. Tasks 4–5 depend on this union.

- [ ] **Step 1: Change the line type in `lib/types.ts`**

Replace the `WorkPackageLine` union (lines 741–744) with:

```ts
export type WorkPackageLine =
  // consumable quantities: bare numbers are legacy docs, read as the resource's
  // display unit (spec 2026-08-13 §4.1); new writes use Quantity.
  | { kind: 'consumable'; resource_id: string; qty_per_guest: number | Quantity; base_qty?: number | Quantity }
  | { kind: 'equipment'; resource_id: string; qty: number }
  | { kind: 'labor'; role: string; count: number }   // recorded stub; staffing is a later phase
```

- [ ] **Step 2: Make `validateLines` union-aware in `lib/ops/work-packages.ts`**

Add the import at the top:
```ts
import { qtyValue } from '@/lib/ops/units'
```

Replace `validateLines` (lines 33–43) with:
```ts
function validateLines(lines: WorkPackageLine[], validResourceIds: Set<string>): void {
  for (const line of lines) {
    if (line.kind === 'labor') {
      if (line.count <= 0) throw new Error('Quantities must be positive')
      continue
    }
    if (!validResourceIds.has(line.resource_id)) throw new Error(`Unknown resource: ${line.resource_id}`)
    const qty = line.kind === 'consumable' ? qtyValue(line.qty_per_guest) : line.qty
    if (qty <= 0) throw new Error('Quantities must be positive')
    if (line.kind === 'consumable' && typeof line.qty_per_guest === 'object' && !line.qty_per_guest.unit.trim()) {
      throw new Error('Unit is required')
    }
  }
}
```

(`sanitizeLines` needs no change: it strips only top-level `undefined` keys, and `Quantity` objects contain none.)

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `lib/ops/derive.ts` and `components/admin/ops/PackagesTab.tsx` (they still treat `qty_per_guest` as a bare number — fixed in Tasks 4 and 5). If other files error, fix them the same way: route reads through `qtyValue`/`asQuantity`. Check `scripts/seed/brewtrax-data.ts` and `scripts/seed-demo.ts` compile (bare numbers remain valid members of the union, so they should).

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/ops/work-packages.ts
git commit -m "feat(ops): unit-aware consumable package lines (number | Quantity union)"
```

---

### Task 4: Derive engine — convert, merge, bucket, format

**Files:**
- Modify: `lib/ops/derive.ts` (`mergeInto`, `computeShoppingList`, `computeCloseoutSummary`)
- Modify: `lib/types.ts:785-791` (`OpsListItem`), `lib/types.ts:843-849` (`CloseoutSummary`)
- Test: `__tests__/lib/ops/derive.test.ts`

**Interfaces:**
- Consumes: `convert`, `formatQuantity`, `asQuantity`, `qtyValue`, `resolveDimension`, `normalizeUnit`, `CANONICAL_UNIT` from `@/lib/ops/units` (Task 1); the line union (Task 3).
- Produces: `computeShoppingList` unchanged signature, items now display-formatted (`{qty, unit}` in the most human unit), plus `needs_conversion?: true` items for unconvertible quantities. `computeCloseoutSummary` unchanged signature, `CloseoutSummary` gains `cost_gaps?: string[]` (resource names whose planned cost was omitted for lack of a conversion path). `computePackingList`, `deriveDeadlines`, `instantiateChecklists` untouched.

- [ ] **Step 1: Extend the two result types in `lib/types.ts`**

In `OpsListItem` (lines 785–791), add after `unit?: string`:
```ts
  needs_conversion?: boolean  // quantity kept in its entered unit; no path to the resource's canonical unit (spec §3.4)
```

In `CloseoutSummary` (lines 843–849), add after `actual_margin: number`:
```ts
  cost_gaps?: string[]  // resource names omitted from planned cost: cost known but no conversion path to its unit (spec §4.3)
```

- [ ] **Step 2: Update the failing tests first**

In `__tests__/lib/ops/derive.test.ts`, replace the `computeShoppingList` describe block with:

```ts
describe('computeShoppingList', () => {
  it('scales consumables by guests, converts to the most human unit', () => {
    const p = pkg({ lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: 0.75, base_qty: 4 }] })
    const list = computeShoppingList([p], resources, 101)
    // 4 + 0.75×101 = 79.75 oz (weight) → 4.98 lb; continuous quantities are NOT ceiled
    expect(list).toEqual([{ resource_id: 'res-beans', name: 'Espresso beans', qty: 4.98, unit: 'lb', checked: false }])
  })

  it('merges mixed units for one resource through the universal table', () => {
    const a = pkg({ id: 'a', lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: { qty: 1, unit: 'oz' } }] })
    const b = pkg({ id: 'b', lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: { qty: 0.01, unit: 'lb' } }] })
    // 100 oz + 1 lb = 6.25 lb + 1 lb = 7.25 lb
    const list = computeShoppingList([a, b], resources, 100)
    expect(list).toEqual([{ resource_id: 'res-beans', name: 'Espresso beans', qty: 7.25, unit: 'lb', checked: false }])
  })

  it('merges duplicate count resources across packages and ceils count totals', () => {
    const a = pkg({ id: 'a', lines: [{ kind: 'consumable', resource_id: 'res-cups', qty_per_guest: 1 }] })
    const b = pkg({ id: 'b', lines: [{ kind: 'consumable', resource_id: 'res-cups', qty_per_guest: 0.505 }] })
    const list = computeShoppingList([a, b], resources, 100)
    // 100 + 50.5 = 150.5 → ceil 151 (count dimension only)
    expect(list).toEqual([{ resource_id: 'res-cups', name: '12oz cups', qty: 151, unit: 'each', checked: false }])
  })

  it('uses bridges to reach the canonical unit', () => {
    const withBridge: OpsResource[] = [{
      ...resources[0],
      conversions: [{ from: { qty: 1, unit: 'lb' }, to: { qty: 40, unit: 'shot' }, source: 'ai' }],
    }]
    const p = pkg({ lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: { qty: 2, unit: 'shot' } }] })
    const list = computeShoppingList([p], withBridge, 100)
    // 200 shot → 5 lb
    expect(list).toEqual([{ resource_id: 'res-beans', name: 'Espresso beans', qty: 5, unit: 'lb', checked: false }])
  })

  it('buckets unconvertible quantities in their entered unit with a flag — never guesses, never drops', () => {
    const p = pkg({ lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: { qty: 2, unit: 'shot' } }] })
    const list = computeShoppingList([p], resources, 100)   // no bridge for 'shot'
    expect(list).toEqual([{
      resource_id: 'res-beans', name: 'Espresso beans', qty: 200, unit: 'shot', checked: false, needs_conversion: true,
    }])
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
```

Add to the fixtures near the top (the `resources` array is unchanged — beans stay `unit: 'oz'`, cups `unit: 'each'`).

Replace the `computeCloseoutSummary` describe block with:

```ts
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
    expect(summary.planned_consumable_cost).toBeCloseTo(55)   // 100 oz × $0.55/oz
    expect(summary.actual_consumable_cost).toBeCloseTo(49.5)  // 90 × 0.55
    expect(summary.revenue).toBe(1350)                        // 1200 + 150
    expect(summary.planned_margin).toBeCloseTo(1295)
    expect(summary.actual_margin).toBeCloseTo(1300.5)
    expect(summary.cost_gaps).toBeUndefined()
  })

  it('converts line units to the cost unit', () => {
    // cost is $0.55 per oz; line entered in lb → 1 lb × 100 = 100 lb = 1600 oz → $880
    const p = pkg({ lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: { qty: 1, unit: 'lb' } }] })
    const summary = computeCloseoutSummary({ packages: [p], resources, guests: 100, actual_consumables: [], sales: 0 })
    expect(summary.planned_consumable_cost).toBeCloseTo(880)
  })

  it('omits and flags unconvertible costed lines instead of guessing', () => {
    const p = pkg({ lines: [{ kind: 'consumable', resource_id: 'res-beans', qty_per_guest: { qty: 2, unit: 'shot' } }] })
    const summary = computeCloseoutSummary({ packages: [p], resources, guests: 100, actual_consumables: [], sales: 0 })
    expect(summary.planned_consumable_cost).toBe(0)
    expect(summary.cost_gaps).toEqual(['Espresso beans'])
  })

  it('treats resources without unit_cost as zero cost', () => {
    const p = pkg({ lines: [{ kind: 'consumable', resource_id: 'res-machine', qty_per_guest: 1 }] })
    const summary = computeCloseoutSummary({ packages: [p], resources, guests: 10, actual_consumables: [], sales: 0 })
    expect(summary.planned_consumable_cost).toBe(0)
    expect(summary.cost_gaps).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run tests to verify the new expectations fail**

Run: `npx vitest run __tests__/lib/ops/derive.test.ts`
Expected: FAIL — old implementation returns `{qty: 80, unit: 'oz'}` for the first test, type errors on Quantity lines, etc.

- [ ] **Step 4: Rewrite `computeShoppingList` and `computeCloseoutSummary` in `lib/ops/derive.ts`**

Add to the imports:
```ts
import type { Quantity } from '@/lib/types'
import {
  CANONICAL_UNIT, asQuantity, convert, formatQuantity, normalizeUnit, qtyValue, resolveDimension,
} from '@/lib/ops/units'
```

Replace `mergeInto` + `computeShoppingList` (lines 33–69) with:

```ts
/** Per-line contributions in their entered units: per-guest × guests, plus base. */
function lineContributions(
  line: Extract<WorkPackageLine, { kind: 'consumable' }>,
  fallbackUnit: string,
  guests: number,
): Quantity[] {
  const per = asQuantity(line.qty_per_guest, fallbackUnit)
  const out: Quantity[] = [{ qty: per.qty * guests, unit: per.unit }]
  if (line.base_qty !== undefined) out.push(asQuantity(line.base_qty, fallbackUnit))
  return out
}

/**
 * Consumable lines × guests (+ base_qty), converted to each resource's canonical
 * unit, merged, then displayed in the most human unit (spec 2026-08-13 §4.3).
 * Count totals are ceiled; continuous (volume/weight) totals are not.
 * Quantities with no conversion path stay in their entered unit, merged per unit,
 * flagged needs_conversion — never guessed, never dropped, never blocking.
 */
export function computeShoppingList(
  packages: WorkPackage[],
  resources: OpsResource[],
  guests: number,
): OpsListItem[] {
  const byId = resourceById(resources)
  const canonicalTotals = new Map<string, number>()        // resource_id → qty in canonical unit
  const stuck = new Map<string, OpsListItem>()             // `${resource_id}|${unit}` → unconverted item
  const legacy = new Map<string, OpsListItem>()            // unknown resources: pre-units behavior

  for (const p of packages) {
    for (const line of p.lines) {
      if (line.kind !== 'consumable') continue
      const res = byId.get(line.resource_id)
      if (!res) {
        const qty = qtyValue(line.base_qty ?? 0) + qtyValue(line.qty_per_guest) * guests
        const existing = legacy.get(line.resource_id)
        if (existing) existing.qty += qty
        else legacy.set(line.resource_id, { resource_id: line.resource_id, name: 'Unknown resource', qty, checked: false })
        continue
      }
      const dim = resolveDimension(res)
      for (const c of lineContributions(line, res.unit ?? 'each', guests)) {
        const canon = convert(c, CANONICAL_UNIT[dim], res.conversions ?? [])
        if (canon) {
          canonicalTotals.set(res.id, (canonicalTotals.get(res.id) ?? 0) + canon.qty)
        } else {
          const key = `${res.id}|${normalizeUnit(c.unit)}`
          const existing = stuck.get(key)
          if (existing) existing.qty += c.qty
          else stuck.set(key, {
            resource_id: res.id, name: res.name, qty: c.qty, unit: normalizeUnit(c.unit),
            checked: false, needs_conversion: true,
          })
        }
      }
    }
  }

  const items: OpsListItem[] = []
  for (const [id, total] of canonicalTotals) {
    const res = byId.get(id)!
    const dim = resolveDimension(res)
    const rounded = dim === 'count' ? Math.ceil(total) : total
    const display = formatQuantity({ qty: rounded, unit: CANONICAL_UNIT[dim] })
    items.push({ resource_id: id, name: res.name, qty: display.qty, unit: display.unit, checked: false })
  }
  for (const item of stuck.values()) {
    items.push({ ...item, qty: Math.round(item.qty * 100) / 100 })
  }
  for (const item of legacy.values()) {
    items.push({ ...item, qty: Math.ceil(item.qty) })
  }
  return items
}
```

Replace `computeCloseoutSummary`'s planned-cost loop (keep the rest of the function) so the whole function reads:

```ts
/** Planned vs actual consumable cost and margins (spec §3.5). Labor cost is out of scope in v1.
 *  unit_cost is denominated in the resource's display unit; line quantities are converted to it.
 *  Costed lines with no conversion path are omitted and named in cost_gaps (spec 2026-08-13 §4.3). */
export function computeCloseoutSummary(input: CloseoutSummaryInput): CloseoutSummary {
  const byId = resourceById(input.resources)
  let planned = 0
  const gaps = new Set<string>()
  for (const p of input.packages) {
    for (const line of p.lines) {
      if (line.kind !== 'consumable') continue
      const res = byId.get(line.resource_id)
      const cost = res?.unit_cost
      if (!res || cost === undefined) continue   // unknown or uncosted: zero contribution, as before
      const costUnit = res.unit
      for (const c of lineContributions(line, costUnit ?? 'each', input.guests)) {
        if (costUnit === undefined) {
          planned += c.qty * cost                // no cost unit recorded — legacy multiply
          continue
        }
        const converted = convert(c, costUnit, res.conversions ?? [])
        if (converted) planned += converted.qty * cost
        else gaps.add(res.name)
      }
    }
  }
  let actual = 0
  for (const a of input.actual_consumables) {
    actual += a.qty_used * (byId.get(a.resource_id)?.unit_cost ?? 0)
  }
  const revenue = input.packages.reduce((sum, p) => sum + p.price, 0) + input.sales
  return {
    planned_consumable_cost: planned,
    actual_consumable_cost: actual,
    revenue,
    planned_margin: revenue - planned,
    actual_margin: revenue - actual,
    ...(gaps.size > 0 ? { cost_gaps: [...gaps] } : {}),
  }
}
```

Also add `WorkPackageLine` to the existing type-import list at the top of `derive.ts` (needed by `lineContributions`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/ops/derive.test.ts __tests__/lib/ops/event-ops.test.ts __tests__/lib/ops/event-ops-execution.test.ts __tests__/components/admin/ops/ListsCard.test.tsx __tests__/components/admin/ops/CloseoutClient.test.tsx __tests__/actions/event-ops.test.ts`
Expected: PASS. If event-ops/ListsCard/Closeout tests assert on old shopping-list numbers (e.g. ceiled oz), update those fixtures to the new formatted values using the same arithmetic as the derive tests above — the shapes (`OpsListItem`, `CloseoutSummary`) are backward-compatible, only numeric/unit values shift.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/ops/derive.ts __tests__/lib/ops/derive.test.ts
git commit -m "feat(ops): derive converts to canonical units, buckets unconvertibles, count-only ceiling"
```

---

### Task 5: PackagesTab unit selector

**Files:**
- Modify: `components/admin/ops/PackagesTab.tsx`
- Test: `__tests__/components/admin/ops/PackagesTab.test.tsx`

**Interfaces:**
- Consumes: `qtyValue`, `asQuantity`, `unitOptionsForResource` from `@/lib/ops/units`; `Quantity` type.
- Produces: consumable lines are saved in Quantity form: `qty_per_guest: { qty, unit }` (and `base_qty` likewise when set). The unit `<select>` has aria-label `Consumable ${i + 1} unit`.

- [ ] **Step 1: Update the failing tests first**

In `__tests__/components/admin/ops/PackagesTab.test.tsx`:

1. In the "creates a package…" test, replace the `createWorkPackage` expectation's `lines` with:
```ts
      lines: [{ kind: 'consumable', resource_id: 'r1', qty_per_guest: { qty: 0.5, unit: 'oz' } }],
```

2. Add a new test after it:
```ts
  it('lets the operator pick a different compatible unit for a consumable line', async () => {
    render(<PackagesTab orgId="o1" isAdmin packages={[]} resources={[beans, machine]} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'New package' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bulk Brew' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add consumable' }))
    fireEvent.change(screen.getByLabelText('Consumable 1 resource'), { target: { value: 'r1' } })
    fireEvent.change(screen.getByLabelText('Consumable 1 qty per guest'), { target: { value: '0.05' } })
    fireEvent.change(screen.getByLabelText('Consumable 1 unit'), { target: { value: 'lb' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save package' }))
    await waitFor(() => expect(createWorkPackage).toHaveBeenCalledWith('o1', expect.objectContaining({
      lines: [{ kind: 'consumable', resource_id: 'r1', qty_per_guest: { qty: 0.05, unit: 'lb' } }],
    })))
  })
```

3. Add a legacy-summary regression test (bare-number lines still render with the resource unit — the existing "lists packages" test's `/0\.75 oz × guests/` assertion already covers this; leave it untouched and confirm it passes).

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run __tests__/components/admin/ops/PackagesTab.test.tsx`
Expected: FAIL — no element labeled `Consumable 1 unit`; create payload has bare-number `qty_per_guest`.

- [ ] **Step 3: Implement in `components/admin/ops/PackagesTab.tsx`**

1. Extend imports:
```ts
import { asQuantity, qtyValue, unitOptionsForResource } from '@/lib/ops/units'
import type { OpsResource, WorkPackage, WorkPackageLine, ChecklistTemplate } from '@/lib/types'
```

2. Replace `lineSummary` (lines 38–48) with:
```ts
function lineSummary(line: WorkPackageLine, resourceById: Map<string, OpsResource>): string {
  if (line.kind === 'labor') return `${line.role} × ${line.count}`
  const r = resourceById.get(line.resource_id)
  const name = r?.name ?? line.resource_id
  if (line.kind === 'consumable') {
    const per = asQuantity(line.qty_per_guest, r?.unit ?? 'each')
    const base = line.base_qty !== undefined ? asQuantity(line.base_qty, per.unit) : undefined
    return `${name}: ${per.qty} ${per.unit} × guests${base ? ` + ${base.qty} ${base.unit} base` : ''}`
  }
  return `${name} × ${line.qty}`
}
```
(Bare-number legacy lines render exactly as before: `0.75 oz × guests`, because the fallback is the resource's display unit — but the old code omitted the unit when the resource had none, while this renders `each`. That matches spec §3.3's count default.)

3. Replace `linesComplete` (lines 51–57) with:
```ts
function linesComplete(lines: WorkPackageLine[]): boolean {
  return lines.every((l) => {
    if (l.kind === 'consumable') return l.resource_id !== '' && qtyValue(l.qty_per_guest) > 0
    if (l.kind === 'equipment') return l.resource_id !== '' && l.qty > 0
    return l.role.trim() !== '' && l.count > 0
  })
}
```

4. Inside the component, after `const resourceById = …` add a helper that pins a consumable line's working unit:
```ts
  function lineUnit(line: Extract<WorkPackageLine, { kind: 'consumable' }>): string {
    if (typeof line.qty_per_guest === 'object') return line.qty_per_guest.unit
    return resourceById.get(line.resource_id)?.unit ?? 'each'
  }
```

5. In `edit()` (line 153), normalize draft lines to Quantity form so the editor state has one shape — replace `lines: p.lines,` with:
```ts
      lines: p.lines.map((l): WorkPackageLine => {
        if (l.kind !== 'consumable') return l
        const unit = typeof l.qty_per_guest === 'object' ? l.qty_per_guest.unit : (resourceById.get(l.resource_id)?.unit ?? 'each')
        return {
          ...l,
          qty_per_guest: asQuantity(l.qty_per_guest, unit),
          ...(l.base_qty !== undefined ? { base_qty: asQuantity(l.base_qty, unit) } : {}),
        }
      }),
```

6. In the consumable line editor (lines 251–279):

- Resource select `onChange` becomes (unit follows the newly picked resource):
```ts
                        onChange={(e) => {
                          const unit = resourceById.get(e.target.value)?.unit ?? 'each'
                          setLine(i, {
                            ...line,
                            resource_id: e.target.value,
                            qty_per_guest: { qty: qtyValue(line.qty_per_guest), unit },
                            ...(line.base_qty !== undefined ? { base_qty: { qty: qtyValue(line.base_qty), unit } } : {}),
                          })
                        }}
```

- Per-guest qty input `value`/`onChange` become:
```ts
                        value={qtyValue(line.qty_per_guest) || ''}
                        onChange={(e) => setLine(i, { ...line, qty_per_guest: { qty: Number(e.target.value), unit: lineUnit(line) } })}
```

- Insert the unit select between the qty input and the `× guests` span:
```tsx
                      <select
                        aria-label={`Consumable ${i + 1} unit`}
                        value={lineUnit(line)}
                        onChange={(e) => setLine(i, {
                          ...line,
                          qty_per_guest: { qty: qtyValue(line.qty_per_guest), unit: e.target.value },
                          ...(line.base_qty !== undefined ? { base_qty: { qty: qtyValue(line.base_qty), unit: e.target.value } } : {}),
                        })}
                        className="h-9 rounded-md border border-gray-300 px-2 text-sm"
                      >
                        {(resourceById.has(line.resource_id)
                          ? unitOptionsForResource(resourceById.get(line.resource_id)!)
                          : ['each']
                        ).map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
```

- Base qty input `value`/`onChange` become:
```ts
                        value={line.base_qty !== undefined ? qtyValue(line.base_qty) : ''}
                        onChange={(e) => {
                          const v = e.target.value
                          const { base_qty: _drop, ...rest } = line
                          setLine(i, v === '' ? rest : { ...rest, base_qty: { qty: Number(v), unit: lineUnit(line) } })
                        }}
```

7. "Add consumable" default line (line 325) becomes:
```ts
                  onClick={() => setDraft({ ...draft, lines: [...draft.lines, { kind: 'consumable', resource_id: '', qty_per_guest: { qty: 0, unit: 'each' } }] })}>
```

(One unit per line: `base_qty` shares the per-guest unit by design — the single selector governs both.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/components/admin/ops/PackagesTab.test.tsx`
Expected: PASS, including the untouched legacy-summary and Save-gating tests.

- [ ] **Step 5: Commit**

```bash
git add components/admin/ops/PackagesTab.tsx __tests__/components/admin/ops/PackagesTab.test.tsx
git commit -m "feat(ops): unit selector on consumable package lines"
```

---

### Task 6: Full verification

**Files:**
- No new files — whole-repo checks.

**Interfaces:**
- Consumes: everything above.
- Produces: a green branch.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run --exclude '**/.claude/**'`
Expected: PASS. Any failure outside the files this plan touched means a consumer was missed — fix it by routing quantity reads through `qtyValue`/`asQuantity` (the legacy rule from Task 3), not by changing the engine.

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit && npx next build`
Expected: both succeed. (`next build` is required — tsc alone has passed on branches that failed the build in this repo.)

- [ ] **Step 3: Verify AI grounding still serializes**

`lib/ai/grounding.ts` serializes resources as `id | name | kind | unit` — confirm it compiles untouched (it reads only fields that still exist). Do not extend the serialization in this increment; that's Increment 5.

- [ ] **Step 4: Commit any stragglers**

```bash
git status
git add -A ':!docs' && git commit -m "test: adjust consumers of unit-aware derive output" || true
```

(Skip the commit if the tree is clean.)

---

## Out of scope for this increment (from spec §11)

- Sub-package/recipe lines and yields (Increment 2)
- Bridge-editing UI on ResourcesTab and surfacing `needs_conversion` / `cost_gaps` in ListsCard/CloseoutClient beyond what already renders (Increment 2 UI pass)
- Org-level vendors and price books (Increment 3)
- `catalog_ref` on proposals (Increment 4)
- AI intake and grounding-serialization changes (Increment 5)
