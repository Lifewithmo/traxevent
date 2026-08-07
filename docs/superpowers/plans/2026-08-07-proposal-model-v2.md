# Pricing Model v2 (Track A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Packages compose line items (`item_ids` + `price_override`) with server-side denormalized `price`, legacy packages read-only-compatible forever, plus the consolidated `updateProposalDraft` autosave action — per §1/§5/§9/§10 of `docs/superpowers/specs/2026-08-07-proposal-builder-redesign-design.md`.

**Architecture:** Pure math in `lib/proposals.ts`, pure legacy adapter in `lib/proposals/upgrade.ts`, pure draft normalization in `lib/proposals/draft.ts`, guard-free IO core in `lib/proposals/draft-core.ts` (house pattern: mirrors `blocks.ts`/`blocks-core.ts`), guarded action in `actions/proposals.ts`. Signature canonicalization is a field-passthrough, so v2 fields serialize only-when-present automatically — proven by golden fixtures captured at main (committed c0422c8, BEFORE this plan executes).

**Tech Stack:** TypeScript, Next.js server actions, Firestore admin SDK, vitest.

## Global Constraints

- Branch `claude/proposal-model-v2` off main; commit, do not merge.
- Track A owns ONLY: `lib/types.ts` (proposal section), `lib/proposals.ts`, `lib/proposals/*` except `skeletons.ts`, `lib/proposal-signature.ts`, `actions/proposals.ts`, invoice-from-selection code (`lib/invoice-progress.ts`), `lib/ai/proposal-draft.ts` (+ its action/prompt seam), their tests. Do NOT touch components, app routes, org settings.
- Contract types copied verbatim from spec §1 (`unit?`, `item_ids?`, `price_override?`, `placeholder?`).
- Composed tier price = Σ member `quantity × unit_price` unless `price_override`; `price` always recomputed server-side on write and stored denormalized.
- `includes` never written for composed packages (normalize to `[]`); ignored when `item_ids` present.
- Legacy digests bit-stable: golden test `__tests__/lib/proposal-signature-goldens.test.ts` must never be regenerated to pass.
- ≤ 3 packages; `item_ids` must resolve; no duplicate refs within a tier.
- Gates: `npx tsc --noEmit`, `npx vitest run --exclude '**/.claude/**'`, `npx next build`.
- **Green-branch deviation (documented):** §5 says `updateProposal`/`updateProposalBlocks` are deleted, but Track C's still-live components import them; deleting here breaks tsc. They stay as `@deprecated`-marked code, deleted in the integration pass with the components.

---

### Task 1: Contract types

**Files:**
- Modify: `lib/types.ts` (proposal section only, ~lines 428–455)

**Interfaces:**
- Produces: `ProposalLineItem.unit?: string`; `ProposalPackage.item_ids?: string[]`, `.price_override?: number`; `placeholder?: boolean` on all 5 `ProposalBlock` variants. Everything downstream builds on these.

- [ ] **Step 1:** Edit `ProposalPackage` to the spec-verbatim shape (legacy pair commented as legacy-authoritative/derived-denormalized; composed pair `item_ids?`/`price_override?`). Edit `ProposalLineItem` to add `unit?: string  // "hr", "each", "day" — display + future invoicing`. Add `placeholder?: boolean` to each `ProposalBlock` union member.
- [ ] **Step 2:** Run `npx tsc --noEmit` — expect clean (additive optional fields).
- [ ] **Step 3:** Commit `feat(proposals): pricing model v2 contract types`.

### Task 2: Package pricing math (`lib/proposals.ts`)

**Files:**
- Modify: `lib/proposals.ts`
- Test: `__tests__/lib/proposal-packages.test.ts` (new)

**Interfaces (produces):**
```ts
export function isComposedPackage(pkg: ProposalPackage): boolean            // item_ids array present
export function packageMemberItems(pkg: ProposalPackage, items: ProposalLineItem[]): ProposalLineItem[] // item_ids order; unresolvable ids skipped
export function packagePrice(pkg: ProposalPackage, items: ProposalLineItem[]): number
// legacy → pkg.price; composed → price_override ?? round2(Σ lineItemSubtotal(member))
export function packageBullets(pkg: ProposalPackage, items: ProposalLineItem[]): string[]
// legacy → includes; composed → member descriptions in item_ids order
export function packageDisplayBullets(pkg: ProposalPackage, packages: ProposalPackage[], items: ProposalLineItem[]): { everything_in?: string; bullets: string[] }
// superset collapse: composed-only; base = other composed tier with most members whose
// member set is a strict subset (fewer members); ties → first in array order.
// bullets = descriptions of pkg members not in base, in item_ids order.
```

