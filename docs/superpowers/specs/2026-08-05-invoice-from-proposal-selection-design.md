# Reconcile Invoice Generation with the Proposal Selection Model — Design

**Date:** 2026-08-05
**Branch:** `claude/traxevent-invoicing-system-4c451a` (merged with main @ 53435d4, which includes the proposals "let the customer choose" increment).

## Problem

The invoicing foundation's `generateFromProposal` and the issue-time scope check both compute approved scope as `invoiceTotal(proposal.line_items)`. The merged proposals increment made this **stale**: a proposal's accepted value now lives in `selection.selected_total` (server-locked on accept) and is computed by `computeSelectedTotal` from the chosen **package**, selected **optional items**, **discount**, and **tax**. So for any proposal using those features, invoice generation and the scope guardrail use the wrong number and would mis-bill. Simple required-only proposals still happen to be correct.

Nothing catches this: the new proposal fields are additive/optional (tsc stays clean) and existing invoice tests mock simple proposals.

## Approach

Consume the proposal's authoritative accepted total; keep all package/optional/discount/tax complexity inside the proposals money helpers. No invoice-model changes, no tax engine.

### New pure helper — `acceptedProposalTotal`
In `lib/invoice-progress.ts` (imports from `lib/proposals.ts`; does NOT modify proposals code):
```ts
acceptedProposalTotal(proposal): number
  = proposal.selection?.selected_total
    ?? computeSelectedTotal(proposal, { optional_item_ids: [] })
```
- An **accepted** proposal carries `selection.selected_total` (locked) → use it verbatim (matches `proposalDisplayRange`).
- Fallback covers a simple accepted proposal with no selection: `computeSelectedTotal` with an empty choice = required-items subtotal − discount + tax (package proposals always have a selection, so the fallback's package base never applies to them).

### `generateFromProposal` — single-summary-line seeding
Each proposal-generated invoice type seeds **one** line priced from the accepted total (portions, not itemizations — keeps invoice total exactly equal to accepted total and avoids invoice-level discount/tax fields):
- `accepted = acceptedProposalTotal(proposal)`, `billed = previouslyBilled(existing, proposalId)`.
- **deposit** → `[{ description: 'Deposit', qty 1, unit_price: depositAmount(accepted, proposal.deposit) }]` — honors the proposal's own deposit terms (fixed/percent); $0 when the proposal set none (user edits the draft).
- **final** → `[{ description: 'Final balance', qty 1, unit_price: remainingToBill(accepted, billed) }]`.
- **progress** → `[{ description: 'Progress payment', qty 1, unit_price: 0 }]` (user fills the draft; enforced at issue).
- **quick** → `[{ description: 'Per accepted proposal', qty 1, unit_price: accepted }]`.
- Every line carries `source = { type:'proposal', id }`; invoice-level `source` unchanged (with `label`).
- Scope guardrail for non-quick uses `accepted` (not line_items).

### `issueInvoice` — same helper
The issue-time scope check (added in the foundation's final fix) also computes `approved = invoiceTotal(proposal.line_items)`. Replace with `acceptedProposalTotal(proposal)` so the issue-time guardrail is correct for package/selection proposals too.

## Scope

**In:** the `acceptedProposalTotal` helper; `generateFromProposal` seeding + scope source; `issueInvoice` scope source; tests including a package + discount/tax proposal end-to-end.

**Out:** full line-by-line itemization of the selected package/add-ons on the invoice (would need invoice-level discount/tax — a separate larger slice); invoice tax/discount fields; any change to proposals code.

## Testing (green gate: `tsc --noEmit` + `vitest run`)
1. `acceptedProposalTotal`: prefers `selection.selected_total`; falls back to `computeSelectedTotal` with discount+tax for a no-selection simple proposal; a package proposal returns its locked selected_total.
2. `generateFromProposal` deposit: seeds `depositAmount(accepted, deposit)` (e.g. 25% of a selected_total); final = `remainingToBill(accepted, billed)`; each carries proposal source.
3. `generateFromProposal` scope guardrail uses `accepted` (a package proposal whose accepted total is exceeded by prior billing throws).
4. `issueInvoice` scope check uses `accepted` (package proposal): issuing beyond the accepted total throws `/exceeds approved scope/i`.
5. Existing simple-proposal tests updated to the summary-line shape.
