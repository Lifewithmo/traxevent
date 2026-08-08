# Proposal builder redesign — pricing model v2, brand kit, layout-first canvas

**Date:** 2026-08-07
**Status:** Approved design (sections approved in-session)
**Strategy source:** `docs/strategy/proposal_system_deep_analysis.md`
**Supersedes:** the form-per-block editor shipped in the presentation increment
(`2026-08-06-proposal-presentation-design.md` increments 1–2 remain the data/AI
foundation; this spec IS that document's sketched "Increment 3 — brand kit",
expanded to a full builder redesign).

## Problem

The proposal builder is a single-column stack of form cards. The document is
edited as labeled inputs per block with no visual representation of the output;
no preview exists anywhere in the editor (the client link is hidden until
`sent`); saving is split across two buttons; packages are edited as textarea
bullet lists. Measured against the strategy doc, the product currently commits
both named failure modes: the proposal neither sells the job (generic grey
public page, no branding) nor becomes the job (separately tracked).

Additionally, packages are flat prices with prose bullets — an accepted tier
does not decompose into line items, undercutting the "every accepted selection
becomes structured business data" principle at its most important moment.

## Decisions fixed in this design (user-approved)

1. **Big-bang delivery.** One feature branch, one PR. Built as three parallel
   worktree tracks plus an integration pass (§10). Nothing ships until all of
   it does.
2. **Whole proposal edited in-place** on the rendered document — blocks AND
   pricing. A slim right rail holds only non-visual settings.
3. **Full brand kit** (logo, cover, colors, display name) and **Cloud Storage
   gets provisioned on prod** (external dependency, §8).
4. **One visual theme, three content skeletons** (Full proposal / Quick quote /
   Visual showcase) + Blank.
5. **Pricing model v2 folded in**: packages compose line items now, so the
   package editor is built once against the final shape.
6. Fonts are **cut** (single default type stack). Built-in templates stay cut
   (skeleton + AI drafting is the creation path).
7. **Mandatory browser walk before merge** (§9) — this increment exists partly
   because the last presentation increment merged sight-unseen.

## 1. Pricing model v2

### Types (contract — all tracks build against these verbatim)

```ts
export interface ProposalLineItem {
  id?: string
  description: string
  quantity: number
  unit_price: number           // dollars
  unit?: string                // NEW, optional: "hr", "each", "day" — display + future invoicing
  optional?: boolean           // unchanged: customer-toggleable add-on
  taxable?: boolean            // unchanged
}

export interface ProposalPackage {
  id: string
  name: string
  description?: string
  // LEGACY pair — written only by pre-v2 documents. A package with no
  // `item_ids` is legacy: `includes` + `price` are authoritative, read-only.
  includes: string[]
  price: number                // legacy: authoritative flat price.
                               // composed: DERIVED (see below), stored denormalized.
  // COMPOSED pair — presence of `item_ids` marks a v2 package.
  item_ids?: string[]          // ordered refs into the proposal's line_items pool
  price_override?: number      // optional round-number override of the computed sum
  recommended?: boolean
}
```

### Semantics

- **Composed tier price** = Σ member items (`quantity × unit_price`), unless
  `price_override` is set, in which case the override is the customer price.
  `price` is always recomputed server-side on write (sum or override) and
  stored denormalized, so every existing reader of `pkg.price` (public totals,
  signing, invoicing, AI enrichment) keeps working unmodified.
- **Tier bullets ARE the member items' descriptions**, in `item_ids` order.
  Marketing phrasing lives in the item description. `includes` is never
  written for composed packages and is ignored when `item_ids` is present.
- **Superset display:** when tier B's `item_ids` ⊇ tier A's (and A has fewer
  members), the renderer collapses the shared prefix to "Everything in {A}".
  Pure function; display-only.
- **Optional add-ons unchanged:** `optional: true` items are tier-independent
  toggles. Items in no package and not optional remain required base scope.
- **Selection snapshot (`ProposalSelection`) is unchanged** — ids resolve
  against the locked proposal.

