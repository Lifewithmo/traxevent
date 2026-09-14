# Event Types First-Class (Inc 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This plan is executed as a parallel fleet: tasks within a wave run concurrently in isolated worktrees; a task's implementer must read the spec + their task + Global Constraints, and touch ONLY their task's files.**

**Goal:** Promote `Org.event_type_profiles` into the one id-referenced, archivable Event Types setting feeding every picker (New Opportunity, public intake, opportunity editors), retire the legacy terminology-registry surface, and finish the D3 roster-module gate.

**Architecture:** Extend the existing org-doc array in place (`{id?, name, needsMobile, needsVenue, archived?}`), add `Lead.event_type_id`, and make `leadRequirement` match id → name → default. Lifecycle actions (rename-with-backfill, merge, guarded delete, adopt-from-history) live in a new guard-free core (`lib/crm/event-type-admin.ts`) wrapped by admin-guarded server actions, mirroring the `lib/capacity/units.ts` / `actions/capacity-config.ts` split. UI follows the `CapacityUnitsClient` idiom and the house kit.

**Tech Stack:** Next.js App Router (see AGENTS.md — read `node_modules/next/dist/docs/` before writing code), Firebase Admin SDK, vitest, Tailwind v4 + house tokens.

**Spec:** `docs/superpowers/specs/2026-09-14-event-types-first-class-design.md` (read it in full first; §3–§5 are the contract, §10 is Workstream B).

## Global Constraints

- **Worktree guard (HARD):** before ANY git or file operation, run `pwd` and verify you are inside YOUR assigned worktree. All git commands use `git -C <your-worktree>`. Never touch `/Users/rm/vw/traxevent` (the contended primary checkout).
- Setup per fresh worktree: `npm install --no-audit --no-fund`, then `cp /Users/rm/vw/traxevent/.env.local .` (needed for build).
- TDD: failing test → minimal code → pass → commit. Run the test file you touched plus any suite named in your task.
- `'use server'` modules must NOT re-export types (`next build` breaks while tsc passes). Export types from `lib/`, not `actions/`.
- No raw Tailwind color literals / hex values — house tokens only (`app/globals.css` is the source of truth). AA: 4.5:1 body, 3:1 UI, targets ≥24×24px. Dark mode + `prefers-reduced-motion` on everything new.
- Kit only: `ConfirmDialog` (never `window.confirm`/`prompt`), `EmptyState`, `StatusPill`, `Menu`, `Card`, `Button`, `Input`, `Label` from `components/ui/`.
- No schema-order block stacks (run the repo `screen-composition` skill before any new page/section JSX).
- Optimistic UI with snapshot-rollback for every settings mutation (pattern: `CapacityUnitsClient.tsx:290-326`).
- Free text `event_type` NEVER blocks a lead create (standing decision).
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File ownership map (conflict avoidance)

| Task | Owns (no other task may modify) |
|---|---|
| T1 | `lib/types.ts`, `lib/capacity/requirement.ts`, `lib/crm/event-type-options.ts`, `lib/crm/event-type-admin.ts` (new), `actions/event-type-profiles.ts` (new), `actions/capacity-config.ts`, `lib/crm/leads.ts`, `lib/crm/validate.ts`, `actions/leads.ts`, `actions/intake-public.ts` |
| T2 | `lib/event-nav.ts`, `app/(admin)/[orgSlug]/[eventSlug]/settings/page.tsx`, new `layout.tsx` guards under `[eventSlug]/{families,assignments,checkin,forms,people}` + `[orgSlug]/registrants`, `docs/ROADMAP.md` (the D3 line only) |
| T3 | `components/admin/opportunity/ConvertToWorkCard.tsx`, `app/(admin)/[orgSlug]/new-event/page.tsx`, `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`, `components/admin/OpportunityDetailClient.tsx` (prop threading only), `lib/industry-packs.ts` |
| T4 | `app/(admin)/[orgSlug]/event-types/page.tsx`, `components/admin/EventTypesClient.tsx` (full rewrite), delete `actions/event-types.ts`, `components/admin/settings/CapacityUnitsClient.tsx` (profiles-section removal only), `app/(admin)/[orgSlug]/capacity/page.tsx` (prop removal), `lib/settings-health.ts` |
| T5 | `components/admin/pipeline/NewOpportunityForm.tsx`, `components/admin/pipeline/EventTypeChips.tsx`, `app/(admin)/[orgSlug]/leads/page.tsx`, `components/admin/clients/ClientCockpit.tsx`, `app/(admin)/[orgSlug]/clients/[customerId]/page.tsx`, new `components/admin/pipeline/NewEventTypePopover.tsx` |
| T6 | `components/public/IntakeForm.tsx`, its host page under `app/(public)`, `components/admin/opportunity/FactsGrid.tsx`, `components/admin/opportunity/OpportunityDetailsForm.tsx`, new shared `components/admin/opportunity/EventTypeSelect.tsx` |
| T7 | `scripts/seed/brewtrax-data.ts` (+ seed pipeline files as needed), `docs/ROADMAP.md` (increment entry) |

