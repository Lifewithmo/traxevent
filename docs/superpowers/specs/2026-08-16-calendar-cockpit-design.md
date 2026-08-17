# Calendar Scheduling Cockpit — Design Spec

> **Held to the [Design Ambition Standard](../../design/design-ambition-standard.md).**
> This is the first surface built through the frame-first gate: the
> category-defining mechanism is named up front, the frame is restructured (not
> wrapped), and every feasibility claim below is **verified against the real
> codebase**, not asserted — five secondary claims were adversarially checked
> and all five needed correction; the corrections are baked in here.

**Goal:** replace the current week-grid calendar with a three-pane **scheduling
cockpit** — a persistent left rail, a view-switching center canvas
(Month/Week/Day/Agenda), and a live-swapping right **day-detail spine** — that
answers "what's happening, what needs prep, and *am I financially covered
between now and each booked job*" from one screen.

**Architecture:** a nested App-Router layout (mirroring the Clients cockpit)
holding a bounded org feed, with a new `/calendar/[ymd]` day route feeding the
detail spine. All views render the existing unified `CalendarItem[]` feed; new
pure derivations add Booked-$ and the cash-flow runway. No Firestore migration.

**Tech stack:** Next.js 16 App Router (Turbopack), React 19, TypeScript,
Tailwind v4, Base UI, the shared `components/ui/` kit, Firestore via server
actions (`adminDb`).

---

## 1. Frame-first gate — the dominant-surface verdict

**The hero surface IS being restructured.** Today the week grid is the whole
screen; in the cockpit it becomes *one of four views* inside a three-pane shell,
and a new live day-detail spine becomes the primary "act on a day" surface. This
is a layout-architecture change (nested routing + persistent panes + live detail
swap), not a KPI strip appended to an unchanged grid.

```
BEFORE (bolt-on shipped in #94)          AFTER (this spec — great + category-defining)
┌───────────────────────────┐           ┌──────────┬────────────────────────┬───────────────┐
│ [kind filter tabs]        │           │ LEFT RAIL│   CENTER CANVAS         │ DAY-DETAIL    │
│ ┌───────────────────────┐ │           │          │  ⌘K · [M][W][D][Agenda] │ SPINE (/[ymd])│
│ │ KPI strip             │ │           │ mini-    │  ┌──────────────────┐   │ Mon Aug 20    │
│ ├───────────────────────┤ │           │ month    │  │ view-switching   │   │ ─ events      │
│ │ WEEK GRID (only view) │ │    ──▶     │          │  │ color-by-kind    │   │ ─ prep tasks  │
│ │ time band / owed band │ │           │ kind     │  │ canvas           │   │ ─ blockers    │
│ │                       │ │           │ filters  │  │                  │   │ ─ Related:    │
│ └───────────────────────┘ │           │          │  └──────────────────┘   │   job/prop/inv│
│ [attention rail, xl only] │           │ week KPIs│  runway strip           │ (live-swaps)  │
└───────────────────────────┘           │ +runway  │                        │               │
                                         └──────────┴────────────────────────┴───────────────┘
```

**Ambition-ladder placement:** the frame reaches **great** (Notion Calendar /
Fantastical / Motion-grade view-switching + live detail spine); the runway
mechanism reaches **category-defining**.

## 2. Job, roles, cardinality

**Job-to-be-done:** *"Let me see my upcoming schedule, act on any single day's
work in the fewest inputs, and know at a glance whether I'm financially covered
between now and my next booked job."*

**Roles (not one generic user):**
- **Owner** — cares about the runway, booked value, overdue AR, the whole week.
- **Field tech / crew** — cares about *today's* day-detail: where, when, what to
  prep, what's blocking. (Their view is the day spine; phase-2 offline mode
  serves them specifically.)

**Cardinality profile (drives every pattern choice):**
| Region | `n` faced | Pattern |
|---|---|---|
| Center canvas (day → events) | **varies** (solo cart: 1/day; caterer peak: many) | **must scale**: Month shows density dots; Day/Agenda degrade cards→list as `n` grows |
| Day-spine → events on that day | n:few (usually 1–3) | rich `RelatedRecordCard`s |
| Day-spine → related job/proposal/invoice per event | n:few | inline cards, "view all" overflow |
| Left rail → kind filters | n:few (7 kinds) | toggle chips |
| Runway → upcoming booked jobs | n:few–n:many | compact list, worst-first |

