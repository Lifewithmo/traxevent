# Proposals — Void-with-cause + numbered reconciled deposit invoices

**Date:** 2026-08-05
**Status:** approved in brainstorming; feeds the implementation plan.
**Worktree/branch:** `claude/proposals-void-numbering` (off `main`).
**Builds on:** the deposit-reconciliation slice (merged PR #44) and the commitment increment (PR #43).

Two decided, self-contained integrity fixes in one increment.

## #2 — Number reconciled deposit invoices

**Problem:** the deposit reconciler (`lib/crm/deposit-reconcile.ts`) marks the deposit invoice
`lifecycle: 'issued'` with a raw `.update()`, bypassing the sequential-numbering counter every
other issued invoice goes through. Result: an *issued* invoice with **no `number`** — a break in
the AR number sequence.

**Design:**
- **Extract a guard-free `issueInvoiceCore(orgId, invoiceId, opts?: { issuedAt?: string })`** from
  `issueInvoice` (`actions/invoices.ts`): the `runTransaction` that reads
  `orgs/{orgId}/counters/invoice_number`, increments `seq`, formats via `formatInvoiceNumber`, and
  sets `{ lifecycle: 'issued', number, issued_at, updated_at }` atomically. `issued_at` uses
  `opts?.issuedAt ?? now`. The transaction keeps the existing guard: only a `draft`/`approved`
  invoice can be issued.
- **`issueInvoice`** keeps its `assertOrgAdmin` + the pre-transaction scope check (which uses the
  guarded `getProposal`/`listInvoices`), then delegates to `issueInvoiceCore`. Behavior-preserving;
  its test stays green.
- **The reconciler** replaces each raw `invoicesRef(orgId).doc(id).update({ lifecycle:'issued',
  issued_at })` with `issueInvoiceCore(orgId, id, { issuedAt: payment.paid_at })` — so reconciled
  deposit invoices get a real sequential number, and the Stripe-charge-time `issued_at` (from the
  prior increment) is preserved. Payment is still recorded **last** (self-healing order intact).
  - **Already-issued existing invoice:** in the "record onto existing" branch, only call
    `issueInvoiceCore` when the invoice is still `draft`/`approved`; if it's already `issued`
    (numbered), skip issuing and just record the payment (calling `issueInvoiceCore` on an
    already-issued invoice would throw).

The reconciler already asserts scope at create (`generateFromProposalCore`), so `issueInvoiceCore`
itself carries no scope re-check — that stays in the admin `issueInvoice`.

## #3 — Void a signed proposal with cause (instead of hard-delete)

**Problem:** a signed/accepted proposal is a legal record; today `deleteProposal` simply *throws*
on a signed proposal (Increment-2 guard). There's no audit-safe way to retire one.

**Design:**
- **Types:** add `'voided'` to `ProposalStatus`; add `void_reason?: string` and `voided_at?: string`
  to `Proposal`.
- **New action `voidProposal(orgId, proposalId, reason)`** (`assertOrgAdmin`): requires a non-empty
  `reason`; sets `{ status: 'voided', void_reason, voided_at, updated_at }`. Allowed on a **non-draft**
  proposal (`sent`/`accepted`, incl. signed). A `draft` throws `'Only a sent proposal can be voided'`
  (drafts are just deleted). Idempotent-safe: voiding an already-`voided` proposal is a no-op/throws
  cleanly.
- **`deleteProposal` unchanged:** hard-delete stays allowed only for *unsigned* proposals (its
  existing `signature || pending_signature` guard already blocks deleting a signed one) — signed
  proposals are retired via `voidProposal`.
- **No cascade** (deliberate): voiding annotates only the proposal. It does **not** auto-void the
  proposal's invoices or revert the lead from `closed_won` — the admin does those deliberately.
  (Cascade is a possible later follow-up.)
- **Admin UI (`ProposalEditorClient`):** the editor is already locked read-only once signed. Add a
  **"Void proposal"** button (with a required-reason prompt) shown for a non-draft, non-voided
  proposal; a `voided` proposal renders read-only with its `void_reason` and voided state. Keep the
  existing "Delete" for unsigned/draft proposals.
- **Public page:** `getPublicProposal`'s projection exposes `status`; a `voided` proposal is not
  `'sent'`, so `signProposal`/`respondToProposal` already reject it. `ProposalResponseClient` shows a
  neutral **"This proposal is no longer available."** state for `voided`.

## Security / correctness invariants

- `issueInvoiceCore` preserves the atomic counter increment (no duplicate/skipped numbers) and the
  `draft`/`approved`-only issue guard; `issueInvoice` stays behavior-preserving (existing test green).
- The reconciler stays idempotent: numbering happens inside the same self-healing flow (issue →
  record payment last); an already-issued existing invoice is never re-issued.
- `voidProposal` is `assertOrgAdmin`-gated, requires a reason, and only transitions a non-draft
  proposal; it never deletes data (the signed record is preserved).
- No raw `undefined` reaches Firestore (`ignoreUndefinedProperties` OFF).
- `lib/crm/*` stays plain modules (not `'use server'`, no type re-exports — would break `next build`).

## Testing

- **`issueInvoiceCore`:** numbers via the counter (seq increments; `formatInvoiceNumber` applied),
  sets `issued`/`number`/`issued_at` (honoring `opts.issuedAt`), throws on a non-`draft`/`approved`
  invoice. `issueInvoice`'s existing behavior/test unchanged.
- **Reconciler:** a reconciled deposit invoice now has a `number` (create path and record-onto-existing
  draft path); an already-`issued` existing invoice is not re-issued (no double-number) but still gets
  the payment; idempotency/no-op and Stripe-amount invariants from the prior increment still hold.
- **`voidProposal`:** sets `voided` + reason + `voided_at` on a `sent`/`accepted` proposal; throws on a
  blank reason and on a `draft`; does not delete. Existing `deleteProposal` tests unchanged.
- **UI:** no new vitest (repo convention); `tsc --noEmit` + `next build`.
- Green gate each task; all work on `claude/proposals-void-numbering`; never commit to `main`;
  **run `next build`** before finish.

## Out of scope

- Cascade on void (auto-voiding invoices / reverting the lead). The manual-duplicate deposit-invoice
  guard and the two parked atomicity edges (concurrent double-create, mid-create orphan) from PR #44
  remain follow-ups. Proposal→Event is the **next** increment, not this one.
