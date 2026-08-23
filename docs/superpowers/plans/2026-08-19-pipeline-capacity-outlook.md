# Pipeline Capacity Outlook (increment 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`. Read `AGENTS.md` — modified Next.js; read `node_modules/next/dist/docs/` before framework code.

**Goal:** A business-tier operator sees, over the months ahead, how much serviceable capacity is still open (counted only over the days they actually work) and a per-unit schedule of what's booked where — plus operator-labeled resource kinds so nothing is siloed on "carts".

**Architecture:** Additive over Inc 1/2. New org config (`serviceable_days`, `resource_labels`); pure engines (`labels`, `serviceable`, `forecast`, `schedule`); a new **Capacity Outlook** pipeline tab; serviceable-days + resource-labels editors on the existing Resources & capacity settings; and a retrofit of the Inc-1/2 pill copy onto `kindLabel`. Gated to business + ≥1 unit; base/solo never see it.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Firestore admin SDK, React 19, vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-pipeline-capacity-outlook-design.md` (read it).

## Global Constraints

- **Additive & migration-free.** `serviceable_days` / `resource_labels` optional; absent ⇒ all 7 weekdays + neutral labels. Whole surface gated behind `hasMultiResourceCapacity(org)` AND ≥1 unit. Base/solo unchanged.
- **Reuse Inc-1 shapes:** closures reuse `CapacityBlockout`; per-unit availability reuses `unitAvailableOn`/`supply` from `lib/capacity/capacity.ts`; gate is `hasMultiResourceCapacity`.
- **No literal `'cart'`/`'room'` in copy** — every kind noun routes through `kindLabel(org, kind, count)`.
- **UTC-safe dates:** parse ymd string parts, never `new Date(ymd)` (timezone drift). Bookable = `OPEN_STAGES ∪ {'closed_won'}`.
- **Org-scalar persistence** (T3): mirror how an existing org field is written (e.g. `prep_lead_days` / `ai_voice_note` — find its update action). `next build` passes; pure logic unit-tested with real assertions (`npx vitest run --exclude '**/.claude/**'`).

## File Structure

- **Modify** `lib/types.ts` — `Org.serviceable_days`, `Org.resource_labels`.
- **Create** `lib/capacity/labels.ts` — `kindLabel`.
- **Create** `lib/capacity/serviceable.ts` — `weekdayOf`, `isServiceable`, `serviceableDatesInMonth`.
- **Create** `lib/capacity/forecast.ts` — `forecastByMonth` (+ `CapacityMonth`, `CapacitySlot`).
- **Create** `lib/capacity/schedule.ts` — `buildSchedule` (+ `ScheduleLane`, `ScheduleCell`).
- **Create** `actions/capacity-config.ts` — `updateServiceableDays`, `updateResourceLabels` (admin-guarded).
- **Modify** `components/admin/pipeline/PipelineListClient.tsx` + `app/(admin)/[orgSlug]/leads/page.tsx` — retrofit `overCapacityChip` + clash badge onto `kindLabel`.
- **Modify** `components/admin/settings/CapacityUnitsClient.tsx` (+ its page) — serviceable-days + resource-labels editors.
- **Modify** `components/admin/pipeline/PipelineSubNav.tsx` — add `'capacity'` tab.
- **Create** `app/(admin)/[orgSlug]/leads/capacity/page.tsx` + `components/admin/pipeline/CapacityOutlookClient.tsx` — forecast + schedule.

---

### Task 1: Types + label + serviceable engines (pure)

**Files:** Modify `lib/types.ts`; Create `lib/capacity/labels.ts`, `lib/capacity/serviceable.ts`; Test `__tests__/lib/capacity/{labels,serviceable}.test.ts`.

**Interfaces — Produces:**
```ts
// lib/types.ts on interface Org
serviceable_days?: { weekdays?: number[]; closures?: CapacityBlockout[] }
resource_labels?: { mobile?: { one: string; many: string }; venue?: { one: string; many: string } }

// lib/capacity/labels.ts
export function kindLabel(org: Pick<Org,'resource_labels'>, kind: CapacityUnitKind, count: number): string
  // count===1 → one else many; defaults mobile→serving unit(s), venue→room(s)

