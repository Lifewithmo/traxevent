# Invoicing Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the source-driven, split-status invoice foundation with a progress-billing engine, issued-invoice immutability, transactional numbering, versioned/lazy migration, and optional per-invoice tips — no money movement, no external systems.

**Architecture:** Pure, unit-tested helpers in focused `lib/invoice-*.ts` files hold all money/state/scope logic. Server actions in `actions/invoices.ts` orchestrate Firestore, reading every stored doc through a `normalizeInvoice` shim that maps legacy `status` to the new split model in memory (issued docs are never rewritten). New invoices are born in the split model (`schema_version: 2`). The accepted proposal is a selectable billing *source*; the builder generates a draft from it.

**Tech Stack:** Next.js 16 (App Router, server actions), Firestore (firebase-admin), Vitest, React 19 + shadcn/ui, TypeScript (strict).

## Global Constraints

- **Isolation:** Work only in this worktree/branch. Do NOT edit CRM-owned files (`actions/leads.ts` beyond reading `lead_id`, `actions/customers|tasks|notes.ts`, the opportunity model, `LeadStage`). Keep `lib/types.ts` edits to invoice/org fields; keep `firestore.indexes.json` edits to invoice indexes.
- **CRM seam:** Invoices key off `lead_id` (= opportunity id). Leave `customer_id?` as an unpopulated seam.
- **Green gate (every task ends here):** `npx tsc --noEmit` clean AND `npx vitest run` passing. If ~5 `server-only` load failures appear, run `npm install` first.
- **Money:** dollars as numbers, rounded to cents with the existing `round2` pattern. Tips are excluded from balance and progress math.
- **Migration:** Never rewrite an issued invoice. Legacy docs are normalized on read; only still-mutable drafts upgrade on their next write.
- **Test conventions:** Vitest. Pure-logic tests in `__tests__/lib/*.test.ts` (no mocks). Action tests in `__tests__/actions/*.test.ts` mock `@/lib/firebase-admin`, `@/lib/auth/assert`, and `@/lib/tokens` with `vi.hoisted` spies (mirror `__tests__/actions/contracts.test.ts`).
- **Commits:** One commit per task, message prefix `feat(invoicing):` or `refactor(invoicing):`. End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

**Pure logic (new, focused files):**
- `lib/invoices.ts` (modify) — money math: subtotal, total, applied, tips, balance.
- `lib/invoice-status.ts` (create) — lifecycle/delivery/accounting/dispute enums + labels, `derivePaymentStatus`, `deriveAging`, `resolveTipsEnabled`.
- `lib/invoice-progress.ts` (create) — scope engine: `previouslyBilled`, `remainingToBill`, `assertWithinScope`, `InvoiceScopeError`.
- `lib/invoice-lock.ts` (create) — `LOCKED_LIFECYCLES`, `FINANCIAL_FIELDS`, `assertEditable`, `InvoiceLockedError`.
- `lib/invoice-normalize.ts` (create) — `normalizeInvoice`, `formatInvoiceNumber`.

**Types:** `lib/types.ts` (modify) — invoice/line/payment/org fields only.

**Actions:** `actions/invoices.ts`, `actions/invoices-public.ts` (modify).

**UI:** `components/admin/InvoiceEditorClient.tsx`, `components/invoices/InvoiceViewClient.tsx` (modify).

**Tests:** `__tests__/lib/invoices.test.ts` (modify), `__tests__/lib/invoice-status.test.ts`, `invoice-progress.test.ts`, `invoice-lock.test.ts`, `invoice-normalize.test.ts` (create), `__tests__/actions/invoices.test.ts`, `invoices-public.test.ts` (modify).

---

## Task 1: Money math + tips

**Files:**
- Modify: `lib/types.ts` (add `tip_amount?` to `InvoicePayment`)
- Modify: `lib/invoices.ts` (add `tipsTotal`; confirm `amountPaid`/`invoiceBalance` exclude tips)
- Test: `__tests__/lib/invoices.test.ts`

**Interfaces:**
- Consumes: existing `InvoiceLineItem`, `InvoicePayment`, `invoiceTotal`, `amountPaid`, `invoiceBalance`.
- Produces: `tipsTotal(payments: InvoicePayment[]): number`; `InvoicePayment.tip_amount?: number`.

- [ ] **Step 1: Add the failing test** to `__tests__/lib/invoices.test.ts` (append):

```ts
import { tipsTotal } from '@/lib/invoices'

describe('tips', () => {
  const payTip = (amount: number, tip: number): InvoicePayment => ({ amount, tip_amount: tip, recorded_at: '' })

  it('tipsTotal sums positive tip_amount only; missing tip counts as 0', () => {
    expect(tipsTotal([payTip(100, 15), payTip(50, 0), pay(25)])).toBe(15)
    expect(tipsTotal([payTip(100, -5)])).toBe(0)
  })

  it('amountPaid and invoiceBalance ignore tips entirely', () => {
    const inv = { line_items: [li(1, 100)], payments: [payTip(100, 20)] } as Invoice
    expect(amountPaid(inv.payments)).toBe(100)     // tip not counted as payment
    expect(invoiceBalance(inv)).toBe(0)            // balance ignores the $20 tip
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/invoices.test.ts -t tips`
Expected: FAIL — `tipsTotal` is not exported.

- [ ] **Step 3: Add `tip_amount?` to `InvoicePayment`** in `lib/types.ts`:

```ts
export interface InvoicePayment {
  amount: number       // dollars APPLIED to the balance
  method?: string
  note?: string
  recorded_at: string  // ISO
  tip_amount?: number  // gratuity — EXCLUDED from balance and progress math
}
```

- [ ] **Step 4: Add `tipsTotal`** to `lib/invoices.ts` (below `amountPaid`):

```ts
export function tipsTotal(payments: InvoicePayment[]): number {
  return round2(payments.reduce((sum, p) => sum + ((p.tip_amount ?? 0) > 0 ? (p.tip_amount as number) : 0), 0))
}
```

- [ ] **Step 5: Run the full lib test to verify green**

Run: `npx vitest run __tests__/lib/invoices.test.ts`
Expected: PASS (all, including existing cases — `amountPaid` already sums only `.amount`).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/invoices.ts __tests__/lib/invoices.test.ts
git commit -m "feat(invoicing): add optional payment tip_amount and tipsTotal, excluded from balance

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Status enums + derived states + tip resolution

**Files:**
- Modify: `lib/types.ts` (add the status/aging enum unions)
- Create: `lib/invoice-status.ts`
- Test: `__tests__/lib/invoice-status.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - Types: `InvoiceType`, `InvoiceLifecycle`, `InvoiceDeliveryStatus`, `InvoiceAccountingStatus`, `InvoiceDisputeStatus`, `InvoicePaymentStatus`, `InvoiceAgingBucket`.
  - `INVOICE_LIFECYCLES: InvoiceLifecycle[]`, `INVOICE_LIFECYCLE_LABELS: Record<InvoiceLifecycle,string>`.
  - `derivePaymentStatus(input: { total: number; applied: number; lifecycle: InvoiceLifecycle; dueDate?: string }, now: Date): InvoicePaymentStatus`
  - `deriveAging(input: { dueDate?: string; balance: number; lifecycle: InvoiceLifecycle }, now: Date): InvoiceAgingBucket`
  - `resolveTipsEnabled(invoiceTipsEnabled: boolean | undefined, orgTipsEnabled: boolean | undefined): boolean`

- [ ] **Step 1: Add the enum unions to `lib/types.ts`** (near the existing `InvoiceStatus`, leave `InvoiceStatus` in place for now — removed in Task 11):

```ts
export type InvoiceType = 'quick' | 'deposit' | 'progress' | 'final'
export type InvoiceLifecycle = 'draft' | 'approved' | 'issued' | 'voided' | 'replaced' | 'closed'
export type InvoiceDeliveryStatus = 'not_sent' | 'queued' | 'sent' | 'delivered' | 'bounced' | 'viewed' | 'downloaded'
export type InvoiceAccountingStatus = 'not_connected' | 'ready' | 'syncing' | 'synced' | 'error' | 'mismatch'
export type InvoiceDisputeStatus = 'none' | 'question' | 'under_review' | 'adjustment_proposed' | 'resolved' | 'escalated'
export type InvoicePaymentStatus = 'not_due' | 'due' | 'partial' | 'paid' | 'overpaid' | 'refunded' | 'void'
export type InvoiceAgingBucket = 'current' | 'due_soon' | 'due_today' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus'
```

- [ ] **Step 2: Write the failing test** `__tests__/lib/invoice-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { derivePaymentStatus, deriveAging, resolveTipsEnabled, INVOICE_LIFECYCLE_LABELS, INVOICE_LIFECYCLES } from '@/lib/invoice-status'

