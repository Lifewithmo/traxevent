# Proposals — "Let the customer choose" (Increment 1 of the proposal level-up)

**Date:** 2026-08-04
**Status:** approved in brainstorming; feeds the implementation plan.
**Worktree/branch:** `claude/proposals` (off `main`) — isolated from the in-flight `crm-v1` work.

## Vision

Evolve today's proposal (a flat list of line items with accept/reject) toward the standard a
great proposal system targets:

> **Opportunity → Scope → Price → Options → Proposal → Customer decision → Signature → Deposit → Job.**

The product principle that orders everything: **every accepted customer selection must become
structured business data** — sell the job, and become the job, without anyone retyping it.

This spec covers **only the first increment**: *build it once, let the customer choose.* The
structured selection model, the admin builder for it, and the public page where the customer
picks a package, toggles options, sees the live total, and accepts — with the choice captured as
an immutable snapshot.

## First-principles build order (why this increment is first)

Each capability was ranked by *what must exist before it can exist*:

1. **Selection data model** — what a package / optional item / deposit term *is* as structured
   data. Bedrock: packages, sign/pay, and convert-to-work all read from this shape. → **first**
2. **Interactive customer choice** — the admin builds options; the customer selects and the
   choice is captured. This is where the buying decision physically happens and is the #1
   market differentiator. A model with no way to select is inert, so this ships *with* the model.
   → **first (this increment)**
3. **Commitment — e-sign + deposit** — depends on a correct selected total. → next increment
4. **Convert-to-work** — spawns Invoice/Event from the accepted snapshot; consumes every layer
   above. → later increment
5. **Governance & assist** — versioning/lock, cost/margin privacy, view tracking, content
   library/templates, AI drafting. Not load-bearing for the core flow. → last

**Deliberately deferred out of increment 1** (YAGNI): structured scope/content blocks (they sell
narrative, not the decision), customer-adjustable quantities, per-item tax precision,
signature/payment, convert-to-work, versioning, and cost/margin.

## CRM seating (matching the flow)

The proposal attaches to the **opportunity**. On this main-based branch the opportunity is the
existing `Lead`, keyed by `lead_id`, and accepting a proposal advances it to **`booked`** — the
same "the deal is won" semantic that the `crm-v1` branch renames to `closed_won`. The
`lead_id → opportunity_id` rename and the `booked → closed_won` rename are owned by the CRM
effort and reconcile when both branches land on `main`; this spec does **not** hard-code
`closed_won` (it does not exist on `main` and would break typecheck).

**Activity logging is a marked hook, not a dependency.** CRM's `ActivityEvent` does not exist on
`main`, so this increment logs nothing — but the send/accept/decline points carry a labeled
`// TODO(activity)` so wiring is a one-liner once that entity lands.

## Data model

`ProposalStatus` is unchanged for this increment: `'draft' | 'sent' | 'accepted' | 'rejected'`.
Split signature/payment states are *designed* (see "Later increments") but not materialized here,
so no unused fields are added.

```ts
interface ProposalPackage {
  id: string             // builder-generated (crypto.randomUUID)
  name: string           // "Good" / "Better" / "Best" (builder-named)
  description?: string
  includes: string[]     // bullet lines shown to the customer
  price: number          // the tier's all-in price (dollars)
  recommended?: boolean  // highlight one tier
}

interface ProposalLineItem {
  id: string             // NEW: stable id; a selection references it
  description: string
  quantity: number
  unit_price: number     // dollars (may be decimal)
  optional: boolean      // false = required base scope; true = customer-toggleable add-on
  taxable?: boolean      // default true (stored now; see money math)
}

interface ProposalDiscount { type: 'percent' | 'fixed'; value: number }
interface ProposalDeposit  { type: 'percent' | 'fixed'; value: number }  // captured now, collected later

interface ProposalSelection {          // the customer's captured decision (immutable snapshot)
  package_id?: string
  optional_item_ids: string[]
  selected_total: number               // recomputed server-side, never trusted from the client
  selected_at: string                  // ISO
}

interface Proposal {
  id: string
  org_id: string                       // denormalized for collectionGroup token lookups
  lead_id: string                      // the opportunity id (→ opportunity_id later)
  token: string                        // unguessable public link token
  title?: string
  notes?: string
  status: ProposalStatus
  packages?: ProposalPackage[]         // if present (max 3), the customer must pick exactly one
  line_items: ProposalLineItem[]       // required + optional
  discount?: ProposalDiscount
  tax_rate?: number                    // percent, e.g. 8.25
  deposit?: ProposalDeposit
  expires_at?: string                  // ISO; DISPLAY-ONLY in this increment (not enforced)
  selection?: ProposalSelection        // set on accept
  client_response_at?: string
  created_at: string
  updated_at?: string
}
```

