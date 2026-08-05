# Invoice-from-Proposal Selection Reconciliation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make invoice generation and the scope guardrail use the proposal's authoritative accepted total (`selection.selected_total` / `computeSelectedTotal`), so package/optional/discount/tax/deposit proposals bill correctly.

**Architecture:** A pure `acceptedProposalTotal` helper wraps the proposals money model; `generateFromProposal` seeds one summary line per invoice type from it (deposit honors the proposal's deposit terms), and `issueInvoice`'s scope check uses it too. No invoice-model or proposals-code changes.

**Tech Stack:** Next.js 16 server actions, Firestore (firebase-admin), Vitest, TypeScript strict.

## Global Constraints

- Green gate (every task): `npx tsc --noEmit` clean AND `npx vitest run` passing.
- Do NOT modify proposals code (`lib/proposals.ts`, `actions/proposals*.ts`) or any CRM file — import from them read-only.
- Invoice amounts are dollars, rounded to cents.
- One commit per task. Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 1: `acceptedProposalTotal` pure helper

**Files:**
- Modify: `lib/invoice-progress.ts` (add `acceptedProposalTotal`)
- Test: `__tests__/lib/invoice-progress.test.ts`

**Interfaces:**
- Consumes: `computeSelectedTotal` from `@/lib/proposals`; types `Proposal` from `@/lib/types`.
- Produces: `acceptedProposalTotal(proposal: Pick<Proposal, 'packages'|'line_items'|'discount'|'tax_rate'|'selection'>): number`.

- [ ] **Step 1: Write failing tests** appended to `__tests__/lib/invoice-progress.test.ts`:

```ts
import { acceptedProposalTotal } from '@/lib/invoice-progress'

describe('acceptedProposalTotal', () => {
  it('prefers the locked selection.selected_total when present', () => {
    const p = { line_items: [{ description: 'x', quantity: 1, unit_price: 999 }],
      selection: { optional_item_ids: [], selected_total: 1234, selected_at: '' } }
    expect(acceptedProposalTotal(p)).toBe(1234)
  })

  it('falls back to computeSelectedTotal (required items − discount + tax) with no selection', () => {
    const p = {
      line_items: [
        { id: 'a', description: 'Base', quantity: 1, unit_price: 1000 },
        { id: 'b', description: 'Add-on', quantity: 1, unit_price: 500, optional: true }, // excluded (not selected)
      ],
      discount: { type: 'percent' as const, value: 10 },   // -100 on 1000
      tax_rate: 10,                                         // +90 on 900
    }
    // required base 1000, no addons; discount 100 -> 900; tax 10% -> 990
    expect(acceptedProposalTotal(p)).toBe(990)
  })

  it('a package proposal returns its locked selected_total', () => {
    const p = {
      packages: [{ id: 'good', name: 'Good', includes: [], price: 800 },
                 { id: 'best', name: 'Best', includes: [], price: 2000 }],
      line_items: [],
      selection: { package_id: 'best', optional_item_ids: [], selected_total: 2000, selected_at: '' },
    }
    expect(acceptedProposalTotal(p)).toBe(2000)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run __tests__/lib/invoice-progress.test.ts -t acceptedProposalTotal`
Expected: FAIL — `acceptedProposalTotal` not exported.

- [ ] **Step 3: Implement** in `lib/invoice-progress.ts`:

```ts
import { computeSelectedTotal } from '@/lib/proposals'
import type { Proposal } from '@/lib/types'

export function acceptedProposalTotal(
  proposal: Pick<Proposal, 'packages' | 'line_items' | 'discount' | 'tax_rate' | 'selection'>,
): number {
  return proposal.selection?.selected_total ?? computeSelectedTotal(proposal, { optional_item_ids: [] })
}
```
(`computeSelectedTotal`'s `Choice` type is `{ package_id?, optional_item_ids }`; passing `{ optional_item_ids: [] }` is valid — `package_id` is optional.)

- [ ] **Step 4: Run to verify green + typecheck**

Run: `npx vitest run __tests__/lib/invoice-progress.test.ts && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add lib/invoice-progress.ts __tests__/lib/invoice-progress.test.ts
git commit -m "feat(invoicing): acceptedProposalTotal helper (selection-aware approved scope)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Use accepted total in `generateFromProposal` + `issueInvoice`

**Files:**
- Modify: `actions/invoices.ts` (`generateFromProposal` seeding + scope; `issueInvoice` scope check)
- Test: `__tests__/actions/invoices.test.ts`

**Interfaces:**
- Consumes: `acceptedProposalTotal` (Task 1); `depositAmount` from `@/lib/proposals`; existing `remainingToBill`, `previouslyBilled`, `assertWithinScope`, `listInvoices`, `getProposal`.
- Produces: `generateFromProposal` seeds one summary line per type from the accepted total; both call sites use `acceptedProposalTotal`. No signature changes.

- [ ] **Step 1: Update/add tests** in `__tests__/actions/invoices.test.ts`. Update the two existing `generateFromProposal` builds-a-draft tests to the summary-line shape, and add deposit-terms + package-scope + issue-scope tests. Add imports at top-of-test as needed. Reuse the file's real spy names (`getProposalSpy`, the invoice-list spy, invoice-doc get/update/set spies, counter + tx spies).

```ts
it('generateFromProposal deposit seeds depositAmount from the accepted total', async () => {
  getProposalSpy.mockResolvedValue({
    id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted', line_items: [],
    deposit: { type: 'percent', value: 25 },
    selection: { optional_item_ids: [], selected_total: 2000, selected_at: '' },
    created_at: '',
  })
  listInvoicesSpy.mockResolvedValue({ docs: [] })
  const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'deposit' })
  expect(inv.line_items).toHaveLength(1)
  expect(inv.line_items[0]).toEqual(expect.objectContaining({ description: 'Deposit', unit_price: 500 })) // 25% of 2000
  expect(inv.line_items[0].source).toEqual({ type: 'proposal', id: 'p1' })
})

