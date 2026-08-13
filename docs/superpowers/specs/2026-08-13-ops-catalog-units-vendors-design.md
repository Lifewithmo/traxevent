# Ops Catalog: Units, Recipes, Vendor Price Books, and AI Intake — Design

**Date:** 2026-08-13
**Status:** Approved pending user review
**Builds on:** `2026-08-05-multibrand-ops-platform-design.md` (ops-core), `2026-08-07-operator-ai-design.md` (operator AI), PR #60 (AI proposal drafting)

## 1. Purpose

Make the operations layer a real system of record — recipes, units, conversions, vendor sourcing — while keeping the floor at zero: an operator who only wants name-and-price packages never sees any of it. Each capability activates by use, not by configuration. Depth is optional; accuracy is not.

Guiding principles:

- **Deterministic core, AI at the edges.** All runtime math (conversions, rollups, costing, pricing) is pure arithmetic. AI populates parameters and drafts data; it never computes quantities or prices at runtime.
- **No manual conversion configuration.** Universal conversions are built-in code. Ingredient-specific conversions are AI-inferred, operator-editable, never required.
- **Never guess, never block.** Missing data degrades to the entered value plus a soft nudge. Nothing corrupts, nothing halts.
- **Evolve in place.** Extend `work_packages`, `resources`, `vendors`, and `ProposalLineItem`. No parallel subsystem, no migration for existing orgs.

## 2. Out of scope

- On-hand inventory / stock levels / deduction on closeout (ops-core deferral stands)
- Purchase orders sent to vendors (shopping lists are generated for the operator; ordering is offline)
- Client-facing exposure of any of this (proposals show packages and prices as today; recipes/costs are operator-only)
- Labor costing (the `labor` line kind remains the recorded stub it is today)

## 3. Units and the conversion engine

### 3.1 Quantities

Every physical quantity becomes a pair: `{ qty: number, unit: string }`. Bare numbers remain only for genuinely unitless counts (e.g., `equipment` line `qty`, which is implicitly `each`).

### 3.2 Dimensions and the universal table

Units belong to exactly one **dimension**:

| Dimension | Canonical unit | Built-in units |
|---|---|---|
| volume | ml | ml, L, fl-oz, cup, pint, quart, gal |
| weight | g | g, kg, oz, lb |
| count | each | each, dozen |

The table lives in `lib/ops/units.ts` as code with exact factors. It is never stored in Firestore, never org-configurable, never touched by AI. Within a dimension, any unit converts to any other exactly.

### 3.3 Ingredient conversion bridges

`OpsResource` gains:

- `dimension: 'volume' | 'weight' | 'count'` — the ingredient's fundamental measure (beans: weight; milk: volume; cups: count). For legacy docs without the field, it is inferred on read from the existing `unit` string when that unit is in the universal table (e.g. 'oz' → weight, 'gal' → volume), defaulting to `count` otherwise; the inferred value is persisted on next save.
- `conversions?: ConversionBridge[]` where:

```ts
interface ConversionBridge {
  from: { qty: number; unit: string };  // e.g. { qty: 1, unit: 'lb' }
  to: { qty: number; unit: string };    // e.g. { qty: 40, unit: 'shot' }
  source: 'ai' | 'operator';
  note?: string;                        // AI's stated basis, e.g. "18g dose per double shot"
}
```

One shape covers all three non-universal conversion kinds:

- **Density** (weight↔volume): `1 lb beans → 6.1 cup`
- **Yield** (input→output): `1 lb beans → 40 shot`
- **Custom serving units** (defined per ingredient, per org): `1 keg → 124 pint`, `1 shot → 2 fl-oz`

Custom units (`shot`, `serving`, `keg`, `batch`…) exist only as bridge endpoints on a specific ingredient — there is no global custom-unit registry. Two ingredients can define `shot` differently without conflict.

### 3.4 Conversion resolution

`convert(resource, {qty, unit}, targetUnit)` walks a graph whose edges are the universal table plus the resource's bridges (bridges traverse in both directions). Resolution:

1. Path found → exact arithmetic, return converted quantity.
2. No path → return `null`. Callers display the quantity in its entered unit and surface a soft "needs a conversion" nudge. The AI assistant can resolve the nudge on request (proposing a bridge as a draft). **Nothing blocks.**

Ambiguity rule: if multiple paths exist, shortest path wins; ties broken by preferring operator-sourced bridges over AI-sourced. In practice bridge sets are tiny (0–3 per ingredient).

### 3.5 Display

Rollup totals render in the most human unit of the ingredient's dimension, **within the unit system (metric vs US) of the ingredient's display unit**: largest such unit where the quantity is ≥ 1 (display unit 'gal': 5,678 ml → "1.5 gal"; display unit 'oz': 380 g → "13.4 oz", never "0.38 kg"). Exception: count totals always render as `each` — "12.5 dozen" is not a human quantity; `dozen` is an input convenience only. Entered quantities always render as entered.

## 4. Recipes and packages

