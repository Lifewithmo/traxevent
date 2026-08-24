// The shopping run — spec 2026-08-23 S2. Pure merge selector over N
// (event, plan) pairs + org resources: "Saturday wedding + Monday corporate =
// one store trip." NO backend/DB imports (derive.ts precedent) — everything
// here is unit-testable with plain objects and safe in client components.
//
// Scope decisions (both deliberate, both from the spec):
// - CLIENT JOBS ONLY: market days have no ops layer — no plan doc, no derived
//   lists — so there is nothing of theirs to merge. selectShoppingRunWindow
//   filters by kind for that reason, not as a product preference.
// - SHOPPING LISTS ONLY: packing stays per-event — custody of gear doesn't fan
//   out across jobs (each van load belongs to one job), but a store trip does.
import { CANONICAL_UNIT, convert, formatQuantity, normalizeUnit, resolveDimension } from '@/lib/ops/units'
import { kindOf } from '@/lib/occasions/kind'
import { addDays } from '@/lib/opportunity-detail'
import type { Event, OpsPlan, OpsResource, Quantity } from '@/lib/types'

/** Default run window: the next 7 days — one weekend-plus of jobs, one trip. */
export const RUN_DAYS = 7
/** Windows the ?days= URL param may select. */
export const RUN_WINDOW_OPTIONS = [3, 7, 14] as const
/** Fan-out cap — matches the readiness horizon's HORIZON_CAP so the org-home
 *  chip (computed from the horizon's already-fetched plans) and this page can
 *  never disagree about which jobs are in the run. */
export const RUN_CAP = 12

/** Whitelist-parse the ?days= URL param; anything else falls back to 7. */
export function parseRunDays(raw: string | undefined): number {
  const n = Number(raw)
  return (RUN_WINDOW_OPTIONS as readonly number[]).includes(n) ? n : RUN_DAYS
}

/**
 * Exclusions carried across window changes (the ?exclude= round-trip): an id
 * survives verbatim while its event still sits inside the WIDEST selectable
 * window — narrowing 14→3 must not silently drop a day-10 exclusion from the
 * URL and have that job rejoin the run when the window widens again. Ids that
 * left range entirely (past, beyond every window, archived, deleted) are
 * dropped: they can never render a scope chip again in ANY window, so the
 * drop changes nothing visible. (The capped widest window is a superset of
 * every narrower capped window — narrower windows only remove later-sorting
 * events — so "in the widest window" is exactly "can render a chip somewhere".)
 */
export function carryExcludedIds(raw: Iterable<string>, events: Event[], todayYmd: string): string[] {
  const widest = Math.max(...RUN_WINDOW_OPTIONS)
  const inRange = new Set(selectShoppingRunWindow(events, todayYmd, widest).map((e) => e.id))
  return [...raw].filter((id) => inRange.has(id))
}

export type ShoppingRunEventRef = Pick<Event, 'id' | 'name' | 'slug' | 'event_start'>

export interface ShoppingRunPair {
  event: ShoppingRunEventRef
  plan: OpsPlan
}

/**
 * The jobs whose lists merge into the run: client jobs, not archived, starting
 * within today..today+days inclusive, soonest first, capped at RUN_CAP.
 *
 * PARITY CONTRACT with lib/ops/readiness-horizon.ts's selectHorizonWindow:
 * identical filter shape, identical sort (event_start, then name), identical
 * cap. The org events home computes its run chip by filtering the horizon's
 * already-fetched window down to ≤ RUN_DAYS — because every ≤7d job sorts
 * before every 8–14d job, the horizon's capped 12 restricted to the run window
 * is EXACTLY this function's output for the same inputs. Change the sort or
 * cap here and the chip number stops matching this page. (RUN_DAYS ≤
 * HORIZON_DAYS and RUN_CAP === HORIZON_CAP are what make the claim hold.)
 */
export function selectShoppingRunWindow(events: Event[], todayYmd: string, days: number = RUN_DAYS): Event[] {
  const end = addDays(todayYmd, days)
  return events
    .filter((e) => e.status !== 'archived')
    .filter((e) => kindOf(e) === 'client_job')
    .filter((e) => {
      const day = e.event_start.slice(0, 10)
      return day >= todayYmd && day <= end
    })
    .sort((a, b) => a.event_start.localeCompare(b.event_start) || a.name.localeCompare(b.name))
    .slice(0, RUN_CAP)
}

export type RunChecked = 'none' | 'partial' | 'all'

/** One event's contribution to a merged row — the write-back unit: toggling it
 *  hits that event's own shopping_list item (resource_id|unit key). */