it('generateFromProposal final bills the remaining accepted total', async () => {
  getProposalSpy.mockResolvedValue({
    id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted', line_items: [],
    selection: { optional_item_ids: [], selected_total: 2000, selected_at: '' }, created_at: '',
  })
  // one prior issued invoice billed 500 against this source
  listInvoicesSpy.mockResolvedValue({ docs: [{ data: () => ({
    id: 'iA', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'issued',
    source: { type: 'proposal', id: 'p1' }, line_items: [{ description: 'Deposit', quantity: 1, unit_price: 500 }],
    payments: [], created_at: '',
  }) }] })
  const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'final' })
  expect(inv.line_items[0]).toEqual(expect.objectContaining({ description: 'Final balance', unit_price: 1500 }))
})

it('generateFromProposal scope guardrail uses the accepted total (package proposal)', async () => {
  getProposalSpy.mockResolvedValue({
    id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted', line_items: [],
    packages: [{ id: 'best', name: 'Best', includes: [], price: 1000 }],
    selection: { package_id: 'best', optional_item_ids: [], selected_total: 1000, selected_at: '' }, created_at: '',
  })
  // already billed 1000 (fully) against this source
  listInvoicesSpy.mockResolvedValue({ docs: [{ data: () => ({
    id: 'iA', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'issued',
    source: { type: 'proposal', id: 'p1' }, line_items: [{ description: 'x', quantity: 1, unit_price: 1000 }],
    payments: [], created_at: '',
  }) }] })
  // final would compute remaining 0 -> fine; a progress of any positive amount must exceed:
  // instead assert a 'final' seeds 0 remaining, and a manual over-bill is blocked at issue (next test).
  const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'final' })
  expect(inv.line_items[0]).toEqual(expect.objectContaining({ unit_price: 0 })) // nothing left to bill
})
```

Also update the OLD test at ~line 139 ('builds a draft with proposal-sourced lines') to expect a single summary line for `deposit` (a proposal with no deposit terms → `unit_price: 0`, `description: 'Deposit'`), keeping its source assertions. The customer_id test at ~line 498 stays valid (still deposit type; just assert customer_id, not line contents).

For the **issue-time** scope test, add (mirroring the existing issue tests' counter/tx mocks): an issued sibling billing the full accepted total exists, and issuing a *draft* whose own line exceeds the remainder throws `/exceeds approved scope/i` — with `getProposalSpy` returning the package proposal (accepted total 1000). This proves `issueInvoice` uses `acceptedProposalTotal`, not `invoiceTotal(line_items)`.

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run __tests__/actions/invoices.test.ts`
Expected: FAIL on the new/updated assertions.

