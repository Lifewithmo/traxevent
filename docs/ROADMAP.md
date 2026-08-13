# TraxEvent — Product Roadmap

Rollup of where the build stands and what's next. Last updated: 2026-08-13.

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

## In flight

- **Pipeline KPI header** (branch `claude/pipeline-kpi-header`) — first-principles
  header on the pipeline page: booked this month (vs same month last year),
  booked ahead next 90 days, needs-action count, and a booked-revenue-by-month
  backlog bar (`lib/pipeline-stats.ts`). Ride-along capture for future Reports:
  `Lead.source` (`intake`/`manual`) stamped at creation, structured `stage` on
  stage-change activity events
  (plan: `superpowers/plans/2026-08-12-pipeline-kpi-header.md`).

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