export interface RunConstituent {
  event_id: string
  event_name: string
  event_slug: string
  event_start: string          // YYYY-MM-DD
  resource_id: string
  qty: number                  // as stored on that event's list (already per-job rounded)
  unit?: string
  needs_conversion?: boolean
  checked: boolean
}

/** Per-key write identity for a constituent — `${event_id}:${resource_id}|${unit}`.
 *  Shared by the client's serialized-write keys and the bulk core's targets. */
export function constituentKey(c: Pick<RunConstituent, 'event_id' | 'resource_id' | 'unit'>): string {
  return `${c.event_id}:${c.resource_id}|${c.unit ?? ''}`
}

export interface ShoppingRunRow {
  key: string                  // stable row identity: resource_id for canonical rows, resource_id|unit for every per-unit row (display/stuck/unknown) — a resource can yield a canonical AND a display row at once, so per-unit rows must never use the bare id
  resource_id: string
  name: string
  qty: number                  // display quantity (human unit via formatQuantity)
  unit?: string
  /** Total in the dimension's canonical unit (ml/g/each) — present only for
   *  rows that fully converted. Carried in the output shape NOW as the
   *  vendor-books forward-compat hook (ops-catalog spec inc 3): supplier
   *  pack-size math needs canonical totals, not display units. */
  canonical?: Quantity
  needs_conversion?: boolean
  checked: RunChecked          // none / partial / all across constituents
  constituents: RunConstituent[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

function triState(constituents: RunConstituent[]): RunChecked {
  const done = constituents.filter((c) => c.checked).length
  if (done === 0) return 'none'
  return done === constituents.length ? 'all' : 'partial'
}

interface Bucket {
  name: string
  total: number
  unit?: string
  constituents: RunConstituent[]
}

/**
 * Merge N jobs' stored shopping lists into one run (derive.ts's
 * computeShoppingList parallel, applied to already-derived items):
 * - resource known + a conversion path (universal units, or the resource's own
 *   bridges) → convert each item to the dimension's canonical unit, sum per
 *   resource_id, display via formatQuantity in the resource's unit system.
 * - resource known, item in the resource's own display unit but no universal
 *   path (custom units like 'bag') → same-display-unit items sum directly,
 *   never flagged (legacy custom-unit resources must not regress).
 * - no path at all → merge per resource_id|unit, flagged needs_conversion —
 *   never guessed, never dropped, never blocking ("check by eye").
 * - resource deleted since derivation → merge per resource_id|unit under the
 *   item's denormalized name; stored needs_conversion flags carry through.
 *   No conversion is attempted (no dimension or bridges to attempt it with).
 *
 * Stored per-job quantities were already rounded UP per job (count dims are
 * ceiled at derivation), so the merged totals are a sum of ceils and may
 * overstate the combined need — the UI caption states this honestly.
 */
export function computeShoppingRun(pairs: ShoppingRunPair[], resources: OpsResource[]): ShoppingRunRow[] {
  const byId = new Map(resources.map((r) => [r.id, r]))
  const canonical = new Map<string, Bucket>()   // resource_id → total in canonical unit
  const display = new Map<string, Bucket>()     // resource_id → total in the resource's own display unit
  const stuck = new Map<string, Bucket>()       // `${resource_id}|${unit}` → no-path items, flagged
  const unknown = new Map<string, Bucket>()     // `${resource_id}|${unit}` → resource deleted since derivation

  for (const { event, plan } of pairs) {
    for (const item of plan.shopping_list) {
      const constituent: RunConstituent = {
        event_id: event.id,
        event_name: event.name,
        event_slug: event.slug,
        event_start: event.event_start.slice(0, 10),
        resource_id: item.resource_id,
        qty: item.qty,
        ...(item.unit !== undefined ? { unit: item.unit } : {}),
        ...(item.needs_conversion ? { needs_conversion: true } : {}),
        checked: item.checked,
      }
      const res = byId.get(item.resource_id)
      if (!res) {
        const key = `${item.resource_id}|${normalizeUnit(item.unit ?? '')}`
        const b = unknown.get(key)
        if (b) {
          b.total += item.qty
          b.constituents.push(constituent)
        } else {
          unknown.set(key, {
            name: item.name, total: item.qty,
            ...(item.unit !== undefined ? { unit: normalizeUnit(item.unit) } : {}),
            constituents: [constituent],
          })
        }
        continue
      }
      const dim = resolveDimension(res)
      // Unit-less legacy items were derived in the resource's display unit.
      const q: Quantity = { qty: item.qty, unit: normalizeUnit(item.unit ?? res.unit ?? CANONICAL_UNIT[dim]) }
      // Conversion is attempted against CURRENT resources: a bridge added since
      // the per-event list was derived converts (and merges) an item the
      // loadout screen still shows flagged — the run reads today's truth.
      const canon = convert(q, CANONICAL_UNIT[dim], res.conversions ?? [])
      if (canon) {
        const b = canonical.get(res.id)
        if (b) {
          b.total += canon.qty
          b.constituents.push(constituent)
        } else {
          canonical.set(res.id, { name: res.name, total: canon.qty, constituents: [constituent] })
        }
      } else if (q.unit === normalizeUnit(res.unit ?? '')) {
        const b = display.get(res.id)
        if (b) {
          b.total += q.qty
          b.constituents.push(constituent)
        } else {
          display.set(res.id, { name: res.name, total: q.qty, unit: q.unit, constituents: [constituent] })
        }
      } else {
        const key = `${res.id}|${q.unit}`
        const b = stuck.get(key)
        if (b) {
          b.total += q.qty
          b.constituents.push(constituent)
        } else {
          stuck.set(key, { name: res.name, total: q.qty, unit: q.unit, constituents: [constituent] })
        }
      }
    }
  }

  const rows: ShoppingRunRow[] = []
  for (const [id, b] of canonical) {
    const res = byId.get(id)!
    const dim = resolveDimension(res)
    // Count sums are sums of already-ceiled integers; the ceil is defensive.
    const total = dim === 'count' ? Math.ceil(b.total) : b.total
    const shown = formatQuantity({ qty: total, unit: CANONICAL_UNIT[dim] }, res.unit)
    rows.push({
      key: id, resource_id: id, name: b.name,
      qty: shown.qty, unit: shown.unit,
      canonical: { qty: round2(total), unit: CANONICAL_UNIT[dim] },
      checked: triState(b.constituents), constituents: b.constituents,
    })
  }
  for (const [id, b] of display) {
    const res = byId.get(id)!
    const dim = resolveDimension(res)
    // Key includes the unit: the SAME resource can also hold a canonical row
    // (e.g. a bag-unit resource whose items arrive mixed 'each' + 'bag' — the
    // 'each' item converts trivially, the 'bag' item lands here). A bare-id
    // key would collide with that canonical row and cross-wire the client's
    // key-addressed expanded/busy/error state between the two rows.
    rows.push({
      key: `${id}|${b.unit ?? ''}`, resource_id: id, name: b.name,
      qty: dim === 'count' ? Math.ceil(b.total) : round2(b.total),
      ...(b.unit !== undefined ? { unit: b.unit } : {}),
      checked: triState(b.constituents), constituents: b.constituents,
    })
  }
  for (const [key, b] of stuck) {
    rows.push({
      key, resource_id: key.slice(0, key.lastIndexOf('|')), name: b.name,
      qty: round2(b.total),
      ...(b.unit !== undefined ? { unit: b.unit } : {}),
      needs_conversion: true,
      checked: triState(b.constituents), constituents: b.constituents,
    })
  }
  for (const [key, b] of unknown) {
    rows.push({
      key, resource_id: key.slice(0, key.lastIndexOf('|')), name: b.name,
      qty: round2(b.total),
      ...(b.unit !== undefined ? { unit: b.unit } : {}),
      // Deleted-resource rows keep whatever flag their items carried.
      ...(b.constituents.some((c) => c.needs_conversion) ? { needs_conversion: true } : {}),
      checked: triState(b.constituents), constituents: b.constituents,
    })
  }
  // Store-aisle-stable order: alphabetical by name, unit as tiebreak. NEVER
  // resorted by checked state — rows must not jump under the operator's thumb.
  return rows.sort(
    (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      || (a.unit ?? '').localeCompare(b.unit ?? '')
      || a.key.localeCompare(b.key),
  )
}

export interface ShoppingRunStats {
  unchecked: number   // shopping-list items still unchecked across the run's jobs
  total: number       // all shopping-list items across the run's jobs
  jobs: number        // jobs contributing at least one shopping item
}

/**
 * The focal numbers — "{unchecked} of {total} items across {jobs} jobs".
 * Counts CONSTITUENT list items, deliberately NOT merged rows: row count
 * depends on conversion paths (bridges), which need the org's resources — but
 * the org events home computes its chip from the horizon's already-fetched
 * plans with ZERO extra reads. Item counting is merge-independent, so the chip
 * and this page's focal render the same number by construction, resources or
 * not. (Each merged row discloses its constituents, so "items" stays the
 * operator's visible unit of work.)
 */
export function shoppingRunStats(pairs: ShoppingRunPair[]): ShoppingRunStats {
  let unchecked = 0
  let total = 0
  let jobs = 0
  for (const { plan } of pairs) {
    if (plan.shopping_list.length === 0) continue
    jobs += 1
    total += plan.shopping_list.length
    unchecked += plan.shopping_list.filter((i) => !i.checked).length
  }
  return { unchecked, total, jobs }
}
