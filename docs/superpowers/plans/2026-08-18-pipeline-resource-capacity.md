# Pipeline Resource Capacity (increment 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Read `AGENTS.md` — this is a modified Next.js; read `node_modules/next/dist/docs/` before writing framework code.

**Goal:** Make the pipeline's same-day conflict radar capacity-aware by resource type (carts/rooms) instead of assuming capacity = 1, gated to the `business` tier, with base/solo orgs falling back to today's exact behavior.

**Architecture:** One additive schema. A premium org defines named `capacity_units` (kind `mobile`/`venue`) with availability (active + block-out dates); each lead carries an optional `delivery_mode` (offsite/onsite). A pure in-memory engine computes per-date, per-kind demand vs supply and marks days over capacity; the existing `buildPipelineRows` consumes it, replacing the `≥2-on-a-date` conflict rule only for business-tier orgs that have configured units. Everyone else is byte-for-byte unchanged.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Firestore admin SDK, React 19, vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-pipeline-resource-capacity-design.md` (read it — the plan argues from it).

## Global Constraints

- **Additive & migration-free.** Every new field is optional. A base/solo org (`plan !== 'business'` or zero units) MUST render identical radar behavior to today (conflict = ≥2 bookable leads on a date). This is the non-negotiable backstop, and Task 3 pins it with a regression test.
- **Never force data entry.** `delivery_mode` optional, defaults to `offsite`. Units optional.
- **Tier gate:** `org.plan === 'business'`, via one helper `hasMultiResourceCapacity(org)`. Never scatter `plan === 'business'`.
- **Collection name is `capacity_units`** — NOT `resources` (ops materials own `orgs/{orgId}/resources`, `lib/ops/resources.ts`).
- **Zero new per-lead queries.** Leads already loaded in `app/(admin)/[orgSlug]/leads/page.tsx`. Units are one `listCapacityUnits(orgId)` read.
- **Bookable stages** = `OPEN_STAGES ∪ {'closed_won'}` (import `OPEN_STAGES` from `@/lib/leads`), matching `conflictEventDates` in `lib/pipeline-view.ts`.
- `next build` passes; pure logic unit-tested with real assertions (no tautologies). Run `npx vitest run --exclude '**/.claude/**'`.

## File Structure

- **Create** `lib/capacity/units.ts` — Firestore CRUD for capacity units + `hasMultiResourceCapacity` gate + pure block-out validation.
- **Create** `lib/capacity/capacity.ts` — pure engine: availability, supply, demand, `computeCapacity`.
- **Create** `actions/capacity.ts` — membership-guarded server actions wrapping the CRUD.
- **Create** `components/admin/settings/CapacityUnitsClient.tsx` — settings inventory + block-out editor UI.
- **Create** `app/(admin)/[orgSlug]/settings/capacity/page.tsx` — settings sub-page hosting the client (follow the existing settings sub-page pattern; verify by reading a sibling under `settings/`).
- **Modify** `lib/types.ts` — `CapacityUnitKind`, `CapacityBlockout`, `CapacityUnit`, `Lead.delivery_mode?`.
- **Modify** `lib/pipeline-view.ts` — `PipelineRow.overCapacity?`, `buildPipelineRows` capacity mode.
- **Modify** `app/(admin)/[orgSlug]/leads/page.tsx` — gated units read + capacity map, threaded in.
- **Modify** `components/admin/pipeline/PipelineListClient.tsx` — over-capacity badge copy.
- **Modify** `components/admin/pipeline/NewOpportunityForm.tsx` + `components/admin/OpportunityDetailClient.tsx` — delivery-mode toggle.
- **Modify** `actions/leads.ts` (`CreateLeadInput`, `LeadUpdate`, `createLead`, `updateLead`) — persist `delivery_mode`.

---

### Task 1: Capacity-unit types + data layer + gate

**Files:**
- Modify: `lib/types.ts` (add types near the ops types; add `delivery_mode?` to `interface Lead` at ~:465).
- Create: `lib/capacity/units.ts`
- Test: `__tests__/lib/capacity/units.test.ts`

**Interfaces — Produces:**
```ts
export type CapacityUnitKind = 'mobile' | 'venue'
export interface CapacityBlockout { start: string; end: string; note?: string }  // ISO ymd, inclusive
export interface CapacityUnit {
  id: string; name: string; kind: CapacityUnitKind
  active: boolean; blockouts: CapacityBlockout[]
  created_at: string; updated_at?: string
}
// on interface Lead: delivery_mode?: 'offsite' | 'onsite'
```
In `lib/capacity/units.ts` (mirror `lib/ops/resources.ts` for Firestore shape):
```ts
export function capacityUnitsRef(orgId: string)  // adminDb...collection('capacity_units')
export async function listCapacityUnitsCore(orgId: string): Promise<CapacityUnit[]>   // orderBy('name')
export async function createCapacityUnitCore(orgId: string, input: { name: string; kind: CapacityUnitKind }): Promise<CapacityUnit>
export async function updateCapacityUnitCore(orgId: string, id: string, updates: Partial<Pick<CapacityUnit,'name'|'active'|'blockouts'>>): Promise<void>
export async function deleteCapacityUnitCore(orgId: string, id: string): Promise<void>
export function assertValidBlockout(b: CapacityBlockout): void   // throws if !b.start || !b.end || b.start > b.end
export function hasMultiResourceCapacity(org: Pick<Org, 'plan'>): boolean   // org.plan === 'business'
```
Validate on create/update: non-empty `name`, `kind ∈ {'mobile','venue'}`, every blockout through `assertValidBlockout`. New units default `active: true`, `blockouts: []`.

**Steps:**
- [ ] Write failing tests in `units.test.ts`: `hasMultiResourceCapacity({plan:'business'})===true`, `({plan:'standard'})===false`, `({})===false`; `assertValidBlockout` throws on `start>end` and on missing start/end, passes on `start===end` and `start<end`.
- [ ] Run: `npx vitest run --exclude '**/.claude/**' capacity/units` → FAIL (module missing).
- [ ] Add the types to `lib/types.ts`; implement `lib/capacity/units.ts` (CRUD mirrors `lib/ops/resources.ts`; pure helpers as above).
- [ ] Run the test → PASS. Then `npm run build`.
- [ ] Commit: `feat(capacity): capacity-unit types, data layer, and business-tier gate`.

---

### Task 2: Pure capacity engine

**Files:**
- Create: `lib/capacity/capacity.ts`
- Test: `__tests__/lib/capacity/capacity.test.ts`

**Interfaces — Consumes:** `CapacityUnit`, `CapacityUnitKind` (Task 1); `Lead` (`stage`, `event_date`, `delivery_mode`); `OPEN_STAGES` from `@/lib/leads`.
**Produces:**
```ts
export interface CapacityShort { kind: CapacityUnitKind; demand: number; supply: number }
export interface CapacityDay { date: string; over: boolean; detail: CapacityShort[] }

