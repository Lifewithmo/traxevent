# Invoice Discount/Tax + Itemization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add invoice-level discount/tax/credits + a money breakdown, itemize proposal-generated quick/final invoices, and credit prior deposits on the final — keeping progress/scope/immutability/tips correct.

**Architecture:** Pure money helpers in `lib/invoices.ts` mirror the proposal's `computeSelectedTotal` formula; `invoiceAmountDue(invoice)` (subtotal − discount + tax − credits) becomes the single "amount owed" that balance/progress/scope/payment-status/public all use. A pure `proposalInvoiceLines` builds itemized lines; `generateFromProposal` consumes it. UI shows the breakdown.

**Tech Stack:** Next.js 16 server actions + server component, Firestore, Vitest + RTL, TypeScript strict.

## Global Constraints

- Green gate (every task): `npx tsc --noEmit` clean AND `npx vitest run` passing.
- Mirror the proposal formula EXACTLY (tax the whole discounted subtotal; per-line `taxable` stored-not-honored) so an itemized invoice total == proposal accepted total.
- Do NOT modify proposals/CRM code — import `computeSelectedTotal`/`discountAmount` read-only if useful, or replicate the 3-line discount helper in invoice-land.
- Amounts are dollars, `round2` to cents.
- One commit per task; messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## File Structure
- `lib/types.ts` — `InvoiceDiscount`, `InvoiceCredit`; extend `InvoiceLineItem`, `Invoice`.
- `lib/invoices.ts` — breakdown helpers + `invoiceAmountDue`; rename sum → `linesSubtotal`.
- `lib/invoice-lock.ts` — add discount/tax_rate/credits to `FINANCIAL_FIELDS`.
- `lib/invoice-progress.ts` — `proposalInvoiceLines`; `previouslyBilled` net-total.
- `actions/invoices.ts` — `generateFromProposal`, `recordPayment` net.
- `actions/invoices-public.ts` — breakdown in `PublicInvoice`.
- `components/admin/InvoiceEditorClient.tsx`, `components/invoices/InvoiceViewClient.tsx` — breakdown UI.
- Tests mirror each.

---

## Task 1: Money value types, fields, and breakdown helpers (additive)

**Files:** Modify `lib/types.ts`, `lib/invoices.ts`; Test `__tests__/lib/invoices.test.ts`.

**Interfaces:**
- Produces: `InvoiceDiscount`, `InvoiceCredit`; `InvoiceLineItem.taxable?`; `Invoice.{discount?,tax_rate?,credits?}`; helpers `linesSubtotal`, `invoiceDiscountAmount`, `invoiceTaxAmount`, `creditsTotal`, `invoiceGross`, `invoiceAmountDue`.
- NOTE: keep the existing `invoiceTotal(lineItems)` untouched THIS task (consumers still compile); it is renamed/removed in Task 2.

- [ ] **Step 1: Add types** to `lib/types.ts`:
```ts
export interface InvoiceDiscount { type: 'percent' | 'fixed'; value: number }
export interface InvoiceCredit { description: string; amount: number }
```
Add `taxable?: boolean` to `InvoiceLineItem`. Add to `Invoice`: `discount?: InvoiceDiscount`, `tax_rate?: number`, `credits?: InvoiceCredit[]`.