- [ ] **Step 1:** Write failing tests covering: composed sum uses `lineItemSubtotal` semantics (qty·price, non-positive → 0, round2); `price_override` wins; legacy returns flat `price`; member order follows `item_ids`; unresolvable id skipped; bullets legacy vs composed; superset collapse happy path (`Everything in Good` + remainder), no collapse for legacy/equal-membership/non-subset, largest-subset choice, tie → first.
- [ ] **Step 2:** `npx vitest run --exclude '**/.claude/**' __tests__/lib/proposal-packages.test.ts` — expect FAIL (functions missing).
- [ ] **Step 3:** Implement the five functions in `lib/proposals.ts` (reuse `round2`/`lineItemSubtotal`).
- [ ] **Step 4:** Re-run — expect PASS. Also run `__tests__/lib/proposals.test.ts` (no regression).
- [ ] **Step 5:** Commit `feat(proposals): composed package price, bullets, superset collapse`.

### Task 3: Legacy upgrade adapter (`lib/proposals/upgrade.ts`)

**Files:**
- Create: `lib/proposals/upgrade.ts`
- Test: `__tests__/lib/proposal-upgrade.test.ts` (new)

**Interfaces (produces):**
```ts
export interface UpgradeResult { line_items: ProposalLineItem[]; packages: ProposalPackage[]; changed: boolean }
export function upgradeLegacyProposal(p: Pick<Proposal, 'line_items' | 'packages'>): UpgradeResult
```
Pure & deterministic. Each legacy package's bullets → qty-1/price-0 items appended to the pool with collision-safe deterministic ids (`{pkgId}-inc-{n}`, bump `n` past collisions); `item_ids` set; `price_override` = old flat price; `includes` → `[]`; `price` stays = override. Composed packages and the pool pass through untouched. `changed` false ⇒ inputs returned as-is.

