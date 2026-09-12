# Events ambition — increment 2 (money truth, one shopping run, the trust loop)

> Successor to `2026-08-19-events-ambition-design.md` (inc 1, PR #122). Inputs: the inc-1
> named deferrals, adversarially re-priced by a 5-scoper fleet against current main
> (740ca86). Register/POS work stays owned by the selling-occasions spec — nothing here
> duplicates it. The dark-mode print pair the sweep found ships separately (PR #126).

## The cut (5 streams, all refuter-priced, zero new indexes, zero npm deps)

### S1 — Market-day money lite + season strip (M) — Mo's headline
The "closeout requires a plan" blocker was one-third mirage: `saveActualsCore` and
`completeCloseoutCore` are already plan-free; only `closeoutSummaryCore` throws and the
page redirects. Build:
1. `computeCloseoutSummary` gains `booth_fee` input + a `fees` output; **booth_fee
   subtracts from BOTH planned and actual margin** (fixed cost known at plan time; POS-spec
   §5 semantics adopted). `closeoutSummaryCore` reads the event doc (client-called action
   has no event in scope); `CloseoutClient` live recompute gets a `boothFee` prop so live
   and saved figures cannot disagree.
2. **Closeout-lite** for plan-less market days: summary branch (no plan → packages=[],
   consumables from actuals only, revenue = sales, fees = booth_fee) + a lite screen at a
   NEW route `[eventSlug]/closeout` (market-day nav key doubles as segment; /ops/closeout
   stays plan-centric + ops-gated): sales $, waste notes, booth-fee line, live net,
   Mark complete. Reuses save/complete cores untouched. Zero schema.
3. `MARKET_DAY_NAV` gains the Closeout row (its comment already reserves it).
4. MarketDayOverview: the apology paragraph dies; a net-money tile renders once a
   closeout doc exists ("Net $141 after the $35 booth fee").
5. **Season strip**: `listSeriesCloseoutsCore` (≤30 direct doc gets, series cap) + money
   column ("sales − fee = net") per day row + season totals header on SeriesClient —
   "is the City Market worth it" answered. (SeriesClient is occasions code: this is the
   sanctioned exception, additive rows/column only, no recompose.)
DEFERRED (owned elsewhere): line-item register (POS spec inc 2 — `OrderChannel 'counter'`
still reserved); drops pre-sold $ (needs POS inc-3's `Drop.pickup.event_id` key; a
date-only join would attribute money that may not be at this booth — refused as dishonest).

### S2 — The shopping run (M) — the Curate marquee, honestly scoped
Client jobs only (market days have no ops layer — v1 pitch is "Saturday wedding +
Monday corporate = one store trip"). Shopping lists only (packing stays per-event; custody
of gear doesn't fan out).
1. `lib/ops/shopping-run.ts` — pure merge selector over N (event, plan) pairs + org
   resources: canonical-unit conversion via existing `convert()` + per-resource bridges,
   same-unit customs sum, no-path items merge per resource_id|unit flagged
   needs_conversion (exact derive.ts parallel). Rows carry canonical totals (vendor-books
   forward-compat — decided now), per-event constituent breakdown, tri-state checked.
   Caption states the sum-of-ceils overstatement honestly.
2. NEW route `/[orgSlug]/shopping-run`: assertOrgMember → windowed fan-out (next 7 days
   default, cap 12, per-read try/catch, per-event ops gating — today.ts pattern), URL-param
   window/event toggles, no persistence (a run doc only becomes necessary for saved runs —
   deferred).
3. **Write-back check-off**: constituent toggles hit the existing `toggleListItem`;
   run-row check-all = one new `bulkSetRunCheckedCore` multi-doc transaction (B2-grade
   visible-failure semantics). The run makes loadout/horizon/brief truthful, not a
   parallel truth.
4. Events-home chip on/under the horizon rail fed from the ALREADY-fetched horizonPlans —
   zero extra reads ("Shopping run: 14 items across 3 jobs").
5. **Shared hook**: extract LoadoutClient's serialized-write machinery into a reusable
   hook consumed by both surfaces — forking it is a named trap.

### S3 — Confirm-ready + the two honest sends (M)
1. `ready_confirmed?: {at, by}` additive on the ops plan (needs_review class precedent) +
   `confirmReadyCore`/action; **staleness contract**: recompute or requirements edit
   CLEARS it (hooks in the existing re-derive paths). Renders: verdict branch
   ("Confirmed ready — 9:14 PM"), runsheet `touch` button by the freshness stamp,
   horizon chip. Tests for the clearing paths.
2. **Guardian who-collected email** (Casey's highest-trust feature): post-transaction
   best-effort send (NEVER inside the retrying transaction — double-send hazard named by
   the scoper), guardian-mode gate + per-event toggle (settings, additive field),
   escapeHtml the free-typed guardian name, content = who/when only (no medical, no
   balance). Resend transactional stack exists (nudge.ts patterns).
3. **Manual "Send run sheet"** (self-send v1): inline content (timeline, contacts,
   load-out status — staff links would hit the auth wall), verified-domain from-address
   pattern, recipient = caller's member email. Dead-zone insurance beyond the open tab.
DEFERRED with reasons: T-12h scheduled send (L — zero cron infra, and **no timezone field
exists anywhere** so T-12h is uncomputable; named for a scheduling increment), staff
fan-out send (M, needs recipient UX).

### S4 — Small items that made the cut (S each)
1. **QR printed-to-live bridge**: vendor a zero-dep MIT byte-mode QR encoder into
   `lib/qr.ts` (decision taken: no npm dep in a deliberately lean tree) → SVG QR on both
   runsheet/print and ops/print next to the plain URL.
2. **B9 forms blockers in the verdict** (Casey): "2 families owe waivers" as a verdict
   blocker row deep-linking /forms — the reads AND composite index already shipped in
   inc 1's check-in work; `summarizeFormCompletion` is pure; families snap already in the
   aggregator. VERDICT ONLY — the horizon variant would quadruple the fan-out's queries
   for a row that already communicates urgency (deferred).
3. **Org-level buffers**: `ops_buffers?: {pack_minutes?, drive_minutes?}` on Org
   (additive), updateOpsBuffers action (capacity-config clone), two inputs on the
   capacity/settings surface, threaded through brief + runsheet anchor labels
   ("assumes 50m pack · 20m drive"); constants remain the fallback. Per-event override:
   deferred (schema + precedence + card UI, M).

### S5 — Hygiene ride-alongs (S)
Proposal/template nested-`<main>` trio (six tag swaps, selector fallout verified absent —
absorbs the open chip) · EventBandGate unit test pinning dashboard/checkin/ops
suppression (mock useSelectedLayoutSegment).

## Re-confirmed rejections / deferrals (named, with reasons)
Stage machine (rejection RE-CONFIRMED — boolean `checked` intent is load-bearing through
the optimistic queue, bulk cores, recompute preservation, progress math; M/L rewrite for
a solo operator who pulls+loads in one motion) · per-item production notes (M — UI cost
outweighs ranked value this round; schema stays trivial when wanted) · weather (no
coordinates on any event record; geocoding strategy is an unmade decision) · FamiliesTable
phone card layout (M + a product decision on what survives at 375px — do NOT ship a
cheap column-squeeze that creates a second, worse mobile idiom next to check-in's) ·
T-12h scheduled send · staff run-sheet fan-out · register/drops money (POS spec's).

## Hard gates carried from inc 1
44px touch targets on day-of actions · tokens only (print surfaces: explicit
white-ground/black-ink per the paper rule) · designed empty/one/many/loading/error ·
optimistic writes have visible failure + retry, custody-grade where applicable · no value
rendered twice per screen · numbers carry interpretation · explicit breakpoints ·
worked budgets at review: Mo's market-day close ≤ 1 screen · 2 inputs · 1 tap; the
shopping run replaces N loadout screens with 1.

## Build decomposition (disjoint)
- T1 (S1): lib/ops/derive.ts + closeout.ts + types (CloseoutSummary fields) +
  ops/closeout/page + CloseoutClient (boothFee prop) + NEW [eventSlug]/closeout/* +
  lib/event-nav.ts + MarketDayOverview tile + SeriesClient money column + new core +
  tests (derive/closeout/CloseoutClient suites constrain).
- T2 (S2): NEW lib/ops/shopping-run.ts (+tests) + NEW app/[orgSlug]/shopping-run/* +
  shared write-hook extraction (LoadoutClient refactor) + bulk core/action +
  events-home chip (org page + rail file coordination with T? — org page belongs to T2;
  horizon rail chip renders from props added there).
- T3 (S3): lib/ops/event-ops.ts (ready_confirmed + clearing hooks) + confirm action +
  event-spine verdict + EventBrief + RunSheetClient button + lib/email.ts additions +
  checkins post-tx send + settings toggle + tests.
- T4 (S4): NEW lib/qr.ts + both print pages + event-spine/EventBrief forms blocker +
  Org ops_buffers + settings inputs + buffer threading (event-ui consts as fallback).
- T5 (S5): proposal-builder/SkeletonPicker/TemplateBuilder tag swaps + EventBandGate test.
File-collision watch: T1 and T3 both touch closeout-adjacent code (T1 owns
derive/closeout/CloseoutClient; T3 must NOT touch them) · T3 and T4 both touch
event-spine/EventBrief (MERGE into one task if the panel confirms the overlap, or split
the files: T3 owns verdict/plan facts, T4 owns... NO — assign event-spine.ts + EventBrief
to T3 alone; T4's forms blocker moves INTO T3's scope; T4 keeps qr/print/buffers).
REVISED: superseded by the BINDING panel resolutions below.

---

## Panel resolutions inc-2 (BINDING — two-grader panel, conditional GO)

**P1 — Decomposition, final (collision-free, verified against the tree):**
- **Wave-0 (orchestrator, all tasks branch from it):** lib/types.ts additive fields in ONE
  commit — `CloseoutSummary.fees`, `OpsPlan.ready_confirmed?: {at, by}`,
  `Event.notify_family_on_pickup?: boolean`, `Org.ops_buffers?: {pack_minutes?,
  drive_minutes?}` — plus lib/event-ui.ts parameterization: `backPlanChips(hhmm,
  buffers?)` (constants default) and new `bufferAssumptionLabel(buffers?)` export, tested.
- **T1 (S1)**: derive/closeout/CloseoutClient + NEW `[eventSlug]/closeout` route with
  **client_job → redirect to /ops/closeout** (the URL resolves kind-agnostically and the
  band would render over it — BLOCK 3) and **owner/admin role guard** on the lite page
  (market-day nav bypasses allowedPages; the ops grant is meaningless there) +
  MARKET_DAY_NAV row (label "Closeout") + MarketDayOverview money tile **with a designed
  PRE-close state**: on/after the event date the tile IS the primary "Close out the day →"
  CTA (no undefined-until-doc-exists states) + season strip (`listSeriesCloseoutsCore`
  lives in lib/ops/closeout.ts — T1's file, NOT occasions) with the counting rule **any
  saved sales counts; Mark-complete optional**, per-day figures routed through the same
  market-day summary branch (POS counter_revenue slots in later), season header carries
  the verdict ("City Market: +$412 net over 4 days · 3 of 4 days positive"). Sequence the
  season strip as T1's LAST commit so money-lite can land alone. BONUS (bounded): if
  Today's agenda already lists market days, today's market day gets an evening "Close out"
  deep-link; if it doesn't list them, skip and note — do not restructure Today.
- **T2 (S2)**: lib/ops/shopping-run.ts + **NEW actions/shopping-run.ts** (the run
  write-core/action live in T2's own files — NOT event-ops, which T3 owns) + /shopping-run
  route + shared write-hook extraction from LoadoutClient (T2 owns LoadoutClient) + a
  run **print variant** (dead-zone + Curate paper-parity ratchet) + org page chip
  (rendered on page.tsx ADJACENT to the rail, not inside it) pinned to the run's 7-day
  default window and counting UNCHECKED shopping items only + **retire the two census
  StatTiles** (Client jobs / Market days — they duplicate the header caption verbatim;
  adding the chip without subtracting fails the no-value-twice gate).
- **T3 (S3+S4-consumption merged, START FIRST, priced L)**: confirm-ready + sends +
  forms blocker + buffers consumption + QR. Owns: lib/ops/event-ops.ts +
  actions/event-ops.ts, lib/event-spine.ts, EventBrief, RunSheetClient, anchor.ts,
  runsheet/print, ops/print (QR), lib/ops/readiness-horizon.ts + ReadinessHorizonRail
  (ok-tone + ranking), lib/email.ts, actions/checkins.ts (post-tx send), event settings
  (toggle), lib/qr.ts (vendored zero-dep encoder).
- **T4 (S4-storage)**: Org.ops_buffers `updateOpsBuffers` action (capacity-config clone)
  + capacity-settings inputs. No other files.
- **T5 (S5)**: proposal trio tag swaps (verified: SkeletonPicker:100/171,
  ProposalBuilderClient:305/385, TemplateBuilderClient:140/179; no selector/test
  coupling) + EventBandGate unit test.

**P2 — Confirm-ready truth contract (BLOCK):** clearing events, exhaustively: (a) ANY
logged requirements change entry (entries.length > 0 — service_start and site_needs
count, not just guests); (b) recomputeOpsListsCore via BOTH callers; (c) event
date/hours edits via an updateEvent hook extension (a moved start time invalidates the
attestation). NOT cleared, documented honestly: package edits (inherits the known
needs_review hole — say so in code) and itinerary edits (v1: attestation microcopy shows
the anchor used, so what was confirmed is recorded). **Verdict precedence:** blockers
arriving after confirmation DEMOTE the confirm to a secondary fact line ("Confirmed 9:14
PM — 2 new blockers since") — never suppress either. The confirm button carries
attestation microcopy of the shown facts ("Load 12/12 · checklists done · anchored
3:00 PM · assumes 50m pack").

**P3 — Guardian email decisions (BLOCK, scoper-adopted):** toggle default ON only for
guardian-mode (child-registration) events, additive `Event.notify_family_on_pickup`;
unlisted_guardian checkouts DO send, with distinct copy; no correction/unsend email —
reply_to is the escalation path, stated in the copy; family batch checkout = ONE email
per family; send is post-transaction best-effort (never inside the retrying
transaction); content = who/when only; no 1:1 communication_log entry v1 (blast-shaped
schema) — stated, not silent.

**P4 — Spine invariant comment** (event-spine.ts's no-collectionGroup note) is amended
in the same commit that adds the forms blocker.

**Deferral list additions (silently-dropped exemplar capabilities, now named):** run
export/CSV for the wholesaler handoff · vendor/multi-supplier grouping + pack-size math
(ops-catalog spec inc 3 — the canonical-totals decision is its forward-compat) · on-hand
inventory netting (no on-hand field exists; run over-states buys for stocked operators —
stated in the caption) · shelf substitution/swap · **Square/external-POS sales import**
(distinct from the counter register; until one ships, Mo types a number Square already
knows) · Mo/Casey balance: this increment is ~7 Mo-items to 2 Casey-items — deliberate
(inc 1's check-in was the Casey headline), stated.
