# Phase 5a: Lead Pipeline (CRM Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An org can capture **leads** (prospective clients/events), move them through pipeline stages (Inquiry → Consultation → Proposal → Booked → Delivered) on a board, and open a lead detail view to edit fields, notes, and stage. This is the CRM foundation that Phase 5b/5c (proposals, invoices) and the client portal will hang off.

**Architecture:** Org-scoped subcollection `orgs/{orgId}/leads/{leadId}`, mirroring the existing `departments` feature exactly (pure-helper + thin-action + redirect-guard-page / throw-assert-action). Pure helpers in `lib/leads.ts` (stage constants, board grouping, pipeline summary). No drag-drop dependency — stage changes use a `<select>` per card. Guards: `assertOrgMember` to view, `assertOrgAdmin` to mutate.

**Tech Stack:** Next.js 16 App Router (`params` is a Promise), Firebase Admin, Vitest. UI primitives: `@/components/ui/{card,button,input,label,badge}` + native `<select>`/`<textarea>` (no Select/Textarea primitives exist).

**Baseline:** 381 tests passing (run `npm install` first so the `server-only` shim resolves).

---

### Task 1: Lead types + pure pipeline helpers

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/leads.ts`
- Create: `__tests__/lib/leads.test.ts`

- [ ] **Step 1: Write the failing test** — `__tests__/lib/leads.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { LEAD_STAGES, LEAD_STAGE_LABELS, groupLeadsByStage, pipelineSummary } from '@/lib/leads'
import type { Lead, LeadStage } from '@/lib/types'

const lead = (id: string, stage: LeadStage, estimated_value?: number): Lead =>
  ({ id, name: id, stage, created_at: '', ...(estimated_value != null ? { estimated_value } : {}) }) as Lead

describe('LEAD_STAGES', () => {
  it('is the five pipeline stages in order', () => {
    expect(LEAD_STAGES).toEqual(['inquiry', 'consultation', 'proposal', 'booked', 'delivered'])
  })
  it('has a label for every stage', () => {
    for (const s of LEAD_STAGES) expect(LEAD_STAGE_LABELS[s]).toBeTruthy()
  })
})

describe('groupLeadsByStage', () => {
  it('buckets leads into their stage', () => {
    const g = groupLeadsByStage([lead('a', 'inquiry'), lead('b', 'booked'), lead('c', 'inquiry')])
    expect(g.inquiry.map((l) => l.id)).toEqual(['a', 'c'])
    expect(g.booked.map((l) => l.id)).toEqual(['b'])
    expect(g.delivered).toEqual([])
  })
  it('ignores leads with an unrecognized stage', () => {
    const g = groupLeadsByStage([lead('x', 'bogus' as LeadStage)])
    expect(Object.values(g).flat()).toEqual([])
  })
})

