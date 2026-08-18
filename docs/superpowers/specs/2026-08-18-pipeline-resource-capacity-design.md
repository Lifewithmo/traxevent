# Pipeline Resource Capacity (increment 1 · "the fix") — Design Spec

> The first increment of the resource-capacity track, building on the already-shipped Book-By Radar (PRs #114/#115). Increment numbering below is for this track: Inc 1 = this, Inc 2 = assignment, Inc 3 = forecast, Inc 4 = polish.

**Status:** approved in brainstorm 2026-08-18, pending spec review.

## Goal

Make the pipeline's same-day conflict radar **capacity-aware by resource type** instead of assuming a solo operator (capacity = 1). A business with 3 carts is *not* double-booked when it has 3 events on one Saturday; a business with 2 rooms *is* over capacity with a 3rd on-site event that day. This is gated to the **business** tier — modeling more than one resource is a paid upgrade.

## Architecture (2–3 sentences)

One **additive** schema, tier-gated (brainstorm "Approach A"): a premium org optionally defines a named inventory of bookable **capacity units** (carts, rooms), each with an availability (active + block-out dates); every lead optionally carries a **delivery mode** (offsite / on-site) that determines what it consumes. The existing in-memory radar (`lib/pipeline-view.ts`, shipped as PRs #114/#115) gains a resource-aware **capacity check** that replaces the `≥2-on-a-date = conflict` rule for orgs that have configured units; **orgs with no units fall back to exactly today's behavior**, so base/solo tenants are untouched and no migration is required.

## Tech Stack

Next.js 16 App Router (RSC + server actions), Firestore admin SDK, React 19, vitest. All capacity math is pure and in-memory — the leads list is already fully loaded; capacity units are one small per-org read.

## Global Constraints

- **Additive & migration-free.** All new fields are optional. A base/solo org (`plan !== 'business'`, or no units configured) must render **identical** radar behavior to what ships today: conflict = ≥2 bookable leads on a date (capacity 1). This is the non-negotiable backstop.
- **Never force assignment or data entry.** `delivery_mode` is optional (defaults to offsite); capacity units are optional. An event six months out with unknown details must not be blocked or nagged. Increment 2 has **no per-unit assignment** at all — that is increment 3.
- **Tier gate:** multi-resource capacity is `org.plan === 'business'`. Centralize the check in one helper `hasMultiResourceCapacity(org)`; do not scatter `plan === 'business'` across call sites.
- **Name collision:** the ops materials system already owns `orgs/{orgId}/resources` (`lib/ops/resources.ts`). Capacity units MUST use a different collection — this spec uses `orgs/{orgId}/capacity_units`.
- **Zero new per-lead queries.** The leads list (`app/(admin)/[orgSlug]/leads/page.tsx`) already loads every open + won lead. Capacity units are one `listCapacityUnits(orgId)` read threaded into `buildPipelineRows`.
- `next build` passes; pure logic unit-tested with real assertions.

## Context: what increment 1 shipped, and why this is needed

Increment 1 (PRs #114/#115) ranks the pipeline by the **book-by deadline** (`event_date − org.prep_lead_days`, default 14) and flags **same-day conflicts** — two bookable leads (`OPEN_STAGES ∪ closed_won`) on one `event_date`. `conflictEventDates(leads)` returns dates carried by ≥2 bookable leads; `buildPipelineRows` sorts conflict-first and paints a "Date conflict" badge. That rule bakes in **capacity = 1**: correct for a solo operator, wrong the moment the business runs 2+ carts or hosts in multiple rooms. This increment replaces the fixed `≥2` with a real, per-org, per-type denominator.

## Data model

### New: capacity units (`orgs/{orgId}/capacity_units`)

```ts
export type CapacityUnitKind = 'mobile' | 'venue'
// 'mobile' = a deployable serving unit that goes to the job (a coffee cart, truck, photographer kit).
// 'venue'  = a fixed on-site space the operator hosts events in (a room).
// Neutral names so the model generalizes past coffee carts; the org NAMES each unit ("Kart 1", "Room #1").

export interface CapacityBlockout {
  start: string          // ISO ymd, inclusive
  end: string            // ISO ymd, inclusive
  note?: string          // "maintenance", "held for private event"
}

export interface CapacityUnit {
  id: string
  name: string           // operator-chosen label: "Kart 1", "Room #1"
  kind: CapacityUnitKind
  active: boolean         // false = retired; excluded from all supply
  blockouts: CapacityBlockout[]
  created_at: string
  updated_at?: string
}
```

CRUD lives in `lib/capacity/units.ts` (guard-free `*Core` fns + `capacityUnitsRef(orgId)`), mirroring the shape of `lib/ops/resources.ts`, with thin server actions in `actions/capacity.ts` that assert org membership. **Empty for base/solo orgs.**

### Changed: `Lead` gains a delivery mode

```ts
// in interface Lead (lib/types.ts:465)
delivery_mode?: 'offsite' | 'onsite'   // demand signal; optional, defaults to offsite (needs a mobile unit, no venue)
```

Lives on the lead (not the event) because the radar reads leads, exactly where `event_date` lives. Unset ⇒ treated as `offsite`.

### Tier gate (no new field)

`Org.plan?: BillingPlan` already exists (`'standard' | 'business'`). Multi-resource capacity is `plan === 'business'`, wrapped in `hasMultiResourceCapacity(org: Pick<Org,'plan'>): boolean` in `lib/capacity/units.ts`. (Which retail price tier `business` maps to — $59 vs $99 — is a pricing config, out of scope for the build.)

## Availability model

Chosen granularity (brainstorm): **retire + block-out dates** (no recurring weekly patterns — deferred).

`supply(kind, date)` = count of capacity units where `kind` matches, `active === true`, and `date` falls in **none** of the unit's `blockouts` (inclusive range test on ISO ymd strings). Deferred to a later increment: recurring weekly availability (e.g. "Room #2 weekends only").

## Capacity engine

New pure module `lib/capacity/capacity.ts`:

```ts
export interface CapacityDay {
  date: string
  over: boolean                 // demand exceeds supply for at least one kind
  detail: Array<{ kind: CapacityUnitKind; demand: number; supply: number }>
}

// Pure. leads already loaded; units is the per-org inventory.
export function computeCapacity(
  leads: Lead[], units: CapacityUnit[], dates: string[]
): Map<string, CapacityDay>
```

**Demand rule (this increment, BrewTrax-shaped):**
- `demand('mobile', d)` = count of bookable leads (`OPEN_STAGES ∪ closed_won`) with `event_date === d` — **every** job needs a serving unit.
- `demand('venue', d)` = count of those that are `delivery_mode === 'onsite'`.

**Over capacity on `d`** ⇔ `demand('mobile', d) > supply('mobile', d)` **or** `demand('venue', d) > supply('venue', d)`.

**Fallback (the backstop):** if `!hasMultiResourceCapacity(org)` **or** the org has zero capacity units, the radar uses increment 1's `conflictEventDates` unchanged (conflict = ≥2 bookable on a date). The capacity engine is only consulted for a business-tier org that has configured units.

### Wiring into the existing radar

- `app/(admin)/[orgSlug]/leads/page.tsx`: read `listCapacityUnits(orgId)` (only when `hasMultiResourceCapacity(org)`); build `Map<date, CapacityDay>` in-memory; thread into `buildPipelineRows` alongside the existing conflict set.
- `lib/pipeline-view.ts`: `PipelineRow` gains `overCapacity?: CapacityDay`. When capacity mode is active, a row's `conflict` flag is derived from `overCapacity?.over` for its `event_date` (instead of `conflictEventDates`); the conflict-first sort and everything downstream keep working unchanged. When capacity mode is off, behavior is byte-for-byte increment 1.

## UI surfaces

*(These screens get the `design-ambition` pass at build time; this section fixes scope, not visual craft.)*

1. **Settings → "Resources & capacity"** — new section in `app/(admin)/[orgSlug]/settings/page.tsx`, beside `prep_lead_days`. List units grouped by kind; add / rename / retire; per-unit block-out date ranges (a simple date-range list with an optional note). **Gated:** shown only for `plan === 'business'`; base tier sees a locked/upsell affordance.
2. **Booking delivery mode** — a small optional **offsite / on-site** toggle on `NewOpportunityForm.tsx` and `OpportunityDetailClient.tsx`. Only rendered for business-tier orgs that have ≥1 venue (nothing to choose otherwise). Default offsite.
3. **Radar copy** — for a business-tier org, the badge reads capacity, e.g. **"Over capacity — 3 events · 2 carts (Sat Sep 5)"**; base orgs keep the increment-1 **"Date conflict — <date>"** copy unchanged (decided: base copy is not revisited).

## Edge cases & error handling

- **On-site demand with zero venues:** a business-tier org that marks a lead `onsite` but has no `venue` units → `demand('venue') > 0 = supply(0)` → flagged over capacity. This is a *correct* signal ("you said on-site but have no room"), but could surprise; the on-site toggle is therefore hidden unless the org has ≥1 venue (see UI #2). Genuinely mixed rooms-only/photographer businesses (no mobile units, or per-event-type resource needs) are **explicitly out of scope** — deferred to the increment-4 per-event-type resource profiles.
- **Leads with no `event_date`:** excluded from all demand (can't occupy a day) — same as increment 1's no-date tail.
- **Retired unit mid-season:** `active: false` drops it from supply immediately; historical bookings are unaffected (we compute against today's inventory, matching the advisory nature of the radar).
- **Block-out overlaps / bad ranges:** validate `start <= end` on write; overlapping block-outs are harmless (union semantics via "date in ANY block-out").

## Testing

- **`lib/capacity/capacity.test.ts`** (pure): supply respects `active` + block-out ranges (inclusive, boundary dates); mobile demand = all bookable, venue demand = on-site only; over-capacity true only when a kind's demand exceeds supply; no-date leads ignored; a business org with zero units falls back (engine returns empty / not consulted); a `standard`-plan org never enters capacity mode.
- **`lib/capacity/units.test.ts`**: block-out range validation; `hasMultiResourceCapacity` gate.
- **`lib/pipeline-view.test.ts`**: with capacity mode ON, `overCapacity` drives `conflict`; with capacity mode OFF, output is identical to increment 1 (regression pin).
- **Walkthrough:** seed a business-tier demo org with 3 carts + 2 rooms + one block-out; verify (a) 3 events on a Saturday is NOT flagged, (b) a 4th is, (c) a 3rd on-site is flagged even with a free cart, (d) a block-out lowers the ceiling, and (e) a `standard`-plan org still shows increment-1 behavior. Mobile + tablet + desktop.

## Rollout / migration

**None.** All fields optional; base orgs unaffected; the gate defaults closed (`plan` unset ⇒ standard ⇒ fallback). Ship dark: the feature is invisible until a business-tier org opens Settings and defines a unit.

## Scope boundaries

**In (this increment · Inc 1):** capacity-unit inventory + availability (retire + block-outs) in settings; `delivery_mode` on leads; type-level capacity engine + radar integration; the tier gate; the fallback backstop.

**Out (later increments):**
- **Inc 2 — optional per-unit assignment:** pin a booking to a *specific* named unit (Kart 2, Room #1), unit-level clash detection ("Room #1 double-booked"). Still never forced.
- **Inc 3 — capacity view + serviceable-ceiling forecast:** per-unit schedule lanes; "you can still take 2 offsite + 1 on-site in September."
- **Inc 4 — polish:** per-event-type resource profiles (relaxes the fixed mobile+venue demand rule; handles rooms-only/photographer), recurring weekly availability, auto-suggested assignment, server-side hard block.

## Self-review notes (resolved)

- Base-tier radar copy: **unchanged** ("Date conflict — <date>"), per approval.
- Collection name: `capacity_units` (not `resources` — collision with ops materials).
- Tier field: reuse `Org.plan === 'business'`; no new billing field.
- Assignment: **not** in this increment (that's the whole point of "type-level first").
