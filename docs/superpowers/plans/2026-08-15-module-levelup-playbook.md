# Module Level-Up Playbook — consistent Cockpit rollout

> Generated 2026-08-15 from the module-levelup-audit workflow (9 operator-facing modules assessed against the Cockpit standard + space-filling law). Companion to the Client Cockpit spec/plan.

# TraxEvent / BrewTrax Cockpit Rollout Playbook

The Clients Cockpit sets the bar. This is how every other module reaches it — and how we keep them all speaking one language.

---

## 1. Archetype Map

Every module maps to exactly one frame. Modules sharing a frame share a skeleton — build the frame once, skin it per module.

| Archetype | Frame (shared skeleton) | Modules | Deviation notes |
|---|---|---|---|
| **COCKPIT** | list/queue rail · record spine (sticky header → KPI band → lede → timeline) · working rail | **Clients** (reference, in flight), **Sales Pipeline**, **Invoices**, **Events & Delivery**, **Catalog/Packages** | Clients & Pipeline detail are *separate pages*, not literal 3-pane — a persistent queue rail on the detail route is a stretch, not required. Events is a **spine-of-tabs**: the event is the entity, child routes are its tabs. Catalog: only *Packages* is the cockpit; resources/checklists are related LEDGERs off its rail. |
| **DASHBOARD** | KPI band → central working canvas → right "needs-attention" rail | **Today**, **Calendar** | Both deviate: the central canvas is a live surface (Today = ranked move-queue; Calendar = 7-col time-grid), not stat cards. The grid/queue is the reason the module exists — keep it, wrap it. |
| **BUILDER** | command bar → centered themed document canvas (block edit + live figure) | **Proposals** (editor) | Already leveled up — the crown jewel. Only its *collection* surfaces are debt (they deviate to LEDGER, see below). |
| **LEDGER** | KPI band → dense filterable grouped table → detail Sheet/drawer | **Vendors** (primary); **Proposals index** (`/proposals`), **Invoices list**, **Catalog resources** as sub-surfaces | LEDGER is the honest target for rows-of-records with no per-entity narrative. Vendors have no timeline — a full cockpit would be over-built. |
| **FLOW** | stepped, action-first wizard | *No standalone module* — **Closeout** (hosted inside Events spine), **SkeletonPicker** (Proposals), public **InvoiceView** | These are hosted flows, not top-level modules. Public InvoiceView only needs the dark-mode token fix. |

---

## 2. Definition of "Consistent" — the enforceable checklist

A module redesign is **not done** until every box is checked. This is the gate, not a suggestion.

**Kit consumption (no raw one-offs)**
- [ ] Zero hand-rolled dropdowns/popovers — every menu is the kit `Menu`. (Kills the ~5 bespoke `useRef+mousedown` menus across Today/Pipeline/Proposals/TopBar.)
- [ ] Zero `window.confirm` / `window.prompt` — kit dialog only. (Proposals, Catalog.)
- [ ] Every status renders as `StatusPill` with **per-state tone** — never one gray `Badge variant="secondary"` for all states. (Invoices, Vendors, Proposals all fail this today.)
- [ ] Every identity glyph is `Avatar`; every empty is `EmptyState`; every related record is `RelatedRecordCard`. No bespoke equivalents.

