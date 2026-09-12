// S4 — readiness horizon (org events home). Pure selector, capacity-radar
// precedent (lib/capacity/capacity.ts): every Firestore read happens in the
// page; this module is pure math over already-fetched docs, so it is fully
// unit-testable and safe in client components.
//
// The job: rank the next 14 days of client jobs by "which job bites me next,
// and why", naming the blocker. A job with NO ops plan is THE most valuable
// row (refuter-confirmed): every other readiness signal is computed FROM the
// plan, so a missing plan near T-minus is invisible to every other surface.
//
// Carried caveats (accepted by the spec's refuter panel — noted, not fixed):
// - Ops deadlines are NOT re-anchored when an event's date changes
//   (pre-existing): after a reschedule this radar can show stale overdue rows
//   until the plan is re-derived.
// - Plan docs carry an unbounded change_log; the windowed fan-out (≤12 docs)
//   accepts that bandwidth today. A Firestore field mask on the fan-out is the
//   named future trim.
import { computeReadiness } from '@/lib/ops/readiness'
import { kindOf } from '@/lib/occasions/kind'
import { addDays } from '@/lib/opportunity-detail'
import type { Event, OpsPlan } from '@/lib/types'

/** Horizon window: today through today+14 inclusive. Inside the window IS the
 *  "near T-minus" predicate — nothing shown here is far away. */
export const HORIZON_DAYS = 14
/** Fan-out cap: the 12 soonest jobs win. Bounds the per-nav plan-doc reads;
 *  more than 12 jobs inside 14 days is already past a screenful. */
export const HORIZON_CAP = 12
/** "No plan yet" turns alert inside the final week. */
export const NEAR_T_DAYS = 7

export interface HorizonSignal {
  text: string               // interpretation included — '3 overdue', never a bare count
  /** 'ok' (inc-2): the operator's standing "Confirmed ready" attestation —
   *  rendered green, ranked BELOW alert signals so it can never displace an
   *  overdue or no-plan signal inside the 2-signal cap. */
  tone: 'alert' | 'pending' | 'ok'
}

export interface HorizonRow {
  event_id: string
  name: string
  slug: string
  event_start: string        // YYYY-MM-DD
  days_until: number         // 0 = event is today
  days_label: string         // 'Today' | 'Tomorrow' | '5d out'
  kind: 'no_plan' | 'not_ready'
  overdue: number            // 0 for no_plan rows
  signals: HorizonSignal[]   // 1–2, most important first
}

const MS_PER_DAY = 86_400_000

function daysUntil(eventStart: string, todayYmd: string): number {
  return Math.round(
    (Date.parse(`${eventStart.slice(0, 10)}T00:00:00Z`) - Date.parse(`${todayYmd}T00:00:00Z`)) / MS_PER_DAY
  )
}