**Mode** is implicit in the data, surfaced as a builder toggle:

- **Itemized** (default): `packages` empty. Base = sum of *required* line items; optional items add on.
- **Packaged**: `packages` non-empty (up to 3; 2–3 is the norm). Base = the selected package
  price; optional line items add on. A proposal is "packaged" iff `packages` is non-empty.

## Money math (pure helpers in `lib/proposals.ts`)

Deliberately simple for this increment:

```
base      = packaged ? selectedPackage.price : sum(required line items)
addons    = sum(selected optional line items' subtotals)
subtotal  = base + addons
discountA = discount.type === 'percent' ? subtotal * value/100 : min(value, subtotal)
taxable   = subtotal - discountA                       // whole discounted subtotal taxed in inc1
taxA      = taxable * (tax_rate ?? 0) / 100
total     = subtotal - discountA + taxA
depositDue= deposit ? (deposit.type === 'percent' ? total * value/100 : min(value, total)) : 0
```

The per-item `taxable` flag is stored but not yet honored in the tax computation (precise
per-item tax is deferred). All money rounds to cents via the existing `round2` helper.

New/updated helpers:

- `lineItemSubtotal(item)` — existing; non-positive qty/price → 0.
- `computeSelectedTotal(proposal, selection): number` — the authoritative total above. Used by the
  public page (live) **and** the server (on accept).
- `proposalRange(proposal): { min: number; max: number }` — for the builder preview strip:
  `min` = cheapest base + no add-ons; `max` = dearest base + all add-ons (both through discount/tax).

## The two surfaces (mirror images)

### Admin builder — evolve `components/admin/ProposalEditorClient.tsx` (do not rewrite)

- **Details**: title, notes, expiration (display-only).
- **Mode**: Itemized ⇄ Packaged toggle.
- **Packages** (Packaged only): add up to **3** tiers — name, description, `includes` bullet lines,
  price, "recommended" star; reorderable. Cap enforced at 3.
- **Line items**: the existing table gains an **optional?** toggle per row. In Packaged mode rows
  are add-ons only (optional forced true).
- **Pricing terms**: discount (percent/fixed), tax rate, deposit term (percent/fixed).
- **Preview strip**: the customer-facing figure — a single total (Itemized) or a **range**
  (Packaged, e.g. "$12,500–$22,400") via `proposalRange`.
- Existing Save / Send / Delete / copy-share-link unchanged.
- New package/line-item ids are generated client-side (`crypto.randomUUID`); existing proposals
  have their line-item ids backfilled on first save.

### Public selection page — evolve `components/proposals/ProposalResponseClient.tsx`

- Title + notes.
- **Packaged**: tier **cards** (name, price, `includes` bullets, recommended badge) as a
  single-select; cards stack on mobile.
- **Optional add-ons**: labeled checkboxes with prices.
- **Sticky running total** updating on every selection (`computeSelectedTotal`), with the deposit
  amount shown as an informational line ("Deposit due on acceptance: $X").
- **Accept / Decline.** Accept requires a tier selection when Packaged; on success the selection
  locks and the total freezes into the snapshot. Decline is unchanged.

All screens mobile-responsive (single-column stacking).

## Actions & security

### Admin actions (`actions/proposals.ts`)

