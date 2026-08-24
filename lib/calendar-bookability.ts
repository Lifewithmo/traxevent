import type { CapacityUnit, CapacityUnitKind, Event, Lead, Org } from '@/lib/types'
import { BOOKABLE_STAGES, supply, type CapacityDay } from '@/lib/capacity/capacity'
import { DEFAULT_PREP_LEAD_DAYS, radarConflictOpts } from '@/lib/pipeline-view'
import { addDays } from '@/lib/opportunity-detail'

// ─────────────────────────────────────────────────────────────────────────────
// THE BOOKABILITY VERDICT
//
// A mobile-beverage operator is asked, out loud, mid-phone-call, several times a
// week: "are you free September 13?" Until now the cockpit could not answer.
// An empty month cell means "no feed items landed here" — not "the cart is
// free". It may be empty because nothing is dated, or dotted only by an invoice
// due date. The operator stepped forward month by month, a full org read each,
// and ended with an answer they could not trust.
//
// This module answers it: `open` / `tight` / `closed`, with the BINDING
// CONSTRAINT named in one sentence, the numbers it fired on, a link to the field
// that produced it, and the nearest dates they *could* say yes to.
//
// Two constraints are implemented here (increment 1):
//
//   1. SUPPLY   — carts/rooms demanded vs available on the date, honouring
//                 block-outs. Routed through `radarConflictOpts` (see below).
//   2. LEAD TIME — `date − prep_lead_days < today` ⇒ it cannot be prepped in
//                 time, whatever the calendar looks like.
//
// Two more are DELIBERATELY ABSENT, and the seams are marked `SEAM (3)` /
// `SEAM (4)` below:
//
//   3. PREP OCCUPANCY — a booked job on Sep 13 puts real, dated work on the days
//      before it (build the ops pack, wash kegs, load the van). Those days are
//      not free either. Needs a per-event prep ladder — new fields on Event plus
//      a subcollection fan-out over ops packs — so it is not computable from the
//      sources the cockpit already loads.
//   4. CASH — the consumables for a September job are bought with the deposit
//      that lands in August. A date whose funding invoice is unsent or unpaid is
//      not really bookable. Needs invoice-to-event funding links that the schema
//      does not yet carry.
//
// The whole reason the compound is worth building is that no horizontal product
// can compute it: Jobber derives availability from working hours ∩ conflicts ∩
// drive time but does not know a booked job creates dated obligations on OTHER
// days, and knows nothing about cash. Goodshuffle Pro knows inventory but has no
// prep ladder. ServiceTitan models hourly capacity but not a consumables
// purchase funded by a deposit. Until 3 and 4 land, this file delivers the two
// legs that ARE computable from what the repo already models — and says so
// rather than implying the full compound.
//
// PROVENANCE IS THE POINT. Every non-open verdict carries `rule`, `inputs`,
// `reason` and a `fixHref` — the same shape as `CalendarItem.derived` in
// lib/calendar.ts, which exists so this feature could not ship as a black box.
// A wrong verdict must be fixable at source, not merely disbelieved. And nothing
// here BLOCKS: every surface that renders a verdict keeps its "Book a job"
// affordance live. The verdict suggests; the operator decides.
// ─────────────────────────────────────────────────────────────────────────────

export type BookabilityVerdict = 'open' | 'tight' | 'closed'

/** Stable machine ids, worst-first. Every rule names itself. */
export type BookabilityRule =
  | 'leadtime.book-by-passed'
  | 'capacity.blocked-out'
  | 'capacity.over'
  | 'capacity.at-capacity'
  | 'capacity.unit-clash'
  | 'capacity.unknown'

/**
 * Structurally assignable to `CalendarItem.derived` (lib/calendar.ts) — same
 * four fields, except `fixHref` is REQUIRED here. A verdict the operator cannot
 * trace to a field is a black box, which is the one thing this feature is not
 * allowed to be.
 */
