# Pipeline Capacity — Finish (increment 4, final) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`. Read `AGENTS.md` — modified Next.js; read `node_modules/next/dist/docs/` before framework code.

**Goal:** Event types declare which kinds they consume (0/1 each), the capacity/clash warn is enforced server-side (with override), and assignment gets two one-click helpers (suggest a free unit; assign from the schedule).

**Architecture:** Additive over Inc 1–3. A pure `leadRequirement(lead, org)` keystone that every capacity-mode engine routes through (defaulting to today's rule ⇒ byte-for-byte backstop when no profiles). Plus an org `event_type_profiles` scalar + editor, a server guard in `setLeadStage` (with `override`) that supersedes the Inc-2 client confirm, an auto-suggest affordance, and click-to-assign on the schedule.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Firestore admin SDK, React 19, vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-pipeline-capacity-finish-design.md` (read it).

## Global Constraints

- **Additive & migration-free.** `event_type_profiles` optional; absent ⇒ `leadRequirement` returns `{ mobile: true, venue: delivery_mode==='onsite' }` = today's capacity rule. **BACKSTOP (non-negotiable):** with no profiles, every Inc-1/2/3 engine output is byte-for-byte unchanged — pin it with regression tests asserting the existing expected values.
- **Profiles are capacity-mode only.** The base/solo `conflictEventDates` path (no units) is UNTOUCHED.
- **Guard = advisory-with-override.** Reject a clashing/over `closed_won` move only when `override` is not passed; a deliberate override always proceeds.
- **0/1 per kind** — `needsMobile`/`needsVenue` booleans, never counts >1.
- **Never force assignment.** Auto-suggest / schedule-assign are optional one-click; Unassigned stays valid.
- Bookable = `OPEN_STAGES ∪ {'closed_won'}`; UTC-safe dates. `next build` passes; pure logic unit-tested with real assertions. No `'use server'` type re-exports.

## File Structure

- **Create** `lib/capacity/requirement.ts` — `leadRequirement` + `LeadRequirement`.
- **Modify** `lib/capacity/capacity.ts` — `computeCapacity` demand + `computeClashes` consumption route through `leadRequirement`.
- **Modify** `lib/capacity/forecast.ts` — mobile/venue demand+booked via `leadRequirement`.
- **Modify** `lib/capacity/schedule.ts` — `consumes` via `leadRequirement`.
- **Modify** `lib/types.ts` — `Org.event_type_profiles`.
- **Create** `actions/capacity-config.ts` additions OR reuse — `updateEventTypeProfiles`.
- **Modify** `actions/leads.ts` — `setLeadStage(…, opts?)` guard + `CapacityGuardError`.
- **Modify** `components/admin/pipeline/PipelineListClient.tsx`, `PipelineBoardView.tsx`, `components/admin/OpportunityDetailClient.tsx` — catch-and-confirm (drop the Inc-2 pre-confirm).
- **Modify** `components/admin/settings/CapacityUnitsClient.tsx` — event-type-profile editor.
- **Modify** `components/admin/OpportunityDetailClient.tsx` — auto-suggest a free unit (its `UnitAssignmentControl`).
- **Modify** `components/admin/pipeline/CapacityOutlookClient.tsx` — schedule Unassigned click-to-assign.

---

### Task 1: `leadRequirement` keystone + engine rewire (backstop-pinned)

**Files:** Create `lib/capacity/requirement.ts`; Modify `lib/capacity/{capacity,forecast,schedule}.ts`; Test `__tests__/lib/capacity/requirement.test.ts` + extend `{capacity,forecast,schedule}.test.ts`.

**Interfaces — Produces:**
```ts
// lib/capacity/requirement.ts
export interface LeadRequirement { mobile: boolean; venue: boolean }
export function leadRequirement(lead: Pick<Lead,'event_type'|'delivery_mode'>, org: Pick<Org,'event_type_profiles'>): LeadRequirement
  // profile name match (trim, case-insensitive) → { mobile: p.needsMobile, venue: p.needsVenue }
  // else → { mobile: true, venue: lead.delivery_mode === 'onsite' }
```
Rewire (each engine already takes `org`; pass it or thread it):
- `computeCapacity`: `mobileDemand` = count on-date bookable with `leadRequirement(l,org).mobile`; `venueDemand` = …`.venue`.
- `computeClashes`: a lead consumes `assigned_units.mobile` only if `req.mobile`; `assigned_units.venue` only if `req.venue`.
- `forecast.ts`: `mobileDemand`/`venueDemand` (and thus `booked`) via `leadRequirement`.
- `schedule.ts` `consumes(lead, unit, org)`: unit consumed only if `leadRequirement(lead,org)[unit.kind]`.

**Steps:**
- [ ] Failing tests — `requirement`: default (no profiles) mobile true / venue = onsite; matched profile overrides both (case-insensitive, trimmed); unmatched/absent event_type → default. **Backstop regression:** with `org.event_type_profiles` undefined, `computeCapacity`/`computeClashes`/`forecastByMonth`/`buildSchedule` return the SAME values the existing Inc-1/2/3 tests assert (add explicit "unchanged with no profiles" cases). Profile effect: a `{needsMobile:false}` type drops from mobile demand/clash/booked/schedule; `{needsVenue:true}` counts a room regardless of delivery_mode.
- [ ] Run `npx vitest run --exclude '**/.claude/**' capacity` → FAIL.
- [ ] Implement `requirement.ts`; thread `org` + route each engine through it (keep signatures backward-compatible — engines already receive `org`).
- [ ] Run capacity suite + full suite → PASS (existing tests unchanged); `npm run build`.
- [ ] Commit: `feat(capacity): leadRequirement keystone + engine rewire (per-event-type, backstopped)`.

---

### Task 2: `event_type_profiles` data + action

**Files:** Modify `lib/types.ts`; Modify `actions/capacity-config.ts` (add `updateEventTypeProfiles`); Test `__tests__/actions/capacity-config.test.ts` (extend).

**Interfaces — Produces:**
```ts
// interface Org
event_type_profiles?: Array<{ name: string; needsMobile: boolean; needsVenue: boolean }>
// actions/capacity-config.ts
export async function updateEventTypeProfiles(orgId: string, profiles: NonNullable<Org['event_type_profiles']>): Promise<void>
```
`assertOrgAdmin` then persist the org scalar (mirror `updateServiceableDays`). Validate: each `name` non-empty (trimmed); dedupe by case-insensitive name (last wins); booleans coerced.

**Steps:**
- [ ] Failing test: unauthorized rejects; persists the profiles array; empty name rejected; dupe names collapsed. Assert the write targets `orgs/{orgId}` (pin the path, per the Inc-3 lesson).
- [ ] Run → FAIL; implement; tests → PASS; `npm run build` (no `'use server'` type re-export).
- [ ] Commit: `feat(capacity): event-type resource profiles config`.

---

### Task 3: Server capacity guard (with override) + client catch-and-confirm

**Files:** Modify `actions/leads.ts` (`setLeadStage`, `CapacityGuardError`); Modify `components/admin/pipeline/PipelineListClient.tsx`, `PipelineBoardView.tsx`, `components/admin/OpportunityDetailClient.tsx`; Test `__tests__/actions/leads*.test.ts` + the client component tests.

**Interfaces — Produces:**
```ts
export class CapacityGuardError extends Error { readonly code = 'capacity_guard'; constructor(message: string) }
export async function setLeadStage(orgId, leadId, stage, opts?: { override?: boolean }): Promise<void>
```
Guard: on a transition INTO `closed_won` (lead not already won), when `hasMultiResourceCapacity(org)` + ≥1 unit + `!opts.override`: load leads+units, simulate this lead won, and if its date is over capacity (`computeCapacity`) OR its assigned unit clashes (`computeClashes`), `throw new CapacityGuardError(<names the conflict + date>)`. Else proceed as today.
Clients: **remove** the Inc-2 `window.confirm` pre-check in `PipelineListClient.handleStageChange`; instead call `setLeadStage`, `catch` a `CapacityGuardError` (by `.code`/name — it arrives as a server-action error), `window.confirm(err.message)`, and re-call with `{ override: true }`. Add the SAME catch-and-confirm to `PipelineBoardView` (currently unguarded) and to the opportunity-detail win path (verify it routes through `setLeadStage`).

**Steps:**
- [ ] Failing tests: `setLeadStage` into `closed_won` on an over/clashing date throws `CapacityGuardError` without override; passes with `{override:true}`; a `standard`-plan or unit-less org never guards; a non-`closed_won` move never guards. Client: a guard error triggers one confirm and (on confirm) a re-call with override; decline → no write.
- [ ] Run → FAIL; implement guard + client rewire (drop the old pre-confirm); tests + full suite → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): server-side capacity guard with override (supersedes client confirm)`.

---

### Task 4: Event-type profiles settings editor (UI)

**Files:** Modify `components/admin/settings/CapacityUnitsClient.tsx` (+ page thread `org.event_type_profiles`); Test its component test.

**Interfaces — Consumes:** `updateEventTypeProfiles` (T2); `kindLabel`.
**Behavior:** a new "Event types" block on the Resources & capacity page — a list of profile rows (name input + a **needs-{mobileLabel}** toggle + a **needs-{venueLabel}** toggle) with add/remove, saved via `updateEventTypeProfiles` (optimistic + rollback). A hint line: "Types not listed use the default — a {mobileLabel} always, a {venueLabel} when on-site." Kind words via `kindLabel`.

**Design direction:** run **design-ambition** first (baked block added before build).

**Steps:**
- [ ] design-ambition; failing test: rows render name + two toggles; add/remove + toggle call `updateEventTypeProfiles`; the hint uses `kindLabel`.
- [ ] Run → FAIL; implement; tests → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): event-type resource-profile settings editor`.

