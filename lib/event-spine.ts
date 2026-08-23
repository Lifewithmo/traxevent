// Guard-free reads + pure judgment math for the event spine band AND the
// dashboard's computed brief. Every read here MIRRORS an existing query shape —
// no new collections, no collectionGroup queries, no family_members
// subcollection reads, no new indexes. Auth is the caller's job: the event
// layout / dashboard page only call this after requireEvent, gate each section
// on the member's allowedPages, and thread the owner/admin money gate as an
// explicit `includeMoney` input (B4) — money visibility is a ROLE question,
// deliberately independent of the roster-less allowedPages strip (which exists
// so "0 registrations" never shadows the band's "Guests expected" fallback).
import { cache } from 'react'
import { adminDb } from '@/lib/firebase-admin'
import { getOpsPlanCore } from '@/lib/ops/event-ops'
import { getCloseoutCore } from '@/lib/ops/closeout'
import { listInvoicesCore } from '@/lib/crm/invoices'
import { customerAR } from '@/lib/crm/ar-rollup'
import { invoiceBalance } from '@/lib/invoices'
import { computeReadiness, type Readiness } from '@/lib/ops/readiness'
import { eventCountdown, parseDay } from '@/lib/event-ui'
import {
  buildRegistrationSummary,
  buildFinancialReport,
  type RegistrationSummary,
  type FinancialReport,
} from '@/lib/reports'
import { formatMoney } from '@/lib/utils'
import type { Event, EventPage, Family, ItineraryItem, NormalizedInvoice, OpsPlan } from '@/lib/types'

export interface EventArSummary {
  invoiced: number
  outstanding: number
  overdueAmount: number
  openCount: number
  nextDueDate?: string
  /** 'unpaid' = a sent deposit invoice still carries a balance; 'paid' = every
   *  sent deposit invoice is settled; null = no deposit invoice has been sent
   *  (a draft deposit is not yet the client's problem, so it is not "unpaid"). */
  deposit: 'unpaid' | 'paid' | null
}

export interface EventOpsFacts {
  hasPlan: boolean
  /** plan.requirements.service_start — 'YYYY-MM-DDTHH:mm' (datetime-local shape). */
  serviceStart?: string
  /** Combined shopping + packing check state — the load-out surface (T2) operates on both. */
  loadlist: { packed: number; total: number }
}

export interface EventBlocker {
  kind: 'deadline' | 'money' | 'loadlist' | 'registrations'
  /** Concrete item, never a bare count (B9): 'Order ice — 2d overdue'. */
  label: string
  /** Optional trailing context, e.g. '+2 more overdue'. */
  detail?: string
  /** Action phrasing for when this blocker is promoted to THE primary button. */
  actionLabel: string
  severity: 'alert' | 'info'
}

export interface EventSpineKpis {
  /** null = families gated off for this member, or the read failed. */
  registrations: RegistrationSummary | null
  /** Roster-org money. null unless includeMoney (B4) — same families read, harder gate. */
  financial: FinancialReport | null
  /** null = ops gated off, no ops plan yet, or the read failed. */
  readiness: Readiness | null
  /** null = ops gated off or the read failed. "No plan yet" is NOT null — it is { hasPlan: false }. */
  ops: EventOpsFacts | null
  /** Roster-less money via event.lead_id → invoices. null unless includeMoney && lead_id and the read succeeded. */
  ar: EventArSummary | null
  /** Closeout-doc presence for the wrapped-state NBA (B9). null = ops gated
   *  off, read failed, or a band-only call (wantBriefFacts: false). */
  closeout: { exists: boolean; completed: boolean } | null
  /** 'HH:mm' of the earliest itinerary item — read ONLY as the job-strip time
   *  fallback (B7): when neither ops service_start nor event.hours can answer.
   *  Always null on a band-only call (wantBriefFacts: false). */
  firstItineraryTime: string | null
  /** Decision-ordered concrete blockers, capped at 3 — see computeEventBlockers.
   *  Always [] on a band-only call (wantBriefFacts: false). */
  blockers: EventBlocker[]
}

