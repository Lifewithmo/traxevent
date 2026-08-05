# Invoicing Slice 1 — Source-Driven Foundation + Progress Engine

**Date:** 2026-08-04
**Branch/worktree:** `claude/traxevent-invoicing-system-4c451a` (isolated, base `main` @ 193923c)
**Spec source:** [`invoicing_system_deep_analysis.md`](../../strategy/invoicing_system_deep_analysis.md)
**Gap analysis:** [`invoicing_gap_analysis.md`](../../strategy/invoicing_gap_analysis.md)

## Purpose

Establish the financial-record foundation for the invoicing system: a source-driven,
split-status invoice with real progress-billing guardrails and issued-invoice
immutability. This is the highest-leverage slice and the CRM seam. It deliberately
contains **no money movement and no external systems**.

## Scope

### In scope
- Invoice **types**: `quick | deposit | progress | final`.
- **Split-status** data model (stored stateful fields + derived read-time states).
- **Per-line and per-invoice source retention** (`proposal` and `manual` wired end-to-end; other source types reserved).
- **Generate-from-accepted-proposal**: the accepted proposal is a locked billing source; the builder generates a draft from it.
- **Progress-billing engine**: cumulative billed ≤ approved scope; deposit → final netting.
- **Issued-invoice immutability**: financial fields locked once issued; corrections via void / replace.
- **Sequential invoice numbering** assigned transactionally at issue.
- **Versioned/lazy migration** via a pure `normalizeInvoice` shim (no batch job, issued invoices never rewritten).
- **Tips**: optional payment-level `tip_amount`, excluded from balance/progress math; per-invoice enable with org default; manual tip entry.
- Updated **lead-scoped editor** and **public view** to the new model.
- Unit tests on the pure core (green gate).

### Out of scope (later slices)
- Stripe invoice payment path (card/ACH, hosted page, customer-entered tips).
- QuickBooks Online sync (incl. tip liability-vs-revenue mapping).
- PDF generation, email/delivery send + delivery tracking, reminders.
- Smart-view list UI, customer balance & aging **UI**, statements.
- Taxes / discounts, change orders, recurring, credit-memo / receipt / statement / deposit-liability objects.
- Recurring invoice type.

## First-principles decisions

1. **Derive what's derivable; store only genuinely stateful facts.** Aging and payment
   status are pure functions of facts already on the invoice, so they are computed on
   read, never stored as authoritative status. Lifecycle, delivery, accounting, and
   dispute are event-driven and stored.
2. **Never rewrite an issued invoice.** Immutability is the point of a financial record.
   Migration is versioned and lazy; a pure shim normalizes legacy docs in memory.
3. **Progress math is scope-money only.** Tips and (future) non-scope amounts never
   count toward billed-vs-approved.
4. **Proposal acceptance produces a source, not an invoice.** Auto-creation is a later
   automation; generation stays explicit and testable, and the client-facing accept
   path stays uncoupled from billing.
5. **Numbering is assigned at issue, transactionally.** Drafts may be discarded; the
   issued sequence must have no gaps and no duplicates under concurrency (~30k/mo).
   Voided numbers are never reused.
6. **Deposit is a billing against scope** (reduces remaining); the final invoice bills
   the remainder. Deposit-as-held-liability (applied as a credit line) is deferred with
   the credit object.

## Data model (`lib/types.ts` — invoice fields only)

### Enums / value types
```ts
export type InvoiceType = 'quick' | 'deposit' | 'progress' | 'final'

export type InvoiceLifecycle =
  | 'draft' | 'approved' | 'issued' | 'voided' | 'replaced' | 'closed'

export type InvoiceDeliveryStatus =
  | 'not_sent' | 'queued' | 'sent' | 'delivered' | 'bounced' | 'viewed' | 'downloaded'

export type InvoiceAccountingStatus =
  | 'not_connected' | 'ready' | 'syncing' | 'synced' | 'error' | 'mismatch'

export type InvoiceDisputeStatus =
  | 'none' | 'question' | 'under_review' | 'adjustment_proposed' | 'resolved' | 'escalated'

// Derived on read — NOT stored as an authoritative field.
export type InvoicePaymentStatus =
  | 'not_due' | 'due' | 'partial' | 'paid' | 'overpaid' | 'refunded' | 'void'

export type InvoiceAgingBucket =
  | 'current' | 'due_soon' | 'due_today' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus'

export type InvoiceSourceType =
  | 'proposal' | 'change_order' | 'job' | 'milestone'
  | 'time' | 'expense' | 'recurring' | 'manual'

export interface InvoiceSourceRef {
  type: InvoiceSourceType
  id?: string      // e.g. accepted proposal id
  label?: string   // human ref, e.g. "Accepted proposal"
}
```

