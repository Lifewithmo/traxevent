# D2 — Rename `Camp` → `Event` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the core bookable unit from `Camp` to `Event` throughout the codebase — Firestore collection, TypeScript types, fields, functions/variables, routes, and Firestore rules — so the data model and code read as a generic event product.

**Architecture:** A broad but mechanical rename, done one **identifier family at a time** so the build stays green after every task. Pre-launch means no data migration — the `camps` collection simply becomes `events` in code and rules; a reseed handles the handful of dev docs. Each task is an atomic global rename of one family, verified by `tsc --noEmit` staying clean and the full Vitest suite (441 tests) passing.

**Tech Stack:** Next.js 16 App Router, TypeScript, Firestore (`firebase-admin`), Vitest.

## Global Constraints

- **This is NOT stock Next.js** — consult `node_modules/next/dist/docs/` before renaming route directories/params (`AGENTS.md`).
- **Pre-launch:** no data migration. Renaming the collection in code + rules is enough.
- **Code only — NOT display copy.** Rename identifiers, the Firestore collection string, field keys, route segments, and rules. Do **NOT** rename user-facing string literals that say "Camp"/"Camper"/"Summer Camp" — those are terminology-skin values owned by later slices (D4/D5). In particular, **do not touch `lib/event-types.ts`** (its `'summer-camp'` built-in with `eventLabel: 'Camp'`, `memberSingular: 'Camper'`, `name: 'Summer Camp'` is display config, renamed in D5). The type system there is already named `EventType`/`getEventType` — leave it.
- **Do NOT rename `event_type_id`, `event_type_terminology`, `EventPerson`, `EventMember`, `EventFormAssignment`** or anything already using "Event" — those are pre-existing and correct.
- **Whole-identifier, case-correct renames only.** Match word boundaries so `Camp` never rewrites a substring of an unrelated word, and keep case (`Camp`→`Event`, `camp`→`event`, `campId`→`eventId`, `camp_id`→`event_id`). Prefer a symbol-aware rename (rename the declaration, let `tsc` surface every usage) over blind global sed for types/functions/variables; use targeted `sed` only for the collection string and snake_case field keys, then let `tsc` + tests catch misses.
- **Green at every task:** after each, `npx tsc --noEmit` is clean AND `npm test` passes (441 tests; no new failures). Update tests in lockstep — a test asserting `collection('camps')` or reading `.camp_start` must move to the new name.
- Work only in the worktree `/Users/rm/vw/traxevent/.claude/worktrees/d2-camp-to-event` on branch `claude/d2-camp-to-event`. Before every commit, confirm `git rev-parse --abbrev-ref HEAD` prints `claude/d2-camp-to-event`; if not, STOP.
- **Historical docs** under `docs/superpowers/plans/` that mention "camp" are history — do not edit them.

---

### Task 1: Rename the Firestore collection `camps` → `events`

**Files:** all call sites using the `camps` collection (across `actions/`, `lib/`, `app/`), plus `firestore.rules`, `firestore.indexes.json`, and any test that asserts the collection name.

**Interfaces:**
- Consumes: nothing from later tasks.
- Produces: the app reads/writes the `events` collection; sub-collection paths under an event are unchanged (only the parent segment renames).

- [ ] **Step 1: Find every collection call site**

```bash
cd /Users/rm/vw/traxevent/.claude/worktrees/d2-camp-to-event
grep -rnE "collection\((['\"])camps\1\)" --include=*.ts --include=*.tsx . | grep -v node_modules
```
Note the count — these all change to `collection('events')` (preserve the original quote style).

- [ ] **Step 2: Rename the collection string at every call site**

Replace `collection('camps')` → `collection('events')` (and the `"camps"` variant if any). Do NOT change sub-collection names (e.g. `collection('members')` under an event doc stays).

- [ ] **Step 3: Update `firestore.rules` and indexes**

In `firestore.rules`, change `match /camps/{campId}` → `match /events/{eventId}` (and update the two comments referencing "camps"/"Camps" at lines ~42, ~73). In `firestore.indexes.json`, rename any `"collectionGroup": "camps"` → `"events"` if present.

- [ ] **Step 4: Update tests that assert the collection name**

```bash
grep -rnE "['\"]camps['\"]" --include=*.ts --include=*.tsx __tests__ | grep -v node_modules
```
Change each to `events`.

- [ ] **Step 5: Verify no `camps` collection string remains**

Run: `grep -rnE "collection\((['\"])camps\1\)|['\"]camps['\"]" --include=*.ts --include=*.tsx . | grep -v node_modules`
Expected: no matches (outside historical docs).

- [ ] **Step 6: Typecheck + full suite**

