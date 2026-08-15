# Invoice Experience Redesign — Design Spec

**Date:** 2026-08-15
**Status:** Approved in brainstorming; pending spec review
**Scope:** Admin invoice editor, invoice lifecycle, numbering settings, catalog-driven line items, customer-facing invoice page, transactional email send.

## Problem

The invoice editor works but exposes internal accounting machinery instead of the operator's real workflow: a mystery "Issue" button, a manual invoice-number field that bypasses the auto-numbering counter, a hidden void-and-replace flow for corrections, line items disconnected from the ops catalog, discount/tax controls stranded in their own card, no preview, and no way to email the invoice. First-principles goal: invoice states mirror real-world events (drafting, asking for money, money arriving, dead invoice), and everything else is derived or invisible.

## 1. Lifecycle: Draft → Sent → Void

Three operator-visible states. `approved`, `issued`, `replaced`, and `closed` are removed from the UI and from new writes.

| State | Meaning | Rules |
|---|---|---|
| `draft` | Being put together | Fully editable, no number, deletable |
| `sent` | Customer holds a copy | Number assigned, content snapshotted, email delivered |
| `void` | Dead invoice | Kept for the record, excluded from totals; payments blocked |

Payment status (`unpaid`/`partial`/`paid`/`overpaid`/`overdue`) and aging stay fully derived from payments and due date via the existing `derivePaymentStatus`/`deriveAging` logic. They are never stored as lifecycle states and never hand-managed.

### Editing after send

- "Edit invoice" unlocks the form on a sent invoice.
- "Save & resend" snapshots the prior content into a `versions[]` array on the invoice document (content + timestamp), keeps the same invoice number, updates the customer link to the corrected version immediately, and sends an updated email.
- Recorded payments carry over untouched.
- Version history is operator-visible in a collapsed "History" disclosure on the editor; the customer never sees revision ceremony — the link always shows current truth.

### Migration / back-compat

Read-time mapping (in `normalizeInvoice`): `issued` → `sent`; `approved` → `draft`; `voided`, `replaced` → `void`; `closed` → `sent` (its paid-ness is already derived). No data rewrite required. The Replace action and `LOCKED_LIFECYCLES` machinery are retired; the guarded actions (`approveInvoice`, `replaceInvoice`, `issueInvoice`) are removed or folded into the new `sendInvoice` action.

## 2. Numbering

- The manual invoice-number input is deleted from the editor. Drafts display "№ assigned when sent."
- Numbers are assigned only by the existing transaction-safe counter (`counters/invoice_number`) at send time — duplicates structurally impossible.
- New org settings section, "Invoice numbering": **prefix** (e.g. `BRW-`) and **next number**. Validation: next number cannot be set at or below the highest sequence already consumed (floor = current `seq`).
- Data model already supports `{ seq, prefix }`; this adds the settings UI and floor validation only.

## 3. Line items

- Rows render as a tight table: description, qty, unit price, subtotal, taxable checkbox, trash-icon delete (ghost icon button; replaces the "Remove" text button).
- Row-adding controls move to the bottom of the list (where the eye is after the last row):
  - **"Add from catalog"** (primary): opens a search/browse dialog over the ops catalog. Concretely, this lists **work packages** (`lib/ops/work-packages.ts` — named, priced offerings) as the sellable entries; unpriced resources are not listed. Selecting an entry appends a filled row (description from the package name, unit price from its price; qty defaults to 1).
  - **"Add blank line"** (secondary): appends an empty row, as today.
- Empty catalog search results offer two actions: **"Create '⟨query⟩' as a catalog item"** (inline quick form: name, price → creates a work package in the ops catalog and appends the row) and **"Add as one-off line"** (appends a row with the query as description, not saved to catalog).

## 4. Totals card (discount, tax, breakdown unified)

The separate "Discount & tax" card is dissolved. One **Totals** card in reading order:

```
Subtotal
Discount   [type ▾] [value] [reason (optional)]      −$X
Tax        [rate %]                                  +$X
Credits (if any)                                     −$X
Total
Amount paid
Balance
```

- Discount **reason** is a new optional free-text field on `InvoiceDiscount` (e.g. "Returning customer"); it renders on the customer-facing invoice next to the discount line.
- Controls live inline on their own totals line — if you are looking at the math, the controls are in the math.

## 5. Customer-facing invoice, preview, print

- The public share page (`/invoices/[token]`) is redesigned as a document: org logo and details, bill-to, invoice number and dates, line items table, totals (including discount reason), notes, payment status.
- A print stylesheet makes browser Print / Save-as-PDF produce a clean single document.
- The editor gains a **Preview** button that shows exactly this page pre-send.
- **Deferred:** server-generated PDF attachment (explicit later bolt-on; the web view is the system of record).

## 6. Send

- Primary editor CTA: **Send invoice** (replaces Approve/Issue). Confirm dialog: recipient email (pre-filled from the customer record, editable), subject, short message.
- On confirm, one atomic motion: transactional email delivered (platform sender, reply-to operator), number assigned via the counter transaction, content snapshotted as version 1, `sent_at` recorded, lifecycle → `sent`, delivery status recorded.
- After post-send edits the CTA reads **Send update** (same dialog; sends the corrected version, appends to `versions[]`).
- Copy-link sharing remains available alongside email.
- Rides the same transactional email path as the public intake form (PR #66). That path's delivery was never verified in production — **verifying real email delivery is in scope for this work**, not optional.
- The proposal→invoice deposit reconciler path (which today calls `issueInvoiceCore` with a backdated timestamp) maps to marking the invoice `sent` without an email; its number assignment behavior is unchanged.

## 7. Unchanged

Payments recording (amount/method/note/tips), credits, proposal→invoice generation (quick/deposit/progress/final) and its scope guardrails, the client-link token model. They plug into the new lifecycle vocabulary without behavior change.

## Error handling

- Send with no recipient email and none on the customer record: dialog requires an address before enabling Send.
- Email delivery failure after number assignment: invoice stays `sent` (number consumption is fine — numbers must be unique, not gapless); surface a delivery-failed banner with a Resend action.
- Catalog-item creation failure inside the picker: error shown in the dialog; invoice row not appended.
- Next-number setting below the floor: rejected with the current floor shown.

## Testing

- Unit: lifecycle mapping in `normalizeInvoice` (all legacy values), version snapshot on resend, counter floor validation, discount-reason normalization.
- Integration: send action (number assignment + snapshot + status in one transaction), edit-after-send flow preserving payments, catalog picker append paths (existing item, created item, one-off).
- Manual: real email delivery verification (shared debt with intake form), print stylesheet output, preview parity with public page.
