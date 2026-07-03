# Phase 5e: Client Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A prospective/booked client gets ONE branded, login-free page (their "portal") that aggregates their event: contact/event details, a status **timeline** (Inquiry → … → Delivered), their **proposals** (with click-through to accept/decline) and **invoices** (with balance + click-through to view). The org copies a shareable client-portal link from the lead.

**Architecture:** The Lead (Phase 5a) is the client entity. It gains a `portal_token`. An admin action lazily ensures the token and returns the link. A public action resolves the lead by token via `collectionGroup('leads').where('portal_token','==',token)`, then gathers that lead's non-draft proposals + invoices (from the org resolved via the doc's own ref path) and returns a public-safe DTO. The portal LINKS to the existing `/proposals/[token]` and `/invoices/[token]` public pages (no duplicated accept/pay UI). New route `/client/[token]` (distinct from the Phase 4f `/portal` network routes).

**Tech Stack:** Next.js 16 App Router (`params` is a Promise), Firebase Admin, Vitest. Reuses `proposalTotal` (`lib/proposals`), `invoiceTotal`/`invoiceBalance` (`lib/invoices`), `LEAD_STAGES`/`LEAD_STAGE_LABELS` (`lib/leads`).

**Baseline:** 448 tests passing (run `npm install` first so the `server-only` shim resolves).

---

### Task 1: `portal_token` on Lead + timeline helper

**Files:**
- Modify: `lib/types.ts` (add `portal_token?: string` to `Lead`)
- Create: `lib/client-portal.ts`
- Create: `__tests__/lib/client-portal.test.ts`

- [ ] **Step 1: Write the failing test** — `__tests__/lib/client-portal.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { buildLeadTimeline } from '@/lib/client-portal'

describe('buildLeadTimeline', () => {
  it('marks earlier stages done and the current stage current', () => {
    const t = buildLeadTimeline('proposal')
    expect(t.map((s) => s.stage)).toEqual(['inquiry', 'consultation', 'proposal', 'booked', 'delivered'])
    expect(t.find((s) => s.stage === 'inquiry')).toMatchObject({ done: true, current: false })
    expect(t.find((s) => s.stage === 'consultation')).toMatchObject({ done: true, current: false })
    expect(t.find((s) => s.stage === 'proposal')).toMatchObject({ done: false, current: true, label: 'Proposal' })
    expect(t.find((s) => s.stage === 'booked')).toMatchObject({ done: false, current: false })
  })

  it('at the final stage everything before is done and delivered is current', () => {
    const t = buildLeadTimeline('delivered')
    expect(t.filter((s) => s.done).map((s) => s.stage)).toEqual(['inquiry', 'consultation', 'proposal', 'booked'])
    expect(t.find((s) => s.stage === 'delivered')).toMatchObject({ done: false, current: true })
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/lib/client-portal.test.ts` → FAIL.

- [ ] **Step 3: Update `lib/types.ts`** — add to the `Lead` interface (before `created_at`):

```typescript
  portal_token?: string   // lazily generated; powers the login-free client portal link
```

- [ ] **Step 4: Create `lib/client-portal.ts`**

```typescript
import { LEAD_STAGES, LEAD_STAGE_LABELS } from '@/lib/leads'
import type { LeadStage } from '@/lib/types'

export interface LeadTimelineStep {
  stage: LeadStage
  label: string
  done: boolean
  current: boolean
}

// A stepper for the client portal: stages before the current are done, the current is highlighted.
export function buildLeadTimeline(stage: LeadStage): LeadTimelineStep[] {
  const idx = LEAD_STAGES.indexOf(stage)
  return LEAD_STAGES.map((s, i) => ({
    stage: s,
    label: LEAD_STAGE_LABELS[s],
    done: idx >= 0 && i < idx,
    current: i === idx,
  }))
}
```

