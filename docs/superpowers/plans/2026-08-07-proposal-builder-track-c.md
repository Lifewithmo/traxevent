# Proposal Builder Track C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the form-per-block proposal editor with a layout-first builder canvas (in-place editing of blocks AND pricing), add content skeletons + a creation picker, and restyle the public/print surfaces against the shared theme variables — per spec §3, §4, §5 (client), §6 and the §10 Track C boundary.

**Architecture:** All new editor UI lives under `components/admin/proposal-builder/`. Track A/B contract types (composed packages, placeholder flag, OrgBranding, `updateProposalDraft`) are copied verbatim from spec §1/§2 into two clearly-marked temporary stub modules (`lib/proposal-builder-stubs.ts` for types + pure helpers, `actions/proposal-builder-stubs.ts` for the consolidated save action) that the integration session deletes after rebasing onto Tracks A and B. Shared customer-facing rendering stays in `components/proposals/` and styles against `--proposal-*` CSS variables only, so builder canvas, public page, and print cannot drift.

**Tech Stack:** Next 16 App Router (async `params`), React 19 client components, Tailwind v4 (arbitrary `var(--…)` values), vitest + @testing-library/react (jsdom), Firestore via `adminDb` in the stub action.

## Global Constraints

- Branch `claude/proposal-builder` off `main`; one worktree; vitest always with `--exclude '**/.claude/**'`.
- Do NOT edit: `lib/types.ts`, `lib/proposals.ts` math, `lib/proposal-signature.ts`, any invoice code, `actions/proposals-public.ts`.
- `ProposalResponseClient` sign/decline/deposit state machine (incl. before_accept webhook polling) is behavior-preserved — presentation only.
- Never re-export a type from a `'use server'` module (breaks `next build`; tsc passes).
- Placeholder blocks never reach customers: public + print silently skip `placeholder: true` blocks; send warns when any remain.
- Legacy packages (no `item_ids`) render/total exactly as today: `includes` + denormalized `price` are authoritative.
- Definition of done: `npx tsc --noEmit` clean, `npx vitest run --exclude '**/.claude/**'` green. `next build` + browser walk happen at integration.
- Stub contract types are copied VERBATIM from spec §1/§2 — no drive-by improvements.

---

### Task 1: Stub types + pure pricing helpers (`lib/proposal-builder-stubs.ts`)

**Files:**
- Create: `lib/proposal-builder-stubs.ts`
- Test: `__tests__/lib/proposal-builder-stubs.test.ts`