### Legacy compatibility (read-only, forever)

- Legacy packages render, total, sign, and invoice exactly as today. Signed
  documents are immutable; their canonicalization must keep producing the
  same digest.
- **Upgrade-on-open (drafts and sent-but-unsigned only):** the new builder
  loads a legacy proposal through a pure adapter that converts each bullet to
  a qty-1 / price-0 line item appended to the pool, sets `item_ids`, and sets
  `price_override` = old flat price. Customer-visible output is identical
  before and after. The upgrade persists on the first autosave (opening
  read-only never writes). One-way; no downgrade path.

### Blast radius (all in scope for Track A)

- `lib/proposals.ts`: `packagePrice(pkg, items)`, superset detection, and the
  existing total/range/deposit math reading the denormalized `price`.
- `lib/proposal-signature.ts`: canonicalization includes `unit`, `item_ids`,
  `price_override` **only when present** — absent fields serialize exactly as
  today so legacy digests are unchanged. Golden fixture test required (§9).
- Invoice-from-selection: a composed selection itemizes member items as
  invoice lines; if `price_override` differs from the computed sum, emit a
  package-level adjustment line for the delta (label:
  "Package price adjustment — {tier name}").
- `lib/ai/proposal-draft.ts` schema: `suggested_packages` upgrades to
  `{ name, description?, recommended?, items: [{ description, quantity,
  unit_price, optional? }] }`. Server re-mints ids, appends items to the
  pool, builds `item_ids`. No override from AI.
- Server actions: one consolidated `updateProposalDraft` (§5) validates the
  composed shape (item_ids must resolve; no duplicate refs within a tier;
  ≤ 3 packages unchanged).
- `lib/proposals/blocks.ts` + block types: add `placeholder?: boolean` to
  every `ProposalBlock` variant and preserve it through `normalizeBlocks`
  (Track A implements the flag; Track C consumes it — see §3).

## 2. Brand kit

### Types (contract)

```ts
export interface OrgBranding {
  display_name?: string        // customer-facing; falls back to org name
  logo_url?: string
  cover_image_url?: string     // hero behind the proposal title
  accent_color?: string        // #rrggbb
  secondary_color?: string     // #rrggbb
}
// stored as `branding?: OrgBranding` on the org document
```

- Validation (pure, `lib/branding.ts`): colors must match `#rrggbb`; URLs must
  be https. Reject otherwise; never store un-validated.
- **Contrast guard** (pure): for each themed surface, derive the text color
  (white/near-black) that meets WCAG AA against the chosen background; clamp
  accent-on-white usage to AA by darkening the accent for text/link use if
  needed. No brand color choice can produce unreadable output.
- Edited in a "Branding" section of the existing org settings page: name
  field, two color inputs (`<input type="color">` + hex text), logo and cover
  upload. Uploads generalize the existing `uploadProposalImage` validation
  caps to org assets (path: org-scoped, not proposal-scoped).
- `branding` is added to the `PublicProposal` payload explicitly (all fields
  are public-safe by construction).

### Theming mechanism

One provider, `components/proposals/ProposalTheme.tsx`, maps
`OrgBranding` → CSS custom properties (`--proposal-accent`,
`--proposal-accent-text`, `--proposal-secondary`, …) on a wrapper element.
Every shared proposal component styles against the variables only. Builder
canvas, public page, and print all render inside the provider, so they cannot
drift. Absent branding = default variable values = the neutral theme.

## 3. Skeletons & creation

- "New proposal" opens a full-screen picker: three themed thumbnail cards +
  Blank. Picking creates the proposal pre-scaffolded and enters the builder.
- CRM autofill at creation: title = "{display_name} — {opportunity name}";
  intro paragraph pre-addressed to the lead contact. No copy-paste of
  customer data.
- Skeletons are **code constants** (`lib/proposals/skeletons.ts`): typed
  block arrays whose placeholder text reads as instructions.
  1. **Full proposal**: cover/title → intro → "What you told us" →
     "Our recommendation" → image slot → packages → add-ons → terms.
  2. **Quick quote**: title → one-line intro → pricing front and center →
     terms.
  3. **Visual showcase**: cover → short intro → alternating image+paragraph →
     testimonial → packages → terms.