export interface BookabilityBinding {
  rule: BookabilityRule
  inputs: Record<string, string | number | boolean>
  reason: string
  fixHref: string
}

/**
 * THE PROVENANCE CHANNEL FOR `open` — the mirror image of `BookabilityBinding`.
 *
 * `binding` answers "what stopped this day?", so an open day has none: forcing a
 * binding constraint onto a verdict where nothing bound would corrupt both the
 * word and the worst-first ordering that ranks them, and `fixHref` (REQUIRED on
 * a binding) has nothing to point at when nothing is wrong. But an open verdict
 * is still a CLAIM, and until now it shipped with zero evidence — `binding:
 * null` and a UI sentence asserting "nothing on file stands in the way".
 *
 * That sentence is only true for one of the two things `open` actually means:
 *
 *   • `clear`      — either literally nothing is on the date, or a real capacity
 *                    model reports real headroom. The claim is supported.
 *   • `unverified` — the date already carries a job, and we are on the degraded
 *                    arm with no capacity model at all, so we cannot say whether
 *                    that job is the operator's whole Saturday or a third of it.
 *                    The honest answer is "nothing ELSE on file", plus the link
 *                    that would let us do better — exactly the shape
 *                    `capacity.unknown` already uses one severity up.
 *
 * The distinction is not cosmetic: `nextOpenDates` offers only `clear` days, so
 * the rail's "Next open Saturday" chips can no longer hand the operator a
 * one-tap double-booking.
 */
export type BookabilityBasisKind = 'clear' | 'unverified'

export interface BookabilityBasis {
  kind: BookabilityBasisKind
  /** How many jobs the cockpit already renders on this date. */
  booked: number
  /** One human sentence. Never claims more than `kind` supports. */
  reason: string
  /** `unverified` only — where to go to make the answer knowable next time. */
  fixHref?: string
}

export interface Bookability {
  verdict: BookabilityVerdict
  /** The worst constraint that fired. `null` — and only null — when open. */
  binding: BookabilityBinding | null
  /** What the `open` verdict rests on. Non-null exactly when open — the
   *  complement of `binding`; the two never coexist. */
  basis: BookabilityBasis | null
  /** Nearest open dates to offer instead. Empty when the date is already open. */
  alternatives: string[]
}

/**
 * The radar half of the context — EXACTLY the union `radarConflictOpts` returns,
 * flattened to plain JSON so it crosses the RSC boundary without relying on
 * Map/Set serialisation.
 *
 * `units` lives INSIDE the capacity arm on purpose. It is the zero-units
 * backstop made structural: in the degraded arm there are literally no units in
 * scope to read, so no future edit can accidentally compute supply for an org
 * that has not defined any. The only door into the capacity arm is
 * `radarConflictOpts` returning `capacityByDate`, which happens only for a
 * business-tier org with >= 1 configured unit.
 */
export type BookabilityRadar =
  | { mode: 'capacity'; capacityByDate: Record<string, CapacityDay>; units: CapacityUnit[] }
  | {
      mode: 'degraded'
      /** The ROUTER's answer: dates carrying ≥2 jobs. Comes from
       *  `radarConflictOpts` and nothing else — `lib/pipeline-view.ts` stays the
       *  single authority on what counts as a conflict. */
      conflictDates: string[]
      /**
       * The HONESTY channel: how many jobs each date carries. Not a second
       * conflict rule — it never changes a verdict, it only decides whether an
       * `open` one is allowed to say "nothing on file". Derived from the same
       * demand records with the same stage filter as `conflictEventDates`, so
       * `bookedCounts[d] >= 2` and `conflictDates.includes(d)` cannot disagree.
       *
       * Lives INSIDE the degraded arm for the same structural reason `units`
       * lives inside the capacity one: on the capacity arm the real supply/demand
       * breakdown is in scope and this weaker signal must not be reachable.
       */
      bookedCounts: Record<string, number>
    }

