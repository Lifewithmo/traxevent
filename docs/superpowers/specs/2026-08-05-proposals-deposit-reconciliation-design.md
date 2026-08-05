# Proposals — Deposit reconciliation (Increment 3, scoped slice)

**Date:** 2026-08-05
**Status:** approved in brainstorming; feeds the implementation plan.
**Worktree/branch:** `claude/proposals-deposit-reconcile` (off `main`).
**Builds on:** Increment 2 (commitment, merged PR #43) — the Stripe Connect deposit + the
`proposal_deposit` webhook — and the invoicing system already on `main`.

## Why this (and only this)

Increment 3 ("convert-to-work") is **on hold** pending the ops-core pivot, which is redefining
the "work record" (the `Event`/job unit a won proposal should become). We are **not** building
proposal→Event or auto-invoicing here.

The **one ops-core-independent gap** worth closing now is a real correctness hole: when a client
pays a deposit via Stripe (Increment 2), that cash is recorded **only on the proposal**
(`proposal.deposit_payment`) and is **invisible to the invoicing / AR system**. The org's books
don't show collected cash. This slice makes a paid Stripe deposit **automatically** produce a
**paid deposit invoice**, so AR is accurate the moment the money lands — with no manual step and
no dependency on what the "work record" turns out to be.

## What already exists on `main` (reused, not rebuilt)

- `generateFromProposal(orgId, leadId, proposalId, { type })` (`actions/invoices.ts`) — itemizes
  an **accepted** proposal into a deposit/quick/final/progress invoice (line items, discount,
  tax, previously-billed credits, scope enforcement). `type: 'deposit'` yields a single deposit
  line of `depositAmount(acceptedTotal, proposal.deposit)`, `source = { type:'proposal', id }`.
- `recordPayment(orgId, invoiceId, { amount, method?, note? })` — appends an `InvoicePayment` and
  re-derives `payment_status` via `derivePaymentStatus`.
- Pure helpers: `proposalInvoiceLines`, `acceptedProposalTotal`, `previouslyBilled`,
  `invoiceAmountDue` (`lib/invoice-progress.ts`); `derivePaymentStatus` (`lib/invoice-status.ts`).
- The `proposal_deposit` webhook branch (`app/api/payments/webhook/route.ts`) that finalizes the
  proposal to `accepted` + `deposit_paid` on `payment_intent.succeeded`.

Both `generateFromProposal` and `recordPayment` are `assertOrgAdmin`-gated; the webhook is
**unauthenticated**, so it cannot call them directly (see Cores below).

## Design

### Trigger — extend the `proposal_deposit` webhook branch

After the existing finalize (`await ref.update(update)`), reconcile. Restructure the branch so
the reconcile runs on **every** delivery (not just the first), while the existing early-return
still guards only the *finalize*:

```
if (pi.metadata.purpose === 'proposal_deposit') {
  <find proposal by metadata.proposal_id; if empty → ok>
  if (proposal.payment_status !== 'deposit_paid') {
    <existing finalize: before_accept promotion + closed_won + ref.update + confirmation email>
  }
  // ALWAYS (idempotent) — covers first run AND a retry after a partial reconcile failure:
  if (orgRef) await reconcileProposalDeposit(orgRef.id, proposal.lead_id, proposal.id,
        { intent_id: pi.id, amount: pi.amount / 100, paid_at: now })
  return ok
}
```

Reconcile runs **after** the proposal is `accepted` (the finalize sets it for `before_accept`;
`after_accept` was already accepted) so `generateFromProposal`'s "must be accepted" invariant
holds. It re-reads the proposal fresh inside the reconciler.

### `reconcileProposalDeposit(orgId, leadId, proposalId, { intent_id, amount, paid_at })`

Idempotent, guard-free (runs in the unauthenticated webhook):

1. List the lead's invoices; find a **deposit invoice for this proposal**
   (`type === 'deposit'` and `source.id === proposalId`).
2. **If one exists and already has a recorded payment → no-op** (already reconciled). This is the
   idempotency key: *one reconciled deposit per proposal*.
3. **If one exists but has no payment** (e.g. an admin generated a deposit invoice manually, or a
   prior reconcile created the invoice then failed before recording the payment) → **record the
   payment on it** (don't create a second). This also means we reconcile a manual deposit invoice
   rather than duplicating it.
4. **If none exists** → create the deposit invoice from the proposal (the `generateFromProposal`
   `deposit` logic) → then record the payment.
5. The recorded payment is the **actual Stripe amount** (`amount` = `pi.amount/100`), method
   `card`, note referencing the Stripe intent id — so `payment_status` derives to **paid** and
   the books match the bank. Set the invoice `lifecycle: 'issued'` (cash changed hands — not a
   draft).

**The amount is what Stripe actually charged, never a recompute** — the invoice line comes from
the proposal (deposit term), but the *payment applied* is the real cash.

### Guard-free cores

The webhook is unauthenticated, so the reconciler composes **guard-free cores** (mirroring the
existing `lib/crm/` cores pattern). Extract from `actions/invoices.ts`, with the admin actions
delegating (behavior unchanged, existing tests stay green):

- `createInvoiceCore(orgId, leadId, input)` — `createInvoice` minus `assertOrgAdmin`.
- `generateFromProposalCore(orgId, leadId, proposal, existingInvoices, opts)` — the
  `generateFromProposal` body minus the guard; takes the already-fetched `proposal` and the
  lead's existing invoices as inputs (the webhook has the proposal in hand) so it needs no
  further guarded reads.
- `recordPaymentCore(orgId, invoiceId, input)` — `recordPayment` minus `assertOrgAdmin`.
- Reads: the reconciler lists the lead's invoices via a guard-free query (`adminDb` directly, or a
  `listInvoicesCore`).

`reconcileProposalDeposit` lives in a guard-free module (e.g. `lib/crm/invoices.ts` alongside the
existing cores, or `lib/invoice-reconcile.ts`) and composes those cores.

## Security / correctness invariants

- The reconciler is **idempotent** — a duplicate/retried webhook, or a retry after a partial
  failure, never produces a second deposit invoice or a double payment.
- The **applied payment amount = the Stripe-charged amount** (`pi.amount`), never client-supplied
  or recomputed.
- The reconciler only ever acts on a proposal reached via the **signature-verified** webhook and
  identified from `metadata.proposal_id` (unchanged from Increment 2); it does no client-trusted
  lookups.
- Extracting the cores is **behavior-preserving**: the admin actions delegate to them and their
  existing tests remain green.

## Testing

- **`reconcileProposalDeposit` (unit, the correctness surface):** first run creates a paid
  deposit invoice for the Stripe amount, `payment_status` paid, `lifecycle` issued; **second run
  is a no-op** (idempotent); records onto an **existing** deposit invoice instead of duplicating;
  the recorded amount equals `pi.amount` (not a recompute).
- **Cores:** `createInvoiceCore`/`generateFromProposalCore`/`recordPaymentCore` covered by the
  existing action tests (which now exercise them via delegation) plus any direct core test.
- **Webhook:** a `proposal_deposit` success now also reconciles (paid deposit invoice appears);
  a duplicate event does not double-invoice; the existing before_accept finalize + `familyId`
  registration paths are unchanged.
- Green gate each task: `npx tsc --noEmit` clean AND `npx vitest run` green (and `next build`
  before finish — a `'use server'` type re-export passes tsc but breaks the build). All work on
  `claude/proposals-deposit-reconcile`; never commit to `main`.

## Out of scope (flagged, deliberately not built)

- **The rest of convert-to-work** — proposal→Event / the "job" record — stays **held** pending
  ops-core, plus auto-generating quick/final invoices on accept.
- **Manual-duplicate guard:** after this ships, the manual "generate deposit invoice" button could
  still create a *second* deposit invoice if used after reconciliation already made one (the
  reverse order — reconcile records onto a manual invoice, but a manual invoice made after
  reconcile isn't deduped). A small follow-up should have the manual flow detect/surface the
  reconciled deposit invoice. Not built here.
- Tips, partial deposits, refunds, and the Increment-2 parked items (Stripe idempotency key,
  signProposal transaction) are unchanged and out of scope.

## Principles

- **Reuse over rebuild:** compose the invoicing team's existing itemization/payment logic via
  behavior-preserving cores — do not duplicate invoice construction.
- **Server-authoritative & idempotent:** the applied amount is the real Stripe charge; the
  reconciler is safe under Stripe's at-least-once delivery.
- **Ops-core-independent:** touches only proposals + invoices; the work-record decision is
  untouched.
