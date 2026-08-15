# Invoice Experience Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the invoice experience around a three-state lifecycle (Draft → Sent → Void), send-time auto-numbering with org settings, a document-first editor with catalog-driven line items, a document-grade public page with print support, and transactional email send.

**Architecture:** Server logic lives in `lib/crm/invoices.ts` (guard-free cores) wrapped by `actions/invoices.ts` (`'use server'`, org guards). Lifecycle collapses via read-time mapping in `normalizeInvoice` — no data rewrite. The editor (`components/admin/InvoiceEditorClient.tsx`) is rebuilt as an editable document sharing visual structure with the public page (`components/invoices/InvoiceViewClient.tsx`). Email rides the existing Resend path in `lib/email.ts`.

**Tech Stack:** Next.js App Router (READ `node_modules/next/dist/docs/` guides before writing code — this Next version has breaking changes), Firestore via firebase-admin, Resend, shadcn-style UI in `components/ui/`, lucide-react icons, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-15-invoice-experience-redesign-design.md`

## Global Constraints

- NEVER re-export a type from a `'use server'` module — it breaks `next build` (tsc passes). Declare input types locally in `actions/invoices.ts`. See AGENTS.md and the NOTE at the top of that file.
- Run vitest from the primary checkout as: `npm test -- --exclude '**/.claude/**'` (the `.claude/` tree otherwise pollutes the run).
- A branch is not green until `npx next build` passes — tsc alone is insufficient.
- Design principle (standing user feedback): pages follow human task-flow, not schema order. No stacked-card ("block") layouts; the editor and public page are document-shaped. **Any task that writes JSX must read `.claude/skills/screen-composition/SKILL.md` first and run its review checklist before marking the task done** — the principle above is the slogan; the checklist is what it means in practice.
- Firestore rejects `undefined` values (`ignoreUndefinedProperties` is off). Use `FieldValue.delete()` for cleared fields; spread-conditionals (`...(x ? { x } : {})`) for optional writes.
- Money is dollars (`number`), formatted `$${n.toFixed(2)}`.
- All commits stay in this repo (Lifewithmo/traxevent).

---

### Task 1: Lifecycle collapse — types, normalization, locks, and mechanical consumer updates

**Files:**
- Modify: `lib/types.ts:623-694` (InvoiceLifecycle, InvoiceDiscount, Invoice, new InvoiceVersion)
- Modify: `lib/invoice-normalize.ts`
- Modify: `lib/invoice-status.ts:5-14`
- Modify: `lib/invoice-lock.ts`
- Modify: `lib/crm/invoices.ts:171-198` (issueInvoiceCore → markInvoiceSentCore)
- Modify: `lib/crm/deposit-reconcile.ts:2,52,63` (renamed core import/calls)
- Modify: `actions/invoices.ts` (remove approve/replace, retarget issue/void/delete checks)
- Modify: `components/admin/InvoiceEditorClient.tsx` (mechanical: drop Approve/Replace buttons, retarget lifecycle checks — full rebuild comes in Task 6)
- Test: `__tests__/lib/invoice-normalize.test.ts` (create if absent), `__tests__/actions/invoices.test.ts`, `__tests__/components/InvoiceEditorClient.test.tsx`, `__tests__/components/LeadInvoicesClient.test.tsx`

**Interfaces:**
- Consumes: existing `normalizeInvoice(data: DocumentData): NormalizedInvoice`, `formatInvoiceNumber(seq, prefix?)`.
- Produces (later tasks rely on these exact shapes):
  - `type InvoiceLifecycle = 'draft' | 'sent' | 'void'`
  - `interface InvoiceVersion { sent_at: string; line_items: InvoiceLineItem[]; discount?: InvoiceDiscount; tax_rate?: number; credits?: InvoiceCredit[]; title?: string; notes?: string; due_date?: string }`
  - `interface InvoiceDiscount { type: 'percent' | 'fixed'; value: number; reason?: string }`
  - `Invoice` gains `sent_at?: string` and `versions?: InvoiceVersion[]`
  - `markInvoiceSentCore(orgId: string, invoiceId: string, opts?: { sentAt?: string }): Promise<{ number: string }>` in `lib/crm/invoices.ts`
  - `LOCKED_LIFECYCLES: InvoiceLifecycle[] = ['sent', 'void']` in `lib/invoice-lock.ts`

- [ ] **Step 1: Write failing normalization tests**

In `__tests__/lib/invoice-normalize.test.ts` (create; no Firestore mocks needed — `normalizeInvoice` is pure):

```ts
import { describe, it, expect } from 'vitest'
import { normalizeInvoice } from '@/lib/invoice-normalize'

const base = { id: 'i1', org_id: 'o1', lead_id: 'l1', token: 't', line_items: [], payments: [], created_at: '2026-01-01T00:00:00.000Z' }

