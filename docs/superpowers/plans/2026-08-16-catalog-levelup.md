# Catalog / Packages Level-Up Implementation Plan

**Goal:** Level up the Catalog/Packages module onto the shared UI kit. Module 3 of the rollout, after the Client Cockpit (PR #90) and Today (PR #91).

**Archetype:** COCKPIT-lite. Packages is the working surface; Ingredients/Checklists are LEDGERs beside it. **No new routes** — `/catalog` (section landing) and `/packages` (working page) stay exactly where they are; the sidebar suites pin both routes and the child order.

## The marquee-figure correction (read this first)

The playbook says per-package **"fulfillment cost + margin" is already computable from `lib/ops/derive.ts`**. An adversarial verification pass **refuted that**:

- **Labor is structurally uncostable.** `WorkPackageLine`'s labor variant is `{ kind: 'labor'; role: string; count: number }` (`lib/types.ts:940`) — no rate, no hours. `grep -rniE 'hourly|wage|labor_rate|labor_cost|rate_per|pay_rate'` over `actions lib components app scripts` returns **zero** matches. `derive.ts:201` skips every non-consumable line. For a mobile-beverage business, two baristas for four hours *is* the cost. Adding a rate is a data-model change, not presentation.
- **A package has no guest count.** Cost is per-guest (`qty_per_guest`); the only capacity field is the *optional* `max_guests`. Real guests live on the event (`OpsPlan.requirements.guests`).
- **Missing `unit_cost` degrades silently to $0** with no gap flag (`derive.ts:203-204`; pinned by `__tests__/lib/ops/derive.test.ts:174-179`), so an org that never entered costs is indistinguishable from a genuinely costless package.
- **Run on the org's own seed data** (`scripts/seed/brewtrax-data.ts:387-419`), a naive margin tile prints **91.4%** for Espresso Bar and **98.0%** for Cold Brew — and Cold Brew's bill of materials contains only cups (the coffee is not a line). A marquee "98% margin" in a product whose pitch is costed proposals is credibility-destroying.

**Decision: ship the honest figure.** Promote **Materials** (consumables only, at stated capacity, labor excluded) — never a "cost" or "margin" headline — and turn the missing-cost gap into an actionable **Uncosted ingredients** tile + working rail. `CloseoutSummary.actual_consumable_cost` / `actual_margin` must **never** be surfaced here: with `actual_consumables: []` they resolve to the full sticker price.

## Global Constraints

- Kit bricks only (`KpiBand`, `StatTile`, `StatusPill`, `EmptyState`, `Menu`, `RelatedRecordCard`, `Avatar` from `components/ui/`). Two kit gaps are real and get built here: **`Tabs`** and **`ConfirmDialog`**.
- Semantic tokens only. The module has **~15 raw Tailwind color literals and zero token usage** today (`text-gray-500/600/700`, `text-red-600`, `border-gray-300`, `border-gray-900`, `text-gray-400`) — all must go.
- **Presentation-only:** no schema change, no new writes, no new queries. The one addition is `lib/ops/catalog-costing.ts`, a pure derived-view module over data the loader **already fetches** (`listResources` + `listWorkPackages` are both already in `packages/page.tsx:17-22`). Zero extra reads.
- Money: use `formatMoney` from `lib/utils.ts` (`$900.00`) — the existing tests assert that exact form. Do **not** switch this module to the `$${n.toLocaleString()}` convention the reference modules use locally.
- Never hardcode "Packages": the heading and first tab label come from the `title` prop (`catalogLabel(getIndustryPack(org.industry_pack_id))` → "Menu Packages" | "Service Packages" | "Rental Packages" | "Packages"). The sidebar derives its label from the same function; hardcoding desyncs nav from page.
- `actions/*.ts` are `'use server'` — never re-export a type from one (`next build` breaks; `tsc` passes). Types come from `lib/`.
- **Run tests as** `npx vitest run <paths> --exclude '**/.claude/**'` — without it vitest collects 11,058 files from worktrees.

## Do-not-break contract (verified invariants)

1. **`toCreateInput` OMITS unset optionals; `toUpdateInput` sends `null`.** They are not interchangeable — `null` maps to `FieldValue.delete()` (`lib/ops/work-packages.ts:106`); omitting means "leave untouched", so a cleared field could never be removed. `PackagesTab.test.tsx:60-65` asserts create is called with **exactly** `{name, price, lines, checklist_template_ids}`; `:103-105` asserts `max_guests: null` on update.
2. **Package delete is a SOFT warning, deliberately** — there is no reverse index of ops plans, so it cannot be hard-blocked. The warning copy must survive verbatim (test matches `/events already set up with it will fail/i`).
3. **Resource delete IS a hard block.** In-use resources render a **disabled native `<button>`** found by `aria-label={`Delete ${r.name}`}` with a `title` tooltip (`ResourcesTab.test.tsx:55-56` asserts `toBeDisabled()`). Keep it an inline disabled button — **do not** move it into a portal-mounted `Menu`, where the disabled state stops being visible or assertable.
4. **"None selected = every template for your industry runs"** — empty `checklist_template_ids` is *meaningful*. Keep the native checkbox per template with `aria-label={`Attach ${t.name}`}`, and keep the explanatory line.
5. **`linesComplete` gates Save** — behavior, not presentation. Keep it verbatim; the test walks enablement step by step.
6. **`edit()` normalizes legacy bare-number quantities** into `Quantity` via `asQuantity`. Dropping it corrupts old docs on save.
7. **`isAdmin` gates three separate branches** in PackagesTab (row actions, "New package", the draft form) and the write controls in the other two tabs.
8. **Consumable dropdown lists only `kind === 'consumable'`; equipment lists everything else.**
9. **Error surface:** every mutation sets `saving`, clears `error`, catches, and renders `err.message`. The server throws operator-readable strings ("Unknown resource: …", "Quantities must be positive"). Keep them rendered and keep `disabled={saving}` on destructive/save controls.
10. **Checklist phase grouping** iterates `CHECKLIST_PHASES` order and renders **nothing** for an empty phase. `'Built-in'` and `'Custom'` must each appear exactly once per matching row (singular `getByText`).
11. **Server action names/arities are locked** by `vi.mock` factories: `createWorkPackage(orgId, input)`, `updateWorkPackage(orgId, id, updates)`, `deleteWorkPackage(orgId, id)`, `createChecklistTemplate(orgId, {...})`, `deleteChecklistTemplate(orgId, id)` — **the checklist actions live in `actions/work-packages.ts`** — `createResource(orgId, input)`, `updateResource(orgId, id, updates)`, `deleteResource(orgId, id)`.
12. **Resource unit-cost edit is uncontrolled** (`defaultValue` + `onBlur` + equality guard): blurring an unchanged value must **not** call `updateResource`.
13. **Tab switching must stop destroying child state.** Today, switching unmounts the other tabs, discarding an in-progress draft *and* any optimistically-created row (remount re-seeds `useState` from the original server props). Fix with `keepMounted` on the kit `TabsPanel` — **not** by lifting state (which would change PackagesTab's contract).

---

## Wave 1 — four parallel tasks, no interdependencies

### Task 1: kit `Tabs` primitive

**Files:** create `components/ui/tabs.tsx`, `__tests__/components/ui/tabs.test.tsx`

Wrap `@base-ui/react/tabs` (present at `node_modules/@base-ui/react/tabs`, v1.5). Mirror the structure and token vocabulary of `components/ui/menu.tsx`.

Exports: `Tabs` (Root), `TabsList`, `TabsTab`, `TabsPanel`, `TabsIndicator`. Props pass through Base UI's (`BaseTabs.Root.Props` etc.) so `value` / `onValueChange` / `keepMounted` all work.

Styling: list is a bottom-bordered strip (`border-b border-border`) that **scrolls horizontally rather than wrapping** (`overflow-x-auto` + `whitespace-nowrap`) — tab 1's label is variable-length industry copy and the row overflows on narrow viewports today. Tab: `text-sm font-medium px-3 py-2 text-muted-foreground data-[selected]:text-foreground` with a `-mb-px border-b-2 border-transparent data-[selected]:border-foreground` underline. No raw grays.

Test: renders tabs with `role="tab"`, clicking switches the visible panel, `keepMounted` keeps the inactive panel in the DOM (assert via a hidden panel node), and Base UI supplies `aria-selected` + `aria-controls`/`role="tabpanel"` wiring.

### Task 2: kit `ConfirmDialog`

**Files:** create `components/ui/confirm-dialog.tsx`, `__tests__/components/ui/confirm-dialog.test.tsx`

Replaces `window.confirm` (playbook's zero-confirm gate; 3 call sites in this module). Build on the existing `components/ui/dialog.tsx` (`Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter`/`DialogClose`).

```tsx
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Confirm',
  cancelLabel = 'Cancel', destructive = false, busy = false, onConfirm,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  title: string; description?: React.ReactNode
  confirmLabel?: string; cancelLabel?: string
  destructive?: boolean; busy?: boolean; onConfirm: () => void | Promise<void>
})
```

Confirm button uses `variant={destructive ? 'destructive' : 'default'}` (verify that variant exists in `components/ui/button.tsx`; if not, use `default` plus `text-destructive` on a `variant="outline"` — do not invent a variant). Closes on confirm and on cancel; `busy` disables both.

Test: renders title/description when open, fires `onConfirm` on the confirm button, does not fire on cancel, and both buttons disable when `busy`.

### Task 3: `lib/ops/catalog-costing.ts` — the honest costing module

**Files:** create `lib/ops/catalog-costing.ts`, `__tests__/lib/ops/catalog-costing.test.ts`

Pure module — imports only `@/lib/types` and `@/lib/ops/derive`. **No firebase imports**, exactly like `derive.ts`.

```ts
export type UncostedReason = 'no-capacity' | 'no-costed-ingredient' | 'no-consumables'

export interface PackageCosting {
  id: string
  price: number
  costed: boolean          // false => render an em dash, NEVER "$0.00"
  basis?: number           // guests used (p.max_guests); undefined when not costed
  materials: number        // CONSUMABLES ONLY — excludes labor and equipment
  gaps: string[]           // resource names with a unit_cost but no conversion path
  reason?: UncostedReason  // why costed === false
}

export function computeCatalogCosting(packages: WorkPackage[], resources: OpsResource[]): PackageCosting[]
export function uncostedConsumables(resources: OpsResource[]): OpsResource[]
export function priceRange(packages: WorkPackage[]): { min: number; max: number } | undefined
```

`computeCatalogCosting` maps each package: if it has no consumable line → `reason: 'no-consumables'`; else if no referenced resource has a `unit_cost` → `'no-costed-ingredient'`; else if `max_guests === undefined` → `'no-capacity'`. Only when all three pass, call
`computeCloseoutSummary({ packages: [p], resources, guests: p.max_guests, actual_consumables: [], sales: 0 })`
and read **only** `planned_consumable_cost` and `cost_gaps`. **Never read `actual_consumable_cost` or `actual_margin`** — with empty actuals they equal the full sticker price.

`uncostedConsumables` = `resources.filter(r => r.kind === 'consumable' && r.unit_cost === undefined)`.
`priceRange` returns `undefined` for an empty array (guard before spreading into `Math.min`).

TDD: costed package returns real materials + basis; package with no `max_guests` returns `costed:false, reason:'no-capacity'`; package whose ingredients have no `unit_cost` returns `'no-costed-ingredient'`; equipment/labor-only returns `'no-consumables'`; an unconvertible costed line surfaces in `gaps`; `priceRange([])` is `undefined`.

### Task 4: `/catalog` section landing recompose

**Files:** `app/(admin)/[orgSlug]/catalog/page.tsx`; update `__tests__/app/overview-pages.test.tsx`

Today: uncapped `p-6` (rows stretch edge-to-edge at 1920px), a **hand-rolled StatTile** (lines 44-64: mono uppercase label + 32px tabular figure — this *is* `StatTile`, reimplemented), a hand-rolled `<ul>`, and a row of bare underlined links.

Rebuild:
1. Shell `mx-auto w-full max-w-7xl p-6` (mirrors `TodayClient`'s `mx-auto ... max-w-7xl`).
2. `<KpiBand>` of four `StatTile`s from the `CatalogOverview` counts already fetched: **{packagesLabel}** `o.packageCount` · **Vendors** `o.vendorCount` · **Forms** `o.formCount` · **Documents** `String(o.expiring.length)`, tone `expired.length > 0 ? 'alert' : 'default'`, keeping today's note copy.
3. Expiring documents as `RelatedRecordCard` rows (title = doc name, `badge` = `StatusPill` toned `alert` when `daysLeft < 0` else `pending`, carrying the existing "expired N days ago" / "N days left" copy).
4. Empty state → kit `EmptyState` with **one CTA** (link to `/${orgSlug}/packages`), replacing the bare prose paragraph. Keep the four section links rendered in both states — a brand-new org must still be able to navigate.

**Preserve exactly** (pinned by tests): the link hrefs `/acme/vendors`, `/acme/forms`, `/acme/compliance` and their accessible names; the strings `'All current — nothing expiring in the next 60 days'` and `'Expiring within 60 days'`. Update `__tests__/app/overview-pages.test.tsx` only where markup genuinely moved, and add an assertion that the KPI band renders.

**Do not** change which links render. The audit found a real module-gating mismatch (this page links to `/packages` and `/compliance` unconditionally, but the sidebar hides both for the `general` pack) — out of scope here, reported separately.

---

## Wave 2 — four parallel tasks, after Wave 1 is integrated

### Task 5: `CatalogClient` shell — header, KPI band, kit Tabs

**Files:** `components/admin/ops/CatalogClient.tsx`, `app/(admin)/[orgSlug]/packages/page.tsx`; create `__tests__/components/admin/ops/CatalogClient.test.tsx` (**none exists today** — the shell is entirely untested)

1. **Loader** (`packages/page.tsx`): after the existing `Promise.all`, compute `const costing = computeCatalogCosting(packages, resources)` and pass it to `CatalogClient` as a new `costing: PackageCosting[]` prop. No new fetches.
2. **Shell:** replace `p-6 max-w-5xl` (the R3 blocker — 264px dead gutter at 1512px, 672px at 1920px) with `mx-auto w-full max-w-7xl`.
3. **Header bar:** `flex items-baseline justify-between gap-3 border-b border-border px-5 py-3` — `<h1 className="text-base font-semibold">{title}</h1>` plus a short subhead (`{packages.length} packages · {resources.length} ingredients & equipment`). Mirrors `TodayClient:31-45`.
4. **KPI band** — a new `CatalogKpiBand` **rendered inline in this file** (not a separate file; keeps Task 5 self-contained):
   - **{title}** — `String(packages.length)`
   - **Price range** — `formatMoney(min)`–`formatMoney(max)` (single package → just its price; none → `'—'`), tone `money`
   - **Ingredients & equipment** — `String(resources.length)`
   - **Uncosted ingredients** — `String(uncostedConsumables(resources).length)`, tone `alert` when `> 0`, note `'blocks materials cost'`
5. **Tabs:** replace the hand-rolled tablist with kit `Tabs`/`TabsList`/`TabsTab`/`TabsPanel`, `keepMounted` on all three panels (fixes invariant 13). Keep the three tab ids and labels (`title`, `'Ingredients & Equipment'`, `'Checklists'`) and the default `'packages'`. Keep tab state as local `useState` — **do not** move it to a URL param: the page is `force-dynamic`, so a search param would trigger a full server re-render on every tab click and change back-button semantics.
6. Pass `costing` through to `PackagesTab`. Its new signature is exactly:
   `<PackagesTab orgId isAdmin packages resources templates costing />`

Test (new file): heading renders the `title` prop (not a hardcoded "Packages"); the four KPI tiles render; the alert tile appears when a consumable lacks `unit_cost`; clicking the Checklists tab reveals it; and an inactive panel stays mounted.

### Task 6: `PackagesTab` — kit adoption + the Materials figure + working rail

**Files:** `components/admin/ops/PackagesTab.tsx`, create `components/admin/ops/CatalogHealthRail.tsx`; update `__tests__/components/admin/ops/PackagesTab.test.tsx`

Accept the new `costing: PackageCosting[]` prop; index it `const costingById = new Map(costing.map(c => [c.id, c]))`.

1. **Two-column layout** (this is what absorbs the freed width — R3): `flex flex-col gap-4 lg:flex-row`; package list `min-w-0 flex-1`; `<CatalogHealthRail>` as `w-full lg:w-72 lg:shrink-0`. Mirrors `AgendaRail`'s `w-full md:w-72 md:shrink-0` pattern.
2. **Package row — promote the Materials figure** (the marquee change; entirely absent today). On each package card header keep `{p.name}` and `formatMoney(p.price)`, and add beneath:
   - costed → `Materials {formatMoney(c.materials)} · at {c.basis} guests · excludes labor`
   - not costed → `Materials —` plus a `StatusPill tone="neutral"` reading `Not costed` (no capacity set / no costed ingredient / no consumables, per `c.reason`)
   - `c.gaps.length > 0` → `StatusPill tone="alert"` reading `{c.gaps.length} not costed` with a `title` listing the names
   **Never** label this "Cost" or "Margin"; never print `$0.00` when `costed` is false.
3. **Row actions → kit `Menu`** (mirrors `TodayQueue`): `<MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`} />}>` → `MenuContent` with `MenuItem`s **Edit** and **Delete**. Gated by `isAdmin`.
4. **`window.confirm` → kit `ConfirmDialog`.** The description must carry today's warning **verbatim**: `Any events already set up with it will fail to re-derive lists or compute closeout ("Package no longer exists"). Only delete packages no upcoming event uses.` Keep `disabled={saving}`.
5. **Guest cap → `StatusPill tone="neutral"`** (`up to {n} guests`) instead of gray text. Keep the exact `up to 100 guests` text — a test asserts it appears and then disappears after clearing `max_guests`.
6. **Empty state → kit `EmptyState`** with one CTA ("New package"). Keep the copy's `Espresso Bar` example out of an exact-match collision: the node's full normalized text must not be exactly `Espresso Bar`.
7. **Form responsiveness:** `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`; the crammed setup/teardown cell gets its own row. The three native `<select>`s keep their `aria-label`s and stay native `<select>` (the tests drive them with `fireEvent.change`, and no kit Select exists) — only retokenize `border-gray-300` → `border-border bg-background`.
8. Tokenize all 14 raw color literals; line bullets get `text-muted-foreground`, error text `text-destructive`.

**`CatalogHealthRail`** (new file, owned by this task) — `RelatedRecordCard`s:
- **Needs a cost** — `uncostedConsumables(resources)` rows; empty → "Every ingredient is costed".
- **Not yet costed** — packages where `!costed`, subtitle = the human reason; empty → "Every package has a materials figure".
- Empty rail cards hide below `lg` (`max-lg:hidden`), mirroring `ClientWorkingRail`'s `max-md:hidden` precedent.
Both cards are read-only summaries — no `onNew`; pass `onEmptyCta` only where a real action exists.

**Test updates:** `getByRole('button', {name: 'Edit'})` → `getByRole('menuitem', {name: 'Edit'})` after opening the row menu; same for Delete. The `window.confirm` spy test becomes a ConfirmDialog test (open menu → Delete → assert the warning text is in the dialog → cancel → `deleteWorkPackage` not called). Add assertions for the Materials figure (costed and not-costed cases). Everything in the do-not-break contract stays asserted.

### Task 7: `ResourcesTab` — ledger polish

**Files:** `components/admin/ops/ResourcesTab.tsx`; update `__tests__/components/admin/ops/ResourcesTab.test.tsx`

1. Wrap the table in `overflow-x-auto` (no mobile scroll container today) and tokenize `text-gray-500` → `text-muted-foreground`, `border-b` → `border-b border-border`, `text-red-600` → `text-destructive`, the `<select>`'s `border-gray-300` → `border-border bg-background`.
2. **Kind → `StatusPill`** replacing the undifferentiated gray `Badge variant="secondary"`, with per-kind tone: `consumable` → `neutral`, `reusable` → `confirmed`, `serialized` → `pending`. Keep the lowercase kind text (`'serialized'` is asserted by exact `getByText`).
3. **Unit cost:** keep the uncontrolled `defaultValue` + `onBlur` + equality guard exactly. Keep the `formatMoney(r.unit_cost)` span beside the input (`$0.55` is asserted). When `unit_cost` is undefined for a **consumable**, render an `+ Add cost` affordance styled `text-[var(--link)]` in place of `—` (R6) — for non-consumables keep the em dash, since their cost is never used.
4. **Empty row → kit `EmptyState`** inside the `<td colSpan={5}>`, with one CTA that focuses the Name input.
5. **`window.confirm` → `ConfirmDialog`.**
6. **Keep the in-use delete as an inline disabled `<button>`** with its `aria-label` and `title` — do **not** move it into a `Menu`. This is a deliberate deviation from the module's Menu adoption: the disabled state *is* the guard, it must stay visible, and the test asserts a native `disabled` attribute.

### Task 8: `ChecklistTemplatesTab` — ledger polish

**Files:** `components/admin/ops/ChecklistTemplatesTab.tsx`; update `__tests__/components/admin/ops/ChecklistTemplatesTab.test.tsx`

1. Tokenize `text-gray-500/700/400` and `text-red-600`; retokenize the two `<select>`s.
2. **Custom/Built-in `Badge` → `StatusPill`** — `Custom` → `confirmed`, `Built-in` → `neutral`. Each string must still appear exactly once per row (singular `getByText`); do **not** add a "Custom" filter chip or section header.
3. **Phase headings:** keep `CHECKLIST_PHASES` order, keep rendering nothing for an empty phase, and keep the raw phase slugs (`'load-out'`, `'service-close'`) as the heading text.
4. Step evidence markers → `StatusPill tone="neutral"` (`photo` / `number`) rather than gray inline text; `'none'` stays unrendered.
5. **Empty state → kit `EmptyState`** with one CTA ("New checklist").
6. **`window.confirm` → `ConfirmDialog`**, keeping the copy "Packages that attach it will simply stop including it on new events."
7. The new-checklist form's `flex gap-3` row gets `flex-wrap` (overflows below `md` today).

---

## Verify

- `npx vitest run --exclude '**/.claude/**'` — full suite green (16 existing catalog tests + the new kit/costing/shell tests).
- `npm run build` — pass (the real gate; vitest does not type-check).
- Reviews: one per task in parallel, then a whole-branch review. Every Critical/Important fixed before merge.
- Walkthrough is post-merge (cannot run here): KPI band figures; tab switch preserves an in-progress draft; row Menu; ConfirmDialog on all three deletes; Materials figure shows `—` not `$0.00` for uncosted packages; the in-use resource delete is still disabled; dark mode; ≤200px gutter at 1512px and 1920px; mobile stacks.