function daysLabel(days: number): string {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days}d out`
}

/** In-window candidates BEFORE the cap: client jobs only (market days have no
 *  ops plan), not archived, starting within today..today+14 inclusive. This is
 *  the honest denominator for any "nothing at risk" claim. */
function horizonCandidates(events: Event[], todayYmd: string): Event[] {
  const end = addDays(todayYmd, HORIZON_DAYS)
  return events
    .filter((e) => e.status !== 'archived')
    .filter((e) => kindOf(e) === 'client_job')
    .filter((e) => {
      const day = e.event_start.slice(0, 10)
      return day >= todayYmd && day <= end
    })
}

/**
 * The events whose plan docs are worth fetching: in-window candidates, soonest
 * first, capped at HORIZON_CAP. The page fans out getOpsPlanCore over exactly
 * this list — filter access BEFORE calling this so the cap never spends slots
 * on rows the member can't see.
 */
export function selectHorizonWindow(events: Event[], todayYmd: string): Event[] {
  return horizonCandidates(events, todayYmd)
    .sort((a, b) => a.event_start.localeCompare(b.event_start) || a.name.localeCompare(b.name))
    .slice(0, HORIZON_CAP)
}

/**
 * What the rail's quiet state may honestly claim. `allEvents` is the org's
 * full event list; `visibleEvents` the member-gated subset the page actually
 * radars.
 * - truncated: the HORIZON_CAP cut in-window jobs out of the fan-out, so
 *   "nothing at risk" was NOT established for the whole 14-day window — only
 *   for the soonest HORIZON_CAP jobs.
 * - scoped: member gating removed in-window client jobs from this view, so an
 *   all-clear speaks only for the jobs this member can open.
 */
export interface HorizonScope {
  truncated: boolean
  scoped: boolean
}

export function horizonScope(allEvents: Event[], visibleEvents: Event[], todayYmd: string): HorizonScope {
  const all = horizonCandidates(allEvents, todayYmd).length
  const visible = horizonCandidates(visibleEvents, todayYmd).length
  return { truncated: visible > HORIZON_CAP, scoped: visible < all }
}

/**
 * One fan-out slot's outcome. The distinction matters:
 * - OpsPlan   → the plan doc exists.
 * - null      → the read SUCCEEDED and the doc is missing → 'No ops plan yet'.
 * - 'unknown' → the read FAILED → the event is EXCLUDED from the radar.
 *   Unknown ≠ "no plan": coercing an error to null would forge the rail's
 *   loudest alert row out of a transient Firestore failure.
 */
export type HorizonPlanEntry = OpsPlan | null | 'unknown'

/** Signals for a row that HAS a plan, priority order: overdue deadlines →
 *  'Confirmed ready' (inc-2, when the attestation stands — BELOW alerts, so it
 *  never displaces an overdue signal inside the cap) → load list (shopping +
 *  packing) → checklists → still-open deadlines.
 *  Capped at 2 — the row is a pointer, the Ops tab is the workbench. */
function planSignals(plan: OpsPlan, overdue: number, todayYmd: string): HorizonSignal[] {
  const alerts: HorizonSignal[] = []
  if (overdue > 0) alerts.push({ text: `${overdue} overdue`, tone: 'alert' })

  const pendings: HorizonSignal[] = []
  const load = [...plan.shopping_list, ...plan.packing_list]
  if (load.length === 0) {
    pendings.push({ text: 'Load list unbuilt', tone: 'pending' })
  } else {
    const checked = load.filter((i) => i.checked).length
    if (checked < load.length) pendings.push({ text: `Load list ${checked}/${load.length}`, tone: 'pending' })
  }

  const steps = plan.checklists.flatMap((c) => c.steps)
  const stepsDone = steps.filter((s) => s.done).length
  if (steps.length > 0 && stepsDone < steps.length) {
    pendings.push({ text: `Checklists ${stepsDone}/${steps.length}`, tone: 'pending' })
  }

  const open = plan.deadlines.filter((d) => !d.done && d.due >= todayYmd).length
  if (open > 0) pendings.push({ text: `${open} deadline${open === 1 ? '' : 's'} open`, tone: 'pending' })

  // The attestation slots between alerts and pendings: on a row that renders at
  // all (i.e. NOT ready by computed state), 'Confirmed ready' is the operator's
  // recorded judgment — worth a slot ahead of routine progress counts, never
  // ahead of an alert.
  const confirmed: HorizonSignal[] = plan.ready_confirmed
    ? [{ text: 'Confirmed ready', tone: 'ok' }]
    : []

  return [...alerts, ...confirmed, ...pendings].slice(0, 2)
}

/**
 * Ranking — a strict weak order (lexicographic over tier → overdue desc →
 * days_until asc → name), so it is transitive by construction; never compose
 * ad-hoc pairwise rules here (an intransitive comparator shipped a real
 * ordering bug in the pipeline radar's first draft).
 * Tier: no_plan rows outrank everything — even a 5-overdue job tomorrow —
 * because the un-planned job has NO deadlines to go overdue: it is invisible
 * to every other radar, and instantiating its plan is the highest-leverage
 * click on this screen.
 */
function byRank(a: HorizonRow, b: HorizonRow): number {
  if (a.kind !== b.kind) return a.kind === 'no_plan' ? -1 : 1
  return b.overdue - a.overdue || a.days_until - b.days_until || a.name.localeCompare(b.name)
}

/**
 * The rail's rows: windowed client jobs that are NOT ready, worst first.
 * - No plan doc → 'No ops plan yet' (alert inside NEAR_T_DAYS).
 * - Plan → computeReadiness; included when overdue > 0 or pct < 100. The
 *   14-day window is the "near" predicate — no second threshold. A plan with
 *   nothing trackable reads pct 100 (computeReadiness's documented rule) and
 *   is honestly absent.
 * `plansById` may hold null for fetched-but-missing docs; absent and null are
 * both "no plan". An 'unknown' entry marks a FAILED read: that event is
 * excluded outright — never rendered as a false no-plan row (mirrors
 * actions/today.ts's "a failed read attaches nothing" rule).
 */
export function selectReadinessHorizon(
  events: Event[],
  plansById: ReadonlyMap<string, HorizonPlanEntry>,
  todayYmd: string,
): HorizonRow[] {
  const todayDate = new Date(`${todayYmd}T00:00:00Z`)
  const rows: HorizonRow[] = []

  for (const event of selectHorizonWindow(events, todayYmd)) {
    const days_until = daysUntil(event.event_start, todayYmd)
    const base = {
      event_id: event.id,
      name: event.name,
      slug: event.slug,
      event_start: event.event_start.slice(0, 10),
      days_until,
      days_label: daysLabel(days_until),
    }

    const entry = plansById.get(event.id) ?? null
    if (entry === 'unknown') continue // failed read: unknown ≠ "no plan" — no forged row
    const plan = entry
    if (!plan) {
      rows.push({
        ...base,
        kind: 'no_plan',
        overdue: 0,
        signals: [{ text: 'No ops plan yet', tone: days_until <= NEAR_T_DAYS ? 'alert' : 'pending' }],
      })
      continue
    }

    // Caveat carried verbatim: deadlines are anchored at derivation time and
    // are NOT re-anchored when the event's date changes — after a reschedule,
    // overdue counts here can be stale until the plan is re-derived.
    const r = computeReadiness(plan, event.event_start, todayDate)
    if (r.overdue === 0 && r.pct >= 100) continue // ready — earns its absence

    rows.push({
      ...base,
      kind: 'not_ready',
      overdue: r.overdue,
      signals: planSignals(plan, r.overdue, todayYmd),
    })
  }

  return rows.sort(byRank)
}
