# Proposals — Commitment (e-signature + deposit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn "accept" into a binding, audit-defensible close — an ESIGN/UETA audit-trail e-signature plus an optional Stripe Connect deposit — reusing the repo's existing PaymentIntent/Elements/webhook stack.

**Architecture:** Additive, back-compatible changes to the proposal stack + the existing payments stack. Acceptance now flows through a new `signProposal` (server-captures ip/ua/timestamp, hashes the signed document, locks the proposal). Deposits reuse the Connect `PaymentIntent` + `PaymentElement` + `/api/payments/webhook` pattern. A per-proposal `deposit_gate` (default `after_accept`) decides whether payment is required before the close; `before_accept` finalizes atomically in the webhook via a `pending_signature` stashed on the proposal doc.

**Tech Stack:** Next.js 16 App Router (server actions + route handlers; `headers()` is async), React 19, Firebase Admin, Stripe (`@stripe/react-stripe-js`, `@stripe/stripe-js`, `stripe`), Resend, Vitest, `node:crypto`. No `zod` in the repo — runtime validation is hand-written guards.

## Global Constraints

- **This is NOT stock Next.js** — consult `node_modules/next/dist/docs/` before any routing work. `headers()` from `next/headers` is **async** (`await headers()`), per `actions/forms.ts:150` and `app/api/payments/webhook/route.ts:11`.
- **Work only in** `/Users/rm/vw/traxevent/.claude/worktrees/proposals-commitment` on branch `claude/proposals-commitment`. Confirm the branch before every commit. **Never commit to `main`.**
- New proposal fields are **optional-typed** and back-compatible; unsigned proposals behave exactly as before.
- **Server-authoritative:** `ip`, `user_agent`, `signed_at`, `document_hash`, and the deposit **amount** are always derived on the server — the client supplies only selection, name, email, consent. Capture ip via `(await headers()).get('x-forwarded-for')?.split(',')[0]?.trim()` and ua via `.get('user-agent')` (mirror `actions/forms.ts:150`).
- **No `zod`** — validate the public sign payload with explicit hand-written guards (throw `'Invalid request'` on shape violations), consistent with the existing manual checks in `respondToProposal`.
- **PCI:** card data only via Stripe `PaymentElement`; never accept/store a PAN. Deposit `PaymentIntent`s are created on `org.stripe_account_id` with the 1% platform fee, mirroring `app/api/payments/intent/route.ts`.
- **A signed proposal is locked:** no re-sign, no admin edit; `signProposal` only acts on a `sent` proposal.
- Money rounds via the existing `round2`; deposit amount via `depositAmount(total, deposit)`; totals via `computeSelectedTotal` (all from `lib/proposals.ts`).
- Tests mock `@/lib/firebase-admin`, `@/lib/auth/assert`, `@/lib/stripe`, and `next/headers` with `vi.hoisted` spies (follow `__tests__/actions/proposals*.test.ts` and `__tests__/api/payments-*.test.ts`).
- Green gate each task: `npx tsc --noEmit` clean AND `npx vitest run` green. Run `npm install` first if the suite shows `server-only` load failures. From the main repo root, exclude nested worktrees: `npx vitest run --exclude '**/.claude/**'` (not needed inside this worktree).

---

### Task 1: Types + canonical document hash

**Files:**
- Modify: `lib/types.ts` (Proposal types block)
- Create: `lib/proposal-signature.ts` (server-side; uses `node:crypto`)
- Test: `__tests__/lib/proposal-signature.test.ts`

**Interfaces:**
- Consumes: `Proposal`, `ProposalSelection` (Increment 1).
- Produces:
  - Types: `PaymentStatus`, `ProposalSignature`, `ProposalEvent`, `ProposalDepositPayment`, `PendingSignature`; `Proposal` gains `deposit_gate?`, `deposit_terms?`, `payment_status?`, `signature?`, `deposit_payment?`, `pending_signature?`, `events?`.
  - `canonicalProposalDocument(proposal, selection): string`, `documentHash(canonical: string): string`, `signedDocumentHash(proposal, selection): string`.