export interface GetEventSpineKpisInput {
  orgId: string
  eventId: string
  event: Pick<Event, 'event_start' | 'event_end' | 'hours' | 'lead_id'>
  allowedPages: EventPage[]
  /** B4: money (families-financial AND lead-AR) is owner/admin only. Computed by
   *  the caller from the already-loaded member doc — never from allowedPages. */
  includeMoney: boolean
  /** YYYY-MM-DD, injectable for tests; defaults to the current UTC day (same
   *  convention as lib/ops/readiness.ts). Drives blocker overdue math. */
  today?: string
  /** false = band-only caller (the layout): skip the brief-only closeout +
   *  itinerary reads and the blocker computation — the band renders none of
   *  them. Defaults to true (the dashboard brief wants everything). */
  wantBriefFacts?: boolean
}

// ── Per-request read dedupe (React cache) ────────────────────────────────────
// The event layout and the dashboard page BOTH aggregate in the same server
// pass (a layout cannot pass props to a page — B1's chosen mechanism), which
// doubled every Firestore read on the flagship page. Each read unit below is
// wrapped in React cache() and keyed on PRIMITIVES ONLY (orgId, eventId,
// pagesKey, includeMoney, today, …) — an object arg would key on identity and
// never dedupe across the two call sites. Outside an RSC request (vitest),
// React's client `cache` is a passthrough, so tests see every call.

interface SpineCoreSections {
  registrations: RegistrationSummary | null
  financial: FinancialReport | null
  readiness: Readiness | null
  ops: EventOpsFacts | null
  ar: EventArSummary | null
  /** Raw plan for the brief-only follow-ups (itinerary gate + blockers). */
  plan: OpsPlan | null
}

const readSpineCore = cache(async (
  orgId: string,
  eventId: string,
  /** allowedPages.join(',') — a primitive so layout + page share one entry. */
  pagesKey: string,
  includeMoney: boolean,
  eventStart: string,
  /** '' = no lead. */
  leadId: string,
  todayDay: string,
): Promise<SpineCoreSections> => {
  const allowedPages = pagesKey.split(',') as EventPage[]
  const core: SpineCoreSections = {
    registrations: null, financial: null, readiness: null, ops: null, ar: null, plan: null,
  }
  const eventRef = adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId)

  await Promise.all([
    (async () => {
      // Reports shows these same figures, so either grant unlocks the read.
      if (!allowedPages.includes('families') && !allowedPages.includes('reports')) return
      try {
        // Same collection path + query as actions/admin-families.ts getAdminFamilies.
        const snap = await eventRef.collection('families').orderBy('created_at', 'desc').get()
        const families = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Family)
        core.registrations = buildRegistrationSummary(families)
        // B4: families money is owner/admin only now — same data, harder gate.
        if (includeMoney) core.financial = buildFinancialReport(families)
      } catch {
        // section stays null
      }
    })(),
    (async () => {
      if (!allowedPages.includes('ops')) return
      try {
        core.plan = await getOpsPlanCore(orgId, eventId)
        core.ops = planFacts(core.plan)
        if (core.plan) core.readiness = computeReadiness(core.plan, eventStart)
      } catch {
        // section stays null
      }
    })(),
    (async () => {
      // Roster-less money: event.lead_id → invoices (fixes the permanently-dead
      // Balance tile — walk finding `gap`). Guard-free cores; the B4 role gate
      // is the ONLY thing standing between a member and this read.
      if (!includeMoney || !leadId) return
      try {
        const invoices = await listInvoicesCore(orgId, leadId)
        core.ar = buildArSummary(invoices, new Date(`${todayDay}T12:00:00Z`))
      } catch {
        // section stays null
      }
    })(),
  ])
  return core
})

const readCloseoutPresence = cache(async (orgId: string, eventId: string): Promise<{ exists: boolean; completed: boolean } | null> => {
  try {
    // Same doc get as lib/ops/closeout.ts getCloseoutCore.
    const closeout = await getCloseoutCore(orgId, eventId)
    return { exists: closeout != null, completed: closeout?.completed ?? false }
  } catch {
    return null // section stays null
  }
})

