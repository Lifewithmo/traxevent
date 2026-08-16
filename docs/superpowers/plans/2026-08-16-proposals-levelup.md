# Proposals Level-Up — module 6 of the Cockpit rollout

> Executed 2026-08-16 against `docs/superpowers/plans/2026-08-15-module-levelup-playbook.md` §5 (Proposals) and §2 (the enforceable checklist). Follows Client Cockpit (#90) and Today (#91).

Archetype: **LEDGER** for the collection surfaces. The BUILDER (the proposal editor) is
already the crown jewel — per the playbook, *leave the builder alone*; it gets a
tokenization pass and two kit swaps, nothing structural.

## What the audit actually found

A five-agent parallel audit of the real files (not the playbook's assumptions) moved
three things:

1. **The Clients-rail half is already shipped.** `ClientWorkingRail.tsx` already renders
   proposals as `RelatedRecordCard`s with a correct per-status tone map. The playbook's
   "per-lead list → RelatedRecordCards in the Pipeline/Clients rail" item is done. What
   remains is `LeadProposalsClient`, the chip-panel embed on the opportunity page.

2. **`window.confirm` / `window.prompt` are deliberate, not debt.** The playbook checklist
   says "zero `window.confirm`/`window.prompt` — kit dialog only". But
   `__tests__/.../ProposalBuilderClient.test.tsx` contains cases *named*
   `'keeps window.prompt for void'` and `'keeps window.confirm for delete'`, and four other
   admin components use the same convention. Replacing them is a behaviour change requiring
   a repo-wide `ConfirmDialog`/`PromptDialog` primitive. **Deferred**, deliberately — this
   pass is presentation-only.

3. **Most "raw Tailwind literals" are already tokens.** `app/globals.css` re-grades the
   stock Tailwind ramps onto the warm palette (`--color-gray-500 → --warm-500`), so
   `text-gray-500` is byte-identical to `text-muted-foreground` in light mode. The swaps buy
   semantic intent, not pixels. **`white` is NOT remapped** — so the ~12 `bg-white`
   occurrences are the only genuine dark-mode breaks, and they were the priority.

Also confirmed: **no `Sheet` is needed.** The LEDGER frame nominally ends in a detail
Sheet/drawer, but a proposal row already has a real destination — the full builder route at
`/{orgSlug}/leads/{leadId}/proposals/{proposalId}`. A drawer would be a worse duplicate.
No `Tabs` either.

## Data gap worth recording

There is **no `sent_at` on `Proposal`**, and no `{kind:'sent'}` event is ever written
(`ProposalEvent.kind` declares it; nothing writes it). `sendProposal` sets only
`{status, updated_at}`, and `updated_at` is bumped by every autosave. So **"days since
sent" is not derivable** today. The needs-attention signal is built only from fields that
genuinely exist: `expires_at` (via `proposalExpiryInstant`) and `first_opened_at`/`events`
(via `isProposalOpened`). Adding `sent_at` is the single highest-value follow-up.

## Tasks

| # | Task | Files | Wave |
|---|---|---|---|
| 0 | Ledger builder + `PROPOSAL_STATUS_TONE` | `lib/proposals.ts`, `lib/proposals/ledger.ts` | 0 (serial — everything imports it) |
| A | `/proposals` index → LEDGER | `components/admin/proposals/*`, `app/(admin)/[orgSlug]/proposals/page.tsx`, delete `AllProposalsTable.tsx` | 1 |
| B | Per-lead panel onto the kit | `components/admin/LeadProposalsClient.tsx` | 1 |
| C | Templates surface | `components/admin/templates/*` | 1 |
| D1 | Tokenize builder canvases | `proposal-builder/{BlockCanvas,PricingCanvas,TotalsCanvas,InlineText,ItemPopover}.tsx` | 1 |
| D2 | Builder chrome: kit `Menu`, `StatusPill`, tokens | `proposal-builder/{TopBar,ProposalBuilderClient,SendDialog,DraftComposer,SkeletonPicker}.tsx` | 1 |

Wave 1 runs as five concurrent isolated-worktree implementers with disjoint file sets, each
`git reset --hard proposals-levelup` first to pick up wave 0, then cherry-picked onto the
branch.

## Design — the index ledger

KPI band (four `StatTile`s, all previously computed and discarded):

| Tile | Source | Tone |
|---|---|---|
| Out for signature | Σ ceiling of `sent` | money |
| Needs attention | count of signalled rows | alert when > 0 |
| Accepted | Σ locked selection total of `accepted` | money |
| Deposits due | Σ `depositAmount` on accepted, unpaid | alert when > 0 |

Groups, decision-first: **Needs attention** (urgent tone) → Out for signature → Drafts →
Accepted → Closed (rejected + voided). Empty groups are omitted.

A signalled row shows its *signal* pill (`Expired` / `Expiring soon` / `Not opened`) instead
of a `Sent` pill — every signalled row is sent, so both would be redundant.

Money tiles gate on `status === 'accepted'`, never on the presence of a selection:
`proposalDisplayRange` returns the locked total for rejected and voided proposals too, so
summing it blindly would count dead proposals as booked value.

**Both index components stay server components.** The raw `Proposal` doc carries `token`,
`signature.ip`, `signature.signer_email` and `pending_signature`; `buildProposalLedger`
returns minimal rows without them. Making the ledger `'use client'` for filter chips would
ship that PII to the browser — the groups already segment by decision state, so chips were
not worth it.

## The paper invariant (read before touching the builder)

Everything rendered inside `<ProposalTheme>` sits on `bg-[var(--warm-0)]` — **permanently
white in both themes, by design**: it is the customer's document, not app chrome. `--warm-*`
has no `.dark` override; `--foreground`, `--muted-foreground`, `--border`, `--muted` and
`--popover` all do.

So on the paper, ink must be pinned to fixed `--warm-*` values, **not** semantic tokens. The
stock literals (`text-gray-700` etc.) were already theme-independent, because `@theme inline`
re-grades those ramps onto the warm ramp with no dark block — which is why "tokenizing" them
made things worse, not better: `text-foreground` is near-white on white paper in dark mode.
It also broke WYSIWYG parity in *light* mode, because the customer renderers
(`components/proposals/ProposalDocument.tsx`, `ProposalPricing.tsx`) still use the literals.

Files that obey the rule and carry a `COLOUR RULE` header: `BlockCanvas`, `PricingCanvas`,
`TotalsCanvas`, `InlineText`, `ItemPopover`. Also pinned: the paper wrappers in
`ProposalBuilderClient` and `TemplateBuilderClient`, `SkeletonPicker`'s thumbnail ladder, and
the `EmptyState` on the canvas.

`DraftComposer` is the awkward one: one body serves both a `hero` (on the paper) and a
`modal` (theme-aware chrome), so no single theme-aware token is right. Its error and
advisory ink stays on the fixed stock literals deliberately.

Money on the paper stays `toFixed(2)` in `PricingCanvas` / `TotalsCanvas` — those are
WYSIWYG-locked to `ProposalPricing` and must not drift alone. `ProposalBuilderClient`'s
`money()` stays `toFixed(2)` for the same reason: it feeds the "Client sees:" strip and the
send dialog, both of which *claim* to show the customer's figure.

Still theme-aware on the paper, and not fixed here: `TotalsCanvas`'s form controls
(`border-input`, `placeholder:text-muted-foreground`, a few bare `border-t`/`divide-y`).
Pre-existing, latent, and untouched by this branch.

**None of this is live today** — nothing in the app ever applies the `.dark` class (no theme
provider, and `@custom-variant dark` is class-gated with no `prefers-color-scheme` fallback).
It all lands the day a theme toggle ships.

## Deferred (with reasons)

- `window.confirm`/`prompt` → kit dialog. Test-pinned, repo-wide convention, behaviour
  change. Needs a shared `ConfirmDialog` primitive first.
- The two native `<select>`s in `TotalsCanvas`. No `Select` primitive exists; two tests cast
  to `HTMLSelectElement`.
- `BlockCanvas`'s `+` block-type menu → kit `Menu`. It is deliberately *horizontal*;
  `MenuContent` stacks vertically and hard-codes `align="end"`, and portalling it breaks the
  divider's hover-reveal. A redesign, not a swap.
- Filter chips / search on the index. Would force the ledger client-side (see PII note).
- Adding `sent_at` to `Proposal` + writing the `sent` event. Data-model change.
- `components/client-portal/ClientPortalView.tsx` renders a fourth per-proposal row style
  with hardcoded grays — out of module scope.
- Extracting a shared `GroupHeader` kit primitive. The urgent/normal group header is now
  written three times (`ProposalsLedger`, `TodayQueue`, `PipelineTasksList`). It is the one
  brick this rollout owed and did not ship; other modules are mid-flight in parallel
  sessions, so extracting it now would collide.
- `LeadProposalsClient` still takes a full `Proposal[]` into a client component, serializing
  `token`/`signature.ip`/`signer_email` — pre-existing, and `token` is genuinely needed for
  the copy-link button. The new `/proposals` index deliberately does the opposite (server
  component, narrowed rows). Narrowing the per-lead prop is follow-up work.
- Pagination for `/proposals`. `listAllProposals` is unbounded and the ledger row is ~4× the
  DOM of the old table row. Not made worse at the query level, but the page gets heavier.
- Adding `sent_at` + writing the `sent` event, which would unlock a real "days since sent"
  signal (see the data-gap note above).