// lib/capacity/serviceable.ts
export function weekdayOf(ymd: string): number  // 0=Sun..6=Sat, from ymd parts (UTC-safe)
export function isServiceable(ymd: string, cfg: Org['serviceable_days']): boolean
  // weekday ∈ cfg.weekdays (or cfg/weekdays absent ⇒ all) AND ymd in NO closure (inclusive)
export function serviceableDatesInMonth(ym: string, fromYmd: string, cfg: Org['serviceable_days']): string[]
  // ascending ymd in `ym` that are >= fromYmd and isServiceable
```

**Steps:**
- [ ] Failing tests — `labels`: count 1→`one`, 2→`many`; absent `resource_labels` ⇒ 'serving unit'/'serving units', 'room'/'rooms'; override {one:'cart',many:'carts'} honored. `serviceable`: `weekdayOf('2026-09-05')===6` (Sat) and boundary months; `isServiceable` false when weekday excluded, false inside a closure (incl. start & end days), true otherwise; absent cfg ⇒ true; `weekdays:[]` ⇒ false; `serviceableDatesInMonth('2026-09','2026-09-10',cfg)` skips days <10 and non-serviceable.
- [ ] Run `npx vitest run --exclude '**/.claude/**' capacity/labels capacity/serviceable` → FAIL.
- [ ] Implement the types + both modules.
- [ ] Tests → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): serviceable-days + operator-label helpers (pure)`.

---

### Task 2: Forecast + schedule engines (pure)

**Files:** Create `lib/capacity/forecast.ts`, `lib/capacity/schedule.ts`; Test `__tests__/lib/capacity/{forecast,schedule}.test.ts`.

**Interfaces — Consumes:** `serviceableDatesInMonth`, `isServiceable` (T1); `supply`, `unitAvailableOn` from `lib/capacity/capacity.ts`; `OPEN_STAGES` from `@/lib/leads`; `addMonths` from `lib/pipeline-stats`.
**Produces:**
```ts
export interface CapacitySlot { ceiling: number; booked: number; open: number }
export interface CapacityMonth { ym: string; label: string; cart: CapacitySlot; room: CapacitySlot; headroomValue: number; serviceableDays: number }
export function forecastByMonth(leads: Lead[], units: CapacityUnit[], org: Pick<Org,'serviceable_days'>, today: string, months?: number): CapacityMonth[]  // default 3

export interface ScheduleCell { date: string; leadId?: string; leadTitle?: string; serviceable: boolean; unitAvailable: boolean }
export interface ScheduleLane { unitId: string | 'unassigned'; unitName: string; kind: CapacityUnitKind | 'unassigned'; cells: ScheduleCell[] }
export function buildSchedule(leads: Lead[], units: CapacityUnit[], org: Pick<Org,'serviceable_days'>, today: string, days?: number): ScheduleLane[]  // default 84
```
`forecastByMonth`: window = current month (days ≥ today) + next `months-1`. Per month over `serviceableDatesInMonth`: `cart.ceiling=Σ supply(units,'mobile',d)`, `cart.booked=Σ min(bookableCount(d), supply('mobile',d))`, `open=ceiling-booked`; `room` same with `venue` + on-site-only booked; `headroomValue = cart.open × avg(estimated_value of bookable leads that have one)` (0 if none); `serviceableDays = dates.length`.
`buildSchedule`: lane per unit (mobile then venue) + a trailing `unassigned` lane; window `today..today+days`; a unit cell is booked by a bookable lead with `assigned_units[unit.kind]===unit.id && event_date===d`; `serviceable=isServiceable(d)`, `unitAvailable=unitAvailableOn(unit,d)`; the `unassigned` lane holds bookable in-window dated leads whose `assigned_units` has no live matching id.

