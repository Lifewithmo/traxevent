# Void/Replace Lifecycle Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Restrict `voidInvoice` and `replaceInvoice` to `lifecycle === 'issued'`, rejecting draft/approved and already-terminal invoices.

**Architecture:** Add a lifecycle guard after `normalizeInvoice`, before any write, in both actions. No model/UI change.

**Tech Stack:** Next.js 16 server actions, Firestore (firebase-admin), Vitest, TypeScript strict.

## Global Constraints

- Green gate: `npx tsc --noEmit` clean AND `npx vitest run` passing.
- Edit only `actions/invoices.ts` and `__tests__/actions/invoices.test.ts`. No CRM/proposals files.
- One commit. Commit message ends with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 1: Guard voidInvoice and replaceInvoice to issued-only

**Files:**
- Modify: `actions/invoices.ts` (`voidInvoice`, `replaceInvoice`)
- Test: `__tests__/actions/invoices.test.ts`

**Interfaces:**
- Consumes: `normalizeInvoice` (already imported in this file), existing `voidInvoice(orgId, invoiceId, reason?)` and `replaceInvoice(orgId, invoiceId)`.
- Produces: both throw when the invoice is not `issued`; behavior unchanged for issued invoices.

- [ ] **Step 1: Add failing tests** to `__tests__/actions/invoices.test.ts`. Reuse the file's real invoice-doc get/update/set spy names (shown here as `invoiceDocGetSpy`/`invoiceDocUpdateSpy`). The file already has a passing `voidInvoice` test on an issued invoice — keep it. Add:

```ts
it('voidInvoice rejects a draft (delete instead)', async () => {
  invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({
    id: 'inv-1', lifecycle: 'draft', line_items: [], payments: [], created_at: '' }) })
  await expect(voidInvoice('org-1', 'inv-1')).rejects.toThrow(/delete the draft/i)
  expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
})

it('voidInvoice rejects an already-voided invoice', async () => {
  invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({
    id: 'inv-1', lifecycle: 'voided', line_items: [], payments: [], created_at: '' }) })
  await expect(voidInvoice('org-1', 'inv-1')).rejects.toThrow(/already voided/i)
  expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
})

it('replaceInvoice rejects a non-issued invoice', async () => {
  invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({
    id: 'inv-1', lifecycle: 'draft', line_items: [], payments: [], created_at: '' }) })
  await expect(replaceInvoice('org-1', 'inv-1')).rejects.toThrow(/issued/i)
})
```

If `replaceInvoice`/`voidInvoice` aren't already imported in the test file's import list, add them. Confirm the existing issued-invoice `voidInvoice` test still passes.

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run __tests__/actions/invoices.test.ts`
Expected: FAIL — the new rejection tests fail (guards not present).

- [ ] **Step 3: Implement** in `actions/invoices.ts`.

`voidInvoice` — normalize and guard before the write:

```ts
export async function voidInvoice(orgId: string, invoiceId: string, reason?: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const inv = normalizeInvoice(snap.data()!)
  if (inv.lifecycle !== 'issued') {
    if (inv.lifecycle === 'draft' || inv.lifecycle === 'approved') {
      throw new Error('Only an issued invoice can be voided — delete the draft instead')
    }
    throw new Error(`Invoice is already ${inv.lifecycle} and cannot be voided`)
  }
  const now = new Date().toISOString()
  await ref.update({
    lifecycle: 'voided',
    updated_at: now,
    ...(reason?.trim() ? { void_reason: reason.trim() } : {}),
  })
}
```

`replaceInvoice` — add the guard right after it normalizes `original`:

```ts
  const original = normalizeInvoice(snap.data()!)
  if (original.lifecycle !== 'issued') {
    throw new Error('Only an issued invoice can be replaced')
  }
  // ...unchanged: create linked draft, set replaces_id/source, mark original replaced...
```

- [ ] **Step 4: Run action tests + full suite + typecheck**

Run: `npx vitest run __tests__/actions/invoices.test.ts && npx vitest run && npx tsc --noEmit`
Expected: action tests PASS, full suite PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add actions/invoices.ts __tests__/actions/invoices.test.ts
git commit -m "feat(invoicing): guard void/replace to issued invoices only

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** void issued ✓ (existing test); void draft rejected ✓; void terminal rejected ✓; replace issued ✓ (existing behavior); replace non-issued rejected ✓.
- **Placeholders:** none — full code given; `replaceInvoice`'s unchanged body is left in place (only the guard is inserted).
- **Type consistency:** `normalizeInvoice(snap.data()!)` returns `NormalizedInvoice` with `lifecycle`; guards read `inv.lifecycle`/`original.lifecycle`.
- **Isolation:** only `actions/invoices.ts` + its test.
