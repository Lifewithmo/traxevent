# Pipeline Capacity — Finish (resource-capacity increment 4, final) — Design Spec

**Status:** approved in brainstorm 2026-08-19, pending spec review.

> The final increment of the resource-capacity track (on #117 Inc 1, #119 Inc 2, #124 Inc 3). Four pieces: **per-event-type resource profiles** (relax the fixed cart+room rule — the horizontality win), a **server-side capacity guard** (enforce the advisory warn, with override), **auto-suggest a free unit**, and **click-to-assign from the schedule**.

## Goal

Let event types declare which kinds they consume (0/1 each), enforce the capacity/clash warn server-side so it can't be silently bypassed, and cut assignment friction (suggest a free unit; assign straight from the schedule).

## Architecture (2–3 sentences)

Additive over Inc 1–3. One keystone — a pure `leadRequirement(lead, org) → { mobile, venue }` that every capacity-mode engine already scattered across `lib/capacity/` now routes through, defaulting to today's rule so absent profiles ⇒ byte-for-byte current behavior. On top: an org `event_type_profiles` scalar + settings editor, a server guard in `setLeadStage` (with `override`), an auto-suggest affordance in the assignment picker, and click-to-assign on the Inc-3 schedule's Unassigned lane. Base/solo + unprofiled orgs are unchanged.

## Tech Stack

Next.js 16 App Router (RSC + server actions), Firestore admin SDK, React 19, vitest. All requirement/capacity math is pure/in-memory over leads + units already loaded.

## Global Constraints

- **Additive & migration-free.** `event_type_profiles` optional; absent ⇒ `leadRequirement` returns the default `{ mobile: true, venue: delivery_mode === 'onsite' }` — exactly today's capacity-mode rule. **Backstop, non-negotiable:** with no profiles, every Inc-1/2/3 engine produces byte-for-byte its current output (all shipped tests pass unchanged).
- **Profiles are capacity-mode only.** They feed the business-tier engines (`computeCapacity`, clashes, forecast, schedule). The base/solo `conflictEventDates` path (no units) is UNTOUCHED — profiles never change it.
- **Guard is advisory-with-override, not an absolute block.** The deliberate "a real 'yes, book both' stays reachable" rule (Inc 2) holds; the server rejects a clashing/over `closed_won` move only when `override` is not passed.
- **0/1 per kind.** A profile sets `needsMobile`/`needsVenue` booleans — never a count >1 (multi-unit-per-event is explicitly out, would be a separate increment).
- **Never force assignment.** Auto-suggest and schedule-assign are one-click helpers; Unassigned stays a valid state.
- Bookable = `OPEN_STAGES ∪ {'closed_won'}`. `next build` passes; pure logic unit-tested with real assertions.

## The keystone: `leadRequirement`

```ts
// lib/capacity/requirement.ts
export interface LeadRequirement { mobile: boolean; venue: boolean }
export function leadRequirement(
  lead: Pick<Lead, 'event_type' | 'delivery_mode'>,
  org: Pick<Org, 'event_type_profiles'>,
): LeadRequirement
  // 1. trimmed, case-insensitive match of lead.event_type against a profile name →
  //    { mobile: profile.needsMobile, venue: profile.needsVenue }  (profile authoritative)
  // 2. no match / no profiles / no event_type → { mobile: true, venue: lead.delivery_mode === 'onsite' }
```

**Every capacity-mode consumer routes through this**, replacing the scattered inline rules:
- `lib/capacity/capacity.ts` `computeCapacity`: `mobileDemand` = count bookable-on-date with `requirement.mobile`; `venueDemand` = count with `requirement.venue` (was: all bookable / `delivery_mode==='onsite'`).
- `lib/capacity/capacity.ts` `computeClashes`: a lead consumes its `assigned_units.mobile` only if `requirement.mobile`; its `assigned_units.venue` only if `requirement.venue` (was: mobile always / venue if onsite).
- `lib/capacity/schedule.ts` `consumes`: same — a unit is consumed only if the lead's `requirement[kind]` is true (was: venue gated on `delivery_mode==='onsite'`).
- `lib/capacity/forecast.ts`: `cart.booked` counts leads needing mobile; `room.booked` counts leads needing venue.

## Data model

```ts
// interface Org (lib/types.ts)
event_type_profiles?: Array<{ name: string; needsMobile: boolean; needsVenue: boolean }>
```
Managed in Settings → Resources & capacity. Name matched (trimmed, case-insensitive) against `lead.event_type` (free text — unchanged; profiles are an optional overlay, not a picklist migration).

## The four pieces

### 1. Event-type profiles (data + settings)
New `Org.event_type_profiles` (above). Settings block on the Resources & capacity page (`CapacityUnitsClient` host): a list of `{ name, needsMobile, needsVenue }` rows — name input + two toggles (uses the operator's `kindLabel` words) + add/remove. Action `updateEventTypeProfiles` (admin-guarded, mirrors `updateServiceableDays`). A hint row: "Event types not listed here use the default — a {mobileLabel} always, a {venueLabel} when on-site."

### 2. Server capacity guard (with override)
`actions/leads.ts` `setLeadStage(orgId, leadId, stage, opts?: { override?: boolean })`: only on a transition **into** `closed_won` (from a non-won stage), AND `hasMultiResourceCapacity(org)` with ≥1 unit, AND not `opts.override`: load leads+units and, if winning this lead makes its date over capacity OR its assigned unit clash (reuse `computeCapacity`/`computeClashes` — broader + more accurate than Inc-2's same-date check), `throw` a typed `CapacityGuardError` whose message names the conflict.

**This supersedes the Inc-2 client-side pre-confirm** (`handleStageChange`'s `window.confirm`): the client DROPS its own same-date check and instead just calls `setLeadStage`, catches `CapacityGuardError`, shows the confirm copy (from the error message), and on confirm re-calls with `{ override: true }`. One guard, server-authoritative — no silent double-book from any non-UI path, and no double-confirm. Applies in all three callers (`PipelineListClient`, `PipelineBoardView`, `OpportunityDetailClient`).

### 3. Auto-suggest a free unit (assignment picker)
`UnitAssignmentControl` (opportunity detail): when a kind is Unassigned and a free unit exists on the lead's date (from the `annotations` already loaded), show a one-click **"Use a free {kindLabel}"** that assigns the first free unit; still fully optional (Unassigned remains, any unit still pickable). No new query.

### 4. Click-to-assign from the schedule
The Inc-3 schedule's **Unassigned lane** (`CapacityOutlookClient`): each unassigned booking becomes a control — click → a small unit picker (or "assign a free unit") → `updateLead({ assigned_units })`, optimistic. **Click-to-assign, not drag** (keyboard/mobile-safe). The rest of the schedule stays read-only.

## Edge cases & error handling

- **No profiles:** `leadRequirement` → default; all engines behave exactly as Inc 1–3 (backstop, regression-pinned).
- **Profile name collision / dupes:** last-wins on match; the editor trims + dedupes by case-insensitive name on save.
- **A `{needsMobile:false, needsVenue:false}` type** (photo): consumes nothing — no cart/room demand, never clashes, no schedule cell booked (falls off all lanes; not in the Unassigned lane either, since it needs no unit). Documented.
- **Profile vs `delivery_mode`:** a matched profile is authoritative for capacity (its `needsVenue` wins over `delivery_mode`); the delivery toggle stays for unprofiled leads. Documented in the settings hint.
- **Guard override:** a declined confirm aborts with no write (as today); `override:true` proceeds. The guard fires only on a transition INTO `closed_won` (not on other stage moves, and not on a lead already won).
- **Auto-suggest with no free unit:** the affordance is hidden (nothing to suggest).

## Testing

- **`requirement.test.ts`:** default rule (mobile true, venue = onsite) with no profiles; a matched profile overrides both kinds (case-insensitive, trimmed); unmatched event_type → default; absent event_type → default.
- **Engine regression pins (`capacity`/`forecast`/`schedule` tests):** with NO profiles, `computeCapacity`/`computeClashes`/`forecastByMonth`/`buildSchedule` outputs are unchanged from Inc 1–3 (assert against the existing expected values). With a `{needsMobile:false}` profile, that lead drops from mobile demand/clash/booked; with `{needsVenue:true}` it counts a room regardless of delivery_mode.
- **`setLeadStage` guard:** a `closed_won` move onto an over/clashing date throws `CapacityGuardError` without `override`; succeeds with `override:true`; a non-business/unit-less org never guards; a non-clashing move is unaffected.
- **Component tests:** the event-type-profile editor adds/toggles/removes rows via the action; the assignment picker's "use a free unit" assigns the first free one and hides when none free; the schedule Unassigned booking's click-to-assign calls `updateLead`; the guard confirm re-calls with `override`.
- **Walkthrough:** on the seeded business demo, add a "Photo package" profile (cart✗ room✗) → confirm a photo lead drops out of the forecast/schedule; try to double-book a won date → the server guard's confirm appears and override works; auto-suggest + schedule-assign a unit. Desktop/tablet/mobile.

## Rollout / migration

**None.** All fields optional; profiles absent ⇒ current behavior; the guard only engages for business-tier + units on `closed_won`. Ships dark.

## Scope boundaries

**In (Inc 4, final):** `leadRequirement` keystone + engine rewire (backstop-pinned); `event_type_profiles` + settings editor; server capacity guard with override; auto-suggest a free unit; click-to-assign from the schedule Unassigned lane.

**Out (a genuinely separate future effort, not this track):** multi-unit-per-event (2+ carts — `assigned_units` arrays + engine rebuild); drag-and-drop scheduling; turning free-text `event_type` into a structured picklist; per-org `daily_event_capacity` abstractions beyond per-unit.

## Self-review notes (resolved)

- Profiles are 0/1 per kind (per brainstorm) — no multi-unit; that's explicitly a separate future increment.
- The keystone helper + backstop keep Inc 1–3 byte-for-byte when no profiles exist.
- Guard is advisory-with-override (honors the Inc-2 "book both must stay reachable" rule), not an absolute block.
- Schedule assignment is click-to-assign, not drag (a11y/mobile).