### 4.1 Unit-aware lines

`WorkPackageLine` (consumable kind) changes from a bare per-guest ratio to unit-aware quantities:

- `qty_per_guest: { qty: number; unit: string }`
- `base_qty?: { qty: number; unit: string }`

Existing data (bare numbers) is read as `{ qty: n, unit: resource.unit }` — the current display unit becomes the assumed unit, so no migration write is needed; documents upgrade on next save.

### 4.2 Sub-package lines (recipes)

A new line kind lets a package include another package as a component:

```ts
{ kind: 'package'; package_id: string; qty: { qty: number; unit: string } }
```

paired with an optional `yield` on `WorkPackage` itself:

```ts
yield?: { qty: number; unit: string }   // e.g. { qty: 53, unit: 'serving' } — one batch serves 53
```

A package with a yield **is** a recipe ("Cold Brew Batch: 1.5 lb coarse grounds + 2 gal water → yields 53 serving"). A parent line like `{ package_id: coldBrew, qty: {qty: 120, unit: 'serving'} }` resolves to ceil(120/53) = 3 batches, and the batch's own ingredient lines scale accordingly. There is no separate Recipe entity and no new nav item — "Menu Packages" (per-vertical label via `catalogLabel`) deepens for those who use it.

Nesting depth is capped at 3; cycles are rejected at save time.

### 4.3 Derive engine

`lib/ops/derive.ts` keeps its contract (guest count → resource needs → cost/closeout) with these changes:

- Expand sub-package lines recursively (respecting yields and ceil-to-whole-batch).
- Convert all quantities for a resource to its canonical unit before merging; unconvertible quantities merge into a separate per-unit bucket rather than being dropped, and carry the nudge flag.
- `Math.ceil` applies only to count-dimension totals and whole-batch/pack roundings — not to continuous volume/weight totals.
- Cost per line = quantity converted to the unit the cost is denominated in × unit cost (see §5). No conversion path to the cost unit → cost is omitted from rollup and flagged, never guessed.

## 5. Vendor price books

### 5.1 Org-level vendors

`Vendor.lead_id` becomes optional. Vendors without a `lead_id` are org-level suppliers; deal-scoped vendors continue to work unchanged, and an org-level vendor can additionally be attached to deals. The existing `AllVendorsTable` gains an "org suppliers" grouping; no vendor data migrates.

### 5.2 Vendor items

New subcollection `orgs/{orgId}/vendors/{vendorId}/vendor_items`:

```ts
interface VendorItem {
  id: string;
  name: string;               // vendor's product name, e.g. "House Espresso Blend 5lb"
  sku?: string;
  pack_size: { qty: number; unit: string };   // { qty: 5, unit: 'lb' }
  pack_price: number;         // dollars per pack
  resource_id?: string;       // mapped ingredient; unmapped items are allowed
  last_seen?: string;         // ISO date of most recent invoice/price-book evidence
}
```

This is the vendor's own catalog — their SKUs, their pack sizes, their prices — mapped onto the org's ingredient list.

### 5.3 Derived costing

Ingredient `unit_cost` resolution order:

1. Cheapest current mapped `VendorItem`: `pack_price / pack_size` converted to the resource's canonical unit
2. Manually entered `unit_cost` (today's field, unchanged)
3. None → costing simply absent for that ingredient (flagged in rollups, never zero-filled)

The resolved cost records its provenance so the UI can show "from Roaster Co @ $14.50/lb" vs "manual".

### 5.4 Shopping lists

On an event's Ops tab, when derive produces resource needs and those resources have mapped vendor items: needs ÷ pack size, ceil to whole packs, grouped by vendor — "Roaster Co: 2 × 5-lb House Espresso Blend ($29.00) · Costco: 3 × 1-gal Whole Milk ($11.37)". Resources without vendor mappings list under "unsourced" with their raw quantities. Read-only output; no PO workflow.

## 6. AI intake — one door

### 6.1 Entry point

One affordance on the catalog page: **"Build my catalog"** (empty state) / **"Add to catalog"** (populated). The operator types, pastes, or uploads anything — business description, menu text, price sheet, spreadsheet, vendor invoice or price-book photo/PDF. **No mode picker, no import-type wizard.** The AI classifies the input and proposes the appropriate writes:

| Input looks like | AI proposes |
|---|---|
| Business/menu description | Packages with prices; ingredients with dimensions; recipe lines with units; conversion bridges (density, yields, serving sizes) |
| Menu / price sheet / spreadsheet | Items and prices extracted; recipes inferred only where obvious |
| Vendor invoice / price book | The vendor (org-level); `vendor_items` with pack sizes and prices; mappings to existing ingredients or proposals for new ones |

Mixed inputs produce mixed proposals. Follow-ups are conversational ("a batch makes 45, not 53" edits the pending bridge).

### 6.2 Draft-review-save

Same pattern as proposal drafting (PR #60): the AI's output is a reviewable draft; nothing persists until the operator saves. Ids for proposed entities are minted server-side. The existing grounding layer (`lib/ai/grounding.ts`) serializes the current catalog (now including dimensions, bridges, vendor items) into context so the AI extends rather than duplicates, and matches invoice items to existing ingredients by name.

### 6.3 Floor respect

If the operator provides only names and prices ("latte $6, cold brew $5"), the AI creates price-only packages. It does not invent ingredients, recipes, or conversions that weren't implied by the input. Enrichment is offered as a follow-up question, not performed silently.

### 6.4 Validation at the boundary

Every AI proposal is validated before it becomes a draft:

- Units must exist in the universal table or be introduced via a bridge on the same proposal
- Bridges must be dimensionally coherent: cross-dimension bridges (weight→count) are the point and are allowed; same-dimension bridges that contradict the universal table (1 oz = 2 lb) are rejected
- `resource_id` / `package_id` references must resolve to existing docs or drafts in the same proposal
- Prices/quantities must be positive finite numbers

Failed items are dropped from the draft with a visible note; a partially valid proposal still renders. AI output can never corrupt the catalog.

## 7. Proposal correlation

### 7.1 Catalog references

`ProposalLineItem` gains one optional field:

```ts
catalog_ref?: { kind: 'work_package' | 'resource'; id: string };
```

Free-text line items work forever; the reference is purely additive. Deleting a catalog item leaves the proposal line intact (the ref dangles harmlessly; UI shows "no longer in catalog").

### 7.2 What the reference enables

- **Price drift nudge** — if the referenced package's catalog price differs from the line's `unit_price`, the builder shows a soft "catalog price is now $X" with one-click adopt. Never a silent change; sent proposals never mutate.
- **Guest-count math** — referenced package lines can recompute quantity/cost through derive when the proposal's guest count changes (opt-in per recompute, shown as a suggestion in the builder).
- **True margin** — for referenced lines with costed ingredients, the builder shows cost and margin per line and per proposal, operator-only.
- **Clean convert-to-work** — on conversion, referenced work_packages flow into the ops plan's `package_ids`, closing the current gap where proposal packages and ops packages are unrelated objects.

### 7.3 AI drafting upgrade

`generateProposalDraft` emits `catalog_ref` on lines it grounds in the catalog, making drafts structurally grounded instead of only textually. The existing "never invent prices" rule stands.

## 8. Progressive disclosure — the floor stays clean

The price-only operator: create package → name + price → done. Proposals and invoices work end to end. They never see units, ingredients, vendors, conversions, margins, or shopping lists.

Layers activate **by data, not by settings**:

| Operator does | System reveals |
|---|---|
| (nothing beyond name+price) | Nothing — package cards show name/price/guests only |
| Adds ingredients to a package | Quantities, event rollups ("pack the van") |
| Adds costs or a vendor price book | Margins on packages and proposals |
| Adds a vendor invoice | Shopping lists on events |

Empty layers are invisible layers: sections render only when populated, plus one quiet affordance ("Add ingredients") per package. There is no mode switch, no org-level feature toggle beyond the existing industry-pack module gating.

## 9. Error handling summary

| Condition | Behavior |
|---|---|
| No conversion path | Show entered unit; soft nudge; excluded from merged canonical total (kept in per-unit bucket) |
| No cost for an ingredient | Cost rollup omits it and says so; never zero-filled |
| AI proposes invalid unit/bridge/ref | Item dropped from draft with visible note; rest of draft survives |
| Recipe cycle / depth > 3 | Rejected at save with a clear message |
| Catalog item deleted after proposal references it | Proposal line unaffected; ref marked stale in builder |
| Catalog price changes after proposal drafted | Nudge in builder; sent proposals immutable |

## 10. Testing

- **Unit table & convert()**: exhaustive pure-function tests — round trips, cross-dimension via bridges, shortest-path/tie-break, null on no-path.
- **Derive**: sub-package expansion, yield ceiling, mixed-unit merging, unconvertible bucketing, cost provenance ordering, legacy bare-number lines read as display-unit quantities.
- **Validation boundary**: rejects contradictory same-dimension bridges, unresolvable refs, non-finite numbers; partial-draft survival.
- **Proposal**: drift nudge triggers, dangling ref rendering, convert-to-work carries package_ids.
- AI intake behavior (classification, floor respect) is verified with prompt-level eval fixtures, not runtime tests — runtime only ever sees validated drafts.

## 11. Increments (for planning)

1. **Units core** — unit table, `dimension`, bridges, `convert()`, unit-aware package lines, derive upgrade. (Foundation; invisible to floor users.)
2. **Recipes** — sub-package lines, yields, rollup UI on packages and event Ops tab.
3. **Vendor price books** — org-level vendors, vendor_items, derived costing, shopping lists.
4. **Proposal correlation** — `catalog_ref`, drift nudges, margin display, convert-to-work wiring.
5. **AI intake** — one-door build/add flow with validation boundary. (Depends on 1–3 for what it can propose; can ship a menu-only subset after 1.)