const now = new Date('2026-08-04T12:00:00Z')

describe('derivePaymentStatus', () => {
  it('void for voided/replaced regardless of money', () => {
    expect(derivePaymentStatus({ total: 100, applied: 0, lifecycle: 'voided' }, now)).toBe('void')
    expect(derivePaymentStatus({ total: 100, applied: 50, lifecycle: 'replaced' }, now)).toBe('void')
  })
  it('paid when fully covered, overpaid when applied exceeds total', () => {
    expect(derivePaymentStatus({ total: 100, applied: 100, lifecycle: 'issued' }, now)).toBe('paid')
    expect(derivePaymentStatus({ total: 100, applied: 120, lifecycle: 'issued' }, now)).toBe('overpaid')
  })
  it('partial when some paid but not full', () => {
    expect(derivePaymentStatus({ total: 100, applied: 40, lifecycle: 'issued' }, now)).toBe('partial')
  })
  it('not_due before due date, due on/after due date when nothing paid', () => {
    expect(derivePaymentStatus({ total: 100, applied: 0, lifecycle: 'issued', dueDate: '2026-08-10' }, now)).toBe('not_due')
    expect(derivePaymentStatus({ total: 100, applied: 0, lifecycle: 'issued', dueDate: '2026-08-01' }, now)).toBe('due')
  })
  it('due when issued with no due date and nothing paid', () => {
    expect(derivePaymentStatus({ total: 100, applied: 0, lifecycle: 'issued' }, now)).toBe('due')
  })
})

describe('deriveAging', () => {
  it('current when no due date or zero balance', () => {
    expect(deriveAging({ balance: 0, lifecycle: 'issued', dueDate: '2026-01-01' }, now)).toBe('current')
    expect(deriveAging({ balance: 100, lifecycle: 'issued' }, now)).toBe('current')
  })
  it('due_today / due_soon / overdue buckets', () => {
    expect(deriveAging({ balance: 100, lifecycle: 'issued', dueDate: '2026-08-04' }, now)).toBe('due_today')
    expect(deriveAging({ balance: 100, lifecycle: 'issued', dueDate: '2026-08-06' }, now)).toBe('due_soon')
    expect(deriveAging({ balance: 100, lifecycle: 'issued', dueDate: '2026-07-20' }, now)).toBe('d1_30')
    expect(deriveAging({ balance: 100, lifecycle: 'issued', dueDate: '2026-06-20' }, now)).toBe('d31_60')
    expect(deriveAging({ balance: 100, lifecycle: 'issued', dueDate: '2026-04-01' }, now)).toBe('d90_plus')
  })
})

describe('resolveTipsEnabled', () => {
  it('invoice value wins, then org, then false', () => {
    expect(resolveTipsEnabled(undefined, undefined)).toBe(false)
    expect(resolveTipsEnabled(undefined, true)).toBe(true)
    expect(resolveTipsEnabled(false, true)).toBe(false)   // global on, this invoice off
    expect(resolveTipsEnabled(true, false)).toBe(true)
  })
})

