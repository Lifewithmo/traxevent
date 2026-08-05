# Invoice-Level Discount/Tax + Itemization (with deposit credits) — Design

**Date:** 2026-08-05
**Branch:** `claude/traxevent-invoicing-system-4c451a` (level with main @ d122e54).
**Chosen option:** #2 — the final invoice itemizes the full scope with discount/tax, then credits prior deposits/progress as a credit line. Option #3 (per-portion taxation) is recorded as a future enhancement in [invoice-enhancements.md](../../strategy/invoice-enhancements.md).

## Purpose

Give invoices a real money breakdown — subtotal, discount, tax, credits, total — and itemize proposal-generated invoices, while keeping every existing invariant (progress scope, immutability, tip exclusion) correct.

## Money model

Mirror the proposal's formula exactly so an itemized invoice's total equals the proposal's accepted total.

### New value types (`lib/types.ts`)
```ts
export interface InvoiceDiscount { type: 'percent' | 'fixed'; value: number }
export interface InvoiceCredit { description: string; amount: number } // applied AFTER tax (prior deposits/progress)
```
- `InvoiceLineItem` gains `taxable?: boolean` (default true; stored, not yet honored — matches the proposal).
- `Invoice` gains `discount?: InvoiceDiscount`, `tax_rate?: number` (percent), `credits?: InvoiceCredit[]`.

### Helpers (`lib/invoices.ts`, pure)
- `linesSubtotal(lineItems)` — sum of line subtotals (the old `invoiceTotal` logic, renamed).
- `invoiceDiscountAmount(subtotal, discount?)` — `min(percent|fixed, subtotal)`.
- `invoiceTaxAmount(taxableBase, tax_rate?)` — `round2(taxableBase * rate/100)`.
- `creditsTotal(credits?)` — sum of positive amounts.
- `invoiceGross(invoice)` — `subtotal − discount + tax`.
- `invoiceAmountDue(invoice)` — **net owed** = `invoiceGross − creditsTotal`. This is THE total; every consumer of "amount owed" uses it.
- Formula (identical to `computeSelectedTotal`): `subtotal → discountA=discount(subtotal) → taxable=subtotal−discountA → taxA=taxable*rate → gross=subtotal−discountA+taxA → net=gross−credits`.
- `invoiceBalance(invoice)` = `invoiceAmountDue(invoice) − amountPaid(payments)` (tips still excluded).

### Cutover (the ripple)
Every current `invoiceTotal(x.line_items)` becomes `invoiceAmountDue(x)`; the raw line sum is `linesSubtotal`. Consumers to migrate: `invoiceBalance`, `recordPayment` (payment_status base), `generateFromProposal` scope check, `previouslyBilled` (its structural input gains `discount`/`tax_rate`/`credits`), the editor, the public projection. This keeps balance/progress/scope/payment-status consistent — all on the net total.

### Immutability
`discount`, `tax_rate`, `credits` join `FINANCIAL_FIELDS` in `lib/invoice-lock.ts` (locked after issue).

## Itemization

### Pure helper `proposalInvoiceLines(proposal)` (`lib/invoice-progress.ts`)
Builds the invoice line items from an accepted proposal + its selection:
- **Package proposal:** one line for the selected package (`{description: pkg.name, quantity: 1, unit_price: pkg.price}`).
- **Itemized proposal:** the required line items (`optional !== true`).
- Plus one line per **selected** optional (`selection.optional_item_ids`).
- Every line carries `source: { type:'proposal', id }`; `linesSubtotal` of the result = `computeSelectedTotal`'s base+addons (so with the proposal's discount/tax copied, `invoiceAmountDue` = accepted total).

### `generateFromProposal`
- **quick** → `line_items = proposalInvoiceLines(proposal)`, `discount = proposal.discount`, `tax_rate = proposal.tax_rate`. Net = accepted total.
- **final** → same itemized lines + discount/tax, PLUS `credits = [{ description: 'Less: previously billed', amount: previouslyBilled }]` when `previouslyBilled > 0`. Net = accepted − previously billed (= the same remaining as today, richer presentation). Scope guardrail uses `invoiceAmountDue` of the draft-shaped object.
- **deposit** → single line at `depositAmount(accepted, proposal.deposit)` (unchanged — a portion of the taxed total).
- **progress** → single $0 line (unchanged).

## UI

- **Editor** (`InvoiceEditorClient`): inputs for invoice discount (type+value) and tax rate; a per-line "Taxable" toggle; a breakdown panel (Subtotal / Discount / Tax / Credits / **Total** / Amount paid / Balance). All discount/tax/line inputs become read-only once `locked` (issued+). Credits are display-only (system-set on final). Pass `discount`/`tax_rate` through `updateInvoice`.
- **Public view** (`InvoiceViewClient`): show the same breakdown (Subtotal / Discount / Tax / Credits / Total / Balance). `PublicInvoice` gains `subtotal`, `discount_amount`, `tax_amount`, `credits` (list), `total`.

## Testing (green gate: `tsc --noEmit` + `vitest run`)
Breakdown helpers (discount percent/fixed cap, tax on discounted base, credits, net); `invoiceAmountDue` == `computeSelectedTotal` for an itemized set with discount+tax; balance/progress/payment-status on net; lock rejects discount/tax/credits edits when issued; `proposalInvoiceLines` for package + itemized + selected optionals; `generateFromProposal` quick itemizes + copies discount/tax (total = accepted); final itemizes + credit line (net = remaining); deposit/progress unchanged; public breakdown; editor breakdown + read-only-when-issued.

## Out of scope (→ [invoice-enhancements.md](../../strategy/invoice-enhancements.md))
Per-portion taxation for deposit/progress (option #3); honoring per-line `taxable` in the tax base; multi-jurisdiction tax engine; standalone credit-memo objects.
