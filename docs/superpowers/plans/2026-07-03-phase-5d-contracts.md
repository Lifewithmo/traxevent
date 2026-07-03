# Phase 5d: Contracts + E-Signature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a Lead, an org admin authors a **contract** (terms text and/or a link to an externally-hosted document) and shares a public link where the client reviews it and **e-signs** (typed name + agreement → captures signer name + timestamp). Signed contracts also surface in the client portal.

**Architecture:** Mirrors the Phase 5b/5c proposal/invoice architecture. Contracts live flat at `orgs/{orgId}/contracts/{contractId}` with `org_id`, `lead_id`, `token`. Admin CRUD + send are `assertOrgMember`(read)/`assertOrgAdmin`(mutate). Public view + sign resolve by token via `collectionGroup('contracts').where('token','==',token)` (token = authorization). "Upload" is handled as a `document_url` field (paste a hosted PDF/Doc link) — consistent with the existing `logo_url` convention; **native file upload via Firebase Storage is a deferred follow-up** (Storage is not currently wired). E-signature is typed-name click-to-sign (captures `signed_by` + `signed_at`). New route `/contracts/[token]`. The client portal (Phase 5e) gains a contracts section.

**Tech Stack:** Next.js 16 App Router (`params` is a Promise), Firebase Admin, Vitest. UI primitives: `@/components/ui/{card,button,input,label,badge}` + native `<textarea>`.

**Baseline:** 459 tests passing (run `npm install` first so the `server-only` shim resolves).

---

### Task 1: Contract types + pure helpers

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/contracts.ts`
- Create: `__tests__/lib/contracts.test.ts`

- [ ] **Step 1: Write the failing test** — `__tests__/lib/contracts.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { CONTRACT_STATUSES, CONTRACT_STATUS_LABELS, canSignContract } from '@/lib/contracts'

describe('CONTRACT_STATUSES', () => {
  it('is the three statuses with labels', () => {
    expect(CONTRACT_STATUSES).toEqual(['draft', 'sent', 'signed'])
    for (const s of CONTRACT_STATUSES) expect(CONTRACT_STATUS_LABELS[s]).toBeTruthy()
  })
})

