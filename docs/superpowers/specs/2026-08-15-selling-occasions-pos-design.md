# Selling occasions & POS foundation — design spec

Date: 2026-08-15
Status: approved direction (foundation, series, nav, legacy retirement confirmed by Ryan); spec pending review
Prior art: `docs/superpowers/specs/2026-08-15-drops-online-ordering-design.md` (the Order
ledger with reserved `counter`/`tab` channels this design activates),
`docs/superpowers/specs/2026-08-15-sidebar-ia-redesign-design.md` (the Events section and
job-context-in-nav this design extends),
`docs/superpowers/specs/2026-08-09-proposal-terms-contracts-retirement-design.md` (the
staged-feature-removal precedent the registration retirement follows).

## 1. Context and goal

The drops increment shipped the unified money layer: one Order ledger where every sale
carries a `channel` (`drop` live; `counter`/`tab` reserved). What was never designed is
the **occasion layer** — the entity that means "I'm selling at the City Market Saturday."
Today a market day has no home: Events mean client jobs, Drops mean pre-order windows,
and the demo models a farmers-market stall as a pipeline Lead. The nav question that
exposed this ("shouldn't Drops be under Events?") is the symptom; this spec is the cure.

**Goal:** make self-initiated public selling days (farmers markets, city markets,
pop-ups) first-class occasions sharing Event's entire orbit — calendar, Today agenda,
sidebar, duplication, pipeline conversion, ops, closeout — and define the architecture
for the counter register (the POS moment), capped event tabs, the drop↔market linkage,
and the public "find us" surface, while starting the deliberate retirement of the
camp-era registration machinery.

**Decisions taken (Ryan, 2026-08-15):**
1. **Foundation: market days are a kind of Event** (Approach A). No new occasion entity;
   no grand unification. Discipline note: kinds share the spine (dates, status, calendar,
   closeout) and diverge only in detail UI — Event must not become a junk drawer of kinds.
2. **Series are first-class and materialize up-front**: creating a series generates every
   day in the season as a real Event doc (capped), immediately visible everywhere. No
   background jobs.
3. **Nav: the Events section absorbs occasions**, keeps its name, and gets one "+ New"
   chooser (Client job / Market day / Series / Drop). The Drops row moves from Catalog
   into Events. Vertical-skin relabeling of the section stays available at the pack layer.
4. **Booking flow is both-ways**: market days are created directly, or converted from a
   won opportunity (a market application) via the existing convert-to-work seam.
5. **Register v1 is hardware-free**: tap-to-tally, cash, and QR-to-pay. No card-present
   hardware, no native app.
6. **Retire the camp legacy** — registration machinery (rosters, families, check-in,
   per-registrant payments) leaves the product in a staged, audited removal (§8).

## 2. Scope

This spec covers the architecture for four build increments (§9). Increment 1 (occasions
core) is specified to build-ready depth; increments 2–4 are specified to architectural
depth and get their own implementation plans when picked up.

**Out of scope entirely:** card-present hardware (Stripe Terminal / Tap to Pay), offline
register operation (v1 requires connectivity; noted as a known market-site risk),
client-job series (series generate market days only in v1), inventory/stock on counter
sales, multi-operator registers, Square import.

## 3. Domain model

### 3.1 Event gains a kind (and sheds camp assumptions)

```
Event {
  // existing spine unchanged: id, name, slug, year, status, event_start, event_end,
  // event_type_id, lead_id?, headcount?, key_contacts?, department_id?, created_at…

  kind?: 'client_job' | 'market_day'   // ABSENT = 'client_job' — zero migration
  location?: { name: string; address?: string }   // useful for client jobs too
  hours?: { start: string; end: string }          // 'HH:mm', display + register header
  booth_fee?: number                   // dollars; market-day cost, joins closeout margin
  series_id?: string                   // set on series-generated days
}
```

- `kindOf(event)` helper (`kind ?? 'client_job'`) is the only read path — no code ever
  reads `event.kind` raw.
- **Slimming (retirement stage R1, part of increment 1):** `registration_type` becomes
  optional on the type and on `createEventCore` (new events created without it; read
  paths treat absence as `'individual'`); the five `features` flags stop being written
  on create (read-compatible); `payment_amount`, `registration_open/close`, `capacity`
  stop appearing in any create/edit UI outside the attendee-roster module. No stored
  data changes in R1.

### 3.2 EventSeries — `orgs/{orgId}/event_series`

```
EventSeries {
  id: string
  name: string                          // "Boise Farmers Market"
  kind: 'market_day'                    // v1: market days only
  location: { name: string; address?: string }
  hours: { start: string; end: string }
  recurrence: {
    freq: 'weekly'                      // v1: weekly only
    weekday: number                     // 0–6 (Sun–Sat)
    from: string                        // YYYY-MM-DD (first candidate day)
    until: string                       // YYYY-MM-DD inclusive (season end)
  }
  booth_fee?: number                    // default copied onto each generated day
  event_type_id?: string                // defaults like direct event creation
  active: boolean                       // false = ended early; generated days untouched
  created_at / updated_at
}
```