export interface BookabilityCtx {
  /** ISO ymd. Lead time is measured from here. */
  today: string
  prepLeadDays: number
  /** Builds the `fixHref` deep links. */
  orgSlug: string
  radar: BookabilityRadar
}

// ── fix targets ──────────────────────────────────────────────────────────────
// Where a wrong verdict gets corrected. Both are real routes today.
//
// SEAM: `prep_lead_days` has no editor yet — it is read from the Org doc and
// written by nothing in the app. Until that field ships, the honest target is
// the org settings hub; point this at the field itself the day it exists.
const capacityFixHref = (orgSlug: string) => `/${orgSlug}/capacity`
const prepLeadFixHref = (orgSlug: string) => `/${orgSlug}/settings`

// ── operator language ────────────────────────────────────────────────────────
// "cart" and "room", not "mobile" and "venue". The settings page already calls
// them that in prose (components/admin/settings/CapacityUnitsClient.tsx), and
// the sentence is read aloud on a phone call (Nielsen #2, match the real world).
const UNIT_NOUN: Record<CapacityUnitKind, { one: string; many: string }> = {
  mobile: { one: 'cart', many: 'carts' },
  venue: { one: 'room', many: 'rooms' },
}

const nUnits = (n: number, kind: CapacityUnitKind) =>
  `${n} ${n === 1 ? UNIT_NOUN[kind].one : UNIT_NOUN[kind].many}`

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "Sep 13". Composed, never `toLocaleDateString` — the sentence must read the
 *  same in every locale and in every test runner. */
export function shortDayLabel(ymd: string): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`)
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/** "Saturday" — the weekday the alternatives are matched on. */
export function weekdayName(ymd: string): string {
  return WEEKDAYS_LONG[new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`).getUTCDay()]
}

export const VERDICT_LABEL: Record<BookabilityVerdict, string> = {
  open: 'Open',
  tight: 'Tight',
  closed: 'Closed',
}

// ── DEMAND: the same records the grid renders ────────────────────────────────
//
// The capacity engine reads demand off `Lead.event_date`, exactly. The COCKPIT
// renders bookings off `Event.event_start`. Those are not the same set, and the
// gap between them is where the verdict used to contradict the grid inside one
// 360px pane — "nothing on file stands in the way of this day" printed directly
// above that day's job block, with its venue and headcount.
//
// Three concrete holes, all one root cause:
//
//   1. `app/(admin)/[orgSlug]/new-event/page.tsx` calls `createEvent` with NO
//      `lead_id` — and it is the target of the day spine's OWN empty-day CTA.
//      That job exists only as an Event, so lead-only demand cannot see it.
//   2. `l.event_date === date` is exact equality, so only the START of a
//      multi-day job counted. The grid draws it on every interior day
//      (`feedForDay` honours `endDate`); the verdict called those days free.
//   3. An event-only reschedule (actions/calendar-bulk.ts:68-77) moves
//      `Event.event_start` and leaves `Lead.event_date` behind, so demand landed
//      on a day the job is no longer on.
//
// `lib/capacity/capacity.ts` and `lib/pipeline-view.ts` are shared with the
// Pipeline module and are not ours to change, so this is an ADAPTER, not a new
// engine: it translates the calendar's real bookings into the record shape the
// existing engine already understands, and hands the result to the SAME
// `radarConflictOpts` router. The gate and the zero-units backstop are untouched.

/**
 * Ceiling on how many days one event may occupy, so a malformed `event_end`
 * (a typo'd year is the realistic case) costs a bounded amount of work instead
 * of synthesising ~27,000 demand records and capacity entries. Beyond this the
 * job simply stops consuming days; it is never dropped.
 */
export const MAX_EVENT_SPAN_DAYS = 366