describe('normalizeInvoice lifecycle mapping', () => {
  it.each([
    ['draft', 'draft'], ['sent', 'sent'], ['void', 'void'],          // current values pass through
    ['approved', 'draft'], ['issued', 'sent'], ['closed', 'sent'],   // retired lifecycle values
    ['voided', 'void'], ['replaced', 'void'],
  ])('maps at-rest lifecycle %s → %s', (atRest, expected) => {
    expect(normalizeInvoice({ ...base, lifecycle: atRest }).lifecycle).toBe(expected)
  })

  it.each([
    ['draft', 'draft'], ['sent', 'sent'], ['partial', 'sent'], ['paid', 'sent'], ['void', 'void'],
  ])('maps pre-lifecycle status %s → %s', (status, expected) => {
    expect(normalizeInvoice({ ...base, status }).lifecycle).toBe(expected)
  })

  it('defaults to draft when neither field exists', () => {
    expect(normalizeInvoice(base).lifecycle).toBe('draft')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/lib/invoice-normalize.test.ts`
Expected: FAIL — retired at-rest values currently pass through unchanged (`'approved'` stays `'approved'`, `'issued'` stays `'issued'`), so every `.each` case for a retired value fails.

- [ ] **Step 3: Update types**

In `lib/types.ts`:

```ts
export type InvoiceLifecycle = 'draft' | 'sent' | 'void'
```

```ts
export interface InvoiceDiscount { type: 'percent' | 'fixed'; value: number; reason?: string }
```

New interface next to `InvoiceCredit`:

```ts
// One entry per send: the content exactly as the customer received it at sent_at.
export interface InvoiceVersion {
  sent_at: string
  line_items: InvoiceLineItem[]
  discount?: InvoiceDiscount
  tax_rate?: number
  credits?: InvoiceCredit[]
  title?: string
  notes?: string
  due_date?: string
}
```

On `Invoice`, after `issued_at?: string` (kept — legacy at-rest field, no longer written):

```ts
  sent_at?: string
  versions?: InvoiceVersion[]
```

- [ ] **Step 4: Update normalization**

Replace the map in `lib/invoice-normalize.ts`:

```ts
// Maps BOTH pre-lifecycle `status` values AND retired lifecycle values
// (approved/issued/voided/replaced/closed) onto the 3-state lifecycle.
const LEGACY_LIFECYCLE: Record<string, InvoiceLifecycle> = {
  draft: 'draft', sent: 'sent', void: 'void',
  partial: 'sent', paid: 'sent',                    // pre-lifecycle status values
  approved: 'draft', issued: 'sent', closed: 'sent', // retired lifecycle values
  voided: 'void', replaced: 'void',
}
```

And in `normalizeInvoice`, both fields go through the map:

```ts
  const raw = (inv.lifecycle as string | undefined) ?? inv.status
  const lifecycle: InvoiceLifecycle = raw ? LEGACY_LIFECYCLE[raw] ?? 'draft' : 'draft'
```

- [ ] **Step 5: Update status constants and payment derivation**

In `lib/invoice-status.ts`:

```ts
export const INVOICE_LIFECYCLES: InvoiceLifecycle[] = ['draft', 'sent', 'void']

export const INVOICE_LIFECYCLE_LABELS: Record<InvoiceLifecycle, string> = {
  draft: 'Draft', sent: 'Sent', void: 'Void',
}
```

In `derivePaymentStatus`, replace `if (lifecycle === 'voided' || lifecycle === 'replaced') return 'void'` with:

```ts
  if (lifecycle === 'void') return 'void'
```

- [ ] **Step 6: Update the lock module**

`lib/invoice-lock.ts`:

```ts
export const LOCKED_LIFECYCLES: InvoiceLifecycle[] = ['sent', 'void']
```

Error message becomes: `` `Invoice is ${lifecycle} and locked; cannot edit ${blocked.join(', ')}. Use Send update to change a sent invoice.` ``

- [ ] **Step 7: Rename issueInvoiceCore → markInvoiceSentCore, write the new state**

In `lib/crm/invoices.ts`, rename and rework (keep the transaction + counter mechanics exactly):

```ts
/**
 * Guard-free send transition: assigns the next sequential invoice number, flips the
 * invoice to `lifecycle: 'sent'`, and appends a version snapshot (the content as sent).
 * Performs no auth and no scope-invariant check (callers needing the proposal-scope
 * guardrail must run it before delegating here — transactions cannot run queries).
 * `opts.sentAt` lets a caller backdate to an external event's timestamp (e.g. the
 * Stripe payment's `paid_at` in the deposit reconciler).
 */
export async function markInvoiceSentCore(
  orgId: string,
  invoiceId: string,
  opts?: { sentAt?: string },
): Promise<{ number: string }> {
  const ref = invoicesRef(orgId).doc(invoiceId)
  const counterRef = adminDb.collection('orgs').doc(orgId).collection('counters').doc('invoice_number')

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('Invoice not found')
    const inv = normalizeInvoice(snap.data()!)
    if (inv.lifecycle !== 'draft') {
      throw new Error(`Cannot send an invoice that is ${inv.lifecycle}`)
    }
    const counterSnap = await tx.get(counterRef)
    const counterData = counterSnap.exists ? (counterSnap.data() as { seq: number; prefix?: string }) : undefined
    const seq = (counterData?.seq ?? 1000) + 1
    const number = formatInvoiceNumber(seq, counterData?.prefix)
    const now = new Date().toISOString()
    const sent_at = opts?.sentAt ?? now

    tx.set(counterRef, { seq }, { merge: true })
    tx.set(ref, {
      lifecycle: 'sent', number, sent_at, updated_at: now,
      versions: [...(inv.versions ?? []), invoiceVersionSnapshot(inv, sent_at)],
    }, { merge: true })
    return { number }
  })
}

/** Content-as-sent snapshot for the versions[] history. */
export function invoiceVersionSnapshot(inv: NormalizedInvoice, sentAt: string): InvoiceVersion {
  return {
    sent_at: sentAt,
    line_items: inv.line_items,
    ...(inv.discount ? { discount: inv.discount } : {}),
    ...(inv.tax_rate != null ? { tax_rate: inv.tax_rate } : {}),
    ...(inv.credits ? { credits: inv.credits } : {}),
    ...(inv.title ? { title: inv.title } : {}),
    ...(inv.notes ? { notes: inv.notes } : {}),
    ...(inv.due_date ? { due_date: inv.due_date } : {}),
  }
}
```

Add `InvoiceVersion` to the type imports. Update `lib/crm/deposit-reconcile.ts` imports and both call sites: `markInvoiceSentCore(orgId, depositInv.id, { sentAt: payment.paid_at })` (lines 52 and 63; the option key renames `issuedAt` → `sentAt`).

- [ ] **Step 8: Mechanically update actions/invoices.ts**

- Delete `approveInvoice` (149-157) and `replaceInvoice` (203-225) entirely.
- `issueInvoice` (159-181): keep the scope pre-check block verbatim, but delegate to `markInvoiceSentCore(orgId, invoiceId)` and update the import. (This action is deleted in Task 2 when `sendInvoice` replaces it; keeping it one task keeps the editor compiling.)
- `voidInvoice` (183-201): the lifecycle guard becomes:

```ts
  if (inv.lifecycle !== 'sent') {
    if (inv.lifecycle === 'draft') throw new Error('Only a sent invoice can be voided — delete the draft instead')
    throw new Error('Invoice is already void')
  }
```

and the update writes `lifecycle: 'void'`.
- `deleteInvoice` (239-249): guard becomes `if (inv.lifecycle !== 'draft') throw new Error('Cannot delete a sent invoice — void it instead')`.

- [ ] **Step 9: Mechanically trim the editor**

In `components/admin/InvoiceEditorClient.tsx` (surgical only — Task 6 rebuilds it):
- Remove `approveInvoice, replaceInvoice` from the imports, delete `handleApprove`/`handleReplace`, the `approving`/`replacing` state, and their two buttons.
- Button conditions: Issue button shows when `invoice.lifecycle === 'draft'`; Void button when `invoice.lifecycle === 'sent'`; Delete button when `invoice.lifecycle === 'draft'`.
- `busy` drops the removed flags.

- [ ] **Step 10: Sweep remaining references**

Run: `grep -rn "'approved'\|'issued'\|'voided'\|'replaced'\|'closed'\|approveInvoice\|replaceInvoice\|issueInvoiceCore\|issuedAt" app components lib actions __tests__ --include="*.ts" --include="*.tsx" | grep -v node_modules`

Fix every hit that refers to invoice lifecycles (proposal statuses like `'accepted'` are unrelated — leave them). Expected hit sites: `components/admin/LeadInvoicesClient.tsx`, `components/admin/AllInvoicesTable.tsx` (badge/filter logic), and test files asserting old lifecycle strings. Update test expectations to the 3-state values (e.g. issue-flow tests now expect `lifecycle: 'sent'` and a `versions` array of length 1 in the transaction `tx.set` payload).

- [ ] **Step 11: Run the affected suites**

Run: `npx vitest run __tests__/lib/invoice-normalize.test.ts __tests__/actions/invoices.test.ts __tests__/actions/invoices-public.test.ts __tests__/components/InvoiceEditorClient.test.tsx __tests__/components/LeadInvoicesClient.test.tsx __tests__/actions/closeout-invoice.test.ts`
Expected: PASS. Then the full sweep: `npm test -- --exclude '**/.claude/**'` — PASS (fix any straggler suites the grep missed).

- [ ] **Step 12: Verify types compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 13: Commit**

```bash
git add -A && git commit -m "feat(invoices): collapse lifecycle to draft/sent/void with read-time legacy mapping"
```

---

### Task 2: Send — email template, sendInvoice action, delivery status

**Files:**
- Modify: `lib/email.ts` (add `sendInvoiceEmail`)
- Modify: `actions/invoices.ts` (add `sendInvoice`, delete `issueInvoice`)
- Modify: `components/admin/InvoiceEditorClient.tsx` (Issue button → temporary Send-via-prompt wiring is NOT needed: keep the existing Issue button calling `sendInvoice` with the customer email argument passed as `undefined`-safe — see Step 6)
- Test: `__tests__/actions/invoices.test.ts`, `__tests__/lib/email.test.ts`

**Interfaces:**
- Consumes: `markInvoiceSentCore`, `invoiceVersionSnapshot` (Task 1); `getResend`, `buildFromAddress` (`lib/resend.ts`); `getVerifiedSendingDomain` (`actions/domains.ts` — verify the export name with `grep -n "getVerifiedSendingDomain" actions/domains.ts` and import from wherever it actually lives; `actions/nudge.ts` shows the usage pattern); `assertOrgAdmin` returns `OrgMember` with `.email`.
- Produces:
  - `sendInvoiceEmail(params: InvoiceEmailParams): Promise<void>` in `lib/email.ts` with `interface InvoiceEmailParams { to: string; orgName: string; invoiceNumber: string; total: number; dueDate?: string; message?: string; token: string; isUpdate: boolean; fromDisplayName?: string; fromDomain?: string; replyTo?: string }`
  - `sendInvoice(orgId: string, invoiceId: string, input: SendInvoiceInput): Promise<{ number: string; emailDelivered: boolean }>` in `actions/invoices.ts` with `interface SendInvoiceInput { to: string; message?: string; updates?: InvoiceUpdate }` (declared locally — never re-export from the `'use server'` file)

- [ ] **Step 1: Write the failing email-template test**

Append to `__tests__/lib/email.test.ts` (follow the file's existing mock of `resend` — read its top 40 lines first and reuse the same `emails.send` spy):

```ts
describe('sendInvoiceEmail', () => {
  it('sends the invoice link with escaped user content and reply-to', async () => {
    await sendInvoiceEmail({
      to: 'client@example.com', orgName: 'BrewTrax', invoiceNumber: 'BRW-1042',
      total: 1100, dueDate: '2026-09-01', message: 'Thanks <3', token: 'tok123',
      isUpdate: false, fromDisplayName: 'BrewTrax', replyTo: 'ryan@example.com',
    })
    const call = sendSpy.mock.calls.at(-1)![0]
    expect(call.to).toBe('client@example.com')
    expect(call.replyTo).toBe('ryan@example.com')
    expect(call.subject).toContain('BRW-1042')
    expect(call.html).toContain('/invoices/tok123')
    expect(call.html).toContain('$1100.00')
    expect(call.html).toContain('Thanks &lt;3')   // user message is escaped
    expect(call.html).not.toContain('Thanks <3')
  })

  it('marks updates in the subject', async () => {
    await sendInvoiceEmail({
      to: 'c@e.com', orgName: 'BrewTrax', invoiceNumber: '1042', total: 5,
      token: 't', isUpdate: true,
    })
    expect(sendSpy.mock.calls.at(-1)![0].subject).toMatch(/updated/i)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/lib/email.test.ts`
Expected: FAIL — `sendInvoiceEmail` is not exported.

- [ ] **Step 3: Implement sendInvoiceEmail**

In `lib/email.ts` (reuse `PROPOSAL_BASE_URL` — rename it `PUBLIC_BASE_URL` if trivial, otherwise add a sibling const; use the existing `escapeHtml` for `orgName`, `message`, and `invoiceNumber`):

```ts
export interface InvoiceEmailParams {
  to: string
  orgName: string
  invoiceNumber: string
  total: number
  dueDate?: string
  message?: string
  token: string
  isUpdate: boolean
  fromDisplayName?: string
  fromDomain?: string
  replyTo?: string
}

export async function sendInvoiceEmail(params: InvoiceEmailParams): Promise<void> {
  const from = buildFromAddress({ displayName: params.fromDisplayName, domain: params.fromDomain })
  const invoiceUrl = `${PROPOSAL_BASE_URL}/invoices/${params.token}`
  const subject = params.isUpdate
    ? `Updated invoice ${params.invoiceNumber} from ${params.orgName}`
    : `Invoice ${params.invoiceNumber} from ${params.orgName}`

  await getResend().emails.send({
    from,
    to: params.to,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#1a1a1a;font-size:20px;margin-bottom:8px">Invoice ${escapeHtml(params.invoiceNumber)}</h1>
        <p style="color:#1a1a1a;font-size:16px;margin-bottom:8px">
          ${escapeHtml(params.orgName)} sent you an invoice for <strong>$${params.total.toFixed(2)}</strong>${params.dueDate ? `, due ${escapeHtml(params.dueDate)}` : ''}.
        </p>
        ${params.message ? `<p style="color:#4b5563;font-size:15px;margin-bottom:16px">${escapeHtml(params.message)}</p>` : ''}
        <a href="${invoiceUrl}"
           style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600">
          View invoice
        </a>
      </div>
    `,
  })
}
```

- [ ] **Step 4: Run email tests**

Run: `npx vitest run __tests__/lib/email.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing sendInvoice action tests**

In `__tests__/actions/invoices.test.ts` (the file already mocks Firestore, counters, and auth — see its hoisted spies; add `vi.mock('@/lib/email', ...)` with a `sendInvoiceEmail` spy, and a domains mock returning `undefined`):

```ts
describe('sendInvoice', () => {
  it('draft: assigns number, snapshots v1, emails, marks delivery sent', async () => {
    invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => draftInvoice })   // reuse the file's draft fixture
    counterGetSpy.mockResolvedValue({ exists: true, data: () => ({ seq: 1041, prefix: 'BRW-' }) })
    const res = await sendInvoice('org1', 'inv1', { to: 'client@example.com', message: 'hi' })
    expect(res.number).toBe('BRW-1042')
    expect(res.emailDelivered).toBe(true)
    const txPayload = txSetSpy.mock.calls.find((c) => c[1]?.lifecycle === 'sent')![1]
    expect(txPayload.versions).toHaveLength(1)
    expect(sendInvoiceEmailSpy).toHaveBeenCalledWith(expect.objectContaining({ to: 'client@example.com', isUpdate: false }))
    expect(invoiceDocUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ delivery: 'sent' }))
  })

  it('sent: applies updates, appends a snapshot, emails as update', async () => {
    invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => sentInvoiceWithOneVersion })
    await sendInvoice('org1', 'inv1', { to: 'c@e.com', updates: { line_items: [{ description: 'Extra hour', quantity: 1, unit_price: 100 }] } })
    const updateArg = invoiceDocUpdateSpy.mock.calls.find((c) => c[0].versions)![0]
    expect(updateArg.versions).toHaveLength(2)
    expect(sendInvoiceEmailSpy).toHaveBeenCalledWith(expect.objectContaining({ isUpdate: true }))
  })

  it('void: rejects', async () => {
    invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ ...draftInvoice, lifecycle: 'void' }) })
    await expect(sendInvoice('org1', 'inv1', { to: 'c@e.com' })).rejects.toThrow(/void/)
  })

  it('email failure: invoice stays sent, delivery bounced, emailDelivered false', async () => {
    invoiceDocGetSpy.mockResolvedValue({ exists: true, data: () => draftInvoice })
    counterGetSpy.mockResolvedValue({ exists: false })
    sendInvoiceEmailSpy.mockRejectedValueOnce(new Error('resend down'))
    const res = await sendInvoice('org1', 'inv1', { to: 'c@e.com' })
    expect(res.emailDelivered).toBe(false)
    expect(invoiceDocUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ delivery: 'bounced' }))
  })
})
```

- [ ] **Step 6: Run to verify failure, then implement sendInvoice**

Run: `npx vitest run __tests__/actions/invoices.test.ts` → FAIL (`sendInvoice` not exported).

In `actions/invoices.ts` — delete `issueInvoice` and add (moving its scope pre-check verbatim into the draft branch):

```ts
export interface SendInvoiceInput {
  to: string
  message?: string
  updates?: InvoiceUpdate
}