describe('lifecycle labels', () => {
  it('every lifecycle has a label', () => {
    for (const l of INVOICE_LIFECYCLES) expect(INVOICE_LIFECYCLE_LABELS[l]).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run __tests__/lib/invoice-status.test.ts`
Expected: FAIL — module `@/lib/invoice-status` not found.

- [ ] **Step 4: Create `lib/invoice-status.ts`:**

```ts
import type {
  InvoiceLifecycle, InvoicePaymentStatus, InvoiceAgingBucket,
} from '@/lib/types'

export const INVOICE_LIFECYCLES: InvoiceLifecycle[] = ['draft', 'approved', 'issued', 'voided', 'replaced', 'closed']

export const INVOICE_LIFECYCLE_LABELS: Record<InvoiceLifecycle, string> = {
  draft: 'Draft', approved: 'Approved', issued: 'Issued',
  voided: 'Voided', replaced: 'Replaced', closed: 'Closed',
}

// Whole days from `due` to `now` (positive = overdue).
function daysOverdue(dueDate: string, now: Date): number {
  const due = new Date(dueDate + 'T00:00:00Z').getTime()
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((today - due) / 86_400_000)
}

export function derivePaymentStatus(
  input: { total: number; applied: number; lifecycle: InvoiceLifecycle; dueDate?: string },
  now: Date,
): InvoicePaymentStatus {
  const { total, applied, lifecycle, dueDate } = input
  if (lifecycle === 'voided' || lifecycle === 'replaced') return 'void'
  if (total > 0 && applied > total) return 'overpaid'
  if (total > 0 && applied >= total) return 'paid'
  if (applied > 0) return 'partial'
  if (dueDate && daysOverdue(dueDate, now) < 0) return 'not_due'
  return 'due'
}

export function deriveAging(
  input: { dueDate?: string; balance: number; lifecycle: InvoiceLifecycle },
  now: Date,
): InvoiceAgingBucket {
  const { dueDate, balance } = input
  if (!dueDate || balance <= 0) return 'current'
  const d = daysOverdue(dueDate, now)
  if (d < -3) return 'current'
  if (d < 0) return 'due_soon'
  if (d === 0) return 'due_today'
  if (d <= 30) return 'd1_30'
  if (d <= 60) return 'd31_60'
  if (d <= 90) return 'd61_90'
  return 'd90_plus'
}

export function resolveTipsEnabled(
  invoiceTipsEnabled: boolean | undefined,
  orgTipsEnabled: boolean | undefined,
): boolean {
  return invoiceTipsEnabled ?? orgTipsEnabled ?? false
}
```

- [ ] **Step 5: Run to verify green**

Run: `npx vitest run __tests__/lib/invoice-status.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/invoice-status.ts __tests__/lib/invoice-status.test.ts
git commit -m "feat(invoicing): split-status enums, derived payment/aging states, tip resolution

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Progress-billing engine

**Files:**
- Create: `lib/invoice-progress.ts`
- Test: `__tests__/lib/invoice-progress.test.ts`

**Interfaces:**
- Consumes: `InvoiceLifecycle` (Task 2), `InvoiceLineItem` + `invoiceTotal` (existing).
- Produces:
  - `class InvoiceScopeError extends Error`
  - `previouslyBilled(invoices: ReadonlyArray<{ lifecycle: InvoiceLifecycle; source?: { id?: string }; line_items: InvoiceLineItem[] }>, sourceId: string): number`
  - `remainingToBill(approved: number, billed: number): number`
  - `assertWithinScope(newTotal: number, billed: number, approved: number): void`

- [ ] **Step 1: Write the failing test** `__tests__/lib/invoice-progress.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { previouslyBilled, remainingToBill, assertWithinScope, InvoiceScopeError } from '@/lib/invoice-progress'
import type { InvoiceLineItem } from '@/lib/types'

const line = (n: number): InvoiceLineItem[] => [{ description: 'x', quantity: 1, unit_price: n }]

describe('previouslyBilled', () => {
  it('sums issued, non-void invoices matching the source id only', () => {
    const invs = [
      { lifecycle: 'issued' as const, source: { id: 'p1' }, line_items: line(300) },
      { lifecycle: 'issued' as const, source: { id: 'p1' }, line_items: line(200) },
      { lifecycle: 'draft' as const, source: { id: 'p1' }, line_items: line(999) },   // not issued
      { lifecycle: 'voided' as const, source: { id: 'p1' }, line_items: line(999) },  // voided
      { lifecycle: 'issued' as const, source: { id: 'other' }, line_items: line(999) }, // other source
    ]
    expect(previouslyBilled(invs, 'p1')).toBe(500)
  })
})

describe('remainingToBill', () => {
  it('approved minus billed', () => {
    expect(remainingToBill(1000, 500)).toBe(500)
    expect(remainingToBill(1000, 1000)).toBe(0)
  })
})

describe('assertWithinScope', () => {
  it('passes when new + billed <= approved', () => {
    expect(() => assertWithinScope(500, 500, 1000)).not.toThrow()
  })
  it('throws InvoiceScopeError with the overage amount', () => {
    expect(() => assertWithinScope(600, 500, 1000)).toThrow(InvoiceScopeError)
    expect(() => assertWithinScope(600, 500, 1000)).toThrow(/exceeds approved scope by \$100\.00/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/invoice-progress.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/invoice-progress.ts`:**

```ts
import type { InvoiceLifecycle, InvoiceLineItem } from '@/lib/types'
import { invoiceTotal } from '@/lib/invoices'

export class InvoiceScopeError extends Error {
  constructor(message: string) { super(message); this.name = 'InvoiceScopeError' }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }

export function previouslyBilled(
  invoices: ReadonlyArray<{ lifecycle: InvoiceLifecycle; source?: { id?: string }; line_items: InvoiceLineItem[] }>,
  sourceId: string,
): number {
  return round2(
    invoices
      .filter((i) => i.lifecycle === 'issued' && i.source?.id === sourceId)
      .reduce((sum, i) => sum + invoiceTotal(i.line_items), 0),
  )
}

export function remainingToBill(approved: number, billed: number): number {
  return round2(approved - billed)
}

export function assertWithinScope(newTotal: number, billed: number, approved: number): void {
  const overage = round2(newTotal + billed - approved)
  if (overage > 0) {
    throw new InvoiceScopeError(`Invoice exceeds approved scope by $${overage.toFixed(2)}`)
  }
}
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run __tests__/lib/invoice-progress.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/invoice-progress.ts __tests__/lib/invoice-progress.test.ts
git commit -m "feat(invoicing): progress-billing engine with scope guardrail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Immutability lock

**Files:**
- Create: `lib/invoice-lock.ts`
- Test: `__tests__/lib/invoice-lock.test.ts`

**Interfaces:**
- Consumes: `InvoiceLifecycle` (Task 2).
- Produces:
  - `LOCKED_LIFECYCLES: InvoiceLifecycle[]`
  - `FINANCIAL_FIELDS: string[]` (`['line_items','type','source','due_date','number']`)
  - `class InvoiceLockedError extends Error`
  - `assertEditable(lifecycle: InvoiceLifecycle, updateKeys: string[]): void`

- [ ] **Step 1: Write the failing test** `__tests__/lib/invoice-lock.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { assertEditable, InvoiceLockedError, LOCKED_LIFECYCLES } from '@/lib/invoice-lock'

describe('assertEditable', () => {
  it('allows any edit on draft/approved', () => {
    expect(() => assertEditable('draft', ['line_items', 'due_date'])).not.toThrow()
    expect(() => assertEditable('approved', ['type'])).not.toThrow()
  })
  it('allows editing notes even when locked', () => {
    expect(() => assertEditable('issued', ['notes'])).not.toThrow()
  })
  it('throws when a financial field is edited on a locked invoice', () => {
    for (const l of LOCKED_LIFECYCLES) {
      expect(() => assertEditable(l, ['line_items'])).toThrow(InvoiceLockedError)
    }
    expect(() => assertEditable('issued', ['notes', 'due_date'])).toThrow(/locked/i)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/invoice-lock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/invoice-lock.ts`:**

```ts
import type { InvoiceLifecycle } from '@/lib/types'

export const LOCKED_LIFECYCLES: InvoiceLifecycle[] = ['issued', 'voided', 'replaced', 'closed']
export const FINANCIAL_FIELDS = ['line_items', 'type', 'source', 'due_date', 'number']

export class InvoiceLockedError extends Error {
  constructor(message: string) { super(message); this.name = 'InvoiceLockedError' }
}

export function assertEditable(lifecycle: InvoiceLifecycle, updateKeys: string[]): void {
  if (!LOCKED_LIFECYCLES.includes(lifecycle)) return
  const blocked = updateKeys.filter((k) => FINANCIAL_FIELDS.includes(k))
  if (blocked.length > 0) {
    throw new InvoiceLockedError(
      `Invoice is ${lifecycle} and locked; cannot edit ${blocked.join(', ')}. Void or replace instead.`,
    )
  }
}
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run __tests__/lib/invoice-lock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/invoice-lock.ts __tests__/lib/invoice-lock.test.ts
git commit -m "feat(invoicing): issued-invoice immutability guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Invoice/line/org type cutover + normalize + numbering

**Files:**
- Modify: `lib/types.ts` (add `InvoiceSourceRef`, `InvoiceSourceType`; extend `InvoiceLineItem`, `Invoice`, `Org`; add `NormalizedInvoice`)
- Create: `lib/invoice-normalize.ts`
- Test: `__tests__/lib/invoice-normalize.test.ts`

**Interfaces:**
- Consumes: all enums (Task 2), money helpers (Task 1).
- Produces:
  - `InvoiceSourceType`, `InvoiceSourceRef`
  - Extended `InvoiceLineItem` (`source?`), `Invoice` (split-status fields, all new fields optional; `status?` kept legacy), `Org` (`tips_enabled?`)
  - `NormalizedInvoice = Invoice & { lifecycle: InvoiceLifecycle; type: InvoiceType; delivery: InvoiceDeliveryStatus; accounting: InvoiceAccountingStatus; dispute: InvoiceDisputeStatus }`
  - `normalizeInvoice(data: FirebaseFirestore.DocumentData): NormalizedInvoice`
  - `formatInvoiceNumber(seq: number, prefix?: string): string`

- [ ] **Step 1: Extend the types in `lib/types.ts`.** Add source types:

```ts
export type InvoiceSourceType =
  | 'proposal' | 'change_order' | 'job' | 'milestone'
  | 'time' | 'expense' | 'recurring' | 'manual'

export interface InvoiceSourceRef {
  type: InvoiceSourceType
  id?: string      // e.g. accepted proposal id
  label?: string   // human ref, e.g. "Accepted proposal"
}
```

Extend `InvoiceLineItem` with `source?: InvoiceSourceRef`. Replace the `Invoice` interface body with (keep `status?` for now, remove in Task 11):

```ts
export interface Invoice {
  id: string
  org_id: string
  lead_id: string
  customer_id?: string          // CRM seam — populated when Customer ships
  token: string
  schema_version?: number       // absent/legacy => v1; new invoices => 2

  type?: InvoiceType
  lifecycle?: InvoiceLifecycle
  delivery?: InvoiceDeliveryStatus
  accounting?: InvoiceAccountingStatus
  dispute?: InvoiceDisputeStatus
  status?: InvoiceStatus         // DEPRECATED legacy field — removed in a later task

  source?: InvoiceSourceRef
  number?: string
  title?: string
  line_items: InvoiceLineItem[]
  payments: InvoicePayment[]
  notes?: string
  due_date?: string
  tips_enabled?: boolean

  payment_status?: InvoicePaymentStatus  // materialized cache for future indexed views

  replaces_id?: string
  replaced_by_id?: string
  issued_at?: string
  created_at: string
  updated_at?: string
}

export type NormalizedInvoice = Invoice & {
  type: InvoiceType
  lifecycle: InvoiceLifecycle
  delivery: InvoiceDeliveryStatus
  accounting: InvoiceAccountingStatus
  dispute: InvoiceDisputeStatus
}
```

Add `tips_enabled?: boolean` to the `Org` interface.

- [ ] **Step 2: Write the failing test** `__tests__/lib/invoice-normalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeInvoice, formatInvoiceNumber } from '@/lib/invoice-normalize'

const base = {
  id: 'i1', org_id: 'o1', lead_id: 'l1', token: 't', line_items: [], payments: [], created_at: '2026-01-01',
}

describe('normalizeInvoice legacy status mapping', () => {
  it('maps draft -> draft', () => {
    expect(normalizeInvoice({ ...base, status: 'draft' }).lifecycle).toBe('draft')
  })
  it('maps sent/partial/paid -> issued', () => {
    expect(normalizeInvoice({ ...base, status: 'sent' }).lifecycle).toBe('issued')
    expect(normalizeInvoice({ ...base, status: 'partial' }).lifecycle).toBe('issued')
    expect(normalizeInvoice({ ...base, status: 'paid' }).lifecycle).toBe('issued')
  })
  it('maps void -> voided', () => {
    expect(normalizeInvoice({ ...base, status: 'void' }).lifecycle).toBe('voided')
  })
  it('fills defaults for type/delivery/accounting/dispute when absent', () => {
    const n = normalizeInvoice({ ...base, status: 'draft' })
    expect(n.type).toBe('quick')
    expect(n.delivery).toBe('not_sent')
    expect(n.accounting).toBe('not_connected')
    expect(n.dispute).toBe('none')
  })
  it('prefers new lifecycle when already present (v2 doc)', () => {
    const n = normalizeInvoice({ ...base, lifecycle: 'approved', type: 'deposit' })
    expect(n.lifecycle).toBe('approved')
    expect(n.type).toBe('deposit')
  })
  it('does not mutate the input', () => {
    const raw = { ...base, status: 'sent' as const }
    normalizeInvoice(raw)
    expect(raw).not.toHaveProperty('lifecycle')
  })
})

describe('formatInvoiceNumber', () => {
  it('prefixes when given, plain sequence otherwise', () => {
    expect(formatInvoiceNumber(1001)).toBe('1001')
    expect(formatInvoiceNumber(1001, 'INV-')).toBe('INV-1001')
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run __tests__/lib/invoice-normalize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Create `lib/invoice-normalize.ts`:**

```ts
import type { DocumentData } from 'firebase-admin/firestore'
import type { Invoice, InvoiceLifecycle, NormalizedInvoice } from '@/lib/types'

const LEGACY_LIFECYCLE: Record<string, InvoiceLifecycle> = {
  draft: 'draft', sent: 'issued', partial: 'issued', paid: 'issued', void: 'voided',
}

export function normalizeInvoice(data: DocumentData): NormalizedInvoice {
  const inv = data as Invoice
  const lifecycle: InvoiceLifecycle =
    inv.lifecycle ?? (inv.status ? LEGACY_LIFECYCLE[inv.status] ?? 'draft' : 'draft')
  return {
    ...inv,
    type: inv.type ?? 'quick',
    lifecycle,
    delivery: inv.delivery ?? 'not_sent',
    accounting: inv.accounting ?? 'not_connected',
    dispute: inv.dispute ?? 'none',
  }
}

export function formatInvoiceNumber(seq: number, prefix?: string): string {
  return `${prefix ?? ''}${seq}`
}
```

- [ ] **Step 5: Run to verify green (and typecheck)**

Run: `npx vitest run __tests__/lib/invoice-normalize.test.ts && npx tsc --noEmit`
Expected: tests PASS; tsc clean (existing code still uses `status`, which remains valid since we kept it).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/invoice-normalize.ts __tests__/lib/invoice-normalize.test.ts
git commit -m "feat(invoicing): split-status Invoice model + normalizeInvoice migration shim

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: createInvoice (v2) + generateFromProposal

**Files:**
- Modify: `actions/invoices.ts` (rework `createInvoice`, add `generateFromProposal`, normalize read sites in `listInvoices`/`listAllInvoices`/`getInvoice`)
- Test: `__tests__/actions/invoices.test.ts`

**Interfaces:**
- Consumes: `normalizeInvoice` (Task 5), `previouslyBilled`/`remainingToBill`/`assertWithinScope` (Task 3), `invoiceTotal` (Task 1), `getProposal` from `@/actions/proposals` (`getProposal(orgId, proposalId): Promise<Proposal | null>`).
- Produces:
  - `createInvoice(orgId, leadId, input: CreateInvoiceInput): Promise<Invoice>` (input gains `type?: InvoiceType`)
  - `generateFromProposal(orgId: string, leadId: string, proposalId: string, opts: { type: InvoiceType }): Promise<Invoice>`
  - `listInvoices`/`listAllInvoices`/`getInvoice` now return `NormalizedInvoice`.

- [ ] **Step 1: Update the existing action test file** `__tests__/actions/invoices.test.ts`. The current `createInvoice` test asserts `status: 'draft'`; change that expectation to `lifecycle: 'draft'`, `type: 'quick'`, `schema_version: 2`. Add a proposals mock and a `generateFromProposal` test. Add to the `vi.mock('@/lib/firebase-admin', …)` factory a `proposals` sub-collection branch, and mock `@/actions/proposals`:

```ts
// add near the other vi.hoisted spies
const getProposalSpy = vi.hoisted(() => vi.fn())

vi.mock('@/actions/proposals', () => ({
  getProposal: getProposalSpy,
}))
```

Then the new test:

```ts
it('generateFromProposal builds a draft with proposal-sourced lines and invoice source', async () => {
  getProposalSpy.mockResolvedValue({
    id: 'p1', org_id: 'org-1', lead_id: 'lead-1', token: 'pt', status: 'accepted',
    line_items: [{ description: 'Package', quantity: 1, unit_price: 1000 }], created_at: '2026-01-01',
  })
  // no prior invoices from this source
  listInvoicesSpy.mockResolvedValue({ docs: [] })

  const inv = await generateFromProposal('org-1', 'lead-1', 'p1', { type: 'deposit' })

  expect(inv.lifecycle).toBe('draft')
  expect(inv.type).toBe('deposit')
  expect(inv.source).toEqual({ type: 'proposal', id: 'p1', label: 'Accepted proposal' })
  expect(inv.line_items[0].source).toEqual({ type: 'proposal', id: 'p1' })
  expect(inv.schema_version).toBe(2)
})

it('generateFromProposal rejects a non-accepted proposal', async () => {
  getProposalSpy.mockResolvedValue({ id: 'p1', status: 'sent', line_items: [] })
  await expect(generateFromProposal('org-1', 'lead-1', 'p1', { type: 'deposit' }))
    .rejects.toThrow(/not accepted/i)
})
```

(Adjust `listInvoicesSpy` to whatever the file already names the `where(...).orderBy(...).get()` spy; reuse it so `generateFromProposal`'s scope lookup resolves.)

- [ ] **Step 2: Run to verify the new/changed tests fail**

Run: `npx vitest run __tests__/actions/invoices.test.ts`
Expected: FAIL — `generateFromProposal` undefined and `createInvoice` still writes `status`.

- [ ] **Step 3: Rework `createInvoice` and read sites, add `generateFromProposal`** in `actions/invoices.ts`. Update imports:

```ts
import { normalizeInvoice } from '@/lib/invoice-normalize'
import { invoiceTotal } from '@/lib/invoices'
import { previouslyBilled, remainingToBill, assertWithinScope } from '@/lib/invoice-progress'
import { getProposal } from '@/actions/proposals'
import type { Invoice, InvoiceLineItem, InvoiceType, NormalizedInvoice } from '@/lib/types'
```

`CreateInvoiceInput` gains `type?: InvoiceType`. Rewrite `createInvoice` to set the split model:

```ts
export async function createInvoice(orgId: string, leadId: string, input: CreateInvoiceInput): Promise<Invoice> {
  await assertOrgAdmin(orgId)
  const id = randomBytes(8).toString('hex')
  const invoice: Invoice = {
    id, org_id: orgId, lead_id: leadId, token: generateAccessToken(),
    schema_version: 2,
    type: input.type ?? 'quick',
    lifecycle: 'draft',
    delivery: 'not_sent', accounting: 'not_connected', dispute: 'none',
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
```

Change the three read helpers to return normalized data, e.g.:

```ts
export async function listInvoices(orgId: string, leadId: string): Promise<NormalizedInvoice[]> {
  await assertOrgMember(orgId)
  const snap = await invoicesRef(orgId).where('lead_id', '==', leadId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => normalizeInvoice(d.data()))
}
```

(Apply the same `normalizeInvoice(d.data())` change to `listAllInvoices` and `getInvoice`; `getInvoice` returns `NormalizedInvoice | null`.)

Add `generateFromProposal`:

```ts
export async function generateFromProposal(
  orgId: string, leadId: string, proposalId: string, opts: { type: InvoiceType },
): Promise<Invoice> {
  await assertOrgAdmin(orgId)
  const proposal = await getProposal(orgId, proposalId)
  if (!proposal) throw new Error('Proposal not found')
  if (proposal.status !== 'accepted') throw new Error('Proposal is not accepted')

  const approved = invoiceTotal(proposal.line_items)
  const existing = await listInvoices(orgId, leadId)
  const billed = previouslyBilled(existing, proposalId)

  const source = { type: 'proposal' as const, id: proposalId, label: 'Accepted proposal' }
  let line_items: InvoiceLineItem[]
  if (opts.type === 'final') {
    line_items = [{ description: 'Final balance', quantity: 1, unit_price: remainingToBill(approved, billed), source }]
  } else {
    line_items = proposal.line_items.map((l) => ({ ...l, source }))
  }

  if (opts.type !== 'quick') {
    assertWithinScope(invoiceTotal(line_items), billed, approved)
  }

  const invoice = await createInvoice(orgId, leadId, { type: opts.type, line_items })
  await invoicesRef(orgId).doc(invoice.id).update({ source })
  return { ...invoice, source }
}
```

- [ ] **Step 4: Run the action tests to verify green**

Run: `npx vitest run __tests__/actions/invoices.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Components still read `invoice.status`/`invoice.payments` — `status?` remains valid; normalized reads also carry `status`.)

- [ ] **Step 6: Commit**

```bash
git add actions/invoices.ts __tests__/actions/invoices.test.ts
git commit -m "feat(invoicing): create invoices in split model; generate drafts from accepted proposals

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Lifecycle actions — approve, issue (numbered, transactional), void, replace

**Files:**
- Modify: `actions/invoices.ts` (add `approveInvoice`, `issueInvoice`, `voidInvoice`, `replaceInvoice`; remove old `sendInvoice`)
- Modify: `components/admin/InvoiceEditorClient.tsx` (only the import of `sendInvoice` → temporary no-op wiring is handled in Task 10; for now update the import to `issueInvoice` to keep tsc green — see Step 5)
- Test: `__tests__/actions/invoices.test.ts`

**Interfaces:**
- Consumes: `formatInvoiceNumber` (Task 5), `assertWithinScope`/`previouslyBilled` (Task 3), `invoiceTotal` (Task 1), `FieldValue` from `firebase-admin/firestore`.
- Produces:
  - `approveInvoice(orgId: string, invoiceId: string): Promise<void>`
  - `issueInvoice(orgId: string, invoiceId: string): Promise<{ number: string }>`
  - `voidInvoice(orgId: string, invoiceId: string, reason?: string): Promise<void>`
  - `replaceInvoice(orgId: string, invoiceId: string): Promise<Invoice>`

- [ ] **Step 1: Write the failing tests** in `__tests__/actions/invoices.test.ts`. Mock `adminDb.runTransaction` and a counter doc. Add to the `firebase-admin` mock factory a `counters` sub-collection and a `runTransaction` implementation:

```ts
// inside vi.mock('@/lib/firebase-admin', ...), add spies:
const counterGetSpy = vi.hoisted(() => vi.fn())
const txSetSpy = vi.hoisted(() => vi.fn())
const txUpdateSpy = vi.hoisted(() => vi.fn())
// counters collection under orgDoc.collection('counters').doc('invoice_number')
// runTransaction: adminDb.runTransaction(async (tx) => cb({ get: ..., set: txSetSpy, update: txUpdateSpy }))
```

Tests:

```ts
it('issueInvoice assigns the next sequential number and locks the invoice', async () => {
  // draft invoice with a $500 line
  invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({
    id: 'inv-1', org_id: 'org-1', lead_id: 'lead-1', token: 't', lifecycle: 'draft', type: 'quick',
    line_items: [{ description: 'x', quantity: 1, unit_price: 500 }], payments: [], created_at: '2026-01-01',
  }) })
  counterGetSpy.mockResolvedValue({ exists: true, data: () => ({ seq: 1000, prefix: 'INV-' }) })

  const res = await issueInvoice('org-1', 'inv-1')

  expect(res.number).toBe('INV-1001')
  expect(txUpdateSpy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ seq: 1001 }))
  expect(txSetSpy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    lifecycle: 'issued', number: 'INV-1001',
  }), { merge: true })
})

it('voidInvoice sets lifecycle voided and keeps the number', async () => {
  invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({
    id: 'inv-1', lifecycle: 'issued', number: 'INV-1001', line_items: [], payments: [], created_at: '',
  }) })
  await voidInvoice('org-1', 'inv-1', 'duplicate')
  expect(invoiceDocUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'voided' }))
})

