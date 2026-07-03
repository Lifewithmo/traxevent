# Phase 5b: Proposal Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a Lead, an org admin builds an itemized service **proposal** (line items: description × qty × unit price → total). Each proposal has an unguessable shareable link where the prospective **client accepts or rejects it without logging in**. Accepting advances the lead to **Booked**.

**Architecture:** Proposals live flat at `orgs/{orgId}/proposals/{proposalId}` (mirrors `orgs/{orgId}/invitations/{token}`), each carrying `org_id`, `lead_id`, and a `token`. The public accept/reject flow looks a proposal up by token via `collectionGroup('proposals').where('token','==',token)` (single-field equality → no composite index) — the token IS the authorization, so those actions use `adminDb` directly and are not `assert*`-gated. Admin CRUD is `assertOrgMember` (read) / `assertOrgAdmin` (mutate). Money is in dollars; totals are computed by pure helpers, not denormalized.

**Tech Stack:** Next.js 16 App Router (`params` is a Promise), Firebase Admin, Vitest. UI primitives: `@/components/ui/{card,button,input,label,badge}` + native `<select>`/`<textarea>`.

**Baseline:** 398 tests passing (run `npm install` first so the `server-only` shim resolves).

---

### Task 1: Proposal types + pure helpers

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/proposals.ts`
- Create: `__tests__/lib/proposals.test.ts`

- [ ] **Step 1: Write the failing test** — `__tests__/lib/proposals.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { PROPOSAL_STATUSES, PROPOSAL_STATUS_LABELS, lineItemSubtotal, proposalTotal } from '@/lib/proposals'
import type { ProposalLineItem } from '@/lib/types'

const item = (quantity: number, unit_price: number): ProposalLineItem => ({ description: 'x', quantity, unit_price })

describe('PROPOSAL_STATUSES', () => {
  it('is the four statuses in order with labels', () => {
    expect(PROPOSAL_STATUSES).toEqual(['draft', 'sent', 'accepted', 'rejected'])
    for (const s of PROPOSAL_STATUSES) expect(PROPOSAL_STATUS_LABELS[s]).toBeTruthy()
  })
})

describe('lineItemSubtotal', () => {
  it('multiplies qty by unit price rounded to cents', () => {
    expect(lineItemSubtotal(item(3, 45.99))).toBe(137.97)
    expect(lineItemSubtotal(item(1, 100))).toBe(100)
  })
  it('treats missing/negative as zero', () => {
    expect(lineItemSubtotal(item(-2, 50))).toBe(0)
    expect(lineItemSubtotal(item(2, -5))).toBe(0)
  })
})

