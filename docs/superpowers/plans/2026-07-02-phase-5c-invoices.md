# Phase 5c: Invoice Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a Lead, an org admin builds an itemized **invoice** (line items → total), records payments against it (manual entry), and shares a public link where the client sees the invoice with its outstanding **balance**. Status derives from payments (draft → sent → partial → paid; plus void).

**Architecture:** Mirrors the Phase 5b proposal architecture exactly. Invoices live flat at `orgs/{orgId}/invoices/{invoiceId}` with `org_id`, `lead_id`, and a `token`. Admin CRUD + `recordPayment` are `assertOrgMember`(read)/`assertOrgAdmin`(mutate). A public read-only view resolves by token via `collectionGroup('invoices').where('token','==',token)` and returns a projected DTO (no token/org_id/lead_id/id, drafts hidden). **Online payment is out of scope** (Stripe keys aren't live) — payments are recorded manually by the org; the public view is read-only with the balance shown. Money in dollars; totals/balance by pure helpers.

**Tech Stack:** Next.js 16 App Router (`params` is a Promise), Firebase Admin, Vitest. UI primitives: `@/components/ui/{card,button,input,label,badge}` + native `<select>`/`<textarea>`.

**Baseline:** 425 tests passing (run `npm install` first so the `server-only` shim resolves).

---

### Task 1: Invoice types + pure helpers

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/invoices.ts`
- Create: `__tests__/lib/invoices.test.ts`

- [ ] **Step 1: Write the failing test** — `__tests__/lib/invoices.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import {
  INVOICE_STATUSES, INVOICE_STATUS_LABELS,
  lineItemSubtotal, invoiceTotal, amountPaid, invoiceBalance, paymentStatus,
} from '@/lib/invoices'
import type { Invoice, InvoiceLineItem, InvoicePayment } from '@/lib/types'

const li = (quantity: number, unit_price: number): InvoiceLineItem => ({ description: 'x', quantity, unit_price })
const pay = (amount: number): InvoicePayment => ({ amount, recorded_at: '' })

describe('INVOICE_STATUSES', () => {
  it('is the five statuses with labels', () => {
    expect(INVOICE_STATUSES).toEqual(['draft', 'sent', 'partial', 'paid', 'void'])
    for (const s of INVOICE_STATUSES) expect(INVOICE_STATUS_LABELS[s]).toBeTruthy()
  })
})

describe('lineItemSubtotal / invoiceTotal', () => {
  it('multiplies and sums, rounded to cents; non-positive → 0', () => {
    expect(lineItemSubtotal(li(3, 45.99))).toBe(137.97)
    expect(lineItemSubtotal(li(-1, 50))).toBe(0)
    expect(invoiceTotal([li(2, 50), li(1, 45.99)])).toBe(145.99)
    expect(invoiceTotal([])).toBe(0)
  })
})

describe('amountPaid / invoiceBalance', () => {
  it('sums payments and computes balance', () => {
    const inv = { line_items: [li(2, 50)], payments: [pay(30), pay(20)] } as Invoice
    expect(amountPaid(inv.payments)).toBe(50)
    expect(invoiceBalance(inv)).toBe(50)   // 100 total - 50 paid
  })
  it('balance never goes negative below zero rounding', () => {
    const inv = { line_items: [li(1, 100)], payments: [pay(120)] } as Invoice
    expect(invoiceBalance(inv)).toBe(-20)  // overpayment shows as negative balance
  })
})

describe('paymentStatus', () => {
  it('paid when fully covered, partial when some, else fallback', () => {
    expect(paymentStatus(100, 100, 'sent')).toBe('paid')
    expect(paymentStatus(100, 120, 'sent')).toBe('paid')
    expect(paymentStatus(100, 40, 'sent')).toBe('partial')
    expect(paymentStatus(100, 0, 'sent')).toBe('sent')
    expect(paymentStatus(0, 0, 'draft')).toBe('draft')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/lib/invoices.test.ts` → FAIL.

- [ ] **Step 3: Update `lib/types.ts`** — add near the Proposal types:

```typescript
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'void'

export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number   // dollars
}

export interface InvoicePayment {
  amount: number       // dollars
  method?: string      // e.g. 'cash' | 'check' | 'card' | free text
  note?: string
  recorded_at: string  // ISO
}

export interface Invoice {
  id: string
  org_id: string       // denormalized for collectionGroup token lookups
  lead_id: string
  token: string        // unguessable public link token
  number?: string      // human-facing invoice number, optional
  title?: string
  status: InvoiceStatus
  line_items: InvoiceLineItem[]
  payments: InvoicePayment[]
  notes?: string
  due_date?: string    // ISO date, optional
  created_at: string
  updated_at?: string
}
```

- [ ] **Step 4: Create `lib/invoices.ts`**

```typescript
import type { Invoice, InvoiceLineItem, InvoicePayment, InvoiceStatus } from '@/lib/types'

export const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'partial', 'paid', 'void']

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partially paid',
  paid: 'Paid',
  void: 'Void',
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function lineItemSubtotal(item: InvoiceLineItem): number {
  const qty = item.quantity
  const price = item.unit_price
  if (!(qty > 0) || !(price > 0)) return 0
  return round2(qty * price)
}

export function invoiceTotal(lineItems: InvoiceLineItem[]): number {
  return round2(lineItems.reduce((sum, item) => sum + lineItemSubtotal(item), 0))
}

export function amountPaid(payments: InvoicePayment[]): number {
  return round2(payments.reduce((sum, p) => sum + (p.amount > 0 ? p.amount : 0), 0))
}

export function invoiceBalance(invoice: Pick<Invoice, 'line_items' | 'payments'>): number {
  return round2(invoiceTotal(invoice.line_items) - amountPaid(invoice.payments))
}

// Derive the paid/partial status after a payment; `fallback` is used when nothing is paid
// (so a draft stays draft, a sent invoice stays sent).
export function paymentStatus(total: number, paid: number, fallback: InvoiceStatus): InvoiceStatus {
  if (total > 0 && paid >= total) return 'paid'
  if (paid > 0) return 'partial'
  return fallback
}
```

- [ ] **Step 5: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/invoices.ts "__tests__/lib/invoices.test.ts"
git commit -m "feat: Invoice types + line-item/total/balance/status pure helpers"
```

---

### Task 2: Admin invoice actions (CRUD + send + record payment)

**Files:**
- Create: `actions/invoices.ts`
- Create: `__tests__/actions/invoices.test.ts`

- [ ] **Step 1: Write the failing tests** — mirror `__tests__/actions/proposals.test.ts` mock style.

Hoisted spies; mock `@/lib/firebase-admin` so `adminDb.collection('orgs').doc(orgId).collection('invoices')` exposes `.doc(id?)` → `{ id: id ?? 'new-invoice-id', set, get, update, delete }` and `.where('lead_id','==',v).orderBy('created_at','desc').get()` → `listInvoicesSpy`. Mock `@/lib/auth/assert` (resolve `{ role: 'admin' }`). Mock `@/lib/tokens` `generateAccessToken` → `'tok_test'`. Cover:
- **createInvoice**: writes with generated `id`, `token: 'tok_test'`, `org_id`, `lead_id`, `status: 'draft'`, `line_items` (default `[]`), `payments: []`, `created_at`, plus passed `title`/`number`/`due_date`/`notes`; returns it.
- **listInvoices**: `where('lead_id','==',leadId).orderBy('created_at','desc')`; mapped docs.
- **getInvoice**: `null` when missing; the invoice when present.
- **updateInvoice**: passes `title`/`number`/`notes`/`due_date`/`line_items`/`status` through; always `updated_at`; throws `'Invalid status'` on bad status.
- **sendInvoice**: `update({ status: 'sent', updated_at })`.
- **recordPayment**: reads the invoice (mock `.get()` → an invoice with `line_items: [{quantity:1,unit_price:100}]`, `payments: []`, `status:'sent'`), then `update` is called with `payments` containing the appended payment (amount 40, `recorded_at` set) and `status: 'partial'`. A second call covering full payment (amount 100) → `status: 'paid'`. Throws `'Payment amount must be positive'` for amount ≤ 0 (no update). Throws `'Cannot record payment on a void invoice'` when the invoice status is `'void'`.
- **deleteInvoice**: `.delete()`.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Create `actions/invoices.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { generateAccessToken } from '@/lib/tokens'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { INVOICE_STATUSES, invoiceTotal, amountPaid, paymentStatus } from '@/lib/invoices'
import type { Invoice, InvoiceLineItem, InvoicePayment, InvoiceStatus } from '@/lib/types'

function invoicesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('invoices')
}

export interface CreateInvoiceInput {
  title?: string
  number?: string
  line_items?: InvoiceLineItem[]
  notes?: string
  due_date?: string
}

export async function listInvoices(orgId: string, leadId: string): Promise<Invoice[]> {
  await assertOrgMember(orgId)
  const snap = await invoicesRef(orgId).where('lead_id', '==', leadId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Invoice)
}

export async function getInvoice(orgId: string, invoiceId: string): Promise<Invoice | null> {
  await assertOrgMember(orgId)
  const snap = await invoicesRef(orgId).doc(invoiceId).get()
  return snap.exists ? (snap.data() as Invoice) : null
}

export async function createInvoice(orgId: string, leadId: string, input: CreateInvoiceInput): Promise<Invoice> {
  await assertOrgAdmin(orgId)
  const id = randomBytes(8).toString('hex')
  const invoice: Invoice = {
    id,
    org_id: orgId,
    lead_id: leadId,
    token: generateAccessToken(),
    status: 'draft',
    line_items: input.line_items ?? [],
    payments: [],
    created_at: new Date().toISOString(),
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.number?.trim() ? { number: input.number.trim() } : {}),
    ...(input.due_date?.trim() ? { due_date: input.due_date.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await invoicesRef(orgId).doc(id).set(invoice)
  return invoice
}

export interface InvoiceUpdate {
  title?: string
  number?: string
  notes?: string
  due_date?: string
  line_items?: InvoiceLineItem[]
  status?: InvoiceStatus
}

export async function updateInvoice(orgId: string, invoiceId: string, updates: InvoiceUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  if (updates.status && !INVOICE_STATUSES.includes(updates.status)) throw new Error('Invalid status')
  await invoicesRef(orgId).doc(invoiceId).update({ ...updates, updated_at: new Date().toISOString() })
}

export async function sendInvoice(orgId: string, invoiceId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await invoicesRef(orgId).doc(invoiceId).update({ status: 'sent', updated_at: new Date().toISOString() })
}

export interface RecordPaymentInput {
  amount: number
  method?: string
  note?: string
}

export async function recordPayment(orgId: string, invoiceId: string, input: RecordPaymentInput): Promise<void> {
  await assertOrgAdmin(orgId)
  if (!(input.amount > 0)) throw new Error('Payment amount must be positive')
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const invoice = snap.data() as Invoice
  if (invoice.status === 'void') throw new Error('Cannot record payment on a void invoice')

  const now = new Date().toISOString()
  const payment: InvoicePayment = {
    amount: input.amount,
    recorded_at: now,
    ...(input.method?.trim() ? { method: input.method.trim() } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  }
  const payments = [...(invoice.payments ?? []), payment]
  const total = invoiceTotal(invoice.line_items ?? [])
  const paid = amountPaid(payments)
  const status = paymentStatus(total, paid, invoice.status === 'draft' ? 'draft' : 'sent')
  await ref.update({ payments, status, updated_at: now })
}

export async function deleteInvoice(orgId: string, invoiceId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await invoicesRef(orgId).doc(invoiceId).delete()
}
```

- [ ] **Step 4: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 5: Commit**

```bash
git add actions/invoices.ts "__tests__/actions/invoices.test.ts"
git commit -m "feat: org-scoped invoice actions (CRUD + send + record payment)"
```

---

### Task 3: Public invoice view action (token, read-only DTO)

**Files:**
- Create: `actions/invoices-public.ts`
- Create: `__tests__/actions/invoices-public.test.ts`

**SECURITY-RELEVANT:** unauthenticated read; DTO must not leak token/org_id/lead_id/id; drafts hidden.

- [ ] **Step 1: Write the failing tests** — mirror `__tests__/actions/proposals-public.test.ts`.

Mock `adminDb.collectionGroup('invoices').where('token','==',t).limit(1).get()` → configurable `{ empty, docs:[{ data }] }`. Cover:
- **getPublicInvoice(token)**: unknown/empty → `null`; a `draft` → `null`; a non-draft → a `PublicInvoice` DTO. Seed `token`/`org_id`/`lead_id`/`id` on the doc and assert they are ABSENT from the result (`'token' in result === false`, etc.). Assert the DTO includes `line_items`, `amount_paid` (computed from payments), `balance` (computed), `status`, `title`/`number`/`due_date` when present.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Create `actions/invoices-public.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { amountPaid, invoiceBalance } from '@/lib/invoices'
import type { Invoice, InvoiceLineItem, InvoiceStatus } from '@/lib/types'

// Public-safe projection of an Invoice. OMITS the secret `token`, internal
// `org_id`, `lead_id`, and `id`. Includes computed `amount_paid` + `balance`.
export interface PublicInvoice {
  title?: string
  number?: string
  status: InvoiceStatus
  line_items: InvoiceLineItem[]
  amount_paid: number
  balance: number
  notes?: string
  due_date?: string
  created_at: string
}

async function findInvoiceByToken(token: string) {
  const snap = await adminDb.collectionGroup('invoices').where('token', '==', token).limit(1).get()
  if (snap.empty) return null
  return snap.docs[0]
}

// PUBLIC (token = authorization). Drafts are never exposed.
export async function getPublicInvoice(token: string): Promise<PublicInvoice | null> {
  const doc = await findInvoiceByToken(token)
  if (!doc) return null
  const invoice = doc.data() as Invoice
  if (invoice.status === 'draft') return null
  const publicInvoice: PublicInvoice = {
    status: invoice.status,
    line_items: invoice.line_items,
    amount_paid: amountPaid(invoice.payments ?? []),
    balance: invoiceBalance(invoice),
    created_at: invoice.created_at,
  }
  if (invoice.title !== undefined) publicInvoice.title = invoice.title
  if (invoice.number !== undefined) publicInvoice.number = invoice.number
  if (invoice.notes !== undefined) publicInvoice.notes = invoice.notes
  if (invoice.due_date !== undefined) publicInvoice.due_date = invoice.due_date
  return publicInvoice
}
```

- [ ] **Step 4: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 5: Commit**

```bash
git add actions/invoices-public.ts "__tests__/actions/invoices-public.test.ts"
git commit -m "feat: public invoice view by token (read-only, public-safe DTO)"
```

**REVIEW GATE:** security review after this task — DTO no-leak, no draft exposure, token-only read.

---

### Task 4: Admin UI — invoices on lead detail + invoice editor

**Files:**
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`
- Create: `components/admin/LeadInvoicesClient.tsx`
- Create: `app/(admin)/[orgSlug]/leads/[leadId]/invoices/[invoiceId]/page.tsx`
- Create: `components/admin/InvoiceEditorClient.tsx`

No new vitest tests; `npx tsc --noEmit` + `npx vitest run` stay green.

- [ ] **Step 1: Fetch invoices on the lead detail page** — `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`

The page already fetches the lead and (Phase 5b) proposals and renders `<LeadDetailClient>` + `<LeadProposalsClient>`. Additionally `const invoices = await listInvoices(orgId, leadId)` (import from `@/actions/invoices`) and render `<LeadInvoicesClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} invoices={invoices} />` alongside them (keep everything inside the existing wrapper fragment/div).

- [ ] **Step 2: `components/admin/LeadInvoicesClient.tsx`** (`'use client'`) — mirror `LeadProposalsClient.tsx`.

Props `{ orgId, orgSlug, leadId, invoices }`. A Card "Invoices":
- List each: `number ? `#${number}` : ''` + `title || 'Invoice'`, a status `Badge` (`INVOICE_STATUS_LABELS[status]`), total (`invoiceTotal(inv.line_items)`) and balance (`invoiceBalance(inv)`) formatted `$${n.toFixed(2)}`, an "Edit" link → `/${orgSlug}/leads/${leadId}/invoices/${inv.id}`, and when `status !== 'draft'` a "Copy client link" copying `${window.location.origin}/invoices/${inv.token}`.
- "New invoice" → `await createInvoice(orgId, leadId, {})` then `router.push(.../invoices/${created.id})`.
- Empty state + error aria-live. Imports: `createInvoice` from `@/actions/invoices`; `invoiceTotal, invoiceBalance, INVOICE_STATUS_LABELS` from `@/lib/invoices`; `Invoice` from `@/lib/types`; UI + `useRouter` + `Link`.

- [ ] **Step 3: Invoice editor page** — `app/(admin)/[orgSlug]/leads/[leadId]/invoices/[invoiceId]/page.tsx` (mirror the proposal editor page)

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getInvoice } from '@/actions/invoices'
import { InvoiceEditorClient } from '@/components/admin/InvoiceEditorClient'

export default async function InvoiceEditorPage({ params }: { params: Promise<{ orgSlug: string; leadId: string; invoiceId: string }> }) {
  const { orgSlug, leadId, invoiceId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const invoice = await getInvoice(orgId, invoiceId)
  if (!invoice || invoice.lead_id !== leadId) notFound()
  return <InvoiceEditorClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} invoice={invoice} />
}
```

- [ ] **Step 4: `components/admin/InvoiceEditorClient.tsx`** (`'use client'`) — mirror `ProposalEditorClient.tsx`, add payments.

Props `{ orgId, orgSlug, leadId, invoice }`. Behavior:
- Fields: number `<input>`, title `<input>`, due date `<input type="date">`, notes `<textarea>`.
- Editable line-items table (local `InvoiceLineItem[]`): description, qty (`number`), unit price (`number`), live subtotal (`lineItemSubtotal`), Remove; "Add line item". Live grand total (`invoiceTotal`).
- "Save" → filter blank rows, `await updateInvoice(orgId, invoice.id, { number, title, due_date, notes, line_items })` (empty → undefined); saved notice.
- "Send to client" → `await sendInvoice(orgId, invoice.id)`; reveal shareable link `${window.location.origin}/invoices/${invoice.token}` + Copy. Status Badge.
- **Payments section**: list existing `invoice.payments` (amount, method, recorded_at); show `amountPaid` and `invoiceBalance`. A "Record payment" form (amount `number`, method `<input>`, note `<input>`) → `await recordPayment(orgId, invoice.id, {...})`; on success `router.refresh()` (server re-fetches the updated invoice).
- "Delete" (confirm) → `await deleteInvoice(orgId, invoice.id)` then `router.push(.../leads/${leadId})`.
- Back link. error/notice aria-live. Imports: `updateInvoice, sendInvoice, deleteInvoice, recordPayment` from `@/actions/invoices`; `lineItemSubtotal, invoiceTotal, amountPaid, invoiceBalance, INVOICE_STATUS_LABELS` from `@/lib/invoices`; `Invoice, InvoiceLineItem` from `@/lib/types`; UI + `useRouter`.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/[orgSlug]/leads/[leadId]/page.tsx" components/admin/LeadInvoicesClient.tsx "app/(admin)/[orgSlug]/leads/[leadId]/invoices/[invoiceId]/page.tsx" components/admin/InvoiceEditorClient.tsx
git commit -m "feat: invoices on lead detail + invoice editor with payment recording"
```

---

### Task 5: Public invoice page (read-only)

**Files:**
- Create: `app/(public)/invoices/[token]/page.tsx`
- Create: `components/invoices/InvoiceViewClient.tsx`

- [ ] **Step 1: Public page** — `app/(public)/invoices/[token]/page.tsx`

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getPublicInvoice } from '@/actions/invoices-public'
import { InvoiceViewClient } from '@/components/invoices/InvoiceViewClient'

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await getPublicInvoice(token)
  if (!invoice) notFound()
  return <InvoiceViewClient invoice={invoice} />
}
```

- [ ] **Step 2: `components/invoices/InvoiceViewClient.tsx`**

Props `{ invoice: PublicInvoice }` (import `PublicInvoice` from `@/actions/invoices-public`). This can be a plain presentational component (no `'use client'` needed — it's read-only, no handlers). Self-contained public page (mirror `NetworkPortalView` standalone style):
- Header: `invoice.number ? `Invoice #${invoice.number}` : 'Invoice'` + `invoice.title` if present; a status `Badge` (`INVOICE_STATUS_LABELS[invoice.status]`).
- Line-items table: description, qty, unit price, subtotal (`lineItemSubtotal`); grand total (`invoiceTotal(invoice.line_items)`). Then a summary block: Total, Amount paid (`invoice.amount_paid`), **Balance due** (`invoice.balance`) — all `$${n.toFixed(2)}`. Due date + notes if present.
- If `invoice.balance <= 0` and status `paid`: a "Paid in full — thank you" note. Otherwise show the balance due prominently. (No online-pay button — manual payment; note in code comment that Stripe pay is a follow-up.)
- Imports: `lineItemSubtotal, invoiceTotal, INVOICE_STATUS_LABELS` from `@/lib/invoices`; `Badge`/`Card` from `@/components/ui`.

- [ ] **Step 3: Verify**

- `npx tsc --noEmit` clean.
- `npx vitest run` all green.
- `npx next build` (copy env: `cp /Users/rm/vw/traxevent/.env.local .env.local`, build, then `rm -f .env.local`) → succeeds; routes `/invoices/[token]` and `/[orgSlug]/leads/[leadId]/invoices/[invoiceId]` appear; no collisions.

- [ ] **Step 4: Commit** (do NOT add `.env.local`)

```bash
git add "app/(public)/invoices/[token]/page.tsx" components/invoices/InvoiceViewClient.tsx
git commit -m "feat: public invoice page (read-only, shows balance due)"
```

---

### Task 6: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run` → all green; record final count.
- [ ] **Step 3:** `npx next build` (with `.env.local`) → succeeds; confirm the two new routes + no collisions.
- [ ] **Step 4:** Commit this plan file (`docs: phase 5c ...`).
- [ ] **Step 5:** Hand back for branch finish (push + PR + squash-merge as `Lifewithmo`, verify prod deploy). Surface the follow-up: **online invoice payment (Stripe) is deferred** — payments are recorded manually; add a Stripe-Connect pay button on the public invoice once keys are live.

---

## Self-Review

**Spec coverage:** Roadmap "Invoice builder (itemized services, line items, totals)" + outstanding balance: invoice entity + line items + totals (Task 1/4), admin CRUD + send + **payment recording → balance/status** (Task 2/4), public client view with balance (Task 3/5). Covered. Online payment is explicitly deferred (Stripe-gated) and surfaced as a follow-up. Invoices attach to the Phase 5a lead.

**Placeholder scan:** Types, helpers, actions, pages verbatim. The three client components are specified behaviorally against the just-built proposal analogues (`LeadProposalsClient`, `ProposalEditorClient`) + `NetworkPortalView` — acceptable for mechanical UI.

**Type consistency:** `Invoice`/`InvoiceLineItem`/`InvoicePayment`/`InvoiceStatus` (Task 1) used by `lib/invoices.ts`, both action files, and all UI. `lineItemSubtotal`/`invoiceTotal`/`amountPaid`/`invoiceBalance`/`paymentStatus`/`INVOICE_STATUS*` signatures match across def and callers. `createInvoice(orgId, leadId, input)` / `updateInvoice` / `sendInvoice` / `recordPayment` / `getInvoice` / `listInvoices(orgId, leadId)` match UI callers. `getPublicInvoice(token)` returns `PublicInvoice` consumed by the public page.

**Security note:** Admin actions `assertOrgMember`(read)/`assertOrgAdmin`(mutate), path-isolated to `orgs/{orgId}/invoices`; status validated against `INVOICE_STATUSES`; payments require positive amount and reject void invoices. Public `getPublicInvoice` authorizes solely by the 48-hex-char token via `collectionGroup` exact-match, never returns a `draft`, and returns a projected DTO with `token`/`org_id`/`lead_id`/`id` structurally absent (computed `amount_paid`/`balance` only). No public mutation exists (read-only), so no cross-tenant write surface.