export function unitAvailableOn(unit: CapacityUnit, date: string): boolean
  // unit.active && date is inside NO blockout (inclusive: b.start <= date <= b.end)
export function supply(units: CapacityUnit[], kind: CapacityUnitKind, date: string): number
  // count of units with matching kind that are unitAvailableOn(date)
export function computeCapacity(leads: Lead[], units: CapacityUnit[], dates: string[]): Map<string, CapacityDay>
```
`computeCapacity` per `date` in `dates`:
- bookable(date) = leads with `event_date === date` and `stage ∈ OPEN_STAGES ∪ {'closed_won'}`.
- `demand.mobile = bookable(date).length`; `demand.venue = bookable(date).filter(l => l.delivery_mode === 'onsite').length`.
- `supply.mobile = supply(units,'mobile',date)`; `supply.venue = supply(units,'venue',date)`.
- `over = demand.mobile > supply.mobile || demand.venue > supply.venue`.

**Steps:**
- [ ] Write failing tests (real assertions): `unitAvailableOn` — active no-blockout true; retired (`active:false`) false; date inside blockout false incl. boundary days (`start` and `end`), date outside true. `supply` counts only matching-kind available units. `computeCapacity`: 3 bookable + 3 mobile units → not over; 4 bookable + 3 mobile → over; 3 on-site + 2 venues → over even with mobile spare; leads with no `event_date` ignored; `closed_lost`/`closed` leads excluded from demand; a blocked-out unit lowers supply that date. Build small `Lead` fixtures (only the fields the engine reads).
- [ ] Run: `npx vitest run --exclude '**/.claude/**' capacity/capacity` → FAIL.
- [ ] Implement `lib/capacity/capacity.ts`.
- [ ] Run tests → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): pure type-level capacity engine (supply/demand/over)`.

---

### Task 3: Wire capacity into the radar (the backstop lives here)