it('approveInvoice moves draft to approved', async () => {
  invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'inv-1', lifecycle: 'draft', line_items: [], payments: [], created_at: '' }) })
  await approveInvoice('org-1', 'inv-1')
  expect(invoiceDocUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'approved' }))
})
```

(Use whatever the file already names the invoice-doc `get`/`update` spies — shown here as `invoiceDocGetSpy`/`invoiceDocUpdateSpy`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/actions/invoices.test.ts`
Expected: FAIL — new functions undefined.

- [ ] **Step 3: Implement the lifecycle actions** in `actions/invoices.ts`. Add imports:

```ts
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'   // already imported
import { formatInvoiceNumber } from '@/lib/invoice-normalize'
```

```ts
export async function approveInvoice(orgId: string, invoiceId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const inv = normalizeInvoice(snap.data()!)
  if (inv.lifecycle !== 'draft') throw new Error('Only a draft can be approved')
  await ref.update({ lifecycle: 'approved', updated_at: new Date().toISOString() })
}

export async function issueInvoice(orgId: string, invoiceId: string): Promise<{ number: string }> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const counterRef = adminDb.collection('orgs').doc(orgId).collection('counters').doc('invoice_number')

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('Invoice not found')
    const inv = normalizeInvoice(snap.data()!)
    if (inv.lifecycle !== 'draft' && inv.lifecycle !== 'approved') {
      throw new Error(`Cannot issue an invoice that is ${inv.lifecycle}`)
    }
    const counterSnap = await tx.get(counterRef)
    const seq = (counterSnap.exists ? (counterSnap.data()!.seq as number) : 1000) + 1
    const prefix = counterSnap.exists ? (counterSnap.data()!.prefix as string | undefined) : undefined
    const number = formatInvoiceNumber(seq, prefix)
    const now = new Date().toISOString()

    tx.update(counterRef, { seq })
    tx.set(ref, { lifecycle: 'issued', number, issued_at: now, updated_at: now }, { merge: true })
    return { number }
  })
}

export async function voidInvoice(orgId: string, invoiceId: string, reason?: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const now = new Date().toISOString()
  await ref.update({
    lifecycle: 'voided', updated_at: now,
    ...(reason?.trim() ? { void_reason: reason.trim() } : {}),
  })
}

export async function replaceInvoice(orgId: string, invoiceId: string): Promise<Invoice> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const original = normalizeInvoice(snap.data()!)
  const draft = await createInvoice(orgId, original.lead_id, {
    type: original.type,
    line_items: original.line_items,
    title: original.title,
    due_date: original.due_date,
    notes: original.notes,
  })
  const now = new Date().toISOString()
  await invoicesRef(orgId).doc(draft.id).update({ replaces_id: invoiceId, ...(original.source ? { source: original.source } : {}) })
  await ref.update({ lifecycle: 'replaced', replaced_by_id: draft.id, updated_at: now })
  return { ...draft, replaces_id: invoiceId }
}
```

