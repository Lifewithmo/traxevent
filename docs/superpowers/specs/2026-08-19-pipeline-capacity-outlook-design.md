# Pipeline Capacity Outlook (resource-capacity increment 3) — Design Spec

**Status:** approved in brainstorm 2026-08-19, pending spec review.

> Third increment of the resource-capacity track (on #117 Inc 1 + #119 Inc 2). Adds the hero planning surface: a **serviceable-days calendar** (which days the business is open), a **peak-date headroom forecast** ("you can still take ~$18k of October"), and a **per-unit schedule view** (each cart/room a lane). All three in one increment.

## Goal

Show a business-tier operator, over the months ahead, how much serviceable capacity is still open — counted only over the days they actually work — and let them see per-unit what's booked where.

## Architecture (2–3 sentences)

Additive over Inc 1/2. One new org scalar (`serviceable_days`: a weekly pattern + closure ranges) defines which days count. Two pure engines — a **forecast** (per-month cart/room ceiling vs booked vs open + `$` headroom, over serviceable days) and a **schedule** (per-unit bookings + availability per date, from Inc-2 `assigned_units`) — feed a new **Capacity Outlook** tab in the pipeline sub-nav; the serviceable-days editor extends the existing Settings → Resources & capacity page. Non-business/unit-less orgs never see any of it.

## Tech Stack

Next.js 16 App Router (RSC + server actions), Firestore admin SDK, React 19, vitest. All math is pure/in-memory over the leads + units already loaded; the outlook page adds one `listCapacityUnitsCore` read.

## Global Constraints

- **Additive & migration-free.** `serviceable_days` optional (absent ⇒ all 7 weekdays, no closures). Nothing existing changes; the whole surface is gated behind `hasMultiResourceCapacity(org)` AND ≥1 configured unit.
- **Reuse Inc-1 shapes.** Closure ranges reuse `CapacityBlockout { start, end, note? }`. Per-unit availability reuses `unitAvailableOn` / `supply` from `lib/capacity/capacity.ts`. The gate is `hasMultiResourceCapacity`.
- **Serviceable = the operator's real working days**, not a fixed weekly rule: a weekly pattern the operator sets PLUS date/range closures (holidays, off-season), across the whole year.
- **Never invent demand.** The forecast reports the ceiling and what's booked; it never fabricates leads. `$` headroom is an estimate labelled as such.
- **Bookable stages** = `OPEN_STAGES ∪ {'closed_won'}`. `next build` passes; pure logic unit-tested with real assertions.

## Data model

### New: `Org.serviceable_days`

```ts
// interface Org (lib/types.ts)
serviceable_days?: {
  weekdays?: number[]            // 0=Sun … 6=Sat the business serves; absent ⇒ all 7
  closures?: CapacityBlockout[]  // closed date ranges: holidays, off-season, one-offs (reuses the Inc-1 shape)
}
```

A date is **serviceable** when its weekday ∈ `weekdays` (or `weekdays` absent) AND it falls in none of `closures`.

## Engines (pure, `lib/capacity/`)

### `serviceable.ts`

```ts
export function weekdayOf(ymd: string): number   // 0..6, UTC-safe (parse ymd parts, not new Date(str))
export function isServiceable(ymd: string, cfg: Org['serviceable_days']): boolean
export function serviceableDatesInMonth(ym: string, fromYmd: string, cfg): string[]  // days in `ym` that are >= fromYmd and serviceable
```

### `forecast.ts`

```ts
export interface CapacitySlot { ceiling: number; booked: number; open: number }
export interface CapacityMonth {
  ym: string; label: string        // '2026-09', 'Sep'
  cart: CapacitySlot               // slots = Σ serviceable days of available carts
  room: CapacitySlot               // Σ serviceable days of available rooms (on-site only for `booked`)
  headroomValue: number            // openCartSlots × avgEventValue (0 when no value signal)
  serviceableDays: number          // count, for context ("over 13 working days")
}
export function forecastByMonth(leads, units, org, today: string, months = 3): CapacityMonth[]
```
Window = the **current** month (partial — only days ≥ today) plus the next `months − 1` months. Per month, over its serviceable dates ≥ today:
- `cart.ceiling = Σ supply('mobile', d)`; `cart.booked = Σ min(bookableCount(d), supply('mobile', d))`; `cart.open = ceiling − booked`.
- `room.ceiling = Σ supply('venue', d)`; `room.booked = Σ min(onsiteBookableCount(d), supply('venue', d))`; `room.open`.
- `avgEventValue` = mean `estimated_value` of bookable leads that have one (across all loaded leads); if none, `headroomValue = 0` and the UI shows slots only.

### `schedule.ts`

```ts
export interface ScheduleCell { date: string; leadId?: string; leadTitle?: string; serviceable: boolean; unitAvailable: boolean }
export interface ScheduleLane { unitId: string | 'unassigned'; unitName: string; kind: CapacityUnitKind | 'unassigned'; cells: ScheduleCell[] }
export function buildSchedule(leads, units, org, today: string, days = 84): ScheduleLane[]
```
- One lane per unit (mobile then venue), plus a trailing **`unassigned`** lane for bookable leads with an `event_date` in-window but no matching `assigned_units` id.
- A unit lane's cell for date `d` is **booked** by a bookable lead whose `assigned_units[kind] === unit.id` and `event_date === d`; `serviceable = isServiceable(d)`; `unitAvailable = unitAvailableOn(unit, d)`.
- Window: `today` .. `today + days` (default 84 ≈ 12 weeks).

## UI

*(design-ambition + dataviz pass at build time; this fixes scope, not the exact chart form.)*

### 1. Serviceable-days editor — Settings → Resources & capacity (extend `CapacityUnitsClient` host page)

A new "When you're open" section above/below the unit inventory: **weekday toggles** (Sun–Sat, all on by default) + a **closures** list (add/remove `{start, end, note?}` date-range chips — same control idiom as the per-unit block-outs). Optimistic save via a new `updateServiceableDays` action.

### 2. Capacity Outlook — new pipeline tab (`PipelineSubNav` gains `'capacity'` → route `app/(admin)/[orgSlug]/leads/capacity/page.tsx`)

- **Forecast (top):** one row per month (default 3), each reading e.g. **"September — 4 of 27 cart-slots open · 2 of 6 rooms open · ~$9k headroom · over 13 working days."** Booked-vs-ceiling is shown (not a bare "open"), so the ratio gives honest context. Carts and rooms both. This is the hero planning number.
- **Schedule (below):** the per-unit lanes — units down the side, dates across, bookings as blocks; non-serviceable/blocked cells muted; the `unassigned` lane surfaces bookings still needing a unit (links to the opportunity to assign). Column strategy (day grid w/ horizontal scroll vs week grouping vs serviceable-days-only) is the **dataviz/design-ambition** decision at build; the data supports any.
- The tab renders only for `hasMultiResourceCapacity(org)` with ≥1 unit; otherwise the tab is hidden (base/solo never see it).

## Edge cases & error handling

- **`serviceable_days` absent:** all 7 weekdays, no closures — every day serviceable. The forecast still works (large ceiling); the operator narrows it by setting their pattern.
- **Booking on a non-serviceable day** (a one-off gig on a normally-closed day): out of the forecast's frame (ceiling is over serviceable days) but STILL appears on the schedule (its cell renders with `serviceable:false`) so it isn't hidden. Documented, not a defect.
- **No value signal** (no lead has `estimated_value`): `headroomValue = 0`; UI shows open slots without a `$`.
- **Unassigned in-window bookings:** the schedule's `unassigned` lane makes them visible instead of silently missing from every unit lane.
- **Weekday `weekdays: []`** (operator unchecks all): treated as "no serviceable days" → zero ceiling; the forecast shows nothing bookable and the editor warns "you've marked every day closed."

## Testing

- **`serviceable.test.ts`:** `weekdayOf` (UTC-safe, boundary dates); `isServiceable` respects the weekday set AND closures (inclusive); absent config ⇒ all days serviceable; `weekdays: []` ⇒ none.
- **`forecast.test.ts`:** ceiling counts available carts over serviceable days only (a closure/blocked unit lowers it); `booked = min(events, supply)` never exceeds ceiling; a day at capacity contributes 0 open; venue booked counts on-site only; `headroomValue = openCarts × avg`; no-value ⇒ 0; `months` window length.
- **`schedule.test.ts`:** a lead assigned to a unit on a date marks that unit's cell booked; an unassigned in-window dated lead lands in the `unassigned` lane; non-serviceable and unit-blocked cells flag correctly; window bounds respected.
- **Component tests:** the forecast rows render booked/ceiling/open + `$`; the serviceable editor toggles weekdays + adds/removes closures via the action; the schedule lanes render units + the unassigned lane + muted cells; the Capacity tab is hidden for a non-business/unit-less org.
- **Walkthrough:** on the seeded business demo, set a weekly pattern + a holiday closure; confirm the forecast headroom drops accordingly, and the schedule shows Kart 1's Sep-5 booking + the unassigned lane. Desktop/tablet/mobile.

## Rollout / migration

**None.** All fields optional; the whole surface gated + hidden until a business org configures units. Ships dark.

## Scope boundaries

**In (Inc 3):** serviceable-days calendar (weekly + closures) in settings; the per-month headroom forecast; the per-unit schedule view; the new Capacity tab; tier gate.

**Out (Inc 4 — the final increment):** auto-suggested/auto assignment, drag-to-assign ON the schedule (Inc 3 schedule is read-only), server-side hard block on over-capacity/clash won-moves, per-event-type resource profiles (relaxes the fixed cart+room rule), per-org `daily_event_capacity > per-unit` abstractions.

## Self-review notes (resolved)

- Serviceable days = operator-set weekly pattern + full-year closures (holidays), org-level — NOT a hardcoded weekend rule (per brainstorm).
- All three pieces in one increment (per brainstorm) — decomposed into bounded plan tasks (engines before UI).
- Schedule view is **read-only** in Inc 3; drag-to-assign is Inc 4.
- `$` headroom is an estimate (open cart-slots × avg value), labelled `~`, and degrades to slots-only with no value signal.
