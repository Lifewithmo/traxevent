import { cache } from 'react'
import { adminDb } from '@/lib/firebase-admin'
import { assertOrgMember } from '@/lib/auth/assert'
import { eventsRef, listEventsCore } from '@/lib/events'
import { listLeadsCore } from '@/lib/crm/leads'
import { listTasksCore } from '@/lib/crm/tasks'
import { invoicesRef, listAllInvoicesCore } from '@/lib/crm/invoices'
import { complianceDocsRef, listComplianceDocsCore } from '@/lib/ops/compliance'
import { listDropsCore } from '@/lib/storefront/drops'
import { normalizeInvoice } from '@/lib/invoice-normalize'
import { OPEN_STAGES } from '@/lib/leads'
import { buildCalendarFeed, type CalendarFeedSources, type CalendarItem } from '@/lib/calendar'
import type { ComplianceDoc, Event, Lead, NormalizedInvoice, Task } from '@/lib/types'

/** Resolve an org slug to its id, memoised per request — the layout, the canvas
 *  page and the day route all need it, so this collapses 2-3 identical org reads
 *  into one. Returns null when the slug matches no org (caller → notFound()). */
export const orgIdBySlug = cache(async (slug: string): Promise<string | null> => {
  const snap = await adminDb.collection('orgs').where('slug', '==', slug).limit(1).get()
  return snap.empty ? null : snap.docs[0].id
})

// ─────────────────────────────────────────────────────────────────────────────
// THE cockpit source layer.
//
// One `/calendar/[ymd]` render is a layout + a canvas page + a day spine, all in
// ONE server request, and each used to fan out over the org's collections on its
// own: the feed's five gets + N per-lead task gets, an extra whole-events get for
// the runway, then getDayDetail's own IDENTICAL five gets + N task gets. Six of
// those reads were exact duplicates in flight.
//
// `loadCalendarSources` is now the single door every one of them goes through,
// memoised per request by React `cache()`, so the fan-out happens ONCE.
//
// Two rules this module lives by:
//
//  1. NO AUTH HERE, EVER. This layer is guard-free by design (the same contract
//     the `…Core` fetchers it wraps carry). Every caller asserts first —
//     `getCalendarFeed`/`getDayDetail`/`listCalendarRange` call `assertOrgMember`
//     in actions/calendar.ts, and the two memoised helpers at the bottom of this
//     file call it themselves before touching a source. Sharing a cache across
//     an authorised and an unauthorised caller would be an auth bypass, so the
//     assertion must stay OUTSIDE (and before) the memoised load.
//
//  2. THE WINDOW IS A LOWER BOUND ON WHAT YOU GET, NOT AN UPPER ONE. A windowed
//     load promises to contain everything overlapping [from, to]; it may return
//     more (unboundable collections come back whole). Every consumer already
//     re-filters in memory — feedForDay, feedInWindow, calendarRangeItems — so a
//     superset is always safe and a subset never is.
//
// React `cache()` keys on ARGUMENT IDENTITY, so the window is passed as two
// primitive strings rather than a `{from, to}` object — two structurally-equal
// objects are different keys and would silently re-fetch.
// ─────────────────────────────────────────────────────────────────────────────

/** `null` = load the collection whole (agenda, ICS, the runway's forward scan). */
export type CalendarSourceWindow = { from: string; to: string } | null

/**
 * Events overlapping [from, to] — SPAN-AWARE, and exact rather than heuristic.
 *
 * A multi-day event that started before the window but runs into it must still
 * appear (WeekGrid/MonthGrid render it on every interior day). Rather than widen
 * the lower bound by a guessed "longest supported span" — the schema caps event
 * length nowhere, so any constant would silently drop longer jobs — this issues
 * the two exact halves of an interval-overlap query and unions them:
 *
 *   A. `event_start` inside the window. Catches every event that begins in view,
 *      INCLUDING legacy rows with no `event_end` (a range filter on a field a
 *      document lacks excludes that document, so those rows must be caught on
 *      `event_start` or not at all).
 *   B. started before the window and still running at `from`. Catches the
 *      spanning case. Rows with no `event_end` are read as single-day
 *      everywhere downstream (`event_end ?? event_start`), so one that started
 *      before `from` cannot overlap the window and is correctly absent here.
 *
 * B filters on two different fields inequality-wise, which needs the composite
 * index added to firestore.indexes.json (events: event_start ASC, event_end ASC).
 */
export const loadCalendarEvents = cache(
  async (orgId: string, from: string | null, to: string | null): Promise<Event[]> => {
    if (!from || !to) return listEventsCore(orgId)
    const ref = eventsRef(orgId)
    const [startsInside, spansIn] = await Promise.all([
      ref.where('event_start', '>=', from).where('event_start', '<=', to).get(),
      ref.where('event_start', '<', from).where('event_end', '>=', from).get(),
    ])
    const byId = new Map<string, Event>()
    for (const d of [...startsInside.docs, ...spansIn.docs]) byId.set(d.id, d.data() as Event)
    // listEventsCore's contract is newest-created first; a range query comes back
    // ordered by the range field, so restore the order callers already expect.
    return [...byId.values()].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  }
)