const readFirstItineraryTime = cache(async (orgId: string, eventId: string): Promise<string | null> => {
  try {
    // Mirrors actions/itinerary.ts listItinerary (bare .get(); ordering in memory).
    const snap = await adminDb
      .collection('orgs').doc(orgId).collection('events').doc(eventId)
      .collection('itinerary').get()
    const first = snap.docs
      .map((d) => d.data() as ItineraryItem)
      .sort((a, b) => a.day.localeCompare(b.day) || a.start_time.localeCompare(b.start_time) || a.sort_order - b.sort_order)[0]
    return first?.start_time ?? null
  } catch {
    return null // stays null → job strip says 'Time TBD'
  }
})

/**
 * Aggregate the spine band's numbers and the brief's facts. Each read is
 * wrapped so a failure yields that section = null — consumers render their
 * fallback and the page never 500s over a KPI.
 */
export async function getEventSpineKpis({ orgId, eventId, event, allowedPages, includeMoney, today, wantBriefFacts = true }: GetEventSpineKpisInput): Promise<EventSpineKpis> {
  const todayDay = today ?? new Date().toISOString().slice(0, 10)

  const corePromise = readSpineCore(orgId, eventId, allowedPages.join(','), includeMoney, event.event_start, event.lead_id ?? '', todayDay)
  // The closeout doc get has no dependency on the core reads — start it alongside.
  const closeoutPromise =
    wantBriefFacts && allowedPages.includes('ops') ? readCloseoutPresence(orgId, eventId) : null
  const core = await corePromise

  const kpis: EventSpineKpis = {
    registrations: core.registrations,
    financial: core.financial,
    readiness: core.readiness,
    ops: core.ops,
    ar: core.ar,
    closeout: null,
    firstItineraryTime: null,
    blockers: [],
  }
  if (!wantBriefFacts) return kpis

  kpis.closeout = closeoutPromise ? await closeoutPromise : null
  // Itinerary time fallback (B7 precedence): only read when neither the plan's
  // service_start nor the event's hours can answer, and the member may see the
  // itinerary.
  if (allowedPages.includes('itinerary') && !event.hours?.start && !core.plan?.requirements?.service_start) {
    kpis.firstItineraryTime = await readFirstItineraryTime(orgId, eventId)
  }
  // Thread the phase so a wrapped job never resurfaces stale prep blockers —
  // same countdown vocabulary the brief itself renders, so they cannot disagree.
  const phase = eventPhaseOf(eventCountdown(event.event_start, event.event_end, todayDay).value)
  kpis.blockers = computeEventBlockers({ plan: core.plan, registrations: kpis.registrations, ar: kpis.ar, today: todayDay, phase })
  return kpis
}

function planFacts(plan: OpsPlan | null): EventOpsFacts {
  if (!plan) return { hasPlan: false, loadlist: { packed: 0, total: 0 } }
  const items = [...plan.shopping_list, ...plan.packing_list]
  return {
    hasPlan: true,
    ...(plan.requirements?.service_start ? { serviceStart: plan.requirements.service_start } : {}),
    loadlist: { packed: items.filter((i) => i.checked).length, total: items.length },
  }
}

function buildArSummary(invoices: NormalizedInvoice[], now: Date): EventArSummary {
  const ar = customerAR(invoices, now)
  const sentDeposits = invoices.filter((i) => i.type === 'deposit' && i.lifecycle === 'sent')
  const deposit = sentDeposits.length === 0
    ? null
    : sentDeposits.some((i) => invoiceBalance(i) > 0) ? 'unpaid' as const : 'paid' as const
  return {
    invoiced: ar.invoiced,
    outstanding: ar.outstanding,
    overdueAmount: ar.overdueAmount,
    openCount: ar.openCount,
    ...(ar.nextDueDate ? { nextDueDate: ar.nextDueDate } : {}),
    deposit,
  }
}

// ── Pure judgment math (no Firestore below this line) ────────────────────────

const MS_PER_DAY = 86_400_000

/**
 * Decision-ordered concrete blockers, capped at 3: what stands between now and
 * "ready", each naming the actual item (B9 — never a bare count). Order:
 * most-overdue deadline → unpaid deposit / overdue balance → load-list state →
 * pending registrations (roster verdict v1, B9). Money blockers can only exist
 * when the caller passed includeMoney, because `ar` stays null otherwise (B4).
 * Once the job is 'wrapped', prep blockers (deadline / loadlist /
 * registrations) are dropped — deadlines for a finished job would otherwise
 * grow staler daily under the Wrapped verdict; only money survives post-event.
 */
