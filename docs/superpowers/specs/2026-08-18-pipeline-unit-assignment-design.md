# Pipeline Unit Assignment (resource-capacity increment 2) — Design Spec

**Status:** approved in brainstorm 2026-08-18, pending spec review.

> Second increment of the resource-capacity track, on top of Inc 1 (PR #117). Inc 1 made the radar capacity-aware by *type* (N carts / N rooms). This adds **optional per-unit assignment** (pin a booking to *Kart 2* / *Room A*) and **unit-level clash detection** (the same unit double-booked on a date) — a mistake the type-level count can't see.

## Goal

Let a business-tier operator *optionally* pin a booking to a specific serving unit and room, with a picker that shows which units are free/taken on that date, and flag when one unit is booked for two events on the same day — even when the day is under total capacity.

## Architecture (2–3 sentences)

Purely additive over Inc 1. A lead gains an optional `assigned_units` ({mobile?, venue?} unit ids); the pure engine (`lib/capacity/capacity.ts`) gains a **unit-clash** pass alongside the existing type-level `over`; the opportunity-detail page gains an assignment control (annotated free/taken/blocked from the same-date bookings), and the pipeline row gains a read-only clash badge. Unassigned leads and non-business/unit-less orgs are byte-for-byte unchanged.

## Tech Stack

Next.js 16 App Router (RSC + server actions), Firestore admin SDK, React 19, vitest. All clash math is pure and in-memory (leads already loaded on the pipeline; the opportunity page adds one targeted same-date read).

## Global Constraints

- **Additive & migration-free.** `assigned_units` is optional. Unassigned leads behave exactly as Inc 1. A clash is a *new, distinct* signal — it never changes the existing type-level `over` computation.
- **Never force assignment.** Every picker has an "Unassigned" state and defaults to it. An event six months out stays unassigned with zero friction.
- **Tier gate unchanged:** assignment UI + clash detection only for `hasMultiResourceCapacity(org)` **and** ≥1 configured unit. Base/solo path is untouched.
- **Kind rules from Inc 1 hold:** every bookable lead consumes a mobile unit; only `delivery_mode === 'onsite'` leads consume a venue. A venue assignment on an offsite lead is **ignored** (not counted, not clashed).
- `next build` passes; pure logic unit-tested with real assertions.

## Data model

### Changed: `Lead` gains an optional assignment

```ts
// interface Lead (lib/types.ts) — after delivery_mode
assigned_units?: {
  mobile?: string   // CapacityUnit id (kind 'mobile'); undefined = unassigned
  venue?: string    // CapacityUnit id (kind 'venue'); only meaningful when delivery_mode === 'onsite'
}
```

Optional; the whole object and each field are independently absent when unassigned. `updateLead` merges by reading the current lead (the optimistic control already holds it), writing the merged `assigned_units` so setting a cart never clobbers a room.

Stale-reference tolerance: an `assigned_units.mobile` pointing at a since-deleted or retired unit is treated as **unassigned** by the engine and shown as "Unassigned" by the picker — no crash, no phantom clash.

## Engine: unit-clash pass

Extend `CapacityDay` (`lib/capacity/capacity.ts`) — additive field:

```ts
export interface UnitClash { unitId: string; unitName: string; kind: CapacityUnitKind; count: number }

export interface CapacityDay {
  date: string
  over: boolean                 // UNCHANGED — type-level totals
  detail: CapacityShort[]       // UNCHANGED
  clashes: UnitClash[]          // NEW — units assigned to ≥2 bookable leads that CONSUME that kind, on this date
}
```

Clash rule, per date, over bookable leads (`OPEN_STAGES ∪ closed_won`, `event_date === date`):
- A lead "consumes" its `assigned_units.mobile` always; it consumes `assigned_units.venue` only when `delivery_mode === 'onsite'`.
- Count consuming assignments per unit id (ignoring ids that don't resolve to a live unit of the right kind).
- Any unit with `count ≥ 2` is a clash; `unitName` resolved from `units`.

`over` is **not** OR-ed with clash presence — they are orthogonal signals (a day can be over, clashing, both, or neither).

## Data flow

- **Pipeline** (`app/(admin)/[orgSlug]/leads/page.tsx`): `computeCapacity` already runs over all loaded leads; it now also returns `clashes` per date. **Zero new queries.** `PipelineRow` gains nothing new structurally — the row reads `overCapacity` (the `CapacityDay`) it already carries (present for every dated bookable lead in capacity mode, even when `over` is false) and checks whether *its own* assigned unit id appears in `overCapacity.clashes`.
- **Sort / `conflict` flag** (`buildPipelineRows`): the existing boolean `conflict` becomes `overCapacity.over` **OR** *this row owns a clashing unit* — so a double-booked-but-under-capacity row floats up like an over-capacity one instead of being buried. `conflict` stays a clean boolean, so the `(conflict, bookByDate, lastTouch)` comparator stays transitive (the #114 lesson). A row can therefore be `conflict:true` via clash alone, with `over:false`.
- **Opportunity detail** (`app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`): when business-tier + has-units, load `listCapacityUnitsCore(orgId)` and the **same-date bookable leads** (a targeted `where('event_date','==',lead.event_date)` read, not the whole pipeline) to build a per-unit annotation map `{ unitId → { takenBy?: string /* other lead title */, blocked?: boolean } }`, passed to the assignment control.

## UI

*(design-ambition pass at build time; this fixes scope.)*

### Assignment control (opportunity detail, beside `DeliveryModeControl`)

- A **cart** picker (all `mobile` units) always; a **room** picker (`venue` units) only when `delivery_mode === 'onsite'`. Each defaults to **Unassigned**.
- Each option annotated for the lead's `event_date`: `Kart 2 (free)`, `Room A (taken by "Benoit baby shower")`, `Kart 3 (blocked)`. A blocked or taken unit stays selectable but wears its warning — informing, not forcing (the system *auto-picking* a free unit is Inc 4).
- Optimistic `updateLead({ assigned_units: merged })` with rollback, mirroring `DeliveryModeControl`. Hidden entirely when the lead has no `event_date` (nothing to assign against) or the org isn't business-tier-with-units.

### Clash badge (pipeline row, read-only)

- On a row whose own assigned unit is in `overCapacity.clashes`, render an alert `StatusPill`: `Kart 1 double-booked — <shortDate(date)>`. Reuses the #115 `max-w-full whitespace-normal` wrap. In the rare case a row owns *two* clashing units (its cart and its room both double-booked), name both: `Kart 1 & Room A double-booked — <date>`.
- Independent of the over-capacity pill: a row may show both (day over AND its unit clashed), the clash badge, the over pill, or neither. Base orgs show neither (Inc 1 "Date conflict" only).

## Edge cases & error handling

- **Blocked-date assignment:** allowed but annotated `(blocked)`; the engine still counts it for clash (a unit booked twice on a day it's also blocked is doubly wrong, and both signals show). No hard block (that's Inc 4).
- **delivery_mode flips to offsite** while a venue is assigned: the venue assignment is retained in data but **ignored** by the engine (venue only counts for on-site) and the room picker hides. No auto-clear (avoids destroying a choice on a toggle mistake).
- **Stale unit id** (deleted/retired unit): engine ignores it; picker shows Unassigned. Retired (`active:false`) units are excluded from pickers and from clash counting via the same `unitAvailableOn`/live-unit resolution.
- **No `event_date`:** no assignment, no clash (can't share a date) — matches Inc 1's no-date handling.

## Testing

- **`lib/capacity/capacity.test.ts`:** clash when a mobile unit is assigned to 2 bookable leads on a date; NO clash when they're on distinct units (even at full/over capacity); a venue assignment on an offsite lead is ignored (no venue clash); a stale/retired unit id never clashes; `over` is unchanged by any assignment (regression pin); clash + not-over can co-occur (2 leads, 3 carts, both Kart 1).
- **Assignment annotation helper (pure):** given the lead's date, units, and same-date leads → `{unitId → {takenBy?, blocked?}}` — taken excludes the lead itself; blocked reflects a block-out on that date.
- **Component tests:** the cart/room pickers render Unassigned + annotated options, persist via `updateLead` with a *merged* `assigned_units`, and the room picker hides when offsite; the pipeline clash badge renders only when the row's own unit clashes and keeps the base "Date conflict" path intact.
- **Walkthrough:** on the seeded business demo, assign two Sep-27 leads to the same cart → both rows show "Kart X double-booked — Sep 27"; reassign one to a free cart → badge clears. Desktop/tablet/mobile.

## Rollout / migration

**None.** `assigned_units` optional; `clashes` additive; base/solo + unassigned unchanged. Ships dark until an operator assigns a unit.

## Scope boundaries

**In (Inc 2):** optional `assigned_units` on leads; the engine clash pass; the annotated assignment control on opportunity detail; the read-only clash badge on the pipeline; tier gate + backstop.

**Out (later):**
- **Inc 3 — capacity view + serviceable-ceiling forecast:** per-unit schedule lanes; "you can still take 2 offsite + 1 on-site in September."
- **Inc 4 — polish:** auto-suggested/auto assignment, drag-to-assign, server-side hard block (reject a clashing/over won-move), per-event-type resource profiles, recurring availability.

## Self-review notes (resolved)

- Assignment lives on opportunity detail; pipeline shows a **read-only** clash badge (approved fork). Quick-assign-on-pipeline is deferred, not built.
- Clash is orthogonal to `over` — never folded into it.
- `assigned_units` nested (not two flat fields) with merge-on-write to avoid cart/room clobber.