Delete the old `sendInvoice` function. Add `void_reason?: string` to the `Invoice` interface in `lib/types.ts` (single field, invoice-only).

- [ ] **Step 4: Run the action tests to verify green**

Run: `npx vitest run __tests__/actions/invoices.test.ts`
Expected: PASS. (Update the existing `sendInvoice` test to call `issueInvoice` or remove it.)

- [ ] **Step 5: Keep the tree compiling** — `InvoiceEditorClient.tsx` imports `sendInvoice`. Update that import line to `issueInvoice` and its single call site `await sendInvoice(...)` → `await issueInvoice(...)` (full editor rewiring happens in Task 10; this is the minimal change to keep tsc green now).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add actions/invoices.ts lib/types.ts components/admin/InvoiceEditorClient.tsx __tests__/actions/invoices.test.ts
git commit -m "feat(invoicing): approve/issue/void/replace with transactional numbering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Editable guard on update, tips on payment, delete guard

**Files:**
- Modify: `actions/invoices.ts` (`updateInvoice`, `recordPayment`, `deleteInvoice`)
- Test: `__tests__/actions/invoices.test.ts`

**Interfaces:**
- Consumes: `assertEditable` (Task 4), `derivePaymentStatus` (Task 2), `invoiceTotal`/`amountPaid` (Task 1), `normalizeInvoice` (Task 5).
- Produces: `RecordPaymentInput` gains `tip_amount?: number`; `updateInvoice`/`deleteInvoice` enforce the lock.

