# CRM V1 — Increment 1: Core Model, Health Logic & Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data + logic foundation of CRM V1 — a first-class `Customer`, `Task`, `Note`, and `ActivityEvent`, plus the derived "opportunity health" that powers the no-orphans discipline — evolving the existing `Lead` in place.

**Architecture:** Additive Firestore entities under `orgs/{orgId}/…`, following the existing `actions/leads.ts` action pattern (`'use server'`, `adminDb`, `assertOrgMember`/`assertOrgAdmin`). Opportunity "health" (active / waiting / needs-attention / closed) is a **pure derived function** of a lead + its tasks — never a stored flag. No UI in this increment.

**Tech Stack:** Next.js 16 (server actions), TypeScript, Firestore (`firebase-admin`), Vitest.

## Global Constraints

- **This is NOT stock Next.js** — consult `node_modules/next/dist/docs/` before any routing work (none expected here).
- Follow the existing action pattern in `actions/leads.ts`: `'use server'`, a `xxxRef(orgId)` helper, `assertOrgMember` for reads / `assertOrgAdmin` for writes, `randomBytes(8).toString('hex')` ids, ISO-string timestamps, and the `undefined`-skipping cleaned-update loop.
- **Keep the `leads` collection name** this increment. The `Lead`→`Opportunity` rename is a separate later increment. Where the spec says "opportunity," the code entity is still `Lead`.
- **Stages change** to the V1 set: `inquiry | consultation | proposal | closed_won | closed_lost` (open = the first three; closed = the last two). Drop `booked`/`delivered`.
- Health is **derived**, not stored: `computeHealth(lead, tasks)` and `nextAction(tasks)` are pure functions.
- Tags are `string[]` on Lead/Customer — no Tag entity.
- Tests mock `@/lib/firebase-admin` and `@/lib/auth/assert` with `vi.hoisted` spies — follow `__tests__/actions/event-types.test.ts` style.
- Green gate each task: `npx tsc --noEmit` clean AND `npm test` passing (run `npm install` first if the suite shows `server-only` load failures — that's a node_modules sync quirk, not a real failure).
- Work only in the worktree `/Users/rm/vw/traxevent/.claude/worktrees/crm-v1` on branch `claude/crm-v1`; confirm the branch before every commit.

---

### Task 1: V1 stages + Lead extension fields

**Files:**
- Modify: `lib/types.ts` (`LeadStage`, `Lead`)
- Modify: `lib/leads.ts` (`LEAD_STAGES`)
- Test: `__tests__/lib/leads.test.ts` (create or extend)

**Interfaces:**
- Produces: `LeadStage = 'inquiry' | 'consultation' | 'proposal' | 'closed_won' | 'closed_lost'`; `Lead` gains `customer_id?: string`, `tags?: string[]`, `waiting?: LeadWaiting`; `interface LeadWaiting { reason: string; follow_up_date?: string }`; `LEAD_STAGES` array of the 5 stages; `OPEN_STAGES` and `CLOSED_STAGES` exported from `lib/leads.ts`.

- [ ] **Step 1: Write the failing test**

Create/extend `__tests__/lib/leads.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { LEAD_STAGES, OPEN_STAGES, CLOSED_STAGES } from '@/lib/leads'

describe('lead stages (V1)', () => {
  it('has the five V1 stages', () => {
    expect(LEAD_STAGES).toEqual(['inquiry', 'consultation', 'proposal', 'closed_won', 'closed_lost'])
  })
  it('splits open vs closed', () => {
    expect(OPEN_STAGES).toEqual(['inquiry', 'consultation', 'proposal'])
    expect(CLOSED_STAGES).toEqual(['closed_won', 'closed_lost'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leads`
Expected: FAIL — new stages / exports not present.

- [ ] **Step 3: Implement**

In `lib/types.ts`: change `LeadStage` to `'inquiry' | 'consultation' | 'proposal' | 'closed_won' | 'closed_lost'`; add to `Lead`: `customer_id?: string`, `tags?: string[]`, `waiting?: LeadWaiting`; add `export interface LeadWaiting { reason: string; follow_up_date?: string }`.

In `lib/leads.ts`: set `export const LEAD_STAGES: LeadStage[] = ['inquiry','consultation','proposal','closed_won','closed_lost']`; add `export const OPEN_STAGES: LeadStage[] = ['inquiry','consultation','proposal']` and `export const CLOSED_STAGES: LeadStage[] = ['closed_won','closed_lost']`. Keep any existing stage-label map in this file updated to the new stages (labels: "Inquiry", "Consultation", "Proposal", "Closed Won", "Closed Lost").

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leads` → PASS.

- [ ] **Step 5: Fix stage fallout + full suite**

Run: `grep -rn "'booked'\|'delivered'" --include=*.ts --include=*.tsx actions lib components app __tests__ | grep -v node_modules`
Update any code/test using the removed stages to the new ones. Then `npx tsc --noEmit` (clean) and `npm test` (no new failures).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(crm): V1 lead stages (closed_won/closed_lost) + customer_id/tags/waiting fields"
```

---

### Task 2: Customer entity + CRUD

**Files:**
- Modify: `lib/types.ts` (`Customer`)
- Create: `actions/customers.ts`
- Test: `__tests__/actions/customers.test.ts`

**Interfaces:**
- Produces: `interface Customer { id; name; company?; email?; phone?; tags?: string[]; notes?: string; created_at; updated_at? }`; `createCustomer(orgId, input): Promise<Customer>`, `getCustomer(orgId, id)`, `listCustomers(orgId)`, `updateCustomer(orgId, id, updates)`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/actions/customers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
const custDoc = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined), get: vi.fn(), update: vi.fn().mockResolvedValue(undefined) }))
const collRef = vi.hoisted(() => ({ doc: vi.fn(() => custDoc), orderBy: vi.fn(() => ({ get: vi.fn() })) }))
vi.mock('@/lib/firebase-admin', () => ({ adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) } }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: vi.fn().mockResolvedValue({}), assertOrgAdmin: vi.fn().mockResolvedValue({}) }))
import { createCustomer } from '@/actions/customers'

