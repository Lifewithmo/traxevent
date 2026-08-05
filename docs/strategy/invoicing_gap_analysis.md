# Invoicing System — Gap Analysis (Have vs. MVP-Need)

**Date:** 2026-08-04
**Base:** `main` @ 193923c (isolated worktree `claude/traxevent-invoicing-system-4c451a`)
**Spec source:** [`invoicing_system_deep_analysis.md`](./invoicing_system_deep_analysis.md) — the "MVP" list (§ "What should be in the first version").

## 1. What exists today

### Data model (`lib/types.ts:413-442`)
- **One** `InvoiceStatus`: `draft | sent | partial | paid | void`.
- `Invoice`: `id, org_id, lead_id, token, number?, title?, status, line_items[], payments[], notes?, due_date?, created_at, updated_at?`.
- `InvoiceLineItem`: `description, quantity, unit_price` — nothing else.
- `InvoicePayment`: `amount, method?, note?, recorded_at` — manual entry only.

### Actions (`actions/invoices.ts`, `actions/invoices-public.ts`, `lib/invoices.ts`)
- CRUD + `sendInvoice` (flips to `sent`) + `recordPayment` (manual, recomputes paid/partial/paid) + `deleteInvoice` (hard delete, any status).
- `updateInvoice` can mutate `line_items` at **any** status (no lock).
- Public token lookup → `PublicInvoice` projection; drafts hidden. Solid baseline.
- Totals helpers: `invoiceTotal / amountPaid / invoiceBalance` (no tax, no discount).

### Payments / Stripe (`lib/stripe.ts`, `app/api/payments/**`)
- Stripe Connect client (1% application fee), lazy proxy.
- **`/api/payments/intent` and `/webhook` are event-registration only** (keyed by `familyId`, write to `families`). **No invoice payment path exists at all.**

### UI
- `InvoiceEditorClient` (lead-scoped editor), `AllInvoicesTable`, `LeadInvoicesClient`, public `InvoiceViewClient`. Functional, basic.

### Indexes / accounting
- Only index: `invoices [lead_id, created_at]`.
- **Zero QBO / accounting code anywhere.**

### Proposal → invoice seam (`actions/proposals-public.ts:46`)
- `respondToProposal('accepted')` advances the lead to `booked`. **It does not create an invoice, and no invoice carries a proposal link.**

## 2. Gap vs. MVP

| MVP need | Status | Gap |
|---|---|---|
| Source-driven invoices (line retains its source) | ❌ | No `source_type` / `source_id` on invoice or line; invoices built from raw manual input. |
| Split status (lifecycle / delivery / payment / aging / accounting / dispute) | ❌ | One conflated `status`. |
| Invoice types (quick / deposit / progress / final / recurring) | ❌ | No `type`; no deposit/final/progress relationships. |
| Issued invoices financially **locked**; correct via void/replace or credit memo | ⚠️ | `void` value exists but nothing enforces immutability; `updateInvoice`/`deleteInvoice` edit issued invoices freely. No credit-memo object. |
| Distinct objects: invoice / payment / receipt / statement / credit memo / deposit | ⚠️ | Only invoice + embedded payments. No receipt/statement/credit-memo/deposit objects. |
| Taxes & discounts | ❌ | Line has no tax/discount; no invoice-level tax. |
| Prior payments & credits display | ⚠️ | Payments shown; no credits concept. |
| Issue date / due date / terms | ⚠️ | `due_date` only; no issue date, no payment terms. |
| Branded web invoice + reliable PDF | ⚠️ | Web view exists; no PDF. |
| Email delivery + payment link | ⚠️ | Share link only; no email send, no delivery tracking. |
| Card + ACH via Stripe, partial payments | ❌ | No invoice→Stripe path. Manual partials only. |
| Manual external-payment entry + receipt | ⚠️ | Manual entry ✅; no receipt object. |
| Automatic reminders | ❌ | None. |
| Invoice list + smart views | ⚠️ | Flat table; no smart views / "Ready to Invoice". |
| Customer balance + aging report | ❌ | None (and no Customer entity — CRM seam). |
| Activity / audit history | ❌ | None. |
| Invoice numbering (sequential, no reuse) | ❌ | Free-text optional `number`. |
| QuickBooks Online sync | ❌ | None. |
| Void & credit workflow | ❌ | None. |
| Duplicate-billing checks | ❌ | None. |

## 3. CRM seam flags
- Invoices key off `lead_id` today — **keep it**, treat as the opportunity id (CRM keeps that name this increment).
- **Needs CRM `Customer`:** customer balance, statements, consolidated billing, saved payment methods. Model invoice→`lead_id` (opportunity) now; leave a `customer_id?` seam for when CRM ships Customer. Flag for sequencing.
- Model the "invoice generated from an accepted proposal" link now (`source`).

## 4. Shared-file edits to keep surgical
- `lib/types.ts` — invoice types only.
- `firestore.indexes.json` — invoice indexes only.
- Expect a small merge conflict on landing; do not touch CRM-owned files.
