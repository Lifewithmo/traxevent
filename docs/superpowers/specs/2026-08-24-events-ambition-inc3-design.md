# Events ambition — increment 3 (the scheduling substrate + money with fewer keystrokes)

> Successor to inc 2 (#128). Inputs: 5-scoper adversarial pricing of the inc-2 queue
> (Square/API research from primary sources; repo seams file:line-verified). Sequencing:
> **branch AFTER PR #127 (calendar) merges** — its `moveBookedJob` adds a second event
> date/time write path that must clear `ready_confirmed` (coordination note posted on the
> PR), and it touches shared files (types/globals/dialog). The Stripe-Connect OAuth
> security gaps found during scoping ship as their own hotfix PR ahead of this increment.

## The cut (refuter-priced)

### S1 — The scheduling substrate (the spine; honestly named)
The killer reframe: renaming "T-12h send" to **"evening-before at 18:00 org-local"**
deletes every hard part the deferral was priced on (no per-event anchor math, no
minute-level scheduling — one hourly tick + a local-hour compare).
1. **Org timezone field** (additive `Org.timezone?: string` IANA; settings input with
   browser-default suggestion — the Drop editor already captures browser tz as the
   precedent). Standalone value even if cron slips: retrofit the three surfaces carrying
   "no tz field exists" apology comments — the guardian-email stamp, the confirm-ready
   stamp, and print freshness lines render org-local with the zone abbreviated instead
   of "21:42 UTC" (Casey's trust surface, fixed in an afternoon).
2. **Cron infra**: `vercel.json` crons block ONLY (vercel.ts refuted for crons against
   current docs — do not create it), hourly tick, `app/api/cron/route.ts` guarded by
   `CRON_SECRET` (explicitly REJECT when the env var is unset — compare-to-undefined
   must fail closed), idempotency stamps on every consumer. Vercel cron is always UTC —
   the org tz field is what makes "18:00 local" computable.
3. **First consumer — evening-before run-sheet send**: for each org where local hour is
   in the **18:00–21:00 catch-up window** (missed ticks are documented Vercel behavior;
   hour-equality would be wall-clock trust), events starting tomorrow (org-local) with
   an ops plan get the inc-2 inline run-sheet email to the owner — idempotent via
   **`plan.evening_sent_for = event_start`** (date-stamped, so a rescheduled event
   self-heals with zero clearing hooks in updateEvent OR #127's moveBookedJob); reuses
   the send-run-sheet renderer; org-level opt-out toggle beside the buffers settings. Named-not-built consumers queued behind the substrate: invoice-overdue
   timeline sweep (client-cockpit spec explicitly blocks on "a cron sweep"), dormant
   re-book / book-by digests.

### S2 — Square sales, tier (a): CSV → closeout prefill (S/M)
Zero OAuth, zero schema, zero deps: a file input on MarketDayCloseoutClient parses a
Square Sales-Summary/Transactions CSV (zero-dep parser + pure helper, tested), filters
to the event date, prefills the existing `sales` field through the untouched save path.
Column decision: "Total Collected" (gross — matches what Mo reconciles against his cash
box; label says which). Honest framing in the UI copy: this kills the typo, not the
dashboard trip. **Tier (b) Square OAuth is inc-4, prerequisites now named**: the OAuth
security hotfix (in flight), server-only token storage (Square tokens are secrets; the
org doc is client-readable — needs a rules-protected subcollection), and the tz field
(this increment) which dissolves its day-boundary blocker. Tier (c) auto-sync: killed
until webhooks/scheduler earn their own increment. Register composition pinned:
imported sales land in `OpsActuals.sales`; the future register's `counter_revenue` is a
SEPARATE field (POS spec) — the closeout-lite screen must label imported vs typed the
same way so the double-count hazard stays visible.

### S3 — Small items that made the cut
1. **Per-event buffer overrides** (S+): optional pack/drive minutes on OpsRequirements
   (drive time is inherently per-venue — the org default is structurally wrong for
   exactly the number that varies per job); RequirementsCard inputs; precedence
   event → org → constants via one resolve site; editing them is a logged requirements
   change (attestation-clear correctness free via inc-2's any-entry rule; test it).
2. **Run export/CSV** (S): client-side blob download on the shopping run (ReportsClient
   'Export missing CSV' precedent), columns incl. the canonical totals the rows already
   carry (the vendor-books forward-compat hook, activated).
3. **Per-item notes + "subbed with…"** (M−, third slot — first to cut if the increment
   runs hot): `OpsListItem.note?` additive; preserveChecked extended to carry notes by
   resource_id|unit; loadout + run row note editor (expand-row idiom exists) + print.
   This RETIRES the shelf-substitution queue item: a real swap is impossible until
   recipes exist (recompute silently reverts any resource rewrite — refuted with
   file:line), so the note IS the honest substance.

### S4 — Families phone cards (S; Casey's last panned surface)
Single-file card reflow of FamiliesTable below `sm`, mirroring CheckinClient's shipped
line-pressure idiom (ONE mobile language for Casey, not two): name + StatusPill +
balance chip + visible checkbox (bulk survives on phone; BulkToolbar wraps), row tap →
the existing full-screen slide-over with Prev/Next triage. Killed permanently
(refuted): the "Campers" column (rendered a hardcoded "—" its entire life; a real count
is unpriced data work) and "year" (never existed). Desktop grid unchanged; text/role
tests survive by construction (jsdom ignores visibility classes — keep single-DOM).
**One human sign-off** (default chosen, flag in PR): balance chip visible to
families-grant holders (the grant already reveals balances on this page today) — the
stricter owner/admin-only variant is +S if wanted.

## Ownership fences (audited)
Vendor price books / multi-supplier grouping / pack-size math: **ops-catalog spec inc 3
owns it** (zero code shipped; the run's canonical totals are the consume-side hook —
Events must not build vendor schema). On-hand netting: REFUTED a third time (no on-hand
field anywhere; the ops-catalog spec excludes it from all five increments; vendor books
don't change that). Counter register: POS spec inc 2. Signal palette sweep + Pipeline
level-up threads: no file collisions with this cut.

## Worked budgets
Casey triages a registration on the phone: find (search) → tap → decide → next ≤ 5
touches, no horizontal pan. Mo's Saturday close with a Square CSV: open closeout-lite →
attach → confirm prefill → complete = 1 screen · 1 file · 2 taps. The evening-before
email arrives without any taps, forever.

## Hard gates carried
Everything from inc 1/2 (44px day-of targets, tokens, paper rule, visible-failure
optimism, custody-grade non-optimism, no value twice, designed empties, explicit
breakpoints) + new: cron consumers are idempotent by stamp, never by wall-clock trust;
imported money is labeled as imported at every render.

## Build decomposition (disjoint; branch after #127)
(Superseded by the BINDING resolutions below.)

---

## Panel resolutions inc-3 (BINDING — two-grader panel, conditional GO)

**B1 — Catch-up window + date-stamped idempotency** (folded into S1 above): send window
18:00–21:00 org-local; `evening_sent_for = event_start` (self-healing reschedules, no
clearing hooks anywhere). Observable tick: the cron route logs/returns
`{orgs_scanned, sent, skipped, errors}` with per-org try/catch isolation (first all-orgs
enumeration in the codebase — one bad org must not kill the tick); tz-absent orgs
skipped as documented behavior. Org-level `last_evening_run_at` stamp renders a liveness
line beside the opt-out toggle ("Last evening send: Fri 6:04 PM MDT — 1 run sheet") —
a healthy quiet night must be distinguishable from a broken cron.

**B2 — PRE-MERGE HUMAN GATES (deploy blast radius):** an hourly cron on a non-Pro plan
FAILS DEPLOYMENT — merging would break all production deploys, not just the feature.
Before the inc-3 PR merges, a human must confirm: (a) the verra-works Vercel plan
accepts hourly cron schedules; (b) `CRON_SECRET` is set in the dashboard (CLI can't —
wrong account, per standing memory). The PR description carries both as unchecked boxes.

**B3 — Imported-money provenance is a FIELD, not a caption**: additive
`OpsActuals.sales_source?: 'square_csv' | 'manual'` — the labeled-at-every-render gate
becomes true post-reload (closeout, overview tile, season strip), and it pre-answers the
future register's double-count labeling. **XOR rule recorded now**: one money source per
event — imported Square sales XOR the future counter register's `counter_revenue`
(cross-ref: selling-occasions/POS spec §5).

**B4 — CSV honesty**: support ONE layout — the **Transactions CSV** (per-row date +
Total Collected; supports the event-date filter). Header layouts are NOT verified from
primary sources: the parser detects headers defensively and fails designed ("Couldn't
read this export — choose the Transactions CSV from Square's dashboard"), never
guess-sums. Prefill shows the matched EVIDENCE as its caption ("Sat Aug 22 · 47
payments · $1,243.50 Total Collected (gross)") — NO confirm modal (the caption is the
confirmation); budget restated honestly: 2 in-app taps + the OS file pick. Ghost hint
("Last Saturday: $1,243.50") sourced from the series' already-fetched prior day when
series_id exists — zero new index; omitted otherwise.

**B5 — Build waves (the 'disjoint' claim was false in five files):**
- **Wave-0 (orchestrator)**: types.ts (Org.timezone, `Org.ops_notifications?`/opt-out +
  `last_evening_run_at`, OpsActuals.sales_source, OpsRequirements pack/drive overrides,
  OpsListItem.note) + shared consts.
- **Wave A (parallel, disjoint)**: **T1 substrate** — tz settings input (rendered in
  BOTH CapacityUnitsClient branches — timezone must NOT be business-tier-gated),
  vercel.json + cron route + evening consumer, `sendRunSheetCore` extraction from
  actions/event-ops.ts, **including moving `getVerifiedSendingDomain` into a lib core**
  (it is today a guard-free 'use server' export leaking any org's sending domain — the
  listItinerary class; the extraction touches the import anyway), tz stamp retrofits
  (email, event-spine confirm stamp, ops/print + runsheet/print freshness lines);
  **T2 CSV** (MarketDayCloseoutClient + pure parser lib only); **T5 families cards**
  (balance chip renders ONLY when > 0 — check-in's money-pill idiom; base-width
  "Select all (n)" line replaces the dead header row so phone bulk-confirm survives).
- **Wave B (after T1 lands, reset onto branch HEAD)**: **T34 merged** — per-event
  buffers threaded through ALL FOUR server sites (dashboard→spine, runsheet page,
  **runsheet/print** — the site both scoper and draft missed; unthreaded it prints
  paper chips that disagree with the screen — and the extracted send core) +
  OpsListItem notes with **loadout-only editing** (run + prints DISPLAY notes read-only;
  a run editor means cross-event write wiring the M− price excluded) + run CSV export.
- Whole-branch reviewer's hardest checks: the T1-extraction↔T34-threading seam in
  actions/event-ops.ts + event-spine; the cron route's transaction-guarded
  only-if-absent stamp write; opt-out respected; no plan reads outside the window.

**B6 — Queue integrity + balance (restored):** named inc-4 deferrals — **staff
run-sheet fan-out WITH receipt confirmation** (the distribute-and-CONFIRM half, paired
as the Casey-headline of a future increment), Square OAuth tier (b) (prereqs: #129 ✓
shipped, server-only token storage, tz ✓ this increment), auto-sync tier (c), per-org
send-hour config (consciously rejected — fixed 18:00–21:00 is the right amount of
design; the opt-out is the respectful control). **Balance statement:** inc 3 is ~6 Mo
items to 2 Casey items (tz-honest stamps + families cards) — deliberate; the paired
receipt-confirmation increment is Casey's next headline. **Human sign-off taken as
default:** families-grant holders see the balance chip (the grant already reveals
balances on this surface); owner/admin-only variant is +S on request.
