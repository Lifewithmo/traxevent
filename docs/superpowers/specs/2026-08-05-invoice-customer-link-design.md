# Invoice ↔ Customer Link — Design

**Date:** 2026-08-05
**Branch:** `claude/traxevent-invoicing-system-4c451a` (level with `main` @ 0e2c0f7)
**Builds on:** the invoicing-foundation slice + the CRM V1 `Customer` entity (both now on main).

## Purpose

Wire the `Invoice.customer_id?` seam — left unpopulated in the foundation slice — to the CRM's now-shipped `Customer`, so invoices carry their customer link going forward and the admin can see who an invoice bills.

## Context (already on main)

- `Lead.customer_id?: string` — a lead may link to a `Customer`.
- `Customer` = `{ id, name, company?, email?, phone?, tags?, notes?, ... }`.
- Readers: `getLead(orgId, leadId): Promise<Lead | null>`, `getCustomer(orgId, customerId): Promise<Customer | null>`.
- `Invoice.customer_id?: string` already exists (foundation seam).

## Scope

### In
- **Populate** `invoice.customer_id` from the lead's `customer_id` at creation, in `createInvoice` (so `generateFromProposal`, which calls it, inherits automatically).
- **Display** a "Bill to: {customer name}" line in the admin invoice editor when `customer_id` is set, resolving the name via `getCustomer` in the server page and passing it as a prop.
- Tests for the populate paths.

### Out (deliberate)
- **No backfill** of existing invoices (immutability: issued invoices are never rewritten; drafts pick it up on regeneration).
- **No name denormalization** — store only `customer_id`; resolve the name at display time (avoids stale names on customer rename).
- **No client-facing / public "Bill to"** — what the client sees is a separate, more careful decision, not folded in here.
- No new customer-balance/statement features (those are their own later slices, now unblocked).

## Decisions

1. **Single populate point.** `createInvoice(orgId, leadId, input)` reads the lead via `getLead` and copies `lead.customer_id` when present (conditional spread — never writes `undefined`). This is the only creation primitive; `generateFromProposal` and `replaceInvoice` both route through it, so no per-caller wiring.
2. **Derived, not overridable.** `CreateInvoiceInput` gains no `customer_id` field; the value always comes from the lead. If the lead has no customer, the invoice has none.
3. **Display in the server page.** The invoice editor page (`app/(admin)/[orgSlug]/leads/[leadId]/invoices/[invoiceId]/page.tsx`) resolves the customer via `getCustomer(orgId, invoice.customer_id)` when set and passes `customerName?: string` to `InvoiceEditorClient`, which renders "Bill to: {name}". Keeps the client component free of data-loading.

## Files

- `actions/invoices.ts` — `createInvoice` reads `getLead`, copies `customer_id`. (import `getLead` from `@/actions/leads` — read-only.)
- `app/(admin)/[orgSlug]/leads/[leadId]/invoices/[invoiceId]/page.tsx` — load customer, pass `customerName`.
- `components/admin/InvoiceEditorClient.tsx` — render "Bill to" when `customerName` provided.
- Tests: `__tests__/actions/invoices.test.ts` (populate paths), `__tests__/components/InvoiceEditorClient.test.tsx` (bill-to display).

## Testing (green gate: `tsc --noEmit` + `vitest run`)

1. `createInvoice` copies `lead.customer_id` onto the invoice when the lead has one.
2. `createInvoice` omits `customer_id` (no `undefined` written) when the lead has none / lead missing.
3. `generateFromProposal` produces an invoice carrying the lead's `customer_id`.
4. `InvoiceEditorClient` renders "Bill to: {name}" when `customerName` is passed, and nothing when it isn't.