**Interfaces:**
- Produces: `ProposalLineItem`, `ProposalPackage` (verbatim spec §1), `OrgBranding` (verbatim §2), `PlaceholderBlock = ProposalBlock & { placeholder?: boolean }`, `ProposalDraftUpdate`, `SuggestedPackageV2`
- Produces: `packagePrice(pkg, items): number` (Σ member qty×unit_price, `price_override` wins), `packageBullets(pkg, items): string[]` (item_ids order → descriptions; legacy → `includes`), `supersetBase(pkg, allPackages): ProposalPackage | undefined` (largest strict-subset tier whose item_ids ⊆ pkg's), `upgradeLegacyPackages(lineItems, packages)` (pure adapter: bullet → qty-1/price-0 item, `price_override` = old flat price; idempotent no-op on composed/empty)

- [ ] **Step 1: Write failing tests** for: composed sum, override precedence, legacy price passthrough, bullets from item_ids order, legacy bullets from includes, superset detection (B ⊇ A, A smaller → A; no relation → undefined; legacy pkgs → undefined), adapter output-equivalence (`packagePrice` after upgrade === old flat price; bullets unchanged) and idempotence (second run is identity).
- [ ] **Step 2: Run** `npx vitest run __tests__/lib/proposal-builder-stubs.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** the module. Header comment: `// TEMPORARY TRACK-C STUBS — copied verbatim from spec §1/§2 (2026-08-07-proposal-builder-redesign-design.md). The integration session deletes this module after rebasing onto Tracks A and B and repoints imports at lib/types.ts / lib/proposals.ts.`
- [ ] **Step 4: Run tests** — expect PASS.
- [ ] **Step 5: Commit** `feat(proposals): Track C contract stubs — v2 package types + pure pricing helpers`

### Task 2: Content skeletons (`lib/proposals/skeletons.ts`)

**Files:**
- Create: `lib/proposals/skeletons.ts`
- Test: `__tests__/lib/proposal-skeletons.test.ts`

**Interfaces:**
- Produces: `PROPOSAL_SKELETONS: SkeletonDef[]` where `SkeletonDef = { key: 'full' | 'quick' | 'visual' | 'blank'; name: string; description: string; makeBlocks(opts: { contactName?: string }): PlaceholderBlock[] }`
- Full proposal: cover heading → intro ¶ → "What you told us" → "Our recommendation" → image slot → terms. Quick quote: title heading → one-line intro → terms. Visual showcase: cover heading → short intro → image+¶ ×2 alternating → testimonial → terms. Blank: `[]`.
- Every non-blank block has `placeholder: true`, unique `sk-<n>` id, instruction-toned text; intro pre-addressed `Hi <contactName> — …` when provided.

- [ ] **Step 1: Write failing tests**: four keys present; blank → `[]`; all blocks `placeholder: true` with unique ids; intro contains contact name when given and reads generically when omitted; full skeleton contains an image block with `url: ''`; every text reads as instruction (asserts on a couple of literals).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(proposals): content skeletons — full / quick quote / visual showcase / blank`

### Task 3: Stub consolidated save action (`actions/proposal-builder-stubs.ts`)

**Files:**
- Create: `actions/proposal-builder-stubs.ts`
- Test: `__tests__/actions/proposal-builder-stubs.test.ts` (marked TEMPORARY, deleted with the stub)

**Interfaces:**
- Produces: `updateProposalDraft(orgId, proposalId, draft: ProposalDraftUpdate): Promise<{ draft: PersistedDraft; adjustments: string[] }>` — `'use server'`, `assertOrgAdmin`, throws on signed/pending/voided; normalizes blocks (placeholder blocks pass through verbatim so empty image slots survive; others via `normalizeBlocks`); recomputes composed `price` via `packagePrice`; validates `item_ids` resolve, no dup refs in a tier, ≤3 packages; `FieldValue.delete()` for cleared optional fields; returns the persisted draft so the client re-seeds. Mirrors the existing action-test mocking style (`__tests__/actions/proposal-blocks.test.ts`).

- [ ] **Step 1: Write failing tests**: rejects signed / voided; drops a package whose `item_ids` don't resolve (with adjustment); recomputes composed price (override wins); preserves `placeholder: true` blocks incl. empty image; returns persisted draft.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (same TEMPORARY header; no type re-exports from the `'use server'` file — types live in Task 1's module). **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(proposals): temporary updateProposalDraft stub action for Track C`

### Task 4: AI merge — `mergeDraftIntoBlocks`

**Files:**
- Create: `components/admin/proposal-builder/merge-draft.ts`
- Test: `__tests__/components/admin/proposal-builder/merge-draft.test.ts`

**Interfaces:**
- Produces: `mergeDraftIntoBlocks(current: PlaceholderBlock[], draft: ProposalBlock[]): { blocks: PlaceholderBlock[]; filled: number }` — pure. Walks `current` in order; each `placeholder: true` block is replaced by the next unused draft block of the same `type` (keeping the placeholder's id, clearing the flag); human blocks (no flag) untouched; placeholders with no matching draft block remain; unused draft blocks discarded.

- [ ] **Step 1: Write failing tests**: fills matching types in order; human-authored block byte-identical; a placeholder the user already edited (flag cleared) is never overwritten; leftover placeholders survive; leftover draft blocks dropped; image placeholders never filled (AI schema has no image); `filled` count correct.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(proposals): pure placeholder-fill merge for AI drafts`

### Task 5: Theme stub + shared block renderer + placeholder skip

**Files:**
- Create: `components/proposals/ProposalThemeStub.tsx` (TEMPORARY — integration swaps for Track B's `ProposalTheme`)
- Modify: `components/proposals/ProposalDocument.tsx`
- Test: `__tests__/components/proposals/ProposalDocument.test.tsx` (extend)

**Interfaces:**
- `ProposalThemeStub({ branding?, children })`: wrapper div setting `--proposal-accent` (default `#111827`), `--proposal-accent-text` (`#ffffff`), `--proposal-secondary` (`#6b7280`) from `OrgBranding` when present.
- `ProposalDocument({ blocks, showPlaceholders = false })`: skips `placeholder: true` blocks unless `showPlaceholders`; exports `ProposalBlockView({ block })` (single-block presentation reused by the builder canvas); headings/testimonial-accents styled via `var(--proposal-…, fallback)`.

- [ ] **Step 1: Write failing tests**: placeholder block absent from default render; present with `showPlaceholders`; legacy blocks (no flag) render exactly as before (existing tests keep passing); `ProposalBlockView` renders each type.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run full document test file** — PASS.
- [ ] **Step 5: Commit** `feat(proposals): themed block renderer, silent placeholder skip on customer surfaces`

### Task 6: Composed-package rendering in `ProposalPricing`

**Files:**
- Modify: `components/proposals/ProposalPricing.tsx`
- Test: `__tests__/components/proposals/ProposalPricing.test.tsx` (new)

**Interfaces:**
- `ProposalPackageOption` gains optional `bullets?: string[]` and `supersetLabel?: string` props: when `bullets` given they render instead of `pkg.includes`; `supersetLabel` renders as the first line ("Everything in Basic"). Absent props = legacy path byte-identical. Recommended badge/selected ring/price move to `var(--proposal-accent, …)`.
- Callers compute bullets via Task 1 helpers (`packageBullets`, `supersetBase`).

- [ ] **Step 1: Write failing tests**: composed bullets render in item_ids order; superset label renders; legacy package (includes/price) renders unchanged; selected/print (no onSelect) behavior preserved.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(proposals): composed package bullets + superset collapse + theme vars in pricing`

### Task 7: Inline text editing primitive

**Files:**
- Create: `components/admin/proposal-builder/InlineText.tsx`
- Test: `__tests__/components/admin/proposal-builder/InlineText.test.tsx`

**Interfaces:**
- `InlineText({ value, onCommit, as, className, multiline?, placeholder?, disabled?, ariaLabel })`: renders committed value through `parseInline` tokens in the same element/typography; click (or Enter/Space on focus) swaps to an identically-styled borderless textarea; Enter commits (Shift+Enter = newline when `multiline`), Escape cancels, blur commits; `**bold**`/`*italic*` render on commit.

- [ ] **Step 1: Write failing tests**: click → editable; type + Enter → `onCommit` with new value and static view restored; Escape → no commit, old value shown; blur commits; bold syntax renders `<strong>` after commit; disabled → click does nothing.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(builder): InlineText in-place editing primitive`

### Task 8: Block canvas (insert / reorder / delete / image drop zone)

**Files:**
- Create: `components/admin/proposal-builder/BlockCanvas.tsx`
- Test: `__tests__/components/admin/proposal-builder/BlockCanvas.test.tsx`

**Interfaces:**
- `BlockCanvas({ blocks, onChange, onUploadImage, disabled })`: renders each block via `ProposalBlockView` typography with `InlineText` for text fields; placeholder blocks greyed (`opacity` + data attribute); hover "+" divider between/after blocks opens type menu (heading/paragraph/list/image/testimonial); per-block floating handle: drag reorder (HTML5 DnD) plus menu with keyboard-accessible "Move up"/"Move down"/"Delete" buttons (drag never the only path); empty image block renders a drop-zone (click → file input, drop → upload) with inline caption/alt fields beneath; first human edit of a placeholder clears its flag.
- `onChange(next: PlaceholderBlock[])` with full array; ids minted `crypto.randomUUID()`.

- [ ] **Step 1: Write failing tests**: insert paragraph via + menu; Move down reorders; Delete removes; editing placeholder text clears `placeholder` on the committed block; image upload writes url onto the right block by id; disabled → no chrome actions.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(builder): block canvas with in-place editing, insertion, reorder, image drop zone`

### Task 9: Pricing canvas (packages + items in place)

**Files:**
- Create: `components/admin/proposal-builder/PricingCanvas.tsx`, `components/admin/proposal-builder/ItemPopover.tsx`
- Test: `__tests__/components/admin/proposal-builder/PricingCanvas.test.tsx`

**Interfaces:**
- `PricingCanvas({ lineItems, packages, discount, taxRate, deposit, onItemsChange, onPackagesChange, disabled })`: package cards rendered as the customer sees them (via `ProposalPackageOption` visuals); bullet click → `InlineText` edits the underlying item description; qty/price click → `ItemPopover` (quantity, unit price, unit); "Add item" appends a qty-1 item to pool + tier; member picker toggles pool items in/out of a tier (no dup refs); tier price shows `packagePrice`; clicking it sets/clears `price_override` (overridden tiers show a badge); "Add tier" (≤3) offers "Start from previous tier" pre-selecting the lower tier's members; required-scope and optional-add-on lists edit identically; legacy packages (no item_ids) render read-only with an "upgrade opens editing" note (adapter runs at load in Task 11).
- Sticky live total bar uses existing `proposalRange` from `lib/proposals` (read-only import — allowed).

- [ ] **Step 1: Write failing tests**: bullet edit updates item description everywhere it appears; popover qty change updates the computed tier sum; override set → badge + price shown, clear → computed sum returns; member picker adds/removes item_ids; add tier from previous pre-selects members; add item appends to pool and tier.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(builder): in-place pricing canvas — composed tiers, item popover, overrides`

### Task 10: AI panel rework

**Files:**
- Create: `components/admin/proposal-builder/ProposalAiPanel.tsx` (rework, moved)
- Delete: `components/admin/ProposalAiPanel.tsx`, `__tests__/components/proposals/ProposalAiPanel.test.tsx`
- Test: `__tests__/components/admin/proposal-builder/ProposalAiPanel.test.tsx`

**Interfaces:**
- `ProposalAiPanel({ orgId, proposalId, placeholderCount, disabled, onApply })` where `onApply(blocks: ProposalBlock[], mode: 'fill' | 'replace')`. Default primary action "Fill placeholder sections" (enabled when `placeholderCount > 0` or doc empty → fill acts as use); "Replace document" stays confirm-gated secondary. Renders v2 `suggested_packages` (`{ name, description?, recommended?, items: [...] }` — type from Task 1 stubs) as name + item count + summed price; keeps error/busy/a11y live-region behavior from the current panel.

- [ ] **Step 1: Write failing tests** (port relevant cases from the old file): generate → fill calls `onApply(blocks, 'fill')`; replace asks `window.confirm`; declined confirm → no apply; v2 suggested packages render name and item count; error path renders `role="alert"`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement + delete old files.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(builder): AI panel drafts into placeholders; full replace confirm-gated`

### Task 11: Builder client (autosave + rail + top bar) and route swap

**Files:**
- Create: `components/admin/proposal-builder/ProposalBuilderClient.tsx`, `components/admin/proposal-builder/useDraftAutosave.ts`, `components/admin/proposal-builder/RightRail.tsx`, `components/admin/proposal-builder/TopBar.tsx`
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/proposals/[proposalId]/page.tsx`
- Delete: `components/admin/ProposalEditorClient.tsx`, `components/admin/ProposalBlockEditor.tsx`, `__tests__/components/admin/ProposalBlockEditor.test.tsx`
- Test: `__tests__/components/admin/proposal-builder/ProposalBuilderClient.test.tsx`

**Interfaces:**
- `useDraftAutosave({ orgId, proposalId, initial })`: draft state + `update(patch)` marking dirty; ~800 ms debounce into ONE `updateProposalDraft` call; re-seeds state from the returned persisted draft; failure → `status: 'retrying'` with `retryNow()`; edits never discarded client-side. Statuses: `'saved' | 'dirty' | 'saving' | 'retrying'`.
- `ProposalBuilderClient({ orgId, orgSlug, leadId, proposal, branding, aiEnabled })`: runs `upgradeLegacyPackages` on load (persists via first autosave; opening read-only never writes); full-width layout — themed centered canvas (`ProposalThemeStub` + `BlockCanvas` + `PricingCanvas`) + `RightRail` + `TopBar`; locked (signature/pending_signature/voided) → fully read-only canvas with the existing banner copy, rail per existing rules (void stays available on signed, delete only on draft).
- `TopBar`: `InlineText` title, status badge, viewport toggle (desktop/mobile canvas max-width), "Open print view" link (`/proposals/<token>/print`).
- `RightRail`: send/void/delete + always-visible client link with copy; discount/tax/deposit/gate/terms/expiry controls (ported field logic from `ProposalEditorClient`); completeness ("N placeholder sections remaining"); `ProposalAiPanel` (fill mode wires through `mergeDraftIntoBlocks`); save state text; send confirms when placeholders remain (`window.confirm`).

- [ ] **Step 1: Write failing tests** (mock `@/actions/proposal-builder-stubs`, `@/actions/proposals`, `@/actions/proposal-images`, `@/actions/proposal-ai`; `vi.useFakeTimers` for debounce): one consolidated save after 800 ms quiet; burst of edits → single call; re-seed from response (server-dropped block disappears; no lying "Saved"); failure → Retry now visible, click retries; locked proposal → no editable affordances and no save; completeness counter; send with placeholders asks confirm; AI fill merges into placeholders leaving human blocks alone.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**, swap the route import to `ProposalBuilderClient` (page also reads `org.branding` from the org snapshot via stub type), delete the two old components + obsolete test.
- [ ] **Step 4: Run** the new test file, then the full suite — PASS.
- [ ] **Step 5: Commit** `feat(builder): layout-first builder canvas with autosave — replaces form editor`

### Task 12: Creation flow — skeleton picker route

**Files:**
- Create: `app/(admin)/[orgSlug]/leads/[leadId]/proposals/new/page.tsx`, `components/admin/proposal-builder/SkeletonPicker.tsx`
- Modify: `components/admin/LeadProposalsClient.tsx` ("New proposal" → `Link` to `…/proposals/new`)
- Test: `__tests__/components/admin/proposal-builder/SkeletonPicker.test.tsx`

**Interfaces:**
- Page (server): fetch lead + customer + org; compute autofill `title = "<branding.display_name ?? org.name> — <lead name>"` and `contactName`; render `SkeletonPicker { orgId, orgSlug, leadId, title, contactName }` full-screen.
- `SkeletonPicker`: three themed thumbnail cards + Blank; picking calls `createProposal(orgId, leadId, { title })`, then `updateProposalDraft` with `makeBlocks({ contactName })`, then `router.push` to the builder.

- [ ] **Step 1: Write failing tests**: renders 4 options; pick "Full proposal" → `createProposal` with autofilled title then `updateProposalDraft` with skeleton blocks then navigate; Blank skips the draft write; create failure surfaces error and re-enables.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(builder): skeleton picker creation flow with CRM autofill`

### Task 13: Public page + print restyle

**Files:**
- Modify: `components/proposals/ProposalResponseClient.tsx` (presentation only), `app/(public)/proposals/[token]/page.tsx`, `app/(public)/proposals/[token]/print/page.tsx`
- Test: `__tests__/components/proposals/ProposalResponseClient.test.tsx` (new, presentation + behavior-preservation)

**Interfaces:**
- Public page wraps content in `ProposalThemeStub` with `branding` read via stub-typed cast of the payload (undefined until Track B lands → neutral theme); hero: cover image + logo + themed title when branding present, current heading otherwise. Package cards get composed `bullets`/`supersetLabel` via Task 1 helpers. Sticky total bar/CTAs themed via vars. **No changes to any handler, state, effect, or polling logic.**
- Print route: same shared components inside the theme; print CSS — `break-inside-avoid` on image/testimonial/package-card blocks, `break-after-avoid` on headings, restrained ink (no background fills), accent on headings only. Legacy proposals print unchanged.

- [ ] **Step 1: Write failing tests**: hero renders logo/cover when branding present, absent otherwise; sign form, decline, and before_accept "Continue to payment" flows still drive the same actions (port a couple of behavior assertions to lock the state machine); placeholder blocks never render.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(proposals): themed public + print surfaces`

### Task 14: Gates & report

- [ ] **Step 1:** `npx tsc --noEmit` — clean.
- [ ] **Step 2:** `npx vitest run --exclude '**/.claude/**'` — green.
- [ ] **Step 3:** Fix anything found (systematic-debugging if non-obvious), re-run both.
- [ ] **Step 4:** Final commit if needed; report branch state, stub inventory for the integration session, and remaining integration steps (rebase onto A+B, delete stubs, `next build`, browser walk).

## Self-Review

- Spec coverage: §3 skeletons/picker/placeholder/AI-seating → Tasks 2, 4, 10, 12; §4 canvas/top bar/rail/pricing-in-place/locked → Tasks 7–9, 11; §5 client save model → Task 11; §6 public/print → Tasks 5, 6, 13; §10 boundary → stubs Tasks 1, 3. Fonts/templates cut — nothing added.
- Placeholder scan: none.
- Type consistency: stub names (`packagePrice`, `packageBullets`, `supersetBase`, `upgradeLegacyPackages`, `PlaceholderBlock`, `ProposalDraftUpdate`) used consistently across Tasks 1, 3, 4, 9, 11, 12.