- [ ] **Step 2: Write failing tests** appended to `__tests__/lib/invoices.test.ts`:
```ts
import { linesSubtotal, invoiceDiscountAmount, invoiceTaxAmount, creditsTotal, invoiceGross, invoiceAmountDue } from '@/lib/invoices'

describe('invoice breakdown', () => {
  const inv = (o: Partial<Invoice>): Invoice => ({
    id: 'i', org_id: 'o', lead_id: 'l', token: 't', type: 'quick', lifecycle: 'draft',
    delivery: 'not_sent', accounting: 'not_connected', dispute: 'none',
    line_items: [], payments: [], created_at: '', ...o,
  })
  it('linesSubtotal sums line subtotals', () => {
    expect(linesSubtotal([li(2, 50), li(1, 45.99)])).toBe(145.99)
  })
  it('discount percent and fixed, capped at subtotal', () => {
    expect(invoiceDiscountAmount(1000, { type: 'percent', value: 10 })).toBe(100)
    expect(invoiceDiscountAmount(1000, { type: 'fixed', value: 1500 })).toBe(1000)
    expect(invoiceDiscountAmount(1000, undefined)).toBe(0)
  })
  it('tax on the discounted base', () => {
    expect(invoiceTaxAmount(900, 10)).toBe(90)
    expect(invoiceTaxAmount(900, undefined)).toBe(0)
  })
  it('creditsTotal sums positive credits', () => {
    expect(creditsTotal([{ description: 'a', amount: 200 }, { description: 'b', amount: 0 }])).toBe(200)
  })
  it('invoiceGross = subtotal - discount + tax; invoiceAmountDue subtracts credits', () => {
    const v = inv({ line_items: [li(1, 1000)], discount: { type: 'percent', value: 10 }, tax_rate: 10,
      credits: [{ description: 'deposit', amount: 300 }] })
    expect(invoiceGross(v)).toBe(990)      // 1000 -100 +90
    expect(invoiceAmountDue(v)).toBe(690)  // 990 - 300
  })
})
```

- [ ] **Step 3: Run to verify fail** — `npx vitest run __tests__/lib/invoices.test.ts -t breakdown` → FAIL (not exported).

- [ ] **Step 4: Implement** in `lib/invoices.ts` (keep `round2`, `lineItemSubtotal`, `amountPaid`, `tipsTotal`, and — for now — `invoiceTotal`):
```ts
import type { Invoice, InvoiceLineItem, InvoiceDiscount, InvoiceCredit } from '@/lib/types'

export function linesSubtotal(lineItems: InvoiceLineItem[]): number {
  return round2(lineItems.reduce((s, i) => s + lineItemSubtotal(i), 0))
}
export function invoiceDiscountAmount(subtotal: number, discount?: InvoiceDiscount): number {
  if (!discount || !(discount.value > 0)) return 0
  const raw = discount.type === 'percent' ? (subtotal * discount.value) / 100 : discount.value
  return round2(Math.min(raw, subtotal))
}
export function invoiceTaxAmount(taxableBase: number, taxRate?: number): number {
  if (!(taxRate && taxRate > 0)) return 0
  return round2((taxableBase * taxRate) / 100)
}
export function creditsTotal(credits?: InvoiceCredit[]): number {
  return round2((credits ?? []).reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0))
}
type Breakdownable = Pick<Invoice, 'line_items' | 'discount' | 'tax_rate' | 'credits'>
export function invoiceGross(invoice: Breakdownable): number {
  const sub = linesSubtotal(invoice.line_items)
  const disc = invoiceDiscountAmount(sub, invoice.discount)
  return round2(sub - disc + invoiceTaxAmount(round2(sub - disc), invoice.tax_rate))
}
export function invoiceAmountDue(invoice: Breakdownable): number {
  return round2(invoiceGross(invoice) - creditsTotal(invoice.credits))
}
```

- [ ] **Step 5: Green + typecheck** — `npx vitest run __tests__/lib/invoices.test.ts && npx tsc --noEmit` → PASS + clean.

- [ ] **Step 6: Commit** — `feat(invoicing): invoice discount/tax/credits types + breakdown helpers`.

---

## Task 2: Cut money consumers over to `invoiceAmountDue`; rename sum → `linesSubtotal`

**Files:** Modify `lib/invoices.ts`, `lib/invoice-progress.ts`, `actions/invoices.ts`, `components/admin/InvoiceEditorClient.tsx`; Tests: `__tests__/lib/invoices.test.ts`, `__tests__/actions/invoices.test.ts`, `__tests__/lib/invoice-progress.test.ts`.

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `invoiceBalance` net-of-discount/tax/credits; `previouslyBilled` uses `invoiceAmountDue` (input type gains `discount`/`tax_rate`/`credits`); `recordPayment` & `generateFromProposal` scope use `invoiceAmountDue`; old `invoiceTotal(lineItems)` removed (callers use `linesSubtotal` or `invoiceAmountDue`).