/**
 * The one send motion (spec §6): apply any pending edits, assign the number on first
 * send, snapshot the content-as-sent into versions[], email the customer, and record
 * delivery. Email failure never rolls back the send — numbers must be unique, not
 * gapless — it surfaces as { emailDelivered: false } + delivery: 'bounced'.
 */
export async function sendInvoice(
  orgId: string,
  invoiceId: string,
  input: SendInvoiceInput,
): Promise<{ number: string; emailDelivered: boolean }> {
  const member = await assertOrgAdmin(orgId)
  if (!input.to.trim()) throw new Error('Recipient email is required')
  const ref = invoicesRef(orgId).doc(invoiceId)
  const preSnap = await ref.get()
  if (!preSnap.exists) throw new Error('Invoice not found')
  let inv = normalizeInvoice(preSnap.data()!)
  if (inv.lifecycle === 'void') throw new Error('Cannot send a void invoice')

  if (input.updates) {
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input.updates)) {
      cleaned[k] = v === undefined ? FieldValue.delete() : v
    }
    await ref.update({ ...cleaned, updated_at: new Date().toISOString() })
    inv = normalizeInvoice((await ref.get()).data()!)
  }

  const isUpdate = inv.lifecycle === 'sent'
  let number: string
  if (!isUpdate) {
    // Scope invariant, verbatim from the retired issueInvoice: plain reads only —
    // Firestore transactions cannot run queries.
    if (inv.source?.type === 'proposal' && inv.source.id && inv.type !== 'quick') {
      const proposal = await getProposal(orgId, inv.source.id)
      if (proposal) {
        const approved = acceptedProposalTotal(proposal)
        const existing = await listInvoices(orgId, inv.lead_id)
        const billed = previouslyBilled(existing, inv.source.id)
        assertWithinScope(invoiceAmountDue(inv), billed, approved)
      }
    }
    const res = await markInvoiceSentCore(orgId, invoiceId)
    number = res.number
  } else {
    number = inv.number ?? ''
    const now = new Date().toISOString()
    await ref.update({
      versions: [...(inv.versions ?? []), invoiceVersionSnapshot(inv, now)],
      sent_at: now,
      updated_at: now,
    })
  }

  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  const org = orgSnap.data() as Org | undefined
  let fromDomain: string | undefined
  try {
    fromDomain = await getVerifiedSendingDomain(orgId)
  } catch { /* fall back to platform sender */ }

  let emailDelivered = true
  try {
    await sendInvoiceEmail({
      to: input.to.trim(),
      orgName: org?.branding?.display_name ?? org?.name ?? 'Your vendor',
      invoiceNumber: number,
      total: invoiceAmountDue(inv),
      dueDate: inv.due_date,
      message: input.message,
      token: inv.token,
      isUpdate,
      fromDisplayName: org?.branding?.display_name ?? org?.name,
      fromDomain,
      replyTo: member.email,
    })
    await ref.update({ delivery: 'sent' })
  } catch {
    emailDelivered = false
    await ref.update({ delivery: 'bounced' })
  }
  return { number, emailDelivered }
}
```

Add the needed imports (`markInvoiceSentCore`, `invoiceVersionSnapshot` from `@/lib/crm/invoices`; `sendInvoiceEmail` from `@/lib/email`; `Org` type; `getVerifiedSendingDomain` from its actual module found via grep). In `components/admin/InvoiceEditorClient.tsx`, replace the `issueInvoice` import/call with `sendInvoice(orgId, invoice.id, { to: window.prompt('Send to (email):') ?? '' })` as a stopgap — Task 6 replaces this with the real dialog.

- [ ] **Step 7: Run and pass**

Run: `npx vitest run __tests__/actions/invoices.test.ts __tests__/components/InvoiceEditorClient.test.tsx`
Expected: PASS (update the editor test's issue-button assertions to the stopgap if they broke).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(invoices): sendInvoice action — atomic number+snapshot+email with delivery status"
```