- [ ] **Step 1: Write the failing test** — `__tests__/lib/proposal-signature.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { canonicalProposalDocument, documentHash, signedDocumentHash } from '@/lib/proposal-signature'
import type { Proposal, ProposalSelection } from '@/lib/types'

const base = (over: Partial<Proposal> = {}): Proposal => ({
  id: 'p', org_id: 'o', lead_id: 'l', token: 't', status: 'sent',
  title: 'Landscape', line_items: [{ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true }],
  packages: [{ id: 'good', name: 'Good', includes: ['Install'], price: 12500 }],
  deposit: { type: 'percent', value: 50 }, deposit_terms: 'Non-refundable within 14 days of the event.',
  tax_rate: 8.25, created_at: '', ...over,
})
const sel: ProposalSelection = { package_id: 'good', optional_item_ids: ['o1'], selected_total: 15161.25, selected_at: '' }

describe('canonicalProposalDocument', () => {
  it('is stable regardless of object key insertion order', () => {
    const a = canonicalProposalDocument(base(), sel)
    // same data, keys built in a different order
    const reordered = base({ tax_rate: 8.25, title: 'Landscape' })
    const b = canonicalProposalDocument(reordered, { optional_item_ids: ['o1'], package_id: 'good', selected_total: 15161.25, selected_at: 'ignored' })
    expect(a).toBe(b)
  })
  it('is stable regardless of optional_item_ids order', () => {
    const s1 = { ...sel, optional_item_ids: ['a', 'b'] }
    const s2 = { ...sel, optional_item_ids: ['b', 'a'] }
    expect(canonicalProposalDocument(base(), s1)).toBe(canonicalProposalDocument(base(), s2))
  })
  it('does NOT include volatile/non-agreed fields (id, token, status, selected_at)', () => {
    expect(canonicalProposalDocument(base({ token: 'X' }), sel))
      .toBe(canonicalProposalDocument(base({ token: 'Y' }), sel))
  })
})

describe('documentHash / signedDocumentHash', () => {
  it('hashes deterministically and changes when the agreed content changes', () => {
    const h1 = signedDocumentHash(base(), sel)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(signedDocumentHash(base(), sel)).toBe(h1)              // deterministic
    expect(signedDocumentHash(base({ deposit_terms: 'Different' }), sel)).not.toBe(h1)  // content-sensitive
    expect(documentHash('x')).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/lib/proposal-signature.test.ts` → FAIL (module missing).

- [ ] **Step 3: Extend `lib/types.ts`** — after the Increment-1 proposal types, add and extend `Proposal`:

```typescript
export type PaymentStatus = 'not_required' | 'deposit_pending' | 'deposit_paid'

export interface ProposalSignature {
  signer_name: string
  signer_email: string
  signed_at: string          // server UTC ISO
  ip: string                 // server-derived
  user_agent: string         // server-derived
  consent_electronic: true   // recorded acknowledgment
  document_hash: string      // sha256 of the canonical signed document
}

export interface ProposalEvent {
  kind: 'sent' | 'viewed' | 'accepted' | 'signed' | 'deposit_paid' | 'declined'
  at: string                 // server UTC ISO
  ip?: string
  user_agent?: string
}

export interface ProposalDepositPayment {
  intent_id: string
  amount: number             // dollars
  paid_at?: string
}

// Captured server-side at sign time for the before_accept path; promoted to
// `signature` by the webhook once the deposit succeeds. Never client-trusted.
export interface PendingSignature {
  signer_name: string
  signer_email: string
  captured_at: string
  ip: string
  user_agent: string
  document_hash: string
  selection: ProposalSelection
}
```

Add to `Proposal` (all optional, after `selection`):
```typescript
  deposit_gate?: 'before_accept' | 'after_accept'
  deposit_terms?: string
  payment_status?: PaymentStatus
  signature?: ProposalSignature
  deposit_payment?: ProposalDepositPayment
  pending_signature?: PendingSignature
  events?: ProposalEvent[]
```

- [ ] **Step 4: Create `lib/proposal-signature.ts`**

```typescript
import { createHash } from 'node:crypto'
import type { Proposal, ProposalSelection } from '@/lib/types'

// Recursively sort object keys so equivalent documents serialize identically.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return Object.keys(obj).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = canonicalize(obj[k])
      return acc
    }, {})
  }
  return value
}

type SignableProposal = Pick<Proposal, 'title' | 'notes' | 'packages' | 'line_items' | 'discount' | 'tax_rate' | 'deposit' | 'deposit_terms'>
type SignableSelection = Pick<ProposalSelection, 'package_id' | 'optional_item_ids' | 'selected_total'>

// A canonical serialization of EXACTLY what the customer agreed to — scope,
// selection, pricing, and terms. Deliberately excludes volatile/non-agreed
// fields (id, token, status, timestamps).
export function canonicalProposalDocument(proposal: SignableProposal, selection: SignableSelection): string {
  const doc = {
    title: proposal.title ?? null,
    notes: proposal.notes ?? null,
    packages: proposal.packages ?? [],
    line_items: proposal.line_items ?? [],
    discount: proposal.discount ?? null,
    tax_rate: proposal.tax_rate ?? null,
    deposit: proposal.deposit ?? null,
    deposit_terms: proposal.deposit_terms ?? null,
    selection: {
      package_id: selection.package_id ?? null,
      optional_item_ids: [...(selection.optional_item_ids ?? [])].sort(),
      selected_total: selection.selected_total,
    },
  }
  return JSON.stringify(canonicalize(doc))
}

export function documentHash(canonical: string): string {
  return createHash('sha256').update(canonical).digest('hex')
}

export function signedDocumentHash(proposal: SignableProposal, selection: SignableSelection): string {
  return documentHash(canonicalProposalDocument(proposal, selection))
}
```