Run: `npx tsc --noEmit` (clean), then `npm test` (441 pass, no new failures).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(d2): rename Firestore collection camps -> events"
```

---

### Task 2: Rename the types `Camp` / `CampPage` / `CampRegistrationType`

**Files:** `lib/types.ts` (declarations) and every file importing/using these types (~107 `Camp`, ~40 `CampPage`, ~4 `CampRegistrationType` references).

**Interfaces:**
- Consumes: Task 1's collection rename (unrelated, independent).
- Produces: `Event` (was `Camp`), `EventPage` (was `CampPage`), `EventRegistrationType` (was `CampRegistrationType`). All later tasks refer to these names.

- [ ] **Step 1: Rename the declarations in `lib/types.ts`**

Rename `export interface Camp` → `export interface Event`, `export type CampPage` → `export type EventPage`, `export type CampRegistrationType` → `export type EventRegistrationType`. NOTE: a `DOM`/`lib` global named `Event` exists — this is a Firestore model interface in our own module and is referenced by our own imports, so the local name shadows fine; if `tsc` reports an ambiguity at a specific site, qualify via the `@/lib/types` import there.

- [ ] **Step 2: Update every usage across the codebase**

Rename all type references `Camp`→`Event`, `CampPage`→`EventPage`, `CampRegistrationType`→`EventRegistrationType` (imports, annotations, generics like `as Camp`). Use `tsc` to drive completeness (Step 3). Do NOT touch `EventPerson`/`EventMember`/`EventType`/`EventFormAssignment` (already correct).

- [ ] **Step 3: Typecheck to find any missed usage**

Run: `npx tsc --noEmit`
Expected: clean. Any `Cannot find name 'Camp'` points to a missed usage — fix and rerun.

- [ ] **Step 4: Confirm no type identifier remains**

Run: `grep -rnE "\bCamp\b|\bCampPage\b|\bCampRegistrationType\b" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v "lib/event-types.ts"`
Expected: no matches (the `event-types.ts` exclusion is display config, per Global Constraints — verify the only hits, if any, are display strings there, not type identifiers).

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: 441 pass, no new failures.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(d2): rename Camp/CampPage/CampRegistrationType types to Event*"
```

---

### Task 3: Rename the `camp_*` field keys

**Files:** `lib/types.ts` (interface fields) and every read/write of these fields.

Field renames: `camp_start`→`event_start`, `camp_end`→`event_end`, `camp_id`→`event_id`, `camp_slug`→`event_slug`, `camp_name`→`event_name`, `camp_access`→`event_access` (on the type at `lib/types.ts:46`, e.g. `AuthClaims`/`OrgMember`).

**Interfaces:**
- Consumes: the `Event` type from Task 2.
- Produces: the renamed field keys; downstream tasks read them by the new name.

- [ ] **Step 1: Enumerate the field occurrences**

```bash
grep -rnE "camp_start|camp_end|camp_id|camp_slug|camp_name|camp_access" --include=*.ts --include=*.tsx . | grep -v node_modules
```

- [ ] **Step 2: Rename each field key everywhere**

Replace each `camp_<x>` → `event_<x>` in interface definitions, object literals, Firestore `.where('camp_id', …)` / `.set({...})` / property access, and test fixtures. Keep them consistent (a field written as `event_id` must be read as `event_id`).

- [ ] **Step 3: Verify none remain**

Run: `grep -rnE "camp_start|camp_end|camp_id|camp_slug|camp_name|camp_access" --include=*.ts --include=*.tsx . | grep -v node_modules`
Expected: no matches.

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc --noEmit` (clean), then `npm test` (441 pass, no new failures).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(d2): rename camp_* fields to event_*"
```

---

### Task 4: Rename functions and variables (`getCamp`, `campId`, local `camp`)

**Files:** `actions/camps.ts` (→ consider `actions/events.ts`, see Step 5), `lib/`, and all consumers.

Renames: `getCamp`→`getEvent`, `createCamp`→`createEvent`, `updateCamp`→`updateEvent`, `listCamps`→`listEvents`, `campId`→`eventId` (~337), and remaining local variables/params named `camp`→`event`. (Leave `campSlug` and route params for Task 5.)

**Interfaces:**
- Consumes: `Event` type (Task 2), `event_*` fields (Task 3).
- Produces: `getEvent`/`createEvent`/`updateEvent`/`listEvents` and the `eventId` identifier used everywhere.

- [ ] **Step 1: Rename the exported functions and update imports**

Rename `getCamp`→`getEvent`, `createCamp`→`createEvent`, `updateCamp`→`updateEvent`, `listCamps`→`listEvents` at their declarations and every import/call. Let `tsc` drive completeness.

- [ ] **Step 2: Rename `campId` → `eventId`**

Global whole-word rename `campId`→`eventId` across `.ts`/`.tsx` (variables, params, object keys used as JS identifiers). Then remaining local `camp`→`event` variable/param names (case-sensitive, whole word).

- [ ] **Step 3: Typecheck to find misses**