describe('createCustomer', () => {
  beforeEach(() => vi.clearAllMocks())
  it('requires a name', async () => {
    await expect(createCustomer('o1', { name: '  ' })).rejects.toThrow('Name is required')
  })
  it('creates a customer with an id and timestamp', async () => {
    const c = await createCustomer('o1', { name: 'Dana Kim', company: 'Riverside Corp', email: 'dana@riv.co' })
    expect(c.name).toBe('Dana Kim')
    expect(c.id).toBeTruthy()
    expect(c.created_at).toBeTruthy()
    expect(custDoc.set).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dana Kim', company: 'Riverside Corp', email: 'dana@riv.co' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- customers` → FAIL (`@/actions/customers` missing).

- [ ] **Step 3: Implement `actions/customers.ts`**

Model it exactly on `actions/leads.ts` (ref helper `customersRef(orgId) = adminDb.collection('orgs').doc(orgId).collection('customers')`, `assertOrgMember` on reads, `assertOrgAdmin` on writes, `randomBytes(8)` id, ISO `created_at`, the `undefined`-skip cleaned-update loop with `FieldValue.delete()` for nulls). Add the `Customer` interface to `lib/types.ts`. `createCustomer` throws `'Name is required'` on blank name; spreads only present optional fields.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- customers` → PASS.

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit` (clean), `npm test` (no new failures).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(crm): Customer entity + CRUD actions"
```

---

### Task 3: Task entity + CRUD + derived health

**Files:**
- Modify: `lib/types.ts` (`Task`)
- Create: `actions/tasks.ts`
- Create: `lib/opportunity-health.ts`
- Test: `__tests__/actions/tasks.test.ts`, `__tests__/lib/opportunity-health.test.ts`

**Interfaces:**
- Consumes: `Lead`/`LeadStage`, `OPEN_STAGES`/`CLOSED_STAGES` (Task 1).
- Produces:
  - `interface Task { id; lead_id; title; due_date?; done: boolean; done_at?; created_at }`
  - `createTask(orgId, leadId, input)`, `listTasks(orgId, leadId)`, `completeTask(orgId, leadId, taskId)`, `deleteTask(orgId, leadId, taskId)`
  - `type OppHealth = 'active' | 'waiting' | 'needs_attention' | 'closed'`
  - `computeHealth(lead: Pick<Lead,'stage'|'waiting'>, tasks: Task[]): OppHealth`
  - `nextAction(tasks: Task[]): Task | null` (soonest incomplete task that has a `due_date`)

- [ ] **Step 1: Write the failing test (health logic)**

Create `__tests__/lib/opportunity-health.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeHealth, nextAction } from '@/lib/opportunity-health'
import type { Task } from '@/lib/types'

const t = (over: Partial<Task>): Task => ({ id: 'x', lead_id: 'l', title: 't', done: false, created_at: '', ...over })

describe('computeHealth', () => {
  it('closed when stage is a closed outcome', () => {
    expect(computeHealth({ stage: 'closed_won' }, [])).toBe('closed')
    expect(computeHealth({ stage: 'closed_lost' }, [t({ due_date: '2026-01-01' })])).toBe('closed')
  })
  it('waiting when the lead is flagged waiting and not closed', () => {
    expect(computeHealth({ stage: 'proposal', waiting: { reason: 'signed contract' } }, [])).toBe('waiting')
  })
  it('active when an incomplete dated task exists', () => {
    expect(computeHealth({ stage: 'inquiry' }, [t({ due_date: '2026-02-01' })])).toBe('active')
  })
  it('needs_attention when open, not waiting, no dated incomplete task', () => {
    expect(computeHealth({ stage: 'inquiry' }, [])).toBe('needs_attention')
    expect(computeHealth({ stage: 'proposal' }, [t({ done: true, due_date: '2026-02-01' })])).toBe('needs_attention')
    expect(computeHealth({ stage: 'proposal' }, [t({ due_date: undefined })])).toBe('needs_attention')
  })
})

describe('nextAction', () => {
  it('returns the soonest incomplete dated task', () => {
    const tasks = [t({ id: 'a', due_date: '2026-03-01' }), t({ id: 'b', due_date: '2026-02-01' }), t({ id: 'c', done: true, due_date: '2026-01-01' })]
    expect(nextAction(tasks)?.id).toBe('b')
  })
  it('returns null when nothing qualifies', () => {
    expect(nextAction([t({ due_date: undefined }), t({ done: true, due_date: '2026-01-01' })])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- opportunity-health` → FAIL.

- [ ] **Step 3: Implement `lib/opportunity-health.ts`**

```typescript
import type { Lead, Task } from '@/lib/types'
import { CLOSED_STAGES } from '@/lib/leads'

export type OppHealth = 'active' | 'waiting' | 'needs_attention' | 'closed'

export function nextAction(tasks: Task[]): Task | null {
  const open = tasks.filter((t) => !t.done && t.due_date)
  if (open.length === 0) return null
  return open.reduce((a, b) => (a.due_date! <= b.due_date! ? a : b))
}

export function computeHealth(lead: Pick<Lead, 'stage' | 'waiting'>, tasks: Task[]): OppHealth {
  if (CLOSED_STAGES.includes(lead.stage)) return 'closed'
  if (lead.waiting) return 'waiting'
  return nextAction(tasks) ? 'active' : 'needs_attention'
}
```

- [ ] **Step 4: Run health test → PASS.** `npm test -- opportunity-health`

- [ ] **Step 5: Write + pass the tasks-CRUD test**

Add `Task` to `lib/types.ts`. Create `actions/tasks.ts` (ref helper `tasksRef(orgId, leadId) = orgs/{orgId}/leads/{leadId}/tasks`; `createTask` requires a title, defaults `done:false`; `completeTask` sets `done:true, done_at`). Write `__tests__/actions/tasks.test.ts` mirroring the customers test mock style, asserting `createTask` sets `{ title, done: false }` and `completeTask` sets `{ done: true }`. Run `npm test -- tasks` → PASS.

- [ ] **Step 6: Typecheck + full suite + commit**

`npx tsc --noEmit` (clean), `npm test` (green), then:
```bash
git add -A && git commit -m "feat(crm): Task CRUD + derived opportunity health (active/waiting/needs_attention/closed)"
```

---

### Task 4: Note entity + CRUD

**Files:**
- Modify: `lib/types.ts` (`Note`)
- Create: `actions/notes.ts`
- Test: `__tests__/actions/notes.test.ts`

**Interfaces:**
- Produces: `interface Note { id; parent_type: 'customer'|'opportunity'; parent_id; body; created_at }`; `createNote(orgId, input)`, `listNotes(orgId, parentType, parentId)`, `deleteNote(orgId, noteId)`. Store notes in a top-level `orgs/{orgId}/notes` collection keyed by `parent_type`+`parent_id`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/actions/notes.test.ts` (mock style as in Task 2), asserting `createNote` requires a non-empty body (`throws 'Note body is required'`) and `.set` is called with `{ parent_type, parent_id, body }`.

- [ ] **Step 2: Run → FAIL.** `npm test -- notes`

- [ ] **Step 3: Implement** `actions/notes.ts` + the `Note` type, following the customers pattern (`notesRef(orgId) = orgs/{orgId}/notes`; `listNotes` queries `.where('parent_type','==',pt).where('parent_id','==',pid).orderBy('created_at','desc')`).

- [ ] **Step 4: Run → PASS.** `npm test -- notes`

- [ ] **Step 5: Add the composite index**

The `listNotes` query needs a composite index. Append to `firestore.indexes.json` a `notes` COLLECTION index on `parent_type` ASC, `parent_id` ASC, `created_at` DESC. (Deployed later with the other indexes.)

- [ ] **Step 6: Typecheck + suite + commit**

`npx tsc --noEmit`, `npm test`, then:
```bash
git add -A && git commit -m "feat(crm): Note entity + CRUD"
```

---

### Task 5: ActivityEvent + logging helper, wired into stage/task/note

**Files:**
- Modify: `lib/types.ts` (`ActivityEvent`)
- Create: `lib/activity.ts` (server-side `logActivity` helper)
- Create: `actions/activity.ts` (`listActivity`)
- Modify: `actions/leads.ts` (log on stage change), `actions/tasks.ts` (log on complete), `actions/notes.ts` (log on create)
- Test: `__tests__/actions/activity.test.ts`

**Interfaces:**
- Produces: `interface ActivityEvent { id; parent_type: 'customer'|'opportunity'; parent_id; kind: 'stage'|'task'|'note'|'email'|'form'|'created'; summary; created_at }`; `logActivity(orgId, e): Promise<void>`; `listActivity(orgId, parentType, parentId)`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/actions/activity.test.ts` asserting `logActivity` writes an event with `{ kind, summary, parent_id }` and a generated id + timestamp.

- [ ] **Step 2: Run → FAIL.** `npm test -- activity`

- [ ] **Step 3: Implement** `lib/activity.ts` `logActivity` (writes to `orgs/{orgId}/activity`), the `ActivityEvent` type, and `actions/activity.ts` `listActivity` (query by parent + `orderBy created_at desc`).

- [ ] **Step 4: Wire logging into the mutations**

In `actions/leads.ts` `setLeadStage`: after the update, `await logActivity(orgId, { parent_type:'opportunity', parent_id: leadId, kind:'stage', summary: \`Stage → ${stage}\` })`. In `actions/tasks.ts` `completeTask`: log `kind:'task'` "Completed: {title}". In `actions/notes.ts` `createNote`: log `kind:'note'` with a truncated body. Update those files' tests to tolerate the extra `logActivity` call (mock `@/lib/activity`).

- [ ] **Step 5: Add the activity composite index**

Append to `firestore.indexes.json`: `activity` COLLECTION index on `parent_type` ASC, `parent_id` ASC, `created_at` DESC.

- [ ] **Step 6: Typecheck + suite + commit**

`npx tsc --noEmit`, `npm test`, then:
```bash
git add -A && git commit -m "feat(crm): ActivityEvent log wired into stage/task/note mutations"
```

---

### Task 6: Migration — customers from existing leads

**Files:**
- Create: `scripts/crm-migrate-customers.ts`
- Test: `__tests__/scripts/crm-migrate-customers.test.ts` (test the pure mapping function)

**Interfaces:**
- Produces: `leadToCustomerInput(lead: Lead): CreateCustomerInput` (pure mapping: `name`←`lead.name`, `company`←`lead.organization`, `email`←`lead.email`, `phone`←`lead.phone`) and a `migrate(orgId)` runner that, for each lead lacking `customer_id`, creates a Customer (dedup by email within the org) and sets `lead.customer_id`.

- [ ] **Step 1: Write the failing test (pure mapping)**

Create `__tests__/scripts/crm-migrate-customers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { leadToCustomerInput } from '@/scripts/crm-migrate-customers'

describe('leadToCustomerInput', () => {
  it('maps lead contact fields to a customer input', () => {
    expect(leadToCustomerInput({ id:'l', name:'Dana Kim', organization:'Riverside Corp', email:'dana@riv.co', phone:'555', stage:'inquiry', created_at:'' } as any))
      .toEqual({ name:'Dana Kim', company:'Riverside Corp', email:'dana@riv.co', phone:'555' })
  })
  it('omits missing optional fields', () => {
    expect(leadToCustomerInput({ id:'l', name:'Sam', stage:'inquiry', created_at:'' } as any)).toEqual({ name:'Sam' })
  })
})
```

- [ ] **Step 2: Run → FAIL.** `npm test -- crm-migrate-customers`

- [ ] **Step 3: Implement** `scripts/crm-migrate-customers.ts` exporting the pure `leadToCustomerInput` (spreads only present fields) plus an async `migrate(orgId)` that lists leads, and for each without `customer_id`, dedups by email against already-created customers, creates a Customer via `createCustomer`, and updates the lead's `customer_id`. Guard the runner behind `if (require.main === module)` so importing it for the test doesn't execute it.

- [ ] **Step 4: Run → PASS.** `npm test -- crm-migrate-customers`

- [ ] **Step 5: Typecheck + full suite (INCREMENT-1 GATE) + commit**

`npx tsc --noEmit` (clean), `npm test` (all green). NOTE: the migration is a script run manually against Firestore with the admin service account — not run in CI. Then:
```bash
git add -A && git commit -m "feat(crm): lead→customer migration script + pure mapping"
```

---

## Self-Review

**Spec coverage** (against CRM V1 design, Increment-1 scope "Core model + migration"):
- Customer (first-class) → Task 2 ✅
- Opportunity = evolved Lead + customer_id/tags/waiting → Task 1 ✅ (rename deferred, per Global Constraints)
- Task + next-action-is-a-task → Task 3 ✅
- Note → Task 4 ✅
- ActivityEvent (auto log) → Task 5 ✅
- Derived health (active/waiting/needs_attention/closed), not stored → Task 3 ✅
- V1 stages (closed_won/closed_lost, drop booked/delivered) → Task 1 ✅
- Tags as string[] → Task 1/2 ✅
- Migration (customers from leads) → Task 6 ✅
- Deferred to later increments (documented): the Lead→Opportunity rename, all UI (Today/detail/board/customer/smart-views), intake form, notifications.

**Placeholder scan:** each task has real test + implementation guidance with exact interfaces; the CRUD-heavy tasks reference the concrete `actions/leads.ts` pattern rather than reproducing boilerplate, and give the exact ref path, id scheme, and validation strings.

**Type consistency:** `Lead.stage` uses the Task-1 `LeadStage`; `computeHealth`/`nextAction` (Task 3) consume `CLOSED_STAGES` (Task 1) and `Task` (Task 3); `Customer` (Task 2) is consumed by the migration (Task 6); `logActivity` (Task 5) is wired into Task 3/4 mutations. Names are stable across tasks.
