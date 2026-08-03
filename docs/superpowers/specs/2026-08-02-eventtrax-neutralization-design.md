# EventTrax Neutralization — Design (north-star)

**Date:** 2026-08-02
**Status:** approved in brainstorming; governs the D1–D4 implementation plans.
**Goal:** Strip the church/camp identity out of TraxEvent so the product reads as a generic **operating system for booked-job businesses** (the [EventTrax positioning](../../strategy/2026-08-02-eventtrax-positioning-source.md) reframe), at the data-model / route / vocabulary level — not just surface labels.

## Confirmed decisions

| Decision | Choice | Consequence |
|---|---|---|
| **Depth** | **B — deep rename** | Rename data model, Firestore collections, routes/slugs, types, and vocabulary — not labels-only. |
| **Data state** | **Pre-launch** (negligible prod data) | No dual-write/backfill migration. Every slice is a clean mechanical rename + reseed. |
| **Core bookable unit** | **`Camp` → `Event`** | Cascades to `camps` collection, `[campSlug]`/`new-camp` routes, `Camp` type, rules/indexes, ~65 files. Skin may relabel per vertical ("Shoot"/"Gig"/"Party"). |
| **Network / denomination tier** | **Cut entirely** | Delete the network subsystem (~36 files) — the most church-specific concept. |

## Target vocabulary

| Today | Neutral | Notes |
|---|---|---|
| `Camp` | **Event** | core unit; skin-overridable per vertical |
| `Org` | **Business** *(display label only)* | Stays the data-model entity (`orgs` collection, `Org` type) — "Org" is generic SaaS tenancy, not church-specific, so renaming the collection buys no neutralization. Relabeled to "Business" in the UI in D3. |
| `Network` / "denomination" | **— (removed)** | tier cut |
| `Region` | **— (removed)** | part of the network tier |
| `registrant` | **Customer** | the client who books; sourced from the CRM (`/clients`), not self-registration |
| `member` (camper) roster | **— (demoted)** | individual-attendee roster → optional module, off by default (see D3) |
| `family` / `household` | **— (demoted)** | grouping only existed to hold members; moves into the optional roster module |
| — (new) | **Event `headcount`** | a number on the Event — the real need for caterers/coffee-carts ("menu & headcount") |
| — (new) | **Key contacts** | optional 2–3 contacts per event (client, day-of coordinator) — replaces the roster for most verticals |
| `volunteer hours` | **Crew hours** | |
| per-person `assignments` / `check-in manifest` | **— (demoted)** | operate on the roster; move into the optional roster module |
| built-in event-types (`summer-camp`, `vbs`, `retreat`, `mission-trip`, `gala`) | **vertical types** | replaced in D5 |

**Model shift (why the demotion):** TraxEvent's origin is a *registration* model (people self-register for a camp; each camper is tracked individually with forms, assignments, and check-in). The EventTrax booked-job model is a *booking* model (a business is hired by a **client**; there is no self-registered roster — just a headcount and the job). The individual-attendee cluster is registration-model DNA, so the neutral default drops it. **Forms survive** — repurposed as client **questionnaires** (the thread explicitly wants these for photographers), not per-camper forms.

## Approach: 5 ordered, independently-shippable slices

Each slice is its own implementation plan + SDD execution cycle. Ordered so deletion shrinks surface before the rename, the rename settles before the structural demotion, and relabeling comes last on the reduced surface.

### D1 — Cut the network/denomination tier  *(start here)*
Pure deletion + wiring cleanup. Lowest risk, most self-contained; removes ~36 files of surface before D2 renames anything.

**Removes:**
- Actions: `actions/networks.ts`, `network-billing.ts`, `network-portal.ts`, `network-templates.ts`
- Lib: `lib/network-billing.ts`, `lib/network-scope.ts`
- Components: `components/network/`
- Routes: the entire `app/(network)/` group, `app/(auth)/network-onboarding/`, `app/(public)/portal/[networkSlug]/`
- API: `app/api/billing/network-checkout/`, `app/api/billing/network-portal/`
- Types: `Network`, `Region`, `NetworkMember`, `NetworkRole` from `lib/types.ts`; `Org.network_id`, `Org.region_id`
- Billing: network per-seat path + `STRIPE_NETWORK_PRICE_ID` usage; `billing_status: 'network_managed'` enum value
- `firestore.rules` / indexes entries for `networks`/`regions`
- Any nav/guard references (`requireNetworkMember`, network sidebar, tests under `__tests__/actions/network-*`)

