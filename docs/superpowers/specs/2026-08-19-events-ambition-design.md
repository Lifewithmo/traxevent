# Events — design-ambition redo (increment 1: the computed job brief + day-of execution layer)

> Process: design-ambition (external bar). Inputs: 2 lived-experience code walks, 4 market
> researchers (primary sources), 5 adversarial seam refuters. Companion anchor:
> `2026-08-19-events-ambition-anchor.md`.

## Honest ladder placement

- **As-shipped (#95): good (parity).** Kit adoption + structural spine. Gate 2 (genuine
  idea) unmet — the flagship dashboard is an EmptyState stub; the module's own walks show
  the legal pad still wins every day-of moment. Gate 3 unmet — never operator-walked.
- **This increment targets: great, with a category-defining mechanism.** The fused
  compute→execute surface ("one person, one van, one phone") is structurally unclaimed:
  Curate computes pack quantities but outputs desktop paper/CSV; Goodshuffle Pro has the
  best phone pull-sheet but never computes from headcount; Jobber/HCP/ServiceTitan/Zuper
  never compute WHAT to load at all; HoneyBook outsources day-of by design (its own blog
  points at Timeline Genius). Evidence: research findings `white-space`,
  `strongest-mechanism`, `solo-phone-verdict`, `gap:honeybook-no-day-of`.

## The idea (one sentence per role)

**Mo:** the event page stops being a filing cabinet and becomes the *computed brief of a
physical job* — countdown, anchor time, venue, readiness verdict naming the top blocker,
money state, and a load list derived from what he sold — operable one-handed at 6am.
**Casey:** check-in finally meets the line-pressure bar — search, big targets, undo,
custody flags at the moment of action.

## Scope (6 streams, refuter-priced)

### S1 — Dashboard = computed brief (kills the EmptyState stub)
Top-to-bottom (canon: call-sheet fixed hierarchy; Stripe verdict pattern; Jobber
commitments-at-creation):
1. **Job strip**: `T-12d · Sat Aug 29 · Load-in 2:00 PM (or "time TBD" + set-time affordance) · Basque Center [→ Maps]` — from event doc + hours + location.address.
2. **Readiness verdict** (not a bare %): computed judgment + top blockers as actionable
   rows — `Not ready — 3 overdue deadlines · load list unbuilt · deposit unpaid`, each row
   deep-linking. Data: computeReadiness + plan presence + AR (below). No plan → verdict is
   "No ops plan yet" with instantiate CTA.
3. **Money state**: real AR via `event.lead_id → invoices` (fixes the permanently-dead
   Balance tile for roster-less orgs — walk finding `gap`): balance due / next due date /
   deposit state. Roster orgs keep families-financial. EventKpiBand's Balance tile gains
   the same lead-AR fallback.
4. **One next-best-action** (in-house NBA precedent, PR #109): computed from state —
   no plan → "Set up ops plan"; plan+unchecked → "Open load-out (N of M packed)";
   day-of → "Open run sheet"; wrapped → "Close out (margin pending)".
5. **Key contacts** with tel:/mailto (exists on Event, rendered nowhere today).
6. Market-day branch: keep MarketDayOverview (out of scope this increment).

### S2 — Load-out surface, phone-first (`ops/loadout`, under the ops grant)
The category mechanism. One screen: shopping + packing lists grouped by list with
per-group progress + check-all, **44×44px check targets** (new kit Button/row size
`touch`), qty + unit + `needs_conversion` → "check by eye" badge, derivation caption
"Derived from {N} packages × {M} guests · Recompute" (recompute = existing re-derive path;
also shown when Event.headcount ≠ plan guests — divergence warning, refuter finding).
Optimistic check-off with visible failure + retry (no silent revert). Print variant
extends ops/print. **No shortage flags** (REFUTED — no on-hand field exists; urgency =
unchecked × T-minus instead).

### S3 — Run sheet (`ops/runsheet`, under the ops grant) + upstream capture
Call-sheet anatomy (≤15 timeline entries, one anchor time, safety/contact info above the
fold): job strip · contacts (tel:) · site needs · itinerary timeline (grouped, existing
lib) · phase checklists (setup / service-close) with big targets · load-out link + status
· print route. Client component with all data inlined so an open tab survives dead zones;
check-offs optimistic w/ visible failure. **"Offline" is NOT claimed** (refuted; PWA
deferred). **In scope because the run sheet is empty without them** (refuter killer):
- settings client-job branch gains venue name+address fields (updateEvent already accepts
  location; UI-only).
- convert-to-work seeds key_contacts from the lead's contact and carries hours when known.
- spine header subtitle gains the address (with maps link) when present.

### S4 — Readiness horizon rail (org events home)
Windowed (next 14 days / cap 12 events) plan-doc fan-out → `selectReadinessHorizon` pure
selector (capacity-radar precedent): ranked not-ready rows — "Sat · Basque wedding · 3
overdue · load list unbuilt" / **"5d out — no ops plan yet"** (the most valuable row,
refuter-confirmed) — each deep-linking to the blocker. Zero new indexes; costs ≤ Today's
existing per-nav fan-out.

