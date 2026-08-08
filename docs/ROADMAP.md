# TraxEvent — Product Roadmap

Rollup of where the build stands and what's next. Last updated: 2026-08-08.

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

## In flight

- **Opportunity workspace, increment 1** — PR #64 open
  (light shell, pill row, dates panel).
  Plan: `docs/superpowers/plans/2026-08-08-opportunity-workspace.md`.
- **Customer page completion** — PR #65 open (new-opportunity-from-customer +
  pipeline customer typeahead on one `customer_id` seam, real last-contact via
  touch stamps, tag editor with autocomplete). Manual browser walk not yet run.
  Spec: `docs/superpowers/specs/2026-08-08-customer-page-completion-design.md`.

## Next (approved queue)

1. **Pipeline sub-nav (#16a)** — Opportunities / Calendar / Tasks sections.
2. **Org calendar week view (#15a) + ICS sync (#15b)** — builds on increment 1's
   `listCalendarRange` groundwork.

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
- **Public intake form** — the pipeline's missing front door; every opportunity
  is hand-keyed today. Hard prerequisite: the repo has zero rate limiting / bot
  protection, which this increment must solve first.
- **Public profile page (link-in-bio)** — customer request: replace their
  Beacons page. v1 designed (spec:
  `superpowers/specs/2026-08-08-public-profile-page-design.md`): `/p/[handle]`
  page + settings editor. The rest of the Beacons buildout (analytics,
  subscribe, store, themes…) is logged in
  `strategy/2026-08-08-beacons-parity-feature-request.md` — not committed
  roadmap.
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
