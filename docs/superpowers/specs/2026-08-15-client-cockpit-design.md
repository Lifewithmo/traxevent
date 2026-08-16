# Client Cockpit — Design Spec

**Date:** 2026-08-15
**Status:** Draft for review
**Increment:** Rebuild the Clients list + client detail into a three-pane "Cockpit," at full record depth (AR + auto-activity), and establish the shared component kit that both this and the proposal builder will render from.
**Interactive mockup:** https://claude.ai/code/artifact/b0aeeb92-b403-4cce-a3f5-5ac732658536 (real tokens; toggle "Today" vs "Cockpit", click clients incl. the sparse "Tessa Lund" lead)

---

## 1. Why

The two client surfaces fail in opposite directions, and both waste space:

- **Clients list** ([components/admin/ClientsTable.tsx](../../../components/admin/ClientsTable.tsx)) — a hand-rolled flexbox pseudo-table with zero design-system primitives, bleeding edge-to-edge. The name column is `flex-1` and four metric columns are fixed-narrow, so a wide monitor strands 800–1200px of dead gutter before four skinny numbers. Filter pills are inert `<span>`s; there's no search, sort, or Add. `email`/`phone`/`tags` exist on the model and never render.
- **Client detail** ([components/admin/CustomerDetailClient.tsx](../../../components/admin/CustomerDetailClient.tsx)) — a lonely `max-w-2xl` (672px) ribbon marooned in a wide shell (~40% dead gutter). It is *not* a block-stack (it's a deliberate narrative document — keep that), but every computed figure is trapped inside one prose sentence, and the loader never fetches invoices, proposals, or activity.

The richest frame you already own is [components/admin/OpportunityDetailClient.tsx](../../../components/admin/OpportunityDetailClient.tsx) (`grid lg:grid-cols-5`, record spine `col-span-3` + working aside `col-span-2`). This spec generalizes that skeleton into a reusable frame and a shared kit.

## 2. Goal

A client Cockpit an operator runs their book of business from: a persistent client **queue** on the left, the **record** in the center, a **working rail** on the right — no page round-trips, no dead gutter, and every computed rollup promoted from prose to a scannable figure. Ship it on a shared component kit + token system that the proposal/document builder reuses next.

**Success looks like:**
- The list is a real, searchable, filterable master rail with avatars and per-row signals — never a dead-gutter spreadsheet.
- Clicking a client swaps the record live (deep-linkable URL, back returns to the queue); the rail stays mounted.
- The record leads with the operator's next decision (owed? worth a call? last touch?) via a KPI band + AR panel sourced from **real money**, then the narrative lede, pinned note, activity timeline, metadata, and related-record cards.
- A brand-new lead (sparse record) reads as intentional — empty states are the space-filler and the next action, never an em-dash desert.
- 8 kit bricks land in the shared tier, retiring the raw-color one-offs.

## 3. Scope

**In scope (this increment):**
1. Shared component kit (§6) — 8 bricks in the shared UI tier.
2. Routing refactor to a persistent master/detail (§5).
3. The master rail: rebuilt Clients list (search, real filters, avatars, container, signals).
4. The record Cockpit: sticky entity header, KPI band, narrative lede, pinned note, activity timeline, click-to-edit metadata rail, related-record cards (§4, §7).
5. Per-customer money: new invoice fetch + pure AR aggregator + AR panel + correctly-sourced money tiles (§8).
6. Day-one auto-activity: extend the `ActivityEvent.kind` union, wire five system events, aggregate the customer timeline (§9).

**Explicitly out of scope (named so the plan doesn't sprawl):**
- **Document/proposal builder** — the follow-on spec. This increment *builds the kit it will consume* but changes no proposal-rendering code.
- **Invoice-overdue-as-timeline-event** — needs net-new infra (a cron sweep or idempotent on-read stamp; [lib/invoice-status.ts](../../../lib/invoice-status.ts) derives "overdue" at read time, nothing fires on the due-date crossing). The AR panel **shows** overdue via live derivation on day one; the *timeline event* is a fast-follow.
- **Contacts-vs-Company schema** — a client stays one person + a company string. `Event.key_contacts[]` is surfaced read-only where present. A true account-with-many-contacts model is a later, separate change. (Confirm on review — §11.)
- **The tabbed "Overview Bento"** record — the center spine stays single-scroll. The frame is built so the center can later promote to tabs (header/KPI/rails persist) when a client gets heavy, but no tabs ship here.

## 4. The frame

Three panes inside the existing org shell (which keeps `AdminSidebar` + `<main>`):

```
┌ AdminSidebar ┬─────────────── clients/layout.tsx ────────────────┐
│  (org nav)   │  MASTER RAIL   │      RECORD SPINE       │  RAIL   │
│              │  ~304px        │      fluid              │ ~336px  │
│              │  client queue  │  sticky entity header   │ details │
│              │  search        │  KPI band (4 tiles)     │ +       │
│              │  filter chips  │  narrative lede         │ Jobs    │
│              │  client rows   │  pinned note            │ Props   │
│              │  (avatar,      │  activity timeline      │ Invoices│
│              │   signal)      │  + composer             │ (AR)    │
└──────────────┴────────────────┴─────────────────────────┴─────────┘
```

- **Master rail** — the client queue, always mounted. Search (name/company), real filter chips (All / Active / Leads / Past-due / Dormant), rows = avatar monogram + name + subtitle + right-aligned **signal** (owed amount in terracotta, or last-touch, or "New"). Grouping/sort reuses [lib/crm/client-list.ts](../../../lib/crm/client-list.ts) (`GROUP_ORDER = ['dormant_repeat','booked_now','never_booked']`, quiet-longest-first within group). Collapsible.
- **Record spine** — sticky entity header (avatar, name, status pill, subtitle, action cluster **Email · Call · New job · New proposal** + overflow), then KPI band, then the narrative lede (kept — it's the signature), pinned note, and the activity timeline with an inline composer. `grid lg:grid-cols-5`, spine `lg:col-span-3`.
- **Working rail** — `lg:col-span-2`: click-to-edit metadata (contact channels, tags, source, owner, booking defaults) + related-record cards (Jobs, Proposals, Invoices) with count-in-title, ≤3 preview rows, an open-balance footer, and per-card empty-state CTAs.

**Sparse-record handling (a first-class requirement, not an afterthought):** every KPI reads `$0 / — / No activity yet`; every related card shows "No proposals yet — Draft one"; unset metadata fields render as `+ Add phone` click targets; the seeded lead-created event means a new timeline is never blank.

**Responsive:** below `lg`, the working rail folds under the spine (off-canvas toggle); below the master breakpoint, the queue goes off-canvas (matching the shipped sidebar drawer); KPI tiles wrap 2-up; the record stacks action-first and hides empty context blocks rather than stacking them.

## 5. Routing architecture

**Verified answer: a nested layout — NOT parallel/intercepting routes.** Next 16.2.6 guarantees "on navigation, layouts preserve state, remain interactive, and do not rerender" ([node_modules/next/dist/docs/.../03-layouts-and-pages.md](../../../node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md)). So the master rail lives in a layout and stays mounted while only the detail swaps — with real deep-linkable URLs and "back returns to queue" falling out of the browser back stack.

Work:
1. **New `app/(admin)/[orgSlug]/clients/layout.tsx`** — async layout that `await`s `params`, resolves `orgId`, fetches the client list **once** (moved out of `page.tsx`), and renders a two-pane flex: left = the rail, right = `{children}`.
2. **`clients/page.tsx`** becomes the empty-state right pane ("Select a client from the queue"); it no longer renders the list.
3. **`clients/[customerId]/page.tsx`** stays the populated right pane; its data fetch grows (§8).
4. **`ClientsTable` → a persistent rail component** owned by the layout; keep `<Link href={/${orgSlug}/clients/${id}}>` rows.
5. **Active-row highlight** lives in a `'use client'` child of the rail using `usePathname`/`useSelectedLayoutSegment` — a layout cannot read pathname/child-segment on the server.

**Gotchas to carry into the plan (verified against the vendored docs):**
- `params` is a `Promise` (Next 15+). New layout must `await params`; client children use React `use()`.
- `cacheComponents` is **off** in `next.config.ts`, so `loading.js` will not mask the layout's own Firestore fetch. Keep the rail fetch cheap; wrap the detail child in `<Suspense>` so switching clients streams the right pane instead of blocking. The draft `unstable_instant` config is unavailable (needs `cacheComponents`).
- This is stock Next 16.2.6 routing — the verification found no TraxEvent-specific routing patch; the AGENTS.md warning cashes out here as async `params` only.

## 6. The shared component kit ("one system")

The foundation both this Cockpit and the future document builder render from. All bricks follow the existing `components/ui/` convention: **`@base-ui/react ^1.5.0`** wrappers + `class-variance-authority` + `cn()` + `data-slot` attributes (mirror [components/ui/button.tsx](../../../components/ui/button.tsx) / [badge.tsx](../../../components/ui/badge.tsx)). **Do not introduce Radix or Headless UI.** Base UI already ships Tabs, Menu, Avatar, and a Dialog base for Sheet, so five bricks wrap an existing primitive.

| Brick | Verdict | Source / basis |
|---|---|---|
| `StatTile` | **Extract** | private `Kpi()`/`KpiLabel()` in [components/admin/pipeline/PipelineStatsHeader.tsx](../../../components/admin/pipeline/PipelineStatsHeader.tsx) — lift out, replace inline `var()`/`color-mix` styles with token classes. Props `{ label, value, note, tone?, first? }`. |
| `Avatar` | **Build** (Base UI) | formalize the duplicated initials-circle in [ContactCard.tsx](../../../components/admin/opportunity/ContactCard.tsx); add image/fallback + size. |
| `EmptyState` | **Build** | replaces ad-hoc `<p>No … yet.</p>`; icon + title + description + action slot. |
| `StatusPill` | **Build** over `Badge`; **retire** [components/admin/StatusBadge.tsx](../../../components/admin/StatusBadge.tsx) | token-driven (`--status-confirmed/pending/alert/neutral`), folding in the status→label maps. StatusBadge hardcodes `bg-yellow-100/green/red/gray`, bypassing the theme. |
| `RelatedRecordCard` | **Extract** | the repeated border-row in [LeadProposalsClient.tsx](../../../components/admin/LeadProposalsClient.tsx) (echoed in LeadInvoices/LeadVendors); slots for title/subtitle/badge/href/actions + count-in-title + empty state. |
| `Tabs` | **Build** (Base UI `tabs`) | re-token the hand-rolled underline tabs from FamilySlideOver/Assignments/Reports/ops-Catalog; migrate them. (Used later for the tab-when-heavy path.) |
| `Menu`/`DropdownMenu` | **Build** (Base UI `menu`) | replace hand-rolled `role="menu"` on `useDismissable` in StageMenu + OpportunityDetailClient's overflow. |
| `Sheet`/`SlideOver` | **Build** (Base UI `dialog`, right-slide) | extract the shell from [FamilySlideOver.tsx](../../../components/admin/FamilySlideOver.tsx); re-token. |

**Location:** all eight land in `components/ui/` (the only shared tier today). Do **not** create a parallel `components/kit/`. (Confirm on review — §11.)

**Token hygiene (bake in):** `StatusBadge` and `NextActionBanner` both use raw palette classes that bypass the theme and break dark mode. `StatusPill` fixes the first; when the Cockpit reuses a `NextActionBanner`-style callout for the dormant nudge, re-token it to semantic tokens.

## 7. The record — sections

- **Entity header** — `Avatar` + name + `StatusPill` (Lead / Active / Past-due / Dormant) + subtitle. Action cluster reuses/generalizes `ContactCard`'s Email/Call and adds New job / New proposal + an overflow `Menu`. Sticky on scroll.
- **Narrative lede** — keep [lib/crm/client-story.ts](../../../lib/crm/client-story.ts). It stays the top of the spine, in a copper-tinted callout; the dormant-repeat case gets a "Draft a check-in" action.
- **Pinned note** — one highlighted note above the timeline (data model already supports customer notes).
- **Activity timeline** — §9.
- **Metadata rail** — generalize [FactsGrid.tsx](../../../components/admin/opportunity/FactsGrid.tsx) from lead-facts to customer channels/tags/source/owner/booking-defaults, click-to-edit, unset fields as `+ Add` affordances.
- **Related-record cards** — `RelatedRecordCard` for Jobs, Proposals, Invoices.

## 8. The record — data & money

The `clients/[customerId]` loader fetches **no** invoices/proposals/activity today; the KPI figures do not exist as money. This section adds them.

**KPI band — four tiles, correctly sourced:**

| Tile | Source | New work? |
|---|---|---|
| Lifetime paid | Σ `amountPaid(inv.payments)` over the customer's non-void invoices | **Yes** — needs the fetch + aggregator below. **Not** `rollupCustomer.totalWonValue` (that's *quoted* won pipeline value, not cash). |
| Open balance | Σ `invoiceBalance(inv)` over non-void invoices with balance > 0 | **Yes** — same. **Not** `openValue` (that's open-*stage* estimate, not AR). Tile tints alert only when genuinely overdue. |
| Jobs won / total | `rollup.wonCount` / `wonCount+openCount+lostCount` | No — arithmetic on already-loaded opportunities. |
| Last activity | `rollup.lastContactAt` via `formatRelativeTime` | No — maps directly. |

**Per-customer invoice fetch (new):** join by the customer's **lead ids**, not `customer_id`. `Invoice.customer_id` is only *conditionally* stamped (absent on lead-less/legacy invoices), so a raw `where('customer_id')` under-counts. Use `listLeadsByCustomerCore(orgId, customerId)` (already indexed) → collect lead ids → filter `listAllInvoicesCore(orgId)`. This also avoids a new Firestore index. Same fan-out serves proposals (which have **no** `customer_id`).

**AR aggregator (new pure fn, e.g. `lib/crm/ar-rollup.ts`):** mirror the `rollupCustomer`/`buildClientList` shape — `customerAR(invoices[]) → { invoiced, paid, outstanding, nextDueDate, overdueAmount, aging }`. Rules:
- Only `lifecycle === 'sent'` invoices are AR; exclude `draft` and `void`.
- Reuse the existing helpers — `invoiceAmountDue`, `amountPaid`, `invoiceBalance`, `tipsTotal` ([lib/invoices.ts](../../../lib/invoices.ts)), `derivePaymentStatus`/`deriveAging` ([lib/invoice-status.ts](../../../lib/invoice-status.ts)). No new balance math.
- **Derive status live** with `new Date()`; do **not** trust the stored `Invoice.payment_status` (only written on payment, never at send).
- **`nextDueDate`** = `min(due_date)` over sent invoices with positive balance (no helper exists — add it here).
- **Double-count guard:** deposits already materialize into deposit-type invoices via `reconcileProposalDeposit`, so the invoice ledger already includes paid deposits. Source all money from invoices; treat `Proposal.deposit_payment` / `ProposalEvent` purely as engagement signals, never additive AR.

**AR panel** (a related-record card, richer): per-invoice rows (number, due date, live status via `StatusPill`, balance, paid), open-balance footer, "next due" line.

## 9. Activity timeline & auto-events

**The timeline surfaces the union of the customer's own events and its opportunities' events.** Today auto-events are logged `parent_type:'opportunity'/parent_id:leadId`; a `parent_type:'customer'` query returns only manual customer notes. Rather than dual-write (which needs a migration), **aggregate on read**: fetch `listActivity(orgId,'customer',customerId)` **plus** `listActivity(orgId,'opportunity',leadId)` for each of the customer's leads, then merge by `created_at`. This mirrors the money fan-out (one architecture: the customer view aggregates its lead set) and correctly includes legacy events. A `customer_id` stamp on `ActivityEvent` (single-query optimization) is a possible future step, noted but not built.

**Extend the event vocabulary (prerequisite, do first):** `ActivityEvent.kind` ([lib/types.ts](../../../lib/types.ts)) has no `proposal`/`invoice`/`deposit` member, and [ActivityTimeline.tsx](../../../components/admin/opportunity/ActivityTimeline.tsx)'s `KIND_ICON` map is keyed exhaustively. Add the kind(s) + icon entries first — every auto-event below throws/blanks on an unmapped kind otherwise.

**Five day-one auto-events** (each is one `logActivity` call at an existing hook, after the authoritative write, best-effort — `logActivity` already swallows errors):

| Event | Hook (verified) |
|---|---|
| Proposal sent | `sendProposal` — [actions/proposals.ts:86](../../../actions/proposals.ts) |
| Proposal viewed | `recordProposalView` — [actions/proposals-public.ts:232](../../../actions/proposals-public.ts) |
| Proposal signed | `signProposal` (TODO already placed, ~:226) **and** the webhook promotion path ([app/api/payments/webhook/route.ts](../../../app/api/payments/webhook/route.ts)) — two call sites, one logical event; guard against double-log |
| Invoice paid | `recordPayment` — [actions/invoices.ts:317](../../../actions/invoices.ts); gate on the transition **to** `paid` so partial payments don't each log |
| Deposit paid | payments webhook idempotency block (~:42) — put `logActivity` inside the idempotency guard so Stripe retries don't duplicate |

(Invoice sent is a sixth cheap add if desired; **invoice overdue** is deferred — §3.) Already-logged and reused as-is: stage change, job booked, lost/waiting, task, intake form, nudge, manual notes.

**Composer:** the customer timeline gets the inline note composer (reuse `createNote`, which already supports `parent_type:'customer'`).

## 10. Space-filling principles (the law for this app)

1. Compose to the operator's next decision, never schema field-order.
2. Promote every computed rollup to a figure — never bury it in prose or 12px gray.
3. Cap the reading column; a rail or related-cards region absorbs extra width — no >200px gutter, ever.
4. Empty states do the space-filling: message + one CTA, never a blank card or em-dash wall.
5. Two densities on purpose — compact rows for lists/ledgers, generous spacing for reading surfaces.
6. Unset fields are `+ Add` affordances, not "None" rows.
7. Restraint on chrome; spend copper/moss only on links, money, and status. Validate every new frame in dark mode.
8. Mobile is action-first, reference-last, empties hidden.

## 11. Decisions to confirm on review

1. **Contact model** — one person + company string (key-contacts read-only), no schema change. Correct for v1, or do you want a real Contacts-vs-Company account model now?
2. **"Lifetime paid" = real cash** (Σ invoice payments), consistent with the "Richer" choice — confirmed over the free-but-wrong quoted `totalWonValue`.
3. **Invoice-overdue-as-event deferred** to a fast-follow (AR panel still shows overdue live). OK?
4. **Kit lives in `components/ui/`** (not a new `components/kit/`). OK?
5. **Timeline aggregates on read** (fan-out over the customer's leads) rather than dual-writing events. OK?

## 12. Testing & verification strategy

- **Pure functions test-first (TDD):** the `customerAR` aggregator (invoiced/paid/outstanding/nextDue/overdue, void+draft exclusion, deposit non-double-count, live status), the `nextDueDate` helper, and any `CustomerRollup` additions (`total`). These are the highest-risk logic; cover them before UI.
- **Kit bricks:** render/variant tests for `StatTile`, `StatusPill`, `EmptyState`, `Avatar`, `RelatedRecordCard`; migration parity checks where a brick replaces a hand-rolled instance (StatusBadge → StatusPill).
- **Auto-events:** unit-test each `logActivity` call fires once on the state transition (paid transition gate, deposit idempotency guard, signed double-path guard).
- **Browser walkthrough is mandatory, not optional.** Prior increments shipped defects that passed green tests *and* review; only the authenticated walkthrough caught them. Walk: list → search/filter → select client → live swap → sparse lead empty states → AR numbers vs seed data → dark mode → mobile off-canvas.
- **`next build` before calling any branch green** — a `'use server'` type re-export passes `tsc` but breaks `next build`; several new server actions/aggregators here risk it.
- **Subagent dispatch guard:** if implemented via subagents, each must verify `cwd` is the worktree, not the primary checkout.

## 13. Sequencing hint for the plan

Rough order (the implementation plan will make these TDD tasks): **(A)** kit bricks + token hygiene → **(B)** routing refactor (layout/rail/empty-state) → **(C)** master rail rebuild (search/filters/avatars/signals) → **(D)** per-customer fetch + `customerAR` + KPI band + AR panel → **(E)** metadata rail + related cards → **(F)** kind-union extension + timeline aggregation + composer → **(G)** the five auto-events → **(H)** browser walkthrough + `next build`. A–B–C give a shippable "list fixed + record framed" milestone even before D–G land.