**Guard:** the org/event product must build (`tsc --noEmit`) and the full suite pass with the network tests removed, not skipped.

### D2 — Rename `Camp` → `Event`
Mechanical rename across the code + a reseed (no migration, pre-launch).

**Touches:** `collection('camps')` → `collection('events')` at all 46 call sites; `Camp`/`CampPage`/`CampRegistrationType` types → `Event*`; `event_type_id` stays; route dirs `[campSlug]`→`[eventSlug]`, `new-camp`→`new-event`; `campSlug` params/props; `firestore.rules` `camps/{campId}` match and indexes; nav labels. Reseed any dev fixtures.

### D3 — Demote the attendee-roster cluster to an optional module
Structural simplification (the biggest neutralization win). Gate the individual-attendee cluster behind a new optional module — a Phase 6a `ModuleId` (e.g. `attendee-roster`) — **off by default**, and add the booked-job defaults.

**Behind the toggle (off by default):** the member/camper roster (`FamilyMember`), family/household grouping (`Family`, `actions/households.ts`, `actions/admin-families.ts`), per-person assignments (`actions/assignments.ts`), individual check-in / manifest (`actions/checkins.ts`), the public self-registration flow (`app/(public)/…/register`, the `(registrant)` portal), and per-person forms.
**New defaults on every Event:** a `headcount: number` and an optional `Key contacts` list (2–3 contacts: client, day-of coordinator).
**Stays core (not gated):** the CRM Customer, forms repurposed as client **questionnaires**, calendar, communicate, proposals / contracts / invoices, reports.
**Guard:** with the module off, none of the roster nav/routes render and the org still builds + tests pass; with it on, existing camp behavior is intact. Reuses the Phase 6a `resolveEnabledModules` / `AdminSidebar` gating.

### D4 — Neutralize the retained nouns via the skin
Extend `lib/event-types.ts` `Terminology` to cover the gaps it doesn't today (workspace-nav labels, the tenancy label `Org`→**"Business"**, crew copy), then wire the church strings that remain after D3 (`registrant`→**Customer**, `volunteer`→**Crew**) through config with neutral defaults. Label/UI layer only — no schema change (the `orgs` and `events` collections keep their code-level names; only what the user sees changes).

### D5 — Replace built-in event-types
Swap the 5 church types (`summer-camp`, `vbs`, `retreat`, `mission-trip`, `gala`) for vertical types (e.g. catering job, photo shoot, floral event, rental, party) with neutral default terminology, and update `DEFAULT_EVENT_TYPE_ID`. Aligns the built-ins with the Phase 6a industry packs.

## Testing

Each slice ships green: `tsc --noEmit` clean and the full Vitest suite passing (minus deleted tests in D1). Renames are verified by the existing action/component tests continuing to pass against the new names. No new behavior is introduced — these are structural changes — so tests are updated in lockstep, not added net-new (except where a slice removes a code path that had coverage).

## Out of scope (later sub-projects, not D1–D4)

The new vertical *modules* themselves — Catalog/menu, Inventory, Deliverables, Routing, POS (the Phase-6a `ModuleId`s still unimplemented). Neutralization only makes the base read correctly; those modules are separate specs.

## Risks

- **Rename breadth (D2):** 46 collection call sites + 65 files. Mitigate by doing D1 first (less surface) and leaning on `tsc` + the test suite as the safety net after each mechanical pass.
- **Billing coupling (D1):** cutting network billing must not break org/business billing. The network path is separate (`network-checkout`/`network-portal`); verify the standard checkout/portal/webhook routes are untouched.
- **Pre-launch assumption:** if real data appears in `traxevent-prod` before this ships, the D2 rename and the D3/D5 reseeds need a migration rethink. Confirm still-pre-launch at execution time.