/**
 * The org's real per-day demand, expressed as the record shape
 * `computeCapacity` / `conflictEventDates` consume.
 *
 * THE CONVERTED-OPPORTUNITY RULE, mirrored from `buildCalendarFeed`
 * (lib/calendar.ts): a converted opportunity has BOTH an Event and a Lead, and
 * the feed keeps the event row and skips the lead — `scheduledLeadIds` is built
 * from EVERY event carrying a `lead_id`, and the tentative-hold loop skips any
 * lead in that set. Mirrored byte-for-byte here, because unioning the two
 * instead would report two carts needed where one is.
 *
 * The stage filter is deliberately NOT applied here: `BOOKABLE_STAGES` (open ∪
 * closed_won = everything but `closed_lost`) is applied downstream by the
 * capacity engine and by `conflictEventDates`, and it is identical to the feed's
 * own `stage !== 'closed_lost'` hold filter. Leaving it downstream means an org
 * with no events gets back its lead list unchanged — the fix cannot alter the
 * lead-only path even by accident.
 *
 * Events are emitted at `closed_won` because a job on the calendar IS booked
 * work whatever produced it, including the `/new-event` case that has no
 * opportunity at all. Delivery mode and any pinned unit ride across from the
 * source lead so room demand and unit clashes survive the translation.
 */
export function calendarDemand(leads: Lead[], events: Event[]): Lead[] {
  const scheduledLeadIds = new Set(events.map((e) => e.lead_id).filter((id): id is string => !!id))
  // Same liveness test the feed uses: an archived or undated event is on no
  // calendar surface, so it consumes nothing.
  const liveEvents = events.filter((e) => e.status !== 'archived' && e.event_start)
  const leadById = new Map(leads.map((l) => [l.id, l]))

  const out: Lead[] = leads.filter((l) => !scheduledLeadIds.has(l.id))

  for (const e of liveEvents) {
    const start = e.event_start.slice(0, 10)
    const rawEnd = e.event_end?.slice(0, 10)
    // `event_end` is absent on legacy rows and can be malformed; both read as a
    // single day, matching lib/calendar.ts's `endDate` rule.
    const end = rawEnd && rawEnd > start ? rawEnd : start
    const src = e.lead_id ? leadById.get(e.lead_id) : undefined
    for (let i = 0; i <= MAX_EVENT_SPAN_DAYS; i++) {
      const day = addDays(start, i)
      if (day > end) break
      out.push({
        id: `event:${e.id}:${day}`,
        name: e.name,
        stage: 'closed_won',
        created_at: e.created_at,
        event_date: day,
        ...(src?.delivery_mode ? { delivery_mode: src.delivery_mode } : {}),
        ...(src?.assigned_units ? { assigned_units: src.assigned_units } : {}),
      })
    }
  }

  return out
}

/** Jobs per date, on the SAME filter `conflictEventDates` uses, so the two can
 *  never disagree about what "≥2" means. */
function bookedCountsByDate(demand: Lead[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const l of demand) {
    if (!l.event_date || !BOOKABLE_STAGES.has(l.stage)) continue
    counts[l.event_date] = (counts[l.event_date] ?? 0) + 1
  }
  return counts
}

/**
 * Build the context from the raw org sources.
 *
 * THE ONE DOOR to the capacity gate: this calls `radarConflictOpts`, and nothing
 * in this module calls `computeCapacity` directly. That routing is not a style
 * preference — `radarConflictOpts` encodes two things that must not be
 * re-derived here:
 *
 *   • the business-tier gate (`hasMultiResourceCapacity`), and
 *   • the ZERO-UNITS BACKSTOP. A business org with no units defined yet would
 *     otherwise have supply 0 for every kind, so every dated day would come back
 *     over-capacity and the whole calendar would read `closed`. That is the
 *     DEFAULT state of a newly-upgraded org — it has no units until someone
 *     opens Settings — not an edge case.
 *
 * What changed with events: only the LIST handed to the router. The router, the
 * gate and the backstop are exactly as they were.
 *
 * `events` is REQUIRED, not optional with a `[]` default. An optional argument
 * is how this defect gets reintroduced: a new caller forgets it, the verdict
 * silently goes back to lead-only demand, and every test still passes.
 */
