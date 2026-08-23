import type { CapacityUnit, CapacityUnitKind, Lead, Org } from '@/lib/types'
import { supply, type CapacityDay } from '@/lib/capacity/capacity'
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

export interface Bookability {
  verdict: BookabilityVerdict
  /** The worst constraint that fired. `null` — and only null — when open. */
  binding: BookabilityBinding | null
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
  | { mode: 'degraded'; conflictDates: string[] }

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
 */
export function buildBookabilityCtx(input: {
  orgSlug: string
  org: Pick<Org, 'plan' | 'prep_lead_days'>
  leads: Lead[]
  units: CapacityUnit[]
  today: string
}): BookabilityCtx {
  const opts = radarConflictOpts(input.org, input.leads, input.units)
  const radar: BookabilityRadar =
    'capacityByDate' in opts
      ? {
          mode: 'capacity',
          capacityByDate: Object.fromEntries(opts.capacityByDate),
          units: input.units,
        }
      : { mode: 'degraded', conflictDates: [...opts.conflictDates] }
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
): { verdict: BookabilityVerdict; binding: BookabilityBinding | null } {
  const ymd = date.slice(0, 10)

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
    if (bindingConstraint(cursor, ctx).verdict === 'open') out.push(cursor)
  }
  return out
}

/**
 * THE ANSWER. `open` / `tight` / `closed`, the binding constraint named in a
 * sentence with the numbers it fired on and a link to the field behind it, and
 * the nearest dates to offer instead.
 */
export function bookability(date: string, ctx: BookabilityCtx): Bookability {
  const { verdict, binding } = bindingConstraint(date, ctx)
  return {
    verdict,
    binding,
    // Nothing to offer instead of a day that is already open — a list of other
    // free Saturdays under a free Saturday is noise.
    alternatives: verdict === 'open' ? [] : nextOpenDates(date, ctx),
  }
}