`CreateProposalInput` / `ProposalUpdate` grow to carry `packages`, `line_items` (with `id` +
`optional`), `discount`, `tax_rate`, `deposit`, `expires_at`. Pass-through only; `assertOrgAdmin`
gate unchanged. Ids arrive from the builder.

### Public actions (`actions/proposals-public.ts`)

- `getPublicProposal(token)` — the `PublicProposal` projection **grows** to include everything the
  customer must see to choose (`packages`, `line_items`, `discount`, `tax_rate`, `deposit`,
  `expires_at`, `title`, `notes`, `status`, `selection`, `created_at`) and **still omits**
  `token` / `org_id` / `lead_id` / `id`. Drafts still return `null`.
- `respondToProposal(token, response, selection?)` — on accept, the selection is **validated and
  recomputed server-side**:
  - `package_id`, when present, must be one of *this* proposal's package ids; it is **required**
    when the proposal is packaged.
  - every `optional_item_id` must be an **optional** line item on *this* proposal.
  - `selected_total` is recomputed via `computeSelectedTotal` — the client-sent total is ignored.
  - the snapshot is stored; `status → accepted`; `client_response_at` set; the opportunity
    advances to `booked` (existing behavior). Decline needs no selection.

**Security invariants preserved:** token = authorization; drafts never public; only a `sent`
proposal accepts a response (double-accept still throws, no writes); a selection can only
reference the proposal's own ids; totals are server-authoritative; no cross-tenant writes (the
lead is resolved via `ref.parent.parent`, never client input).

## Compatibility (no migration script)

Every new field is optional, so existing proposal docs stay valid. Readers are **tolerant**:
missing `optional` reads as `false` (required); computation never depends on item `id` (only
selections reference ids, and old docs have no selectable options). The builder backfills ids on
first save. Pre-launch minimal data → no batch migration.

## Testing (follows the existing pattern)

- **Pure helpers** (`__tests__/lib/proposals.test.ts`): `computeSelectedTotal` across itemized
  base, package base, add-ons, percent/fixed discount, tax, and deposit; `proposalRange` min/max;
  tolerant handling of legacy items (no `optional`).
- **Public actions** (`__tests__/actions/proposals-public.test.ts`) — security-critical:
  projection includes the new customer-facing fields and omits internal ones; `respondToProposal`
  rejects a `package_id`/`optional_item_id` not on the proposal, requires a tier when packaged,
  recomputes the total ignoring a bogus client total, stores the snapshot, and advances to
  `booked`.
- **Admin actions** (`__tests__/actions/proposals.test.ts`): create/update pass-through of the new
  fields.
- **UI components**: no new vitest (consistent with the repo); verified via `tsc --noEmit` +
  `next build`.
- **Green gate** each task: `npx tsc --noEmit` clean **and** `npm test` green (run `npm install`
  first if the suite shows `server-only` load failures — a node_modules sync quirk). All work on
  the `claude/proposals` worktree/branch; never commit to `main`.

## Out of scope — later increments

- **Increment 2 — Commitment:** acceptance/e-signature + deposit collection via Stripe (already in
  the stack), materializing the split `signature_status` / `payment_status` states so the proposal
  lifecycle, signing, and paying are tracked independently (the doc's "don't overload one status"
  rule).
- **Increment 3 — Convert-to-work:** on acceptance, auto-create Invoice / Event (and later
  Contract) from the accepted snapshot, inheriting scope, package, options, quantities, price,
  notes, and deposit — nothing retyped. The product's key differentiator.
- **Increment 4+ — Governance & assist:** versioning with a locked accepted version, internal
  cost/margin with permission-gated display, view/engagement tracking, content-library/templates,
  and AI scope drafting / quality checks. Enforced expiration also lands here.

## Principles

- **Restraint:** one clear decision per surface; the builder mirrors the buyer view so "customer
  preview" is nearly free later.
- **Reuse:** evolve the existing proposal actions, helpers, and two components — do not rewrite.
- **Server-authoritative selection:** the accepted total is always recomputed on the server; the
  accepted proposal is an immutable snapshot of exactly what was sold.