export function buildBookabilityCtx(input: {
  orgSlug: string
  org: Pick<Org, 'plan' | 'prep_lead_days'>
  leads: Lead[]
  /** Every event the calendar renders. See `calendarDemand`. */
  events: Event[]
  units: CapacityUnit[]
  today: string
}): BookabilityCtx {
  const demand = calendarDemand(input.leads, input.events)
  const opts = radarConflictOpts(input.org, demand, input.units)
  const radar: BookabilityRadar =
    'capacityByDate' in opts
      ? {
          mode: 'capacity',
          capacityByDate: Object.fromEntries(opts.capacityByDate),
          units: input.units,
        }
      : {
          mode: 'degraded',
          conflictDates: [...opts.conflictDates],
          bookedCounts: bookedCountsByDate(demand),
        }
  return {
    today: input.today.slice(0, 10),
    prepLeadDays: input.org.prep_lead_days ?? DEFAULT_PREP_LEAD_DAYS,
    orgSlug: input.orgSlug,
    radar,
  }
}

/**
 * The worst constraint binding on `date`, WITHOUT the alternatives scan.
 *
 * This is the grid path: a month view asks 42 times per render, and computing
 * alternatives for each would be 42 x 26 evaluations to render marks nobody can
 * read at 8px. `bookability()` below adds the alternatives for the two n:1
 * surfaces (the day spine and the rail) that actually show them.
 *
 * Rules are evaluated WORST-FIRST — every `closed` rule before every `tight`
 * one, and within `closed`, lead time before supply. Lead time first because it
 * is the constraint no amount of shuffling fixes: you cannot buy back calendar
 * days, but you can unblock a cart, sub-rent one, or move a job. Naming the
 * unfixable constraint is the honest headline; the fixable one is still there
 * when the operator returns after fixing the first.
 */
export function bindingConstraint(
  date: string,
  ctx: BookabilityCtx
): { verdict: BookabilityVerdict; binding: BookabilityBinding | null; basis: BookabilityBasis | null } {
  const ymd = date.slice(0, 10)
  const { verdict, binding } = worstConstraint(ymd, ctx)
  // Structural, not conventional: `basis` is attached in exactly one place and
  // only on the open path, so "non-null iff open" cannot drift as rules are
  // added below.
  return { verdict, binding, basis: verdict === 'open' ? openBasis(ymd, ctx) : null }
}

/**
 * WHAT AN OPEN VERDICT IS ALLOWED TO CLAIM, and the numbers behind it.
 *
 * Two arms, two very different epistemic positions:
 *
 * • CAPACITY arm — a real model, with real supply. Reaching `open` here means
 *   the day is genuinely under capacity, un-blocked and un-clashed, so the claim
 *   is supported and the sentence can name the headroom it is resting on. That
 *   is why a busy-but-not-full day stays offerable as an alternative: refusing
 *   to offer 1-of-3 carts would under-sell availability the model can vouch for.
 *
 * • DEGRADED arm — no capacity model at all. `tight` fires only at ≥2 jobs, so
 *   the ONE-job case fell through to an unqualified "nothing on file stands in
 *   the way" — the most frequent case, and the one where a one-cart operator is
 *   most likely to double-book on the strength of it. The module already knew it
 *   could not tell (see `capacity.unknown` below); the hedge was just never
 *   applied at this severity. Now it is: same ignorance, same admission, same
 *   link — and the day stops being offered as an alternative.
 *
 * NOT escalated to `tight`. Flagging every single-job day would fire on the
 * default state of every solo org, which is the same false-flag class the
 * zero-units backstop exists to prevent. The verdict is honest; only the claim
 * attached to it narrows.
 */