> **Server-only:** this module imports `node:crypto`; only server actions / route handlers / tests import it — never a `'use client'` component.

- [ ] **Step 5: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/proposal-signature.ts __tests__/lib/proposal-signature.test.ts
git commit -m "feat(proposals): commitment types + canonical signed-document hash"
```

---

### Task 2: Admin actions — deposit gate/terms + sign-lock guard

**Files:**
- Modify: `actions/proposals.ts`
- Test: `__tests__/actions/proposals.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 types.
- Produces: `CreateProposalInput` / `ProposalUpdate` gain `deposit_gate?`, `deposit_terms?`; `updateProposal` throws `'This proposal is signed and can no longer be edited'` when the stored proposal has a `signature`.

- [ ] **Step 1: Write the failing tests** — append to `__tests__/actions/proposals.test.ts`. Note: the existing mock returns a `doc()` with `get`/`update`; extend the mock so `proposalDocGetSpy` can return a signed proposal for the lock test.

```typescript
it('updateProposal passes through deposit_gate and deposit_terms', async () => {
  proposalDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'sent' }) })
  await updateProposal('org-1', 'p1', { deposit_gate: 'before_accept', deposit_terms: 'Non-refundable.' })
  const written = proposalDocUpdateSpy.mock.calls[0][0]
  expect(written.deposit_gate).toBe('before_accept')
  expect(written.deposit_terms).toBe('Non-refundable.')
})

it('updateProposal refuses to edit a signed (locked) proposal and does not write', async () => {
  proposalDocGetSpy.mockResolvedValue({
    exists: true,
    data: () => ({ id: 'p1', status: 'accepted', signature: { signer_name: 'A', signed_at: 'x' } }),
  })
  await expect(updateProposal('org-1', 'p1', { title: 'edit' }))
    .rejects.toThrow('This proposal is signed and can no longer be edited')
  expect(proposalDocUpdateSpy).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/actions/proposals.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `actions/proposals.ts`:
  - Widen the type import with `ProposalSignature` is not needed; just add fields to the input interfaces:
    ```typescript
    // CreateProposalInput and ProposalUpdate both gain:
    deposit_gate?: 'before_accept' | 'after_accept'
    deposit_terms?: string
    ```
  - In `createProposal`, add the same conditional spreads used for the other optional fields:
    ```typescript
    ...(input.deposit_gate ? { deposit_gate: input.deposit_gate } : {}),
    ...(input.deposit_terms?.trim() ? { deposit_terms: input.deposit_terms.trim() } : {}),
    ```
  - In `updateProposal`, **read then guard** before writing (the function currently updates blind):
    ```typescript
    export async function updateProposal(orgId: string, proposalId: string, updates: ProposalUpdate): Promise<void> {
      await assertOrgAdmin(orgId)
      if (updates.status && !PROPOSAL_STATUSES.includes(updates.status)) throw new Error('Invalid status')
      const ref = proposalsRef(orgId).doc(proposalId)
      const snap = await ref.get()
      if (snap.exists && (snap.data() as Proposal).signature) {
        throw new Error('This proposal is signed and can no longer be edited')
      }
      // keep the Increment-1 undefined-cleaning (FieldValue.delete()) already in this function
      await ref.update({ ...cleaned, updated_at: new Date().toISOString() })
    }
    ```
    (Preserve the existing `undefined → FieldValue.delete()` cleaning added in Increment 1 — apply the guard before it.)

- [ ] **Step 4: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` green.

- [ ] **Step 5: Commit**

```bash
git add actions/proposals.ts __tests__/actions/proposals.test.ts
git commit -m "feat(proposals): admin carries deposit gate/terms; lock a signed proposal from edits"
```

---

### Task 3: Public `signProposal` + audit capture + decline/view events + signer email

**Files:**
- Modify: `actions/proposals-public.ts`
- Modify: `lib/email.ts` (add `sendProposalSignedConfirmation`)
- Test: `__tests__/actions/proposals-public.test.ts` (extend)

**SECURITY-RELEVANT:** unauthenticated; token is the sole authorization; server-authoritative capture; a signed proposal is locked.

**Interfaces:**
- Consumes: `computeSelectedTotal` (Inc 1), `signedDocumentHash` (Task 1), `depositAmount` (Inc 1).
- Produces:
  - `PublicProposal` gains `deposit_gate?`, `deposit_terms?`, `payment_status?`, and a **reduced** `signed?: { signer_name: string; signed_at: string }` (never ip/ua/hash/email publicly).
  - `signProposal(token, input): Promise<{ deposit_due: number; payment_status: PaymentStatus }>` where `input = { signer_name; signer_email; consent: boolean; selection?: { package_id?; optional_item_ids? } }`.
  - `recordProposalView(token): Promise<void>` — appends a `viewed` event (ip/ua) best-effort.
  - `respondToProposal(token, 'rejected')` also appends a `declined` event.