- [ ] **Step 5: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/client-portal.ts "__tests__/lib/client-portal.test.ts"
git commit -m "feat: Lead.portal_token + client-portal timeline helper"
```

---

### Task 2: Admin token action + public client-portal aggregation action

**Files:**
- Create: `actions/client-portal.ts` (admin: `ensureClientPortalToken`)
- Create: `actions/client-portal-public.ts` (public: `getClientPortal`)
- Create: `__tests__/actions/client-portal.test.ts`
- Create: `__tests__/actions/client-portal-public.test.ts`

- [ ] **Step 1: Write the failing tests**

`__tests__/actions/client-portal.test.ts` — mock `@/lib/firebase-admin` so `adminDb.collection('orgs').doc(orgId).collection('leads').doc(leadId)` exposes `.get` (leadGetSpy) + `.update` (leadUpdateSpy). Mock `@/lib/auth/assert` (`assertOrgAdmin` → resolve). Mock `@/lib/tokens` `generateAccessToken` → `'tok_client'`. Cover **ensureClientPortalToken**:
- Lead with no `portal_token` → generates `'tok_client'`, calls `leadUpdateSpy` with `{ portal_token: 'tok_client', updated_at }`, returns `'tok_client'`.
- Lead that already has `portal_token: 'existing'` → returns `'existing'`, does NOT call update.
- Lead not found → throws `'Lead not found'`.

`__tests__/actions/client-portal-public.test.ts` — mock `@/lib/firebase-admin` so `adminDb.collectionGroup('leads').where('portal_token','==',t).limit(1).get()` → configurable `{ empty, docs: [{ id: 'lead-1', data, ref }] }` where `ref.parent.parent` = an orgRef whose `.collection('proposals').where('lead_id','==',...).get()` → proposalsSpy and `.collection('invoices').where('lead_id','==',...).get()` → invoicesSpy. Cover **getClientPortal**:
- unknown token → `null`.
- known lead → returns a DTO with `client_name`, `organization`/`event_type`/`event_date` (when present), `stage`, `timeline` (from `buildLeadTimeline`), `proposals` (only non-`draft`, each `{ title?, status, total, token }` — total via `proposalTotal`), `invoices` (only non-`draft`, each `{ title?, number?, status, total, balance, token }`).
- Assert draft proposals/invoices are EXCLUDED, and assert the DTO does NOT include lead `notes`, `estimated_value`, `email`, `phone`, `id`, or `portal_token` (`'notes' in result === false`, etc.).

- [ ] **Step 2: Run to verify they fail** — FAIL.

- [ ] **Step 3: Create `actions/client-portal.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { generateAccessToken } from '@/lib/tokens'
import { assertOrgAdmin } from '@/lib/auth/assert'
import type { Lead } from '@/lib/types'