function openBasis(ymd: string, ctx: BookabilityCtx): BookabilityBasis {
  if (ctx.radar.mode === 'capacity') {
    const day = ctx.radar.capacityByDate[ymd]
    // Every bookable job consumes a serving unit, so mobile demand IS the job
    // count for the date (lib/capacity/capacity.ts).
    const mobile = day?.detail.find((d) => d.kind === 'mobile')
    const booked = mobile?.demand ?? 0
    if (booked === 0) return { kind: 'clear', booked: 0, reason: clearReason(ymd) }
    // Reaching `open` past the over/at-capacity rules means supply > demand.
    const free = Math.max(0, (mobile?.supply ?? 0) - booked)
    return {
      kind: 'clear',
      booked,
      reason:
        `${booked} job${booked === 1 ? '' : 's'} already on ${shortDayLabel(ymd)} — ` +
        `${nUnits(free, 'mobile')} still free.`,
    }
  }

  const booked = ctx.radar.bookedCounts[ymd] ?? 0
  if (booked === 0) return { kind: 'clear', booked: 0, reason: clearReason(ymd) }
  return {
    kind: 'unverified',
    booked,
    reason:
      `${booked === 1 ? 'One job already shares' : `${booked} jobs already share`} ` +
      `${shortDayLabel(ymd)}. No cart or room capacity is set up, so I can't tell whether ` +
      `you have room for another.`,
    fixHref: capacityFixHref(ctx.orgSlug),
  }
}

const clearReason = (ymd: string) => `Nothing on file stands in the way of ${shortDayLabel(ymd)}.`

/** The worst constraint binding on `ymd`, worst-first. `bindingConstraint`
 *  wraps this and attaches the open-verdict provenance. */