- [ ] **Step 1: Write the failing tests** — append to `__tests__/actions/proposals-public.test.ts`. Mock `next/headers` and `@/lib/email` and `@/lib/proposal-signature` is real (pure+crypto, runs un-mocked). Add at the top with the other `vi.mock`s:

```typescript
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: (k: string) => (k === 'x-forwarded-for' ? '203.0.113.7, 10.0.0.1' : k === 'user-agent' ? 'JestUA/1.0' : null),
  }),
}))
vi.mock('@/lib/email', () => ({ sendProposalSignedConfirmation: vi.fn().mockResolvedValue(undefined) }))
```

Tests:
```typescript
describe('signProposal', () => {
  function sentDeposit(gate: 'before_accept' | 'after_accept') {
    return {
      id: 'p1', lead_id: 'lead-1', status: 'sent',
      line_items: [{ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true }],
      packages: [{ id: 'good', name: 'Good', includes: [], price: 12500 }],
      deposit: { type: 'percent', value: 50 }, deposit_gate: gate, deposit_terms: 'terms',
    }
  }

  it('after_accept: signs, captures server-side ip/ua/hash, sets deposit_pending, advances closed_won', async () => {
    mockSnapshot(sentDeposit('after_accept'))
    const res = await signProposal('tok', { signer_name: 'Dana', signer_email: 'd@x.co', consent: true, selection: { package_id: 'good', optional_item_ids: ['o1'] } })
    const arg = proposalUpdateSpy.mock.calls[0][0]
    expect(arg.status).toBe('accepted')
    expect(arg.payment_status).toBe('deposit_pending')
    expect(arg.signature.signer_name).toBe('Dana')
    expect(arg.signature.ip).toBe('203.0.113.7')            // first x-forwarded-for hop, server-derived
    expect(arg.signature.user_agent).toBe('JestUA/1.0')
    expect(arg.signature.document_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(arg.signature.consent_electronic).toBe(true)
    expect(res.deposit_due).toBe(7000)                       // 50% of (12500+1500) with no tax? see note
    expect(leadUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'closed_won' }))
  })

  it('no deposit → payment_status not_required', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent', line_items: [] })
    const res = await signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: true })
    expect(proposalUpdateSpy.mock.calls[0][0].payment_status).toBe('not_required')
    expect(res.deposit_due).toBe(0)
  })

  it('rejects missing consent / blank name / blank email', async () => {
    mockSnapshot(sentDeposit('after_accept'))
    await expect(signProposal('tok', { signer_name: '', signer_email: 'a@a.co', consent: true })).rejects.toThrow('Invalid request')
    await expect(signProposal('tok', { signer_name: 'A', signer_email: '', consent: true })).rejects.toThrow('Invalid request')
    await expect(signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: false })).rejects.toThrow('You must consent')
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
  })

  it('is locked: throws for an already-signed or non-sent proposal, writes nothing', async () => {
    mockSnapshot({ ...sentDeposit('after_accept'), status: 'accepted', signature: { signer_name: 'X' } })
    await expect(signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: true }))
      .rejects.toThrow('no longer awaiting a response')
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
  })

  it('validates the selection against the proposal (bad package id)', async () => {
    mockSnapshot(sentDeposit('after_accept'))
    await expect(signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: true, selection: { package_id: 'ghost', optional_item_ids: [] } }))
      .rejects.toThrow('Invalid selection')
  })
})

describe('respondToProposal decline', () => {
  it('appends a declined event', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent' })
    await respondToProposal('tok', 'rejected')
    const arg = proposalUpdateSpy.mock.calls[0][0]
    expect(arg.status).toBe('rejected')
    // events appended via FieldValue.arrayUnion — assert the update carried an events mutation
    expect('events' in arg).toBe(true)
  })
})
```

