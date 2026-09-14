# Event Types as a first-class org setting — design (Inc 1)

**Status:** Design approved-pending-review · 2026-09-14
**Process:** design-ambition (external bar), four-agent parallel research (data model,
touchpoint blast radius, repo history/standards, market + canon), decisions (a)/(b)
taken by Ryan 2026-09-14.

## 0. The one-sentence job

> As the owner-operator, I define the kinds of jobs my business takes **once**, so
> every inquiry — mine or the public form's — lands pre-classified with the right
> capacity policy attached, and renaming or retiring a type never lies about history.

Roles: **org admin** (configures, rarely), **booking operator** (uses the picker on
every New Opportunity — often the same person), **public inquirer** (must never face
a blank box, a stale option, or a way to pollute the org's taxonomy).

## 1. Why now (the unification problem)

Three things are currently called "event type":

| Concept | Where | Status |
|---|---|---|
| `Lead.event_type` | free-text string on every opportunity | the real taxonomy, unmanaged |
| `Org.event_type_profiles` | `{name, needsMobile, needsVenue}[]`, name-matched, edited in a section of `/capacity` | the real **policy**, buried + fragile |
| Legacy registry | `/event-types` page, `lib/event-types.ts` built-ins + `orgs/*/event_types` custom docs, `Event.event_type_id` | terminology-era machinery; **decision (a): retire the surface** |

The name-keyed join (`lib/capacity/requirement.ts:41`) is the single riskiest line in
the product: renaming "Wedding" → "Weddings" today silently reverts every historical
wedding to the default capacity rule — changing day-demand counts, clash ownership,
pipeline conflict sort, the forecast's **dollar** headroom, click-to-assign targets,
and the server win-guard copy — while the create form starts scolding the operator
about their own history. The public intake form is a bare text input that mints new
free-text tokens forever (seeded demo already has `Corporate` vs `Corporate offsite`).
At convert-to-work the free-text type is dropped on the floor and the operator
re-picks from the unrelated legacy id list.

**The bolt-on trap (blocks merge):** a standalone name-list CRUD page that leaves
profiles, intake, and convert untouched is a *fourth* taxonomy and a regression.
This increment is a unification, or it is nothing.

## 2. Market bar + canon cross-validation

Parity exemplars (primary-source audited 2026-09-14): **HoneyBook** project types
(settings-managed, default type, per-type automations, on lead forms), **Tripleseat**
(reorder, reassign-on-delete, per-type revenue forecasting), **Tave** (richest
per-type payload bundle), **17hats** (merge with visible usage counts — best
destructive-action design in class). Anti-patterns to beat by name: **Planning Pod**
documents that deleting a type strips it from all historical events; **Perfect
Venue** can't filter by type and its own feature board shows users voting for
per-type policies.

| Pattern | Canonical principle | Verdict |
|---|---|---|
| Settings-managed picklist feeding every picker (HoneyBook, Tripleseat) | recognition over recall; consistency | **Bedrock — adopt** |
| Reference by id; rename propagates (Notion options, Salesforce) | error prevention; single source of truth | **Bedrock — adopt** |
| Archive-not-delete once referenced (Salesforce deactivate, Stripe archive, Linear labels) | user control; data integrity | **Bedrock — adopt** (decision "archive if used" confirmed) |
| Hard delete only for never-used values (Stripe, QBO) | error prevention | **Bedrock — adopt** |
| Merge with usage count in the dialog (17hats, Linear) | visibility of system status | **Bedrock — adopt** |
| Free text with chip suggestions (current TraxEvent) | flexibility for experts | **Reconciled tension** — right for the migration-free capacity overlay; indefensible now that money math keys off the string. Free text *stays allowed* (never block a create), but the reference model becomes primary |
| HoneyBook's 17-type cap; Planning Pod destructive delete | traces to no principle | **Fashion/defect — reject** |

**Category-defining pair** (no vertical has either): (1) the type is a **live
bookability policy** — the verdict at the date field, the win-guard, the forecast
already key off it; (2) **the taxonomy is grown from your own history** — first-run
adopt-and-merge from actual lead strings with usage counts, instead of a blank list.

## 3. Data model (additive, house style)

```ts
// lib/types.ts — Org: extend the EXISTING array in place. No new collection
// (the obvious name orgs/{id}/event_types is occupied by legacy docs).
event_type_profiles?: Array<{
  id?: string            // NEW — stable 16-hex id (randomBytes(8)); legacy entries
                         //        get ids lazily on the next settings save
  name: string
  needsMobile: boolean
  needsVenue: boolean
  archived?: boolean     // NEW — hidden from all pickers; history + policy intact
}>
// Array order = display order (chips + settings list).

// lib/types.ts — Lead: new optional reference
event_type_id?: string   // references event_type_profiles[].id
```

**Matching (`leadRequirement`), in order:** ① `lead.event_type_id` → profile by id
(archived included — history keeps its policy); ② name match, today's exact
trim+lowercase semantics (archived included); ③ default rule. The no-profiles
byte-for-byte backstop is preserved untouched.

**Migration: none.** Old entries without `id`/`archived` behave exactly as today;
leads without `event_type_id` fall through to ②. `updateEventTypeProfiles` keeps its
whole-array-replace contract, now assigning missing ids and preserving unknown-field
hygiene as it does today.

## 4. Lifecycle semantics (the heart of the increment)

- **Rename** — updates the entry, then **back-fills**: every lead with
  `event_type_id === id`, OR with no `event_type_id` and a name-matching
  `event_type`, gets `{event_type_id: id, event_type: newName}` (batched
  server-side, like the departments-delete cleanup). Rename now propagates to all
  history and every engine. Already-emitted artifacts (sent emails, portal
  snapshots) keep the string they were sent with — they are records.
- **Archive** — `archived: true`. Excluded from: New Opportunity chips, the intake
  dropdown, the opportunity editors' pickers, and `buildEventTypeOptions`' historical
  side (an archived name must not resurface as a frequency chip). Still matched by
  `leadRequirement`, so booked history keeps its capacity policy. Restorable.
- **Merge A into B** — all leads referencing A (by id or unadopted name match) get
  `{event_type_id: B.id, event_type: B.name}`; A is removed. `ConfirmDialog`
  (destructive) shows the count: *"Merge 'Corporate offsite' into 'Corporate'? 3
  opportunities will be reclassified."* Irreversible.
- **Delete** — allowed only at **server-verified zero usage**; otherwise the dialog
  offers Archive or Merge instead. (Stripe/QBO rule.)
- **Usage counts** — computed server-side per page load from the org's leads
  (in-memory count, matching the house filtering style), shown on each row and in
  every destructive dialog.

## 5. Surfaces

### 5a. Settings → Event types (`/[orgSlug]/event-types`, replacing the legacy page)

Follows the `CapacityUnitsClient` idiom + kit: `max-w-2xl` shell, section header
with count, `Card size="sm"` rows — inline-editable name (Enter/Escape semantics),
two `aria-pressed` policy toggles labeled with the operator's own `kindLabel` words
("needs a cart", "needs a room"), usage count ("12 jobs"), `StatusPill` "Archived"
tone-muted, overflow `Menu`: Archive/Restore · Merge into… · Delete (enabled only at
zero usage) · Move up/down (keyboard-accessible reorder; no dnd dependency). Add
form at the section header. Persistent hint bar: unlisted types use the default
rule. Optimistic save with rollback; `aria-live` errors.

**Empty state = onboarding (never blank):** with 0 profiles and existing leads,
render **adopt-from-history**: distinct `lead.event_type` values grouped
case-insensitively with counts, pre-checked, policy prefilled by inference
(`needsMobile: true`; `needsVenue` prechecked when the majority of that type's
leads are `onsite`) → one action creates the types **and back-fills ids** onto the
matching leads. With no leads at all: `EmptyState` with "Add your first event type".

Consolidation elsewhere (one source of truth): the profiles section is **removed
from `CapacityUnitsClient`**, replaced by a one-line link ("Event types moved —
manage them in Settings → Event types"); `buildSettingsAreas`' `event-types` entry
becomes honestly computed (`configured := ≥1 profile`); the New Opportunity
0-profiles hint retargets `/capacity` → `/event-types`.

### 5b. New Opportunity — decision (b): never leave the flow

Chips stay (n:few) but become id-backed: picking a chip sets `event_type_id` +
`event_type`. A **"+ New type"** affordance at the end of the chip row (org
admins/owners only) opens a popover: name (prefilled from the current free text when
unrecognized), the two policy toggles in `kindLabel` words (prefilled
`needsMobile: true`, `needsVenue` from the current Where state) → Create appends to
the org array, selects the chip, focus returns to the flow. The existing
"Not a configured event type" hint gains the same one-click **"Add as event type"**
action for admins. Free text remains allowed and never blocks (standing decision).

### 5c. Public intake — the open tap, closed

With ≥1 active type: a `<select>` of active type names + **"Something else"**, which
reveals a short free-text input (never lose a lead to taxonomy). A listed pick
writes `event_type_id` + the string; "Something else" writes the string only and
surfaces later in adopt/merge. With 0 types: today's free-text input stands. **No
public inline-create** — anonymous visitors must not mint taxonomy entries.

### 5d. Opportunity editors

`FactsGrid`'s Event type fact and `OpportunityDetailsForm` switch to the same
picker: select of active types + "Other…" revealing free text. Editing through the
picker sets/clears `event_type_id` coherently (free text clears it).

### 5e. Convert-to-work + legacy retirement — decision (a)

Retired: `/event-types` legacy page + `EventTypesClient`, `actions/event-types.ts`
(list/create/delete custom), the Event type `<select>` on `ConvertToWorkCard`, on
`new-event`, and on event settings (killing the known silent-reassignment defect
where a deleted id snapped events back to "General Event" and changed their
registration unit). Events are created with `DEFAULT_EVENT_TYPE_ID` internally; the
Kind select (client job / market day) is untouched. **Kept as internal machinery:**
`resolveTerminology`, the five built-in vertical skins, and stored custom-type
terminology snapshots on existing events (registration-era surfaces still consume
them). The orphaned `orgs/*/event_types` legacy docs are inert; data cleanup is
deferred. `IndustryPack.eventTypeId` (zero readers) is deleted.

## 6. Seeder + demo

Seed 4 profiles with ids for demo-brewtrax (Wedding, Corporate, Private party,
Festival), back-fill `event_type_id` on exactly-matching leads, and deliberately
leave `Corporate offsite`, `Collaboration`, etc. unadopted — the walkthrough demos
adopt-from-history and merge on real drift.

## 7. Scope boundaries

**In:** everything above, plus tests (id-first matching incl. archived; options
builder excluding archived; rename back-fill; merge; zero-usage delete guard; adopt
inference; intake select; inline-create popover; settings client) and `next build`.

**Out (Inc 2 queue):** per-type **lead times** (the Book-By radar deferral — the
natural next payload on the type entity); pipeline filter/group by type; per-type
reporting cohorts + estimated-value prefill with basis (the New Opportunity Inc-2
seed, now unblocked by de-fragmented types); default type; per-type colors/icons;
Tave-style per-type convert defaults; per-type intake questions; fuzzy merge
suggestions; full terminology-system removal + legacy subcollection data cleanup;
multi-select bulk actions (the list is n:few 3–10 — the bulk gate targets n:many
regimes, and Merge is the real consolidation verb here).

## 8. Hard gates (block merge)

WCAG 2.2 AA on all new controls (reuse the AA status-token toggle pattern); dark
mode; `prefers-reduced-motion`; optimistic UI with rollback, <100ms feedback; no
blank empty state (adopt-from-history *is* the empty state); full keyboard
operability (menus, popover focus trap + return); touch targets ≥24px; the intake
form change holds the same craft bar as the in-app screen (it is client-facing).
Verification: unit + component tests, `next build`, then the authenticated
walkthrough on the Vercel preview at 375 / 768 / desktop (local dev mis-resolves
new files in worktrees — Turbopack stray-lockfile gotcha).

## 9. Interaction-cost receipts (worked examples)

- Classify an inquiry (highest-frequency): 1 chip click — unchanged.
- Fix vocabulary drift: today N hand-edits across leads (effectively never done) →
  one merge dialog, 3 clicks, count shown.
- Add a missing type mid-create: today = leave the form → capacity page → scroll to
  section → add → navigate back → re-enter everything (~30+ interactions, form state
  lost) → **popover in place, ~6 interactions, zero navigation** (decision b).

## 10. Ambition ladder location

CRUD + dropdown + archive alone = **good** (HoneyBook/Tripleseat parity). With
id-referenced rename propagation, merge-with-counts, adopt-from-history, and the
policy-anchored type driving live bookability = **great**, with the
category-defining pair named in §2. Honest gap remaining after Inc 1: no surface
*consumes* the taxonomy for filtering/reporting yet — that is Inc 2's job, not a
reason to inflate this one.