export function computeEventBlockers(input: {
  plan: Pick<OpsPlan, 'deadlines' | 'shopping_list' | 'packing_list'> | null
  registrations: Pick<RegistrationSummary, 'byStatus'> | null
  ar: EventArSummary | null
  today: string
  phase?: EventPhase
}): EventBlocker[] {
  const { plan, registrations, ar, today } = input
  const wrapped = input.phase === 'wrapped'
  const blockers: EventBlocker[] = []

  if (plan && !wrapped) {
    const overdue = plan.deadlines
      .filter((d) => !d.done && d.due < today)
      .sort((a, b) => a.due.localeCompare(b.due))
    if (overdue.length > 0) {
      const top = overdue[0]
      const days = Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${top.due}T00:00:00Z`)) / MS_PER_DAY))
      const label = `${top.label} — ${days}d overdue`
      blockers.push({
        kind: 'deadline',
        label,
        actionLabel: label,
        ...(overdue.length > 1 ? { detail: `+${overdue.length - 1} more overdue` } : {}),
        severity: 'alert',
      })
    }
  }

  if (ar) {
    if (ar.deposit === 'unpaid') {
      blockers.push({ kind: 'money', label: 'Deposit unpaid', actionLabel: 'Collect the deposit', severity: 'alert' })
    } else if (ar.overdueAmount > 0) {
      blockers.push({
        kind: 'money',
        label: `${formatMoney(ar.overdueAmount)} overdue`,
        actionLabel: `Collect ${formatMoney(ar.overdueAmount)} overdue`,
        severity: 'alert',
      })
    }
  }

  if (plan && !wrapped) {
    const items = [...plan.shopping_list, ...plan.packing_list]
    const packed = items.filter((i) => i.checked).length
    if (items.length > 0 && packed < items.length) {
      blockers.push({
        kind: 'loadlist',
        label: `Load list ${packed} of ${items.length} packed`,
        actionLabel: `Open load-out — ${packed} of ${items.length} packed`,
        severity: 'info',
      })
    }
  }

  const pending = wrapped ? 0 : registrations?.byStatus['pending'] ?? 0
  if (pending > 0) {
    const noun = pending === 1 ? 'registration' : 'registrations'
    blockers.push({
      kind: 'registrations',
      label: `${pending} ${noun} pending`,
      actionLabel: `Review ${pending} pending ${noun}`,
      severity: 'info',
    })
  }

  return blockers.slice(0, 3)
}

export type EventPhase = 'upcoming' | 'today' | 'wrapped'

/** Phase from eventCountdown's own vocabulary, so the brief and the band can never disagree. */
export function eventPhaseOf(countdownValue: string): EventPhase {
  return countdownValue === 'Wrapped' ? 'wrapped' : countdownValue === 'Today' ? 'today' : 'upcoming'
}

export interface EventVerdict {
  label: string
  tone: 'ok' | 'pending' | 'alert'
}

/**
 * The brief's focal judgment (S1.2). Computed, never a bare percentage.
 * Returns null when the member cannot read ops at all — no visibility, no
 * guessed verdict; the brief degrades to the job strip + visible blockers.
 */
export function computeEventVerdict(input: {
  phase: EventPhase
  ops: EventOpsFacts | null
  readiness: Readiness | null
  closeout: { exists: boolean; completed: boolean } | null
  blockers: EventBlocker[]
}): EventVerdict | null {
  const { phase, ops, readiness, closeout, blockers } = input
  if (!ops) return null
  if (phase === 'wrapped') {
    if (!ops.hasPlan) return { label: 'Wrapped', tone: 'ok' }
    return closeout?.completed
      ? { label: 'Wrapped — closed out', tone: 'ok' }
      : { label: 'Wrapped — close out', tone: 'pending' }
  }
  if (!ops.hasPlan) return { label: 'No ops plan yet', tone: 'pending' }
  if (blockers.some((b) => b.severity === 'alert')) return { label: 'Not ready', tone: 'alert' }
  if (blockers.length > 0 || (readiness != null && readiness.pct < 100)) return { label: 'On track', tone: 'pending' }
  return { label: 'Ready', tone: 'ok' }
}

export type EventNbaTarget = 'ops' | 'ops/loadout' | 'ops/runsheet' | 'ops/closeout' | 'families' | 'reports' | 'lead-invoices'

export interface EventNba {
  label: string
  /** Route intent; the brief maps it to a concrete href (lead-invoices needs the lead id). */
  target: EventNbaTarget
  /** true = a blocker was promoted into this button (B9) — the brief must drop that row. */
  fromTopBlocker: boolean
  /** The promoted blocker's kind when fromTopBlocker (kinds are unique per list),
   *  so the brief drops exactly that row — the promoted blocker is not always
   *  blockers[0] once reachability is applied. */
  promotedKind?: EventBlocker['kind']
}

/**
 * The blocker's deep-link target, shared by blocker rows and the promoted NBA —
 * constrained to pages the member can actually open. A registrations blocker
 * exists for a reports-only grant (Reports renders the same figures), but its
 * families deep-link would bounce that member into the org-home guard redirect,
 * so it falls back to 'reports'. null = no reachable surface at all: render the
 * row UNLINKED and never promote it.
 */
export function blockerTarget(kind: EventBlocker['kind'], allowedPages: EventPage[]): EventNbaTarget | null {
  switch (kind) {
    case 'deadline':
      return allowedPages.includes('ops') ? 'ops' : null
    case 'loadlist':
      return allowedPages.includes('ops') ? 'ops/loadout' : null
    case 'money':
      // Org-level target (the lead's invoices panel, or ops/closeout for a
      // manual event) — not event-page-gated, and money blockers only exist
      // for owner/admin anyway (B4).
      return 'lead-invoices'
    case 'registrations':
      return allowedPages.includes('families')
        ? 'families'
        : allowedPages.includes('reports')
          ? 'reports'
          : null
  }
}

/**
 * THE single next-best-action (S1.4, B9): wrapped → close out; day-of → run
 * sheet; no plan → instantiate; otherwise the top REACHABLE blocker promoted to
 * the primary button (never a deep-link the page guard would bounce — skip to
 * the next reachable blocker, else the phase default); fully ready → run sheet.
 * Never two competing next-things.
 */
export function computeEventNba(input: {
  phase: EventPhase
  ops: EventOpsFacts | null
  closeout: { exists: boolean; completed: boolean } | null
  blockers: EventBlocker[]
  /** Blocker promotion may only pick targets this member can open. */
  allowedPages: EventPage[]
}): EventNba | null {
  const { phase, ops, closeout, blockers, allowedPages } = input
  const promoted = (): EventNba | null => {
    for (const b of blockers) {
      const target = blockerTarget(b.kind, allowedPages)
      if (target) return { label: b.actionLabel, target, fromTopBlocker: true, promotedKind: b.kind }
    }
    return null
  }
  if (!ops) {
    // Ops-gated member: the only promotable action is a blocker they can see
    // (e.g. pending registrations); otherwise the brief ends at the facts.
    return promoted()
  }
  if (phase === 'wrapped') {
    if (!ops.hasPlan) return null
    return closeout?.completed
      ? { label: 'View closeout', target: 'ops/closeout', fromTopBlocker: false }
      : { label: 'Close out (margin pending)', target: 'ops/closeout', fromTopBlocker: false }
  }
  if (!ops.hasPlan) return { label: 'Set up ops plan', target: 'ops', fromTopBlocker: false }
  if (phase === 'today') return { label: 'Open run sheet', target: 'ops/runsheet', fromTopBlocker: false }
  return promoted() ?? { label: 'Open run sheet', target: 'ops/runsheet', fromTopBlocker: false }
}

// ── Job-strip time + back-planning helpers (B7 + accepted ratchet) ───────────
// CONSOLIDATED: the canonical implementations live in lib/event-ui.ts (the
// shared pure vocab module) so the brief and the run sheet's anchor logic can
// never drift apart. Re-exported here so existing spine callers keep working.
export {
  formatClockTime,
  resolveJobTime,
  backPlanChips,
  PACK_MINUTES,
  DRIVE_MINUTES,
  type JobStripTime,
} from '@/lib/event-ui'

/** '2026-08-29' → 'Sat Aug 29' (job-strip date; the year is carried by context, the countdown carries urgency). */
export function formatJobDay(day: string): string {
  const d = parseDay(day)
  if (!d) return ''
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')
}