---

### Task 3: Invoice numbering settings — actions + dialog on the invoices page

**Files:**
- Modify: `actions/invoices.ts` (add `getInvoiceNumbering`, `updateInvoiceNumbering`)
- Create: `components/admin/InvoiceNumberingSettings.tsx`
- Modify: `app/(admin)/[orgSlug]/invoices/page.tsx` (fetch + render the settings control in the header)
- Test: `__tests__/actions/invoices.test.ts`

**Interfaces:**
- Consumes: the `counters/invoice_number` doc `{ seq: number; prefix?: string }` (Task 1's `markInvoiceSentCore` reads it; seq defaults to 1000 → first number 1001).
- Produces:
  - `getInvoiceNumbering(orgId: string): Promise<{ prefix?: string; next_number: number }>`
  - `updateInvoiceNumbering(orgId: string, input: { prefix?: string; next_number?: number }): Promise<void>` — throws `Error('Next number must be greater than N (already used)')` when `next_number <= seq`
  - `<InvoiceNumberingSettings orgId={string} initial={{ prefix?: string; next_number: number }} />` client component

- [ ] **Step 1: Write failing action tests**

In `__tests__/actions/invoices.test.ts` (the counters mock exists; give its doc a `set` spy if it lacks one, mirroring `invoiceDocSetSpy`):

```ts
describe('invoice numbering settings', () => {
  it('returns defaults when no counter exists', async () => {
    counterGetSpy.mockResolvedValue({ exists: false })
    expect(await getInvoiceNumbering('org1')).toEqual({ next_number: 1001 })
  })

  it('returns stored prefix and next number', async () => {
    counterGetSpy.mockResolvedValue({ exists: true, data: () => ({ seq: 1041, prefix: 'BRW-' }) })
    expect(await getInvoiceNumbering('org1')).toEqual({ prefix: 'BRW-', next_number: 1042 })
  })

  it('rejects a next number at or below the floor', async () => {
    counterGetSpy.mockResolvedValue({ exists: true, data: () => ({ seq: 1041 }) })
    await expect(updateInvoiceNumbering('org1', { next_number: 1041 })).rejects.toThrow(/greater than 1041/)
  })

  it('stores next_number - 1 as seq and trims the prefix', async () => {
    counterGetSpy.mockResolvedValue({ exists: true, data: () => ({ seq: 1041 }) })
    await updateInvoiceNumbering('org1', { next_number: 2000, prefix: ' INV- ' })
    expect(counterSetSpy).toHaveBeenCalledWith({ seq: 1999, prefix: 'INV-' }, { merge: true })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/actions/invoices.test.ts` — FAIL, functions not exported.

- [ ] **Step 3: Implement the actions**

In `actions/invoices.ts`:

```ts
function invoiceCounterRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('counters').doc('invoice_number')
}

export async function getInvoiceNumbering(orgId: string): Promise<{ prefix?: string; next_number: number }> {
  await assertOrgAdmin(orgId)
  const snap = await invoiceCounterRef(orgId).get()
  const data = snap.exists ? (snap.data() as { seq: number; prefix?: string }) : undefined
  return { ...(data?.prefix ? { prefix: data.prefix } : {}), next_number: (data?.seq ?? 1000) + 1 }
}

export async function updateInvoiceNumbering(
  orgId: string,
  input: { prefix?: string; next_number?: number },
): Promise<void> {
  await assertOrgAdmin(orgId)
  await adminDb.runTransaction(async (tx) => {
    const ref = invoiceCounterRef(orgId)
    const snap = await tx.get(ref)
    const seq = snap.exists ? (snap.data() as { seq: number }).seq : 1000
    const payload: Record<string, unknown> = {}
    if (input.next_number != null) {
      if (!Number.isInteger(input.next_number) || input.next_number <= seq) {
        throw new Error(`Next number must be greater than ${seq} (already used)`)
      }
      payload.seq = input.next_number - 1
    }
    if (input.prefix !== undefined) {
      const trimmed = input.prefix.trim()
      if (trimmed) payload.prefix = trimmed
      else payload.prefix = FieldValue.delete()
    }
    if (Object.keys(payload).length > 0) tx.set(ref, payload, { merge: true })
  })
}
```

(The test's transaction mock runs the callback with `set: txSetSpy`-style spies — align the assertion spy names with however the file's `runTransaction` mock is wired; reuse `txSetSpy` if adding a dedicated `counterSetSpy` is awkward.)

- [ ] **Step 4: Run and pass**

Run: `npx vitest run __tests__/actions/invoices.test.ts` — PASS.

- [ ] **Step 5: Build the settings control**

Create `components/admin/InvoiceNumberingSettings.tsx` — a `'use client'` component: a small ghost "Numbering" button (lucide `Settings2` icon) opening a `Dialog` (`components/ui/dialog.tsx`) with two labeled inputs (Prefix, Next invoice number), inline error text on reject (surface the server error message — it contains the floor), and a Save button calling `updateInvoiceNumbering` then `router.refresh()`. Follow the form idioms already in `InvoiceEditorClient.tsx` (Label + Input, `useState`, try/catch setting an `error` string).

In `app/(admin)/[orgSlug]/invoices/page.tsx`: fetch `const numbering = await getInvoiceNumbering(orgId)` alongside the existing data and render `<InvoiceNumberingSettings orgId={orgId} initial={numbering} />` in the page's header row (next to the page title — read the file first and match its structure).

- [ ] **Step 6: Verify compile + suites**

Run: `npx tsc --noEmit && npx vitest run __tests__/actions/invoices.test.ts`
Expected: clean + PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(invoices): numbering settings — prefix + next-number with used-floor validation"
```

---

### Task 4: Public invoice document + print stylesheet

**Files:**
- Modify: `actions/invoices-public.ts` (PublicInvoice gains `from.logo_url`, `discount`, `sent_at`)
- Modify: `components/invoices/InvoiceViewClient.tsx` (document redesign)
- Modify: `app/globals.css` (print rules)
- Test: `__tests__/actions/invoices-public.test.ts`

**Interfaces:**
- Consumes: `Org.branding` (`display_name`, `address`, `logo_url` — `lib/types.ts:35-42`), `InvoiceDiscount.reason` (Task 1).
- Produces: `PublicInvoice.from` becomes `{ name: string; address?: string; logo_url?: string }`; new `discount?: { type: 'percent' | 'fixed'; value: number; reason?: string }`; new `sent_at?: string`. `InvoiceViewClient` renders the shared document layout the Task 6 editor mirrors: header (logo + from left, "Invoice №" + dates right), bill-to, items table, right-aligned totals block, notes.

- [ ] **Step 1: Write failing projection tests**

In `__tests__/actions/invoices-public.test.ts`, extend the existing happy-path test's org fixture with `branding: { display_name: 'BrewTrax', address: '1 Keg Ln', logo_url: 'https://cdn/logo.png' }` and the invoice fixture with `discount: { type: 'percent', value: 10, reason: 'Returning customer' }, sent_at: '2026-08-15T00:00:00.000Z'`, then assert:

```ts
expect(result.from).toEqual({ name: 'BrewTrax', address: '1 Keg Ln', logo_url: 'https://cdn/logo.png' })
expect(result.discount).toEqual({ type: 'percent', value: 10, reason: 'Returning customer' })
expect(result.sent_at).toBe('2026-08-15T00:00:00.000Z')
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/actions/invoices-public.test.ts` — FAIL on the new fields.

- [ ] **Step 3: Extend the projection**

In `actions/invoices-public.ts`: add the three fields to the `PublicInvoice` interface and populate them where the existing `from`/`bill_to` blocks are built (`logo_url: org.branding?.logo_url`, `discount: inv.discount`, `sent_at: inv.sent_at`), using spread-conditionals so absent values stay absent.

- [ ] **Step 4: Run and pass**

Run: `npx vitest run __tests__/actions/invoices-public.test.ts` — PASS.

- [ ] **Step 5: Redesign the public page as a document**

Rewrite `components/invoices/InvoiceViewClient.tsx` (stays a plain presentational component, no `'use client'`). Kill the Card blocks. Structure:

```tsx
<main className="min-h-screen bg-muted/30 py-10 print:bg-white print:py-0">
  <div className="invoice-document mx-auto max-w-3xl bg-white px-10 py-12 shadow-sm rounded-lg print:shadow-none print:rounded-none">
    {/* Header: logo + from (left) — number/status/dates (right) */}
    <header className="flex items-start justify-between gap-6 pb-8 border-b">
      <div>
        {invoice.from?.logo_url && <img src={invoice.from.logo_url} alt="" className="h-12 mb-3 object-contain" />}
        {invoice.from && (
          <>
            <p className="text-sm font-semibold">{invoice.from.name}</p>
            {invoice.from.address && <p className="text-sm text-muted-foreground whitespace-pre-line">{invoice.from.address}</p>}
          </>
        )}
      </div>
      <div className="text-right">
        <h1 className="text-2xl font-bold tracking-tight">{invoice.number ? `Invoice #${invoice.number}` : 'Invoice'}</h1>
        {isPaid
          ? <span className="mt-2 inline-block rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-800">Paid</span>
          : invoice.due_date && <p className="mt-1 text-sm text-muted-foreground">Due {invoice.due_date}</p>}
        {invoice.sent_at && <p className="mt-0.5 text-xs text-muted-foreground">Sent {new Date(invoice.sent_at).toLocaleDateString()}</p>}
      </div>
    </header>
    {/* Bill to */}
    {/* Line items table (reuse the existing <table>, drop its Card wrapper) */}
    {/* Totals: right-aligned block — subtotal / discount(with reason) / tax / credits / total / paid / balance */}
    {/* Notes */}
  </div>
</main>
```

The totals block renders the discount line as `Discount — {reason}` when `invoice.discount?.reason` exists, amount `−$X`; tax as `Tax ({rate}%)` if the projection exposes a rate (it exposes `tax_amount` — label it just `Tax`). Keep `data-testid` attributes if the existing component tests assert them (read `__tests__/components/` for an InvoiceViewClient test first; update assertions to the new structure if present).

- [ ] **Step 6: Print stylesheet**

Append to `app/globals.css`:

```css
@media print {
  .no-print { display: none !important; }
  .invoice-document { box-shadow: none !important; border-radius: 0 !important; max-width: 100% !important; padding: 0 !important; }
  @page { margin: 1.5cm; }
}
```

- [ ] **Step 7: Verify in the browser**

Start the dev preview (`.claude/launch.json` dev server via preview_start; the emulator-backed walkthrough setup lives on the firebase-emulators branch — if emulator data is unavailable, verify with `npx tsc --noEmit` + component render tests instead and note it). Open a seeded invoice's `/invoices/[token]` URL, screenshot, and check the print rendering via the browser tools (resize/emulate or `window.print()` preview manually).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(invoices): public invoice as printable document — logo, discount reason, print styles"
```

---

### Task 5: Catalog search helper + picker dialog

**Files:**
- Create: `lib/catalog-search.ts`
- Create: `components/admin/InvoiceCatalogPicker.tsx`
- Test: `__tests__/lib/catalog-search.test.ts` (create)

**Interfaces:**
- Consumes: `listWorkPackages(orgId): Promise<WorkPackage[]>` and `createWorkPackage(orgId, input: CreateWorkPackageInput): Promise<WorkPackage>` from `actions/work-packages.ts` (`CreateWorkPackageInput` requires `{ name, price, lines }`; pass `lines: []` for picker-created items).
- Produces:
  - `searchCatalog(entries: CatalogEntry[], query: string): CatalogEntry[]` in `lib/catalog-search.ts`, with `interface CatalogEntry { id: string; name: string; description?: string; price: number }`
  - `<InvoiceCatalogPicker orgId open onOpenChange onPick />` where `onPick(item: { description: string; unit_price: number; source?: InvoiceSourceRef }): void`

- [ ] **Step 1: Write failing search tests**

`__tests__/lib/catalog-search.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { searchCatalog, type CatalogEntry } from '@/lib/catalog-search'

const entries: CatalogEntry[] = [
  { id: '1', name: 'Drip coffee service', description: '2 hours, 50 guests', price: 650 },
  { id: '2', name: 'Cold Espresso Bar', price: 450 },
  { id: '3', name: 'Add-on: oat milk', price: 40 },
]

describe('searchCatalog', () => {
  it('returns all entries for a blank query', () => {
    expect(searchCatalog(entries, '  ')).toHaveLength(3)
  })
  it('matches name case-insensitively', () => {
    expect(searchCatalog(entries, 'espresso').map((e) => e.id)).toEqual(['2'])
  })
  it('matches description text', () => {
    expect(searchCatalog(entries, 'guests').map((e) => e.id)).toEqual(['1'])
  })
  it('matches every word of a multi-word query (AND)', () => {
    expect(searchCatalog(entries, 'oat add')).toHaveLength(1)
    expect(searchCatalog(entries, 'oat espresso')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/lib/catalog-search.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement the helper**

`lib/catalog-search.ts`:

```ts
export interface CatalogEntry {
  id: string
  name: string
  description?: string
  price: number
}

// Case-insensitive AND-match across name + description. Blank query = everything.
export function searchCatalog(entries: CatalogEntry[], query: string): CatalogEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return entries
  return entries.filter((e) => {
    const haystack = `${e.name} ${e.description ?? ''}`.toLowerCase()
    return terms.every((t) => haystack.includes(t))
  })
}
```

- [ ] **Step 4: Run and pass**

Run: `npx vitest run __tests__/lib/catalog-search.test.ts` — PASS.

- [ ] **Step 5: Build the picker dialog**

Create `components/admin/InvoiceCatalogPicker.tsx` (`'use client'`):

- Props: `{ orgId: string; open: boolean; onOpenChange: (open: boolean) => void; onPick: (item: { description: string; unit_price: number; source?: InvoiceSourceRef }) => void }`.
- On first open, load `listWorkPackages(orgId)` into state (loading + error states; map to `CatalogEntry` as `{ id, name, description, price }`).
- A search `Input` at the top filters via `searchCatalog`.
- Results: a simple list of rows (name, description, right-aligned `$price`); clicking a row calls `onPick({ description: pkg.name, unit_price: pkg.price, source: { type: 'manual', id: pkg.id, label: 'Catalog' } })` and closes.
- Empty results for a non-blank query show two actions:
  - **"Create '⟨query⟩' as a catalog item"** — expands an inline mini-form (Name pre-filled with the query, Price input). Submit calls `createWorkPackage(orgId, { name, price, lines: [] })`, then `onPick` with the created package and closes. Errors render inline in the dialog.
  - **"Add '⟨query⟩' as a one-off line"** — calls `onPick({ description: query, unit_price: 0 })` and closes.
- Use `Dialog` from `components/ui/dialog.tsx`; match the visual idiom of existing dialogs (grep an existing `Dialog` usage for structure).

- [ ] **Step 6: Verify compile**

Run: `npx tsc --noEmit` — clean. (Interactive behavior is exercised through the rebuilt editor in Task 6's tests and walkthrough.)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(invoices): catalog picker dialog with search, create-in-place, and one-off lines"
```