describe('proposalTotal', () => {
  it('sums line-item subtotals rounded to cents', () => {
    expect(proposalTotal([item(2, 50), item(1, 45.99)])).toBe(145.99)
    expect(proposalTotal([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/lib/proposals.test.ts` → FAIL (cannot resolve `@/lib/proposals`).

- [ ] **Step 3: Update `lib/types.ts`** — add near the Lead types:

```typescript
export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'rejected'

export interface ProposalLineItem {
  description: string
  quantity: number
  unit_price: number   // dollars (may be decimal)
}

export interface Proposal {
  id: string
  org_id: string        // denormalized for collectionGroup token lookups
  lead_id: string
  token: string         // unguessable public link token
  title?: string
  status: ProposalStatus
  line_items: ProposalLineItem[]
  notes?: string
  client_response_at?: string   // set when the client accepts/rejects
  created_at: string
  updated_at?: string
}
```

- [ ] **Step 4: Create `lib/proposals.ts`**

```typescript
import type { ProposalLineItem, ProposalStatus } from '@/lib/types'

export const PROPOSAL_STATUSES: ProposalStatus[] = ['draft', 'sent', 'accepted', 'rejected']

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Subtotal for one line item; non-positive qty or price yields 0.
export function lineItemSubtotal(item: ProposalLineItem): number {
  const qty = item.quantity
  const price = item.unit_price
  if (!(qty > 0) || !(price > 0)) return 0
  return round2(qty * price)
}

export function proposalTotal(lineItems: ProposalLineItem[]): number {
  return round2(lineItems.reduce((sum, item) => sum + lineItemSubtotal(item), 0))
}
```

- [ ] **Step 5: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/proposals.ts "__tests__/lib/proposals.test.ts"
git commit -m "feat: Proposal types + line-item/total pure helpers"
```

---

### Task 2: Admin proposal actions (CRUD + send)

**Files:**
- Create: `actions/proposals.ts`
- Create: `__tests__/actions/proposals.test.ts`

- [ ] **Step 1: Write the failing tests** — mirror `__tests__/actions/leads.test.ts` mock style.

Hoisted spies; mock `@/lib/firebase-admin` so `adminDb.collection('orgs').doc(orgId).collection('proposals')` exposes `.doc(id?)` → `{ id: id ?? 'new-proposal-id', set, get, update, delete }` and `.where('lead_id','==',v).orderBy('created_at','desc').get()` → `listProposalsSpy`. Mock `@/lib/auth/assert` (`assertOrgMember`/`assertOrgAdmin` → resolve `{ role: 'admin' }`). Mock `@/lib/tokens` `generateAccessToken` → a fixed `'tok_test'`. Cover:
- **createProposal**: writes a proposal with a generated `id`, `token: 'tok_test'`, `org_id`, `lead_id`, `status: 'draft'`, `created_at`, and the passed `line_items`/`title`; returns it. Defaults `line_items` to `[]` when omitted.
- **listProposals**: uses `where('lead_id','==',leadId).orderBy('created_at','desc')`; returns mapped docs.
- **getProposal**: `null` when the doc doesn't exist; the proposal when it does.
- **updateProposal**: passes through `title`/`notes`/`line_items`/`status`; always sets `updated_at`. Throws `'Invalid status'` when `updates.status` not in `PROPOSAL_STATUSES`.
- **sendProposal**: `update({ status: 'sent', updated_at })`.
- **deleteProposal**: `.delete()`.

- [ ] **Step 2: Run to verify it fails** — FAIL (module/exports missing).

- [ ] **Step 3: Create `actions/proposals.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { generateAccessToken } from '@/lib/tokens'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { PROPOSAL_STATUSES } from '@/lib/proposals'
import type { Proposal, ProposalLineItem, ProposalStatus } from '@/lib/types'

function proposalsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('proposals')
}

export interface CreateProposalInput {
  title?: string
  line_items?: ProposalLineItem[]
  notes?: string
}

export async function listProposals(orgId: string, leadId: string): Promise<Proposal[]> {
  await assertOrgMember(orgId)
  const snap = await proposalsRef(orgId).where('lead_id', '==', leadId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Proposal)
}

export async function getProposal(orgId: string, proposalId: string): Promise<Proposal | null> {
  await assertOrgMember(orgId)
  const snap = await proposalsRef(orgId).doc(proposalId).get()
  return snap.exists ? (snap.data() as Proposal) : null
}

export async function createProposal(orgId: string, leadId: string, input: CreateProposalInput): Promise<Proposal> {
  await assertOrgAdmin(orgId)
  const id = randomBytes(8).toString('hex')
  const proposal: Proposal = {
    id,
    org_id: orgId,
    lead_id: leadId,
    token: generateAccessToken(),
    status: 'draft',
    line_items: input.line_items ?? [],
    created_at: new Date().toISOString(),
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await proposalsRef(orgId).doc(id).set(proposal)
  return proposal
}

export interface ProposalUpdate {
  title?: string
  notes?: string
  line_items?: ProposalLineItem[]
  status?: ProposalStatus
}

export async function updateProposal(orgId: string, proposalId: string, updates: ProposalUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  if (updates.status && !PROPOSAL_STATUSES.includes(updates.status)) throw new Error('Invalid status')
  await proposalsRef(orgId).doc(proposalId).update({ ...updates, updated_at: new Date().toISOString() })
}

export async function sendProposal(orgId: string, proposalId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await proposalsRef(orgId).doc(proposalId).update({ status: 'sent', updated_at: new Date().toISOString() })
}

export async function deleteProposal(orgId: string, proposalId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await proposalsRef(orgId).doc(proposalId).delete()
}
```

- [ ] **Step 4: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 5: Commit**

```bash
git add actions/proposals.ts "__tests__/actions/proposals.test.ts"
git commit -m "feat: org-scoped proposal actions (CRUD + send)"
```

---

### Task 3: Public token actions (view + accept/reject) — advances lead

**Files:**
- Create: `actions/proposals-public.ts`
- Create: `__tests__/actions/proposals-public.test.ts`

**SECURITY-RELEVANT:** unauthenticated; token is the sole authorization; must not expose drafts; must safely advance the lead stage.

- [ ] **Step 1: Write the failing tests** — `__tests__/actions/proposals-public.test.ts`

Hoisted spies; mock `@/lib/firebase-admin` so:
- `adminDb.collectionGroup('proposals').where('token','==',t).limit(1).get()` → configurable `{ empty, docs: [{ data, ref }] }`, where `ref` has `.update` (proposalUpdateSpy) and `.parent.parent` → `{ id: 'org-1', collection('leads').doc(leadId) → { update: leadUpdateSpy } }`.
Cover:
- **getPublicProposal(token)**: unknown token (empty) → `null`. A `draft` proposal → `null` (drafts are not publicly viewable). A `sent`/`accepted`/`rejected` proposal → the proposal object.
- **respondToProposal(token, 'accepted')**: for a `sent` proposal → updates the proposal `{ status: 'accepted', client_response_at }` AND advances the lead: `orgs/org-1/leads/{lead_id}.update({ stage: 'booked', updated_at })`. Returns the updated status (or void — assert the two update calls).
- **respondToProposal(token, 'rejected')**: for a `sent` proposal → proposal `{ status: 'rejected', client_response_at }`, and does NOT advance the lead (no lead update).
- **respondToProposal** on a non-`sent` proposal (e.g. already `accepted`, or `draft`) → throws `'This proposal is no longer awaiting a response'`; no writes.
- **respondToProposal** with unknown token → throws `'Proposal not found'`.
- **respondToProposal** with an invalid response value → throws `'Invalid response'`.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Create `actions/proposals-public.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { Proposal } from '@/lib/types'

async function findProposalByToken(token: string) {
  const snap = await adminDb.collectionGroup('proposals').where('token', '==', token).limit(1).get()
  if (snap.empty) return null
  return snap.docs[0]
}

// PUBLIC (token = authorization). Drafts are never exposed.
export async function getPublicProposal(token: string): Promise<Proposal | null> {
  const doc = await findProposalByToken(token)
  if (!doc) return null
  const proposal = doc.data() as Proposal
  if (proposal.status === 'draft') return null
  return proposal
}

// PUBLIC. Client accepts or rejects. Accepting advances the lead to 'booked'.
export async function respondToProposal(token: string, response: 'accepted' | 'rejected'): Promise<void> {
  if (response !== 'accepted' && response !== 'rejected') throw new Error('Invalid response')
  const doc = await findProposalByToken(token)
  if (!doc) throw new Error('Proposal not found')
  const proposal = doc.data() as Proposal
  if (proposal.status !== 'sent') throw new Error('This proposal is no longer awaiting a response')

  const now = new Date().toISOString()
  await doc.ref.update({ status: response, client_response_at: now, updated_at: now })

  if (response === 'accepted') {
    const orgRef = doc.ref.parent.parent
    if (orgRef) {
      await orgRef.collection('leads').doc(proposal.lead_id).update({ stage: 'booked', updated_at: now })
    }
  }
}
```

- [ ] **Step 4: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 5: Commit**

```bash
git add actions/proposals-public.ts "__tests__/actions/proposals-public.test.ts"
git commit -m "feat: public proposal view + accept/reject by token (accept advances lead to booked)"
```

**REVIEW GATE:** security review after this task — unauthenticated token flow, no draft exposure, no cross-tenant writes, correct lead advance, idempotency of a double-accept.

---

### Task 4: Admin UI — proposals on lead detail + proposal editor

**Files:**
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`
- Create: `components/admin/LeadProposalsClient.tsx`
- Create: `app/(admin)/[orgSlug]/leads/[leadId]/proposals/[proposalId]/page.tsx`
- Create: `components/admin/ProposalEditorClient.tsx`

No new vitest tests; `npx tsc --noEmit` + `npx vitest run` stay green (`next build` verified in Task 6).

- [ ] **Step 1: Fetch proposals on the lead detail page** — `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`

After resolving `orgId` and `lead`, also fetch `const proposals = await listProposals(orgId, leadId)` (import from `@/actions/proposals`) and render `<LeadProposalsClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} proposals={proposals} />` below the existing `<LeadDetailClient .../>` (wrap both in a fragment/div).

- [ ] **Step 2: `components/admin/LeadProposalsClient.tsx`** (`'use client'`)

Props `{ orgId: string; orgSlug: string; leadId: string; proposals: Proposal[] }`. A Card "Proposals":
- List each proposal: `title || 'Untitled proposal'`, a status `Badge` (`PROPOSAL_STATUS_LABELS[status]`), the computed total (`proposalTotal(p.line_items)`, formatted `$${n.toFixed(2)}`), a link "Edit" → `/${orgSlug}/leads/${leadId}/proposals/${p.id}`, and (when `status !== 'draft'`) a "Copy client link" button copying `${window.location.origin}/proposals/${p.token}`.
- "New proposal" button → `await createProposal(orgId, leadId, {})` then `router.push(`/${orgSlug}/leads/${leadId}/proposals/${created.id}`)`.
- Empty state + `error` aria-live region. Imports: `createProposal` from `@/actions/proposals`; `proposalTotal, PROPOSAL_STATUS_LABELS` from `@/lib/proposals`; `Proposal` from `@/lib/types`; UI + `useRouter`.

- [ ] **Step 3: Proposal editor page** — `app/(admin)/[orgSlug]/leads/[leadId]/proposals/[proposalId]/page.tsx`

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getProposal } from '@/actions/proposals'
import { ProposalEditorClient } from '@/components/admin/ProposalEditorClient'

export default async function ProposalEditorPage({ params }: { params: Promise<{ orgSlug: string; leadId: string; proposalId: string }> }) {
  const { orgSlug, leadId, proposalId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const proposal = await getProposal(orgId, proposalId)
  if (!proposal || proposal.lead_id !== leadId) notFound()
  return <ProposalEditorClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} proposal={proposal} />
}
```

- [ ] **Step 4: `components/admin/ProposalEditorClient.tsx`** (`'use client'`)

Props `{ orgId, orgSlug, leadId, proposal }`. Behavior:
- Title `<input>`; notes `<textarea>`; an editable **line-items table**: each row = description `<input>`, quantity `<input type="number">`, unit price `<input type="number">`, a live subtotal (`lineItemSubtotal`), and a "Remove" button. An "Add line item" button appends a blank row (local state `ProposalLineItem[]`). A live **grand total** (`proposalTotal`), formatted `$${n.toFixed(2)}`.
- "Save" → `await updateProposal(orgId, proposal.id, { title: title.trim() || undefined-as-appropriate, notes, line_items })`. (Filter out fully-blank rows before saving.) Show a saved notice.
- "Send to client" → `await sendProposal(orgId, proposal.id)`; then show the shareable link `${window.location.origin}/proposals/${proposal.token}` with a Copy button. A status `Badge`.
- "Delete" (confirm) → `await deleteProposal(orgId, proposal.id)` then `router.push(`/${orgSlug}/leads/${leadId}`)`.
- Back link to the lead. `error`/`notice` aria-live. Imports: `updateProposal, sendProposal, deleteProposal` from `@/actions/proposals`; `lineItemSubtotal, proposalTotal, PROPOSAL_STATUS_LABELS` from `@/lib/proposals`; `Proposal, ProposalLineItem` from `@/lib/types`; UI + `useRouter`.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/[orgSlug]/leads/[leadId]/page.tsx" components/admin/LeadProposalsClient.tsx "app/(admin)/[orgSlug]/leads/[leadId]/proposals/[proposalId]/page.tsx" components/admin/ProposalEditorClient.tsx
git commit -m "feat: proposals on lead detail + line-item proposal editor"
```

---

### Task 5: Public proposal page (client accept/reject)

**Files:**
- Create: `app/(public)/proposals/[token]/page.tsx`
- Create: `components/proposals/ProposalResponseClient.tsx`

- [ ] **Step 1: Public page** — `app/(public)/proposals/[token]/page.tsx`

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getPublicProposal } from '@/actions/proposals-public'
import { ProposalResponseClient } from '@/components/proposals/ProposalResponseClient'

export default async function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const proposal = await getPublicProposal(token)
  if (!proposal) notFound()
  return <ProposalResponseClient token={token} proposal={proposal} />
}
```

- [ ] **Step 2: `components/proposals/ProposalResponseClient.tsx`** (`'use client'`)

Props `{ token: string; proposal: Proposal }`. A clean, self-contained public page (renders outside the admin shell, like the portal view):
- Header: `proposal.title || 'Proposal'`.
- Line-items table: description, qty, unit price, subtotal (`lineItemSubtotal`); a grand total (`proposalTotal`), formatted `$${n.toFixed(2)}`. Notes if present.
- If `proposal.status === 'sent'`: **Accept** and **Decline** buttons → `await respondToProposal(token, 'accepted'|'rejected')`; on success set local state to show a thank-you ("Thanks — you've accepted this proposal." / "You've declined this proposal."). Loading + error states.
- If `proposal.status === 'accepted'`/`'rejected'`: show the already-responded message instead of buttons (no re-response).
- Imports: `respondToProposal` from `@/actions/proposals-public`; `lineItemSubtotal, proposalTotal` from `@/lib/proposals`; `Proposal` from `@/lib/types`; UI from `@/components/ui/{card,button}`.

- [ ] **Step 3: Verify**

- `npx tsc --noEmit` clean.
- `npx vitest run` all green.
- `npx next build` (copy env: `cp /Users/rm/vw/traxevent/.env.local .env.local`, build, then `rm -f .env.local`) → succeeds; routes `/[orgSlug]/leads/[leadId]/proposals/[proposalId]` and `/proposals/[token]` appear; no collisions.

- [ ] **Step 4: Commit** (do NOT add `.env.local`)

```bash
git add "app/(public)/proposals/[token]/page.tsx" components/proposals/ProposalResponseClient.tsx
git commit -m "feat: public proposal page — client accept/reject"
```

---

### Task 6: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run` → all green; record final count.
- [ ] **Step 3:** `npx next build` (with `.env.local`) → succeeds; confirm the two new routes + no collisions.
- [ ] **Step 4:** Commit this plan file (`docs: phase 5b ...`).
- [ ] **Step 5:** Hand back for branch finish (push + PR + squash-merge as `Lifewithmo`, verify prod deploy).

---

## Self-Review

**Spec coverage:** Roadmap "Proposal builder (create itemized service proposals, client accept/reject)": itemized line items + totals (Task 1/4), org-admin CRUD + send (Task 2), public token accept/reject that advances the lead (Task 3/5), admin UI on the lead + editor (Task 4), public client page (Task 5). Covered. Proposals attach to the Phase 5a lead.

**Placeholder scan:** Types, helpers, actions, and pages are verbatim. The three client components are specified behaviorally with exact prop types, action names, and reference components (`LeadDetailClient`, portal view) — acceptable for mechanical UI.

**Type consistency:** `Proposal`/`ProposalLineItem`/`ProposalStatus` (Task 1) are used by `lib/proposals.ts`, both action files, and all UI. `proposalTotal`/`lineItemSubtotal`/`PROPOSAL_STATUS_LABELS`/`PROPOSAL_STATUSES` signatures match across def and callers. `createProposal(orgId, leadId, input)` / `updateProposal(orgId, id, ProposalUpdate)` / `sendProposal` / `deleteProposal` / `getProposal` / `listProposals(orgId, leadId)` match their UI callers. `getPublicProposal(token)` / `respondToProposal(token, response)` match the public page.

**Security note:** Admin actions are `assertOrgMember`(read)/`assertOrgAdmin`(mutate), path-isolated to `orgs/{orgId}/proposals`. Public actions authorize solely by the 48-hex-char `token` via `collectionGroup` exact-match: `getPublicProposal` never returns a `draft`; `respondToProposal` only mutates a `sent` proposal (double-accept/reject throws, no writes), sets the response on the token's own proposal, and advances only that proposal's own lead (resolved via `ref.parent.parent`, never client input) — so no cross-tenant writes. Accepting advances to `booked`; rejecting leaves the stage untouched.