function worstConstraint(
  ymd: string,
  ctx: BookabilityCtx
): { verdict: BookabilityVerdict; binding: BookabilityBinding | null } {

  // ── CONSTRAINT 2: LEAD TIME (closed) ───────────────────────────────────────
  // Pure arithmetic on a field the org already stores. The book-by date is the
  // same one the pipeline ranks by (lib/pipeline-view.ts) — one definition of
  // "the day this had to be sold by", not two.
  //
  // BOUNDARY: `bookBy === today` is still bookable. A 14-day prep lead means a
  // date exactly 14 days out can be sold TODAY; only the day after that is too
  // late. Strict `<`, never `<=`.
  const bookBy = addDays(ymd, -ctx.prepLeadDays)
  if (bookBy < ctx.today) {
    return {
      verdict: 'closed',
      binding: {
        rule: 'leadtime.book-by-passed',
        inputs: { date: ymd, bookBy, today: ctx.today, prepLeadDays: ctx.prepLeadDays },
        reason:
          `${shortDayLabel(ymd)} can't be prepped in time — with a ${ctx.prepLeadDays}-day prep lead, ` +
          `the book-by date was ${shortDayLabel(bookBy)}.`,
        fixHref: prepLeadFixHref(ctx.orgSlug),
      },
    }
  }

  // ── CONSTRAINT 1: SUPPLY ───────────────────────────────────────────────────
  if (ctx.radar.mode === 'capacity') {
    const { units, capacityByDate } = ctx.radar
    const day = capacityByDate[ymd]

    // (a) blocked out — closed. Every active cart is retired or blocked out on
    // this date, so there is nothing to send whether or not anything is booked.
    //
    // The `activeCarts > 0` guard is load-bearing and is the same class of
    // false-flag the zero-units backstop prevents: an org that has only defined
    // ROOMS has zero carts on every date, and without this guard every day of
    // its calendar would read "every cart is blocked out". Only an org that
    // genuinely runs carts can have them all blocked.
    //
    // Carts only. A room shortage binds solely on ON-SITE jobs, and an inbound
    // "are you free?" has no delivery mode yet — so venue enters through real
    // demand (over / at-capacity below), never through a speculative block.
    const activeCarts = units.filter((u) => u.kind === 'mobile' && u.active).length
    if (activeCarts > 0 && supply(units, 'mobile', ymd) === 0) {
      const blocked = units.find(
        (u) => u.kind === 'mobile' && u.active && u.blockouts.some((b) => b.start <= ymd && ymd <= b.end)
      )
      const note = blocked?.blockouts.find((b) => b.start <= ymd && ymd <= b.end)?.note
      return {
        verdict: 'closed',
        binding: {
          rule: 'capacity.blocked-out',
          inputs: { date: ymd, kind: 'mobile', available: 0, activeUnits: activeCarts },
          reason:
            `Every cart is blocked out on ${shortDayLabel(ymd)}` +
            (blocked ? ` (${blocked.name}${note ? `: ${note}` : ''})` : '') +
            '.',
          fixHref: capacityFixHref(ctx.orgSlug),
        },
      }
    }

    // (b) over capacity — closed. `over` is computed by lib/capacity, not here.
    // Name the kind with the biggest shortfall; carts win a tie because a mobile
    // job always needs one and only an on-site job needs a room. `short` is
    // guarded rather than asserted: `over` and `detail` come in through the ctx,
    // and a verdict that throws is worse than one that declines to fire.
    const short = day?.over
      ? day.detail
          .filter((d) => d.demand > d.supply)
          .sort((a, b) => b.demand - b.supply - (a.demand - a.supply) || (a.kind === 'mobile' ? -1 : 1))[0]
      : undefined
    if (short) {
      return {
        verdict: 'closed',
        binding: {
          rule: 'capacity.over',
          inputs: { date: ymd, kind: short.kind, demand: short.demand, supply: short.supply },
          reason:
            `${shortDayLabel(ymd)} is already over capacity — ` +
            `${short.demand} job${short.demand === 1 ? '' : 's'} need a ${UNIT_NOUN[short.kind].one} ` +
            `and only ${nUnits(short.supply, short.kind)} ${short.supply === 1 ? 'is' : 'are'} available.`,
          fixHref: capacityFixHref(ctx.orgSlug),
        },
      }
    }

    // (c) at capacity but not over — tight. The day is full, but a new booking
    // is a decision (add a cart, sub-rent, decline), not an impossibility.
    if (day) {
      const full = day.detail.filter((d) => d.supply > 0 && d.demand === d.supply)[0]
      if (full) {
        return {
          verdict: 'tight',
          binding: {
            rule: 'capacity.at-capacity',
            inputs: { date: ymd, kind: full.kind, demand: full.demand, supply: full.supply },
            reason:
              `${shortDayLabel(ymd)} is fully committed — all ${nUnits(full.supply, full.kind)} ` +
              `${full.supply === 1 ? 'is' : 'are'} taken. One more job needs ` +
              `${full.supply === 1 ? 'a second' : 'another'} ${UNIT_NOUN[full.kind].one}.`,
            fixHref: capacityFixHref(ctx.orgSlug),
          },
        }
      }

      // (d) a single unit pinned to two jobs — tight. Orthogonal to `over`: the
      // day can be under capacity and still have Kart 1 promised twice. Worth
      // saying at the moment of "are you free", because the day is not as clean
      // as its headroom suggests.
      const clash = day.clashes[0]
      if (clash) {
        return {
          verdict: 'tight',
          binding: {
            rule: 'capacity.unit-clash',
            inputs: { date: ymd, unit: clash.unitName, kind: clash.kind, jobs: clash.count },
            reason:
              `${clash.unitName} is double-booked on ${shortDayLabel(ymd)} ` +
              `(${clash.count} jobs) — sort that before adding another.`,
            fixHref: capacityFixHref(ctx.orgSlug),
          },
        }
      }
    }

    return { verdict: 'open', binding: null }
  }

  // ── DEGRADED: no capacity model to reason with ─────────────────────────────
  // We are on the backstop path — either a base/solo plan or a business org that
  // has not defined a unit yet — so all we were handed is "these dates carry two
  // or more bookable jobs". That is NOT enough to say `closed`: two jobs on a
  // Saturday is over the limit for a one-cart operator and completely fine for a
  // three-cart one, and nothing here knows which they are. Reporting `closed`
  // from that would be a confident answer we cannot substantiate, and the
  // operator would decline real work on it.
  //
  // So: `tight`, and the reason says out loud what we do not know, with the link
  // that would let us know it next time. Every other date stays `open` — the
  // backstop's whole job is to keep quiet until the operator has told us their
  // capacity.
  if (ctx.radar.conflictDates.includes(ymd)) {
    return {
      verdict: 'tight',
      binding: {
        rule: 'capacity.unknown',
        inputs: { date: ymd, capacityConfigured: false },
        reason:
          `More than one job already shares ${shortDayLabel(ymd)}. No cart or room capacity is set up, ` +
          `so I can't tell whether that is over your limit.`,
        fixHref: capacityFixHref(ctx.orgSlug),
      },
    }
  }

  return { verdict: 'open', binding: null }
}