- [ ] **Step 1: Write the failing tests** in `__tests__/actions/invoices.test.ts`:

```ts
it('updateInvoice rejects financial edits on an issued invoice', async () => {
  invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'inv-1', lifecycle: 'issued', line_items: [], payments: [], created_at: '' }) })
  await expect(updateInvoice('org-1', 'inv-1', { line_items: [] })).rejects.toThrow(/locked/i)
  expect(invoiceDocUpdateSpy).not.toHaveBeenCalled()
})

it('updateInvoice allows editing notes on an issued invoice', async () => {
  invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'inv-1', lifecycle: 'issued', line_items: [], payments: [], created_at: '' }) })
  await updateInvoice('org-1', 'inv-1', { notes: 'call before delivery' })
  expect(invoiceDocUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ notes: 'call before delivery' }))
})

it('recordPayment stores tip_amount separately and recomputes payment_status', async () => {
  invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({
    id: 'inv-1', lifecycle: 'issued', line_items: [{ description: 'x', quantity: 1, unit_price: 100 }], payments: [], created_at: '',
  }) })
  await recordPayment('org-1', 'inv-1', { amount: 100, tip_amount: 20 })
  const arg = invoiceDocUpdateSpy.mock.calls.at(-1)![0]
  expect(arg.payments[0]).toEqual(expect.objectContaining({ amount: 100, tip_amount: 20 }))
  expect(arg.payment_status).toBe('paid')  // tip does not overpay
})

it('deleteInvoice refuses to delete an issued invoice', async () => {
  invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'inv-1', lifecycle: 'issued', line_items: [], payments: [], created_at: '' }) })
  await expect(deleteInvoice('org-1', 'inv-1')).rejects.toThrow(/cannot delete/i)
})
```