### Line item (extended additively)
```ts
export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number            // dollars
  source?: InvoiceSourceRef     // NEW: per-line source retention
}
```
(Tax/discount fields intentionally omitted — added when the tax slice lands; Firestore
schemaless + versioned migration makes additive extension cheap.)

### Payment (extended additively)
```ts
export interface InvoicePayment {
  amount: number                // dollars APPLIED to balance
  method?: string
  note?: string
  recorded_at: string           // ISO
  tip_amount?: number           // NEW: gratuity, EXCLUDED from balance/progress math
}
```

### Invoice (single `status` replaced by split model)
```ts
export interface Invoice {
  id: string
  org_id: string
  lead_id: string               // = opportunity id (CRM keeps this name this increment)
  customer_id?: string          // NEW seam — populated once CRM ships Customer
  token: string
  schema_version?: number       // absent/legacy => v1; new invoices => 2

  type: InvoiceType             // NEW
  lifecycle: InvoiceLifecycle   // NEW — replaces `status`
  delivery: InvoiceDeliveryStatus       // default 'not_sent'
  accounting: InvoiceAccountingStatus   // default 'not_connected'
  dispute: InvoiceDisputeStatus         // default 'none'

  source?: InvoiceSourceRef     // NEW — primary billable source
  number?: string               // assigned at issue
  title?: string
  line_items: InvoiceLineItem[]
  payments: InvoicePayment[]
  notes?: string
  due_date?: string             // ISO

  tips_enabled?: boolean        // NEW — per-invoice override (undefined => inherit org)

  payment_status?: InvoicePaymentStatus  // MATERIALIZED cache (updated on write) for future indexed views

  replaces_id?: string          // NEW — set on a replacement draft
  replaced_by_id?: string       // NEW — set on the voided original

  issued_at?: string            // NEW
  created_at: string
  updated_at?: string
}
```

### Org (one additive field)
```ts
// Org gains:
tips_enabled?: boolean          // org-wide default for new invoices; invoice value wins
```
Tip resolution: `invoice.tips_enabled ?? org.tips_enabled ?? false`
(tri-state: `undefined`=inherit, `true`=force on, `false`=force off even if org default on).

## Pure core (`lib/invoices.ts`)

All pure, unit-tested, no I/O.

### Totals & balance (tips excluded)
- `lineItemSubtotal`, `invoiceTotal` — unchanged (scope money).
- `amountApplied(payments)` = Σ `payment.amount` (excludes `tip_amount`).
- `tipsTotal(payments)` = Σ `payment.tip_amount ?? 0`.
- `invoiceBalance(invoice)` = `invoiceTotal(line_items) − amountApplied(payments)`.

### Derived states
- `derivePaymentStatus(invoice, now)` → `InvoicePaymentStatus`
  - `void` if lifecycle ∈ {voided, replaced}
  - else from total vs applied vs refunds; `not_due`/`due` gated by `due_date` vs `now`.
- `deriveAging(invoice, now)` → `InvoiceAgingBucket` from `due_date`, balance, `now`.

### Progress engine
Given the source proposal total and the opportunity's other non-void invoices from the
same source:
- `approvedAmount(proposalTotal)` = proposal total.
- `previouslyBilled(invoices, sourceId)` = Σ `invoiceTotal` of **issued, non-void** invoices with that `source.id`.
- `remainingToBill(approved, billed)` = `approved − billed`.
- `assertWithinScope(newTotal, billed, approved)` → throws `InvoiceScopeError('exceeds approved scope by $X')` when `newTotal + billed > approved`.
- Deposit→final: a `final` invoice's suggested total = `remainingToBill`.

### Immutability guard
- `LOCKED_LIFECYCLES = ['issued','voided','replaced','closed']`.
- `assertEditable(invoice, updateKeys)` — throws if any financial key
  (`line_items | type | source | due_date | number`) is in the update while lifecycle is locked. `notes` always editable.