describe('pipelineSummary', () => {
  it('counts and sums estimated value per stage; openValue excludes delivered; bookedValue includes booked+delivered', () => {
    const s = pipelineSummary([
      lead('a', 'inquiry', 1000),
      lead('b', 'booked', 5000),
      lead('c', 'delivered', 3000),
      lead('d', 'proposal'),            // no value
    ])
    expect(s.stages.find((x) => x.stage === 'inquiry')).toMatchObject({ count: 1, value: 1000 })
    expect(s.stages.find((x) => x.stage === 'proposal')).toMatchObject({ count: 1, value: 0 })
    expect(s.openCount).toBe(3)         // inquiry + booked + proposal (not delivered)
    expect(s.openValue).toBe(6000)      // 1000 + 5000
    expect(s.bookedValue).toBe(8000)    // 5000 + 3000
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/lib/leads.test.ts` → FAIL (cannot resolve `@/lib/leads`).

- [ ] **Step 3: Update `lib/types.ts`** — add near the other status enums / entity interfaces:

```typescript
export type LeadStage = 'inquiry' | 'consultation' | 'proposal' | 'booked' | 'delivered'

export interface Lead {
  id: string
  name: string
  email?: string
  phone?: string
  organization?: string
  event_type?: string          // free text, e.g. "Wedding", "Corporate gala"
  event_date?: string          // ISO date, optional
  estimated_value?: number     // dollars
  stage: LeadStage
  notes?: string
  created_at: string
  updated_at?: string
}
```

- [ ] **Step 4: Create `lib/leads.ts`**

```typescript
import type { Lead, LeadStage } from '@/lib/types'

export const LEAD_STAGES: LeadStage[] = ['inquiry', 'consultation', 'proposal', 'booked', 'delivered']

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  inquiry: 'Inquiry',
  consultation: 'Consultation',
  proposal: 'Proposal',
  booked: 'Booked',
  delivered: 'Delivered',
}

// Bucket leads by stage for the pipeline board. Leads with an unrecognized stage are dropped.
export function groupLeadsByStage(leads: Lead[]): Record<LeadStage, Lead[]> {
  const grouped = { inquiry: [], consultation: [], proposal: [], booked: [], delivered: [] } as Record<LeadStage, Lead[]>
  for (const lead of leads) {
    if (grouped[lead.stage]) grouped[lead.stage].push(lead)
  }
  return grouped
}

export interface PipelineStageSummary {
  stage: LeadStage
  count: number
  value: number
}

export interface PipelineSummary {
  stages: PipelineStageSummary[]
  openCount: number
  openValue: number
  bookedValue: number
}

export function pipelineSummary(leads: Lead[]): PipelineSummary {
  const grouped = groupLeadsByStage(leads)
  const stages = LEAD_STAGES.map((stage) => {
    const items = grouped[stage]
    return { stage, count: items.length, value: items.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0) }
  })
  const open = stages.filter((s) => s.stage !== 'delivered')
  const openCount = open.reduce((n, s) => n + s.count, 0)
  const openValue = open.reduce((n, s) => n + s.value, 0)
  const bookedValue = [...grouped.booked, ...grouped.delivered].reduce((sum, l) => sum + (l.estimated_value ?? 0), 0)
  return { stages, openCount, openValue, bookedValue }
}
```

- [ ] **Step 5: Run tests** — targeted PASS (6); `npx tsc --noEmit` clean; `npx vitest run` → all green (387 expected).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/leads.ts "__tests__/lib/leads.test.ts"
git commit -m "feat: Lead type + pipeline stage/board/summary helpers"
```

---

### Task 2: Lead actions (org-scoped CRUD + stage move)

**Files:**
- Create: `actions/leads.ts`
- Create: `__tests__/actions/leads.test.ts`

- [ ] **Step 1: Write the failing tests** — `__tests__/actions/leads.test.ts`

Mirror `__tests__/actions/departments.test.ts` exactly. Hoisted spies; mock `@/lib/firebase-admin` so `adminDb.collection('orgs').doc(orgId).collection('leads')` exposes `.doc(id?)` → `{ id: id ?? 'new-lead-id', set, get, update, delete }` and `.orderBy('created_at','desc').get()` → `listLeadsSpy`. Mock `@/lib/auth/assert` (`assertOrgMember`/`assertOrgAdmin` → resolve `{ role: 'admin' }`). Mock `firebase-admin/firestore` `FieldValue.delete` → a sentinel. Cover:
- **createLead**: writes a lead with a generated `id`, `stage: 'inquiry'` default, `created_at`; returns it. Omits blank optionals (`email`/`organization` not set when empty). Throws `'Name is required'` for blank name (no write). Throws `'Invalid stage'` when `input.stage` is not a `LEAD_STAGES` value.
- **listLeads**: uses `orderBy('created_at','desc')`; returns mapped docs.
- **getLead**: returns `null` when the doc doesn't exist; the lead data when it does.
- **updateLead**: `undefined` fields skipped; `null` → `FieldValue.delete()`; always sets `updated_at`. Throws `'Invalid stage'` if `updates.stage` is invalid (no write).
- **setLeadStage**: throws `'Invalid stage'` for a bad stage (no update); otherwise `update({ stage, updated_at })`.
- **deleteLead**: calls `.delete()`.

- [ ] **Step 2: Run to verify it fails** — FAIL (module/exports missing).

- [ ] **Step 3: Create `actions/leads.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { randomBytes } from 'crypto'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { LEAD_STAGES } from '@/lib/leads'
import type { Lead, LeadStage } from '@/lib/types'

function leadsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('leads')
}

export interface CreateLeadInput {
  name: string
  email?: string
  phone?: string
  organization?: string
  event_type?: string
  event_date?: string
  estimated_value?: number
  stage?: LeadStage
  notes?: string
}

export async function listLeads(orgId: string): Promise<Lead[]> {
  await assertOrgMember(orgId)
  const snap = await leadsRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Lead)
}

export async function getLead(orgId: string, leadId: string): Promise<Lead | null> {
  await assertOrgMember(orgId)
  const snap = await leadsRef(orgId).doc(leadId).get()
  return snap.exists ? (snap.data() as Lead) : null
}

export async function createLead(orgId: string, input: CreateLeadInput): Promise<Lead> {
  await assertOrgAdmin(orgId)
  if (!input.name?.trim()) throw new Error('Name is required')
  const stage = input.stage ?? 'inquiry'
  if (!LEAD_STAGES.includes(stage)) throw new Error('Invalid stage')
  const id = randomBytes(8).toString('hex')
  const lead: Lead = {
    id,
    name: input.name.trim(),
    stage,
    created_at: new Date().toISOString(),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.organization?.trim() ? { organization: input.organization.trim() } : {}),
    ...(input.event_type?.trim() ? { event_type: input.event_type.trim() } : {}),
    ...(input.event_date?.trim() ? { event_date: input.event_date.trim() } : {}),
    ...(input.estimated_value != null ? { estimated_value: input.estimated_value } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await leadsRef(orgId).doc(id).set(lead)
  return lead
}

export async function updateLead(
  orgId: string,
  leadId: string,
  updates: Partial<Omit<Lead, 'id' | 'created_at'>>
): Promise<void> {
  await assertOrgAdmin(orgId)
  if (updates.stage && !LEAD_STAGES.includes(updates.stage)) throw new Error('Invalid stage')
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  await leadsRef(orgId).doc(leadId).update({ ...cleaned, updated_at: new Date().toISOString() })
}

export async function setLeadStage(orgId: string, leadId: string, stage: LeadStage): Promise<void> {
  await assertOrgAdmin(orgId)
  if (!LEAD_STAGES.includes(stage)) throw new Error('Invalid stage')
  await leadsRef(orgId).doc(leadId).update({ stage, updated_at: new Date().toISOString() })
}

export async function deleteLead(orgId: string, leadId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await leadsRef(orgId).doc(leadId).delete()
}
```

- [ ] **Step 4: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 5: Commit**

```bash
git add actions/leads.ts "__tests__/actions/leads.test.ts"
git commit -m "feat: org-scoped lead actions (CRUD + stage move, validated)"
```

---

### Task 3: Pipeline board page + client + nav

**Files:**
- Create: `app/(admin)/[orgSlug]/leads/page.tsx`
- Create: `components/admin/LeadsBoardClient.tsx`
- Modify: `components/layout/AdminSidebar.tsx`

No new vitest tests; `npx tsc --noEmit` and `npx vitest run` must stay green.

- [ ] **Step 1: Board page** — `app/(admin)/[orgSlug]/leads/page.tsx` (mirror `departments/page.tsx`)

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listLeads } from '@/actions/leads'
import { LeadsBoardClient } from '@/components/admin/LeadsBoardClient'

export default async function LeadsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const leads = await listLeads(orgId)
  return <LeadsBoardClient orgId={orgId} orgSlug={orgSlug} leads={leads} />
}
```

- [ ] **Step 2: Board client** — `components/admin/LeadsBoardClient.tsx` (`'use client'`)

Props: `{ orgId: string; orgSlug: string; leads: Lead[] }`. Behavior (mirror `DepartmentsClient` state/optimistic style):
- Local `leads` state; `groupLeadsByStage(leads)` for columns; `pipelineSummary(leads)` for a header strip ("Open: N leads · $X" and "Booked: $Y"). Format money inline as `$${n.toLocaleString()}`.
- Header: title "Pipeline" + a "New lead" button toggling a create Card with inputs: name (required), organization, email, phone, event type, event date (`<input type="date">`), estimated value (`<input type="number">`), notes (`<textarea>`). On save → `await createLead(orgId, {...})`, prepend to state, close form. Validate name non-empty client-side.
- Board: a horizontal row of 5 columns (one per `LEAD_STAGES`), each headed by `LEAD_STAGE_LABELS[stage]` + count. Each lead is a Card showing `name`, `organization` (muted), `event_type` + `event_date`, and `estimated_value` (if set), wrapped in a `<Link href={`/${orgSlug}/leads/${lead.id}`}>`. Below each card, a native `<select>` bound to `lead.stage` with the 5 stages → on change call `await setLeadStage(orgId, lead.id, newStage)` and optimistically move the card (revert on error, like DepartmentsClient.handleRename).
- `error` state shown in an `aria-live` region.
- Layout: columns `flex gap-3 overflow-x-auto`, each column `min-w-[220px]`. Keep styling consistent with existing admin clients.
- Imports: `createLead, setLeadStage` from `@/actions/leads`; `LEAD_STAGES, LEAD_STAGE_LABELS, groupLeadsByStage, pipelineSummary` from `@/lib/leads`; `Lead, LeadStage` from `@/lib/types`; UI from `@/components/ui/{card,button,input,label,badge}`; `Link` from `next/link`.

- [ ] **Step 3: Nav link** — `components/layout/AdminSidebar.tsx`, add after the Registrants `<Link>` (before the Sign out button):
```tsx
        <Link href={`/${orgSlug}/leads`} className={navClass(`/${orgSlug}/leads`)}>
          Pipeline
        </Link>
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/[orgSlug]/leads/page.tsx" components/admin/LeadsBoardClient.tsx components/layout/AdminSidebar.tsx
git commit -m "feat: lead pipeline board (columns by stage, create, stage move) + nav"
```

---

### Task 4: Lead detail page + client

**Files:**
- Create: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`
- Create: `components/admin/LeadDetailClient.tsx`