Run: `npx tsc --noEmit`
Expected: clean (a `Cannot find name 'campId'`/`getCamp` means a missed site — fix and rerun).

- [ ] **Step 4: Confirm no function/var identifiers remain**

Run: `grep -rnE "\bgetCamp\b|\bcreateCamp\b|\bupdateCamp\b|\blistCamps\b|\bcampId\b" --include=*.ts --include=*.tsx . | grep -v node_modules`
Expected: no matches.

- [ ] **Step 5: Rename `actions/camps.ts` file (optional but preferred)**

If `actions/camps.ts` exists, `git mv actions/camps.ts actions/events.ts` and update its importers; rerun `npx tsc --noEmit` clean. (Skip only if it introduces churn disproportionate to value — note the decision in the report.)

- [ ] **Step 6: Full suite**

Run: `npm test`
Expected: 441 pass, no new failures.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(d2): rename camp functions/variables to event (getEvent, eventId, ...)"
```

---

### Task 5: Rename the route segments (`[campSlug]` → `[eventSlug]`, `new-camp` → `new-event`)

**Files:** the four route directories, every `params.campSlug` / `campSlug` prop, and internal links/`href`s that hardcode `/new-camp`.

Route dir renames:
- `app/(admin)/[orgSlug]/[campSlug]` → `[eventSlug]`
- `app/(public)/[orgSlug]/[campSlug]` → `[eventSlug]`
- `app/(registrant)/[orgSlug]/[campSlug]` → `[eventSlug]`
- `app/(admin)/[orgSlug]/new-camp` → `new-event`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: the final route shape; the dynamic param key is now `eventSlug`, so all `params.campSlug` reads become `params.eventSlug`.

- [ ] **Step 1: Rename the route directories**

```bash
cd /Users/rm/vw/traxevent/.claude/worktrees/d2-camp-to-event
git mv "app/(admin)/[orgSlug]/[campSlug]" "app/(admin)/[orgSlug]/[eventSlug]"
git mv "app/(public)/[orgSlug]/[campSlug]" "app/(public)/[orgSlug]/[eventSlug]"
git mv "app/(registrant)/[orgSlug]/[campSlug]" "app/(registrant)/[orgSlug]/[eventSlug]"
git mv "app/(admin)/[orgSlug]/new-camp" "app/(admin)/[orgSlug]/new-event"
```

- [ ] **Step 2: Rename the `campSlug` param/prop everywhere**

Because the dir is now `[eventSlug]`, Next.js supplies `params.eventSlug`. Rename `campSlug`→`eventSlug` across all `.ts`/`.tsx` (route `params`, component props, `AdminSidebar` `campSlug` prop, etc.), and change any hardcoded link `/new-camp` → `/new-event`.

- [ ] **Step 3: Typecheck to find misses**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Confirm no route identifiers remain**

Run: `grep -rnE "campSlug|new-camp|\[campSlug\]" --include=*.ts --include=*.tsx . | grep -v node_modules`
Expected: no matches. Then a full sweep: `grep -rniE "\bcamp" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v "lib/event-types.ts"` — expected: only display-string literals (if any) remain, no code identifiers. Report anything questionable.

- [ ] **Step 5: Final typecheck + full suite (D2 acceptance gate)**

Run: `npx tsc --noEmit` (clean), then `npm test` (441 pass, no new failures).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(d2): rename route segments [campSlug]->[eventSlug], new-camp->new-event"
```

---

## Self-Review

**Spec coverage** (against D2 in the neutralization design):
- Rename `collection('camps')` → `events` at all call sites → Task 1 ✅
- `Camp`/`CampPage`/`CampRegistrationType` types → `Event*` → Task 2 ✅
- `camp_*` fields → `event_*` → Task 3 ✅
- `campSlug`/`new-camp` routes → Task 5 ✅
- `firestore.rules` + indexes → Task 1 ✅
- `event_type_id` stays → Global Constraints ✅
- Functions/vars (`getCamp`, `campId`) — not in the one-line design summary but implied by "rename Camp→Event across the code" → Task 4 ✅
- Display copy explicitly excluded (D4/D5) → Global Constraints ✅

**Placeholder scan:** none — each task gives exact identifiers, exact grep/`git mv` commands, and tsc/test gates. The rename passes are specified by identifier + method (symbol-rename vs sed) rather than reproducing thousands of lines, which is correct for a mechanical rename.

**Type consistency:** the family order is dependency-safe — collection string (independent), then types, then fields, then functions/vars (which use the types+fields), then routes (which use everything). Each family is a complete global rename, so no intermediate task leaves a half-renamed symbol; every task's grep-then-tsc confirms completeness before the next.

**Ordering note for the implementer:** never leave a task with `tsc` red or the suite failing — a rename family that can't go green in one task should be reported as BLOCKED, not committed half-done.