**Files:**
- Modify: `lib/pipeline-view.ts` (`PipelineRow` ~:66, `buildPipelineRows` ~:98)
- Modify: `app/(admin)/[orgSlug]/leads/page.tsx` (~:26 org load, ~:40 conflict/build)
- Test: `__tests__/lib/pipeline-view.test.ts` (extend)

**Interfaces — Consumes:** `computeCapacity`, `CapacityDay` (Task 2); `hasMultiResourceCapacity`, `listCapacityUnitsCore` (Task 1).
**Produces:** `PipelineRow.overCapacity?: CapacityDay`. `buildPipelineRows(inputs, today, opts)` — `opts` gains `capacityByDate?: Map<string, CapacityDay>`.

Behavior: **capacity mode** = `opts.capacityByDate` provided. When ON, a row's `conflict = opts.capacityByDate.get(row.eventDate)?.over ?? false` and `overCapacity = opts.capacityByDate.get(row.eventDate)`; the existing `conflictDates` path is NOT used. When OFF (no `capacityByDate`), behavior is exactly increment 1 (`conflict` from `opts.conflictDates`). The conflict-first sort (`byBookBy`) is unchanged — it already keys off `row.conflict`.

`page.tsx`: after loading `org`/`leads`, if `hasMultiResourceCapacity(org)`:
```ts
const units = await listCapacityUnitsCore(orgId)
const dates = [...new Set(leads.filter(l => l.event_date && [...OPEN_STAGES,'closed_won'].includes(l.stage)).map(l => l.event_date!))]
const capacityByDate = computeCapacity(leads, units, dates)
// pass { prepLeadDays, capacityByDate } to buildPipelineRows
```
else keep the current `{ prepLeadDays, conflictDates }` call unchanged.

**Steps:**
- [ ] Write failing tests: (a) **capacity mode** — given a `capacityByDate` marking one date `over:true`, the row on that date has `conflict===true` and `overCapacity.over===true`, and it sorts conflict-first; a non-over date row has `conflict===false`. (b) **backstop regression** — with NO `capacityByDate` (only `conflictDates`), output is identical to increment 1 for a mixed fixture (assert the exact group ordering + `conflict` flags an increment-1 run produces). 
- [ ] Run → FAIL.
- [ ] Implement `PipelineRow.overCapacity`, the `capacityByDate` branch in `buildPipelineRows`, and the gated wiring in `page.tsx`.
- [ ] Run tests + full suite `npx vitest run --exclude '**/.claude/**'` → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): capacity-aware radar with increment-1 fallback backstop`.

---

### Task 4: Server actions + persist `delivery_mode`

**Files:**
- Create: `actions/capacity.ts`
- Modify: `actions/leads.ts` (`CreateLeadInput`, `LeadUpdate`, `createLead` ~:41, `updateLead` ~:90)
- Test: `__tests__/actions/capacity.test.ts` (guard/shape where practical; CRUD is thin over Firestore)

**Interfaces — Produces:**
```ts
// actions/capacity.ts — each asserts membership (assertOrgMember) then calls the *Core fn
export async function listCapacityUnits(orgId: string): Promise<CapacityUnit[]>
export async function createCapacityUnit(orgId: string, input: { name: string; kind: CapacityUnitKind }): Promise<CapacityUnit>
export async function updateCapacityUnit(orgId: string, id: string, updates: Partial<Pick<CapacityUnit,'name'|'active'|'blockouts'>>): Promise<void>
export async function deleteCapacityUnit(orgId: string, id: string): Promise<void>
```
`actions/leads.ts`: add `delivery_mode?: 'offsite' | 'onsite'` to `CreateLeadInput` and `LeadUpdate`; persist it in `createLead`/`updateLead` (drop `undefined`, don't write `null` — follow the file's existing optional-field handling).

**Steps:**
- [ ] Write failing test(s): a `createCapacityUnit` call with no session/membership rejects (mirror an existing `actions/*.test.ts` guard test); `CreateLeadInput`/`LeadUpdate` typecheck with `delivery_mode`.
- [ ] Run → FAIL.
- [ ] Implement `actions/capacity.ts` (guard pattern from `actions/leads.ts`: `import { assertOrgMember } from '@/lib/auth/assert'`); thread `delivery_mode` through the lead actions.
- [ ] Run tests → PASS; `npm run build` (verify no `'use server'` type re-export issue — run the real build, tsc alone won't catch it).
- [ ] Commit: `feat(capacity): membership-guarded actions + delivery_mode on leads`.

---

### Task 5: Settings — capacity inventory + availability editor (UI)

**Files:**
- Create: `components/admin/settings/CapacityUnitsClient.tsx`
- Create: `app/(admin)/[orgSlug]/settings/capacity/page.tsx` (read a sibling `settings/*/page.tsx` first to match the guard + layout pattern)
- Test: `__tests__/components/admin/settings/CapacityUnitsClient.test.tsx`

**Interfaces — Consumes:** `listCapacityUnits`/`create`/`update`/`deleteCapacityUnit` (Task 4); `CapacityUnit` (Task 1).
**Behavior:** list units grouped by kind (Serving units / Rooms); add (name + kind), rename, retire (toggle `active`), delete; per-unit block-out date ranges (add/remove `{start,end,note?}` rows). Page is gated: `requireOrgMember`, and render the manager only when `hasMultiResourceCapacity(org)`; otherwise a locked/upsell panel ("Multiple carts & rooms is a Business-plan feature"). Use existing kit primitives (Button, Input, StatusPill, Dialog/ConfirmDialog) — read a recent settings/admin client for conventions.

**Design:** Run the **design-ambition** skill before building this screen (per repo standing rule); it's a management surface — density, empty state (n=0 → "Add your first cart"), and the availability editor are the craft points.

**Steps:**
- [ ] design-ambition pass (announce it); then write a failing component test: renders unit names grouped by kind; the locked panel shows for a non-business org; "Add" calls `createCapacityUnit`.
- [ ] Run → FAIL.
- [ ] Implement the page + client.
- [ ] Run tests → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): settings inventory + availability editor`.