- [ ] **Step 1: Detail page** — `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getLead } from '@/actions/leads'
import { LeadDetailClient } from '@/components/admin/LeadDetailClient'

export default async function LeadDetailPage({ params }: { params: Promise<{ orgSlug: string; leadId: string }> }) {
  const { orgSlug, leadId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const lead = await getLead(orgId, leadId)
  if (!lead) notFound()
  return <LeadDetailClient orgId={orgId} orgSlug={orgSlug} lead={lead} />
}
```

- [ ] **Step 2: Detail client** — `components/admin/LeadDetailClient.tsx` (`'use client'`)

Props: `{ orgId: string; orgSlug: string; lead: Lead }`. Behavior:
- An editable form (controlled inputs seeded from `lead`) for: name, organization, email, phone, event type, event date, estimated value, a stage `<select>` (5 stages), and a `<textarea>` for notes.
- "Save" → build an updates object from current field values (send `''`/empty optional fields as `null` so they clear via `FieldValue.delete()`; numbers parsed; `estimated_value` empty → `null`) and `await updateLead(orgId, lead.id, updates)`; show a saved notice. Keep `name` required.
- "Delete lead" (destructive, with `confirm()`) → `await deleteLead(orgId, lead.id)` then `router.push(`/${orgSlug}/leads`)`.
- A back link to `/${orgSlug}/leads`. `error`/`notice` in an `aria-live` region. `useRouter` from `next/navigation`.
- Imports: `updateLead, deleteLead` from `@/actions/leads`; `LEAD_STAGES, LEAD_STAGE_LABELS` from `@/lib/leads`; `Lead, LeadStage` from `@/lib/types`; UI primitives + `Card`.