**Generation (up-front, pure):** `seriesOccurrences(recurrence): string[]` is a pure
date-math function returning every matching YYYY-MM-DD in [from, until], **capped at 30**
(cap exceeded → error naming the cap; "Extend series" later generates the next span).
`createSeriesCore` writes the series doc, then one Event per occurrence
(`kind: 'market_day'`, `series_id`, `name: series.name`, `event_start = event_end = day`,
location/hours/booth_fee copied, status `'draft'` → flipped `'active'` in the same pass;
market days need no draft gate). Generation is idempotent per (series_id, day): an Event
with that pair already existing is skipped, so re-runs and "extend" never duplicate.

**Series edits** update the series doc and offer **"apply to remaining days"**: bulk
update of location/hours/booth_fee on this series' future (`event_start >= today`),
non-archived days. Individually edited fields on a day are overwritten by propagation —
documented behavior, kept simple deliberately.

**Skip a week** = archive that day (existing status machinery). **Extend** = raise
`until`, generate the delta. **Cancel the season** = `active: false` + bulk-archive
remaining future days (confirm dialog).

### 3.3 Order anchor generalization

```
Order {
  channel: 'drop' | 'counter' | 'tab'
  drop_id?: string       // was required — now the drop-channel anchor
  event_id?: string      // NEW — the counter/tab-channel anchor
  …
}
```

Invariant (enforced in cores): `drop` ⇒ `drop_id` set; `counter`/`tab` ⇒ `event_id`
set; never both. Existing orders (all `channel: 'drop'` with `drop_id`) satisfy it
untouched. `listOrdersForEventCore(orgId, eventId)` joins the existing per-drop lister.

### 3.4 Counter order shape (increment 2)

Counter orders reuse the Order type: `channel: 'counter'`, `event_id`, lines from
Products, no pickup window (`pickup_window_id` becomes optional — drop-channel-only),
no buyer for cash/comp sales (`buyer` becomes optional; QR orders capture it at
checkout). New `payment_kind?: 'card' | 'cash' | 'comp'` records how money moved;
cash/comp orders are born `confirmed` with a tally number, card orders follow the
pending→webhook-confirm path that already exists.

## 4. The counter register (increment 2 architecture)

- **Route:** `/{orgSlug}/counter/[eventId]` — shell-free exactly like the orders board
  (`'counter'` stays out of `ORG_PAGE_SLUGS`), mobile-first, opened from a market day's
  detail or the Today agenda rail.