- **Placeholder flag:** every `ProposalBlock` variant gains
  `placeholder?: boolean`. Builder renders placeholders greyed; the public
  page and print **silently skip** un-replaced placeholders; the rail shows
  completeness ("2 placeholder sections remaining"); send warns if any
  remain. The flag is cleared on first human edit of the block.
- **AI seating:** the AI panel drafts **into the current document** — it fills
  placeholder blocks (grounded in opportunity notes + catalog, as today) and
  leaves human-authored blocks alone. Full-replace remains as the
  confirm-gated secondary mode. A generation returning after a user has
  hand-edited a placeholder must not overwrite that block.

## 4. Builder canvas (route redesign)

- Full-width page: centered themed document canvas (the customer's exact
  rendering) + slim right rail + top bar.
- **Top bar:** inline-editable title, status badge, viewport toggle
  (desktop/mobile canvas width), "Open print view".
- **Right rail:** send/void/delete + client link (visible for drafts too),
  discount/tax/deposit/deposit-gate/expiry, completeness indicator, AI panel,
  save state ("Saved / Saving… / Retrying").
- **Block editing in place:** click text to edit inline (same position and
  typography); Enter/Escape commit/cancel; `**bold**`/`*italic*` as typed
  syntax rendered on blur. Hover between blocks → "+" divider → type menu.
  Hover a block → floating handle: drag to reorder, delete, and a menu with
  keyboard-accessible Move up / Move down (drag is never the only path).
  Empty image block = themed drop zone; click or drop to upload; caption/alt
  inline beneath.
- **Pricing in place:** package cards render as the customer sees them.
  Click a bullet → edit the underlying item description inline; click the
  qty/price → popover (quantity, unit price, unit). "Add item" appends to
  tier + pool. A member picker toggles existing pool items in/out of a tier.
  Tier price displays the computed sum; clicking it sets/clears
  `price_override` (overridden tiers get a badge). "Start from previous
  tier" pre-selects the lower tier's members when adding a tier. Required
  scope and optional add-on sections edit identically. The sticky customer
  total bar renders live in the builder.
- **Locked proposals** (signature, pending_signature, voided): canvas renders
  fully read-only with the existing banners; rail actions follow existing
  rules (void stays available on signed).

## 5. Save model

- **Autosave.** All edits debounce (~800 ms) into one consolidated server
  action `updateProposalDraft(orgId, proposalId, draft)` covering title,
  notes, blocks, line items, packages, discount/tax/deposit/gate/terms/expiry.
  It replaces `updateProposal` + `updateProposalBlocks` (both deleted;
  their guards and normalization move into the core:
  `updateProposalDraftCore`, guard-free, + guarded action, per house pattern).