- [ ] **Step 3: Verify**

- `npx tsc --noEmit` clean.
- `npx vitest run` all green.
- `npx next build` (copy env first: `cp /Users/rm/vw/traxevent/.env.local .env.local`, build, then `rm -f .env.local`) → succeeds; routes `/[orgSlug]/leads` and `/[orgSlug]/leads/[leadId]` appear; no collisions.

- [ ] **Step 4: Commit** (do NOT add `.env.local`)

```bash
git add "app/(admin)/[orgSlug]/leads/[leadId]/page.tsx" components/admin/LeadDetailClient.tsx
git commit -m "feat: lead detail page — edit fields/stage/notes, delete"
```

---

### Task 5: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run` → all green; record final count.
- [ ] **Step 3:** `npx next build` (with `.env.local`) → succeeds; confirm the two new routes + no collisions.
- [ ] **Step 4:** Commit this plan file (`docs: phase 5a ...`).
- [ ] **Step 5:** Hand back for branch finish (push + PR + squash-merge as `Lifewithmo`, verify prod deploy).

---

## Self-Review

**Spec coverage:** Roadmap "Lead pipeline (Inquiry → Consultation → Proposal → Booked → Delivered)" + the user's chosen CRM-foundation scope: lead entity (Task 1), org-scoped CRUD + stage move (Task 2), pipeline board with create + stage change (Task 3), lead detail edit/delete (Task 4). Covered. The lead/client entity is now available for Phase 5b proposals / 5c invoices / client portal to reference.

**Placeholder scan:** Types, helpers, and actions are verbatim. Pages are verbatim. The two client components are specified behaviorally with exact prop types, action names, field lists, and the reference file (`DepartmentsClient`) to mirror — acceptable for mechanical UI work.

**Type consistency:** `LeadStage`/`Lead` (Task 1) are used by `lib/leads.ts` helpers, `actions/leads.ts`, and both UI tasks. `LEAD_STAGES`/`LEAD_STAGE_LABELS`/`groupLeadsByStage`/`pipelineSummary` signatures match across def (Task 1), action validation (Task 2), and board (Task 3). `CreateLeadInput` matches the board's create form. `setLeadStage(orgId, leadId, stage)` / `updateLead(orgId, leadId, updates)` / `deleteLead(orgId, leadId)` match their UI callers.

**Security note:** Org-scoped, path-isolated (`orgs/{orgId}/leads`). Reads gated by `assertOrgMember`, all mutations by `assertOrgAdmin` (owner/admin only) — matching the departments precedent. Stage values validated against `LEAD_STAGES` on every create/update/move. Leads are internal CRM data (no public surface in this phase), so no unauthenticated exposure.