- **Screen:** a tap grid of active Products (big targets, gloves-friendly); tapping
  builds the current sale; buttons **Cash**, **QR**, **Comp**. Cash/Comp finalize
  instantly (confirmed counter order, running totals update). **QR** creates a pending
  counter order and fills the screen with a QR of the public pay page; the buyer scans,
  pays through the existing Elements checkout (new thin public page
  `/pay/[orderToken]` reusing the drop checkout's payment component), and the existing
  webhook confirms it (`purpose: 'counter_order'`, same idempotent confirm core). The
  register polls/refreshes the order to show "paid ✓".
- **Running header:** cup count, revenue by payment kind, and the day's hours — the
  numbers the operator glances at all day.
- **Refunds:** same `cancelOrder` action; cash orders get a record-only "mark refunded"
  variant (no Stripe call).
- **Known risk, accepted v1:** market-site connectivity. The register requires being
  online; a dead zone means falling back to paper tallies entered later (manual counter
  orders — a small "add sale after the fact" affordance ships with the register).

## 5. Closeout grows up for selling days (increment 2)

- Market-day closeout works **without an ops plan** (`closeoutSummaryCore` tolerates a
  missing plan when the day has counter orders; the guests>0 requirement applies only
  to client jobs).
- `CloseoutSummary` gains: `counter_revenue` (Σ confirmed/picked_up counter orders,
  derived — never hand-keyed), `tips` (Σ order tips), and `fees` (booth_fee + any
  recorded extras). Margin = revenue (packages + counter + manual sales + tips) − costs
  (consumables + fees). The lumped `OpsActuals.sales` field stays for client-job
  tips/extras; market days stop needing it.
- The series page shows season totals (Σ day closeouts) — the "was this market worth
  it" answer, which no competitor in the niche gives.

## 6. Navigation and surfaces (increment 1)

- **Events section children (no job open):** upcoming-5 occasion rows — market days
  carry a small kind tag beside the date tag (the existing Today-tag pattern) — then
  **Drops**, **All events**, **+ New**.
- **+ New** opens a chooser: **Client job · Market day · Series · Drop**. Client job →
  existing new-event flow; Market day → single-day create (location/hours/fee); Series →
  §3.2 create; Drop → existing drop editor. `/new-event` remains the client-job route;
  new routes `/new-market-day`, `/new-series` (added to `ORG_PAGE_SLUGS` +
  `SECTION_FOR_SLUG` → 'events').
- **Drops moves out of Catalog**: `SECTION_FOR_SLUG.drops` → `'events'`; the Catalog
  children list drops the Drops row; the Events children gain it (storefront-gated as
  today). Products stays in Catalog beside Packages.
- **All events page** groups by kind (client jobs / market days) with series grouping
  inside market days; kind badges reuse the tag styling.
- **Calendar/ICS/agenda**: market days are already `kind: 'event'` rows — they gain
  `detail: location.name` and the rail shows them under "On the cart today" untouched.
  No new CalendarKind.
- **Job context in-nav for market days**: clicking a market day opens a slimmer job nav —
  Overview, Register (increment 2), Closeout, Settings. The camp-era pages (families,
  assignments, check-in, teams…) never render for `kind: 'market_day'` regardless of
  module flags.

## 7. Increment 3 — tabs and the public surface

- **`publicMode` finally activates** — it becomes true for the coffee-cart pack and
  gates a "Find us" block on `/p/[handle]`: the next N upcoming market days (name,
  location, hours). Data is already public-safe (name/location/hours only).
- **Drop↔market linkage**: `Drop.pickup.event_id?` — choosing a market day as the
  pickup site copies its location and constrains pickup windows to that day. The drop
  page shows "Pickup at {market} — we'll be there {hours}".
- **Tabs (increment 3)**: `channel: 'tab'` orders anchor to a client-job event with a
  `tab_cap` on the event; the register's tally mode tallies against the cap; overage
  collects via the same QR checkout; closeout actuals receive it — completing the
  original three POS scenarios (record-only, capped, full sales).

## 8. Camp-legacy retirement (staged)

**Why it exists:** the platform began as church-camp registration; neutralization
(D1–D5) removed the framing but kept the machinery for the general pack.

- **R1 — in increment 1 (this build):** Event type slimming per §3.1; no new surface
  writes or requires registration-era fields; market-day job nav never shows roster
  pages. Nothing is deleted; no org's data changes.
- **R2 — its own increment (increment 4), audit-gated:** a read-only audit script
  counts real usage across production orgs (events with `families` docs, orgs with
  `registrants`/`attendee-roster` activity, registration payments in the webhook's
  history). **If zero live usage** (expected — the customer base is booked-job
  operators): remove the `(registrant)` route group and registrant auth, the
  families/assignments/check-in/event_people/volunteer-hours machinery and their event
  pages, the registration payment flow (`PaymentStep`, `/api/payments/intent`, the
  webhook's families branch — which also removes one of the two legacy 1%-fee call
  sites, advancing the roadmap's monetization open thread), the `attendee-roster` and
  `registrants` modules, the Event legacy fields (with a one-time doc cleanup), seeds
  and tests. **If usage exists:** the findings return to Ryan for a deprecation
  decision before anything is removed. The contracts-retirement spec is the template:
  one increment, one PR, roadmap entry, reversible until merged.

## 9. Build increments

1. **Occasions core** (build-ready in this spec): Event kind/location/hours/booth_fee/
   series_id + R1 slimming, EventSeries + up-front generation + series page, the nav
   rework (§6), market-day create/convert paths, calendar/agenda/All-events surfacing.
2. **Counter register**: §4 + §5 + order anchor generalization (§3.3–3.4) + `/pay/`
   public page + webhook `counter_order` purpose.
3. **Tabs + public**: tab channel + cap, `publicMode` find-us block, drop↔market
   pickup linkage.
4. **Registration retirement R2**: audit script → removal (or escalation), per §8.
   (SMS announcements remain queued from the drops spec, unaffected.)

## 10. Error handling & edge cases

- Series generation: cap-exceeded errors name the cap; idempotent per (series, day);
  partial-generation failure is safe to re-run (idempotency skips existing days).
- Propagation only touches future, non-archived, same-series days; archived (skipped)
  days stay skipped on extend/propagate.
- Register: QR order abandoned → standard 15-minute pending expiry; connectivity loss →
  after-the-fact manual sale entry; double-tap protection via busy state per sale.
- Convert-to-work for a market application sets `kind: 'market_day'` via an explicit
  kind choice on the convert card (defaults by opportunity title heuristics never —
  always explicit).
- Closeout without plan: only for market days; client jobs keep the plan requirement.

## 11. Testing

House patterns throughout: pure engines deep (`seriesOccurrences` date math incl. DST
boundaries and cap; anchor invariant; counter totals), cores with the transaction-mock
scaffolding (generation idempotency, propagate scope), component tests for the chooser,
register tally, and series page. `next build` + full suite green per increment; the
audit script (R2) ships with tests against seeded fixtures.
