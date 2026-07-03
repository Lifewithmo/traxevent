# Phase 5f: Vendor Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track external **vendors** (florist, caterer, DJ, photographer, …) per event/lead — name, service, contact, cost, and status (potential → confirmed → declined). Org-internal only (no client-facing surface). Surfaces on the lead detail page with a committed-cost total.

**Architecture:** Org-scoped subcollection `orgs/{orgId}/vendors/{vendorId}`, carrying `lead_id`. Admin-only CRUD (`assertOrgMember` read / `assertOrgAdmin` mutate) — identical to the `departments`/`leads` pattern; NO token, NO public page, NO cross-tenant surface (so no security-review gate needed). Pure helpers for status constants + cost totals. Money in dollars.

**Tech Stack:** Next.js 16 App Router (`params` is a Promise), Firebase Admin, Vitest. UI primitives: `@/components/ui/{card,button,input,label,badge}` + native `<select>`/`<textarea>`.

**Baseline:** 485 tests passing (run `npm install` first; if `vitest` shows worker-spawn TIMEOUTS use `--maxWorkers=2` — those are environmental, not assertion failures).

---

### Task 1: Vendor types + pure helpers

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/vendors.ts`
- Create: `__tests__/lib/vendors.test.ts`

- [ ] **Step 1: Write the failing test** — `__tests__/lib/vendors.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { VENDOR_STATUSES, VENDOR_STATUS_LABELS, confirmedVendorCost, totalVendorCost } from '@/lib/vendors'
import type { Vendor } from '@/lib/types'

const v = (status: Vendor['status'], cost?: number): Vendor =>
  ({ id: 'x', lead_id: 'l', name: 'n', status, created_at: '', ...(cost != null ? { cost } : {}) }) as Vendor

describe('VENDOR_STATUSES', () => {
  it('is the three statuses with labels', () => {
    expect(VENDOR_STATUSES).toEqual(['potential', 'confirmed', 'declined'])
    for (const s of VENDOR_STATUSES) expect(VENDOR_STATUS_LABELS[s]).toBeTruthy()
  })
})

describe('confirmedVendorCost', () => {
  it('sums cost of confirmed vendors only, rounded to cents', () => {
    expect(confirmedVendorCost([v('confirmed', 1200), v('potential', 500), v('confirmed', 45.5), v('declined', 999)])).toBe(1245.5)
    expect(confirmedVendorCost([v('potential', 500)])).toBe(0)
  })
})

