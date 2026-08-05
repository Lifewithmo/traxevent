// Pure derivation engine — spec §3.3. NO backend/DB imports of any kind;
// everything here is unit-testable with plain objects. The chain: packages
// × guests → lists; event date × pack → deadlines; templates → checklist
// instances.
import type {
  WorkPackage, OpsResource, ChecklistTemplate,
  OpsDeadline, OpsListItem, OpsChecklist, CloseoutSummary,
} from '@/lib/types'

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

/** Consumable lines × guests (+ base_qty), merged by resource, quantities rounded up. */
export function computeShoppingList(
  packages: WorkPackage[],
  resources: OpsResource[],
  guests: number,
): OpsListItem[] {
  const byId = resourceById(resources)
  const acc = new Map<string, OpsListItem>()
  for (const p of packages) {
    for (const line of p.lines) {
      if (line.kind !== 'consumable') continue
      mergeInto(acc, line.resource_id, (line.base_qty ?? 0) + line.qty_per_guest * guests, byId)
    }
  }
  return [...acc.values()].map((i) => ({ ...i, qty: Math.ceil(i.qty) }))
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

/** Planned vs actual consumable cost and margins (spec §3.5). Labor cost is out of scope in v1. */
export function computeCloseoutSummary(input: CloseoutSummaryInput): CloseoutSummary {
  const byId = resourceById(input.resources)
  let planned = 0
  for (const p of input.packages) {
    for (const line of p.lines) {
      if (line.kind !== 'consumable') continue
      const cost = byId.get(line.resource_id)?.unit_cost ?? 0
      planned += ((line.base_qty ?? 0) + line.qty_per_guest * input.guests) * cost
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
  }
}