(Update the two existing `recordPayment` tests that assert `status: 'partial'|'paid'` to assert `payment_status` and `lifecycle` unchanged instead.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/actions/invoices.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update the three actions** in `actions/invoices.ts`. Add imports:

```ts
import { assertEditable } from '@/lib/invoice-lock'
import { derivePaymentStatus } from '@/lib/invoice-status'
import { amountPaid, invoiceTotal } from '@/lib/invoices'
```

`updateInvoice` — read, guard, then update (drop the old `INVOICE_STATUSES`/`status` validation):

```ts
export async function updateInvoice(orgId: string, invoiceId: string, updates: InvoiceUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const inv = normalizeInvoice(snap.data()!)
  assertEditable(inv.lifecycle, Object.keys(updates))
  await ref.update({ ...updates, updated_at: new Date().toISOString() })
}
```

`InvoiceUpdate` loses `status`; it may keep `type?`, `title?`, `number?`, `notes?`, `due_date?`, `line_items?`.

`recordPayment` — accept `tip_amount`, recompute `payment_status`:

```ts
export interface RecordPaymentInput { amount: number; method?: string; note?: string; tip_amount?: number }

export async function recordPayment(orgId: string, invoiceId: string, input: RecordPaymentInput): Promise<void> {
  await assertOrgAdmin(orgId)
  if (!(input.amount > 0)) throw new Error('Payment amount must be positive')
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Invoice not found')
  const inv = normalizeInvoice(snap.data()!)
  if (inv.lifecycle === 'voided' || inv.lifecycle === 'replaced') throw new Error('Cannot record payment on a voided invoice')

  const now = new Date().toISOString()
  const payment: InvoicePayment = {
    amount: input.amount, recorded_at: now,
    ...(input.method?.trim() ? { method: input.method.trim() } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...((input.tip_amount ?? 0) > 0 ? { tip_amount: input.tip_amount } : {}),
  }
  const payments = [...(inv.payments ?? []), payment]
  const total = invoiceTotal(inv.line_items ?? [])
  const applied = amountPaid(payments)
  const payment_status = derivePaymentStatus({ total, applied, lifecycle: inv.lifecycle, dueDate: inv.due_date }, new Date())
  await ref.update({ payments, payment_status, updated_at: now })
}
```

`deleteInvoice` — guard:

```ts
export async function deleteInvoice(orgId: string, invoiceId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = invoicesRef(orgId).doc(invoiceId)
  const snap = await ref.get()
  if (!snap.exists) return
  const inv = normalizeInvoice(snap.data()!)
  if (inv.lifecycle !== 'draft' && inv.lifecycle !== 'approved') {
    throw new Error('Cannot delete an issued invoice — void it instead')
  }
  await ref.delete()
}
```

Remove the now-unused `INVOICE_STATUSES` import if present.

- [ ] **Step 4: Run the action tests + typecheck**

Run: `npx vitest run __tests__/actions/invoices.test.ts && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add actions/invoices.ts __tests__/actions/invoices.test.ts
git commit -m "feat(invoicing): enforce lock on edit/delete; record tips; derive payment_status

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Public projection updates

**Files:**
- Modify: `actions/invoices-public.ts`
- Test: `__tests__/actions/invoices-public.test.ts`

**Interfaces:**
- Consumes: `normalizeInvoice` (Task 5), `amountPaid`/`invoiceBalance` (Task 1), `resolveTipsEnabled` (Task 2).
- Produces: `PublicInvoice` gains `type: InvoiceType` and `tips_enabled: boolean`; only `lifecycle === 'issued'` is exposed.

- [ ] **Step 1: Update/extend the test** `__tests__/actions/invoices-public.test.ts`:

```ts
it('exposes an issued invoice with type and resolved tips flag, hides drafts', async () => {
  // issued (legacy 'sent') doc
  findSpy.mockResolvedValue({ empty: false, docs: [{ data: () => ({
    id: 'i1', org_id: 'o1', lead_id: 'l1', token: 't', status: 'sent', type: 'deposit',
    line_items: [{ description: 'x', quantity: 1, unit_price: 100 }], payments: [], created_at: '', tips_enabled: true,
  }) }] })
  const pub = await getPublicInvoice('t')
  expect(pub).not.toBeNull()
  expect(pub!.type).toBe('deposit')
  expect(pub!.tips_enabled).toBe(true)
  expect(pub!.balance).toBe(100)
})

it('returns null for a draft', async () => {
  findSpy.mockResolvedValue({ empty: false, docs: [{ data: () => ({ id: 'i1', lifecycle: 'draft', line_items: [], payments: [], created_at: '' }) }] })
  expect(await getPublicInvoice('t')).toBeNull()
})
```

(Use the file's existing collectionGroup query spy name in place of `findSpy`. `resolveTipsEnabled` here receives `undefined` for the org default since the public projection doesn't load the org; pass `undefined` as the second arg — the invoice value governs.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/actions/invoices-public.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `actions/invoices-public.ts`:**

```ts
import { amountPaid, invoiceBalance } from '@/lib/invoices'
import { normalizeInvoice } from '@/lib/invoice-normalize'
import { resolveTipsEnabled } from '@/lib/invoice-status'
import type { InvoiceLineItem, InvoiceType } from '@/lib/types'

export interface PublicInvoice {
  title?: string
  number?: string
  type: InvoiceType
  line_items: InvoiceLineItem[]
  amount_paid: number
  balance: number
  tips_enabled: boolean
  notes?: string
  due_date?: string
  created_at: string
}

export async function getPublicInvoice(token: string): Promise<PublicInvoice | null> {
  const doc = await findInvoiceByToken(token)
  if (!doc) return null
  const invoice = normalizeInvoice(doc.data())
  if (invoice.lifecycle !== 'issued') return null
  const publicInvoice: PublicInvoice = {
    type: invoice.type,
    line_items: invoice.line_items,
    amount_paid: amountPaid(invoice.payments ?? []),
    balance: invoiceBalance(invoice),
    tips_enabled: resolveTipsEnabled(invoice.tips_enabled, undefined),
    created_at: invoice.created_at,
  }
  if (invoice.title !== undefined) publicInvoice.title = invoice.title
  if (invoice.number !== undefined) publicInvoice.number = invoice.number
  if (invoice.notes !== undefined) publicInvoice.notes = invoice.notes
  if (invoice.due_date !== undefined) publicInvoice.due_date = invoice.due_date
  return publicInvoice
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run __tests__/actions/invoices-public.test.ts && npx tsc --noEmit`
Expected: PASS + clean. (`InvoiceViewClient` reads `PublicInvoice`; `status` is gone from it — Task 10 updates the component. If tsc flags `InvoiceViewClient` here, apply the minimal read change now: it currently shows `invoice.status` — replace with `invoice.type`.)

- [ ] **Step 5: Commit**

```bash
git add actions/invoices-public.ts __tests__/actions/invoices-public.test.ts components/invoices/InvoiceViewClient.tsx
git commit -m "feat(invoicing): public projection exposes type + resolved tips, only issued visible

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Editor + public view UI

**Files:**
- Modify: `components/admin/InvoiceEditorClient.tsx`
- Modify: `components/invoices/InvoiceViewClient.tsx`
- Modify: `components/admin/LeadInvoicesClient.tsx` and `components/admin/AllInvoicesTable.tsx` (status badge → lifecycle/payment labels)
- Test: `__tests__/components/InvoiceEditorClient.test.tsx` (create — targeted logic only)

**Interfaces:**
- Consumes: `INVOICE_LIFECYCLE_LABELS`, `resolveTipsEnabled` (Task 2); `issueInvoice`/`voidInvoice`/`replaceInvoice`/`approveInvoice`/`generateFromProposal` (Tasks 6–7); `NormalizedInvoice` (Task 5).
- Produces: no new exports (UI only).

- [ ] **Step 1: Write a targeted failing test** `__tests__/components/InvoiceEditorClient.test.tsx` covering the two logic-bearing behaviors — tips field visibility and locked read-only. Mirror any existing component test's render setup (check `__tests__/components/` for a pattern; if none exists, use `@testing-library/react`'s `render` + `screen`). Mock `@/actions/invoices` and `next/navigation`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InvoiceEditorClient } from '@/components/admin/InvoiceEditorClient'
import type { NormalizedInvoice } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/actions/invoices', () => ({
  updateInvoice: vi.fn(), issueInvoice: vi.fn(), voidInvoice: vi.fn(),
  replaceInvoice: vi.fn(), approveInvoice: vi.fn(), recordPayment: vi.fn(), deleteInvoice: vi.fn(),
}))

const inv = (o: Partial<NormalizedInvoice>): NormalizedInvoice => ({
  id: 'i', org_id: 'o', lead_id: 'l', token: 't', type: 'quick', lifecycle: 'draft',
  delivery: 'not_sent', accounting: 'not_connected', dispute: 'none',
  line_items: [], payments: [], created_at: '', ...o,
})

