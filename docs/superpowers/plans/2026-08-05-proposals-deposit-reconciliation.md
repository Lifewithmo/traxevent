# Proposals — Deposit Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paid Stripe deposit (Increment 2) automatically produces a **paid deposit invoice** in the AR system, closing the gap where collected cash was invisible to the books — idempotently, from the unauthenticated `proposal_deposit` webhook.

**Architecture:** Extract behavior-preserving **guard-free invoice cores** from `actions/invoices.ts` (mirroring `lib/crm/leads.ts`) so an unauthenticated context can create an invoice + record a payment. A new idempotent `reconcileProposalDeposit` composes those cores. The Increment-2 `proposal_deposit` webhook calls it after finalizing the proposal.

**Tech Stack:** Next.js 16 (route handlers, server actions), Firebase Admin, Stripe, Vitest. No `zod`.

## Global Constraints

- **This is NOT stock Next.js** — consult `node_modules/next/dist/docs/` before routing work. **Do NOT re-export a type from a `'use server'` module** (breaks `next build`; tsc won't catch it — see the repo memory / PR #42). Run `next build` before calling the branch green.
- **Work only in** `/Users/rm/vw/traxevent/.claude/worktrees/proposals-deposit-reconcile` on branch `claude/proposals-deposit-reconcile`. Confirm the branch before every commit. **Never commit to `main`.**
- **Core extraction is behavior-preserving:** the admin actions (`createInvoice`, `generateFromProposal`, `recordPayment`) keep identical behavior and their existing tests stay green; they just delegate to the cores after `assertOrgAdmin` + fetching guarded deps.
- **Server-authoritative & idempotent:** the applied deposit payment amount is the **actual Stripe charge** (`pi.amount/100`), never recomputed; the reconciler never creates a second deposit invoice or double-records a payment under Stripe's at-least-once delivery.
- Firestore runs `ignoreUndefinedProperties` **OFF** — no raw `undefined` in `.set()`/`.update()` (use conditional spreads / `FieldValue.delete()`, as the existing code does).
- Tests mock `@/lib/firebase-admin`, `@/lib/auth/assert`, `@/lib/stripe`, `next/headers` with `vi.hoisted` spies — follow the existing `__tests__/actions/invoices*.test.ts` and `__tests__/api/payments-webhook.test.ts`.
- Green gate each task: `npx tsc --noEmit` clean AND `npx vitest run` green. `npm install` first if `server-only` load failures appear.

---

### Task 1: Extract guard-free invoice cores (behavior-preserving)

**Files:**
- Create: `lib/crm/invoices.ts`
- Modify: `actions/invoices.ts` (delegate `createInvoice` / `generateFromProposal` / `recordPayment`; import `invoicesRef` from the core)
- Test: existing `__tests__/actions/invoices*.test.ts` stay green; add `__tests__/lib/crm/invoices.test.ts` (light)

**Interfaces:**
- Produces (in `lib/crm/invoices.ts`): `invoicesRef(orgId)`; `listInvoicesCore(orgId, leadId): Promise<NormalizedInvoice[]>`; `createInvoiceCore(orgId, leadId, input): Promise<Invoice>` where input adds `customer_id?`; `generateFromProposalCore(orgId, leadId, proposal, existingInvoices, opts): Promise<Invoice>` (takes the pre-fetched proposal + invoices, opts `{ type: InvoiceType }`, resolves `customer_id` via `leadsRef`); `recordPaymentCore(orgId, invoiceId, input): Promise<void>`.
- Consumes: pure helpers `proposalInvoiceLines`, `acceptedProposalTotal`, `previouslyBilled`, `assertWithinScope` (`@/lib/invoice-progress`), `invoiceAmountDue`, `amountPaid` (`@/lib/invoices`), `derivePaymentStatus` (`@/lib/invoice-status`), `normalizeInvoice` (`@/lib/invoice-normalize`), `depositAmount` (`@/lib/proposals`), `leadsRef` (`@/lib/crm/leads`).

- [ ] **Step 1: Create `lib/crm/invoices.ts`** — move `invoicesRef` here and lift the bodies of `createInvoice`/`generateFromProposal`/`recordPayment` into guard-free cores. `createInvoiceCore` takes `customer_id?` in its input (instead of calling `getLead`); `generateFromProposalCore` takes `proposal: Proposal` and `existingInvoices: NormalizedInvoice[]` (instead of `getProposal`/`listInvoices`) and calls `createInvoiceCore` (resolving `customer_id` via `leadsRef(orgId).doc(leadId).get()` inside, or accepting it). Keep the `switch(opts.type)` itemization, the `assertWithinScope` guard for non-quick, and the post-create `source`/`discount`/`tax_rate`/`credits` update, verbatim from the current `generateFromProposal`. `recordPaymentCore` is the current `recordPayment` body minus `assertOrgAdmin`. `listInvoicesCore` is the current `listInvoices` query minus `assertOrgMember`.

  **This module must NOT be `'use server'`** (it's a plain lib module callable from anywhere) and must not re-export types.

- [ ] **Step 2: Refactor `actions/invoices.ts` to delegate**
  - Import `invoicesRef`, `listInvoicesCore`, `createInvoiceCore`, `generateFromProposalCore`, `recordPaymentCore` from `@/lib/crm/invoices`; delete the local `invoicesRef` definition (every other function keeps using the imported one).
  - `createInvoice` = `await assertOrgAdmin(orgId)` → `const lead = await getLead(orgId, leadId)` → `return createInvoiceCore(orgId, leadId, { ...input, customer_id: lead?.customer_id })`.
  - `listInvoices` = `await assertOrgMember(orgId)` → `return listInvoicesCore(orgId, leadId)`.
  - `generateFromProposal` = `await assertOrgAdmin(orgId)` → fetch `proposal`/`existing`/(lead for customer_id) with the existing guarded calls → `return generateFromProposalCore(orgId, leadId, proposal, existing, opts)` (keep the "not found"/"not accepted" throws in the action or move them into the core — pick one; core is the safer home so the webhook path is guarded too).
  - `recordPayment` = `await assertOrgAdmin(orgId)` → `return recordPaymentCore(orgId, invoiceId, input)`.
  - Leave `updateInvoice`/`issueInvoice`/`voidInvoice`/etc. unchanged (they keep using the imported `invoicesRef`).

- [ ] **Step 3: Run the FULL existing suite** — `npx vitest run` must stay green (the invoice action tests exercise the cores via delegation). `npx tsc --noEmit` clean. If a test mocked the local `invoicesRef` by module path, update the mock target to `@/lib/crm/invoices`.

- [ ] **Step 4: Add a light core test** — `__tests__/lib/crm/invoices.test.ts`: `createInvoiceCore` writes an invoice with `customer_id` when passed; `recordPaymentCore` appends a payment + derives `payment_status`; `generateFromProposalCore` with `{ type: 'deposit' }` produces a single deposit line = `depositAmount(acceptedTotal, proposal.deposit)` and `source.id === proposalId`. Mock `@/lib/firebase-admin` as the action tests do.

- [ ] **Step 5: Commit**

```bash
git add lib/crm/invoices.ts actions/invoices.ts __tests__/lib/crm/invoices.test.ts
git commit -m "refactor(invoices): extract guard-free cores (create/generateFromProposal/recordPayment); actions delegate"
```

---

### Task 2: `reconcileProposalDeposit` — idempotent reconciler

**Files:**
- Create: `lib/crm/deposit-reconcile.ts` (or add to `lib/crm/invoices.ts`)
- Test: `__tests__/lib/crm/deposit-reconcile.test.ts`

**Interfaces:**
- Consumes: `invoicesRef`, `listInvoicesCore`, `generateFromProposalCore`, `recordPaymentCore` (Task 1); `adminDb`.
- Produces: `reconcileProposalDeposit(orgId: string, leadId: string, proposalId: string, payment: { intent_id: string; amount: number; paid_at: string }): Promise<void>`.

- [ ] **Step 1: Write the failing test** — `__tests__/lib/crm/deposit-reconcile.test.ts`. Mock `@/lib/firebase-admin` so a proposal (accepted, with a deposit) is readable by id via collectionGroup, and the lead's invoices list is configurable; spy on invoice `set`/`update`. Cover:
  - **creates when none exists:** first call creates a `deposit` invoice for the proposal and records a payment of the **Stripe amount** (`payment.amount`), method `card`, note referencing `intent_id`; resulting `payment_status` is `paid` and `lifecycle` is `issued`.
  - **idempotent:** a second call (now a deposit invoice with a payment exists) writes **nothing** (no new invoice, no second payment).
  - **records onto an existing unpaid deposit invoice:** when a deposit invoice for the proposal exists with **no** payments (e.g. admin-generated, or a prior partial failure), it records the payment on **that** invoice rather than creating a new one.
  - **uses the Stripe amount, not a recompute:** pass `payment.amount` different from `depositAmount(...)` and assert the recorded payment equals `payment.amount`.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `reconcileProposalDeposit`:**

```typescript
export async function reconcileProposalDeposit(
  orgId: string,
  leadId: string,
  proposalId: string,
  payment: { intent_id: string; amount: number; paid_at: string },
): Promise<void> {
  // read the accepted proposal (guard-free)
  const pSnap = await adminDb.collectionGroup('proposals').where('id', '==', proposalId).limit(1).get()
  if (pSnap.empty) return
  const proposal = pSnap.docs[0].data() as Proposal
  if (proposal.status !== 'accepted') return   // nothing to reconcile against

  const existing = await listInvoicesCore(orgId, leadId)
  const depositInv = existing.find((i) => i.type === 'deposit' && i.source?.id === proposalId)

  if (depositInv) {
    if ((depositInv.payments?.length ?? 0) > 0) return        // already reconciled → no-op
    await recordPaymentCore(orgId, depositInv.id, {
      amount: payment.amount, method: 'card', note: `Stripe deposit ${payment.intent_id}`,
    })
    await invoicesRef(orgId).doc(depositInv.id).update({ lifecycle: 'issued', issued_at: payment.paid_at })
    return
  }

  const created = await generateFromProposalCore(orgId, leadId, proposal, existing, { type: 'deposit' })
  await recordPaymentCore(orgId, created.id, {
    amount: payment.amount, method: 'card', note: `Stripe deposit ${payment.intent_id}`,
  })
  await invoicesRef(orgId).doc(created.id).update({ lifecycle: 'issued', issued_at: payment.paid_at })
}
```

(If setting `lifecycle`/`issued_at` interacts with `assertEditable`/lock rules, set them in the same write path the invoicing code uses; the reconciler must not throw on a freshly-created invoice.)

- [ ] **Step 4: Run → PASS.** `npx tsc --noEmit` clean; `npx vitest run` green.

- [ ] **Step 5: Commit**

```bash
git add lib/crm/deposit-reconcile.ts __tests__/lib/crm/deposit-reconcile.test.ts
git commit -m "feat(invoices): idempotent reconcileProposalDeposit — paid Stripe deposit → paid deposit invoice"
```

---

### Task 3: Wire reconciliation into the `proposal_deposit` webhook

**Files:**
- Modify: `app/api/payments/webhook/route.ts`
- Test: `__tests__/api/payments-webhook.test.ts` (extend)

**Interfaces:**
- Consumes: `reconcileProposalDeposit` (Task 2).

- [ ] **Step 1: Restructure the `proposal_deposit` branch** so reconcile runs on **every** delivery (idempotent), not only the first. Replace the current early-return with a conditional finalize:

```typescript
if (pi.metadata?.purpose === 'proposal_deposit') {
  const proposalId = pi.metadata.proposal_id
  const snap = await adminDb.collectionGroup('proposals').where('id', '==', proposalId).limit(1).get()
  if (snap.empty) return new Response('ok')
  const ref = snap.docs[0].ref
  const proposal = snap.docs[0].data() as Proposal
  const orgRef = ref.parent.parent
  const now = new Date().toISOString()

  if (proposal.payment_status !== 'deposit_paid') {
    // ---- existing Increment-2 finalize block, UNCHANGED ----
    // (build `update`, before_accept promotion + closed_won lead advance with its
    //  do-not-reorder comment, `await ref.update(update)`, promotedSigner email)
  }

  // ALWAYS reconcile (idempotent). Runs after the proposal is `accepted`, and safely
  // replays on a retry after a partial reconcile failure.
  if (orgRef) {
    await reconcileProposalDeposit(orgRef.id, proposal.lead_id, proposal.id, {
      intent_id: pi.id, amount: pi.amount / 100, paid_at: now,
    })
  }
  return new Response('ok')
}
```

Keep the existing `familyId` registration path and everything else untouched. Preserve the do-not-reorder comment on the lead advance.

- [ ] **Step 2: Extend `__tests__/api/payments-webhook.test.ts`** — mock `@/lib/crm/deposit-reconcile` (spy on `reconcileProposalDeposit`). Assert: a `proposal_deposit` success calls `reconcileProposalDeposit(orgId, lead_id, proposal_id, { intent_id, amount: pi.amount/100, paid_at })`; it is called on **both** the first-finalize path and the already-`deposit_paid` (retry) path; the before_accept finalize + `familyId` paths are unchanged; a signature-invalid event still 400s before any reconcile.

- [ ] **Step 3: Run tests + typecheck + commit**

```bash
git add app/api/payments/webhook/route.ts __tests__/api/payments-webhook.test.ts
git commit -m "feat(invoices): reconcile the Stripe deposit into a paid deposit invoice from the webhook"
```

**REVIEW GATE:** security review after this task — the reconciler runs in the unauthenticated (Stripe-sig-verified) webhook: confirm idempotency (no duplicate invoice / double payment on retry), the applied amount is the Stripe charge, and the finalize/registration paths are intact.

---

### Task 4: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run` → all green; record the count.
- [ ] **Step 3:** `npx next build` (copy env if present: `cp /Users/rm/vw/traxevent/.env.local .env.local`, build, then `rm -f .env.local`) → succeeds; no `'use server'` type-reexport regressions.
- [ ] **Step 4:** Manual smoke (optional): pay a `before_accept` deposit on a test proposal; confirm a paid deposit invoice appears for the lead with the Stripe amount and `payment_status: paid`; re-deliver the webhook event (Stripe CLI) and confirm no second invoice.
- [ ] **Step 5:** Commit this plan file.
- [ ] **Step 6:** Hand back for branch finish (rebase onto latest `origin/main`, green gate incl. `next build`, PR).

---

## Self-Review

**Spec coverage** (against `2026-08-05-proposals-deposit-reconciliation-design.md`):
- Guard-free cores (create/generateFromProposal/recordPayment), actions delegate → Task 1 ✅
- Idempotent `reconcileProposalDeposit` (create / record-onto-existing / no-op; Stripe amount; issued+paid) → Task 2 ✅
- Webhook wiring: reconcile on every delivery, finalize guarded, other paths intact → Task 3 ✅
- Security: idempotency, Stripe-charged amount, signature-verified path unchanged → Task 3 review gate ✅
- Reuse over rebuild (compose existing logic via cores) → Task 1 ✅
- Out of scope (Event/job record held; manual-duplicate follow-up; tips/refunds) → not planned ✅

**Placeholder scan:** cores are lifted verbatim from the current action bodies (referenced precisely); the reconciler and webhook restructure carry real code.

**Type consistency:** `generateFromProposalCore(orgId, leadId, proposal, existingInvoices, opts)` / `recordPaymentCore(orgId, invoiceId, input)` / `createInvoiceCore(orgId, leadId, input)` / `reconcileProposalDeposit(orgId, leadId, proposalId, payment)` signatures match across the cores (Task 1), the reconciler (Task 2), and the webhook call (Task 3). The reconciled payment amount is `pi.amount/100` at the call site and flows unchanged into `recordPaymentCore`.
