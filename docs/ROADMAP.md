# TraxEvent — Product Roadmap

Rollup of where the build stands and what's next. Last updated: 2026-08-18.

The original vision/architecture spec is
[2026-06-02-product-roadmap-design.md](superpowers/specs/2026-06-02-product-roadmap-design.md)
— still useful for the business model and phase framing, but it predates the
EventTrax pivot (neutralization, multi-brand, ops core). Detailed designs live in
`docs/superpowers/specs/`, execution plans in `docs/superpowers/plans/`.

## Shipped (high level)

- **Phases 1–5g** — full booking→payment spine: leads → proposals → contracts →
  invoices → client portal → vendors, on Stripe.
- **Neutralization (D1–D5) + industry packs (Phase 6a)** — church-camp framing
  removed; neutral event-business platform with per-industry module packs.
- **CRM v1** — Opportunity model with derived health, tasks/notes/activity;
  pipeline & opportunity detail redesign (PR #63, wireframes 12a–c).
- **Multi-brand layer** — domain→brand mapping (`lib/brands.ts`), brand landing
  pages, durable brand attribution. First vertical brand: **BrewTrax**
  (coffee-cart pack).
- **Ops core + beverage MVP screens** (PRs #46–48) — work packages, resources,
  requirements/change-log, derived deadlines & checklists, issues,
  closeout→invoice, compliance tracker, catalog.
- **Convert-to-work** (PR #61) — deliberate action at `closed_won` creates the
  Event and hands off to ops setup; closeout invoice derives its opportunity.
- **Proposals level-up** — customer choice (PR #38), commitment: e-sign + Stripe
  deposit (PR #43), deposit reconciliation (PR #44), presentation blocks (PR #56),
  AI drafting (PR #60), builder redesign: pricing v2 + brand kit + layout-first
  builder (PR #62).
- **Public profile page (link-in-bio)** (PR #67, merged 2026-08-08) — customer
  request to replace their Beacons page: public `/p/[handle]` page + "Public
  profile" settings editor
  (spec: `superpowers/specs/2026-08-08-public-profile-page-design.md`).
  ⚠️ Authenticated editor walk (save → upload → live page → 404 → handle
  conflict) not yet run — gate before customer handoff. Rest of the Beacons
  buildout logged in `strategy/2026-08-08-beacons-parity-feature-request.md`.
- **Proposal builder redesign v2** (2026-08-13) — right rail removed: command
  bar (send/copy-link/AI/overflow), in-context totals editing on the document,
  Review & Send pre-flight dialog, AI drafting as the mainline path (in-canvas
  hero, placeholder fill, streaming Opus 5 drafts with voice few-shot from sent
  proposals + "How we sound" note)
  (spec: `superpowers/specs/2026-08-12-proposal-builder-redesign-design.md`).
  ⚠️ Authenticated builder walkthrough + model bake-off
  (`scripts/proposal-draft-bakeoff.md`) still owed.
- **Today / Clients / nav redesign** (PR #69, merged 2026-08-09) — Today as one
  ranked move queue with a booked-work agenda rail; Clients grouped by dormant
  repeat business, detail as story + timeline; sidebar quick links with
  proposals/invoices nested under Pipeline.
- **Calendar week view + ICS + pipeline sub-nav** (PR #70, merged 2026-08-09,
  wireframes 15a/15b/16a) — org calendar as two bands per day (time / owed)
  across six kinds incl. compliance blockers and invoice dues; tokened
  read-only ICS feed at `/ics/[orgSlug]/[token]` with per-kind `?include=`
  filters; Pipeline becomes a section (Opportunities / Calendar / Tasks);
  one-date .ics download on the opportunity dates panel.
- **Public intake form** — tokenized `/inquire/[token]` front door: creates
  customer + opportunity at `inquiry`, logs a `form` activity event, emails the
  owner. First abuse-protection seam: honeypot + time gate + Firestore-backed
  rate limiting (`lib/rate-limit.ts`) — registration should adopt it next.
- **One signed document** — proposals carry legal `terms` (org default in
  Branding → Proposal terms, per-proposal editable, hash-covered by the
  e-signature); the standalone contracts feature (pages, nav, portal card,
  convert gate) is removed
  (spec: `superpowers/specs/2026-08-09-proposal-terms-contracts-retirement-design.md`).

- **Customer page completion** (PR #65, merged 2026-08-10) —
  new-opportunity-from-customer + pipeline customer typeahead on one
  `customer_id` seam, real last-contact via touch stamps, tag editor with
  autocomplete — features ported onto the PR #69 redesigned Clients pages at
  merge. Manual browser walk not yet run.
  Spec: `docs/superpowers/specs/2026-08-08-customer-page-completion-design.md`.

- **Ops catalog units core** (branch `units-core`, 2026-08-13) — increment 1 of
  the ops-catalog deepening: pure conversion engine (`lib/ops/units.ts` —
  universal unit table, per-ingredient AI/operator conversion bridges, graph-walk
  `convert()`, unit-system-aware display), resource `dimension`/`conversions`
  with legacy inference (no migration), unit-aware package lines
  (`number | Quantity`), derive converts-to-canonical-then-merges with
  `needs_conversion` bucketing and `cost_gaps`, unit selector on package lines.
  Spec: `superpowers/specs/2026-08-13-ops-catalog-units-vendors-design.md`
  (increments 2–5 queued: recipes/yields, vendor price books, proposal
  `catalog_ref`, one-door AI intake).

- **Pipeline KPI header** (PR #77, merged 2026-08-13) — first-principles
  header on the pipeline page: booked this month (vs same month last year),
  booked ahead next 90 days, needs-action count, booked-revenue-by-month
  backlog bar (`lib/pipeline-stats.ts`); extended by PRs #80/#81 (Open
  pipeline tile, 12-month window, kit skin). Ride-along capture for future
  Reports: `Lead.source` (`intake`/`manual`), structured `stage` on
  stage-change activity events.

- **Pipeline & sidebar mock parity** (PR #80, merged 2026-08-13) — production
  catches up to the design-system pipeline mock: sidebar IA (Operations =
  Vendors/Menu Packages/Forms/Compliance; Events folds into Quick Links; first
  `'forms'` module + org-level Forms link), 4th "Open pipeline" KPI,
  rolling-12-month "Revenue by month" chart, stage-column totals in headers,
  shared won/lost summary on both views, mock-voice health copy, intake-card
  dedupe (spec: `superpowers/specs/2026-08-13-pipeline-mock-parity-design.md`).
  Still old-voice by choice: `actions/leads.ts` activity-log `Waiting: {reason}`.

- **Pipeline & sidebar skin parity** (PR #81, merged 2026-08-13) — the visual
  layer of the design mock, built from the design kit's own source: bespoke nav
  icon family + sidebar tokens v2 (copper active), icons + collapsible sections
  + 52px icon rail on the sidebar, borderless mono-caps KPI band with the
  collapsible rolling-window (-5..+6) revenue chart beside it, StageChip pill
  menus (Mark lost routes to reason capture), kit board (keyboard stage moves,
  drag-over highlight) and flat-row list, actions portalled onto the sub-nav
  row; coffee-cart pack gains vendors+events
  (spec: `superpowers/specs/2026-08-13-pipeline-skin-parity-design.md`).
  Follow-ups: keyboard-move focus retention, StageChip roving focus, legacy
  pipeline test consolidation.

- **Invoice experience redesign** (branch `feat/invoice-redesign`, built
  2026-08-15) — three-state lifecycle (draft/sent/void) with a version
  history trail, send-time auto-numbering plus org numbering settings,
  document-first editor (catalog line-item picker with create-in-place, send
  dialog), printable public invoice document at `/invoices/[token]`, and a
  transactional invoice email
  (spec: `superpowers/sdd/2026-08-15-invoice-experience-redesign`). Built and
  green (full suite + `next build` clean). Authenticated walkthrough passed
  against the emulator 2026-08-15 — login, numbering floor, catalog picker,
  send with number assignment + version history, public page at desktop and
  375px, edit → send update; PR still to open. Production email delivery for
  this flow (and the still-unverified PR #66 intake path) remains to be
  confirmed post-deploy.

- **Drops & online ordering** (PR #88, merged 2026-08-15, live in production) —
  products catalog → drops with email announcements and public checkout on
  Stripe Connect (no per-order platform fee), orders board, subscriber
  management, calendar drop kind. Spec:
  `superpowers/specs/2026-08-15-drops-online-ordering-design.md`. Firestore
  indexes deployed; sandbox webhooks (payments incl. `charge.refunded` +
  billing) created 2026-08-15. Still owed: authenticated walk, side-by-side
  pilot drop vs Hot Plate, Stripe live-mode chain before real money.

- **Occasions core** (PR #89, merged 2026-08-15, live in production) — market
  days as a second Event kind alongside client jobs: up-front weekly series
  generation (per-span cap), series page (skip/edit+propagate/extend/end),
  Events-section nav rework ("+ New" chooser at `/new`, Drops absorbed from
  Catalog, Market tags), market-day overview + settings, R1 registration
  slimming (registration_type/features optional, features never written,
  roster inputs gated on `attendee-roster` — no stored data changed)
  (spec: `superpowers/specs/2026-08-15-selling-occasions-pos-design.md`).
  Next increments: counter register → tabs + publicMode "Find us" +
  drop↔market pickup linkage → registration retirement R2. Manual browser
  walkthrough of the occasion flows still owed.

- **Pipeline Capacity Outlook — resource-capacity increment 3** (PR #124,
  merged 2026-08-19, live) — the hero planning surface. A **serviceable-days
  calendar** (`Org.serviceable_days`: weekly pattern + full-year holiday/closure
  ranges) sets which days count; a **peak-date headroom forecast** (new Capacity
  Outlook pipeline tab) shows, per month over serviceable days, a booked/ceiling
  meter per kind + the `~$` headroom you can still sell ("~$85k of September");
  and a read-only **per-unit schedule** (status grid — booked / open /
  non-serviceable / blocked-hatched — with an Unassigned lane). Plus
  **de-siloing**: `Org.resource_labels` + a `kindLabel` helper let the operator
  name each kind (BrewTrax → "carts"), routed through every surface INCLUDING a
  retrofit of the Inc-1/2 pills — no literal "cart"/"room" left in copy. Gated to
  business + ≥1 unit; additive, migration-free. Walked live desktop/tablet/mobile
  (forecast math + Fall-break closure dropping October; schedule Kart-1 booking +
  Unassigned lane; overflow-contained). Deferred to **Inc 4** (final): auto/drag
  assignment, server-side hard block, per-event-type resource profiles. Spec/plan:
  `superpowers/{specs,plans}/2026-08-19-pipeline-capacity-outlook*`.

- **Pipeline Unit Assignment — resource-capacity increment 2** (PR #119,
  merged 2026-08-18, live) — optional **per-unit assignment**: pin a booking to
  a specific cart/room (`Lead.assigned_units`, never forced), plus **unit-level
  clash detection** — the same unit double-booked on a date, *orthogonal* to the
  Inc-1 type-level `over` (a day can be under capacity yet still double-book one
  unit — the mistake a type-count misses; `over` is byte-for-byte unchanged by
  assignment). The opportunity-detail assignment control annotates each option
  (`Kart 1 — taken by "Benoit"` / `free` / `blocked`) and, per the
  design-ambition pass, warns **inline the moment you pick a taken unit**
  ("Double-booked with …") — error prevention at the pick, not just after. The
  pipeline shows a read-only `Kart 1 double-booked — <date>` badge, independent
  of the over-capacity pill; base/solo orgs keep the increment-1 "Date conflict"
  path. Walked live desktop/mobile. Deferred: Inc 3 serviceable-ceiling forecast
  + capacity view; Inc 4 auto-assign, drag-to-assign, server-side hard block,
  per-event-type resource profiles. Known pre-existing (not this increment):
  pipeline list rows crush pills to word-per-line at tablet 768 with the sidebar
  expanded — a #110/#111-class flex fix, tracked separately. Spec/plan:
  `superpowers/{specs,plans}/2026-08-18-pipeline-unit-assignment*`.

- **Pipeline Resource Capacity — increment 1** (PR #117, merged 2026-08-18,
  live) — the same-day conflict radar is now **capacity-aware by resource
  type** instead of assuming capacity = 1, gated to the **business** tier
  (modeling >1 resource is the paid upgrade). A business org defines named
  **capacity units** (`orgs/{orgId}/capacity_units`, kind mobile/venue) with
  availability (active + block-out dates) in Settings → Resources & capacity
  (`/[orgSlug]/capacity`); each lead carries an optional `delivery_mode`
  (offsite → needs a cart; on-site → needs a cart + a room). A pure engine
  computes per-date, per-kind demand vs supply; the radar shows "Over capacity
  — 3 events · 2 rooms" instead of a bare flag. **The backstop:**
  `radarConflictOpts` enters capacity mode only for a business org with ≥1 unit
  — base/solo AND unit-less business orgs fall back to increment-1 behavior
  byte-for-byte (additive, migration-free, ships dark). Walked live
  desktop/tablet/mobile: the multi-cart false-flag fix (Sep 5 clear) + an
  over-capacity flag (Sep 27). Whole-branch review caught the settings page
  orphaned/at the wrong path (a business operator couldn't reach it). Deferred:
  Inc 2 per-unit assignment, Inc 3 serviceable-ceiling forecast + capacity view,
  Inc 4 per-event-type resource profiles + recurring availability + server-side
  hard block. Spec/plan: `superpowers/{specs,plans}/2026-08-18-pipeline-resource-capacity*`.

- **Pipeline Book-By Capacity Radar — increment 1** (PR #114 + mobile hotfix
  #115, merged 2026-08-18, live) — the Pipeline now ranks by the **event
  deadline** (`event_date − org.prep_lead_days`, default 14), not
  touch-staleness, and flags **same-day booking conflicts** (two bookable leads
  sharing a date; capacity = 1 for the solo-operator anchor). Rows carry a
  book-by urgency chip (alert ≤7 days, incl. past-due), a conflict badge, and a
  double-booked-won `window.confirm` guard; the group sort is conflict-first →
  soonest book-by → no-date tail → oldest-touch tiebreak (a transitive
  lexicographic comparator). All in-memory, zero new queries. Walked live
  desktop/tablet/mobile against a seeded same-day conflict pair (Sat
  2026-09-05). Plan: `superpowers/plans/2026-08-18-pipeline-bookby-radar.md`.
  Deferred to increment 2: date-bucket list, serviceable-ceiling forecast +
  capacity>1, deadline-aware health, per-event-type lead times, server-side hard
  block, board-view chip/badge.

- **Events ambition — computed job brief + day-of execution layer** (PR #122,
  merged 2026-08-23) — the design-ambition redo of Events past kit parity: the
  client-job dashboard is now a computed brief (countdown · honest anchor time ·
  venue/Maps · readiness **verdict** naming concrete reachable blockers ·
  admin-gated invoice AR — the Balance tile finally works for roster-less orgs ·
  one promoted next-best-action), plus the category mechanism no market product
  owns (Curate computes but prints paper; Goodshuffle executes on phones but
  never computes; FSM leaders assume a stocked van): a phone-first **load-out
  mode** (`/ops/loadout`, packages × headcount quantities, 44px kit `touch`
  targets, unconditional recompute core + headcount auto-re-derive) and a
  call-sheet-anatomy **run sheet** (`/ops/runsheet` + print) with its capture
  moments (venue fields, contacts un-gated for roster orgs, convert-time
  seeding). Also: readiness-horizon rail on the events home ("no ops plan yet"
  outranks all), line-pressure **check-in** (search, family bulk, flags at the
  moment of action, transactional custody history with server-derived undo —
  forgery/clobber structurally impossible), live closeout margin deltas, and
  next-job-first Today. Process: anchor → walks + market research + 5 seam
  refuters → 3-grader panel (9 binding resolutions) → 7 implementers → 8
  reviewers + adversarial verify → 7 mutation-tested fixers → whole-branch SHIP.
  3,164 tests green. Spec: `superpowers/specs/2026-08-19-events-ambition-design.md`.
  Owed: Vercel walkthrough (375/768/desktop); named increment-2 deferrals in the
  spec; pre-existing `listItinerary` cross-org read + nested-`<main>` landmark
  defect spun off as separate tasks.

- **Track 2 module level-up rollout — COMPLETE** (PRs #90–#100, merged
  2026-08-16) — every operator-facing module now runs on the shared UI kit.
  Closing the rollout: **Proposals collections (#98)**, **Catalog / Packages
  (#99)** and **Sales Pipeline (#100)** — the pipeline module had zero kit
  usage at the start (the playbook's "already-compliant exemplar" claim was
  refuted at the implementation level: `PipelineStatsHeader` hand-rolled its
  own `Kpi`/`KpiLabel` and re-implemented `KpiBand`'s grid string). It gained
  the cockpit spine on opportunity detail, five hand-rolled popovers collapsed
  into one kit `Menu` (two were a11y bugs — a fake `role="dialog"` popover and
  a popover with no role), toned countdowns and money figures on the list and
  board, and drag-and-drop's first automated coverage.
  #100 also fixed the repo-wide dark-mode blocker: both admin shells hardcoded
  `bg-gray-50`, measured at 49 WCAG AA text failures over the four Pipeline
  surfaces alone (money at 2.0, group headers and task titles at 1.02); one
  token drops all four to zero. Dark mode is still unreachable by navigation —
  nothing applies `.dark` or reads `prefers-color-scheme` — so wiring a theme
  toggle is the remaining piece.
  Still owed: the **Signal palette sweep** closes Track 2; live authenticated
  walkthroughs per module (board drag-and-drop is the highest-risk uncovered
  surface); `?focus=lost` is never stripped from the URL, so a reload re-opens
  the destructive dialog and a second confirm overwrites the recorded
  `LostReason`; `--status-neutral-fg` on `--status-neutral-bg` measures 4.46:1
  against a 4.5 requirement at 12px; and `KpiBand` collapses on a viewport
  query rather than container width, so it goes 4-up inside narrow columns.

- **Track 2 rollout, first six modules** (PRs #90–#95, merged 2026-08-16) — the
  Client Cockpit's shared UI kit rolled across the app, module by module:
  Client Cockpit + kit extraction (#90), Today (#91), Vendors ledger (#92),
  Invoices money surface (#93), Calendar dashboard (#94), and **Events &
  Delivery (#95)** — the biggest module: a shared event spine in
  `[eventSlug]/layout.tsx` (sticky identity header, route-backed section tabs
  via `lib/event-nav.ts` — dead Teams/Budget 404 links removed, KPI band fed
  by the `lib/event-spine.ts` aggregator gated on `allowedEventPages`),
  all 12 leaves recomposed onto the kit (orphan h1/max-w columns gone,
  `window.confirm`/`prompt` → kit Dialogs incl. guardian pickup, StatusPill
  statuses, EmptyStates, families purple-era retokenization + slide-over
  focus management), and the org events home as a grouped ledger with an
  honest KPI band. Playbook:
  `superpowers/plans/2026-08-15-module-levelup-playbook.md`. The remaining
  three modules shipped in #98–#100 — see the entry above.

## In flight

- **Proposal templates** (branch `claude/proposal-templates`) — org-owned
  full-document templates: pick one on New proposal (above the built-in
  skeletons), manage under Settings → Proposal templates, edit in a builder
  variant, "Save as template" from any proposal. Snapshot semantics; catalog
  linkage arrives with the queued ops "proposal refs" increment
  (spec: `superpowers/specs/2026-08-13-proposal-templates-design.md`).

## Next (approved queue)

*(empty — pipeline sub-nav #16a and calendar week view + ICS #15a/15b shipped
in PR #70; queue the next increment here.)*

## BrewTrax beta blockers (need Ryan, not code)

- **Manual end-to-end spec walk** with a live coffee-cart org:
  package → proposal → ops → checklists → closeout → invoice. Never run.
- **Pre-DNS brand-domain decision** — brand domains pass all non-root paths
  through to the full app; choose redirect-to-main vs robots+auth-redirects
  before brewtrax.com DNS goes live.

## Backlog (no plan written yet)

- **Actionable client list** (follows customer page completion — decided
  2026-08-08). The client list should say *who needs touching and why*, not just
  be searchable. Model: **derived touchpoints + stored facts** — rules derive
  outreach suggestions live (post-event follow-up, ~60-days-before-event-
  anniversary rebook window, went-quiet) from `event_date` + last contact;
  stored data is only human knowledge (life-event key dates, per-customer
  dismiss/snooze of a suggestion). Views group customers by reason. Not 1:1 by
  design — rules are defaults, never hardwired per customer. AI note-mining
  (suggest key dates from notes) is a later suggester layer on the same model.
- **Operator-AI increments 2–3**
  (spec: `superpowers/specs/2026-08-07-operator-ai-design.md`) — per-artifact
  refinement + quantity/notes assists, then the read-only workspace assistant.
  Note: no live Anthropic API call has ever been made; the first real generation
  is the first live schema test.
- **Proposals increment 4: governance** — versioning/lock, cost/margin privacy,
  view tracking, branded PDF.

## Open decisions & small threads

- Monetization decided 2026-08-15: subscription-only — drop orders carry no
  platform application fee (spec:
  `superpowers/specs/2026-08-15-drops-online-ordering-design.md`). Open thread:
  the legacy hardcoded 1% `application_fee_amount` on registration payments and
  proposal deposits predates this — retire it (and the billing-page copy) or keep
  it deliberately.
- Deposit-invoice numbering: reconciled deposit invoices are `issued` but
  unnumbered — assign numbers vs document the exemption (accounting call).
- Parked `git stash` of pre-redesign proposals WIP — likely stale; keep or drop.
- Convert-to-work manual scenarios 6/7/18/19 from the plan's walkthrough.
- `ProposalResponseClient` sign/decline/deposit flows: zero test coverage.
- Roster-off orgs still see registration fields in event settings (D3 follow-up).

## Deferred (deliberately)

- Vertical modules: inventory, deliverables, routing, POS.
- CRM-standalone brand (sales-only pack).
- `Lead`→`Opportunity` rename.

## Strategy references

- Codebase audit / positioning: `docs/strategy/2026-08-02-eventtrax-codebase-audit.md`
- Multi-brand + ops platform: `docs/superpowers/specs/2026-08-05-multibrand-ops-platform-design.md`
- BrewTrax launch checklist: `docs/ops/brewtrax-launch-checklist.md`