// Ensure the lead has a client-portal token (generate on first use); returns it.
export async function ensureClientPortalToken(orgId: string, leadId: string): Promise<string> {
  await assertOrgAdmin(orgId)
  const ref = adminDb.collection('orgs').doc(orgId).collection('leads').doc(leadId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Lead not found')
  const lead = snap.data() as Lead
  if (lead.portal_token) return lead.portal_token
  const token = generateAccessToken()
  await ref.update({ portal_token: token, updated_at: new Date().toISOString() })
  return token
}
```

- [ ] **Step 4: Create `actions/client-portal-public.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { buildLeadTimeline, type LeadTimelineStep } from '@/lib/client-portal'
import { proposalTotal } from '@/lib/proposals'
import { invoiceTotal, invoiceBalance } from '@/lib/invoices'
import type { Lead, LeadStage, Proposal, ProposalStatus, Invoice, InvoiceStatus } from '@/lib/types'

export interface ClientPortalProposal {
  title?: string
  status: ProposalStatus
  total: number
  token: string
}

export interface ClientPortalInvoice {
  title?: string
  number?: string
  status: InvoiceStatus
  total: number
  balance: number
  token: string
}

// Public-safe: only client-facing fields. Omits internal lead fields
// (notes, estimated_value, email, phone, id, org_id, portal_token).
export interface ClientPortal {
  client_name: string
  organization?: string
  event_type?: string
  event_date?: string
  stage: LeadStage
  timeline: LeadTimelineStep[]
  proposals: ClientPortalProposal[]
  invoices: ClientPortalInvoice[]
}

// PUBLIC (portal_token = authorization). Aggregates the lead's non-draft proposals + invoices.
export async function getClientPortal(token: string): Promise<ClientPortal | null> {
  const snap = await adminDb.collectionGroup('leads').where('portal_token', '==', token).limit(1).get()
  if (snap.empty) return null
  const leadDoc = snap.docs[0]
  const lead = leadDoc.data() as Lead
  const orgRef = leadDoc.ref.parent.parent
  if (!orgRef) return null
  const leadId = leadDoc.id

  const [propSnap, invSnap] = await Promise.all([
    orgRef.collection('proposals').where('lead_id', '==', leadId).get(),
    orgRef.collection('invoices').where('lead_id', '==', leadId).get(),
  ])

  const proposals: ClientPortalProposal[] = propSnap.docs
    .map((d) => d.data() as Proposal)
    .filter((p) => p.status !== 'draft')
    .map((p) => ({
      status: p.status,
      total: proposalTotal(p.line_items),
      token: p.token,
      ...(p.title !== undefined ? { title: p.title } : {}),
    }))

  const invoices: ClientPortalInvoice[] = invSnap.docs
    .map((d) => d.data() as Invoice)
    .filter((i) => i.status !== 'draft')
    .map((i) => ({
      status: i.status,
      total: invoiceTotal(i.line_items),
      balance: invoiceBalance(i),
      token: i.token,
      ...(i.title !== undefined ? { title: i.title } : {}),
      ...(i.number !== undefined ? { number: i.number } : {}),
    }))

  const portal: ClientPortal = {
    client_name: lead.name,
    stage: lead.stage,
    timeline: buildLeadTimeline(lead.stage),
    proposals,
    invoices,
  }
  if (lead.organization !== undefined) portal.organization = lead.organization
  if (lead.event_type !== undefined) portal.event_type = lead.event_type
  if (lead.event_date !== undefined) portal.event_date = lead.event_date
  return portal
}
```

- [ ] **Step 5: Run tests** — both targeted files PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 6: Commit**

```bash
git add actions/client-portal.ts actions/client-portal-public.ts "__tests__/actions/client-portal.test.ts" "__tests__/actions/client-portal-public.test.ts"
git commit -m "feat: client portal token action + public aggregation (proposals + invoices + timeline)"
```

**REVIEW GATE:** security review after this task — token-only read, no draft exposure, no internal-lead-field leak, no cross-tenant reads (org resolved from the lead's own ref path).

---

### Task 3: Admin "client portal" link + public `/client/[token]` page

**Files:**
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`
- Create: `components/admin/ClientPortalLinkClient.tsx`
- Create: `app/(public)/client/[token]/page.tsx`
- Create: `components/client-portal/ClientPortalView.tsx`

No new vitest tests; `npx tsc --noEmit` + `npx vitest run` stay green (build verified in Task 4).

- [ ] **Step 1: Admin link component on the lead detail page**

In `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx` (which already renders `LeadDetailClient` + `LeadProposalsClient` + `LeadInvoicesClient`), also render `<ClientPortalLinkClient orgId={orgId} leadId={leadId} />` inside the existing wrapper.

`components/admin/ClientPortalLinkClient.tsx` (`'use client'`), props `{ orgId: string; leadId: string }`. A small Card "Client portal":
- Explanatory line: "Share one link where this client sees their event, proposals, and invoices."
- A "Copy client portal link" button → `const token = await ensureClientPortalToken(orgId, leadId)` then `navigator.clipboard.writeText(`${window.location.origin}/client/${token}`)`; show a "Copied!" notice (and show the URL in a read-only input once generated). `busy`/`error` state.
- Imports: `ensureClientPortalToken` from `@/actions/client-portal`; UI from `@/components/ui/{card,button,input}`.

- [ ] **Step 2: Public page** — `app/(public)/client/[token]/page.tsx`

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getClientPortal } from '@/actions/client-portal-public'
import { ClientPortalView } from '@/components/client-portal/ClientPortalView'

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const portal = await getClientPortal(token)
  if (!portal) notFound()
  return <ClientPortalView portal={portal} />
}
```

- [ ] **Step 3: `components/client-portal/ClientPortalView.tsx`** (plain presentational, NO `'use client'`)

Props `{ portal: ClientPortal }` (import `ClientPortal` from `@/actions/client-portal-public`). Self-contained standalone page (mirror `NetworkPortalView`/`InvoiceViewClient` style):
- Header: `portal.client_name` + `portal.organization` (muted) if present; event line combining `event_type` + `event_date` when present.
- **Timeline**: render `portal.timeline` as a horizontal stepper — each step shows `label`, visually distinguishing `done` (e.g. filled/check) vs `current` (highlighted) vs upcoming (muted).
- **Proposals** section: if any, a list — each row `title || 'Proposal'`, status badge (`PROPOSAL_STATUS_LABELS`), total `$${n.toFixed(2)}`, and a "View proposal" link `<a href={`/proposals/${p.token}`}>`. Empty → hide the section or show "No proposals yet."
- **Invoices** section: if any, a list — each row `number ? `#${number}` : ''` + `title || 'Invoice'`, status badge (`INVOICE_STATUS_LABELS`), total + **Balance due** `$${n.toFixed(2)}`, and a "View invoice" link `<a href={`/invoices/${i.token}`}>`. Empty → "No invoices yet."
- Imports: `PROPOSAL_STATUS_LABELS` from `@/lib/proposals`; `INVOICE_STATUS_LABELS` from `@/lib/invoices`; `ClientPortal` from `@/actions/client-portal-public`; `Badge`/`Card` from `@/components/ui/{badge,card}`.

- [ ] **Step 4: Verify**

- `npx tsc --noEmit` clean.
- `npx vitest run` all green.
- `npx next build` (copy env: `cp /Users/rm/vw/traxevent/.env.local .env.local`, build, then `rm -f .env.local`) → succeeds; route `/client/[token]` appears; no collisions (confirm `/portal` and `/client` are distinct).

- [ ] **Step 5: Commit** (do NOT add `.env.local`)

```bash
git add "app/(admin)/[orgSlug]/leads/[leadId]/page.tsx" components/admin/ClientPortalLinkClient.tsx "app/(public)/client/[token]/page.tsx" components/client-portal/ClientPortalView.tsx
git commit -m "feat: client portal link on lead + public /client/[token] hub"
```

---

### Task 4: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run` → all green; record final count.
- [ ] **Step 3:** `npx next build` (with `.env.local`) → succeeds; confirm `/client/[token]` + no collisions.
- [ ] **Step 4:** Commit this plan file (`docs: phase 5e ...`).
- [ ] **Step 5:** Hand back for branch finish (push + PR + squash-merge as `Lifewithmo`, verify prod deploy).