**Steps:**
- [ ] Failing tests — `forecast`: ceiling = available carts × serviceable days (a closure lowers it; a blocked unit lowers it); `booked=min(events,supply)` never exceeds ceiling; a day at capacity ⇒ 0 open there; venue booked counts on-site only; `headroomValue=openCarts×avg`, no-value ⇒ 0; correct `months` count. `schedule`: assigned lead marks its unit's cell booked; unassigned dated in-window lead → unassigned lane; non-serviceable + unit-blocked cells flagged; window bounds.
- [ ] Run → FAIL; implement; tests → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): forecast + schedule engines (pure)`.

---

### Task 3: Config actions

**Files:** Create `actions/capacity-config.ts`; Test `__tests__/actions/capacity-config.test.ts` (guard/shape where practical).

**Interfaces — Produces:**
```ts
export async function updateServiceableDays(orgId: string, cfg: NonNullable<Org['serviceable_days']>): Promise<void>
export async function updateResourceLabels(orgId: string, labels: NonNullable<Org['resource_labels']>): Promise<void>
```
Both `assertOrgAdmin(orgId)` then write the org scalar (mirror the existing org-field update — find how `prep_lead_days`/`ai_voice_note` is persisted; likely an `orgs/{orgId}` `.update()`). Validate: `weekdays` ⊂ 0..6; each closure through `assertValidBlockout` (from `lib/capacity/units.ts`); label strings non-empty.

**Steps:**
- [ ] Failing test: an unauthorized `updateServiceableDays` rejects (mirror an existing action guard test); invalid weekday / bad closure throws.
- [ ] Run → FAIL; implement (guard via `@/lib/auth/assert`); tests → PASS; **`npm run build`** (watch the `'use server'` type re-export rule — no type re-exports from this file).
- [ ] Commit: `feat(capacity): serviceable-days + resource-label config actions`.

---

### Task 4: De-silo retrofit — Inc-1/2 pills → `kindLabel`

**Files:** Modify `components/admin/pipeline/PipelineListClient.tsx` (`overCapacityChip` ~:109, the clash badge, render), `app/(admin)/[orgSlug]/leads/page.tsx` (thread `org.resource_labels`); Test `__tests__/components/admin/pipeline/PipelineListClient.test.tsx` (extend).

**Interfaces — Consumes:** `kindLabel` (T1).
**Behavior:** `overCapacityChip` takes the org labels (pass `resourceLabels` or a `labels`-bound fn) and renders `kindLabel(...)` instead of the hardcoded `'cart'`/`'room'` noun; the Inc-2 double-booked badge already names units by NAME (fine) — only aggregate kind nouns change. `page.tsx` passes `org.resource_labels` (or the derived labels) into `PipelineListClient`. Base/solo path unaffected (no over pill there).

**Steps:**
- [ ] Failing tests: with `resource_labels.mobile={one:'cart',many:'carts'}`, the over-capacity pill reads "…· 2 carts"; with a `{one:'truck',many:'trucks'}` override it reads "trucks"; with no labels it reads the neutral default "serving units"; base "Date conflict" path unchanged.
- [ ] Run → FAIL; implement threading + `kindLabel`; tests + full suite → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): route the over-capacity pill copy through kindLabel (de-silo)`.

---

### Task 5: Settings — serviceable-days + resource-labels editors (UI)

**Files:** Modify `components/admin/settings/CapacityUnitsClient.tsx` (+ its page if props needed); Test its component test.

**Interfaces — Consumes:** `updateServiceableDays`, `updateResourceLabels` (T3); `Org.serviceable_days`, `Org.resource_labels`.
**Behavior:** on the existing Resources & capacity page — a **"When you're open"** block (7 weekday toggles, all-on default; a closures list of `{start,end,note?}` date-range chips add/remove — same idiom as the per-unit block-outs) saved via `updateServiceableDays`; and an **editable category label** per kind (the "Serving units"/"Rooms" group headers become editable → `updateResourceLabels`). Optimistic + rollback (mirror the Inc-1/2 controls).

**Design direction:** run **design-ambition** first (baked block added before build).