- Server normalizes and returns the persisted draft; the client **re-seeds
  editor state from the response** (preserves the "never lie about what
  persisted" invariant). Normalization drops (with reported adjustments)
  instead of silently discarding.
- Failure: rail shows retrying state with manual "Retry now"; edits are never
  thrown away client-side while the tab is open.
- Concurrency: full-draft last-writer-wins within an editor session (status
  quo); server-side lock rules unchanged and re-checked on every write.

## 6. Public page & print restyle

- `[token]` page inherits the theme via the shared renderer: hero (cover +
  logo + title), themed package cards/CTAs/total bar, document sections in
  the same typography as the canvas. `ProposalResponseClient`'s sign /
  decline / deposit state machine (incl. before_accept webhook polling) is
  **behavior-preserved** — presentation only.
- Print route: same components + print CSS (page-break rules per block type,
  restrained ink, accent on headings). Legacy proposals print unchanged.

## 7. Edge handling summary

- Placeholders never reach customers (skip on public/print; warn on send).
- Contrast clamp makes bad brand colors degrade gracefully, never invisibly.
- Absent branding renders the polished neutral theme.
- Legacy packages render through one adapter used by all surfaces.
- Signed-document hashes are bit-stable (golden test).
- AI never overwrites human-edited blocks.

## 8. External dependency — Cloud Storage on prod

Neither `traxevent-prod.firebasestorage.app` nor legacy `.appspot.com`
exists; Storage was never enabled. **User action, before merge:** enable
Storage in the Firebase console on `traxevent-prod` (owner access), decide
uniform bucket-level access, deploy storage rules. This also un-deads
proposal image blocks in prod. Dev/emulator work is not blocked.

## 9. Testing & merge gates

- **Pure math:** composed price/override precedence, superset collapse,
  legacy adapter idempotence + output-equivalence, contrast clamp.
- **Hash goldens:** pre-change canonicalization fixtures must digest
  identically post-change (legacy shapes); new-shape digests asserted.
- **Actions:** `updateProposalDraft` validation/normalization/re-seed,
  upgrade-on-first-autosave, AI drafting into placeholders (no overwrite of
  human-edited), branding validation, org asset upload caps.
- **Components:** inline edit / insert / keyboard reorder / delete flows,
  placeholder skip on public render, locked read-only canvas, legacy
  rendering, pricing popover math.
- **Invoices:** itemized generation from composed selection + adjustment line.
- **Browser walk (mandatory, scripted, before merge):** demo seed → create
  from each skeleton → AI draft → in-place edits (text, image upload,
  reorder, package member edit, override) → brand the org → send → public
  link on desktop + mobile widths → sign + test-mode deposit (both gates) →
  print view. Screenshots attached to the PR.
- **Gates:** `tsc`, `npx vitest run --exclude '**/.claude/**'`, `next build`
  (the 'use server' type re-export trap), then the browser walk.

## 10. Delivery — three parallel tracks + integration

Feature branch: `claude/proposal-builder-redesign`. Tracks run in separate
worktrees/sessions off `main`, each against this spec's contract types.

| Track | Branch | Owns (files) | Must not touch |
|---|---|---|---|
| A — model v2 | `claude/proposal-model-v2` | `lib/types.ts` (proposal section), `lib/proposals.ts`, `lib/proposals/*` (except `skeletons.ts`), `lib/proposal-signature.ts`, `actions/proposals.ts`, invoice-from-selection code, `lib/ai/proposal-draft.ts`, their tests | components, app routes, org settings |
| B — brand kit | `claude/brand-kit` | `lib/branding.ts` (new), `lib/types.ts` (org section only), org settings UI, org-asset upload action, `components/proposals/ProposalTheme.tsx` (new), their tests | proposal editor/renderer components, `lib/proposals*` |
| C — builder + restyle | `claude/proposal-builder` | new builder components under `components/admin/proposal-builder/`, deletion of `ProposalEditorClient.tsx` + `ProposalBlockEditor.tsx` (and their now-obsolete tests), `components/proposals/*` renderer updates, builder/public/print/creation routes, `lib/proposals/skeletons.ts` (new), `ProposalAiPanel` rework, their tests | `lib/proposals.ts` math, `lib/proposal-signature.ts`, invoice code |

- A ∥ B are fully disjoint (the shared `lib/types.ts` sections don't overlap).
- C starts immediately on canvas structure/skeletons against stub types
  copied verbatim from this spec, then **rebases onto A + B** once they land
  on the feature branch.
- Integration session: merge A → B → C into
  `claude/proposal-builder-redesign`, delete stubs, run all §9 gates + the
  browser walk, open one PR.
- Worktree setup per project memory: fresh worktrees need `npm install` and a
  copied `.env.local`; run vitest with the `--exclude '**/.claude/**'` guard;
  push with the Lifewithmo `gh` account.

## Out of scope (explicitly)

Fonts; customer comments / change requests; engagement analytics beyond the
existing `events[]`; versioning & approvals; convert-to-work (separate spec
exists: `2026-08-07-convert-to-work-design.md`); templates; payment schedules;
recurring items; internal cost/margin fields.
