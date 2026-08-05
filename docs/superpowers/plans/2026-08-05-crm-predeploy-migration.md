# CRM Pre-Deploy Migration & Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CRM migration/backfill tooling correct, safe, and runnable — extract guard-free data cores so admin scripts can write without a Next.js request scope, unblock the customer backfill, and add a legacy-stage backfill; all idempotent, dry-run-capable, and green.

**Architecture:** Split each touched action into a plain data **core** (`lib/crm/*.ts`, no `'use server'`, no auth) and a thin server-action wrapper (`assert*` then delegate). Scripts import the cores directly. Two runners (`migrate`, `backfillStages`) share a dry-run + ESM entrypoint pattern and are exposed via npm scripts.

**Tech Stack:** Next.js 16 (server actions), TypeScript, Firestore (`firebase-admin`), Vitest, `tsx` (script runner).

## Global Constraints

- **This is NOT stock Next.js** — consult `node_modules/next/dist/docs/` before any server-action change; heed deprecation notices (per AGENTS.md).
- **Cores (`lib/crm/*.ts`) carry no `'use server'`, no `import 'server-only'`, and call no `assert*`.** They are a server data layer imported only by `actions/*` and by scripts — never by client components.
- **Actions stay behaviorally identical.** `actions/*` wrappers keep their current signatures, validation semantics, and side effects — including `updateLead`'s stage-change `ActivityEvent` logging and `setLeadStage`. Existing action tests must pass **unchanged**.
- **Extraction is scoped** to `createCustomerCore`, `listLeadsCore`, `updateLeadCore`, plus the shared `customersRef`/`leadsRef` helpers. Do not extract cores for `createLead`, `updateCustomer`, `setLeadStage`, `getLead`, `deleteLead` — they stay in the action, using the imported ref helper.
- **Stage mapping:** `booked → closed_won`, `delivered → closed_won`; every other stage → `null` (no change). Idempotent (V1 stages map to null).
- **The stage backfill writes through the core, so it emits NO activity events** — deliberate; a bulk migration must not flood activity timelines.
- **Scripts are idempotent and dry-run-capable.** A `--dry-run` flag reports what would change with **zero** writes. The runnable entrypoint uses a `process.argv[1].endsWith('<filename>')` guard (works under `tsx`, inert under Vitest import). npm scripts: `crm:migrate`, `crm:backfill-stages`.
- **Tests** mock `@/lib/firebase-admin` (or the cores) with `vi.hoisted` spies, matching `__tests__/actions/customers.test.ts` style.
- **Green gate each task:** `npx tsc --noEmit` clean AND `npm test` passing (run `npm install` first if ~5 `server-only` load failures appear — a node_modules sync quirk, no lockfile change).
- **Branch:** work on `claude/crm-predeploy-migration` (off `main`); confirm `git rev-parse --abbrev-ref HEAD` before every commit. Never commit to `main`.
- **Do NOT run the migration/backfill against any real environment** as part of this work. Deliver runnable, dry-run-capable tooling only.

---

### Task 1: `lib/crm/customers.ts` core + rewire `actions/customers.ts`

**Files:**
- Create: `lib/crm/customers.ts`
- Create: `__tests__/lib/crm/customers.test.ts`
- Modify: `actions/customers.ts` (delegate to the core; keep signatures)

**Interfaces:**
- Produces: `interface CreateCustomerInput { name; company?; email?; phone?; tags?: string[]; notes? }`; `customersRef(orgId)`; `createCustomerCore(orgId, input: CreateCustomerInput): Promise<Customer>` (validates name, no auth).
- Consumes (by the action): `createCustomerCore`, `customersRef`, `CreateCustomerInput`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/crm/customers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const custDoc = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined) }))
const collRef = vi.hoisted(() => ({ doc: vi.fn(() => custDoc) }))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))
import { createCustomerCore } from '@/lib/crm/customers'