---

### Task 6: Document-first editor rebuild + Send dialog

**Files:**
- Rewrite: `components/admin/InvoiceEditorClient.tsx`
- Create: `components/admin/SendInvoiceDialog.tsx`
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/invoices/[invoiceId]/page.tsx` (pass `customerEmail`, `branding`)
- Test: `__tests__/components/InvoiceEditorClient.test.tsx` (rewrite alongside)

**Interfaces:**
- Consumes: `sendInvoice(orgId, invoiceId, { to, message?, updates? })` (Task 2), `updateInvoice` (draft-only financial edits), `voidInvoice`, `deleteInvoice`, `recordPayment` (unchanged), `InvoiceCatalogPicker` (Task 5), `InvoiceVersion`/`versions` (Task 1), money helpers from `lib/invoices.ts` (`linesSubtotal`, `invoiceDiscountAmount`, `invoiceTaxAmount`, `invoiceAmountDue`, `amountPaid`, `invoiceBalance`, `lineItemSubtotal`).
- Produces: `<InvoiceEditorClient orgId orgSlug leadId invoice orgTipsEnabled customerName customerEmail branding />` where `customerEmail?: string` and `branding?: { display_name?: string; address?: string; logo_url?: string }`; `<SendInvoiceDialog open onOpenChange defaultTo isUpdate onSend />` with `onSend(input: { to: string; message?: string }): Promise<void>`.

- [ ] **Step 1: Update the page to pass the new props**

In `app/(admin)/[orgSlug]/leads/[leadId]/invoices/[invoiceId]/page.tsx`, it already fetches `customer` and `org`; extend the render:

```tsx
<InvoiceEditorClient
  orgId={orgId} orgSlug={orgSlug} leadId={leadId} invoice={invoice}
  orgTipsEnabled={org.tips_enabled}
  customerName={customer?.name}
  customerEmail={customer?.email}
  branding={org.branding}
