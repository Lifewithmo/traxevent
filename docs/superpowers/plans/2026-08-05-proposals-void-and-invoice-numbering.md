# Proposals — Void-with-cause + Numbered Reconciled Deposit Invoices — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (#2) reconciled deposit invoices get a real sequential invoice number; (#3) a signed proposal can be retired via an audit-safe **void-with-cause** instead of being un-deletable.

**Architecture:** Extract a behavior-preserving guard-free `issueInvoiceCore` from `issueInvoice` and route the deposit reconciler through it. Add a `'voided'` proposal status + `voidProposal` action + UI. Two independent, self-contained changes.

**Tech Stack:** Next.js 16, Firebase Admin (`runTransaction` for numbering), Vitest. No `zod`.

## Global Constraints

- **Work only in** `/Users/rm/vw/traxevent/.claude/worktrees/proposals-void-numbering` on branch `claude/proposals-void-numbering`. Confirm the branch before every commit. **Never commit to `main`.**
- **`lib/crm/*` are plain modules** — NOT `'use server'`, and must NOT re-export types (breaks `next build`; tsc won't catch it). Run `next build` before finish.
- **Behavior-preserving extraction:** `issueInvoice`'s admin behavior + its existing test stay identical; it delegates to `issueInvoiceCore` after its `assertOrgAdmin` + scope pre-check.
- **Numbering is atomic:** the counter increment stays inside `runTransaction`; only a `draft`/`approved` invoice can be issued.
- **`voidProposal` never deletes** — it transitions status, preserving the signed record. No raw `undefined` to Firestore (`ignoreUndefinedProperties` OFF).
- Green gate each task: `npx tsc --noEmit` clean AND `npx vitest run` green. `npm install` first if `server-only` load failures appear.

---

### Task 1: Number reconciled deposit invoices (extract `issueInvoiceCore`)

**Files:**
- Modify: `lib/crm/invoices.ts` (add `issueInvoiceCore`), `actions/invoices.ts` (delegate `issueInvoice`), `lib/crm/deposit-reconcile.ts` (use it)
- Test: `__tests__/actions/invoices.test.ts` (issueInvoice stays green; add core coverage), `__tests__/lib/crm/deposit-reconcile.test.ts` (numbering)

**Interfaces:**
- Produces: `issueInvoiceCore(orgId: string, invoiceId: string, opts?: { issuedAt?: string }): Promise<{ number: string }>`.
- Consumes: `adminDb`, `normalizeInvoice`, `formatInvoiceNumber` (add imports to `lib/crm/invoices.ts` if missing).

- [ ] **Step 1: Write the failing test** — in `__tests__/lib/crm/deposit-reconcile.test.ts`, add/extend: after a reconcile that creates a deposit invoice, the resulting invoice has a **`number`** (assert the invoice `.set`/`.update` sequence yields a `number` field and `lifecycle:'issued'`), and the counter doc was incremented. In `__tests__/actions/invoices.test.ts`, add a focused `issueInvoiceCore` test: on a `draft` invoice it increments `counters/invoice_number.seq` and sets `{lifecycle:'issued', number, issued_at}`, honoring a passed `opts.issuedAt`; it throws on a non-`draft`/`approved` invoice. (Follow the file's existing transaction mock, if any; else mock `adminDb.runTransaction` to invoke the callback with a `tx` whose `get`/`set` are spies.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Extract `issueInvoiceCore` into `lib/crm/invoices.ts`** — lift the `runTransaction` block from `issueInvoice` verbatim (counter read → `seq = (counterData?.seq ?? 1000) + 1` → `formatInvoiceNumber(seq, prefix)` → `tx.set(counterRef, {seq}, {merge:true})` → `tx.set(ref, {lifecycle:'issued', number, issued_at, updated_at}, {merge:true})`), with `issued_at = opts?.issuedAt ?? new Date().toISOString()`. Keep the in-transaction `draft`/`approved` guard. `counterRef = adminDb.collection('orgs').doc(orgId).collection('counters').doc('invoice_number')`, `ref = invoicesRef(orgId).doc(invoiceId)`.

- [ ] **Step 4: Delegate `issueInvoice`** (`actions/invoices.ts`) — keep `assertOrgAdmin` + the pre-transaction scope check (the `preSnap`/`getProposal`/`listInvoices`/`assertWithinScope` block) exactly as-is, then `return issueInvoiceCore(orgId, invoiceId)`. Remove the now-duplicated transaction from the action. Behavior identical — the existing `issueInvoice` test must stay green.

- [ ] **Step 5: Reconciler uses `issueInvoiceCore`** (`lib/crm/deposit-reconcile.ts`) — replace both `await invoicesRef(orgId).doc(id).update({ lifecycle: 'issued', issued_at: payment.paid_at })` calls:
  - **create branch:** `await issueInvoiceCore(orgId, created.id, { issuedAt: payment.paid_at })`.
  - **record-onto-existing branch:** only issue when still un-issued —
    ```typescript
    if (depositInv.lifecycle === 'draft' || depositInv.lifecycle === 'approved') {
      await issueInvoiceCore(orgId, depositInv.id, { issuedAt: payment.paid_at })
    }
    await recordPaymentCore(orgId, depositInv.id, { amount: payment.amount, method: 'card', note: `Stripe deposit ${payment.intent_id}` })
    ```
  Payment stays the **last** write (self-healing order preserved).

- [ ] **Step 6: Run tests + typecheck + commit**

```bash
git add lib/crm/invoices.ts actions/invoices.ts lib/crm/deposit-reconcile.ts __tests__/actions/invoices.test.ts __tests__/lib/crm/deposit-reconcile.test.ts
git commit -m "feat(invoices): number reconciled deposit invoices via guard-free issueInvoiceCore"
```

---

### Task 2: `voidProposal` action + `'voided'` status

**Files:**
- Modify: `lib/types.ts` (`ProposalStatus`, `Proposal`), `lib/proposals.ts` (`PROPOSAL_STATUSES`, labels), `actions/proposals.ts` (`voidProposal`)
- Test: `__tests__/actions/proposals.test.ts` (extend), `__tests__/lib/proposals.test.ts` (statuses)

**Interfaces:**
- Produces: `ProposalStatus` gains `'voided'`; `Proposal` gains `void_reason?: string`, `voided_at?: string`; `voidProposal(orgId, proposalId, reason): Promise<void>`.

- [ ] **Step 1: Write the failing tests** — in `__tests__/actions/proposals.test.ts`:
  ```typescript
  it('voidProposal sets voided + reason + voided_at on a sent proposal, without deleting', async () => {
    proposalDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'accepted', signature: { signer_name: 'A' } }) })
    await voidProposal('org-1', 'p1', '  duplicate booking  ')
    const w = proposalDocUpdateSpy.mock.calls[0][0]
    expect(w.status).toBe('voided')
    expect(w.void_reason).toBe('duplicate booking')     // trimmed
    expect(w.voided_at).toEqual(expect.any(String))
    expect(proposalDocDeleteSpy).not.toHaveBeenCalled()
  })
  it('voidProposal requires a reason', async () => {
    proposalDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'sent' }) })
    await expect(voidProposal('org-1', 'p1', '   ')).rejects.toThrow('A reason is required')
    expect(proposalDocUpdateSpy).not.toHaveBeenCalled()
  })
  it('voidProposal refuses a draft and an already-voided proposal', async () => {
    proposalDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'draft' }) })
    await expect(voidProposal('org-1', 'p1', 'x')).rejects.toThrow('Only a sent proposal can be voided')
    proposalDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'voided' }) })
    await expect(voidProposal('org-1', 'p1', 'x')).rejects.toThrow('already voided')
  })
  ```
  In `__tests__/lib/proposals.test.ts`, extend the statuses assertion to include `'voided'` with a truthy label.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Types** — `lib/types.ts`: `export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'voided'`; add to `Proposal`: `void_reason?: string`, `voided_at?: string`. `lib/proposals.ts`: `PROPOSAL_STATUSES` append `'voided'`; `PROPOSAL_STATUS_LABELS.voided = 'Voided'`.

- [ ] **Step 4: `voidProposal`** (`actions/proposals.ts`):
  ```typescript
  export async function voidProposal(orgId: string, proposalId: string, reason: string): Promise<void> {
    await assertOrgAdmin(orgId)
    const trimmed = typeof reason === 'string' ? reason.trim() : ''
    if (!trimmed) throw new Error('A reason is required to void a proposal')
    const ref = proposalsRef(orgId).doc(proposalId)
    const snap = await ref.get()
    if (!snap.exists) throw new Error('Proposal not found')
    const p = snap.data() as Proposal
    if (p.status === 'voided') throw new Error('This proposal is already voided')
    if (p.status === 'draft') throw new Error('Only a sent proposal can be voided')
    const now = new Date().toISOString()
    await ref.update({ status: 'voided', void_reason: trimmed, voided_at: now, updated_at: now })
  }
  ```
  (Note: `voidProposal` writes via `ref.update` directly, so the `updateProposal` sign-lock does NOT block voiding a *signed* proposal — which is the point.)

- [ ] **Step 5: Run tests + typecheck** — the new `'voided'` status must not break the public actions' `status !== 'draft'` checks or any exhaustive switch. Grep for `ProposalStatus` switches/`Record<ProposalStatus`; `PROPOSAL_STATUS_LABELS` now covers `'voided'`. `npx tsc --noEmit` clean; `npx vitest run` green.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/proposals.ts actions/proposals.ts __tests__/actions/proposals.test.ts __tests__/lib/proposals.test.ts
git commit -m "feat(proposals): voidProposal — retire a signed proposal with a cause notation"
```

---

### Task 3: UI — void button + public voided state

**Files:**
- Modify: `components/admin/ProposalEditorClient.tsx`, `components/proposals/ProposalResponseClient.tsx`

No new vitest; gate `tsc --noEmit` + `next build` (Task 4).

- [ ] **Step 1: Admin void control** (`ProposalEditorClient`) — the editor is already read-only (`locked`) when signed. Add a **"Void proposal"** `Button` (destructive/outline) shown when `proposal.status !== 'draft' && proposal.status !== 'voided'`. On click: prompt for a reason (`window.prompt('Reason for voiding this proposal:')`); if the user provides a non-empty reason, `await voidProposal(orgId, proposal.id, reason)` then `router.refresh()` (or push back to the lead). When `proposal.status === 'voided'`, render a read-only notice with `proposal.void_reason` ("Voided — {reason}") and keep everything disabled. Keep the existing **Delete** button for `draft` proposals only. Import `voidProposal` from `@/actions/proposals`.

- [ ] **Step 2: Public voided state** (`ProposalResponseClient`) — `getPublicProposal` returns a `voided` proposal (it only nulls `draft`). When `proposal.status === 'voided'`, render a neutral centered message **"This proposal is no longer available."** instead of the selection/sign UI. (Confirm `PublicProposal` carries `status`; it does.)

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npx vitest run` green (unchanged). Commit:

```bash
git add components/admin/ProposalEditorClient.tsx components/proposals/ProposalResponseClient.tsx
git commit -m "feat(proposals): void button on signed proposals + public voided state"
```

---

### Task 4: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run` → all green; record count.
- [ ] **Step 3:** `npx next build` (copy env if present: `cp /Users/rm/vw/traxevent/.env.local .env.local`, build, then `rm -f .env.local`) → succeeds (no `'use server'` type-reexport in `lib/crm/*`).
- [ ] **Step 4:** Manual smoke (optional): pay a deposit → confirm the reconciled deposit invoice now shows a real number; on a signed proposal, click Void with a reason → confirm status `voided`, reason shown, public link shows "no longer available", and the record is NOT deleted.
- [ ] **Step 5:** Commit this plan file.
- [ ] **Step 6:** Hand back for branch finish (rebase onto latest `origin/main`, green gate incl. `next build`, PR).

---

## Self-Review

**Spec coverage** (against `2026-08-05-proposals-void-and-invoice-numbering-design.md`):
- #2 `issueInvoiceCore` extraction (behavior-preserving) + reconciler numbering + already-issued skip → Task 1 ✅
- #3 `'voided'` status + `void_reason`/`voided_at` + `voidProposal` (reason required, non-draft, no delete, works on signed) → Task 2 ✅
- #3 UI: admin void button + reason + voided read-only; public "no longer available" → Task 3 ✅
- No cascade; deleteProposal unchanged → Tasks 2/3 ✅

**Placeholder scan:** Task 1 lifts the transaction verbatim; Tasks 2–3 carry the actual action code and UI behavior with the exact strings.

**Type consistency:** `issueInvoiceCore(orgId, invoiceId, opts?)` is defined in `lib/crm/invoices.ts` (Task 1) and called by both `issueInvoice` (Task 1) and the reconciler (Task 1) with `{ issuedAt: payment.paid_at }`. `ProposalStatus` gains `'voided'` (Task 2) consumed by `PROPOSAL_STATUS_LABELS` (Task 2) and the UI (Task 3); `voidProposal(orgId, proposalId, reason)` matches its UI caller (Task 3).