---

### Task 6: Delivery-mode toggle + over-capacity radar copy (UI)

**Files:**
- Modify: `components/admin/pipeline/NewOpportunityForm.tsx`, `components/admin/OpportunityDetailClient.tsx` (delivery-mode toggle)
- Modify: `components/admin/pipeline/PipelineListClient.tsx` (over-capacity badge)
- Test: `__tests__/components/admin/pipeline/PipelineListClient.test.tsx` (extend)

**Interfaces — Consumes:** `Lead.delivery_mode`, `createLead`/`updateLead` (Task 4); `PipelineRow.overCapacity` (Task 3).
**Behavior:**
- Delivery toggle: a small offsite/on-site control, default offsite, persisted via the lead actions. Render it only when the org is business-tier AND has ≥1 `venue` unit (nothing to choose otherwise) — pass that boolean down from the server page; do not query in the client.
- Radar copy: in the pill block, when `row.overCapacity?.over`, render an alert `StatusPill` reading `Over capacity — {mobileDemand} events · {mobileSupply} carts ({shortDate(eventDate)})`, choosing the kind that breached (mobile vs venue: "carts" vs "rooms"; if both, lead with the larger overage). When capacity mode is OFF, keep the increment-1 `Date conflict — {shortDate}` badge exactly. Reuse the `max-w-full whitespace-normal` wrap fix from #115.

**Design:** design-ambition pass on the copy/pill (announce it) — the over-capacity phrasing is the operator's read on "am I overbooked and by how much."

**Steps:**
- [ ] design-ambition pass; write failing tests: over-capacity row renders the "Over capacity — N events · M carts" pill; a room breach reads "rooms"; a non-over row with capacity mode keeps no capacity pill; capacity-OFF row still shows "Date conflict"; the delivery toggle renders only when `showDeliveryMode` prop is true.
- [ ] Run → FAIL.
- [ ] Implement the toggle + badge; thread the `showDeliveryMode` boolean from `page.tsx`/opportunity page.
- [ ] Run tests + full suite → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): delivery-mode toggle + over-capacity radar copy`.

## Self-Review

**Spec coverage:** capacity_units + availability (T1, T5) ✅; delivery_mode (T1, T4, T6) ✅; type-level engine (T2) ✅; radar integration + fallback backstop (T3) ✅; tier gate `hasMultiResourceCapacity` (T1, used T3/T5/T6) ✅; settings UI (T5) ✅; radar copy incl. base unchanged (T6) ✅; migration-free/additive (all tasks, optional fields) ✅; edge cases — on-site with zero venues flagged (T2 over rule), toggle hidden without a venue (T6) ✅.
**Placeholder scan:** none — every task carries signatures + concrete test cases; UI tasks name the exact behavior/props and defer only visual craft to design-ambition (intentional).
**Type consistency:** `CapacityUnitKind`/`CapacityUnit`/`CapacityDay`/`hasMultiResourceCapacity`/`computeCapacity`/`overCapacity`/`delivery_mode` and the `capacity_units` collection are named identically across T1→T6.
