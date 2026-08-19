# Pipeline Unit Assignment (increment 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Read `AGENTS.md` — modified Next.js; read `node_modules/next/dist/docs/` before framework code.

**Goal:** Let a business-tier operator optionally pin a booking to a specific cart and room (with free/taken/blocked hints) and flag when one unit is double-booked on a date — a mistake the Inc 1 type-level count can't see.

**Architecture:** Purely additive over Inc 1 (PR #117). A lead gains optional `assigned_units`; the pure engine gains a unit-clash pass on `CapacityDay` (orthogonal to `over`); the opportunity-detail page gains annotated pickers; the pipeline row gains a read-only clash badge. Unassigned leads and non-business/unit-less orgs are byte-for-byte unchanged.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Firestore admin SDK, React 19, vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-pipeline-unit-assignment-design.md` (read it).

## Global Constraints

- **Additive & migration-free.** `assigned_units` optional; `clashes` additive; unassigned leads = Inc 1 behavior exactly; base/solo path untouched. A clash NEVER changes the type-level `over`.
- **Never force assignment.** Every picker defaults to "Unassigned".
- **Tier gate unchanged:** assignment UI + clash only for `hasMultiResourceCapacity(org)` AND ≥1 unit.
- **Kind rules (Inc 1):** every bookable lead consumes a mobile unit; only `delivery_mode==='onsite'` consumes a venue. A venue assignment on an offsite lead is IGNORED (not counted, not clashed).
- **`LeadUpdate` lives in `lib/crm/leads.ts`** — do NOT re-export a type from the `'use server'` `actions/leads.ts` (`next build` breaks; tsc won't catch it — run the real build). See the delivery_mode precedent (`actions/leads.ts:88`).
- Bookable stages = `OPEN_STAGES ∪ {'closed_won'}`. `next build` passes; pure logic unit-tested with real assertions.

## File Structure

- **Modify** `lib/types.ts` — `Lead.assigned_units?: { mobile?: string; venue?: string }`.
- **Modify** `lib/capacity/capacity.ts` — `UnitClash`, `CapacityDay.clashes`, clash computation in `computeCapacity`, and a pure `rowOwnsClash(lead, day)` helper.
- **Create** `lib/capacity/assignment.ts` — pure `unitAnnotations(lead, units, sameDateLeads)` → per-unit `{ takenBy?, blocked? }`.
- **Modify** `lib/pipeline-view.ts` — `buildPipelineRows` sets `conflict = over || rowOwnsClash(...).length>0`.
- **Modify** `actions/leads.ts` (`CreateLeadInput`, `createLead`) + `lib/crm/leads.ts` (`LeadUpdate`, `createLeadCore`, `updateLeadCore`) — persist `assigned_units`.
- **Modify** `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx` — same-date read + annotation map + `showAssignment`.
- **Modify** `components/admin/OpportunityDetailClient.tsx` — `UnitAssignmentControl`.
- **Modify** `components/admin/pipeline/PipelineListClient.tsx` — clash badge.

---

### Task 1: Data + engine clash pass + annotation helper

**Files:**
- Modify: `lib/types.ts` (add to `interface Lead`, after `delivery_mode`)
- Modify: `lib/capacity/capacity.ts`
- Create: `lib/capacity/assignment.ts`
- Test: `__tests__/lib/capacity/capacity.test.ts` (extend), `__tests__/lib/capacity/assignment.test.ts`

**Interfaces — Produces:**
```ts
// lib/types.ts
assigned_units?: { mobile?: string; venue?: string }   // CapacityUnit ids; venue only meaningful when delivery_mode==='onsite'

// lib/capacity/capacity.ts
export interface UnitClash { unitId: string; unitName: string; kind: CapacityUnitKind; count: number }
// CapacityDay gains: clashes: UnitClash[]
// computeCapacity: unchanged over/detail; ALSO compute clashes per date.
export function rowOwnsClash(lead: Lead, day: CapacityDay | undefined): UnitClash[]
  // the clashing units THIS lead is assigned to (mobile always; venue only if onsite). [] when day undefined.

// lib/capacity/assignment.ts
export interface UnitAnnotation { takenBy?: string; blocked?: boolean }
export function unitAnnotations(
  lead: Pick<Lead,'id'|'event_date'>, units: CapacityUnit[], sameDateLeads: Lead[]
): Map<string, UnitAnnotation>
  // per unit id: blocked = !unitAvailableOn(unit, lead.event_date); takenBy = title of ANOTHER
  // bookable same-date lead that consumes this unit (mobile always; venue only if that lead is onsite).
```
Clash rule in `computeCapacity`: over bookable leads on the date, count each lead's consumed unit ids (mobile always; venue iff `delivery_mode==='onsite'`), skipping ids that don't resolve to a live unit of that kind; any unit with count ≥ 2 → a `UnitClash`. `over` computed exactly as today.

**Steps:**
- [ ] Failing tests (`capacity.test.ts`): two leads on a date both `assigned_units.mobile==='k1'` → `clashes` has k1 (count 2); distinct units → no clash even at/over capacity; a venue assigned to an OFFSITE lead is ignored (no venue clash); a stale id (no matching live unit) never clashes; **`over` is byte-for-byte unchanged by any assignment** (regression); clash-and-not-over co-occur (2 leads, 3 mobile units, both k1 → over=false, clash present). `rowOwnsClash`: returns the lead's clashing unit(s); [] for an unassigned lead or `day===undefined`.
- [ ] Failing tests (`assignment.test.ts`): `blocked` true when the unit is blocked on the lead's date; `takenBy` names another same-date consuming lead (NOT the lead itself); an offsite same-date lead does not make a venue "taken"; a free unit has an empty annotation.
- [ ] Run: `npx vitest run --exclude '**/.claude/**' capacity` → FAIL.
- [ ] Implement the type, `UnitClash`/`clashes`/clash-count in `computeCapacity`, `rowOwnsClash`, and `lib/capacity/assignment.ts`.
- [ ] Run tests → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): unit-clash pass + assignment annotations (pure)`.

---

### Task 2: Radar wiring — clash floats up, base unchanged

**Files:**
- Modify: `lib/pipeline-view.ts` (`buildPipelineRows` conflict assignment ~:161)
- Test: `__tests__/lib/pipeline-view.test.ts` (extend)

**Interfaces — Consumes:** `rowOwnsClash`, `CapacityDay.clashes` (Task 1).
**Behavior:** in capacity mode, a row's `conflict = day.over || rowOwnsClash(lead, day).length > 0` (was `day.over` only). `overCapacity` still = the `CapacityDay`. Off (backstop) unchanged. The comparator stays transitive — `conflict` is still a boolean.

**Steps:**
- [ ] Failing tests: with a `capacityByDate` whose day has `over:false` but a clash on the row's assigned unit, the row is `conflict===true` and sorts conflict-first; a row on the same day NOT assigned to the clashing unit is `conflict===false`; **backstop** — with no `capacityByDate`, output is identical to increment 1 (regression pin).
- [ ] Run → FAIL.
- [ ] Implement the `conflict` change.
- [ ] Run tests + full suite → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): float a double-booked-unit row up like an over-capacity one`.

---

### Task 3: Persist `assigned_units`

**Files:**
- Modify: `actions/leads.ts` (`CreateLeadInput` ~:15, `createLead` ~:42)
- Modify: `lib/crm/leads.ts` (`LeadUpdate`, `createLeadCore`, `updateLeadCore`)
- Test: `__tests__/actions/leads.test.ts` or `__tests__/lib/crm/leads.test.ts` (whichever exists; else extend the nearest)

**Interfaces — Produces:** `CreateLeadInput.assigned_units?` and `LeadUpdate.assigned_units?` (same shape as `Lead.assigned_units`). Persist by dropping `undefined` (mirror the `delivery_mode` handling at `actions/leads.ts:88`). The MERGE (cart set without clobbering room) happens in the UI control (Task 4), which sends the full merged object — the action writes it as given.

**Steps:**
- [ ] Failing test: `updateLeadCore` / `updateLead` with `{ assigned_units: { mobile:'k2' } }` persists it; a create with `assigned_units` round-trips; omitting it writes nothing (no `null`).
- [ ] Run → FAIL.
- [ ] Add the field to both types; persist in core fns.
- [ ] Run tests → PASS; **`npm run build`** (verify no `'use server'` type re-export — LeadUpdate stays imported from `lib/crm/leads`).
- [ ] Commit: `feat(capacity): persist assigned_units on leads`.

---

### Task 4: Opportunity-detail assignment control (UI)

**Files:**
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx` (units already loaded ~:34; add the same-date read + annotation map)
- Modify: `components/admin/OpportunityDetailClient.tsx` (add `UnitAssignmentControl` beside `DeliveryModeControl` ~:410)
- Test: `__tests__/components/admin/OpportunityDetailClient*.test.tsx` (new or extend)

**Interfaces — Consumes:** `unitAnnotations` (Task 1); `CapacityUnit`, `Lead.assigned_units`; `updateLead`, `listCapacityUnitsCore`.
**Server (`[leadId]/page.tsx`):** when `hasMultiResourceCapacity(org)` and `capacityUnits.length>0` and `lead.event_date`, read the same-date bookable leads — `leadsRef(orgId).where('event_date','==',lead.event_date).get()` filtered to `OPEN_STAGES∪{'closed_won'}` and excluding `lead.id` — build `unitAnnotations(lead, capacityUnits, sameDateLeads)`, and pass `{ units: capacityUnits, annotations, assigned: lead.assigned_units }` to the client (serialize the Map as a plain object). Compute `showAssignment = hasCapacity && units.length>0 && !!lead.event_date`.
**Client (`UnitAssignmentControl`):** a **cart** select (all mobile units) always; a **room** select (venue units) only when `lead.delivery_mode==='onsite'`. Each: an "Unassigned" option + one per unit labelled `‹name› (free | taken by ‹title› | blocked)` from annotations. On change, optimistic `updateLead(orgId, leadId, { assigned_units: { ...current, [kind]: value||undefined } })` with rollback (mirror `DeliveryModeControl` ~:196). Hidden when `!showAssignment`.

**Design direction (design-ambition pass, done 2026-08-18 — build to this):**
- Two labelled selects (kit `Label` + `select`/kit Select, mirror the pattern in `DeliveryModeControl` / a settings client): **"Serving unit"** (all `mobile` units) always; **"Room"** (`venue` units) only when `delivery_mode==='onsite'`. Each: an **"Unassigned"** default option + one per unit labelled `‹name› — free | taken by ‹title› | blocked`.
- **THE MOVE — prevent, don't just detect:** when the CURRENT selection is a *taken* unit, render an inline alert-tone line directly under that select — `Double-booked with ‹title›`; when *blocked*, `Unavailable — blocked on that date`. This catches the clash AT the pick (Nielsen error-prevention), where the pipeline badge only catches it after. The data is already in `annotations` (`takenBy`/`blocked`) — no extra query. This line is REQUIRED, not optional.
- Optimistic `updateLead` with rollback (mirror `DeliveryModeControl` ~:196); the alert uses `role="alert"`. Hidden when `!showAssignment`.
- **Hard gates:** WCAG 2.2 AA on selects + the inline alert; labelled; keyboard-operable; `prefers-reduced-motion`.

**Steps:**
- [ ] design-ambition direction above; write failing component test: pickers render Unassigned + annotated options; selecting a cart calls `updateLead` with a MERGED `assigned_units` (keeps an existing room); selecting a `taken` unit shows the inline `Double-booked with ‹title›` alert; the room picker is absent when offsite; hidden when `showAssignment` is false.
- [ ] Run → FAIL.
- [ ] Implement the server threading + the control.
- [ ] Run tests → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): opportunity-detail unit assignment with free/taken hints`.

---

### Task 5: Pipeline clash badge (UI)

**Files:**
- Modify: `components/admin/pipeline/PipelineListClient.tsx` (near the over-capacity pill ~:109/render block)
- Test: `__tests__/components/admin/pipeline/PipelineListClient.test.tsx` (extend)

**Interfaces — Consumes:** `rowOwnsClash` (Task 1); `PipelineRow.overCapacity`, `Lead.assigned_units`.
**Behavior:** compute `const clash = rowOwnsClash(row.lead, row.overCapacity)`; when non-empty, render an alert `StatusPill` `‹names joined by " & "› double-booked — ‹shortDate(row.overCapacity.date)›` (reuse `max-w-full whitespace-normal`). Independent of the over-capacity pill (a row may show both). Base/solo orgs (no `overCapacity`) show neither — increment-1 "Date conflict" path intact.

**Design direction (design-ambition pass, done 2026-08-18 — build to this):**
- A read-only alert `StatusPill` naming the SPECIFIC unit(s) — `‹name(s) joined by " & "› double-booked — ‹shortDate(date)›` — because "Kart 1" is actionable where a bare flag isn't (Few: the specific is the signal). Reuse the #115 `max-w-full whitespace-normal` wrap.
- Independent of the over-capacity pill — a row may show both (day over AND its unit clashed); render the clash badge alongside, not instead. Base/solo orgs (no `overCapacity`) show neither — the increment-1 "Date conflict" path is untouched.
- **Hard gate:** AA contrast on the alert pill; verify the wrap at mobile 375 (the #115 surface).

**Steps:**
- [ ] design-ambition direction above; failing tests: a row whose assigned unit clashes renders "Kart 1 double-booked — <date>"; a two-unit clash reads "Kart 1 & Room A double-booked"; a row without a clash renders no clash pill; a base-mode row still shows "Date conflict".
- [ ] Run → FAIL.
- [ ] Implement the badge.
- [ ] Run tests + full suite → PASS; `npm run build`.
- [ ] Commit: `feat(capacity): read-only unit double-booked badge on the pipeline`.

## Self-Review

**Spec coverage:** `assigned_units` (T1,T3); clash pass + `rowOwnsClash` (T1); annotation helper (T1); conflict/sort float-up (T2); backstop (T2); persist w/o re-export gotcha (T3); annotated pickers + same-date read (T4); read-only clash badge (T5); tier gate + never-forced (T4/T5 gating, T1 kind rules); venue-on-offsite ignored (T1); stale-id tolerance (T1) — all covered. ✅
**Placeholder scan:** none — signatures + concrete test cases throughout; UI tasks name behavior/props and defer only visual craft to the design-ambition block (added before build). ✅
**Type consistency:** `assigned_units {mobile?,venue?}`, `UnitClash`, `CapacityDay.clashes`, `rowOwnsClash`, `unitAnnotations`/`UnitAnnotation`, `showAssignment` named identically T1→T5. ✅