- [ ] **Step 3: Implement** in `actions/invoices.ts`.

Add imports: `import { acceptedProposalTotal } from '@/lib/invoice-progress'` and `import { depositAmount } from '@/lib/proposals'`.

Rewrite `generateFromProposal`'s body after the accepted/status checks:

```ts
  const accepted = acceptedProposalTotal(proposal)
  const existing = await listInvoices(orgId, leadId)
  const billed = previouslyBilled(existing, proposalId)

  const source = { type: 'proposal' as const, id: proposalId, label: 'Accepted proposal' }
  const lineSource = { type: 'proposal' as const, id: proposalId }
  let line: InvoiceLineItem
  switch (opts.type) {
    case 'deposit':
      line = { description: 'Deposit', quantity: 1, unit_price: depositAmount(accepted, proposal.deposit), source: lineSource }
      break
    case 'final':
      line = { description: 'Final balance', quantity: 1, unit_price: remainingToBill(accepted, billed), source: lineSource }
      break
    case 'progress':
      line = { description: 'Progress payment', quantity: 1, unit_price: 0, source: lineSource }
      break
    default: // quick
      line = { description: 'Per accepted proposal', quantity: 1, unit_price: accepted, source: lineSource }
  }
  const line_items = [line]

  if (opts.type !== 'quick') {
    assertWithinScope(invoiceTotal(line_items), billed, accepted)
  }

  const invoice = await createInvoice(orgId, leadId, { type: opts.type, line_items })
  await invoicesRef(orgId).doc(invoice.id).update({ source })
  return { ...invoice, source }
```

In `issueInvoice`, find the scope-check block (the one computing `approved = invoiceTotal(proposal.line_items)` after loading the proposal) and change `approved` to `acceptedProposalTotal(proposal)`. Leave the rest of the transaction untouched.

- [ ] **Step 4: Run action tests + full suite + typecheck**

Run: `npx vitest run __tests__/actions/invoices.test.ts && npx vitest run && npx tsc --noEmit`
Expected: action tests PASS, full suite PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add actions/invoices.ts __tests__/actions/invoices.test.ts
git commit -m "fix(invoicing): bill from proposal accepted total (packages/optionals/discount/tax/deposit)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** `acceptedProposalTotal` (Task 1) ✓; generateFromProposal seeding + deposit terms + scope source (Task 2) ✓; issueInvoice scope source (Task 2) ✓; package/discount/tax end-to-end tests (Tasks 1–2) ✓.
- **Placeholder scan:** no TBD/TODO; concrete code throughout. The one prose step is "find the `approved =` line in issueInvoice" — unavoidable since the implementer must locate the existing block; the exact replacement is given.
- **Type consistency:** `acceptedProposalTotal` param is the `Priceable & {selection}` subset that `computeSelectedTotal`/`proposalDisplayRange` already use; `depositAmount(total, deposit?)` and `remainingToBill(approved, billed)` signatures match; every seeded line is a valid `InvoiceLineItem`.
- **Isolation:** reads `computeSelectedTotal`/`depositAmount` from `lib/proposals.ts`; does not modify proposals or CRM code.