- [ ] **Step 1: Update tests first.** In `__tests__/lib/invoices.test.ts`, change any remaining `invoiceTotal(...)` line-sum expectations to `linesSubtotal(...)`. Add a balance test:
```ts
it('invoiceBalance uses amount due (net of discount/tax/credits)', () => {
  const v = { line_items: [li(1, 1000)], discount: { type: 'percent' as const, value: 10 }, tax_rate: 10,
    credits: [{ description: 'd', amount: 300 }], payments: [pay(90)] } as Invoice
  expect(invoiceBalance(v)).toBe(600) // due 690 - paid 90
})
```
In `__tests__/lib/invoice-progress.test.ts`, extend `previouslyBilled` cases with an invoice carrying discount/tax so its billed amount reflects `invoiceAmountDue` (e.g. a $1000 line, 10% discount → billed 900). In `__tests__/actions/invoices.test.ts`, the recordPayment `payment_status` tests should still hold (simple invoices: amountDue == linesSubtotal).

- [ ] **Step 2: Run to verify fail** (renamed export / new balance semantics).

- [ ] **Step 3: Implement.**
  - `lib/invoices.ts`: delete `invoiceTotal`; change `invoiceBalance(invoice)` to `round2(invoiceAmountDue(invoice) - amountPaid(invoice.payments))`. (`invoiceBalance`'s param type must include discount/tax/credits — use `Pick<Invoice,'line_items'|'payments'|'discount'|'tax_rate'|'credits'>`.)
  - `lib/invoice-progress.ts`: `previouslyBilled` — change the structural input element type to include `discount?`, `tax_rate?`, `credits?` and sum `invoiceAmountDue(i)` instead of `invoiceTotal(i.line_items)`. Import `invoiceAmountDue` from `@/lib/invoices`.
  - `actions/invoices.ts`: `recordPayment` — `const total = invoiceAmountDue(inv)`; `generateFromProposal` — the scope guardrail becomes `assertWithinScope(invoiceAmountDue({ line_items, discount, tax_rate, credits }), billed, accepted)` (build the draft-shaped object from what it will create — for now line_items only; discount/tax/credits added in Task 5, so pass the object with those fields once they exist — THIS task keep it `invoiceAmountDue({ line_items })`). Replace any `invoiceTotal(` imports/uses accordingly.
  - `components/admin/InvoiceEditorClient.tsx`: replace `invoiceTotal(lineItems)` with `linesSubtotal(lineItems)` for the running line total (full breakdown UI comes in Task 6).

- [ ] **Step 4: Green** — `npx vitest run && npx tsc --noEmit` → all PASS + clean.

- [ ] **Step 5: Commit** — `refactor(invoicing): route balance/progress/payment on invoiceAmountDue (net of discount/tax/credits)`.

---

## Task 3: Lock discount/tax/credits after issue

**Files:** Modify `lib/invoice-lock.ts`; Test `__tests__/lib/invoice-lock.test.ts`.

- [ ] **Step 1: Failing test** — add to `__tests__/lib/invoice-lock.test.ts`:
```ts
it('locks discount, tax_rate, and credits on issued invoices', () => {
  for (const k of ['discount', 'tax_rate', 'credits']) {
    expect(() => assertEditable('issued', [k])).toThrow(/locked/i)
  }
})
```
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — extend `FINANCIAL_FIELDS` to `['line_items','type','source','due_date','number','discount','tax_rate','credits']`.
- [ ] **Step 4: Green** — `npx vitest run __tests__/lib/invoice-lock.test.ts && npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(invoicing): lock discount/tax/credits after issue`.

---

## Task 4: `proposalInvoiceLines` itemization helper (pure)

**Files:** Modify `lib/invoice-progress.ts`; Test `__tests__/lib/invoice-progress.test.ts`.

**Interfaces:**
- Consumes: `Proposal`, `ProposalLineItem`, `InvoiceLineItem` types.
- Produces: `proposalInvoiceLines(proposal: Pick<Proposal,'id'|'packages'|'line_items'|'selection'>): InvoiceLineItem[]`.

- [ ] **Step 1: Failing tests**:
```ts
import { proposalInvoiceLines } from '@/lib/invoice-progress'

describe('proposalInvoiceLines', () => {
  it('package proposal → package line + selected optionals', () => {
    const p = { id: 'p1',
      packages: [{ id: 'best', name: 'Best', includes: [], price: 2000 }],
      line_items: [{ id: 'o1', description: 'Drone', quantity: 1, unit_price: 300, optional: true },
                   { id: 'o2', description: 'Album', quantity: 1, unit_price: 200, optional: true }],
      selection: { package_id: 'best', optional_item_ids: ['o1'], selected_total: 2300, selected_at: '' } }
    const lines = proposalInvoiceLines(p)
    expect(lines).toEqual([
      { description: 'Best', quantity: 1, unit_price: 2000, source: { type: 'proposal', id: 'p1' } },
      { description: 'Drone', quantity: 1, unit_price: 300, source: { type: 'proposal', id: 'p1' } },
    ])
  })
  it('itemized proposal → required items + selected optionals', () => {
    const p = { id: 'p1', line_items: [
      { id: 'r1', description: 'Base', quantity: 1, unit_price: 1000 },
      { id: 'o1', description: 'Add-on', quantity: 1, unit_price: 500, optional: true }],
      selection: { optional_item_ids: [], selected_total: 1000, selected_at: '' } }
    const lines = proposalInvoiceLines(p)
    expect(lines).toEqual([{ description: 'Base', quantity: 1, unit_price: 1000, source: { type: 'proposal', id: 'p1' } }])
  })
})
```
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement**:
```ts
import type { Proposal, InvoiceLineItem } from '@/lib/types'
export function proposalInvoiceLines(
  proposal: Pick<Proposal, 'id' | 'packages' | 'line_items' | 'selection'>,
): InvoiceLineItem[] {
  const src = { type: 'proposal' as const, id: proposal.id }
  const sel = proposal.selection
  const items = proposal.line_items ?? []
  const lines: InvoiceLineItem[] = []
  const pkgs = proposal.packages ?? []
  if (pkgs.length > 0 && sel?.package_id) {
    const pkg = pkgs.find((p) => p.id === sel.package_id)
    if (pkg) lines.push({ description: pkg.name, quantity: 1, unit_price: pkg.price, source: src })
  } else {
    for (const i of items.filter((i) => i.optional !== true)) {
      lines.push({ description: i.description, quantity: i.quantity, unit_price: i.unit_price, source: src })
    }
  }
  const chosen = new Set(sel?.optional_item_ids ?? [])
  for (const i of items.filter((i) => i.optional === true && i.id !== undefined && chosen.has(i.id))) {
    lines.push({ description: i.description, quantity: i.quantity, unit_price: i.unit_price, source: src })
  }
  return lines
}
```
- [ ] **Step 4: Green** — `npx vitest run __tests__/lib/invoice-progress.test.ts && npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(invoicing): proposalInvoiceLines itemization helper`.

---

## Task 5: `generateFromProposal` — itemize quick/final, copy discount/tax, credit the final

**Files:** Modify `actions/invoices.ts`; Test `__tests__/actions/invoices.test.ts`.

**Interfaces:**
- Consumes: `proposalInvoiceLines`, `acceptedProposalTotal`, `previouslyBilled`, `assertWithinScope`, `invoiceAmountDue`, `depositAmount`.
- Produces: quick/final itemized with `discount`/`tax_rate`; final gains a `credits` line.

- [ ] **Step 1: Update/add tests.** Update the existing quick/deposit/final generate tests. Add:
```ts
it('generateFromProposal quick itemizes and copies discount/tax (total = accepted)', async () => {
  getProposalSpy.mockResolvedValue({ id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted',
    line_items: [{ id: 'r1', description: 'Base', quantity: 1, unit_price: 1000 }],
    discount: { type: 'percent', value: 10 }, tax_rate: 10,
    selection: { optional_item_ids: [], selected_total: 990, selected_at: '' }, created_at: '' })
  listInvoicesSpy.mockResolvedValue({ docs: [] })
  const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'quick' })
  expect(inv.line_items).toEqual([expect.objectContaining({ description: 'Base', unit_price: 1000 })])
  expect(inv.discount).toEqual({ type: 'percent', value: 10 })
  expect(inv.tax_rate).toBe(10)
  expect(invoiceAmountDue(inv)).toBe(990)
})

it('generateFromProposal final itemizes full scope and credits previously billed', async () => {
  getProposalSpy.mockResolvedValue({ id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted',
    line_items: [{ id: 'r1', description: 'Base', quantity: 1, unit_price: 1000 }],
    selection: { optional_item_ids: [], selected_total: 1000, selected_at: '' }, created_at: '' })
  listInvoicesSpy.mockResolvedValue({ docs: [{ data: () => ({ id: 'iA', org_id: 'org-1', lead_id: 'lead-1',
    token: 't', lifecycle: 'issued', source: { type: 'proposal', id: 'p1' },
    line_items: [{ description: 'Deposit', quantity: 1, unit_price: 400 }], payments: [], created_at: '' }) }] })
  const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'final' })
  expect(inv.line_items).toEqual([expect.objectContaining({ description: 'Base', unit_price: 1000 })])
  expect(inv.credits).toEqual([{ description: 'Less: previously billed', amount: 400 }])
  expect(invoiceAmountDue(inv)).toBe(600) // 1000 - 400
})
```
Keep deposit/progress tests (single summary line; unchanged).

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — in `generateFromProposal`, after computing `accepted`/`billed`:
```ts
  const itemLines = proposalInvoiceLines(proposal).map((l) => ({ ...l, source: lineSource }))
  let line_items: InvoiceLineItem[]
  let discount = undefined as InvoiceDiscount | undefined
  let tax_rate = undefined as number | undefined
  let credits = undefined as InvoiceCredit[] | undefined
  switch (opts.type) {
    case 'quick':
      line_items = itemLines; discount = proposal.discount; tax_rate = proposal.tax_rate; break
    case 'final':
      line_items = itemLines; discount = proposal.discount; tax_rate = proposal.tax_rate
      if (billed > 0) credits = [{ description: 'Less: previously billed', amount: billed }]; break
    case 'deposit':
      line_items = [{ description: 'Deposit', quantity: 1, unit_price: depositAmount(accepted, proposal.deposit), source: lineSource }]; break
    default: // progress
      line_items = [{ description: 'Progress payment', quantity: 1, unit_price: 0, source: lineSource }]
  }
  if (opts.type !== 'quick') {
    assertWithinScope(invoiceAmountDue({ line_items, discount, tax_rate, credits }), billed, accepted)
  }
  const invoice = await createInvoice(orgId, leadId, { type: opts.type, line_items })
  await invoicesRef(orgId).doc(invoice.id).update({ source,
    ...(discount ? { discount } : {}), ...(tax_rate ? { tax_rate } : {}), ...(credits ? { credits } : {}) })
  return { ...invoice, source, ...(discount ? { discount } : {}), ...(tax_rate ? { tax_rate } : {}), ...(credits ? { credits } : {}) }
```
(Import `InvoiceDiscount`, `InvoiceCredit` types and `invoiceAmountDue`. `createInvoice` can also be extended to accept `discount`/`tax_rate` in `CreateInvoiceInput` if cleaner — either works; the update-after-create pattern matches the existing `source` handling.)

- [ ] **Step 4: Green** — `npx vitest run && npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(invoicing): itemize quick/final from proposal; credit prior billings on final`.

---

## Task 6: Public projection breakdown

**Files:** Modify `actions/invoices-public.ts`, `components/invoices/InvoiceViewClient.tsx`; Test `__tests__/actions/invoices-public.test.ts`.

**Interfaces:**
- Produces: `PublicInvoice` gains `subtotal`, `discount_amount`, `tax_amount`, `credits: InvoiceCredit[]`, `total` (= amount due).

- [ ] **Step 1: Failing test** — extend `invoices-public.test.ts`: an issued invoice with a $1000 line, 10% discount, 10% tax, $300 credit exposes `subtotal: 1000, discount_amount: 100, tax_amount: 90, total: 690, balance: 690`, and `credits` list length 1.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — add the fields to `PublicInvoice` and compute in `getPublicInvoice` via `linesSubtotal`, `invoiceDiscountAmount`, `invoiceTaxAmount`, `creditsTotal`, `invoiceAmountDue`, `invoiceBalance`. In `InvoiceViewClient`, render the breakdown rows (Subtotal / Discount / Tax / each credit / Total / Amount paid / Balance).
- [ ] **Step 4: Green** — `npx vitest run && npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(invoicing): public invoice breakdown (subtotal/discount/tax/credits/total)`.

---

## Task 7: Editor breakdown + discount/tax/taxable inputs

**Files:** Modify `components/admin/InvoiceEditorClient.tsx`, `actions/invoices.ts` (`InvoiceUpdate` accepts `discount`/`tax_rate`); Test `__tests__/components/InvoiceEditorClient.test.tsx`.

**Interfaces:**
- `InvoiceUpdate` gains `discount?: InvoiceDiscount`, `tax_rate?: number` (both already lockable via Task 3).

- [ ] **Step 1: Failing component tests** — (a) breakdown panel shows Subtotal/Discount/Tax/Total for an invoice with discount+tax; (b) discount/tax/taxable inputs are read-only/absent when `lifecycle: 'issued'`. Mirror the existing test's `inv(...)` helper (extend for `discount`/`tax_rate`/`credits`).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — add discount (type select + value) and tax-rate inputs (disabled when `locked`), a per-line "Taxable" checkbox (default checked; disabled when `locked`), and a breakdown panel computing Subtotal (`linesSubtotal`), Discount (`invoiceDiscountAmount`), Tax (`invoiceTaxAmount`), each credit (display-only), Total (`invoiceAmountDue`), Amount paid, Balance. Pass `discount`/`tax_rate` through `handleSave`→`updateInvoice`. Extend `InvoiceUpdate` in `actions/invoices.ts`.
- [ ] **Step 4: Green** — `npx vitest run && npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(invoicing): editor discount/tax/taxable inputs + money breakdown`.

---

## Self-Review

- **Spec coverage:** value types+fields+helpers (T1); net-total cutover of balance/progress/payment/scope (T2); lock (T3); itemization helper (T4); generateFromProposal quick/final/credits (T5); public breakdown (T6); editor breakdown+inputs (T7). ✓
- **Placeholder scan:** concrete code for all pure/money tasks; UI tasks give the exact inputs/rows to add and the helpers to compute them. No TBD.
- **Type consistency:** `invoiceAmountDue`/`invoiceGross`/`invoiceBalance` all take the `Breakdownable`/Invoice shape; `previouslyBilled` input widened to include discount/tax/credits (T2) before T5 relies on it; `proposalInvoiceLines` (T4) returns `InvoiceLineItem[]` consumed by T5; `InvoiceDiscount`/`InvoiceCredit` used consistently.
- **Consistency invariant:** an itemized quick invoice's `invoiceAmountDue` == proposal `computeSelectedTotal` (same formula), so progress/scope stay correct; the final's credit = `previouslyBilled`, so cumulative net billed == accepted total (no double count).
- **Isolation:** imports proposals helpers read-only; no proposals/CRM edits.