- [ ] **Step 1:** Write failing tests: bullet conversion (qty 1, price 0, description = bullet); `price_override` = old price; `includes` emptied; pool preserved + appended; id collision with an existing pool id bumps; idempotence (`upgrade(upgrade(p)) === upgrade(p)` deep-equal, `changed:false` second time); output equivalence — for a 2-tier legacy proposal with optional add-ons, `computeSelectedTotal` identical pre/post for every tier × add-on combo, and `packageBullets` post == `includes` pre; no packages / packages absent → `changed:false`.
- [ ] **Step 2:** Run — expect FAIL (module missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit `feat(proposals): pure legacy→composed upgrade adapter`.

### Task 4: `placeholder` through `normalizeBlocks`

**Files:**
- Modify: `lib/proposals/blocks.ts`
- Test: `__tests__/lib/proposal-blocks.test.ts` (append)

- [ ] **Step 1:** Failing tests: each block type preserves `placeholder: true`; non-`true` values (`false`, `"yes"`, `1`) are dropped from output.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** In each `case` push, spread `...(b.placeholder === true ? { placeholder: true } : {})`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(proposals): preserve placeholder flag through normalizeBlocks`.

### Task 5: Signature canonicalization — prove stability, add v2 sensitivity

**Files:**
- Modify: `lib/proposal-signature.ts` (comment only, if anything — canonicalize() already passes through present fields and omits absent ones)
- Test: `__tests__/lib/proposal-signature.test.ts` (append)

- [ ] **Step 1:** Add tests: composed-package digest CHANGES when `price_override`, `item_ids` order, or a member item's `unit` changes (each is agreed content); legacy digest UNCHANGED when v2 fields are absent vs the pre-v2 golden for the same doc (covered by goldens file, which must stay green untouched).
- [ ] **Step 2:** Run goldens + signature tests — all PASS with zero production change. If anything fails, STOP: the model change is wrong, not the fixtures.
- [ ] **Step 3:** Document in `lib/proposal-signature.ts` comment: v2 fields participate in the hash exactly when present; absent fields serialize as before (golden-pinned).
- [ ] **Step 4:** Commit `test(proposals): v2 field sensitivity + passthrough docs for signed-document hash`.

### Task 6: Invoice-from-selection itemization

**Files:**
- Modify: `lib/invoice-progress.ts` (`proposalInvoiceLines`)
- Test: `__tests__/lib/invoice-progress.test.ts` (append)

**Interfaces:**
- Consumes: `isComposedPackage`, `packageMemberItems`, `packagePrice` from Task 2.

- [ ] **Step 1:** Failing tests: composed selected tier emits one invoice line per member item (description/quantity/unit_price, source: proposal); `price_override ≠` computed sum → extra line `Package price adjustment — {name}` qty 1, unit_price = round2(override − sum) (assert a negative-delta case too); override set but equal to sum → no adjustment; no override → no adjustment; upgraded-legacy tier ($0 members + full-price adjustment) totals to the flat price; legacy package → single flat line exactly as today; optional add-on lines unchanged.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement: in the `pkg` branch, when composed → member lines + conditional adjustment (compute sum via `packagePrice` on a pkg without override, or export the sum path: use `round2` of member `lineItemSubtotal` — reuse `packageMemberItems` + `lineItemSubtotal`).
- [ ] **Step 4:** Run — PASS (plus existing invoice tests).
- [ ] **Step 5:** Commit `feat(invoices): itemize composed proposal selections with override adjustment line`.

### Task 7: Consolidated `updateProposalDraft`

**Files:**
- Create: `lib/proposals/draft.ts` (pure normalize/validate), `lib/proposals/draft-core.ts` (IO core)
- Modify: `actions/proposals.ts` (add action; `@deprecated` on `updateProposal`/`updateProposalBlocks`)
- Test: `__tests__/lib/proposal-draft-normalize.test.ts` (new), `__tests__/actions/proposals.test.ts` (append)

**Interfaces (produces):**
```ts
// lib/proposals/draft.ts
export interface ProposalDraftInput {
  title?: string; notes?: string; blocks?: unknown; line_items?: unknown; packages?: unknown
  discount?: ProposalDiscount; tax_rate?: number; deposit?: ProposalDeposit
  expires_at?: string; deposit_gate?: 'before_accept' | 'after_accept'; deposit_terms?: string
}
export interface NormalizedProposalDraft {
  title?: string; notes?: string; blocks: ProposalBlock[]; line_items: ProposalLineItem[]
  packages?: ProposalPackage[]; discount?: ProposalDiscount; tax_rate?: number
  deposit?: ProposalDeposit; expires_at?: string
  deposit_gate?: 'before_accept' | 'after_accept'; deposit_terms?: string
}
export function normalizeProposalDraft(input: ProposalDraftInput): { draft: NormalizedProposalDraft; adjustments: string[] }
// lib/proposals/draft-core.ts
export async function updateProposalDraftCore(orgId: string, proposalId: string, input: ProposalDraftInput):
  Promise<{ proposal: Proposal; adjustments: string[] }>
// actions/proposals.ts
export async function updateProposalDraft(orgId, proposalId, input): same as core, after assertOrgAdmin
```

Normalization rules (full-draft semantics — absent optional field = cleared):
- title/notes/deposit_terms trimmed; empty → cleared. expires_at passthrough string. deposit_gate must be one of the two literals else dropped.
- blocks via `normalizeBlocks` (adjustments merged).
- line_items: drop non-objects/empty descriptions/non-finite qty/price with adjustments; `unit` kept when non-empty string; `optional`/`taxable` kept when boolean; missing/duplicate ids minted collision-safe (`item-{n}`), duplicate re-mint reported.
- packages: > 3 → **throw**; per package: id minted if missing; empty name → drop + adjustment; `recommended === true` kept; composed (`item_ids` present): every ref must resolve in the normalized pool else **throw**, duplicate ref in one tier → **throw**, `includes` forced `[]`, invalid `price_override` (non-finite) dropped + adjustment, `price` = `packagePrice`; legacy: `includes` = trimmed strings, non-finite `price` → drop package + adjustment.
- discount/deposit: `{type: 'percent'|'fixed', value: finite > 0}` else dropped + adjustment. tax_rate: finite ≥ 0 else dropped + adjustment.

Core: guards — not found → `'Proposal not found'`; `signature || pending_signature` → `'This proposal is signed and can no longer be edited'`; `status === 'voided'` → `'This proposal is voided and can no longer be edited'` (moved from old action + blocks-core, same messages). Write: always-present arrays (`blocks`, `line_items`), optional fields cleared via `FieldValue.delete()`, `updated_at` stamped. Return persisted `Proposal` (snapshot merged with writes, deleted keys removed) + adjustments.

- [ ] **Step 1:** Failing pure tests (`proposal-draft-normalize.test.ts`): each rule above, incl. composed price recompute (sum + override), throw cases (>3 packages, unresolved ref, dup ref), adjustment texts reported, upgrade-on-first-autosave equivalence (adapter output normalizes unchanged: prices/bullets/totals identical).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement `lib/proposals/draft.ts`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Failing action/core tests (append to `__tests__/actions/proposals.test.ts`, existing firestore mock): happy write (update payload shape, `FieldValue.delete()` for cleared discount, updated_at), guards (signed / pending / voided / missing), re-seed return (persisted draft echoes normalized state, deleted keys absent), adjustments propagate.
- [ ] **Step 6:** Run — FAIL, implement `draft-core.ts` + action, run — PASS.
- [ ] **Step 7:** Mark `updateProposal`/`updateProposalBlocks` with `@deprecated` JSDoc: "Replaced by updateProposalDraft (spec §5). Deleted in the integration pass together with ProposalEditorClient/ProposalBlockEditor, which still import them."
- [ ] **Step 8:** Commit `feat(proposals): consolidated updateProposalDraft autosave action`.

### Task 8: AI drafting — composed package suggestions

**Files:**
- Modify: `lib/ai/proposal-draft.ts`, `actions/proposal-ai.ts`, `lib/ai/grounding.ts` (prompt rule text)
- Test: `__tests__/lib/ai/proposal-draft.test.ts` (rewrite affected parts), `__tests__/actions/proposal-ai.test.ts` (update)

**Interfaces (produces):**
```ts
export interface SuggestedPackageDraft {
  name: string; description?: string; recommended?: boolean
  items: Array<{ description: string; quantity: number; unit_price: number; optional?: boolean }>
}
export interface DraftResult { blocks: ProposalBlock[]; suggested_packages: SuggestedPackageDraft[]; rationale: string; adjustments: string[] }
export function parseDraftResponse(message: DraftMessage): DraftResult   // validPackageIds param removed
export function mintSuggestedPackages(suggested: SuggestedPackageDraft[], mintId: () => string):
  { packages: ProposalPackage[]; line_items: ProposalLineItem[] }
// non-optional items → pool + item_ids members; optional items → pool with optional:true, NOT in item_ids
// price = round2(Σ member qty·unit_price); NO price_override from AI; includes: []
export interface ProposalDraft extends Omit<DraftResult, 'suggested_packages'> {
  suggested_packages: ProposalPackage[]      // keeps id/name/price → ProposalAiPanel still compiles
  suggested_line_items: ProposalLineItem[]
}
```

- [ ] **Step 1:** Failing lib tests: schema shape (`suggested_packages` replaces `suggested_package_ids` in required); parse drops 4th package + adjustment, drops nameless package, drops invalid items (empty description / non-finite numbers) + adjustment, drops item-less package + adjustment; `mintSuggestedPackages` mints unique ids, members vs optional split, computed price, `includes: []`, no `price_override`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement schema + parse + mint in `lib/ai/proposal-draft.ts`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Update `actions/proposal-ai.ts`: keep catalog fetch for grounding; replace id-enrichment with `mintSuggestedPackages` (minter = `() => `ai-${randomBytes(4).toString('hex')}``, collision-free by construction within a draft via closure counter fallback); return new `ProposalDraft`. Update `lib/ai/grounding.ts` rule bullet: compose `suggested_packages` with items whose `unit_price` comes from the catalog (or the operator's notes); never invent prices — unknown price → 0 for the operator to fill; at most 3.
- [ ] **Step 6:** Update `__tests__/actions/proposal-ai.test.ts` mocks/assertions; run — PASS. Check `__tests__/lib/ai/grounding.test.ts` for prompt-text assertions and update if they pin the old rule.
- [ ] **Step 7:** Commit `feat(ai): AI drafts composed packages with line items`.

### Task 9: Full gates

- [ ] **Step 1:** `npx tsc --noEmit` — clean. If `__tests__/components/admin/ProposalBlockEditor.test.tsx` (Track C file) fails ONLY because its `ProposalDraft` mock literal lost fields, apply the minimal mock-shape fix and record the boundary touch in the report.
- [ ] **Step 2:** `npx vitest run --exclude '**/.claude/**'` — all green, goldens untouched.
- [ ] **Step 3:** `npx next build` — passes (watch the 'use server' type re-export trap: never re-export types from `actions/proposals.ts`).
- [ ] **Step 4:** Commit any gate fixes; final `git log --oneline` review.

## Self-Review (done at planning time)

- §1 coverage: types (T1), packagePrice/superset/denormalized price (T2), legacy adapter (T3), placeholder flag (T4), canonicalization + goldens (T5, fixtures pre-captured at c0422c8), invoice itemization + adjustment line (T6), consolidated action validation (T7), AI schema upgrade + server minting (T8). §5 covered by T7 (deletion deviation documented in Global Constraints). §9 Track-A gates covered (T5, T9); browser walk is integration-phase, out of Track A scope.
- Type/name consistency verified: `packagePrice(pkg, items)`, `item_ids`, `price_override`, `placeholder`, `updateProposalDraftCore` used consistently across tasks.
- No placeholders remain in this plan.