describe('canSignContract', () => {
  it('is signable only when sent', () => {
    expect(canSignContract('sent')).toBe(true)
    expect(canSignContract('draft')).toBe(false)
    expect(canSignContract('signed')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/lib/contracts.test.ts` → FAIL.

- [ ] **Step 3: Update `lib/types.ts`** — add near the Invoice types:

```typescript
export type ContractStatus = 'draft' | 'sent' | 'signed'

export interface Contract {
  id: string
  org_id: string       // denormalized for collectionGroup token lookups
  lead_id: string
  token: string        // unguessable public link token
  title?: string
  body?: string        // contract terms (plain text)
  document_url?: string // optional link to an externally-hosted document (PDF/Doc)
  status: ContractStatus
  signed_by?: string   // typed signer name (e-signature)
  signed_at?: string   // ISO, set when signed
  created_at: string
  updated_at?: string
}
```

- [ ] **Step 4: Create `lib/contracts.ts`**

```typescript
import type { ContractStatus } from '@/lib/types'

export const CONTRACT_STATUSES: ContractStatus[] = ['draft', 'sent', 'signed']

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'Draft',
  sent: 'Awaiting signature',
  signed: 'Signed',
}

// A contract can be signed only while it's out for signature.
export function canSignContract(status: ContractStatus): boolean {
  return status === 'sent'
}
```

- [ ] **Step 5: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/contracts.ts "__tests__/lib/contracts.test.ts"
git commit -m "feat: Contract types + status helpers"
```

---

### Task 2: Admin contract actions (CRUD + send)

**Files:**
- Create: `actions/contracts.ts`
- Create: `__tests__/actions/contracts.test.ts`

- [ ] **Step 1: Write the failing tests** — mirror `__tests__/actions/proposals.test.ts` mock style.

Hoisted spies; mock `@/lib/firebase-admin` so `adminDb.collection('orgs').doc(orgId).collection('contracts')` exposes `.doc(id?)` → `{ id: id ?? 'new-contract-id', set, get, update, delete }` and `.where('lead_id','==',v).orderBy('created_at','desc').get()` → `listContractsSpy`. Mock `@/lib/auth/assert` (resolve `{ role: 'admin' }`). Mock `@/lib/tokens` `generateAccessToken` → `'tok_test'`. Cover:
- **createContract**: writes with generated `id`, `token: 'tok_test'`, `org_id`, `lead_id`, `status: 'draft'`, `created_at`, plus passed `title`/`body`/`document_url` (omitted when blank); returns it.
- **createContract** with an invalid `document_url` (not http/https) → throws `'Document URL must start with http:// or https://'`, no write.
- **listContracts**: `where('lead_id','==',leadId).orderBy('created_at','desc')`; mapped docs.
- **getContract**: `null` when missing; the contract when present.
- **updateContract**: passes `title`/`body`/`document_url`/`status` through; always `updated_at`; throws `'Invalid status'` on bad status; throws on invalid `document_url`.
- **sendContract**: `update({ status: 'sent', updated_at })`.
- **deleteContract**: `.delete()`.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Create `actions/contracts.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { generateAccessToken } from '@/lib/tokens'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { CONTRACT_STATUSES } from '@/lib/contracts'
import type { Contract, ContractStatus } from '@/lib/types'

function contractsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('contracts')
}

function assertValidDocumentUrl(url: string | undefined) {
  if (url && !/^https?:\/\//.test(url)) throw new Error('Document URL must start with http:// or https://')
}

export interface CreateContractInput {
  title?: string
  body?: string
  document_url?: string
}

export async function listContracts(orgId: string, leadId: string): Promise<Contract[]> {
  await assertOrgMember(orgId)
  const snap = await contractsRef(orgId).where('lead_id', '==', leadId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Contract)
}

export async function getContract(orgId: string, contractId: string): Promise<Contract | null> {
  await assertOrgMember(orgId)
  const snap = await contractsRef(orgId).doc(contractId).get()
  return snap.exists ? (snap.data() as Contract) : null
}

export async function createContract(orgId: string, leadId: string, input: CreateContractInput): Promise<Contract> {
  await assertOrgAdmin(orgId)
  assertValidDocumentUrl(input.document_url?.trim())
  const id = randomBytes(8).toString('hex')
  const contract: Contract = {
    id,
    org_id: orgId,
    lead_id: leadId,
    token: generateAccessToken(),
    status: 'draft',
    created_at: new Date().toISOString(),
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.body?.trim() ? { body: input.body.trim() } : {}),
    ...(input.document_url?.trim() ? { document_url: input.document_url.trim() } : {}),
  }
  await contractsRef(orgId).doc(id).set(contract)
  return contract
}

export interface ContractUpdate {
  title?: string
  body?: string
  document_url?: string
  status?: ContractStatus
}

export async function updateContract(orgId: string, contractId: string, updates: ContractUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  if (updates.status && !CONTRACT_STATUSES.includes(updates.status)) throw new Error('Invalid status')
  assertValidDocumentUrl(updates.document_url?.trim())
  await contractsRef(orgId).doc(contractId).update({ ...updates, updated_at: new Date().toISOString() })
}

export async function sendContract(orgId: string, contractId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await contractsRef(orgId).doc(contractId).update({ status: 'sent', updated_at: new Date().toISOString() })
}

export async function deleteContract(orgId: string, contractId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await contractsRef(orgId).doc(contractId).delete()
}
```

- [ ] **Step 4: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 5: Commit**

```bash
git add actions/contracts.ts "__tests__/actions/contracts.test.ts"
git commit -m "feat: org-scoped contract actions (CRUD + send)"
```

---

### Task 3: Public token actions (view + sign)

**Files:**
- Create: `actions/contracts-public.ts`
- Create: `__tests__/actions/contracts-public.test.ts`

**SECURITY-RELEVANT:** unauthenticated; token = authorization; no draft exposure; captures a signature.

- [ ] **Step 1: Write the failing tests** — mirror `__tests__/actions/proposals-public.test.ts`.

Mock `adminDb.collectionGroup('contracts').where('token','==',t).limit(1).get()` → configurable `{ empty, docs:[{ data, ref }] }` where `ref` has `.update` (contractUpdateSpy). Cover:
- **getPublicContract(token)**: unknown/empty → `null`; a `draft` → `null`; a `sent`/`signed` → `PublicContract` DTO. Seed `token`/`org_id`/`lead_id`/`id` on the doc and assert they are ABSENT from the result. Assert DTO includes `status`, `title`/`body`/`document_url`/`signed_by`/`signed_at` when present, `created_at`.
- **signContract(token, signerName)**: on a `sent` contract → `update({ status: 'signed', signed_by: <trimmed name>, signed_at, updated_at })`.
- **signContract** on a non-`sent` contract (`draft` or already `signed`) → throws `'This contract is no longer awaiting a signature'`; no write.
- **signContract** unknown token → throws `'Contract not found'`.
- **signContract** with a blank signer name → throws `'Please type your name to sign'`; no lookup/write needed (validate first).

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Create `actions/contracts-public.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { Contract, ContractStatus } from '@/lib/types'

// Public-safe projection of a Contract. OMITS the secret `token`, internal
// `org_id`, `lead_id`, and `id`.
export interface PublicContract {
  title?: string
  body?: string
  document_url?: string
  status: ContractStatus
  signed_by?: string
  signed_at?: string
  created_at: string
}

async function findContractByToken(token: string) {
  const snap = await adminDb.collectionGroup('contracts').where('token', '==', token).limit(1).get()
  if (snap.empty) return null
  return snap.docs[0]
}

// PUBLIC (token = authorization). Drafts are never exposed.
export async function getPublicContract(token: string): Promise<PublicContract | null> {
  const doc = await findContractByToken(token)
  if (!doc) return null
  const contract = doc.data() as Contract
  if (contract.status === 'draft') return null
  const publicContract: PublicContract = {
    status: contract.status,
    created_at: contract.created_at,
  }
  if (contract.title !== undefined) publicContract.title = contract.title
  if (contract.body !== undefined) publicContract.body = contract.body
  if (contract.document_url !== undefined) publicContract.document_url = contract.document_url
  if (contract.signed_by !== undefined) publicContract.signed_by = contract.signed_by
  if (contract.signed_at !== undefined) publicContract.signed_at = contract.signed_at
  return publicContract
}

// PUBLIC. Client e-signs by typing their name. Only a `sent` contract can be signed.
export async function signContract(token: string, signerName: string): Promise<void> {
  const name = signerName?.trim()
  if (!name) throw new Error('Please type your name to sign')
  const doc = await findContractByToken(token)
  if (!doc) throw new Error('Contract not found')
  const contract = doc.data() as Contract
  if (contract.status !== 'sent') throw new Error('This contract is no longer awaiting a signature')
  const now = new Date().toISOString()
  await doc.ref.update({ status: 'signed', signed_by: name, signed_at: now, updated_at: now })
}
```

- [ ] **Step 4: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 5: Commit**

```bash
git add actions/contracts-public.ts "__tests__/actions/contracts-public.test.ts"
git commit -m "feat: public contract view + typed e-signature by token"
```

**REVIEW GATE:** security review after this task — unauthenticated sign flow, no draft exposure, no cross-tenant writes, DTO no-leak, double-sign safety.

---

### Task 4: Admin UI — contracts on lead detail + contract editor

**Files:**
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`
- Create: `components/admin/LeadContractsClient.tsx`
- Create: `app/(admin)/[orgSlug]/leads/[leadId]/contracts/[contractId]/page.tsx`
- Create: `components/admin/ContractEditorClient.tsx`

No new vitest tests; `npx tsc --noEmit` + `npx vitest run` stay green.

- [ ] **Step 1: Fetch contracts on the lead detail page** — `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`

The page already renders `LeadDetailClient` + `LeadProposalsClient` + `LeadInvoicesClient` + `ClientPortalLinkClient`. Additionally `const contracts = await listContracts(orgId, leadId)` (import from `@/actions/contracts`) and render `<LeadContractsClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} contracts={contracts} />` inside the existing wrapper.

- [ ] **Step 2: `components/admin/LeadContractsClient.tsx`** (`'use client'`) — mirror `LeadProposalsClient.tsx`.

Props `{ orgId, orgSlug, leadId, contracts }`. A Card "Contracts":
- List each: `title || 'Contract'`, a status `Badge` (`CONTRACT_STATUS_LABELS[status]`), and when signed the `signed_by` + `signed_at` (formatted); an "Edit" link → `/${orgSlug}/leads/${leadId}/contracts/${c.id}`; when `status !== 'draft'` a "Copy client link" copying `${window.location.origin}/contracts/${c.token}`.
- "New contract" → `await createContract(orgId, leadId, {})` then `router.push(.../contracts/${created.id})`.
- Empty state + error aria-live. Imports: `createContract` from `@/actions/contracts`; `CONTRACT_STATUS_LABELS` from `@/lib/contracts`; `Contract` from `@/lib/types`; UI + `useRouter` + `Link`.

- [ ] **Step 3: Contract editor page** — `app/(admin)/[orgSlug]/leads/[leadId]/contracts/[contractId]/page.tsx` (mirror the proposal editor page)

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getContract } from '@/actions/contracts'
import { ContractEditorClient } from '@/components/admin/ContractEditorClient'

export default async function ContractEditorPage({ params }: { params: Promise<{ orgSlug: string; leadId: string; contractId: string }> }) {
  const { orgSlug, leadId, contractId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const contract = await getContract(orgId, contractId)
  if (!contract || contract.lead_id !== leadId) notFound()
  return <ContractEditorClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} contract={contract} />
}
```

- [ ] **Step 4: `components/admin/ContractEditorClient.tsx`** (`'use client'`) — mirror `ProposalEditorClient.tsx`.

Props `{ orgId, orgSlug, leadId, contract }`. Behavior:
- Fields: title `<input>`, document URL `<input>` (help: "Link to a hosted PDF/Doc — optional"), body `<textarea>` (contract terms).
- "Save" → `await updateContract(orgId, contract.id, { title: title.trim() || undefined, body: body.trim() || undefined, document_url: document_url.trim() || undefined })`; saved notice (surface a thrown invalid-URL error).
- "Send for signature" → `await sendContract(orgId, contract.id)`; reveal the shareable link `${window.location.origin}/contracts/${contract.token}` + Copy. Status `Badge` (`CONTRACT_STATUS_LABELS`).
- When `contract.status === 'signed'`: show a read-only "Signed by {signed_by} on {signed_at}" block.
- "Delete" (confirm) → `await deleteContract(orgId, contract.id)` then `router.push(.../leads/${leadId})`.
- Back link. error/notice aria-live. Imports: `updateContract, sendContract, deleteContract` from `@/actions/contracts`; `CONTRACT_STATUS_LABELS` from `@/lib/contracts`; `Contract` from `@/lib/types`; UI + `useRouter`.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/[orgSlug]/leads/[leadId]/page.tsx" components/admin/LeadContractsClient.tsx "app/(admin)/[orgSlug]/leads/[leadId]/contracts/[contractId]/page.tsx" components/admin/ContractEditorClient.tsx
git commit -m "feat: contracts on lead detail + contract editor"
```

---

### Task 5: Public sign page + client-portal integration

**Files:**
- Create: `app/(public)/contracts/[token]/page.tsx`
- Create: `components/contracts/ContractSignClient.tsx`
- Modify: `actions/client-portal-public.ts` (add contracts to the portal DTO)
- Modify: `components/client-portal/ClientPortalView.tsx` (render a Contracts section)
- Modify: `__tests__/actions/client-portal-public.test.ts` (cover contracts in the DTO)

- [ ] **Step 1: Public sign page** — `app/(public)/contracts/[token]/page.tsx`

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getPublicContract } from '@/actions/contracts-public'
import { ContractSignClient } from '@/components/contracts/ContractSignClient'

export default async function PublicContractPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const contract = await getPublicContract(token)
  if (!contract) notFound()
  return <ContractSignClient token={token} contract={contract} />
}
```

- [ ] **Step 2: `components/contracts/ContractSignClient.tsx`** (`'use client'`)

Props `{ token: string; contract: PublicContract }` (import `PublicContract` from `@/actions/contracts-public`). Self-contained standalone page (mirror `ProposalResponseClient`):
- Header: `contract.title || 'Contract'`.
- If `contract.document_url`: a prominent "Open document" link (`target="_blank"`, `rel="noopener noreferrer"`). If `contract.body`: render the terms in a scrollable, `whitespace-pre-wrap` block.
- If `contract.status === 'sent'`: a signature area — a name `<input>` ("Type your full name to sign"), an agreement checkbox ("I agree to the terms of this contract"), and a **Sign** button (disabled until name non-empty AND checkbox checked) → `await signContract(token, name)`; on success show "Signed — thank you." Loading + error states.
- If `contract.status === 'signed'`: show "Signed by {contract.signed_by} on {formatted signed_at}" instead of the form.
- Imports: `signContract` from `@/actions/contracts-public`; UI from `@/components/ui/{card,button,input,label}`.

- [ ] **Step 3: Add contracts to the client portal** — `actions/client-portal-public.ts`

Add a `ClientPortalContract` type and a `contracts` array to `ClientPortal`:
```typescript
export interface ClientPortalContract {
  title?: string
  status: ContractStatus
  token: string
}
```
Import `Contract`/`ContractStatus`. In `getClientPortal`, add a third parallel query and projection:
```typescript
  const [propSnap, invSnap, contractSnap] = await Promise.all([
    orgRef.collection('proposals').where('lead_id', '==', leadId).get(),
    orgRef.collection('invoices').where('lead_id', '==', leadId).get(),
    orgRef.collection('contracts').where('lead_id', '==', leadId).get(),
  ])
  // ...existing proposals/invoices projection...
  const contracts: ClientPortalContract[] = contractSnap.docs
    .map((d) => d.data() as Contract)
    .filter((c) => c.status !== 'draft')
    .map((c) => ({ status: c.status, token: c.token, ...(c.title !== undefined ? { title: c.title } : {}) }))
```
Add `contracts` to the returned `ClientPortal` object and to the `ClientPortal` interface.

Update `__tests__/actions/client-portal-public.test.ts`: extend the org mock so `orgRef.collection('contracts').where(...).get()` returns a configurable snapshot; assert the DTO's `contracts` excludes drafts and each entry is `{ status, token, title? }`.

- [ ] **Step 4: Render contracts in `components/client-portal/ClientPortalView.tsx`**

Add a "Contracts" section (mirroring the proposals/invoices sections): each row `title || 'Contract'`, status badge (`CONTRACT_STATUS_LABELS`), and a "View contract" link `<a href={`/contracts/${c.token}`}>`. Empty → "No contracts yet." Import `CONTRACT_STATUS_LABELS` from `@/lib/contracts`.

- [ ] **Step 5: Verify**

- `npx tsc --noEmit` clean.
- `npx vitest run` all green (client-portal-public test updated).
- `npx next build` (copy env: `cp /Users/rm/vw/traxevent/.env.local .env.local`, build, then `rm -f .env.local`) → succeeds; routes `/contracts/[token]` and `/[orgSlug]/leads/[leadId]/contracts/[contractId]` appear; no collisions.

- [ ] **Step 6: Commit** (do NOT add `.env.local`)

```bash
git add "app/(public)/contracts/[token]/page.tsx" components/contracts/ContractSignClient.tsx actions/client-portal-public.ts components/client-portal/ClientPortalView.tsx "__tests__/actions/client-portal-public.test.ts"
git commit -m "feat: public contract sign page + contracts in client portal"
```

---

### Task 6: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run` → all green; record final count.
- [ ] **Step 3:** `npx next build` (with `.env.local`) → succeeds; confirm the two new routes + no collisions.
- [ ] **Step 4:** Commit this plan file (`docs: phase 5d ...`).
- [ ] **Step 5:** Hand back for branch finish (push + PR + squash-merge as `Lifewithmo`, verify prod deploy). Surface the follow-up: **native file upload (Firebase Storage) is deferred** — contracts currently reference a hosted document via `document_url` (or inline terms text); add Storage-backed upload later.

---

## Self-Review

**Spec coverage:** Roadmap "Contract upload + e-signature collection": contract authoring with document link + terms (Task 1/2/4), public review + typed e-signature capturing signer + timestamp (Task 3/5), surfaced in the client portal (Task 5). Covered. Native file upload is explicitly deferred (Storage not wired) and handled via `document_url` per the existing `logo_url` convention.

**Placeholder scan:** Types, helper, actions, and pages verbatim. Client components are specified behaviorally against the just-built analogues (`LeadProposalsClient`, `ProposalEditorClient`, `ProposalResponseClient`) — acceptable for mechanical UI.

**Type consistency:** `Contract`/`ContractStatus` (Task 1) used by `lib/contracts.ts`, both action files, and all UI. `CONTRACT_STATUSES`/`CONTRACT_STATUS_LABELS`/`canSignContract` signatures match across def and callers. `createContract(orgId, leadId, input)` / `updateContract` / `sendContract` / `getContract` / `listContracts(orgId, leadId)` match UI callers. `getPublicContract(token)` → `PublicContract`; `signContract(token, name)` match the public page. `ClientPortalContract` + `contracts` added consistently to the `ClientPortal` DTO and view.

**Security note:** Admin actions `assertOrgMember`(read)/`assertOrgAdmin`(mutate), path-isolated to `orgs/{orgId}/contracts`; status validated against `CONTRACT_STATUSES`; `document_url` validated http(s) on create/update. Public `getPublicContract` authorizes solely by the 48-hex token via `collectionGroup` exact-match, never returns a `draft`, and projects a DTO with `token`/`org_id`/`lead_id`/`id` structurally absent. `signContract` validates a non-empty name, only mutates a `sent` contract (double-sign throws, no writes), and writes only the token's own contract doc via `doc.ref` — no cross-tenant writes, no caller-supplied ids. The client-portal contracts addition reuses the already-reviewed org-from-ref-path pattern and excludes drafts.