---

### Task 5: Auto-suggest a free unit (UI)

**Files:** Modify `components/admin/OpportunityDetailClient.tsx` (`UnitAssignmentControl`); Test its test.

**Interfaces — Consumes:** the `annotations` (free/taken/blocked, already loaded); `updateLead`.
**Behavior:** when a kind's selection is Unassigned AND ≥1 unit of that kind is free on the lead's date (per `annotations`), show a one-click **"Use a free {kindLabel}"** that assigns the first free unit (optimistic, same merge as the picker). Hidden when none free or already assigned. Still fully optional.

**Design direction:** run **design-ambition** first (baked block added before build).

**Steps:**
- [ ] design-ambition; failing test: with a free unit, the suggest control renders and assigns the first free one via `updateLead`; hidden when all taken/blocked; hidden when already assigned.
- [ ] Run → FAIL; implement; tests → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): auto-suggest a free unit in the assignment picker`.

---

### Task 6: Click-to-assign from the schedule (UI)

**Files:** Modify `components/admin/pipeline/CapacityOutlookClient.tsx` (Unassigned lane) + its page (pass the org units + an assign affordance); Test the outlook test.

**Interfaces — Consumes:** `updateLead`; the schedule's `unassigned` lane (booking leadId/title); org units.
**Behavior:** each Unassigned-lane booking becomes a control → a small popover/menu of the org's units for that booking's need (or a "assign a free unit" shortcut) → `updateLead({ assigned_units })`, optimistic; on success the booking moves to the chosen unit's lane (router.refresh). Rest of the schedule stays read-only. Click-to-assign, keyboard-operable — NOT drag.

**Design direction:** run **design-ambition** first (baked block added before build).

**Steps:**
- [ ] design-ambition; failing test: an Unassigned booking exposes an assign control; choosing a unit calls `updateLead` with the merged `assigned_units`; keyboard-operable; other lanes remain non-interactive.
- [ ] Run → FAIL; implement; tests + full suite → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): click-to-assign from the schedule Unassigned lane`.

## Self-Review

**Spec coverage:** leadRequirement keystone + rewire + backstop (T1); event_type_profiles data+action (T2); server guard with override + client rewire incl. the unguarded board (T3); profiles editor (T4); auto-suggest (T5); schedule click-to-assign (T6); profiles capacity-mode-only / base untouched (T1 rewire scope); 0/1 per kind (T1/T2 booleans); never-forced (T5/T6). ✅
**Placeholder scan:** none — signatures + concrete test cases; UI tasks defer only visual craft to the design-ambition block (added before build). ✅
**Type consistency:** `leadRequirement`/`LeadRequirement`, `event_type_profiles {name,needsMobile,needsVenue}`, `updateEventTypeProfiles`, `CapacityGuardError`, `setLeadStage(…,opts)` named identically T1→T6. ✅