describe('createCustomerCore', () => {
  beforeEach(() => vi.clearAllMocks())
  it('requires a name', async () => {
    await expect(createCustomerCore('o1', { name: '  ' })).rejects.toThrow('Name is required')
  })
  it('writes a customer with an id + timestamp and only present optional fields', async () => {
    const c = await createCustomerCore('o1', { name: 'Dana Kim', company: 'Riverside Corp', email: 'dana@riv.co' })
    expect(c.id).toBeTruthy()
    expect(c.created_at).toBeTruthy()
    expect(custDoc.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Dana Kim', company: 'Riverside Corp', email: 'dana@riv.co' })
    )
    // phone/tags/notes absent → not in payload
    const written = custDoc.set.mock.calls[0][0]
    expect('phone' in written).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/crm/customers.test.ts`
Expected: FAIL — module `@/lib/crm/customers` not found.

- [ ] **Step 3: Create the core**

Create `lib/crm/customers.ts`:

```ts
import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import type { Customer } from '@/lib/types'

export interface CreateCustomerInput {
  name: string
  company?: string
  email?: string
  phone?: string
  tags?: string[]
  notes?: string
}

export function customersRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('customers')
}

/** Guard-free customer create. Authorization is the caller's responsibility. */
export async function createCustomerCore(orgId: string, input: CreateCustomerInput): Promise<Customer> {
  if (!input.name?.trim()) throw new Error('Name is required')
  const id = randomBytes(8).toString('hex')
  const customer: Customer = {
    id,
    name: input.name.trim(),
    created_at: new Date().toISOString(),
    ...(input.company?.trim() ? { company: input.company.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await customersRef(orgId).doc(id).set(customer)
  return customer
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/crm/customers.test.ts` → PASS.

- [ ] **Step 5: Rewire `actions/customers.ts` to delegate**

Replace the file's top imports + `customersRef` + `createCustomer` so the action delegates to the core; keep `listCustomers`, `getCustomer`, `updateCustomer` (they now use the imported `customersRef`). The full file becomes:

```ts
'use server'

import { FieldValue } from 'firebase-admin/firestore'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { createCustomerCore, customersRef, type CreateCustomerInput } from '@/lib/crm/customers'
import type { Customer } from '@/lib/types'

export type { CreateCustomerInput }

export async function listCustomers(orgId: string): Promise<Customer[]> {
  await assertOrgMember(orgId)
  const snap = await customersRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Customer)
}

export async function getCustomer(orgId: string, customerId: string): Promise<Customer | null> {
  await assertOrgMember(orgId)
  const snap = await customersRef(orgId).doc(customerId).get()
  return snap.exists ? (snap.data() as Customer) : null
}

export async function createCustomer(orgId: string, input: CreateCustomerInput): Promise<Customer> {
  await assertOrgAdmin(orgId)
  return createCustomerCore(orgId, input)
}

export interface CustomerUpdate {
  name?: string
  company?: string | null
  email?: string | null
  phone?: string | null
  tags?: string[] | null
  notes?: string | null
}

export async function updateCustomer(orgId: string, customerId: string, updates: CustomerUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  await customersRef(orgId).doc(customerId).update({ ...cleaned, updated_at: new Date().toISOString() })
}
```

- [ ] **Step 6: Repoint any other `CreateCustomerInput` importer**

Run: `git grep -n "CreateCustomerInput"`
The action re-exports the type, so existing `@/actions/customers` importers keep working. If any file imports it from a now-wrong path, leave it — no change needed unless tsc complains.

- [ ] **Step 7: Typecheck + full suite**

Run: `npx tsc --noEmit` (clean) and `npm test`. The existing `__tests__/actions/customers.test.ts` must pass **unchanged** (the action still validates the blank name and writes the same payload, now via the core).

- [ ] **Step 8: Commit**

```bash
git add lib/crm/customers.ts __tests__/lib/crm/customers.test.ts actions/customers.ts
git commit -m "refactor(crm): extract guard-free createCustomerCore; actions delegate"
```

---

### Task 2: `lib/crm/leads.ts` cores + rewire `actions/leads.ts`

**Files:**
- Create: `lib/crm/leads.ts`
- Create: `__tests__/lib/crm/leads.test.ts`
- Modify: `actions/leads.ts` (delegate `listLeads`/`updateLead`; keep others + stage-activity logging)

**Interfaces:**
- Produces: `interface LeadUpdate { name?; email?|null; phone?|null; organization?|null; event_type?|null; event_date?|null; estimated_value?|null; stage?: LeadStage; notes?|null; customer_id?|null }`; `leadsRef(orgId)`; `listLeadsCore(orgId): Promise<Lead[]>`; `updateLeadCore(orgId, leadId, updates: LeadUpdate): Promise<void>` (validates stage, cleaned write, **no** activity logging).
- Consumes (by the action): `leadsRef`, `listLeadsCore`, `updateLeadCore`, `LeadUpdate`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/crm/leads.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const leadDoc = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue(undefined) }))
const orderGet = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
const collRef = vi.hoisted(() => ({ doc: vi.fn(() => leadDoc), orderBy: vi.fn(() => ({ get: orderGet })) }))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))
import { listLeadsCore, updateLeadCore } from '@/lib/crm/leads'

describe('updateLeadCore', () => {
  beforeEach(() => vi.clearAllMocks())
  it('rejects an invalid stage', async () => {
    await expect(updateLeadCore('o1', 'l1', { stage: 'bogus' as never })).rejects.toThrow('Invalid stage')
    expect(leadDoc.update).not.toHaveBeenCalled()
  })
  it('writes cleaned updates with updated_at', async () => {
    await updateLeadCore('o1', 'l1', { customer_id: 'c1', stage: 'proposal' })
    expect(leadDoc.update).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 'c1', stage: 'proposal', updated_at: expect.any(String) })
    )
  })
  it('does NOT log activity (no import of @/lib/activity needed)', async () => {
    // updateLeadCore performs only the write; activity logging lives in the action wrapper.
    await updateLeadCore('o1', 'l1', { stage: 'closed_won' })
    expect(leadDoc.update).toHaveBeenCalledTimes(1)
  })
})

describe('listLeadsCore', () => {
  beforeEach(() => vi.clearAllMocks())
  it('maps ordered docs', async () => {
    orderGet.mockResolvedValueOnce({ docs: [{ data: () => ({ id: 'l1', name: 'A', stage: 'inquiry', created_at: '' }) }] })
    const leads = await listLeadsCore('o1')
    expect(leads).toEqual([{ id: 'l1', name: 'A', stage: 'inquiry', created_at: '' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/crm/leads.test.ts`
Expected: FAIL — module `@/lib/crm/leads` not found.

- [ ] **Step 3: Create the cores**

Create `lib/crm/leads.ts`:

```ts
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { LEAD_STAGES } from '@/lib/leads'
import type { Lead, LeadStage } from '@/lib/types'

export interface LeadUpdate {
  name?: string
  email?: string | null
  phone?: string | null
  organization?: string | null
  event_type?: string | null
  event_date?: string | null
  estimated_value?: number | null
  stage?: LeadStage
  notes?: string | null
  customer_id?: string | null
}

export function leadsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('leads')
}

export async function listLeadsCore(orgId: string): Promise<Lead[]> {
  const snap = await leadsRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Lead)
}

/** Guard-free lead update. Validates stage; performs no auth and logs no activity. */
export async function updateLeadCore(orgId: string, leadId: string, updates: LeadUpdate): Promise<void> {
  if (updates.stage && !LEAD_STAGES.includes(updates.stage)) throw new Error('Invalid stage')
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  await leadsRef(orgId).doc(leadId).update({ ...cleaned, updated_at: new Date().toISOString() })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/crm/leads.test.ts` → PASS.

- [ ] **Step 5: Rewire `actions/leads.ts` to delegate**

Keep `CreateLeadInput`, `createLead`, `getLead`, `setLeadStage`, `deleteLead` (they use the imported `leadsRef`). Replace the top imports + `leadsRef` + `listLeads` + `updateLead`. The resulting file:

```ts
'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { LEAD_STAGES } from '@/lib/leads'
import { logActivity } from '@/lib/activity'
import { leadsRef, listLeadsCore, updateLeadCore, type LeadUpdate } from '@/lib/crm/leads'
import { randomBytes } from 'crypto'
import type { Lead, LeadStage } from '@/lib/types'

export type { LeadUpdate }

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
  return listLeadsCore(orgId)
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

export async function updateLead(orgId: string, leadId: string, updates: LeadUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  let prevStage: LeadStage | undefined
  if (updates.stage) {
    const snap = await leadsRef(orgId).doc(leadId).get()
    prevStage = snap.exists ? (snap.data() as Lead).stage : undefined
  }
  await updateLeadCore(orgId, leadId, updates)
  if (updates.stage && updates.stage !== prevStage) {
    await logActivity(orgId, { parent_type: 'opportunity', parent_id: leadId, kind: 'stage', summary: `Stage → ${updates.stage}` })
  }
}

export async function setLeadStage(orgId: string, leadId: string, stage: LeadStage): Promise<void> {
  await assertOrgAdmin(orgId)
  if (!LEAD_STAGES.includes(stage)) throw new Error('Invalid stage')
  await leadsRef(orgId).doc(leadId).update({ stage, updated_at: new Date().toISOString() })
  await logActivity(orgId, { parent_type: 'opportunity', parent_id: leadId, kind: 'stage', summary: `Stage → ${stage}` })
}

export async function deleteLead(orgId: string, leadId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await leadsRef(orgId).doc(leadId).delete()
}
```

> Note: stage validation now lives in `updateLeadCore`; the action's `updateLead` relies on it (the invalid-stage throw still surfaces to callers). `setLeadStage` keeps its own inline validation + write (not routed through the core, unchanged behavior).

- [ ] **Step 6: Typecheck + full suite (regression gate)**

Run: `npx tsc --noEmit` (clean) and `npm test`. The existing `__tests__/actions/leads.test.ts` must pass **unchanged** — updateLead still reads prevStage, writes cleaned updates, and logs a stage `ActivityEvent` only on an actual change. If a test asserts strict call-ordering that the delegation broke, STOP and report (do not weaken the test).

- [ ] **Step 7: Commit**

```bash
git add lib/crm/leads.ts __tests__/lib/crm/leads.test.ts actions/leads.ts
git commit -m "refactor(crm): extract guard-free listLeadsCore/updateLeadCore; actions delegate"
```

---

### Task 3: Unblock `migrate()` — use cores, add dry-run, runnable entrypoint

**Files:**
- Modify: `scripts/crm-migrate-customers.ts`
- Modify: `__tests__/scripts/crm-migrate-customers.test.ts` (add dry-run/real-run coverage)
- Modify: `package.json` (add `crm:migrate` script; add `tsx` devDependency if missing)

**Interfaces:**
- Consumes: `createCustomerCore`, `CreateCustomerInput` (`@/lib/crm/customers`); `listLeadsCore`, `updateLeadCore` (`@/lib/crm/leads`).
- Produces: `leadToCustomerInput(lead): CreateCustomerInput` (unchanged); `migrate(orgId, opts?: { dryRun?: boolean }): Promise<MigrationSummary>`.

- [ ] **Step 1: Write the failing test**

Replace `__tests__/scripts/crm-migrate-customers.test.ts` with (keeps the pure-mapping cases, adds run coverage; mocks the cores so importing the script is side-effect-free):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const createCustomerCore = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'c1' }))
const listLeadsCore = vi.hoisted(() => vi.fn())
const updateLeadCore = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/lib/crm/customers', () => ({ createCustomerCore: (...a: unknown[]) => createCustomerCore(...a) }))
vi.mock('@/lib/crm/leads', () => ({
  listLeadsCore: (...a: unknown[]) => listLeadsCore(...a),
  updateLeadCore: (...a: unknown[]) => updateLeadCore(...a),
}))
import { leadToCustomerInput, migrate } from '@/scripts/crm-migrate-customers'

describe('leadToCustomerInput', () => {
  it('maps present contact fields', () => {
    expect(leadToCustomerInput({ id: 'l', name: 'Dana Kim', organization: 'Riverside Corp', email: 'dana@riv.co', phone: '555', stage: 'inquiry', created_at: '' } as never))
      .toEqual({ name: 'Dana Kim', company: 'Riverside Corp', email: 'dana@riv.co', phone: '555' })
  })
  it('omits missing optional fields', () => {
    expect(leadToCustomerInput({ id: 'l', name: 'Sam', stage: 'inquiry', created_at: '' } as never)).toEqual({ name: 'Sam' })
  })
})

describe('migrate', () => {
  beforeEach(() => vi.clearAllMocks())
  it('dry-run counts but writes nothing', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', name: 'A', stage: 'inquiry', created_at: '' }])
    const s = await migrate('o1', { dryRun: true })
    expect(createCustomerCore).not.toHaveBeenCalled()
    expect(updateLeadCore).not.toHaveBeenCalled()
    expect(s).toMatchObject({ totalLeads: 1, created: 1, alreadyLinked: 0 })
  })
  it('real run creates a customer and links the lead', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', name: 'A', email: 'a@x.co', stage: 'inquiry', created_at: '' }])
    await migrate('o1')
    expect(createCustomerCore).toHaveBeenCalledWith('o1', expect.objectContaining({ name: 'A', email: 'a@x.co' }))
    expect(updateLeadCore).toHaveBeenCalledWith('o1', 'l1', { customer_id: 'c1' })
  })
  it('skips leads already linked (idempotent)', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', name: 'A', customer_id: 'c9', stage: 'inquiry', created_at: '' }])
    const s = await migrate('o1')
    expect(createCustomerCore).not.toHaveBeenCalled()
    expect(s).toMatchObject({ alreadyLinked: 1, created: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/scripts/crm-migrate-customers.test.ts`
Expected: FAIL — `migrate` doesn't accept `dryRun` / still imports the actions.

- [ ] **Step 3: Rewrite the script**

Replace `scripts/crm-migrate-customers.ts` with:

```ts
import { createCustomerCore, type CreateCustomerInput } from '@/lib/crm/customers'
import { listLeadsCore, updateLeadCore } from '@/lib/crm/leads'
import type { Lead } from '@/lib/types'

/** Pure mapping from a Lead's contact fields to a CreateCustomerInput (present fields only). */
export function leadToCustomerInput(lead: Lead): CreateCustomerInput {
  return {
    name: lead.name,
    ...(lead.organization ? { company: lead.organization } : {}),
    ...(lead.email ? { email: lead.email } : {}),
    ...(lead.phone ? { phone: lead.phone } : {}),
  }
}

export interface MigrationSummary {
  totalLeads: number
  alreadyLinked: number
  created: number
  deduped: number
}

/**
 * For every lead in `orgId` without a customer_id, create a Customer (dedup by
 * normalized email within the run) and link the lead via customer_id.
 * Idempotent (already-linked leads are skipped). `dryRun` performs no writes.
 */
export async function migrate(orgId: string, opts: { dryRun?: boolean } = {}): Promise<MigrationSummary> {
  const { dryRun = false } = opts
  const leads = await listLeadsCore(orgId)
  const emailToCustomerId = new Map<string, string>()
  let alreadyLinked = 0
  let created = 0
  let deduped = 0

  for (const lead of leads) {
    if (lead.customer_id) {
      alreadyLinked++
      continue
    }
    const dedupKey = lead.email ? lead.email.trim().toLowerCase() : undefined
    const existingId = dedupKey ? emailToCustomerId.get(dedupKey) : undefined

    let customerId: string
    if (existingId) {
      customerId = existingId
      deduped++
    } else {
      customerId = dryRun ? `dry-${created}` : (await createCustomerCore(orgId, leadToCustomerInput(lead))).id
      created++
      if (dedupKey) emailToCustomerId.set(dedupKey, customerId)
    }

    if (!dryRun) await updateLeadCore(orgId, lead.id, { customer_id: customerId })
  }

  return { totalLeads: leads.length, alreadyLinked, created, deduped }
}

// CLI entrypoint — true under `tsx scripts/crm-migrate-customers.ts`, inert under Vitest import.
if (process.argv[1]?.endsWith('crm-migrate-customers.ts')) {
  const orgId = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  if (!orgId) {
    console.error('Usage: npm run crm:migrate -- <orgId> [--dry-run]')
    process.exit(1)
  }
  migrate(orgId, { dryRun })
    .then((summary) => {
      console.log(dryRun ? 'DRY RUN — no writes made.' : 'Migration complete.', summary)
      process.exit(0)
    })
    .catch((err) => {
      console.error('Migration failed:', err)
      process.exit(1)
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/scripts/crm-migrate-customers.test.ts` → PASS.

- [ ] **Step 5: Add `tsx` + the npm script**

Run: `npm ls tsx --depth=0 2>/dev/null || npm install -D tsx`
Then add to `package.json` `"scripts"`:

```json
"crm:migrate": "tsx scripts/crm-migrate-customers.ts",
```

- [ ] **Step 6: Typecheck + full suite + commit**

Run: `npx tsc --noEmit` (clean), `npm test` (green). Then:

```bash
git add scripts/crm-migrate-customers.ts __tests__/scripts/crm-migrate-customers.test.ts package.json package-lock.json
git commit -m "feat(crm): unblock customer migration via cores + dry-run + npm script"
```

---

### Task 4: `scripts/crm-backfill-stages.ts` — legacy stage backfill

**Files:**
- Create: `scripts/crm-backfill-stages.ts`
- Create: `__tests__/scripts/crm-backfill-stages.test.ts`
- Modify: `package.json` (add `crm:backfill-stages` script)

**Interfaces:**
- Consumes: `listLeadsCore`, `updateLeadCore` (`@/lib/crm/leads`).
- Produces: `mapLegacyStage(stage: string): LeadStage | null`; `backfillStages(orgId, opts?: { dryRun?: boolean }): Promise<BackfillSummary>`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/scripts/crm-backfill-stages.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const listLeadsCore = vi.hoisted(() => vi.fn())
const updateLeadCore = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/lib/crm/leads', () => ({
  listLeadsCore: (...a: unknown[]) => listLeadsCore(...a),
  updateLeadCore: (...a: unknown[]) => updateLeadCore(...a),
}))
import { mapLegacyStage, backfillStages } from '@/scripts/crm-backfill-stages'

describe('mapLegacyStage', () => {
  it('booked → closed_won', () => expect(mapLegacyStage('booked')).toBe('closed_won'))
  it('delivered → closed_won', () => expect(mapLegacyStage('delivered')).toBe('closed_won'))
  it('current V1 stages are unchanged (null)', () => {
    for (const s of ['inquiry', 'consultation', 'proposal', 'closed_won', 'closed_lost']) {
      expect(mapLegacyStage(s)).toBeNull()
    }
  })
})

describe('backfillStages', () => {
  beforeEach(() => vi.clearAllMocks())
  it('dry-run reports changes but writes nothing', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', stage: 'booked' }, { id: 'l2', stage: 'inquiry' }])
    const s = await backfillStages('o1', { dryRun: true })
    expect(updateLeadCore).not.toHaveBeenCalled()
    expect(s).toMatchObject({ totalLeads: 2, rewritten: 1, unchanged: 1 })
    expect(s.changes).toEqual([{ id: 'l1', from: 'booked', to: 'closed_won' }])
  })
  it('rewrites legacy leads to closed_won', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', stage: 'delivered' }])
    await backfillStages('o1')
    expect(updateLeadCore).toHaveBeenCalledWith('o1', 'l1', { stage: 'closed_won' })
  })
  it('is idempotent on already-migrated data', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', stage: 'closed_won' }, { id: 'l2', stage: 'proposal' }])
    const s = await backfillStages('o1')
    expect(updateLeadCore).not.toHaveBeenCalled()
    expect(s.rewritten).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/scripts/crm-backfill-stages.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the script**

Create `scripts/crm-backfill-stages.ts`:

```ts
import { listLeadsCore, updateLeadCore } from '@/lib/crm/leads'
import type { LeadStage } from '@/lib/types'

/** Map a legacy (dropped) stage to its V1 equivalent, or null if no change is needed. */
export function mapLegacyStage(stage: string): LeadStage | null {
  if (stage === 'booked' || stage === 'delivered') return 'closed_won'
  return null
}

export interface BackfillSummary {
  totalLeads: number
  rewritten: number
  unchanged: number
  changes: { id: string; from: string; to: LeadStage }[]
}

/**
 * Rewrite any lead stored at a dropped stage (booked/delivered → closed_won).
 * Idempotent (V1 stages map to null → untouched). `dryRun` performs no writes.
 * Writes through the core, so it emits no `stage` ActivityEvent (deliberate).
 */
export async function backfillStages(orgId: string, opts: { dryRun?: boolean } = {}): Promise<BackfillSummary> {
  const { dryRun = false } = opts
  const leads = await listLeadsCore(orgId)
  let rewritten = 0
  let unchanged = 0
  const changes: BackfillSummary['changes'] = []

  for (const lead of leads) {
    const from = lead.stage as unknown as string
    const to = mapLegacyStage(from)
    if (!to) {
      unchanged++
      continue
    }
    changes.push({ id: lead.id, from, to })
    if (!dryRun) await updateLeadCore(orgId, lead.id, { stage: to })
    rewritten++
  }

  return { totalLeads: leads.length, rewritten, unchanged, changes }
}

// CLI entrypoint — true under `tsx scripts/crm-backfill-stages.ts`, inert under Vitest import.
if (process.argv[1]?.endsWith('crm-backfill-stages.ts')) {
  const orgId = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  if (!orgId) {
    console.error('Usage: npm run crm:backfill-stages -- <orgId> [--dry-run]')
    process.exit(1)
  }
  backfillStages(orgId, { dryRun })
    .then((summary) => {
      console.log(dryRun ? 'DRY RUN — no writes made.' : 'Backfill complete.', summary)
      process.exit(0)
    })
    .catch((err) => {
      console.error('Backfill failed:', err)
      process.exit(1)
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/scripts/crm-backfill-stages.test.ts` → PASS.

- [ ] **Step 5: Add the npm script**

Add to `package.json` `"scripts"`:

```json
"crm:backfill-stages": "tsx scripts/crm-backfill-stages.ts",
```

- [ ] **Step 6: Typecheck + full suite + commit**

Run: `npx tsc --noEmit` (clean), `npm test` (green). Then:

```bash
git add scripts/crm-backfill-stages.ts __tests__/scripts/crm-backfill-stages.test.ts package.json
git commit -m "feat(crm): legacy stage backfill (booked/delivered → closed_won) + dry-run"
```

---

## Final whole-branch review

After Task 4, run a whole-branch review (superpowers:requesting-code-review / the SDD final review) covering: cores carry no auth / no `server-only`; actions preserve signatures + `updateLead`/`setLeadStage` activity logging; existing action tests unchanged; both scripts idempotent + dry-run correct + entrypoint inert under tests; `lead_id` re-pointing correctly omitted; tsc + full vitest green. Address findings, then open a PR against `main` and STOP (do not merge — the operator runs the scripts).

---

## Self-Review (author checklist)

**Spec coverage** (against the pre-deploy migration design):
- Script-safe auth path via guard-free cores → Tasks 1–2 ✅ (`lib/crm/customers.ts`, `lib/crm/leads.ts`; actions delegate).
- Customer backfill unblocked → Task 3 ✅ (`migrate` uses cores; dry-run; entrypoint).
- Legacy stage backfill (`booked`/`delivered → closed_won`, idempotent, no activity) → Task 4 ✅.
- Dropped `lead_id` re-pointing → not a task (documented in spec/final review) ✅.
- Dry-run + idempotency + runnable ESM entrypoint + npm scripts + `tsx` → Tasks 3–4 ✅.
- Tests mock firebase-admin/cores; existing action tests unchanged → Tasks 1–2 regression gates ✅.

**Placeholder scan:** every step has real code/commands; no TBD/TODO. ✅

**Type consistency:** `CreateCustomerInput`/`createCustomerCore` (Task 1) consumed by Task 3; `LeadUpdate`/`listLeadsCore`/`updateLeadCore` (Task 2) consumed by Tasks 3–4; `MigrationSummary`, `BackfillSummary`, `mapLegacyStage` names stable across producer/consumer. Action re-exports (`CreateCustomerInput`, `LeadUpdate`) preserve existing importers. ✅