describe('totalVendorCost', () => {
  it('sums cost across all non-declined vendors', () => {
    expect(totalVendorCost([v('confirmed', 1200), v('potential', 500), v('declined', 999)])).toBe(1700)
    expect(totalVendorCost([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/lib/vendors.test.ts` → FAIL.

- [ ] **Step 3: Update `lib/types.ts`** — add near the other business-vertical types:

```typescript
export type VendorStatus = 'potential' | 'confirmed' | 'declined'

export interface Vendor {
  id: string
  lead_id: string
  name: string
  service?: string       // e.g. Florist, Catering, DJ, Photography
  contact_name?: string
  email?: string
  phone?: string
  cost?: number          // dollars
  status: VendorStatus
  notes?: string
  created_at: string
  updated_at?: string
}
```

- [ ] **Step 4: Create `lib/vendors.ts`**

```typescript
import type { Vendor, VendorStatus } from '@/lib/types'

export const VENDOR_STATUSES: VendorStatus[] = ['potential', 'confirmed', 'declined']

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  potential: 'Potential',
  confirmed: 'Confirmed',
  declined: 'Declined',
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Committed spend: cost of confirmed vendors only.
export function confirmedVendorCost(vendors: Vendor[]): number {
  return round2(vendors.filter((v) => v.status === 'confirmed').reduce((sum, v) => sum + (v.cost ?? 0), 0))
}

// Cost across all non-declined vendors (confirmed + potential).
export function totalVendorCost(vendors: Vendor[]): number {
  return round2(vendors.filter((v) => v.status !== 'declined').reduce((sum, v) => sum + (v.cost ?? 0), 0))
}
```

- [ ] **Step 5: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run --maxWorkers=2` all green.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/vendors.ts "__tests__/lib/vendors.test.ts"
git commit -m "feat: Vendor types + status/cost pure helpers"
```

---

### Task 2: Vendor actions (org-scoped CRUD)

**Files:**
- Create: `actions/vendors.ts`
- Create: `__tests__/actions/vendors.test.ts`

- [ ] **Step 1: Write the failing tests** — mirror `__tests__/actions/leads.test.ts` mock style.

Hoisted spies; mock `@/lib/firebase-admin` so `adminDb.collection('orgs').doc(orgId).collection('vendors')` exposes `.doc(id?)` → `{ id: id ?? 'new-vendor-id', set, update, delete }` and `.where('lead_id','==',v).orderBy('created_at','asc').get()` → `listVendorsSpy`. Mock `@/lib/auth/assert` (resolve `{ role: 'admin' }`). Mock `firebase-admin/firestore` `FieldValue.delete` → sentinel. Cover:
- **createVendor**: writes with generated `id`, `lead_id`, `status` (default `'potential'`), `created_at`, plus passed `name`/`service`/`contact_name`/`email`/`phone`/`cost`/`notes` (blank strings omitted); returns it. Throws `'Name is required'` on blank name (no write). Throws `'Invalid status'` when `input.status` not in `VENDOR_STATUSES`.
- **listVendors**: `where('lead_id','==',leadId).orderBy('created_at','asc')`; mapped docs.
- **updateVendor**: `undefined` skipped, `null` → `FieldValue.delete()`, always `updated_at`; throws `'Invalid status'` on bad `updates.status`.
- **deleteVendor**: `.delete()`.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Create `actions/vendors.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { randomBytes } from 'crypto'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { VENDOR_STATUSES } from '@/lib/vendors'
import type { Vendor, VendorStatus } from '@/lib/types'

function vendorsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('vendors')
}

export interface CreateVendorInput {
  name: string
  service?: string
  contact_name?: string
  email?: string
  phone?: string
  cost?: number
  status?: VendorStatus
  notes?: string
}

export async function listVendors(orgId: string, leadId: string): Promise<Vendor[]> {
  await assertOrgMember(orgId)
  const snap = await vendorsRef(orgId).where('lead_id', '==', leadId).orderBy('created_at', 'asc').get()
  return snap.docs.map((d) => d.data() as Vendor)
}

export async function createVendor(orgId: string, leadId: string, input: CreateVendorInput): Promise<Vendor> {
  await assertOrgAdmin(orgId)
  if (!input.name?.trim()) throw new Error('Name is required')
  const status = input.status ?? 'potential'
  if (!VENDOR_STATUSES.includes(status)) throw new Error('Invalid status')
  const id = randomBytes(8).toString('hex')
  const vendor: Vendor = {
    id,
    lead_id: leadId,
    name: input.name.trim(),
    status,
    created_at: new Date().toISOString(),
    ...(input.service?.trim() ? { service: input.service.trim() } : {}),
    ...(input.contact_name?.trim() ? { contact_name: input.contact_name.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.cost != null ? { cost: input.cost } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await vendorsRef(orgId).doc(id).set(vendor)
  return vendor
}

export interface VendorUpdate {
  name?: string
  service?: string | null
  contact_name?: string | null
  email?: string | null
  phone?: string | null
  cost?: number | null
  status?: VendorStatus
  notes?: string | null
}

export async function updateVendor(orgId: string, vendorId: string, updates: VendorUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  if (updates.status && !VENDOR_STATUSES.includes(updates.status)) throw new Error('Invalid status')
  const cleaned: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(updates)) {
    if (val === undefined) continue
    cleaned[k] = val === null ? FieldValue.delete() : val
  }
  await vendorsRef(orgId).doc(vendorId).update({ ...cleaned, updated_at: new Date().toISOString() })
}

export async function deleteVendor(orgId: string, vendorId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await vendorsRef(orgId).doc(vendorId).delete()
}
```

- [ ] **Step 4: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run --maxWorkers=2` all green.

- [ ] **Step 5: Commit**

```bash
git add actions/vendors.ts "__tests__/actions/vendors.test.ts"
git commit -m "feat: org-scoped vendor actions (CRUD, validated)"
```

---

### Task 3: Vendors on the lead detail page

**Files:**
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`
- Create: `components/admin/LeadVendorsClient.tsx`

No new vitest tests; `npx tsc --noEmit` + `npx vitest run` stay green (build verified in Task 4).

- [ ] **Step 1: Fetch vendors on the lead detail page** — `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`

The page already renders `LeadDetailClient` + `LeadProposalsClient` + `LeadInvoicesClient` + `ClientPortalLinkClient` + `LeadContractsClient`. Additionally `const vendors = await listVendors(orgId, leadId)` (import from `@/actions/vendors`) and render `<LeadVendorsClient orgId={orgId} leadId={leadId} vendors={vendors} />` inside the existing wrapper.

- [ ] **Step 2: `components/admin/LeadVendorsClient.tsx`** (`'use client'`)

Props `{ orgId: string; leadId: string; vendors: Vendor[] }`. A Card "Vendors" (mirror `DepartmentsClient` inline-edit + optimistic style):
- Header shows a committed-cost summary: "Confirmed: $X" (`confirmedVendorCost(vendors)`) and "Est. total: $Y" (`totalVendorCost(vendors)`), formatted `$${n.toFixed(2)}`.
- "New vendor" button toggles a create form: name (required), service, contact name, email, phone, cost (`<input type="number">`), status `<select>` (VENDOR_STATUSES/VENDOR_STATUS_LABELS, default 'potential'), notes (`<textarea>`). Save → `await createVendor(orgId, leadId, {...})` (parse cost to number or omit), prepend to state, close.
- List each vendor as a row/card: name + service, contact (name/email/phone), cost (if set) `$${n.toFixed(2)}`, a status `<select>` bound to `vendor.status` → onChange `await updateVendor(orgId, vendor.id, { status })` (optimistic, revert on error, like `DepartmentsClient.handleRename`), and a "Delete" button → `deleteVendor` (optimistic remove). (Full-field editing beyond status is out of scope for this pass — status quick-change + delete + recreate is sufficient; note this in the report.)
- `error` in an aria-live region; empty state.
- Imports: `createVendor, updateVendor, deleteVendor` from `@/actions/vendors`; `VENDOR_STATUSES, VENDOR_STATUS_LABELS, confirmedVendorCost, totalVendorCost` from `@/lib/vendors`; `Vendor, VendorStatus` from `@/lib/types`; UI from `@/components/ui/{card,button,input,label,badge}`.

- [ ] **Step 3: Verify**

- `npx tsc --noEmit` clean.
- `npx vitest run --maxWorkers=2` all green.
- `npx next build` (copy env: `cp /Users/rm/vw/traxevent/.env.local .env.local`, build, then `rm -f .env.local`) → succeeds; the lead detail route still builds; no collisions (no new route added — vendors render inside the existing lead page).

- [ ] **Step 4: Commit** (do NOT add `.env.local`)

```bash
git add "app/(admin)/[orgSlug]/leads/[leadId]/page.tsx" components/admin/LeadVendorsClient.tsx
git commit -m "feat: vendor management on the lead detail page"
```

---

### Task 4: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run --maxWorkers=2` → all green; record final count.
- [ ] **Step 3:** `npx next build` (with `.env.local`) → succeeds; no collisions.
- [ ] **Step 4:** Commit this plan file (`docs: phase 5f ...`).
- [ ] **Step 5:** Hand back for branch finish (push + PR + squash-merge as `Lifewithmo`, verify prod deploy).

---

## Self-Review

**Spec coverage:** Roadmap "Vendor management (track external vendors per event)": vendor entity per lead with service/contact/cost/status (Task 1/2), CRUD + status workflow (Task 2), on the lead detail with committed-cost totals (Task 3). Covered. Org-internal (no client-facing surface), consistent with "track" (management), not client-shared.

**Placeholder scan:** Types, helpers, actions verbatim. The one client component is specified behaviorally against `DepartmentsClient`/`LeadProposalsClient` — acceptable for mechanical UI. Full-field inline editing is intentionally scoped out (status quick-change + delete/recreate) and noted.

**Type consistency:** `Vendor`/`VendorStatus` (Task 1) used by `lib/vendors.ts`, `actions/vendors.ts`, and the UI. `VENDOR_STATUSES`/`VENDOR_STATUS_LABELS`/`confirmedVendorCost`/`totalVendorCost` signatures match across def + callers. `createVendor(orgId, leadId, input)` / `updateVendor(orgId, id, VendorUpdate)` / `deleteVendor` / `listVendors(orgId, leadId)` match UI callers. `VendorUpdate` allows `null` to clear optional fields (same convention as `LeadUpdate`).

**Security note:** Org-scoped, path-isolated (`orgs/{orgId}/vendors`), reads `assertOrgMember` / mutations `assertOrgAdmin`, status validated against `VENDOR_STATUSES`. No token, no public/unauthenticated surface, no collectionGroup — this is standard internal admin CRUD identical to the reviewed `departments`/`leads` features, so no separate security review is warranted.