> **Note on `deposit_due` in the first test:** compute the expected value from `depositAmount(computeSelectedTotal(proposal, selection), deposit)`. With the packaged base 12500 + optional 1500 = 14000, no discount, `tax_rate` unset in `sentDeposit` (remove `tax_rate` or account for it), 50% → 7000. Keep the fixture tax-free so the number is clean, or compute it inline in the test rather than hard-coding.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — in `actions/proposals-public.ts`:
  - Imports: add `import { headers } from 'next/headers'`, `import { FieldValue } from 'firebase-admin/firestore'` (for `arrayUnion`; confirm the import path matches the repo's other admin writes), `import { signedDocumentHash } from '@/lib/proposal-signature'`, `import { depositAmount } from '@/lib/proposals'`, `import { sendProposalSignedConfirmation } from '@/lib/email'`, and the new types.
  - Add a server-side capture helper:
    ```typescript
    async function requestContext(): Promise<{ ip: string; user_agent: string }> {
      const h = await headers()
      return {
        ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
        user_agent: h.get('user-agent') ?? 'unknown',
      }
    }
    ```
  - Grow `getPublicProposal` projection (conditional, like Increment 1): add `deposit_gate`, `deposit_terms`, `payment_status`, and a reduced `signed` when `proposal.signature` exists: `publicProposal.signed = { signer_name: proposal.signature.signer_name, signed_at: proposal.signature.signed_at }`. **Do NOT** project `signature.ip`/`user_agent`/`document_hash`/`signer_email`, `pending_signature`, or `events`.
  - `signProposal`:
    ```typescript
    export async function signProposal(token: string, input: {
      signer_name: string; signer_email: string; consent: boolean;
      selection?: { package_id?: string; optional_item_ids?: string[] };
    }): Promise<{ deposit_due: number; payment_status: PaymentStatus }> {
      // 1. shape validation (no zod)
      const name = typeof input?.signer_name === 'string' ? input.signer_name.trim() : ''
      const email = typeof input?.signer_email === 'string' ? input.signer_email.trim() : ''
      const optionalIds = input?.selection?.optional_item_ids ?? []
      if (!name || !email || !email.includes('@')) throw new Error('Invalid request')
      if (input?.consent !== true) throw new Error('You must consent to sign electronically')
      if (!Array.isArray(optionalIds)) throw new Error('Invalid request')

      const doc = await findProposalByToken(token)
      if (!doc) throw new Error('Proposal not found')
      const proposal = doc.data() as Proposal
      if (proposal.status !== 'sent' || proposal.signature) {
        throw new Error('This proposal is no longer awaiting a response')
      }

      // 2. validate the selection against THIS proposal (reuse the Increment-1 rules)
      const packages = proposal.packages ?? []
      const items = proposal.line_items ?? []
      const packageId = input.selection?.package_id
      if (packages.length > 0) {
        if (!packageId) throw new Error('Please select an option before accepting')
        if (!packages.some((p) => p.id === packageId)) throw new Error('Invalid selection')
      }
      const validOptional = new Set(items.filter((i) => i.optional === true && i.id !== undefined).map((i) => i.id as string))
      for (const id of optionalIds) if (!validOptional.has(id)) throw new Error('Invalid selection')

      // 3. server-authoritative computation + capture
      const now = new Date().toISOString()
      const { ip, user_agent } = await requestContext()
      const selection = {
        ...(packages.length > 0 && packageId ? { package_id: packageId } : {}),
        optional_item_ids: optionalIds,
        selected_total: computeSelectedTotal(proposal, { package_id: packageId, optional_item_ids: optionalIds }),
        selected_at: now,
      }
      const document_hash = signedDocumentHash(proposal, selection)
      const deposit_due = depositAmount(selection.selected_total, proposal.deposit)
      const payment_status: PaymentStatus = proposal.deposit ? 'deposit_pending' : 'not_required'

      const signature = { signer_name: name, signer_email: email, signed_at: now, ip, user_agent, consent_electronic: true as const, document_hash }
      await doc.ref.update({
        status: 'accepted', signature, selection, payment_status,
        client_response_at: now, updated_at: now,
        events: FieldValue.arrayUnion({ kind: 'signed', at: now, ip, user_agent }),
      })

      const orgRef = doc.ref.parent.parent
      if (orgRef) await orgRef.collection('leads').doc(proposal.lead_id).update({ stage: 'closed_won', updated_at: now })

      // best-effort confirmation email (don't fail the sign on email failure)
      try { await sendProposalSignedConfirmation({ to: email, signerName: name, token, signedAt: now }) } catch {}
      // TODO(activity): logActivity(orgId, { kind: 'proposal', summary: 'Proposal signed' })
      return { deposit_due, payment_status }
    }
    ```
  - **Retire the un-audited accept path (no signature-narrowing, to avoid cross-task tsc breakage):** acceptance now happens ONLY via `signProposal`. **Keep** `respondToProposal(token, response: 'accepted' | 'rejected')`'s signature (the Increment-1 component still calls it until Task 6), but make the `accepted` branch immediately `throw new Error('Acceptance now requires signing')` — deleting its selection-snapshot + `closed_won` logic (that now lives in `signProposal`). Keep the reject path and append `events: FieldValue.arrayUnion({ kind: 'declined', at: now, ...(await requestContext()) })`. **Update the Increment-1 tests:** change the two `respondToProposal` accept tests ("accepts a sent proposal…", the isolation test) to assert the accept branch now **throws** and writes nothing; move the positive accept/selection/isolation coverage into the `signProposal` tests above (re-express the isolation assertion — org resolved from the doc path — against `signProposal`). Keep the reject, already-responded, unknown-token, and invalid-response tests.
  - Add `recordProposalView(token)`: find by token; if found & `status !== 'draft'`, `doc.ref.update({ events: FieldValue.arrayUnion({ kind: 'viewed', at: now, ...ctx }) })`; swallow errors (best-effort).

- [ ] **Step 4: Add `sendProposalSignedConfirmation` to `lib/email.ts`** — follow the existing Resend helpers in that file (same `from`/domain handling). Minimal: subject "You signed your proposal", body with the signer name, date, and the link `${baseUrl}/proposals/${token}`. If the existing helpers require an org sending-domain, keep it best-effort/optional for the public signer email.

- [ ] **Step 5: Run tests** — targeted PASS; existing projection/exact-key tests updated only if needed (new fields are absent on their fixtures, so they stay green); `npx tsc --noEmit` clean; `npx vitest run` green.

- [ ] **Step 6: Commit**

```bash
git add actions/proposals-public.ts lib/email.ts __tests__/actions/proposals-public.test.ts
git commit -m "feat(proposals): signProposal — server-captured audit e-signature + decline/view events + signer email"
```

**REVIEW GATE:** security review after this task — server-authoritative capture, no PII leak in the public projection, selection validation, lock/idempotency, consent required.

---

### Task 4: Deposit PaymentIntent route + webhook finalization

**Files:**
- Create: `app/api/payments/proposal-deposit/intent/route.ts`
- Modify: `app/api/payments/webhook/route.ts`
- Test: `__tests__/api/proposal-deposit-intent.test.ts`, extend `__tests__/api/payments-webhook.test.ts`

**Interfaces:**
- Consumes: `computeSelectedTotal`, `depositAmount`, `signedDocumentHash`, request-context capture.
- Produces: `POST /api/payments/proposal-deposit/intent` → `{ clientSecret, stripeAccountId }`; webhook handles `metadata.purpose === 'proposal_deposit'`.

- [ ] **Step 1: Write the failing intent-route test** — `__tests__/api/proposal-deposit-intent.test.ts`, mocking `@/lib/stripe`, `@/lib/firebase-admin` (collectionGroup token lookup), and `next/headers` (as in Task 3). Cover:
  - a `sent` proposal with a deposit → creates a PaymentIntent on `org.stripe_account_id` with `amount = round(deposit_due*100)`, `application_fee_amount = 1%`, `metadata.purpose === 'proposal_deposit'` and `metadata.proposal_id`; returns `{ clientSecret, stripeAccountId }`.
  - the amount is **server-computed** (`depositAmount(computeSelectedTotal(...), deposit)`) — a client-sent amount is ignored/absent.
  - proposal without a deposit → 400; unknown token → 404; org without `stripe_account_id` → 400.
  - `gate === 'before_accept'` with a valid `signer`/`consent`/`selection` in the body → also writes `pending_signature` (with server ip/ua/hash) onto the proposal doc before creating the intent.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `app/api/payments/proposal-deposit/intent/route.ts`** — mirror `app/api/payments/intent/route.ts` structure (Connect account, 1% fee, error handling), but resolve the proposal by token via `adminDb.collectionGroup('proposals').where('token','==',token).limit(1)`; derive the org from `doc.ref.parent.parent` and read `org.stripe_account_id`; compute the amount server-side; set `metadata: { purpose: 'proposal_deposit', proposal_id: proposal.id, token }`. When the request body carries `signer`/`consent`/`selection` (before_accept), validate them exactly as `signProposal` does, capture ip/ua via `await headers()`, compute the `document_hash`, and `doc.ref.update({ pending_signature: {...} })` **before** creating the intent. Never trust a client amount.

- [ ] **Step 4: Extend the webhook** (`app/api/payments/webhook/route.ts`) — inside the existing `payment_intent.succeeded` block, branch first on `pi.metadata?.purpose === 'proposal_deposit'`:
  ```typescript
  if (pi.metadata?.purpose === 'proposal_deposit') {
    const proposalId = pi.metadata.proposal_id
    const snap = await adminDb.collectionGroup('proposals').where('id', '==', proposalId).limit(1).get()
    if (snap.empty) return new Response('ok')
    const ref = snap.docs[0].ref
    const proposal = snap.docs[0].data() as Proposal
    if (proposal.payment_status === 'deposit_paid') return new Response('ok') // idempotent
    const now = new Date().toISOString()
    const update: Record<string, unknown> = {
      payment_status: 'deposit_paid',
      deposit_payment: { intent_id: pi.id, amount: pi.amount / 100, paid_at: now },
      updated_at: now,
      events: FieldValue.arrayUnion({ kind: 'deposit_paid', at: now }),
    }
    // before_accept: promote the pending signature and finalize the close
    if (!proposal.signature && proposal.pending_signature) {
      const ps = proposal.pending_signature
      update.status = 'accepted'
      update.selection = ps.selection
      update.signature = { signer_name: ps.signer_name, signer_email: ps.signer_email, signed_at: now, ip: ps.ip, user_agent: ps.user_agent, consent_electronic: true, document_hash: ps.document_hash }
      update.client_response_at = now
      update.pending_signature = FieldValue.delete()
      update.events = FieldValue.arrayUnion({ kind: 'signed', at: now, ip: ps.ip, user_agent: ps.user_agent }, { kind: 'deposit_paid', at: now })
      const orgRef = ref.parent.parent
      if (orgRef) await orgRef.collection('leads').doc(proposal.lead_id).update({ stage: 'closed_won', updated_at: now })
    }
    await ref.update(update)
    try { /* best-effort signed/paid confirmation email */ } catch {}
    return new Response('ok')
  }
  ```
  Keep the existing `familyId` registration path untouched below this branch. Import `FieldValue` and `Proposal`.

- [ ] **Step 5: Extend `__tests__/api/payments-webhook.test.ts`** — a `proposal_deposit` success for a `before_accept` proposal (with `pending_signature`) finalizes `accepted` + `deposit_paid` + advances `closed_won`; a second identical event is a **no-op** (idempotent); an `after_accept` proposal (already `accepted`, has `signature`) just sets `deposit_paid` without re-advancing. Follow the file's existing Stripe-event mock style.

- [ ] **Step 6: Run tests + typecheck + commit**

```bash
git add app/api/payments/proposal-deposit __tests__/api/proposal-deposit-intent.test.ts app/api/payments/webhook/route.ts __tests__/api/payments-webhook.test.ts
git commit -m "feat(proposals): Connect deposit PaymentIntent route + idempotent webhook finalize (atomic before_accept)"
```

**REVIEW GATE:** security review — server-authoritative amount, Stripe-sig-verified webhook, idempotency, proposal identified from metadata only, `pending_signature` never client-trusted for the final record beyond the captured fields.

---

### Task 5: Admin builder UI — gate, terms, sign-lock, audit panel

**Files:**
- Modify: `components/admin/ProposalEditorClient.tsx`

No new vitest; gate is `tsc --noEmit` + `next build` (Task 7).

- [ ] **Step 1: Deposit gate + terms controls.** When a deposit term is set (existing Increment-1 deposit state is non-empty), render: a **gate toggle** (`<select>` or segmented buttons) bound to `deposit_gate`, options "Request deposit after acceptance" (`after_accept`, **default**) and "Require deposit before accepting" (`before_accept`); and a **deposit-terms** `<textarea>` bound to `deposit_terms` (label "Cancellation / refund policy (shown to the client at signing)"). Include both in the `updateProposal` save payload. Default `deposit_gate` to `'after_accept'` when a deposit exists and none is set.

- [ ] **Step 2: Sign-lock.** If `proposal.signature` is present, render the whole editor **read-only**: disable all inputs and the Save button, and show a notice "This proposal is signed and locked. Create a new version to make changes." (Versioning is a later increment — just block edits.)

- [ ] **Step 3: Signature & audit panel.** When `proposal.signature` is present, render a read-only Card "Signature & audit" showing: signer name + email; `signed_at` (UTC); **IP**; user-agent; `document_hash` (monospace, truncatable); `payment_status` + `deposit_payment.amount` + `paid_at` when present; and the `events` list (kind + time + ip). This is the admin's audit surface.

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; `npx vitest run` green (unchanged). Commit:

```bash
git add components/admin/ProposalEditorClient.tsx
git commit -m "feat(proposals): builder — deposit gate + terms, sign-lock, signature & audit panel"
```

---

### Task 6: Public sign + deposit UI

**Files:**
- Modify: `components/proposals/ProposalResponseClient.tsx`
- Create: `components/proposals/ProposalDepositPayment.tsx` (the Elements sub-component)

No new vitest; `tsc` + `next build` gate (Task 7).

**Interfaces:** consumes `signProposal`, `recordProposalView` (Task 3); the intent route (Task 4); `@stripe/react-stripe-js` (mirror `components/registration/steps/PaymentStep.tsx`).

- [ ] **Step 1: View logging.** On mount, call `recordProposalView(token)` once (fire-and-forget).

- [ ] **Step 2: Sign step.** Replace the Increment-1 "Accept" with a **sign form**: typed `signer_name`, `signer_email`, and an **"I agree to the terms above and consent to sign electronically"** checkbox; render `proposal.deposit_terms` (when present) directly above the checkbox. Keep the existing selection UI above it. Block submit until name+email+consent are filled (client guard; the server re-validates).

- [ ] **Step 3: Gate-aware submit.**
  - **No deposit OR `after_accept`:** on submit call `signProposal(token, { signer_name, signer_email, consent, selection })`. On success show the "Signed" confirmation (locked total, signer name). If the result's `payment_status === 'deposit_pending'`, render `<ProposalDepositPayment>` as an **optional** "Pay deposit now" section below the confirmation.
  - **`before_accept` + deposit:** after capturing name/email/consent, do **not** call `signProposal`; instead render `<ProposalDepositPayment>` in `before_accept` mode, passing the signer fields + selection so the intent route stashes the `pending_signature`. On `confirmPayment` success, show "Payment received — finalizing your acceptance" and refetch `getPublicProposal(token)` to reflect the webhook-finalized `accepted`/`signed`/`deposit_paid` state (poll a couple times if still `sent`).

- [ ] **Step 4: `ProposalDepositPayment.tsx`** — mirror `PaymentStep.tsx`: `fetch('/api/payments/proposal-deposit/intent', { body: JSON.stringify({ token, ...(beforeAccept ? { signer, consent, selection } : {}) }) })` → `{ clientSecret, stripeAccountId }`; `loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, { stripeAccount: stripeAccountId })`; `<Elements options={{ clientSecret }}>` + `<PaymentElement>` + `confirmPayment({ elements, redirect: 'if_required' })`; call `onSuccess()` on success. Show the deposit amount (from the intent response or a passed prop). Loading/error states as in `PaymentStep`.

- [ ] **Step 5: Confirmation & already-responded states.** When `proposal.signed` (public projection) is present on load, render the signed confirmation (signer name + `signed_at`, locked total, `payment_status`) instead of the sign form. Keep the decline path (`respondToProposal(token,'rejected')`).

- [ ] **Step 6: Verify + commit** — `npx tsc --noEmit` clean; `npx vitest run` green.

```bash
git add components/proposals/ProposalResponseClient.tsx components/proposals/ProposalDepositPayment.tsx
git commit -m "feat(proposals): public sign step + Stripe deposit (Elements), gate-aware close"
```

---

### Task 7: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run` → all green; record the count.
- [ ] **Step 3:** `npx next build` (copy env if present: `cp /Users/rm/vw/traxevent/.env.local .env.local`, build, then `rm -f .env.local`) → succeeds; the new route `/api/payments/proposal-deposit/intent` and the existing proposal routes compile.
- [ ] **Step 4:** Manual smoke (optional, `npm run dev`): build a packaged proposal with a 50% deposit set to `before_accept`, open the public link, select + sign + pay a test card, and confirm the webhook flips it to accepted/deposit_paid and the admin audit panel shows signer + ip + hash. Then a second proposal with `after_accept` (sign closes immediately; deposit optional). Then one with no deposit (sign-only).
- [ ] **Step 5:** Commit this plan file.
- [ ] **Step 6:** Hand back for branch finish (rebase onto latest `origin/main`, green gate, PR).

---

## Self-Review

**Spec coverage** (against `2026-08-05-proposals-commitment-design.md`):
- Three states (`status` / `payment_status` / signature-presence) → Task 1 ✅
- Audit-trail signature (server ip/ua/timestamp/consent/document_hash) → Tasks 1, 3 ✅
- `document_hash` canonical + lock → Tasks 1, 2, 3 ✅
- Per-proposal `deposit_gate` (default `after_accept`) + `deposit_terms` → Tasks 2, 5, 6 ✅
- `signProposal` (after_accept/no-deposit) → Task 3 ✅
- Deposit PaymentIntent (Connect, server amount) + webhook atomic `before_accept` finalize (idempotent) → Task 4 ✅
- Append-only `events` (sent/viewed/signed/deposit_paid/declined) → Tasks 3, 4 ✅
- Reduced public projection (no ip/ua/hash/email leak) → Task 3 ✅
- Admin audit panel + sign-lock → Tasks 2, 5 ✅
- Public sign + deposit UI (Elements reuse) → Task 6 ✅
- Retention: signer confirmation email + persistent token view → Tasks 3, 6 ✅
- Runtime validation without zod → Tasks 3, 4 ✅
- Reuse of `/api/payments/intent` pattern, `PaymentStep`, webhook → Tasks 4, 6 ✅

**Placeholder scan:** critical-path tasks (1–4) carry real code and tests; UI tasks (5–6) give concrete state/props, the exact save/submit payloads, and the reuse component to mirror.

**Type consistency:** `signedDocumentHash`/`canonicalProposalDocument` (Task 1) are consumed by Task 3 (action) and Task 4 (route/webhook); `PaymentStatus`, `ProposalSignature`, `ProposalEvent`, `PendingSignature` (Task 1) flow through Tasks 3–6; `signProposal(token, input)` and `recordProposalView(token)` (Task 3) match their Task-6 callers; `metadata.purpose === 'proposal_deposit'` + `proposal_id` are identical across the route (Task 4) and the webhook (Task 4). Accept advances to `closed_won` everywhere.
