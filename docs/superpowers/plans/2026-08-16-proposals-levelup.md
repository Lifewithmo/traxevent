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