/>
```

- [ ] **Step 2: Rewrite the editor test to describe the document**

Rewrite `__tests__/components/InvoiceEditorClient.test.tsx` (read the current file first; keep its mocking approach for `@/actions/invoices` and `next/navigation`). Cover, minimum:

```ts
// Fixtures: draftInvoice (lifecycle 'draft', no number), sentInvoice (lifecycle 'sent',
// number 'BRW-1042', versions: [v1]) — reuse/adapt the file's existing fixtures.

it('draft shows "№ assigned when sent" and no number input', ...)
  // renders the placeholder text; queryByLabelText('Invoice number') is null

it('renders line-item rows with a trash icon button, not a Remove text button', ...)
  // getAllByRole('button', { name: /remove line/i }) — the icon button has aria-label="Remove line"
  // queryByText('Remove') is null

it('shows totals in reading order with inline discount reason input', ...)
  // set a percent discount via the inline selects; type a reason; assert the reason input value
  // and the computed −$ amount via data-testid="breakdown-discount"

it('Send invoice opens the dialog pre-filled with the customer email and calls sendInvoice', ...)
  // click 'Send invoice' → dialog input has value customerEmail → click Send →
  // expect(sendInvoiceMock).toHaveBeenCalledWith('org1', 'inv1', expect.objectContaining({ to: 'c@e.com' }))