---

## Self-Review

**Spec coverage:** Roadmap "Client portal (client-facing view of their event details, invoice, timeline)": event/contact details + status timeline (Task 1/3), aggregated proposals + invoices with balances (Task 2/3), login-free token access + admin share link (Task 2/3). Covered. Reuses the existing `/proposals/[token]` (accept/decline) and `/invoices/[token]` (balance) pages via click-through, so no duplicated action UI.

**Placeholder scan:** Types, helper, both actions, and the public page are verbatim. The two client components are specified behaviorally against the just-built analogues (`InvoiceViewClient`, `NetworkPortalView`, the copy-link pattern from `LeadProposalsClient`) — acceptable for mechanical UI.

**Type consistency:** `Lead.portal_token` (Task 1) is read/written by both actions. `buildLeadTimeline`/`LeadTimelineStep` (Task 1) used by the public action + view. `ClientPortal`/`ClientPortalProposal`/`ClientPortalInvoice` flow from `actions/client-portal-public.ts` → page → `ClientPortalView`. Totals reuse `proposalTotal`/`invoiceTotal`/`invoiceBalance` — signatures already established in 5b/5c.

**Security note:** `ensureClientPortalToken` is `assertOrgAdmin`-gated and path-isolated. `getClientPortal` authorizes solely by the 48-hex-char `portal_token` via `collectionGroup` exact-match; resolves the org strictly from the found lead's own `ref.parent.parent` (never caller input) → no cross-tenant reads; excludes `draft` proposals/invoices; and returns a projected DTO that OMITS internal lead fields (`notes`, `estimated_value`, `email`, `phone`, `id`, `org_id`, `portal_token`). It intentionally includes each proposal's/invoice's own `token` so the client (who already holds the portal token) can click through to their own documents — the same trust boundary, asserted by the no-leak test on the lead-level internal fields.