### S5 — Check-in meets the line (Casey)
Sort roster by name server-side (in-memory, data already fetched) + client search box
(2-3 chars → family), family-grouped rows with per-family check-in-all, `touch`-sized
action buttons, **undo snackbar** replacing the silent custody-record flip ("Check in
again" today overwrites checked_in_at wholesale — walk finding `pain:no-undo`),
guardian dialog gains quick-pick (registering parent + emergency contact, one tap;
apply-to-siblings) with free-type fallback, allergy/balance/missing-form flags surfaced
in the row at the moment of action (all three already computed elsewhere; the projection
in actions/checkins.ts strips them — extend the projection, no schema change), KPI band
suppressed on the check-in leaf (fold budget: first roster row currently at ~745px on a
375px phone). Manifest print gains allergy + emergency-contact columns (it is the paper
custody record and omits both today).

### S6 — Live margin closeout (client jobs)
Import pure computeCloseoutSummary client-side; recompute deltas per keystroke (props
plumbing only — the page already fetches packages/resources server-side). Label:
**"consumables + sales only — excludes labor"** (labor rate refuted repo-wide). Planned
vs actual delta chips per figure. Save flow unchanged.

## Explicitly cut / deferred (priced by refuters)
Inventory/on-hand shortage (L + false-alarm risk) · offline mutation queue / PWA (L) ·
market-day register + season strip (no capture path; booth_fee→closeout join never
shipped — own increment) · drop↔market linkage (no join key) · photos at check-in (schema
gap) · multiple authorized pickup adults (M, schema) · package/resource-edit re-derive
fan-out (M, new index; mitigated by Recompute affordance + divergence warning) ·
Zuper-style status machine (post-MVP candidate for increment 2).

## Worked interaction budgets (as-shipped → target)
- **Mo T-1 "ready + what do I load":** 3 screens · 2 taps · 6-8 scrolls · answer never
  assembled → **1 screen (dashboard brief), verdict + blockers at 0 taps, load list at 1
  tap**; ≤7 first-screen items.
- **Casey per family (3 kids):** unordered scan (~30 rows) + 3 taps + 3 blocking waits →
  **2-3 typed chars + 1-2 taps (family check-all), optimistic, undoable**.
- **Mo closeout margin:** visible only after "Save actuals" → **live at 0 extra taps**.

## Hard gates carried
44×44 touch targets on day-of actions (new kit `touch` size) · WCAG AA via existing
tokens · dark mode via tokens · no blank empty states (every n=0 names its next action) ·
keyboard operability (search, dialogs per kit) · print artifacts styled to the same bar ·
optimistic UI with visible failure on every day-of mutation.

## Non-goals
No schema/index changes anywhere (additive doc fields for custody history allowed — same
class as projection extensions). No occasions/market-day recompose. No changes to other
modules beyond: convert-to-work seeding + optional time input (crm), checkins projection
fields (additive), kit Button `touch` sizes (additive variant), Today agenda chip (ratchet).

---

## Panel resolutions (BINDING — supersede anything above on conflict)

Three-grader panel (canon · exemplar/category · feasibility-honesty), all blockers resolved:

**B1 — Dashboard band fate.** The brief REPLACES the EventKpiBand on the dashboard leaf
(and the band is suppressed on the check-in leaf). Mechanism: a small client wrapper in
the layout using `useSelectedLayoutSegment` gates the band per leaf; layout.tsx +
EventKpiBand.tsx belong to T1 alone. No fact renders twice; ≤7 first-screen items on the
brief (job strip · verdict+blockers · money · NBA — contacts fold INTO the job strip as
tel:/maps affordances, not a block).

**B2 — Custody mutation contract (S5).** New server actions, tested: (a) re-check-in
PRESERVES original timestamps (additive history/`first_checked_in_at` fields — never
wholesale-overwrite the prior record); (b) undo (snackbar, ~8s) = delete for a fresh
check-in / restore-prior-snapshot for an overwrite, recorded as a reversal, not a forged
checkout; (c) free-typed guardian name (bypassing quick-pick) is flagged as an exception
in the record (Campix override-with-reason pattern); (d) family checkout-all = one
guardian capture + one explicit confirmation; bulk cores are transactional, never N
serial awaits. Test asserts timestamps survive an undone re-check-in.

**B3 — S5 fold arithmetic.** Besides band suppression: CheckinClient's 3-tile stack
collapses to one inline summary line ("14 in · 3 out · 23 expected"), search input is
sticky at top. Target: first roster row within ~350px of viewport top at 375×667.
Row states: pending → confirmed → failed-with-retry + a persistent failed-writes badge
(custody records get no silent optimism).

**B4 — Money gate (S1 + band).** Money (AR) is **owner/admin only**: threaded as an
explicit `includeMoney` input to `getEventSpineKpis`, computed in the layout from the
already-loaded member doc, independent of the roster-less allowedPages strip (which
killed the naive build). Data: `listInvoicesCore` + `customerAR` via event.lead_id
(guard-free cores verified). Roster orgs keep families-financial for admins. Non-admins:
no money section (not an em-dash — the section is absent).

**B5 — Recompute is a NEW core.** `recomputeOpsListsCore`: unconditional re-derive from
current packages/resources, preserves `checked` by resource_id|unit, visible failure when
a package no longer resolves. The existing update path short-circuits on same-value
writes and must not be relied on. Additionally (Tesler ratchet): `updateEvent` headcount
changes trigger the same re-derive + needs_review transaction (guests-path precedent);
the divergence warning remains only as fallback.

**B6 — S6 feasibility corrected.** The closeout page does NOT fetch packages/resources
today; T6 adds the two existing-shape reads in the page and passes them down. The
client-side compute replicates the deleted-package guard and Number()/NaN coercion.

**B7 — Convert/time honesty.** Lead has no time-of-day field: the "carries hours" clause
is DELETED. Convert seeds key_contacts from Lead name/phone/email and gains an OPTIONAL
start-time input (ConvertToWorkInput + ConvertToWorkCard). Dashboard "set time"
affordance is admin-only (updateEvent asserts admin). Job-strip time label is honest
about its source — precedence: ops service_start ("Service 3:00 PM") → event hours
("Starts 2:00 PM") → first itinerary item ("First item 1:30 PM") → "time TBD + set".

**B8 — Contacts for roster orgs.** key_contacts editing splits OUT of the
`!attendee-roster` settings gate (all client jobs can edit contacts; T3, one gate
change). n=0 renders "+ Add contact" → settings.

**B9 — Verdict/NBA roles.** NBA = the verdict's top blocker promoted to THE single
primary button (never two competing next-things). Top blocker names the concrete item
("Order ice — 2d overdue"), not a count. Roster orgs' verdict v1 composes ops plan +
registration-pending (already in the aggregator) + AR; forms-completion blockers in the
verdict are increment-2 (priced: new reads). Wrapped-state NBA needs the closeout doc
presence — one existing-shape doc get, added to the aggregator's data list.

**Accepted ratchets:** Today AgendaRail pins the next job first with a readiness/packed
chip (today+7 plan fan-out, refuter-priced; NO second radar on Today) · freshness stamp
("Loaded 9:14 PM") + pending/failed count on run sheet AND load-out · back-planned
"Pack by / Leave by" chips from load-in minus fixed default buffers, labeled as
assumptions ("assumes 45m pack · 30m drive"), zero storage, configurable buffers named
increment-2 · guardian dialog keyboard-safe (top-anchored/bottom-sheet + enterKeyHint,
no instant autoFocus keyboard pop) · S4 carries the horizon caveats verbatim (stale
deadlines after reschedule = pre-existing, noted not fixed; change_log bandwidth
accepted; org home switches to requireOrgMember for row gating) · S5 missing-form flag
requires named NEW reads (form assignments + signed keys) inside the checkin action —
permission consequence accepted and stated.

**Named deferrals (the next increment, not "someday"):** item stage machine
(Pulled→Packed→Loaded — consciously rejected for a solo operator who pulls and loads in
one motion), Curate-style multi-event shopping aggregation, per-item production notes
(schema), T-12h distribute-and-confirm loop, guardian who-collected notification, weather
in the job strip, QR printed-to-live bridge (needs a QR dependency decision; print
variants carry the plain URL meanwhile), configurable time buffers, roster-org forms
blockers in verdict/horizon, market-day money end-to-end.

**Build decomposition (disjoint files):**
- **T0 (substrate, lands first):** components/ui/button.tsx `touch`/`icon-touch` sizes.
- **T1:** dashboard/page.tsx · components/admin/events/EventBrief*.tsx (new) ·
  lib/event-spine.ts (+test) · EventKpiBand.tsx · layout.tsx (+ leaf-gate wrapper, new).
- **T2:** ops/loadout/* (new) · LoadoutClient (new) · lib/ops/event-ops.ts (recompute +
  bulk cores, +tests) · actions/event-ops.ts · actions/events.ts (headcount hook) ·
  ops/print/page.tsx · ListsCard.tsx/OpsPlanClient.tsx (entry link).
- **T3:** ops/runsheet/* + print (new) · RunSheetClient (new) · settings/page.tsx
  (location fields, contacts gate split) · EventSpineHeader.tsx (address/maps) ·
  lib/crm/convert.ts + ConvertToWorkCard (+ wrapper). MUST NOT touch T2's files.
- **T4:** org page.tsx · lib/ops/readiness-horizon.ts (new, +test) ·
  ReadinessHorizonRail.tsx (new).
- **T5:** CheckinClient.tsx · actions/checkins.ts (projection + undo/bulk cores + form
  reads, +tests) · checkin/page.tsx · checkin/manifest/page.tsx.
- **T6:** ops/closeout/page.tsx · CloseoutClient.tsx (· lib/ops/closeout.ts only if the
  input-return refactor is chosen — default is page-level reads).
- **T7:** actions/today.ts · lib/today.ts · components/admin/today/AgendaRail.tsx.

Blow-up watch: T1 (permission gate + 6 data sources + NBA machine) and T5's undo
semantics — both get the most senior review attention.