describe('InvoiceEditorClient', () => {
  it('shows the tip field when tips resolve to enabled', () => {
    render(<InvoiceEditorClient orgId="o" orgSlug="s" leadId="l" orgTipsEnabled invoice={inv({ tips_enabled: true })} />)
    expect(screen.getByLabelText(/tip/i)).toBeInTheDocument()
  })
  it('hides the tip field when tips resolve to off (per-invoice override)', () => {
    render(<InvoiceEditorClient orgId="o" orgSlug="s" leadId="l" orgTipsEnabled invoice={inv({ tips_enabled: false })} />)
    expect(screen.queryByLabelText(/tip/i)).not.toBeInTheDocument()
  })
  it('renders line-item fields read-only once issued', () => {
    render(<InvoiceEditorClient orgId="o" orgSlug="s" leadId="l" invoice={inv({ lifecycle: 'issued', line_items: [{ description: 'x', quantity: 1, unit_price: 10 }] })} />)
    expect((screen.getByDisplayValue('x') as HTMLInputElement).readOnly).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/components/InvoiceEditorClient.test.tsx`
Expected: FAIL — new prop `orgTipsEnabled` and behaviors not implemented.

- [ ] **Step 3: Rewire `InvoiceEditorClient.tsx`.** Concretely:
  - Change the prop type: `invoice: NormalizedInvoice`; add `orgTipsEnabled?: boolean`.
  - Replace status `Badge` text with `INVOICE_LIFECYCLE_LABELS[invoice.lifecycle]`.
  - Import actions `issueInvoice, voidInvoice, replaceInvoice, approveInvoice` (replace `sendInvoice`). Buttons: **Approve** (draft→approved), **Issue** (draft/approved), **Void** + **Replace** (issued). Wire each to its action with the existing busy/error pattern.
  - Compute `const tipsOn = resolveTipsEnabled(invoice.tips_enabled, orgTipsEnabled)`; render the manual tip `Input` (label "Tip") inside the payment form only when `tipsOn`. Pass `tip_amount` to `recordPayment`.
  - Compute `const locked = LOCKED_LIFECYCLES.includes(invoice.lifecycle)` (import from `@/lib/invoice-lock`); set `readOnly={locked}` on the line-item description/qty/price `Input`s and disable Add/Remove/Save when `locked`.
  - When `invoice.source` exists, render a small badge per line ("Accepted proposal") and a progress summary block (approved / billed / remaining) if the page passes those in; if not available client-side, omit the summary (server can add later) — do NOT fabricate numbers.
  - Update the page that renders this component (`app/(admin)/[orgSlug]/leads/[leadId]/invoices/[invoiceId]/page.tsx`) to pass `orgTipsEnabled={org.tips_enabled}` and the normalized invoice.

- [ ] **Step 4: Update the list/badge components + public view.** In `LeadInvoicesClient.tsx` and `AllInvoicesTable.tsx`, replace any `INVOICE_STATUS_LABELS[invoice.status]` with `INVOICE_LIFECYCLE_LABELS[normalizeInvoice(...).lifecycle]` (these already receive `NormalizedInvoice` from the actions in Task 6). In `InvoiceViewClient.tsx`, show `invoice.type` and balance (already adjusted in Task 9 Step 4 if needed).

- [ ] **Step 5: Run component test + full typecheck + full suite**

Run: `npx vitest run __tests__/components/InvoiceEditorClient.test.tsx && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add components/admin/InvoiceEditorClient.tsx components/invoices/InvoiceViewClient.tsx components/admin/LeadInvoicesClient.tsx components/admin/AllInvoicesTable.tsx "app/(admin)/[orgSlug]/leads/[leadId]/invoices/[invoiceId]/page.tsx" __tests__/components/InvoiceEditorClient.test.tsx
git commit -m "feat(invoicing): editor + views for lifecycle, tips, source, locked fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Remove legacy `status`, index note, full-suite gate

**Files:**
- Modify: `lib/types.ts` (remove `status?` from `Invoice`; keep the `InvoiceStatus` type export only if still referenced — otherwise remove it and its consumers), `lib/invoices.ts` (remove `INVOICE_STATUSES`, `INVOICE_STATUS_LABELS`, `paymentStatus`, and the old `INVOICE_STATUS_LABELS` import sites)
- Modify: `firestore.indexes.json` (surgical invoice index, only if a query added in Tasks 6–10 requires it)
- Test: full suite

- [ ] **Step 1: Find remaining references** to the legacy API:

Run: `git grep -nE "INVOICE_STATUSES|INVOICE_STATUS_LABELS|paymentStatus\b|\.status\b" -- 'components/**' 'actions/**' 'lib/**' 'app/**' | grep -iv lifecycle`
Expected: a short list. Each hit is either an invoice `.status` read (replace with `.lifecycle` via normalize) or an import of a removed symbol.

- [ ] **Step 2: Remove the legacy symbols.** In `lib/invoices.ts` delete `INVOICE_STATUSES`, `INVOICE_STATUS_LABELS`, and `paymentStatus` (superseded by `derivePaymentStatus`). In `lib/types.ts` remove `status?` from `Invoice`; remove the `InvoiceStatus` type if nothing references it. Update `__tests__/lib/invoices.test.ts` to drop the `INVOICE_STATUSES`/`paymentStatus` describe blocks (their behavior now lives in `invoice-status.test.ts`).

- [ ] **Step 3: Run the FULL suite + typecheck** (the real green gate):

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + all green. Fix any straggler `.status` reads by normalizing the doc and reading `.lifecycle`/`payment_status`.

- [ ] **Step 4: Firestore index check.** If `generateFromProposal`'s scope lookup or any new list query filters on `source.id`, add exactly one composite index to `firestore.indexes.json`:

```json
{ "collectionGroup": "invoices", "queryScope": "COLLECTION",
  "fields": [ { "fieldPath": "lead_id", "order": "ASCENDING" }, { "fieldPath": "source.id", "order": "ASCENDING" } ] }
```

(Only add it if a query actually requires it — `listInvoices` filters by `lead_id` and reads `source` in memory, so this may be unnecessary. Do not add speculative indexes.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(invoicing): remove legacy single-status API; final green gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Invoice types (quick/deposit/progress/final) → Tasks 2, 5, 6. ✓
- Split-status model (stored lifecycle/delivery/accounting/dispute; derived payment/aging) → Tasks 2, 5, 8. ✓
- Per-line + per-invoice source retention → Tasks 5, 6. ✓
- Generate-from-accepted-proposal → Task 6. ✓
- Progress engine (cumulative ≤ approved; deposit→final) → Tasks 3, 6. ✓
- Immutability (lock financial fields; void/replace; no delete of issued) → Tasks 4, 7, 8. ✓
- Transactional sequential numbering at issue; no reuse → Task 7. ✓
- Versioned/lazy migration via normalize (issued never rewritten) → Tasks 5, 6. ✓
- Tips: optional payment field, per-invoice+org resolution, manual entry, excluded from math → Tasks 1, 2, 8, 10. ✓
- Public projection (issued-only, type, tips) → Task 9. ✓
- Editor/view UI → Task 10. ✓
- CRM seam (`customer_id?`, `lead_id` retained) → Task 5. ✓
- Tests as green gate → every task. ✓

**Deferred (correctly out of scope, no task):** Stripe invoice payments, QBO sync, PDF, email/delivery send, reminders, smart-view/customer-balance/aging UI, taxes/discounts, change orders, recurring, credit/receipt/statement objects.

**Placeholder scan:** No TBD/TODO; all code steps have concrete code. Spy names in action tests are flagged to match the existing file's identifiers (the file already defines them; the plan says to reuse).

**Type consistency:** `NormalizedInvoice` (Task 5) is the return type of `normalizeInvoice` and the read actions (Task 6), the editor prop (Task 10). `derivePaymentStatus`/`deriveAging` signatures (Task 2) match their call sites (Tasks 8, 9). `assertEditable(lifecycle, keys)` (Task 4) matches Task 8. `generateFromProposal(orgId, leadId, proposalId, {type})` (Task 6) matches its test. `issueInvoice → { number }` (Task 7) matches its test.