it('sent invoice is read-only until Edit invoice is clicked, then CTA becomes Send update', ...)

it('sent invoice shows version history disclosure with one entry per send', ...)
  // sentInvoice fixture with versions: [v1, v2] → expanding 'History' lists 2 entries

// --- composition invariants (screen-composition checklist) ---

it('renders Balance exactly once on the page', ...)
  // getAllByText(/^Balance/i) has length 1 — guards against the Payments section
  // re-introducing its old "Balance due" summary line

it('renders Amount paid exactly once on the page', ...)

it('gives Balance visual dominance over the supporting totals lines', ...)
  // the Balance value node carries text-2xl; no other value node on the document does

it('shows an interpretation line under Balance for each payment state', ...)
  // balance 0 → /paid in full/i; partial → /\$\d+ of \$\d+ paid/i;
  // past due + balance > 0 → /overdue/i; draft → /not sent yet/i

it('renders an empty-state line instead of an empty table when there are no line items', ...)
  // lineItems: [] → getByText(/no line items yet/i); table body has no rows

it('omits the History disclosure entirely when there are no versions', ...)
  // sentInvoice with versions: [] → queryByText(/history/i) is null
```

Run: `npx vitest run __tests__/components/InvoiceEditorClient.test.tsx` — FAIL (new structure doesn't exist yet).

- [ ] **Step 3: Rebuild the editor as a document**

Rewrite `components/admin/InvoiceEditorClient.tsx`. Keep: all money math, `toNumber`, `isBlankRow`, save/void/delete/record-payment handlers, the `aria-live` error/notice region, back-link, and share-link block (share-link moves into the action bar area). Remove: the Card stack, `handleIssue`/stopgap prompt, manual number input.

Structure (task-flow order: who → what → math → send):

```tsx
{/* Wide screens: document + subordinate side rail. Narrow: single column, rail below. */}
<div className="mx-auto max-w-3xl p-6 xl:max-w-6xl xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-8">
  <div>
    {/* Action bar (no-print): back link · status badge · [Edit invoice | Save] · [Send invoice / Send update] · overflow (Void / Delete / Copy link) */}
    {/* Document surface: bg-card rounded-lg shadow-sm px-10 py-12 max-md:px-5 max-md:py-8 — mirrors InvoiceViewClient */}
      {/* Header: branding.logo_url + branding.display_name/address (left);
          "Invoice" + (number ?? '№ assigned when sent') + due-date input-in-place (right).
          Stacks to one column under md. */}
      {/* Bill to: customerName + customerEmail */}
      {/* Line items: <table> at md+ — Description | Qty | Unit price | Subtotal | taxable | trash IconButton
          <Button size="sm" variant="ghost" aria-label="Remove line" onClick={() => removeRow(i)}><Trash2 className="h-4 w-4" /></Button>
          Under md the table collapses to stacked row cards (see Responsive below).
          Below the rows: [Add from catalog] [Add blank line]  ← bottom-anchored
          Zero rows: single muted line "No line items yet — add one below." (never an empty table body) */}
      {/* Totals block (right-aligned, reading order). Supporting lines are quiet;
          Balance is the focal element — see Hierarchy below:
          Subtotal $X
          Discount [type select][value][reason input] −$X   (reason only when discount set)
          Tax [rate % input] +$X
          credits… −$X
          Total $X
          Amount paid $X
          ─────────────
          Balance $X            ← text-2xl font-semibold tabular-nums
                                  + one interpretation line beneath (see Hierarchy) */}
      {/* Notes textarea, styled as document footer text */}
  </div>

  {/* Side rail at xl, below the document under xl. Subordinate, not co-equal:
      no Card wrapper, smaller type, muted headings.
      Payments (list + record form — WITHOUT its old "Amount paid"/"Balance due"
      summary lines, which now live only in the Totals block) + History disclosure */}
  <aside className="mt-8 xl:mt-0">…</aside>