**Steps:**
- [ ] design-ambition pass; failing component test: weekday toggles call `updateServiceableDays` with the new set; adding a closure chip persists it; editing a kind label calls `updateResourceLabels`; the "every day closed" warning shows when all weekdays are off.
- [ ] Run → FAIL; implement; tests → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): serviceable-days + resource-label settings editors`.

---

### Task 6: Capacity Outlook tab + forecast section (UI)

**Files:** Modify `components/admin/pipeline/PipelineSubNav.tsx` (add `'capacity'`); Create `app/(admin)/[orgSlug]/leads/capacity/page.tsx`, `components/admin/pipeline/CapacityOutlookClient.tsx`; Test the outlook component test.

**Interfaces — Consumes:** `forecastByMonth` (T2), `kindLabel` (T1), `hasMultiResourceCapacity`, `listCapacityUnitsCore`.
**Behavior:** the sub-nav gains a **Capacity** tab, shown ONLY for `hasMultiResourceCapacity(org)` with ≥1 unit; its route loads leads + units + org, runs `forecastByMonth`, and renders one row per month: **"‹Month› — ‹openCarts› of ‹ceilingCarts› ‹kindLabel(mobile)› open · ‹openRooms› of ‹ceilingRooms› ‹kindLabel(venue)› open · ~$‹headroom› headroom · over ‹N› working days"** (drop the `$` when `headroomValue===0`). Booked-vs-ceiling visible.

**Design direction:** run **design-ambition + dataviz** first (baked block added before build). The forecast row is a stat/meter, not prose — encode booked/open in form (a small meter) as well as number.

**Steps:**
- [ ] design-ambition/dataviz pass; failing tests: the tab is hidden for a non-business/unit-less org and present for business+units; a month row renders open/ceiling for both kinds + `$` (and omits `$` with no value); the noun comes from `kindLabel` (override reads "carts").
- [ ] Run → FAIL; implement sub-nav + route + client; tests → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): Capacity Outlook tab + peak-date headroom forecast`.

---

### Task 7: Capacity Outlook — per-unit schedule view (UI, dataviz)

**Files:** Modify `components/admin/pipeline/CapacityOutlookClient.tsx` (add the schedule below the forecast) + its page (pass `buildSchedule` output); Test extend the outlook test.

**Interfaces — Consumes:** `buildSchedule` (T2), `kindLabel` (T1).
**Behavior:** below the forecast, the **read-only** schedule — one lane per unit (grouped mobile then venue, labelled by unit NAME under a `kindLabel` group header) + a trailing **Unassigned** lane; dates across; a booked cell shows the lead title (links to the opportunity); non-serviceable and unit-blocked cells are muted/hatched. Column strategy (day grid + horizontal scroll vs week grouping vs serviceable-only) is the **dataviz** decision — must be legible desktop/tablet/mobile and horizontal-scroll-contained (never scroll the page body).

**Design direction:** run **design-ambition + dataviz** first (baked block added before build). This is the visualization-heavy surface — lane/timeline done right (Few/Tufte: the booked blocks are the ink), responsive, `overflow-x` contained.

**Steps:**
- [ ] design-ambition/dataviz pass; failing tests: a unit lane shows its booked cell (lead title) on the assigned date; the Unassigned lane lists an unassigned in-window dated lead; muted cells for non-serviceable/blocked; group headers use `kindLabel`.
- [ ] Run → FAIL; implement; tests + full suite → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): read-only per-unit schedule view`.

## Self-Review

**Spec coverage:** serviceable_days + resource_labels types (T1); kindLabel (T1) + retrofit (T4); serviceable engine (T1); forecast + schedule engines (T2); actions (T3); settings editors (T5); Capacity tab + forecast (T6); schedule view (T7); tier gate (T6 tab gate, all UI); de-silo — no literal cart/room (T4 + T6/T7 via kindLabel); edge cases — absent config, non-serviceable bookings on schedule, no-value headroom, unassigned lane, weekdays:[] warning (T1/T2 engines + T5/T6/T7 UI). ✅
**Placeholder scan:** none — signatures + concrete test cases throughout; UI tasks defer only visual craft to the design-ambition/dataviz block (added before build). ✅
**Type consistency:** `serviceable_days`, `resource_labels`, `kindLabel`, `weekdayOf`/`isServiceable`/`serviceableDatesInMonth`, `CapacityMonth`/`CapacitySlot`/`forecastByMonth`, `ScheduleLane`/`ScheduleCell`/`buildSchedule`, `updateServiceableDays`/`updateResourceLabels` named identically T1→T7. ✅