### Migration shim
- `normalizeInvoice(raw)` → canonical `Invoice`:
  - legacy v1 `status` map: `draft→draft`, `sent→issued`, `partial→issued`, `paid→issued`, `void→voided`.
  - defaults `type='quick'`, `delivery='not_sent'`, `accounting='not_connected'`, `dispute='none'` when absent.
  - **pure, never writes.**
- `NUMBERING`: format `${prefix ?? ''}${seq}`.

## Actions (`actions/invoices.ts`)

- `createInvoice(orgId, leadId, input)` — born as `schema_version=2`, `lifecycle='draft'`, `type` from input (default `quick`), defaults for delivery/accounting/dispute, `source` optional.
- `generateFromProposal(orgId, leadId, proposalId, { type })` — NEW. Loads the **accepted** proposal, builds a draft with line items carrying `source={type:'proposal', id, label}`, invoice-level `source`, and (for `final`) totals suggested from `remainingToBill`. Applies scope guardrail on non-quick types.
- `updateInvoice` — routes through `assertEditable`; upgrades a legacy draft to v2 on write.
- `approveInvoice(orgId, id)` — NEW. `draft → approved` (optional validation/approval hook point; not a required precondition for issue in this slice).
- `issueInvoice(orgId, id)` — NEW. Allowed from `draft` **or** `approved`. **Transaction**: validate + scope check → increment `orgs/{org}/counters/invoice_number` → assign `number` → `lifecycle='issued'`, `issued_at`, materialize `payment_status`. Replaces the old `sendInvoice` semantics (delivery is separate/later).
- `voidInvoice(orgId, id, reason)` — NEW. `→ voided`, frees billed amount from scope, keeps number.
- `replaceInvoice(orgId, id)` — NEW. void original (`replaced_by_id`) + create linked draft copy (`replaces_id`).
- `recordPayment(orgId, id, input)` — accepts optional `tip_amount`; recomputes materialized `payment_status`; forbidden on voided/replaced.
- `deleteInvoice` — refuses when lifecycle ∈ locked set (drafts only).

## Public (`actions/invoices-public.ts`)
- `getPublicInvoice(token)` runs through `normalizeInvoice`; exposes only `lifecycle==='issued'`. `PublicInvoice` gains `type`, `amount_paid` (applied, tips excluded), `balance`, and `tips_enabled` (resolved) for the future payment page; drafts/approved never exposed.

## UI
- `InvoiceEditorClient` — type selector; "Generate from accepted proposal" action; source badges on lines; progress summary (approved / billed / remaining) for deposit/progress/final; manual tip field shown only when tips resolve to enabled; issue/void/replace controls replacing the raw status flip; locked fields become read-only once issued.
- `InvoiceViewClient` (public) — show type, prior payments, balance; unchanged auth (token).

## Firestore
- `firestore.indexes.json` (surgical, invoice-only): retain `invoices [lead_id, created_at]`; add `invoices [lead_id, source.id]` (progress lookups) — added only if a query requires it during implementation.
- Counter doc: `orgs/{orgId}/counters/invoice_number` (transactional).

## Testing (green gate: `npx tsc --noEmit` + `npm test`)
Unit tests (pure, no I/O):
1. Totals/balance exclude tips; `tipsTotal` correct.
2. `derivePaymentStatus` across not_due/due/partial/paid/overpaid/refunded/void.
3. `deriveAging` bucket boundaries.
4. Progress engine: `remainingToBill`, `assertWithinScope` block + overage message, deposit→final suggested total.
5. Numbering: sequential, prefix, no reuse after void (counter mocked).
6. `normalizeInvoice`: every legacy status maps correctly; defaults applied; never mutates input.
7. Immutability: `assertEditable` allows `notes`, rejects financial keys when locked.
8. Tip resolution tri-state (`invoice ?? org ?? false`), including global-on + per-invoice-false = off.

## CRM sequencing flags
- `customer_id?` seam present but unpopulated until CRM ships `Customer`.
- Customer balance, statements, consolidated billing, saved payment methods, and
  batch/recurring all depend on `Customer` — sequence after the CRM increment.
- Keep `lead_id` as the opportunity id this increment.