</div>
```

**Hierarchy (checklist item 2 — the deciding value is focal):**

Balance is the number the operator opened the page for. It is the only figure on
the screen with visual dominance:

- `Subtotal`, `Discount`, `Tax`, `credits`, `Amount paid` → `text-sm text-muted-foreground`, label and value same weight. These are inputs to the math, not the answer.
- `Total` → `text-sm font-medium text-foreground`.
- `Balance` → `text-2xl font-semibold tabular-nums`, separated by a rule, with an interpretation line directly beneath it (checklist item 5 — no bare numbers):
  - `balance <= 0` → `Paid in full` (muted)
  - `paid > 0 && balance > 0` → `$X of $Y paid` (muted)
  - `balance > 0 && past due` → `N days overdue` (`text-destructive`)
  - `balance > 0 && draft` → `Not sent yet` (muted)
- Nothing else on the document uses `text-2xl` or heavier than `font-semibold`.

**No duplicate values (checklist item 4):** `Amount paid` and `Balance` render in
the Totals block **only**. When de-carding the Payments section, delete its
existing `Amount paid` / `Balance due` summary rows ([current lines 459–466])
rather than carrying them over — the rail keeps the payment *list* and the record
form, nothing else.

**Responsive (checklist item 8):**

| Width | Layout |
|---|---|
| `< md` (768) | Single column. Document padding drops to `px-5 py-8`. Line items stop being a table: each row renders as a stacked block — description full width, then `Qty · Unit price · Subtotal` on one line, taxable + delete on the next. Totals full width. |
| `md`–`xl` | Document at `max-w-3xl`, line items as a real table, rail below the document. |
| `≥ xl` (1280) | Two columns: document + 320px side rail. |

The 6-column line-items table must never render below `md`. Verify at 375px
before calling Task 6 done.

**Empty / sparse states:**

- Zero line items → muted "No line items yet — add one below.", not an empty `<tbody>`.
- Zero payments → keep the existing "No payments recorded yet."
- Zero versions → omit the History disclosure entirely (do not render an empty `<details>`).
- Draft with no number → `№ assigned when sent` (already specified).

Key behaviors:

- **Edit mode**: `const [editing, setEditing] = useState(invoice.lifecycle === 'draft')`. Sent + not editing → all inputs `readOnly`/`disabled`, CTA row shows "Edit invoice". Sent + editing → fields live, primary CTA "Send update". Draft → always editing, primary CTA "Send invoice", secondary "Save" (calls `updateInvoice` as today).
- **Send**: both CTAs open `SendInvoiceDialog` (`defaultTo={customerEmail ?? ''}`, `isUpdate={invoice.lifecycle === 'sent'}`). Its `onSend` calls `sendInvoice(orgId, invoice.id, { to, message, updates: currentFormState })` where `currentFormState` is the same cleaned payload `handleSave` builds (blank rows filtered, `undefined` for cleared discount/tax) — so unsaved edits ride along with the send. On success: if `emailDelivered === false`, set a persistent warning notice "Invoice sent — email delivery failed. Use Send update to retry."; always `router.refresh()`.
- **Catalog picker**: `onPick` appends `{ description, quantity: 1, unit_price, taxable: true, ...(source ? { source } : {}) }` to `lineItems`.
- **Discount reason**: extend the discount state handling — reason input appears when `discount` is set, stored as `discount.reason` (trimmed; empty → omit).
- **History**: when `(invoice.versions ?? []).length > 0`, a `<details>` disclosure in the side rail listing each entry as `Sent {date} — {n} items, ${total}` (compute total with `invoiceAmountDue(version)`). When there are no versions, render nothing.
- **Void/Delete**: move into a small overflow area of the action bar (keep `confirm()` guards). Void only when sent; Delete only when draft.

`SendInvoiceDialog.tsx`: `'use client'`; Dialog with To (required, type email), Message (optional textarea), primary button `{isUpdate ? 'Send update' : 'Send invoice'}`, disabled while sending or when To is blank; renders `onSend` rejection messages inline.

- [ ] **Step 4: Run the editor tests until green**

Run: `npx vitest run __tests__/components/InvoiceEditorClient.test.tsx` — PASS.

- [ ] **Step 5: Full suite + compile**

Run: `npm test -- --exclude '**/.claude/**' && npx tsc --noEmit` — PASS/clean.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(invoices): document-first editor — in-place editing, catalog picker, send dialog, history"
```

---

### Task 7: Verification, build, walkthrough, roadmap

**Files:**
- Modify: `docs/ROADMAP.md`
- No new code except fixes surfaced by verification.

**Interfaces:** none — this task proves the others.

- [ ] **Step 1: Full test suite**

Run: `npm test -- --exclude '**/.claude/**'`
Expected: PASS. Fix anything red before proceeding.

- [ ] **Step 2: Production build**

Run: `npx next build`
Expected: clean. (Watch specifically for the `'use server'` type re-export failure mode; if it appears, a type leaked into `actions/invoices.ts` exports.)

- [ ] **Step 3: Browser walkthrough**

Via the dev preview (preview_start with the launch.json dev server): create a draft invoice on a lead → add a line from the catalog picker (including the create-in-place path) → set a discount with a reason → confirm the totals block math → Send (dialog pre-filled) → confirm the number appears and status flips to Sent → Edit invoice → change a line → Send update → confirm a second History entry → open the public `/invoices/[token]` page → verify document rendering and print preview. Screenshot the editor and public page as proof.

- [ ] **Step 3b: Responsive + composition check**

`resize_window` to 375px and re-open the editor: the line-items table must have
collapsed to stacked rows (no horizontal scroll, no clipped columns), the totals
block must be full width, and Balance must still be the visually dominant figure.
Repeat at 1280px to confirm the side rail appears. Then walk the
`.claude/skills/screen-composition/SKILL.md` review checklist against the editor
and the public page — every box ticked, or fixed before this task closes.
Screenshot 375px and 1280px as proof.

- [ ] **Step 4: Email delivery note**

Local/emulator sends will fail or no-op without a real `RESEND_API_KEY`. Production email delivery (this flow AND the shared intake-form path from PR #66) must be verified after deploy: send a real invoice to a controlled address on the production org and confirm receipt. Record the result in the PR description — this debt is explicitly in scope per the spec.

- [ ] **Step 5: Roadmap + commit**

Update `docs/ROADMAP.md` (canonical status rollup) with the invoice-redesign increment. Then:

```bash
git add -A && git commit -m "docs: roadmap — invoice experience redesign"
```

- [ ] **Step 6: Branch/PR**

Work should be on a feature branch (per the worktree/branch workflow used at execution time). Push requires the Lifewithmo gh account: `gh auth switch` first if the push 403s. Open a PR titled "feat(invoices): draft/sent/void lifecycle, document editor, catalog lines, email send".