**Space-filling law (all 8)**
- [ ] **R2** — every computed rollup is a `StatTile` figure, never 12px gray prose. (Audit: does the module compute a number the UI doesn't promote? Today's `openPipelineValue`, Vendors' `confirmedVendorCost`, Calendar's `Due $`, Catalog's margin are all *computed and thrown away* today.)
- [ ] **R3** — reading column capped; a rail/KPI band absorbs freed width; **no >200px dead gutter**. (Kills every `max-w-2xl/5xl` floating column.)
- [ ] **R4** — every empty state is *message + one CTA*. No bare sentences, blank cards, or em-dash walls.
- [ ] **R5** — two densities on purpose (compact list rows vs. generous reading/figure region).
- [ ] **R6** — unset fields are `+ Add` affordances, never `None`/`—` rows.
- [ ] **R1 / NO-BLOCK-STACKS** — page composed to the operator's next decision, **not** a vertical stack of schema-ordered `<Card>`s. Run the `screen-composition` skill on any recompose.

**Tokens / dark mode**
- [ ] Zero raw Tailwind literals (`text-gray-500`, `bg-white`, `bg-emerald-100`, `text-red-600`) — semantic tokens only (`text-muted-foreground`, `border-border`, `text-destructive`, `bg-card`).
- [ ] Copper/moss spent **only** on links, money, status. Money carries the money token.
- [ ] Verified in dark mode.

**Responsive (R8)**
- [ ] Fixed grids (`grid-cols-3/7`) collapse below `md`; reference rails move below or hide; empties hidden on mobile; layout is action-first.

---

## 3. Prioritized Rollout (after Clients)

Sequenced by **daily-driver value × kit reuse**. The kit lands with Clients; everything after either near-free-inherits it or pays down structural debt. **Rule: no module ships as a card-reskin — that re-violates NO-BLOCK-STACKS.**

**Gate 0 — Extract the shared kit + cockpit shell (BLOCKING everything).** The kit does not exist yet: `components/ui/` holds only badge/button/card/dialog/input/label/separator/table. Base UI + cva are installed; substrate is ready. Extract the bricks from the Clients cockpit idioms *as Clients ships*, so Clients is both the reference and the kit's first consumer.

| # | Module | Effort | Why here / kit leverage |
|---|---|---|---|
| **1** | **Today** | **M → S** | Highest daily value — opened every morning. Data layer (`lib/today.ts`, `today-moves.ts`) is solid and needs **zero** changes; the whole fix is surfacing the already-computed `openPipelineValue` as a KPI band + moving the hand-rolled menu onto kit `Menu`. **Near-free once the kit exists** — this is the S that proves the kit. Do it first to validate the bricks under a second consumer fast. |
| **2** | **Sales Pipeline** | **L** | Daily sales driver. `PipelineStatsHeader` is *already* a compliant KPI band (keeper/exemplar) and `NextActionBanner` is already decision-first. The lift is the detail-spine recompose off the `<Card>` stack + collapsing three stage-menus into one. High value, and it consumes the full cockpit shell → stress-tests the shell for everyone downstream. |
| **3** | **Invoices** | **M** | Money surface. **The hard half already exists** — `InvoiceEditorClient` is the most leveled-up spine in the app after Clients (working rail + promoted Balance figure). Work is *only* the list side: AR KPI band + grouped queue + `StatusPill` swap + de-block-stack the lead embed. Near-free on the record side. |
| **4** | **Calendar** | **M** | Additive **re-skin, not a rebuild** — data layer (`buildCalendarFeed`) already emits every field the KPI band and needs-attention rail want. Two cheapest high-value wins (money color, mobile `grid-cols-7` collapse) can ship *ahead of the kit*. Must preserve the dual-caller contract (`/calendar` + `/leads/calendar`). |
| **5** | **Vendors** | **M** | LEDGER, not cockpit — cheaper by design. Backend (`actions/vendors.ts`) is solid; extend existing `confirmedVendorCost/totalVendorCost` into a ledger builder. Biggest defect is trivial to fix: the org page never sums the Cost column. One product decision owed: `/vendors/[vendorId]` route vs. in-place Sheet. |
| **6** | **Proposals** | **M** | The expensive half (BUILDER) is **done**. Work is collection surfaces (index → LEDGER, per-lead list → RelatedRecordCards in the Pipeline/Clients rail, templates → dense rows) + a ~53-literal dark-mode tokenization pass on the builder chrome. Depends on the Pipeline/Clients cockpit existing to host the per-lead cards — hence after #2. |
| **7** | **Catalog / Packages** | **L** | Lower daily cadence. High-value, low-risk win: the fulfillment-cost + margin figure is *already computable* from `lib/ops/derive.ts` but entirely absent — promoting it is the marquee change. Preserve the in-use delete guards and null-vs-omit update semantics (tests exist as a net). |
| **8** | **Events & Delivery** | **L** | Biggest module (10 routes, shared layout, 4 sub-archetypes under one cockpit) and carries real product scope (the Dashboard "Phase 1b" stub is not a reskin). Do last / as a parallel track. Fix is **structural** — a shared spine + KPI aggregator in `[eventSlug]/layout.tsx` replacing six orphan `<h1>` columns — not per-page. Sequence its internals: spine layout → recompose Ops → org list → host Closeout/Reports/etc. |

**Near-free tier (call out to stakeholders):** Today (#1), Invoices record side (#3), and Calendar's money-color + mobile fixes are the cheapest wins — the first two because the hard architecture already exists, Calendar because it's purely additive.

---

## 4. Shared-Kit Gaps (build once, beyond the named 8 bricks)

The audit names Avatar/StatTile/StatusPill/EmptyState/RelatedRecordCard/Menu/Tabs/Sheet. Multiple modules need these **additional** primitives — extract them with the kit, not per-module:

| Brick | Needed by | Why shared |
|---|---|---|
| **CockpitShell** (list-rail · spine · working-rail layout + master-detail routing) | Pipeline, Invoices, Catalog, Events (Clients defines it) | The layout scaffold + `clients/layout.tsx` routing pattern *is* the thing everyone "depends on the Clients cockpit" for. It doesn't exist yet — Clients must define it. Build as a reusable shell, not a Clients-only page. |
| **KpiBand** (StatTile row wrapper: spacing, responsive collapse, overflow) | Every module | Everyone lays StatTiles in a band; standardize the container so bands look identical across Today/Pipeline/Invoices/Calendar/Events. |
| **ActivityTimeline** (reverse-chron + today-divider) | Clients, Pipeline, Events | Clients hand-rolls `buildTimeline` + `todayDividerIndex`; Pipeline needs a `buildOpportunityTimeline` mirror; Events needs one too. Extract the component, keep per-module `build*Story` libs feeding it. |
| **GroupedList** (`GroupHeader` + compact `Row` + facet chips) | Clients, Vendors, Invoices, Proposals index | Every LEDGER/list-rail re-implements urgency-toned group headers and rows. Ship one, wire the facet chips to real state (Clients' current chips are dead `<span>`s — an active defect). |
| **Money / Figure** formatter + money token | Every module | Consistent tabular-nums, right-align, money color. Stops each module from styling `$` differently. |
| **InlineAddField** (the `+ Add` affordance, R6) | Every module | Proposals' `TotalsCanvas` already nails the pattern — extract it so Clients/Pipeline/Invoices/Catalog/Vendors stop rendering em-dash walls. |
| **ConfirmDialog** (replaces `window.confirm`/`window.prompt`) | Proposals, Catalog | Both use native browser prompts for destructive actions today. |

---

## 5. Per-Module One-Liners

- **Clients** *(COCKPIT, in flight)* — **the reference.** Highest-value single change: build the `clients/layout.tsx` master-detail shell + kill the `max-w-2xl` dead gutter with a working rail of `RelatedRecordCard`s.
- **Today** *(DASHBOARD)* — surface the already-computed `tiles.openPipelineValue` (and the rest) as a `StatTile` KPI band; it's the most decision-relevant figure in the app and it's currently discarded.
- **Sales Pipeline** *(COCKPIT)* — recompose `OpportunityDetailClient` from the schema-ordered `<Card>` stack into a spine with a `StatTile` figure band (est. value, days-to-event, past bookings) promoting today's buried prose.
- **Invoices** *(COCKPIT)* — give the anemic `/invoices` list an AR KPI band (Outstanding / Overdue / Drafts / Collected-30d); the record spine is already built.
- **Proposals** *(BUILDER)* — leave the builder alone; rebuild `/proposals` as a grouped LEDGER with a KPI band + per-status `StatusPill` (draft/sent/accepted/voided all look identical today).
- **Calendar** *(DASHBOARD)* — add a `StatTile` band (Events / Guests / Booked $ / Due $ / Blockers) + a needs-attention rail; the feed already computes the money the UI throws away.
- **Events & Delivery** *(COCKPIT)* — add one shared event spine (sticky header + KPI band + section Tabs + rail) in `[eventSlug]/layout.tsx`, replacing six orphan per-leaf `<h1>` columns.
- **Catalog / Packages** *(COCKPIT)* — promote the per-package **fulfillment cost + margin** (already computable from `lib/ops/derive.ts`, entirely absent today) to a `StatTile` band on a package spine.
- **Vendors** *(LEDGER)* — compute and show the org-level spend rollups (`confirmedVendorCost` exists, is never called; the Cost column is never summed) as a KPI band over a to-confirm-first grouped ledger.