/** How far the alternatives scan looks ahead, in same-weekday steps. */
export const ALTERNATIVE_HORIZON_WEEKS = 26
export const ALTERNATIVE_COUNT = 3

/**
 * The nearest open dates to offer instead — FORWARD ONLY, and WEEKDAY-MATCHED.
 *
 * Both halves of that rule are deliberate:
 *
 * • Forward only. Under lead time, an earlier date is strictly worse — the
 *   constraint is monotone in the past direction, so a "nearest either way"
 *   scan would keep offering dates that are more closed than the one asked
 *   about. And the caller is on a phone call about a date they have in mind;
 *   dates behind it are not on offer.
 *
 * • Weekday-matched (+7 at a time). For a mobile-beverage operator the real
 *   question behind "are you free September 13?" is almost always "can you do a
 *   Saturday". A wedding, a market day or a brewery pop-up does not move to a
 *   Tuesday, so a strictly-nearest scan would hand back three answers the
 *   customer cannot use. Google Calendar's "Find a time" and Calendly both
 *   suggest the strictly-nearest slot; neither knows the job is weekend-shaped.
 *   This is the one place we deliberately diverge from them.
 *
 * The trade-off is stated plainly rather than hidden: the caller renders these
 * under the weekday name ("Next open Saturday"), so an operator who wants a
 * weekday instead can still read the grid.
 *
 * OFFERABLE MEANS `clear`, NOT MERELY `open`. These are rendered as <Link>s — in
 * the rail's "Next open Saturday" chips and under the day spine's banner — so a
 * date returned here is a date the operator taps and books. On the degraded arm
 * a day already carrying a job comes back `open` (we cannot substantiate
 * anything stronger), and offering that as an alternative would be handing them
 * a one-tap double-booking on the strength of a verdict that explicitly says it
 * cannot tell. A capacity-arm day with real headroom stays offerable: there the
 * model can vouch for it.
 */
export function nextOpenDates(
  date: string,
  ctx: BookabilityCtx,
  limit: number = ALTERNATIVE_COUNT
): string[] {
  const out: string[] = []
  let cursor = date.slice(0, 10)
  for (let week = 1; week <= ALTERNATIVE_HORIZON_WEEKS && out.length < limit; week++) {
    cursor = addDays(cursor, 7)
    const { verdict, basis } = bindingConstraint(cursor, ctx)
    if (verdict === 'open' && basis?.kind === 'clear') out.push(cursor)
  }
  return out
}

/**
 * THE ANSWER. `open` / `tight` / `closed`, the binding constraint named in a
 * sentence with the numbers it fired on and a link to the field behind it, and
 * the nearest dates to offer instead.
 */
export function bookability(date: string, ctx: BookabilityCtx): Bookability {
  const { verdict, binding, basis } = bindingConstraint(date, ctx)
  return {
    verdict,
    binding,
    basis,
    // Nothing to offer instead of a day that is already open — a list of other
    // free Saturdays under a free Saturday is noise.
    alternatives: verdict === 'open' ? [] : nextOpenDates(date, ctx),
  }
}
