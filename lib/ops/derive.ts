// Pure derivation engine — spec §3.3. NO backend/DB imports of any kind;
// everything here is unit-testable with plain objects. The chain: packages
// × guests → lists; event date × pack → deadlines; templates → checklist
// instances.
import type {
  WorkPackage, WorkPackageLine, OpsResource, ChecklistTemplate, ChecklistPhase,
  OpsDeadline, OpsListItem, OpsChecklist, CloseoutSummary, Quantity,
} from '@/lib/types'
import {
  CANONICAL_UNIT, asQuantity, convert, formatQuantity, normalizeUnit, qtyValue, resolveDimension,
} from '@/lib/ops/units'

/** Canonical checklist phase order (spec §3.3) — shared by ChecklistsCard (sort order) and ChecklistTemplatesTab (grouping). */
export const CHECKLIST_PHASES: ChecklistPhase[] = ['prep', 'load-out', 'setup', 'service-close', 'closeout']

/** Canonical on-site needs options — shared by OpsSetup and RequirementsCard. */
export const SITE_NEED_OPTIONS = ['power', 'water', 'ice', 'parking'] as const

export const DEADLINE_TEMPLATES: Record<string, { id: string; label: string; days_before: number }[]> = {
  'coffee-cart': [
    { id: 'dl-confirm-permit', label: 'Confirm permits & insurance current', days_before: 14 },
    { id: 'dl-confirm-site', label: 'Confirm site details (power, water, access)', days_before: 10 },
    { id: 'dl-order-consumables', label: 'Order consumables', days_before: 7 },
    { id: 'dl-final-payment', label: 'Final payment due', days_before: 3 },
  ],
  general: [
    { id: 'dl-confirm-details', label: 'Confirm event details with client', days_before: 7 },
    { id: 'dl-final-payment', label: 'Final payment due', days_before: 3 },
  ],
}

function resourceById(resources: OpsResource[]): Map<string, OpsResource> {
  return new Map(resources.map((r) => [r.id, r]))
}

function mergeInto(
  acc: Map<string, OpsListItem>,
  resource_id: string,
  qty: number,
  byId: Map<string, OpsResource>,
): void {
  const existing = acc.get(resource_id)
  if (existing) {
    existing.qty += qty
    return
  }
  const res = byId.get(resource_id)
  acc.set(resource_id, {
    resource_id,
    name: res?.name ?? 'Unknown resource',
    qty,
    ...(res?.unit !== undefined ? { unit: res.unit } : {}),
    checked: false,
  })
}

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
  const displayUnit = new Map<string, OpsListItem>()        // resource_id → contributions already in the resource's own display unit (no conversion path, but not foreign)
  const stuck = new Map<string, OpsListItem>()             // `${resource_id}|${unit}` → unconverted, genuinely foreign-unit item
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
        } else if (normalizeUnit(c.unit) === normalizeUnit(res.unit ?? '')) {
          // Same unit as the resource's own display unit (e.g. a custom free-text
          // unit like 'bag' with no universal conversion): NOT a genuine
          // conversion gap — merge and ceil/round like any other resolved total,
          // never flag (spec: legacy custom-unit resources must not regress).
          const existing = displayUnit.get(res.id)
          if (existing) existing.qty += c.qty
          else displayUnit.set(res.id, {
            resource_id: res.id, name: res.name, qty: c.qty, unit: normalizeUnit(c.unit), checked: false,
          })
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
    const display = formatQuantity({ qty: rounded, unit: CANONICAL_UNIT[dim] }, res.unit)
    items.push({ resource_id: id, name: res.name, qty: display.qty, unit: display.unit, checked: false })
  }
  for (const [id, item] of displayUnit) {
    const res = byId.get(id)!
    const dim = resolveDimension(res)
    const qty = dim === 'count' ? Math.ceil(item.qty) : Math.round(item.qty * 100) / 100
    items.push({ ...item, qty })
  }
  for (const item of stuck.values()) {
    items.push({ ...item, qty: Math.round(item.qty * 100) / 100 })
  }
  for (const item of legacy.values()) {
    items.push({ ...item, qty: Math.ceil(item.qty) })
  }
  return items
}

/** Equipment lines merged by resource. */
export function computePackingList(packages: WorkPackage[], resources: OpsResource[]): OpsListItem[] {
  const byId = resourceById(resources)
  const acc = new Map<string, OpsListItem>()
  for (const p of packages) {
    for (const line of p.lines) {
      if (line.kind !== 'equipment') continue
      mergeInto(acc, line.resource_id, line.qty, byId)
    }
  }
  return [...acc.values()]
}

/** Deadlines derived backward from the event start date (spec: auto-generated, pack-templated). */
export function deriveDeadlines(eventStart: string, industryPackId: string | undefined): OpsDeadline[] {
  const template = DEADLINE_TEMPLATES[industryPackId ?? 'general'] ?? DEADLINE_TEMPLATES['general']
  const start = new Date(`${eventStart.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(start.getTime())) throw new Error('Invalid event date')
  return template.map((t) => {
    const due = new Date(start)
    due.setUTCDate(due.getUTCDate() - t.days_before)
    return { id: t.id, label: t.label, due: due.toISOString().slice(0, 10), done: false }
  })
}

/** Checklist instances: template steps copied as un-done steps. Instance id = template id. */
export function instantiateChecklists(templates: ChecklistTemplate[]): OpsChecklist[] {
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    phase: t.phase,
    steps: t.steps.map((s) => ({ text: s.text, evidence: s.evidence, done: false })),
  }))
}

export interface CloseoutSummaryInput {
  packages: WorkPackage[]
  resources: OpsResource[]
  guests: number
  actual_consumables: { resource_id: string; qty_used: number }[]
  sales: number
}

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