## 3. The category-defining mechanism (named up front)

**Cash-flow runway to your next booked job.** No horizontal calendar answers
"between today and my next booked event, what's owed to me, and does it land in
time to cover the costs of getting there?" This ties the *schedule* to *cash* —
native to a booked-job business, impossible in Google/Notion Calendar.

**Verified buildable now, no migration** (adversarially checked):
- Join **`Invoice.lead_id → Event`** to anchor each receivable to an event date
  — **not** `Lead.event_date` (it goes stale on reschedule; nothing writes it
  back). Bulk-fetch events, group by `lead_id` in memory (mirrors
  `calendar.ts`'s existing `leadById` pattern).
- `Event.lead_id` is **not** guaranteed 1:1, and the single-job invariant is an
  app-layer guard with a documented accepted race — so resolve defensively:
  when multiple events share a lead, pick the **nearest future `event_start`**.
- New pure lib `lib/calendar-cashflow.ts`: `buildRunway(items, events, today)` →
  ordered upcoming booked jobs, each with expected-inflow-before-that-date vs
  a cost anchor, surfaced as a runway strip in the left rail + on the day spine.

**Phase-2 category-defining roadmap** (named, with verified prerequisites — see
§9): drive-time-aware auto-placement and offline day-of-event field mode.

## 4. Architecture & data layer (verified)

### 4.1 Routing (reuse the Clients precedent — with the corrections)
Convert the monolithic `calendar/page.tsx` into a nested layout:
- `calendar/layout.tsx` — fetches the feed **once**, renders the persistent left
  rail + `{children}`. **Correction (verified):** the existing
  `assembleCalendarFeed` is *unbounded* (whole org, every kind, `force-dynamic`).
  Bound it to the visible window before moving it into the layout, or the layout
  re-pays an expensive fetch on every day-nav. **Task: add `feedInRange` bounding
  at the layout fetch.**
- `calendar/page.tsx` — default redirect to today (or the current week view).
- `calendar/[ymd]/page.tsx` — the day-detail spine. Needs its **own join
  fetcher** (there is no day-level fetcher today): resolve the day's events →
  `lead_id` → `{proposals, invoices}`, mirroring `ClientWorkingRail`'s
  `jobRows/proposalRows/invoiceRows`. Reuse `RelatedRecordCard` verbatim.
- **Correction (verified):** calendar has a documented history of `searchParams`
  (`?kinds`/`?view`/`?week`) silently dropping across navigation. **Task: audit
  every new internal link for param preservation** (extend the existing
  `weekHref()` preservation pattern to the new day route).
- Reuse the `h-full / min-h-0 / overflow-y-auto` independent-scroll shell from
  `ClientQueueRail` — the one piece that ports as-is.
- **Correction (verified):** the existing `CalendarAttentionRail` (right side)
  and a new left rail will collide on scroll model. **Task: reconcile** — fold
  the attention list into the day spine (it *is* day/horizon detail), leaving the
  left rail for mini-month + filters + KPIs + runway.

### 4.2 Views (split the monolith)
`CalendarWeekClient` currently owns view-switch + nav + KPI placement + legend +
empty states. Split into per-view components over the shared feed:
- `WeekGrid` (exists — extract), `Agenda` (exists — extract), **`MonthGrid`
  (new)**, **`DayView` (new)**. All consume `CalendarItem[]` + `lib/calendar.ts`
  / `lib/calendar-week.ts` derivations; keep `buildCalendarFeed` as the single
  feed source (`feedForDay(items, ymd)` pure filter alongside the existing
  `feedInRange`).

### 4.3 Booked-$ KPI (REFUTED source — corrected)
**Do NOT** sum `Event.payment_amount` (a per-registrant *registration fee*,
unset for client-job events) or `Event.booth_fee` (an **expense** — summing it
into revenue is a bug). **Correct source (verified):** `Lead.estimated_value`
where `stage === 'closed_won'`, bucketed by `Lead.event_date` — the exact
aggregation already in `lib/pipeline-stats.ts` (`wonValueInMonth`/`backlogByMonth`)
and `lib/leads.ts` (`bookedValue`). No new business logic; thread a `bookedValue`
field through `buildCalendarFeed`'s event/lead loop + `weekRollup`.

### 4.4 Week/Day rendering — hybrid time-grid + all-day band (VERIFIED)
The Week/Day canvas loads each day start→end as a **time grid**, so a day reads
as its real shape — not date-only chips floating in white space. But a *pure*
grid is **not trustworthy on today's data** (adversarially verified):
- `CalendarItem` is date-only; `Event.hours` (`HH:mm`) is the only time source,
  and it is **UI-unreachable for `client_job` events** — the create action
  (`actions/events.ts`) and settings page expose a time input **only** when
  `kind === 'market_day'`; lead→job conversion never sets it. `event_start`/
  `event_end` are date-only. So client jobs — the core booked-job workflow —
  carry **no hours today**.
- Only two kinds can hold a real time: `event` (reliable only for market-day
  *series*, which require hours) and **`drop`** (pickup windows carry
  `start`/`end`, but `buildCalendarFeed` currently **discards** them, collapsing
  to distinct days). The other five kinds (lead, task, follow_up, compliance,
  invoice_due) are **due-that-day**, all-day by nature.

**Design — hybrid.** Each day = a persistent **all-day band** (top) for
due-that-day items *and any event lacking hours, shown as a "time TBD" chip* +
a **time-grid body** (morning→evening) placing only items with a projected time
(events with `hours`; one item per drop window, sized by `end − start`). Never
pins a due-date to a fake hour.

**Tasks (all projection / UI — NO Firestore migration):**
1. Extend `CalendarItem` with `start?`/`end?` (`HH:mm`); project `Event.hours` in
   `buildCalendarFeed`; restructure the drop loop to emit **one item per
   `DropPickupWindow`** with its times (stop discarding them).
2. **Add an optional start/end time input to the client-job create + settings
   forms** (writes the existing `Event.hours` field). Without it the grid stays
   empty of bookings for non-market verticals — so this is **in v1**, not a
   fast-follow. Two-form UI change, no schema change.
3. Handle **multi-day events** (`event_start !== event_end`) — span or repeat.

**Reliability caveat (state honestly):** until task 2 ships, most client jobs
render in the all-day "time TBD" band; the grid is densely populated mainly for
the mobile-beverage vertical (market-day series + drops).

## 5. The three panes

### Left rail (~280px, persistent)
Mini-month (scan/jump), 7 kind-filter chips (relocate `CalendarKindFilter`), the
week KPI stack (relocate `CalendarKpiBand`: Events · Guests · Booked-$ · Due-$ ·
Blockers), and the **runway strip** (worst-first upcoming booked jobs with
inflow-before-date). KPIs move *off* the top into the rail so the canvas gets
full height. Adopt the shipped `KpiBand inset` variant.

### Center canvas (fluid — the restructured hero)
`⌘K` command bar + `[Month][Week][Day][Agenda]` `TabLinks` switcher, color-by-
kind. Exemplar parity target: **Notion Calendar** (NL "go to date"), **Motion**
(density). Month = density dots per day + count; Week/Day/Agenda degrade cards→
list as `n` grows (cardinality rule). Click any day → navigates
`/calendar/[ymd]`, spine swaps live.

### Right day-spine (~360px, live-swap, deep-linkable `/calendar/2026-08-20`)
That day's events (rich cards), prep tasks, blockers, and `RelatedRecordCard`s
for the linked job/proposal/invoice per event, plus that day's runway line. This
is the Cockpit-style live detail pane calendar has never had.

## 6. Critic-lens panel (applied)

| Lens | Applied to this spec |
|---|---|
| **JTBD / roles** | Owner (runway/week) vs field-tech (day spine) split explicitly; every element traces to one. |
| **Nielsen** | #1 status (runway/blockers visible), #3 control (collapsible panes, ⌘K), #6 recognition (day spine shows context, no recall), #8 minimalist (KPIs in rail, canvas uncluttered). |
| **Interaction cost (numeric budgets)** | Go-to-day: **1 click** (click a day) or `⌘K` + type. Act on a day's overdue invoice from the spine: **≤2 clicks**. `⌘K` results **≤7±2** (Miller). View switch: **1 key/click**. Every nav round-trips **<400ms** or optimistic (Doherty). |
| **Exemplar parity** | Notion Calendar (command bar), Fantastical (NL create — *fast-follow*, see §9), Motion (density/auto-place — phase-2). Named gap we still lack: NL single-line create → next increment, not "someday." |
| **Craft / restraint** | Color-by-kind only where it carries meaning; runway uses tabular numerals; money red reserved for overdue-actionable (Signal-palette gate). |
| **Anticipation** | Runway is computed, not asked. Day spine pre-joins related records. Phase-2: auto-suggested slots. |

## 7. Cardinality-aware rendering (explicit)
- **Empty (n=0):** every region renders a specific next action (no blank pane —
  hard gate). Empty day → "Nothing scheduled — [Book a job]". Empty runway →
  "No booked jobs ahead — [Open pipeline]".
- **n:few:** rich `RelatedRecordCard`s (day spine, related records).
- **n:many:** Month density dots; Agenda/Day collapse to a dense list; the day
  spine's related records get "view all N →" overflow.

## 8. Hard gates (block merge)
- **WCAG 2.2 AA**: 4.5:1 body / 3:1 UI; re-verify every status/KPI color on the
  Signal palette. Day-cell click targets ≥24×24px (≥44 for touch).
- **Dark mode** + **`prefers-reduced-motion`** on the pane-swap animation.
  *(NB: the admin shell's `bg-gray-50` still breaks dark mode app-wide — flag,
  don't inherit.)*
- **Latency**: pane swap / view switch optimistic or <400ms.
- **No blank empty states** (above). **Keyboard + `⌘K`** ships in this increment.
- **Bulk**: multi-select on the Agenda list (bulk reschedule/tag) at build time.

## 9. Scope — v1 vs phase-2 (verified feasibility)

**v1 (this spec):** the three-pane cockpit + Month/Week/Day/Agenda views with the
**hybrid time-grid + all-day band** (§4.4) + a **start/end time input on the
client-job booking form** (so the grid is populated for bookings, not just market
days) + live day-spine + Booked-$ (from `estimated_value`) + **cash-flow runway**
(category-defining). All buildable now, no Firestore migration.

**Phase-2 fast-follows — named, each gated on a verified prerequisite:**
- **Drive-time-aware placement** — *prerequisite:* zero geo exists (verified:
  `EventLocation`/`OrgBranding.address` are free text, no lat/lng, no
  geocoding dep). Even a haversine "soft warning" needs geocode-on-save first
  (Small-Med); full auto-placement needs a distance-matrix API (Large). Its own
  increment, starting with an address/geocoding data model — not calendar UI.
- **Offline day-of-event field mode** — *prerequisite:* a small **hand-written
  service worker** (Cache API, no npm) for app-shell precache + a hand-rolled
  data snapshot. Verified: `next-pwa` is **non-functional** under our Turbopack
  default; `persistentLocalCache` is heaviest (needs a `firestore.rules`
  rewrite — no `leads` rule exists today). Read-only day view first.
- **NL single-line event create** (Fantastical parity) — parser increment.
- **Full deposit-due-date scheduling** — needs a `Proposal.deposit_due_date`
  field (v1 runway works off existing `Invoice.due_date`).

## 10. Cross-validation (pattern → canon → exemplar)
| Pattern | Canon | Exemplar | Verdict |
|---|---|---|---|
| Live day-detail spine, deep-linked | Nielsen #6 recognition; master-detail | Attio/Superhuman; Clients cockpit | bedrock |
| ⌘K command bar as nav | #6 tension vs #7 efficiency | Notion Calendar, Linear | reconciled (daily operators; discoverable fallbacks stay) |
| Runway (schedule↔cash) | Tesler (system absorbs); anticipatory | *none* | **novel — category-defining** |
| Collapsible panes | #3 control, #7 flexibility | Linear | bedrock |

## 11. Testing strategy (feeds the plan)
TDD per task: pure derivations first (`buildRunway`, `feedForDay`, `bookedValue`
threading) with unit tests asserting the *verified* join semantics (multi-event
lead → nearest future event; no `payment_amount`/`booth_fee` in Booked-$);
component tests for view-switching, empty states, spine live-swap, param
preservation; browser walkthrough (authenticated) as the ISO 9241-210 gate.

## 12. Decisions (resolved 2026-08-16)
1. **Runway = receivables-timing, honestly labeled.** v1 shows *expected inflow
   before each booked job* + due-before-date; it does NOT claim a true P&L /
   cost-based runway (no per-event cost field exists — cost modeling is phase-2).
   The UI must label it as receivables timing, never imply profit.
2. **Month view = density dots + count** per day (scales to n:many), not mini
   event chips.
3. **Attention rail = folded into the day spine** (it is day/horizon detail); no
   separate week-level attention section in the left rail. The left rail holds
   mini-month + kind filters + KPIs + runway only.