Waves: **W1 = T1 ∥ T2 ∥ T3** (independent). **W2 = T4 ∥ T5 ∥ T6 ∥ T7** (all consume T1's interfaces; branched after T1 integrates). **W3** = adversarial review fleet + fixes + `next build` + full vitest + PR.

---

### Task 1: Core model, matching, and lifecycle actions

**Files:**
- Modify: `lib/types.ts` (~:44-49 `event_type_profiles`, Lead interface ~:508)
- Modify: `lib/capacity/requirement.ts`
- Modify: `lib/crm/event-type-options.ts`
- Create: `lib/crm/event-type-admin.ts`
- Create: `actions/event-type-profiles.ts`
- Modify: `actions/capacity-config.ts:86-110` (`updateEventTypeProfiles`)
- Modify: `lib/crm/leads.ts`, `lib/crm/validate.ts`, `actions/leads.ts`, `actions/intake-public.ts`
- Test: `__tests__/lib/capacity/requirement.test.ts`, `__tests__/lib/event-type-options.test.ts`, new `__tests__/lib/event-type-admin.test.ts`, `__tests__/actions/capacity-config.test.ts`

**Interfaces (Produces — later tasks rely on these exact names):**

```ts
// lib/types.ts
export interface EventTypeProfile {
  id?: string            // 16-hex; absent only on legacy entries not yet re-saved
  name: string
  needsMobile: boolean
  needsVenue: boolean
  archived?: boolean
}
// Org.event_type_profiles?: EventTypeProfile[]   (array order = display order)
// Lead.event_type_id?: string

// lib/capacity/requirement.ts — signature gains event_type_id
leadRequirement(lead: Pick<Lead,'event_type'|'delivery_mode'|'event_type_id'>, org): LeadRequirement

// lib/crm/event-type-options.ts
buildEventTypeOptions(profiles, leads): string[]        // ACTIVE profile names first, then history; names matching an archived profile (trim+lowercase) are excluded from BOTH sides; cap 8 unchanged
eventTypeProfileNames(profiles): string[]               // ACTIVE only
activeEventTypeProfiles(profiles): EventTypeProfile[]   // NEW: !archived, in order

// lib/crm/event-type-admin.ts (guard-free cores; adminDb passed work like lib/capacity/units.ts *Core fns)
createEventTypeProfileCore(orgId, input: {name; needsMobile; needsVenue}): Promise<EventTypeProfile>  // trim; case-insensitive name match returns the existing profile (idempotent; unarchives if archived)
renameEventTypeProfileCore(orgId, id, newName): Promise<{updated: number}>   // updates entry, then backfills: leads with event_type_id===id OR (!event_type_id && name-match old name) get {event_type_id: id, event_type: newName}; batched ≤500/batch
mergeEventTypeProfilesCore(orgId, fromId, intoId): Promise<{updated: number}> // re-points matching leads to {event_type_id: intoId, event_type: into.name}, removes `from` entry
deleteEventTypeProfileCore(orgId, id): Promise<{ok: true} | {ok: false; usage: number}>  // guard-as-return-value (house style, lib/capacity/guard.ts rationale): refuses when usage > 0
setEventTypeProfileArchivedCore(orgId, id, archived: boolean): Promise<void>
adoptEventTypesFromHistoryCore(orgId, entries: {name; needsMobile; needsVenue}[]): Promise<{created: number; adopted: number}>  // create-or-match each, then backfill ids onto exact-matching leads
computeEventTypeUsage(leads: Lead[], profiles: EventTypeProfile[]): { byProfileId: Record<string, number>; unadopted: Array<{name: string; count: number; onsiteMajority: boolean}> }  // PURE; name grouping trim+lowercase, display name = most frequent original spelling

// actions/event-type-profiles.ts ('use server', assertOrgAdmin, thin wrappers over the cores)
createEventTypeProfile / renameEventTypeProfile / mergeEventTypeProfiles / deleteEventTypeProfile / setEventTypeProfileArchived / adoptEventTypesFromHistory
```

- [ ] **Step 1:** Failing tests for `leadRequirement` id-first matching: id match wins over a conflicting name match; id match works when the profile is `archived`; stale `event_type_id` (no such profile) falls back to name match; name match still works for archived profiles; no-profiles backstop byte-identical to today (keep every existing test green untouched).
- [ ] **Step 2:** Implement id-first matching (insert an id scan before the existing name loop; keep last-wins name semantics verbatim). Run the full requirement suite.
- [ ] **Step 3:** Failing tests for options builder: archived profile name absent from chips even when frequent in history; `activeEventTypeProfiles` order/filtering; cap-8 behavior unchanged.
- [ ] **Step 4:** Implement; run `__tests__/lib/event-type-options.test.ts`.
- [ ] **Step 5:** Failing tests for `computeEventTypeUsage` (id-referenced leads count to their profile even after rename; unadopted grouping picks most-frequent spelling; `onsiteMajority` from `delivery_mode`), then each lifecycle core against the Firestore test double used by `__tests__/actions/capacity-config.test.ts` (rename backfill rewrites exactly the matching leads; merge; delete guard `{ok:false,usage}`; adopt idempotency; create unarchives an archived same-name profile).
- [ ] **Step 6:** Implement cores + actions wrappers. `updateEventTypeProfiles` in `actions/capacity-config.ts` additionally: assigns missing `id`s, preserves `id`/`archived` through its existing dedupe (extend its tests).
- [ ] **Step 7:** Lead write paths: `lib/crm/leads.ts` create/update accept `event_type_id` (trim-guard: persist only when it references an existing org profile — load org doc in the action layer, `actions/leads.ts`, and drop silently otherwise); `actions/intake-public.ts` resolves `event_type_id` SERVER-SIDE by name-matching the submitted string against active profiles (never trusts a client-supplied id). `lib/crm/validate.ts` unchanged for `event_type` (200-char rule stands). Tests in the existing leads/intake test files' style.
- [ ] **Step 8:** `npx vitest run __tests__/lib __tests__/actions` green, commit (`feat(event-types): id-referenced profiles + lifecycle cores`).

### Task 2: Workstream B — finish the roster-module gate

**Files:**
- Modify: `lib/event-nav.ts:15` (`ROSTER_KEYS`)
- Create: `app/(admin)/[orgSlug]/[eventSlug]/families/layout.tsx` (and siblings `assignments/`, `checkin/`, `forms/`, `people/`)
- Create: `app/(admin)/[orgSlug]/registrants/layout.tsx`
- Modify: `app/(admin)/[orgSlug]/[eventSlug]/settings/page.tsx` (`:99-178`, `:305-341`, `:438`)
- Modify: `docs/ROADMAP.md:406` (mark the D3 follow-up closed)
- Test: the existing event-nav test file (find under `__tests__`), plus a settings-page payload test if one exists (else a unit test on the extracted payload builder)

**Interfaces:** Consumes nothing from other tasks. Produces no new exports (gate-only). The route-guard layout body is exactly the public-register precedent:

```tsx
// app/(admin)/[orgSlug]/[eventSlug]/families/layout.tsx  (same for assignments/checkin/forms/people)
import { assertOrgModule } from '@/lib/auth/module-guard'
export default async function Layout(
  { children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params
  await assertOrgModule(orgSlug, 'attendee-roster')
  return children
}
// registrants/layout.tsx uses 'registrants'
```

- [ ] **Step 1:** Failing nav test: coffee-cart module list (`resolveEnabledModules('coffee-cart')`) must hide `forms` and `people` tabs for a client_job; `general` still shows them.
- [ ] **Step 2:** Add `'forms'`, `'people'` to `ROSTER_KEYS`. Nav suite green (tab row and sidebar both flow through `buildEventNav`, so one change covers both).
- [ ] **Step 3:** Add the six guard layouts (code above). Match params typing to a neighboring `layout.tsx` in the same tree (Next 16 async params).
- [ ] **Step 4:** Event settings: wrap the registration fields in the save payload (`registration_open/close`, `capacity`, `payment_amount` at `:167-178`, `registration_type` at `:160`) in `rosterEnabled` conditions; make the Status option copy roster-aware (`Active — registration open` → `Active` when roster is off, `:341`); REMOVE the Event type `<select>` (`:305-308`) + its `listOrgEventTypes` load (`:67`) + the `registration_type` derivation from the removed lookup (`:105`) — the event keeps its stored `event_type_id`/`registration_type` untouched on save. Do NOT import anything from `actions/event-types.ts` afterward (T4 deletes that file).
- [ ] **Step 5:** Update `docs/ROADMAP.md:406` open thread to closed-with-this-branch. Targeted tests green; commit (`fix(events): finish the D3 attendee-roster gate; drop legacy type select from event settings`).

### Task 3: Legacy picker retirement (convert, new-event, detail threading)

**Files:**
- Modify: `components/admin/opportunity/ConvertToWorkCard.tsx` (select at ~:284-294, `handleConvert` `:216-243`, `DEFAULT_EVENT_TYPE_ID` default `:62`, `eventTypes` prop)
- Modify: `components/admin/OpportunityDetailClient.tsx` (drop the `eventTypes` prop threading)
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx:15,71` (drop the `listOrgEventTypes` load)
- Modify: `app/(admin)/[orgSlug]/new-event/page.tsx` (remove its type picker; always `eventCreateFieldsFromType(getEventType(DEFAULT_EVENT_TYPE_ID))`)
- Modify: `lib/industry-packs.ts` (delete the dead `eventTypeId` field + its five values)
- Test: existing ConvertToWorkCard / OpportunityDetailClient test files (update renders that passed `eventTypes`)

**Interfaces:** Consumes `getEventType`, `DEFAULT_EVENT_TYPE_ID`, `eventCreateFieldsFromType` from `lib/event-types.ts` (unchanged). Produces: `ConvertToWorkCard` no longer takes an `eventTypes` prop.

- [ ] **Step 1:** Failing/updated test: converting a won opportunity with no type select in the DOM creates the event with `event_type_id: 'event'` and preserves the Kind select behavior (`market_day` path untouched).
- [ ] **Step 2:** Implement: in `handleConvert`, replace the `eventTypes.find` + error with `const type = getEventType(DEFAULT_EVENT_TYPE_ID)`; delete the select block and the `eventTypeId` state; remove the prop from the component, `OpportunityDetailClient`, and the page loader (also drop the import at `leads/[leadId]/page.tsx:15`).
- [ ] **Step 3:** Same treatment for `new-event/page.tsx` (keep everything else about that page intact).
- [ ] **Step 4:** Delete `eventTypeId` from `IndustryPack` and all five pack literals (`lib/industry-packs.ts:15,34,43,52,61,70`) — it has zero readers.
- [ ] **Step 5:** Component suites green; commit (`refactor(events): retire legacy event-type pickers; events default to General Event internally`).

### Task 4: Settings → Event types page (replaces the legacy page)

**Files:**
- Rewrite: `app/(admin)/[orgSlug]/event-types/page.tsx` (server page: `requireOrgMember`, `export const dynamic = 'force-dynamic'`, load org + leads, compute usage via `computeEventTypeUsage`, render client)
- Rewrite: `components/admin/EventTypesClient.tsx` (full replacement)
- Delete: `actions/event-types.ts` (T2/T3 removed all other consumers in W1)
- Modify: `components/admin/settings/CapacityUnitsClient.tsx` (remove the profiles section `:290-326`, `:553-607`, `:1059-1230`; add one hint row linking to `/{orgSlug}/event-types`: "Event types moved — manage them in Settings → Event types.") and `app/(admin)/[orgSlug]/capacity/page.tsx:24` (drop `initialEventTypeProfiles`)
- Modify: `lib/settings-health.ts` (`event-types` area: `configured: (org.event_type_profiles?.some(p => !p.archived)) ?? false`)
- Test: rewrite `__tests__/components/admin/settings/CapacityUnitsClient.test.tsx` profile cases into a new `__tests__/components/admin/EventTypesClient.test.tsx`; settings-health test update

**Interfaces:** Consumes ALL of T1's actions + `computeEventTypeUsage` + `EventTypeProfile`. Props: `EventTypesClient({ orgId, orgSlug, initialProfiles, usage, kindLabels })` where `kindLabels` comes from `resolveResourceLabels` (see `lib/capacity/labels.ts`, used at `CapacityUnitsClient.tsx:81-82`).

**Composition (screen-composition skill — no card stacks):** job = "keep the list true"; deciding value = the unadopted count. One section, rows in `Card size="sm"` per the `EventTypeRow` idiom being migrated (inline-edit name commit-on-blur/Enter/Escape, two `aria-pressed` toggle pills with kindLabel words, right-aligned usage count "12 jobs", `StatusPill` "Archived" when archived, overflow `Menu`: Move up · Move down · Archive/Restore · Merge into… · Delete). Add form in the section header. Persistent hint bar (default rule). When unadopted history exists, an **Adopt from history** section ABOVE the list: checked-by-default rows (`name — N jobs`, policy toggles prefilled `needsMobile: true`, `needsVenue: onsiteMajority`) + one primary "Create N event types" action. Empty org (no profiles, no leads): `EmptyState` "Add your first event type".

- [ ] **Step 1:** Failing component tests: render rows w/ usage counts; archive hides nothing from the list but flags the pill; Merge opens `ConfirmDialog` showing the count and calls `mergeEventTypeProfiles(orgId, fromId, intoId)`; Delete disabled (with tooltip text "In use — archive or merge instead") when usage > 0; adopt section calls `adoptEventTypesFromHistory` with exactly the checked rows; optimistic rollback on a rejected save.
- [ ] **Step 2:** Implement client + page. All mutations optimistic-with-rollback; errors to an `aria-live="polite"` region; reorder persists whole-array via `updateEventTypeProfiles` (Move up/down `Menu` items — no dnd).
- [ ] **Step 3:** Delete `actions/event-types.ts`; `git grep` your worktree for any remaining import of it (there must be none).
- [ ] **Step 4:** CapacityUnitsClient section removal + link row + page prop removal; migrate its profile tests.
- [ ] **Step 5:** settings-health computed `configured`; suites green; commit (`feat(settings): first-class Event Types page — adopt, merge, archive, usage counts`).

### Task 5: New Opportunity — id-backed chips + inline create

**Files:**
- Modify: `components/admin/pipeline/NewOpportunityForm.tsx` (`:41-47` props, `:148` state, `:297-306` matching, `:328-337` submit, `:549-577` field block)
- Modify: `components/admin/pipeline/EventTypeChips.tsx`
- Create: `components/admin/pipeline/NewEventTypePopover.tsx`
- Modify: `app/(admin)/[orgSlug]/leads/page.tsx:147-159`, `app/(admin)/[orgSlug]/clients/[customerId]/page.tsx:55-75`, `components/admin/clients/ClientCockpit.tsx:147-157`, `components/admin/pipeline/PipelineListClient.tsx:647-648`, `components/admin/pipeline/PipelineBoardView.tsx:336-337` (prop threading only)
- Test: `__tests__/components/admin/pipeline/new-opportunity-form.test.tsx` (+ `-linked` variant), new popover test

**Interfaces:** Consumes `activeEventTypeProfiles`, `createEventTypeProfile(orgId, input)` from T1. New form props: `eventTypeProfiles?: EventTypeProfile[]` (active, ordered — replaces string-only `eventTypeProfileNames` as the matching source; keep `eventTypeOptions` for chip strings), `canCreateEventTypes?: boolean` (owner/admin, computed in the server pages from the member role they already load). Submit: when the trimmed type name-matches an active profile, include `event_type_id: profile.id` in the create input (T1 made `actions/leads.ts` accept it).

- [ ] **Step 1:** Failing tests: chip pick → create payload carries `event_type_id`; free text matching no profile → no `event_type_id`, hint shown, delivery-mode toggle behavior unchanged (`:306` logic preserved against profiles, not names); `canCreateEventTypes` false → no "+ New type" chip and no hint action.
- [ ] **Step 2:** Implement matching against `eventTypeProfiles` (trim+lowercase, replacing the `profileNames` array walk) and the submit payload.
- [ ] **Step 3:** Failing popover tests: opens prefilled from current free text; toggles prefilled `needsMobile: true`, `needsVenue` = current Where=onsite; Create calls `createEventTypeProfile`, selects the new chip (input value = created name, `event_type_id` resolves), focus returns to the event-type input; Escape closes with focus restored; `motion-reduce` safe.
- [ ] **Step 4:** Implement `NewEventTypePopover` (kit `Dialog` or popover-positioned card — match `components/ui/dialog.tsx` usage elsewhere; toggle pills reuse the AA `aria-pressed` pattern from `CapacityUnitsClient`'s `KindTogglePill`, re-created locally since T4 deletes the original). Wire "+ New type" as the last chip (admins only) and add the hint action "Add as event type" to the existing `typeUnrecognized` hint.
- [ ] **Step 5:** Retarget the 0-profiles onboarding link (`:565-577`) from `/{orgSlug}/capacity` to `/{orgSlug}/event-types`. Thread the new props through all five callers. Suites green; commit (`feat(pipeline): id-backed event-type chips + inline create-in-flow`).

### Task 6: Public intake select + opportunity editors

**Files:**
- Modify: `components/public/IntakeForm.tsx` (`:24`, `:42`, `:90-92`) + its public host page (find it: `git grep -rn "IntakeForm" app/(public)`) to load the org's active profile names
- Create: `components/admin/opportunity/EventTypeSelect.tsx` (shared: `<select>` of active names + "Other…" reveal input)
- Modify: `components/admin/opportunity/FactsGrid.tsx:218-219`, `components/admin/opportunity/OpportunityDetailsForm.tsx:41,67,123-124`
- Test: intake form test file, FactsGrid/details test updates

**Interfaces:** Consumes `activeEventTypeProfiles` (T1). `EventTypeSelect({ profiles, value, onChange })` where `onChange(next: { event_type: string; event_type_id?: string })` — picking a listed option carries the id; "Other…" free text carries none (and clears a previously set id: `event_type_id: undefined` must reach the update so the server clears it — verify `updateLeadCore` unsets on explicit undefined, else send `null` per its existing unset convention; check `FieldValue.delete()` usage in `actions/departments.ts:46` for the idiom).
- Public intake: with ≥1 active type render `<select>` (name strings + "Something else") — "Something else" reveals the current free-text input; with 0 types render today's input unchanged. Submit still sends only the string; the server resolves the id (T1's `actions/intake-public.ts` change). Selects use the native-select styling from `ConvertToWorkCard.tsx` (`:276` classNames) for consistency.

- [ ] **Step 1:** Failing intake tests: options render from passed names; "Something else" reveals input; 0-types renders plain input; submitted payload is the string either way.
- [ ] **Step 2:** Implement intake + host-page data load (public page already loads the org for branding — reuse that read, pass `activeEventTypeNames: string[]`).
- [ ] **Step 3:** Failing editor tests: FactsGrid event-type fact renders `EventTypeSelect`; picking a listed type saves `{event_type, event_type_id}`; "Other…" text saves `{event_type, event_type_id: <unset per idiom>}`.
- [ ] **Step 4:** Implement `EventTypeSelect` + both editor integrations (both hosts must be handed `eventTypeProfiles` — check their server pages and thread the prop; `leads/[leadId]/page.tsx:31` already reads `event_type_profiles`; T3 owns that file's legacy-load lines ONLY (`:15`, `:71`) — coordinate: add your prop threading as new lines, do not touch theirs).
- [ ] **Step 5:** Suites green; commit (`feat(crm): intake + editors consume the event-type list`).

### Task 7: Seeder + roadmap

**Files:**
- Modify: `scripts/seed/brewtrax-data.ts` (org literal `:10-19`, leads `:39-143`)
- Modify: `docs/ROADMAP.md` (new increment entry under the shipped format; leave T2's D3 line alone)
- Test: `__tests__/scripts/` seed test conventions if present

**Interfaces:** Consumes the `EventTypeProfile` shape (T1). Fixed ids for determinism (seed is a pure function of `today`): `et-wedding`, `et-corporate`, `et-private-party`, `et-festival` — 16-hex not required in seed data; ids are opaque strings.

- [ ] **Step 1:** Add to the org literal: `event_type_profiles: [{id:'et-wedding', name:'Wedding', needsMobile:true, needsVenue:true}, {id:'et-corporate', name:'Corporate', needsMobile:true, needsVenue:false}, {id:'et-private-party', name:'Private party', needsMobile:true, needsVenue:false}, {id:'et-festival', name:'Festival', needsMobile:true, needsVenue:false}]`.
- [ ] **Step 2:** Add `event_type_id` to the leads whose `event_type` EXACTLY matches a profile name (`Wedding`:39, `Corporate`:69,:100, `Private party`:79,:90, `Festival`:143). Deliberately leave `Corporate offsite`, `Community event`, `Collaboration`, `Recurring`, `Gala` unadopted — they demo adopt/merge in the walkthrough.
- [ ] **Step 3:** Roadmap entry (concise, matches house format: what shipped, PR TBD placeholder is NOT allowed — write it referencing the branch; the orchestrator fills the PR number at PR time). Commit (`chore(seed): event-type profiles + drift fixture for the walkthrough`).

---

## Wave 3: integration verification (orchestrator + review fleet)

1. Integrate W1 (T1→T2→T3) then W2 (T4→T5→T6→T7) into `feat/event-types-inc1` via `git -C <integration-worktree> merge --no-ff <task-branch>` in order; resolve conflicts per the ownership map (there should be none except declared touch-points).
2. Full `npx vitest run` + `npx next build` in the integration worktree (the build is the gate — tsc alone lies about `'use server'` re-exports).
3. Parallel adversarial review fleet (read-only): (a) correctness/regression vs the touchpoint blast-radius list in the spec; (b) design-ambition §8 hard-gates pass on the three UI surfaces; (c) test-mutation skeptic — apply real mutations (e.g. drop the archived filter; skip the backfill) and confirm the suite catches each.
4. Fix rounds until clean; PR to `main` (gh account: `gh auth switch` to Lifewithmo first); Vercel preview walkthrough at 375/768/desktop before merge.