/** Invoices whose due date falls in the window. Safe to bound: an `invoice_due`
 *  item is keyed on `due_date` alone, and an invoice without one produces no
 *  item at all — so the rows a range filter drops were never going to render. */
const loadCalendarInvoices = cache(
  async (orgId: string, from: string | null, to: string | null): Promise<NormalizedInvoice[]> => {
    if (!from || !to) return listAllInvoicesCore(orgId)
    const snap = await invoicesRef(orgId).where('due_date', '>=', from).where('due_date', '<=', to).get()
    return snap.docs.map((d) => normalizeInvoice(d.data()))
  }
)

/** Compliance docs expiring in the window. Same reasoning as invoices: the item
 *  is keyed on `expires_on` alone and a doc without one emits nothing. */
const loadCalendarCompliance = cache(
  async (orgId: string, from: string | null, to: string | null): Promise<ComplianceDoc[]> => {
    if (!from || !to) return listComplianceDocsCore(orgId)
    const snap = await complianceDocsRef(orgId)
      .where('expires_on', '>=', from)
      .where('expires_on', '<=', to)
      .get()
    return snap.docs
      .map((d) => d.data() as ComplianceDoc)
      .sort((a, b) => a.name.localeCompare(b.name)) // listComplianceDocsCore orders by name
  }
)

/**
 * Every source the calendar feed and the day spine are built from, loaded ONCE
 * per (org, window) per request.
 *
 * Bounded when a window is given: events (span-aware), invoices, compliance.
 * Deliberately WHOLE-COLLECTION even then:
 *
 *  • leads — a lead feeds THREE kinds off three different dates: `lead`
 *    (event_date), `follow_up` (waiting.follow_up_date) and, through its tasks
 *    subcollection, `task` (each task's due_date). It is also the lookup table
 *    that titles invoice rows and carries closed-won booked value. A range on
 *    `event_date` would drop every lead that has no event_date (a range filter
 *    excludes documents missing the field) and every lead dated outside the
 *    window whose task or follow-up lands inside it — losing real rows. Not
 *    boundable without a denormalised "next calendar date" field.
 *
 *  • drops — the pickup day lives at `pickup.windows[].day`, inside an array of
 *    maps. Firestore cannot range-filter that, and nothing constrains a window
 *    day relative to the top-level `opens_at`/`closes_at`, so there is no
 *    honest proxy to bound on.
 *
 *  • tasks — one read per OPEN lead, a subcollection each. Since leads stay
 *    whole, N stays N; bounding each task query by due_date would still cost N
 *    round trips.
 */
export const loadCalendarSources = cache(
  async (orgId: string, from: string | null, to: string | null): Promise<CalendarFeedSources> => {
    const [events, leads, complianceDocs, invoices, drops] = await Promise.all([
      loadCalendarEvents(orgId, from, to),
      listLeadsCore(orgId),
      loadCalendarCompliance(orgId, from, to),
      loadCalendarInvoices(orgId, from, to),
      listDropsCore(orgId),
    ])
    const openLeads = leads.filter((l) => (OPEN_STAGES as Lead['stage'][]).includes(l.stage))
    const taskLists = await Promise.all(openLeads.map((l) => listTasksCore(orgId, l.id)))
    const tasksByLeadId: Record<string, Task[]> = {}
    openLeads.forEach((l, i) => { tasksByLeadId[l.id] = taskLists[i] })
    return { events, leads, tasksByLeadId, complianceDocs, invoices, drops }
  }
)

// ── Memoised entry points for the cockpit routes ─────────────────────────────
// The calendar layout, the canvas page and the day route all render inside ONE
// server request and each need the org feed / events. These assert membership
// FIRST (preserving exactly the guard the actions they replaced performed —
// getCalendarFeed's and listEvents' `assertOrgMember`), then share the one
// memoised source load.
//
// Both ask for the UNBOUNDED window on purpose: the layout's runway scans the
// whole feed forward with no horizon, the agenda view lists every month, and the
// ICS export is a full-calendar subscription. Handing them a window would lose
// rows those three surfaces are specified to show.

export const orgCalendarFeed = cache(async (orgId: string, orgSlug: string): Promise<CalendarItem[]> => {
  await assertOrgMember(orgId)
  return buildCalendarFeed(orgSlug, await loadCalendarSources(orgId, null, null))
})

export const orgEvents = cache(async (orgId: string): Promise<Event[]> => {
  await assertOrgMember(orgId)
  return (await loadCalendarSources(orgId, null, null)).events
})
