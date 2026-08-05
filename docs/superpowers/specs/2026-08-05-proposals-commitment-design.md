# Proposals — Commitment: e-signature + deposit (Increment 2)

**Date:** 2026-08-05
**Status:** approved in brainstorming; feeds the implementation plan.
**Worktree/branch:** `claude/proposals-commitment` (off `main`).
**Builds on:** Increment 1 ("let the customer choose", merged — PR #38): `Proposal`, `ProposalSelection`, `computeSelectedTotal`, `depositAmount`, the public token page, and `deposit` terms captured as data.

## Vision

Turn a soft "accept" into a **binding, audit-defensible close**: the customer signs
(e-signature) and, when the vendor requires it, pays a deposit — in one flow, with a
complete audit trail. Second increment of the proposal level-up; the first-principles order
is: (1) customer choice ✅ → **(2) commitment** → (3) convert-to-work → (4) governance.

## Legal framing (informational — NOT legal advice; obtain counsel before launch)

The design captures the standard evidence US e-signature law expects, mapped to stored fields.

**E-signature (ESIGN Act + UETA):** an e-signature is enforceable when you can show
intent to sign, consent to transact electronically, association of the signature with the
record, attribution to the signer, and a retained/reproducible record. Each maps to a
captured field (see Data model → `ProposalSignature`).

**Merchant / payments:** never let raw card data touch our servers — Stripe Elements
tokenizes client-side (lightest PCI-DSS SAQ-A scope). Deposits are lawful but the amount,
purpose, and refund/cancellation policy must be disclosed at point of sale and the
customer's acceptance recorded (chargeback defense) — captured via `deposit_terms` folded
into the signed hash. Payments run on the org's **Stripe Connect** account with the
platform fee, so the org is the merchant collecting from its own client.

**Deferred to counsel / later:** jurisdiction-specific consumer disclosures, surcharge /
convenience-fee laws, sales-tax on deposits, and cooling-off rules. Flagged, not built here.

## Reuse (already on `main`)

- **Payments:** `/api/payments/intent` creates a Connect `PaymentIntent` on
  `org.stripe_account_id` with a 1% platform fee; `components/registration/steps/PaymentStep.tsx`
  collects card via `@stripe/react-stripe-js` `Elements` + `PaymentElement` + `confirmPayment`
  driven by a `clientSecret`; `/api/payments/webhook` is Stripe-signature-verified. `lib/stripe.ts`.
- **Increment 1 helpers/types:** `computeSelectedTotal`, `depositAmount`, `ProposalSelection`.
- **CRM:** `ActivityEvent` for the human-facing timeline (milestone mirror of the audit log).
- **Email:** Resend (`lib/resend.ts` / `lib/email.ts`) for the signer's confirmation.

## Data model

Three independent states (the doc's "don't overload one status field"), plus audit records.

```ts
type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'rejected'   // lifecycle (unchanged)
type PaymentStatus  = 'not_required' | 'deposit_pending' | 'deposit_paid'

interface ProposalSignature {        // presence = signed; IMMUTABLE once written
  signer_name: string
  signer_email: string
  signed_at: string                  // SERVER UTC (never client-supplied)
  ip: string                         // server-derived (x-forwarded-for via next/headers)
  user_agent: string                 // server-derived
  consent_electronic: true           // recorded "I consent to electronic records"
  document_hash: string              // sha256 of the canonical signed snapshot
}

interface ProposalEvent {            // append-only legal audit trail
  kind: 'sent' | 'viewed' | 'accepted' | 'signed' | 'deposit_paid' | 'declined'
  at: string                         // server UTC
  ip?: string
  user_agent?: string
}

interface ProposalDepositPayment {
  intent_id: string                  // Stripe PaymentIntent id (system of record)
  amount: number                     // dollars, server-computed
  paid_at?: string
}

interface Proposal {                 // ADDITIONS (all optional; back-compatible)
  // ...existing Increment-1 fields...
  deposit_gate?: 'before_accept' | 'after_accept'   // per-proposal; DEFAULT 'after_accept'
  deposit_terms?: string             // cancellation/refund policy — shown at sign, folded into the hash
  payment_status?: PaymentStatus
  signature?: ProposalSignature
  deposit_payment?: ProposalDepositPayment
  events?: ProposalEvent[]           // append-only (subcollection if it grows)
}
```

**`document_hash`** is the legal linchpin: sha256 over a **canonical, order-stable**
serialization of exactly what the customer saw and agreed to — the public snapshot fields,
their `selection`, computed totals, `deposit`, and `deposit_terms`. It proves *this* is what
was signed, and it is why **signing locks the proposal**.

## Gate resolution (payment is never forced by default)

`deposit_gate` only appears in the builder once a deposit term is set; it **defaults to
`after_accept`**. Three paths:

| Vendor setup | Customer to close | `payment_status` |
|---|---|---|
| No deposit term | Sign only | `not_required` |
| Deposit + `after_accept` (default) | Sign closes immediately; deposit offered (pay now or later) | `deposit_pending` → `deposit_paid` |
| Deposit + `before_accept` | Sign **then** pay; finalizes on webhook confirm | `deposit_pending` → `deposit_paid` |

Pre-payment gating exists only when the vendor **both** sets a deposit **and** deliberately
flips the gate. `before_accept` finalizes **atomically in the webhook** so an abandoned
payment never leaves a "signed but not closed" record.

## Surfaces

### Public page (evolve `components/proposals/ProposalResponseClient.tsx`)

Increment-1 selection, then **Accept becomes Sign**:
1. **Sign step:** typed full name, email, and an **"I agree + consent to sign electronically"**
   checkbox; `deposit_terms` shown here when set.
2. **Gate resolves:** `after_accept`/no-deposit → submitting signs and closes; a **"Pay
   deposit now"** `PaymentElement` section appears but is optional. `before_accept`+deposit →
   proceed to the deposit `PaymentElement`; finalizes only when the webhook confirms.
3. **Confirmation state:** "Signed" (+ "deposit paid"), locked total; the page remains the
   signer's retained copy.
Decline unchanged (logs a `declined` event). Mobile-responsive.

### Admin builder (evolve `components/admin/ProposalEditorClient.tsx`)

- When a deposit term is set: the **gate toggle** ("Require deposit to accept" vs "Request
  deposit after", default the latter) and a **deposit-terms / cancellation-policy** textarea.
- Once signed: the editor **locks** (edits blocked — "This proposal is signed; create a new
  version to change it") and a read-only **Signature & audit panel** appears.

### Audit panel (the "if there's ever an audit" surface — in-app only this increment)

For a signed proposal, shows: signer name + email; `signed_at` (UTC); **IP**; user-agent;
`document_hash`; payment status + amount + `paid_at`; and the full append-only `events` log.
(Downloadable export is deferred.)

## Actions, endpoints & webhook

**Public actions** (`actions/proposals-public.ts`):
- `signProposal(token, { signer_name, signer_email, consent, selection })` — the
  `after_accept` / no-deposit close. Server: **runtime-validates** the payload (zod);
  validates the selection (Increment-1 logic); requires non-empty name/email and
  `consent === true`; **derives `ip`/`user_agent`/`signed_at` server-side** (`next/headers`);
  computes `document_hash`; writes `signature`; sets `status: accepted` + `payment_status`
  (`deposit_pending` or `not_required`); appends the `signed` event; advances the opportunity
  to `closed_won`.
- Decline stays: `respondToProposal(token, 'rejected')` (or `declineProposal`) logs a
  `declined` event. (The Increment-1 `accepted` branch is superseded by `signProposal` —
  acceptance now always requires a signature.)

**Deposit PaymentIntent** — extend `/api/payments/intent` (or a sibling route) to mint a
Connect `PaymentIntent` for a proposal deposit given a token: `amount = depositAmount(total,
deposit)` computed **server-side**, on `org.stripe_account_id`, platform fee applied,
`metadata: { purpose: 'proposal_deposit', proposal_id, token }`. For `before_accept`, the
sign step stashes the captured signature fields (ip/ua/ts/hash) with the intent (metadata or
a `pending_signature` field) and returns the `clientSecret`; the proposal stays `sent`.

**Webhook** (`/api/payments/webhook`, Stripe-sig-verified): on `payment_intent.succeeded`
with `purpose: 'proposal_deposit'` → **finalize idempotently**: write/confirm the signature,
set `accepted` + `deposit_paid`, append `signed` (if pending) + `deposit_paid` events,
advance to `closed_won`. The proposal is identified from **metadata**, never client input.

## Security / compliance invariants

- `ip` / `user_agent` / `signed_at` / `document_hash` / deposit **amount** are all
  **server-derived**; the client supplies only selection, name, email, consent.
- **Runtime-validate** the public sign payload (the zod parse parked in Increment 1 — it
  matters more now that this path takes money and legal weight).
- Token remains the sole public authorization; drafts never exposed; **only a `sent`
  proposal can be signed**; a **signed proposal is locked** (no re-sign, no admin edit).
- **Webhook finalization is idempotent** (double-fire → no-op); Stripe signature verified;
  `PaymentIntent` on the org's connected account with the platform fee.
- Card data never touches our servers (Elements/PaymentElement only).

## Retention (ESIGN "able to retain a copy")

The signed proposal stays viewable at its token URL as the signer's permanent copy (locked
snapshot + signature block + deposit state); on signing we **email the signer a
confirmation** (Resend) with the link and date. `document_hash` + stored snapshot make it
exactly reproducible. Branded PDF is Increment 4.

## Testing (follows the repo pattern)

- **Pure:** `document_hash` canonicalization is deterministic and key-order-stable across
  equivalent inputs; `depositAmount` (exists).
- **Public actions (security-critical):** `signProposal` validates name/email/consent/selection,
  captures server-side ip/ua (mocked `next/headers`), hashes, writes the signature, sets
  states per gate, advances `closed_won`; is **idempotent + lock-enforcing** (can't re-sign,
  can't sign a non-`sent` proposal); zod rejects malformed payloads.
- **Intent route:** server-computed amount, Connect account, correct metadata; rejects when
  no deposit / invalid proposal.
- **Webhook:** `proposal_deposit` success finalizes idempotently and identifies the proposal
  from metadata (never client input); duplicate events are no-ops.
- **UI:** no new vitest (repo convention); verified via `tsc --noEmit` + `next build`.
- **Green gate** each task; all work on `claude/proposals-commitment`; never commit to `main`.
  (When running the full suite from the main root, exclude nested worktrees:
  `npx vitest run --exclude '**/.claude/**'`.)

## Out of scope (later increments)

- **Increment 3 — Convert-to-work:** accepted+signed snapshot auto-creates Invoice/Event
  (the invoicing foundation now on `main` is the target), inheriting scope/price/deposit.
- **Increment 4 — Governance:** versioning with a locked accepted version + change orders,
  internal cost/margin privacy, view/engagement analytics, content library/templates, AI,
  branded PDF, enforced expiration.
- **Deferred within commitment:** multi-signer / signature order, signer email-verification
  (magic link), refunds / partial-deposit handling, audit-record export.

## Principles

- **Server-authoritative & append-only:** every legally-relevant field is captured on the
  server; the audit log is append-only; the signed document is hashed and locked.
- **Reuse:** evolve the two proposal components and the existing Connect PaymentIntent +
  webhook + Elements pattern — do not build a parallel payment stack.
- **Payment is opt-in:** default `after_accept`; no deposit ⇒ no payment step at all.
