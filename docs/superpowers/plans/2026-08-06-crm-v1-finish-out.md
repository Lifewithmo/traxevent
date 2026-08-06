# CRM V1 Finish-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CRM V1 spec's central promise — *"every open opportunity has a next action, a waiting status, or a closed outcome, and the system surfaces anything that has none"* — actually true in the shipped app, by landing the stranded Today dashboard, making `Customer` a live entity instead of a migration artifact, and building the repeat-business roll-up.

**Architecture:** Four phases. **A** ports the additive Today dashboard from `claude/crm-v3-today-dashboard` onto current `main`, routing the new `waiting` mutations through main's `lib/crm` core/action split instead of the branch's pre-split shape. **B** makes `createLead` find-or-create and link a `Customer`, so the `customers` collection stays live after the one-shot migration. **C** resolves the contact-edit divergence by making the Customer the contact of record and giving the opportunity its own `title`. **D** turns `/clients` into a real Customer list plus a per-customer roll-up of all their opportunities.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), React 19, TypeScript, Firestore (`firebase-admin`), Tailwind, shadcn-style primitives in `components/ui/*`, `lucide-react`, Vitest + jsdom + @testing-library/react.

## Global Constraints

- **This is NOT the Next.js you know.** Before any page/route/server-action work, read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices (per AGENTS.md).
- **`'use server'` modules export async functions ONLY.** Never re-export a type from `actions/*` — it passes `tsc` but breaks `next build` (RSC compiler). Types live in `lib/crm/*` and are imported from there. This has bitten this repo twice; see the NOTE comments in `actions/leads.ts` and `actions/customers.ts`.
- **Cores (`lib/crm/*.ts`) carry no `'use server'`, no `import 'server-only'`, and call no `assert*`.** They are a server data layer imported only by `actions/*` and by `scripts/*` — never by client components.
- **Keep the `leads` collection name and the `/leads` routes.** The `Lead` → `Opportunity` rename is explicitly a later increment. Where this plan says "opportunity," the stored entity is still `Lead`.
- **Health stays derived.** Never store an `active`/`waiting`/`needs_attention` flag. `computeHealth(lead, tasks)` in `lib/opportunity-health.ts` is the single source of truth.
- **Reuse, do not rebuild** the Proposal/Invoice/Contract/Vendor modules.
- **Restraint (design principle):** one clear action per view; quiet, dense bordered rows, not card-soup. Mobile-responsive throughout (single-column stacking).
- **Green gate every task:** `npx tsc --noEmit` clean AND `npm test` passing. Baseline at plan time is **132 files / 880 tests / 0 failures**; test count only goes up.
- **Run `npm run build` before declaring any phase green** — `tsc` alone does not catch the `'use server'` type re-export failure.
- **Worktree:** all work happens in `/Users/rm/vw/traxevent/.claude/worktrees/crm-v1-finish` on branch `claude/crm-v1-finish`. Confirm `git rev-parse --abbrev-ref HEAD` before every commit. **Never commit to `main`.** Never run vitest from the primary checkout — it scans nested worktrees and produces thousands of false failures.
- **Port fidelity:** where a task says "port from `claude/crm-v3-today-dashboard`", copy the file with `git show <branch>:<path> > <path>` and then apply only the deltas the task names. Do not rewrite ported components.

---

## File Structure

**Created:**
- `lib/today.ts` — pure Today aggregator (`buildToday`, `TodayData` and item types). Ported.
- `lib/crm/tasks.ts` — guard-free task core (`tasksRef`, `listTasksCore`) so `getTodayData` needs one auth check, not N.
- `actions/today.ts` — `getTodayData(orgId)` orchestrator.
- `components/admin/today/TodayTiles.tsx` · `NeedsAttentionList.tsx` · `DueTasksList.tsx` · `WaitingList.tsx` · `TodayClient.tsx` — ported.
- `app/(admin)/[orgSlug]/today/page.tsx` — ported.
- `lib/crm/customer-rollup.ts` — pure roll-up math (`rollupCustomer`) over a customer's leads.
- `app/(admin)/[orgSlug]/clients/[customerId]/page.tsx` — Customer detail.
- `components/admin/CustomerDetailClient.tsx` — customer contact/tags/notes + opportunity roll-up.
- Tests: `__tests__/lib/today.test.ts`, `__tests__/actions/today.test.ts`, `__tests__/actions/leads-waiting.test.ts`, `__tests__/components/today/*.test.tsx`, `__tests__/lib/crm/customer-rollup.test.ts`, `__tests__/lib/crm/find-or-create-customer.test.ts`, `__tests__/components/admin/CustomerDetailClient.test.tsx`.

**Modified:**
- `lib/types.ts` — `ActivityEvent.kind` gains `'waiting'`; `Lead` gains `title?`; `Customer` gains `email_lower?`.
- `lib/crm/leads.ts` — `LeadUpdate` gains `waiting?: LeadWaiting | null`; add `listLeadsByCustomerCore`.
- `lib/crm/customers.ts` — `createCustomerCore` writes `email_lower`; add `findOrCreateCustomerCore`.
- `lib/leads.ts` — add `opportunityTitle(lead)`.
- `actions/leads.ts` — add `setLeadWaiting` / `clearLeadWaiting`; `createLead` links a customer.
- `actions/customers.ts` — `updateCustomer` keeps `email_lower` in sync.
- `actions/tasks.ts` — delegate `listTasks` to the new core.
- `components/admin/opportunity/ActivityTimeline.tsx` — `waiting` kind icon.
- `components/admin/opportunity/ContactCard.tsx` — link to the customer record.
- `components/admin/opportunity/OpportunityDetailsForm.tsx` — title field; contact fields hidden when a customer is linked.
- `components/admin/OpportunityDetailClient.tsx` — pass `customer` through to the form.
- `components/admin/ClientsTable.tsx` — list real `Customer`s.
- `app/(admin)/[orgSlug]/clients/page.tsx` — read `listCustomers` + roll-up counts.
- `components/layout/AdminSidebar.tsx` — `today` in `ORG_PAGE_SLUGS` + a "Today" nav link.
- `firestore.indexes.json` — `leads` composite index on `customer_id ASC, created_at DESC`.
- `scripts/crm-migrate-customers.ts` — set `email_lower` (falls out of `createCustomerCore`; verify only).

**Deleted:** none.

---

# Phase A — Land the Today dashboard

## Task 1: `waiting` mutations through the core

The branch version wrote `waiting` with a local `leadsRef` and a direct `FieldValue.delete()`. On current `main`, `leadsRef` and the `undefined`-skipping/`null`-deleting update loop already live in `lib/crm/leads.ts`. Route through the core instead of reintroducing the pre-split shape.

**Files:**
- Modify: `lib/types.ts` (`ActivityEvent.kind`)
- Modify: `lib/crm/leads.ts` (`LeadUpdate`)
- Modify: `actions/leads.ts` (add two actions)
- Modify: `components/admin/opportunity/ActivityTimeline.tsx` (icon)
- Test: `__tests__/actions/leads-waiting.test.ts`

**Interfaces:**
- Produces: `setLeadWaiting(orgId: string, leadId: string, input: { reason: string; follow_up_date?: string }): Promise<void>`; `clearLeadWaiting(orgId: string, leadId: string): Promise<void>`; `LeadUpdate.waiting?: LeadWaiting | null`.
- Consumes: `updateLeadCore`, `logActivity`, `assertOrgAdmin`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/actions/leads-waiting.test.ts`. Follow the `vi.hoisted` mock style of `__tests__/actions/customers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateLeadCore = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const logActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/crm/leads', async (orig) => ({
  ...(await orig<typeof import('@/lib/crm/leads')>()),
  updateLeadCore,
}))
vi.mock('@/lib/activity', () => ({ logActivity }))
vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue(undefined),
  assertOrgAdmin: vi.fn().mockResolvedValue(undefined),
}))

import { setLeadWaiting, clearLeadWaiting } from '@/actions/leads'

describe('lead waiting mutations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires a reason', async () => {
    await expect(setLeadWaiting('o1', 'l1', { reason: '  ' })).rejects.toThrow('A reason is required')
    expect(updateLeadCore).not.toHaveBeenCalled()
  })

  it('sets waiting with a trimmed reason and omits an absent follow-up date', async () => {
    await setLeadWaiting('o1', 'l1', { reason: '  awaiting deposit  ' })
    expect(updateLeadCore).toHaveBeenCalledWith('o1', 'l1', { waiting: { reason: 'awaiting deposit' } })
    expect(logActivity).toHaveBeenCalledWith('o1', {
      parent_type: 'opportunity', parent_id: 'l1', kind: 'waiting', summary: 'Waiting: awaiting deposit',
    })
  })

  it('keeps a present follow-up date', async () => {
    await setLeadWaiting('o1', 'l1', { reason: 'client travelling', follow_up_date: '2026-09-01' })
    expect(updateLeadCore).toHaveBeenCalledWith('o1', 'l1', {
      waiting: { reason: 'client travelling', follow_up_date: '2026-09-01' },
    })
  })

  it('clears waiting by passing null through the core', async () => {
    await clearLeadWaiting('o1', 'l1')
    expect(updateLeadCore).toHaveBeenCalledWith('o1', 'l1', { waiting: null })
    expect(logActivity).toHaveBeenCalledWith('o1', {
      parent_type: 'opportunity', parent_id: 'l1', kind: 'waiting', summary: 'Resumed — cleared waiting',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leads-waiting`
Expected: FAIL — `setLeadWaiting` is not exported from `@/actions/leads`.

- [ ] **Step 3: Implement**

In `lib/types.ts`, widen the activity kind:

```ts
  kind: 'stage' | 'task' | 'note' | 'email' | 'form' | 'created' | 'waiting'
```

In `lib/crm/leads.ts`, extend the update shape (the existing `null → FieldValue.delete()` loop already handles the clear):

```ts
import type { Lead, LeadStage, LeadWaiting } from '@/lib/types'

export interface LeadUpdate {
  // …existing fields unchanged…
  customer_id?: string | null
  waiting?: LeadWaiting | null
}
```

In `actions/leads.ts`, add below `setLeadStage` (import `LeadWaiting` as a type from `@/lib/types`):

```ts
export async function setLeadWaiting(
  orgId: string,
  leadId: string,
  input: { reason: string; follow_up_date?: string }
): Promise<void> {
  await assertOrgAdmin(orgId)
  if (!input.reason?.trim()) throw new Error('A reason is required')
  const waiting: LeadWaiting = {
    reason: input.reason.trim(),
    ...(input.follow_up_date?.trim() ? { follow_up_date: input.follow_up_date.trim() } : {}),
  }
  await updateLeadCore(orgId, leadId, { waiting })
  await logActivity(orgId, {
    parent_type: 'opportunity', parent_id: leadId, kind: 'waiting', summary: `Waiting: ${waiting.reason}`,
  })
}

export async function clearLeadWaiting(orgId: string, leadId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await updateLeadCore(orgId, leadId, { waiting: null })
  await logActivity(orgId, {
    parent_type: 'opportunity', parent_id: leadId, kind: 'waiting', summary: 'Resumed — cleared waiting',
  })
}
```

In `components/admin/opportunity/ActivityTimeline.tsx`, add `Clock` to the `lucide-react` import and `waiting: Clock,` to the `KIND_ICON` map.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- leads-waiting` → PASS. Then `npm test` → all pass, and `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/crm/leads.ts actions/leads.ts components/admin/opportunity/ActivityTimeline.tsx __tests__/actions/leads-waiting.test.ts
git commit -m "feat(crm): setLeadWaiting/clearLeadWaiting via the lead core + 'waiting' activity kind"
```

---

## Task 2: Pure Today aggregator

**Files:**
- Create: `lib/today.ts` (port)
- Test: `__tests__/lib/today.test.ts` (port)

**Interfaces:**
- Produces: `buildToday(input: { leads: Lead[]; tasksByLeadId: Record<string, Task[]>; today: string }): TodayData`; types `TodayData`, `TodayTiles`, `NeedsAttentionItem`, `DueTaskItem`, `WaitingItem`.
- Consumes: `computeHealth` (`@/lib/opportunity-health`), `OPEN_STAGES`/`pipelineSummary` (`@/lib/leads`), `dueStatus` (`@/lib/opportunity-detail`).

- [ ] **Step 1: Port the tests**

```bash
git show claude/crm-v3-today-dashboard:__tests__/lib/today.test.ts > __tests__/lib/today.test.ts
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- today`
Expected: FAIL — cannot resolve `@/lib/today`.

- [ ] **Step 3: Port the implementation**

```bash
git show claude/crm-v3-today-dashboard:lib/today.ts > lib/today.ts
```

This file is pure and depends only on modules unchanged since the branch point — port verbatim, no deltas.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- today` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib/today.ts __tests__/lib/today.test.ts
git commit -m "feat(crm): pure Today aggregator (needs-attention/due/waiting + tiles)"
```

---

## Task 3: Task core + `getTodayData` (one auth check, not N)

The branch's `getTodayData` called `listTasks` once per open lead, and each call re-ran `assertOrgMember` — N extra auth round-trips on the CRM's home screen. Extract a core so the action authorizes once, matching the `lib/crm/leads.ts` pattern already established on `main`.

**Files:**
- Create: `lib/crm/tasks.ts`
- Modify: `actions/tasks.ts` (delegate `listTasks`; all other exports untouched)
- Create: `actions/today.ts`
- Test: `__tests__/actions/today.test.ts` (port, then adjust the mock target)

**Interfaces:**
- Produces: `tasksRef(orgId: string, leadId: string)`; `listTasksCore(orgId: string, leadId: string): Promise<Task[]>`; `getTodayData(orgId: string): Promise<TodayData>`.
- Consumes: `listLeadsCore`, `buildToday`, `todayYmd`, `OPEN_STAGES`, `assertOrgMember`.

- [ ] **Step 1: Write the failing test**

```bash
git show claude/crm-v3-today-dashboard:__tests__/actions/today.test.ts > __tests__/actions/today.test.ts
```

Then change its mocks from the action modules to the cores — replace any `vi.mock('@/actions/leads', …)` / `vi.mock('@/actions/tasks', …)` with:

```ts
const listLeadsCore = vi.hoisted(() => vi.fn())
const listTasksCore = vi.hoisted(() => vi.fn())
vi.mock('@/lib/crm/leads', async (orig) => ({
  ...(await orig<typeof import('@/lib/crm/leads')>()),
  listLeadsCore,
}))
vi.mock('@/lib/crm/tasks', () => ({ listTasksCore, tasksRef: vi.fn() }))
```

Add one test asserting the auth economy, which is the reason this task exists:

```ts
it('authorizes once regardless of how many open leads there are', async () => {
  const { assertOrgMember } = await import('@/lib/auth/assert')
  listLeadsCore.mockResolvedValue([
    { id: 'l1', name: 'A', stage: 'inquiry', created_at: '2026-08-01T00:00:00.000Z' },
    { id: 'l2', name: 'B', stage: 'proposal', created_at: '2026-08-01T00:00:00.000Z' },
    { id: 'l3', name: 'C', stage: 'consultation', created_at: '2026-08-01T00:00:00.000Z' },
  ])
  listTasksCore.mockResolvedValue([])
  await getTodayData('o1')
  expect(assertOrgMember).toHaveBeenCalledTimes(1)
  expect(listTasksCore).toHaveBeenCalledTimes(3)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- actions/today`
Expected: FAIL — cannot resolve `@/lib/crm/tasks` and `@/actions/today`.

- [ ] **Step 3: Implement**

Create `lib/crm/tasks.ts` — move the existing `tasksRef` helper out of `actions/tasks.ts`:

```ts
import { adminDb } from '@/lib/firebase-admin'
import type { Task } from '@/lib/types'

export function tasksRef(orgId: string, leadId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('leads').doc(leadId).collection('tasks')
}

/** Guard-free task list. Authorization is the caller's responsibility. */
export async function listTasksCore(orgId: string, leadId: string): Promise<Task[]> {
  const snap = await tasksRef(orgId, leadId).orderBy('created_at').get()
  return snap.docs.map((d) => d.data() as Task)
}
```

In `actions/tasks.ts`: delete the local `tasksRef` function, `import { tasksRef, listTasksCore } from '@/lib/crm/tasks'`, and make `listTasks` delegate:

```ts
export async function listTasks(orgId: string, leadId: string): Promise<Task[]> {
  await assertOrgMember(orgId)
  return listTasksCore(orgId, leadId)
}
```

`createTask`, `completeTask`, `snoozeTask`, and `deleteTask` keep their current bodies — they just use the imported `tasksRef`. Their existing tests must pass **unchanged**.

**Lint trap:** `actions/tasks.ts` currently imports `adminDb` solely for the local `tasksRef`. Once `tasksRef` moves to the core, that import is unused and ESLint fails the build (`main` was just cleaned of all lint errors in cca0cb4 — do not reintroduce one). Delete the `import { adminDb } from '@/lib/firebase-admin'` line and run `npm run lint` before committing.

Create `actions/today.ts`:

```ts
'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listLeadsCore } from '@/lib/crm/leads'
import { listTasksCore } from '@/lib/crm/tasks'
import { OPEN_STAGES } from '@/lib/leads'
import { todayYmd } from '@/lib/opportunity-detail'
import { buildToday, type TodayData } from '@/lib/today'
import type { LeadStage, Task } from '@/lib/types'

export async function getTodayData(orgId: string): Promise<TodayData> {
  await assertOrgMember(orgId)
  const leads = await listLeadsCore(orgId)
  const openLeads = leads.filter((l) => (OPEN_STAGES as LeadStage[]).includes(l.stage))
  const taskLists = await Promise.all(openLeads.map((l) => listTasksCore(orgId, l.id)))
  const tasksByLeadId: Record<string, Task[]> = {}
  openLeads.forEach((l, i) => { tasksByLeadId[l.id] = taskLists[i] })
  return buildToday({ leads, tasksByLeadId, today: todayYmd() })
}
```

Note `TodayData` is imported as a type and **not** re-exported — see the Global Constraints.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- today` and `npm test -- tasks` → PASS. Then full `npm test` and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add lib/crm/tasks.ts actions/tasks.ts actions/today.ts __tests__/actions/today.test.ts
git commit -m "feat(crm): getTodayData aggregator on a guard-free task core"
```

---

## Task 4: Today components

**Files:**
- Create: `components/admin/today/TodayTiles.tsx`, `NeedsAttentionList.tsx`, `DueTasksList.tsx`, `WaitingList.tsx`, `TodayClient.tsx` (all ported)
- Test: `__tests__/components/today/*.test.tsx` (ported)

**Interfaces:**
- Consumes: `TodayData` and its item types from `@/lib/today`; `setLeadWaiting`/`clearLeadWaiting` from Task 1; `createTask`/`completeTask`/`snoozeTask` from `@/actions/tasks`.
- Produces: `TodayClient({ orgId, orgSlug, data })`.

- [ ] **Step 1: Port components and tests**

```bash
mkdir -p components/admin/today __tests__/components/today
for f in TodayTiles NeedsAttentionList DueTasksList WaitingList TodayClient; do
  git show claude/crm-v3-today-dashboard:components/admin/today/$f.tsx > components/admin/today/$f.tsx
  git show claude/crm-v3-today-dashboard:__tests__/components/today/$f.test.tsx > __tests__/components/today/$f.test.tsx 2>/dev/null || true
done
```

`TodayClient.test.tsx` exists on the branch; `TodayTiles`, `NeedsAttentionList`, `DueTasksList`, and `WaitingList` each have their own test file there too. Confirm five test files landed:

```bash
ls __tests__/components/today/
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- components/today`
Expected: PASS. These components consume only `lib/today`, `actions/tasks`, and the Task 1 waiting actions — all present. If any fail, the cause is a genuine drift in `components/ui/*` since the branch point; fix the component, not the test.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add components/admin/today __tests__/components/today
git commit -m "feat(crm): Today tiles, needs-attention, due-tasks, and waiting lists"
```

---

## Task 5: Today route + sidebar nav

**Files:**
- Create: `app/(admin)/[orgSlug]/today/page.tsx` (port)
- Modify: `components/layout/AdminSidebar.tsx`
- Test: `__tests__/components/AdminSidebar.test.tsx`

**Interfaces:**
- Consumes: `getTodayData`, `TodayClient`.

- [ ] **Step 1: Write the failing test**

There are **two** sidebar test files; pick the right one. `__tests__/components/AdminSidebar.test.tsx` covers workspace nav gating and renders `<AdminSidebar orgSlug="acme" />` — that is the one to extend. `__tests__/components/layout/AdminSidebar.test.tsx` covers terminology-driven labels with an `eventSlug` and is unrelated; leave it alone.

Add to `__tests__/components/AdminSidebar.test.tsx`:

```ts
it('renders a Today link in the sales nav', () => {
  render(<AdminSidebar orgSlug="acme" />)
  const link = screen.getByRole('link', { name: 'Today' })
  expect(link).toHaveAttribute('href', '/acme/today')
})

it('hides Today when the leads module is disabled', () => {
  render(<AdminSidebar orgSlug="acme" enabledModules={[]} />)
  expect(screen.queryByText('Today')).not.toBeInTheDocument()
})
```

The second test pins the gating decision: "Today" is registered under the `leads` module, so a workspace without the pipeline does not show it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AdminSidebar`
Expected: FAIL — no link named "Today".

- [ ] **Step 3: Implement**

Port the page verbatim:

```bash
mkdir -p "app/(admin)/[orgSlug]/today"
git show "claude/crm-v3-today-dashboard:app/(admin)/[orgSlug]/today/page.tsx" > "app/(admin)/[orgSlug]/today/page.tsx"
```

In `components/layout/AdminSidebar.tsx`, add `'today'` to `ORG_PAGE_SLUGS` (so the sidebar stays mounted on the route) and prepend the nav link to `salesLinks`:

```ts
const ORG_PAGE_SLUGS = new Set([
  'members', 'forms', 'permissions', 'billing', 'email-domain', 'event-types',
  'departments', 'reports', 'registrants', 'today', 'leads', 'clients', 'proposals',
  'contracts', 'invoices', 'vendors', 'calendar', 'new-event', 'packages', 'compliance',
])
```

```ts
  const salesLinks = [
    { module: 'leads' as ModuleId, label: 'Today', slug: 'today' },
    { module: 'leads' as ModuleId, label: 'Pipeline', slug: 'leads' },
    // …rest unchanged…
```

Note: `main`'s `ORG_PAGE_SLUGS` contains `packages` and `compliance`, which the branch's copy predates — the line above is the merged result. Do not paste the branch's version over it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- AdminSidebar` → PASS, then full `npm test`, `npx tsc --noEmit`, and `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/[orgSlug]/today" components/layout/AdminSidebar.tsx __tests__/components/AdminSidebar.test.tsx
git commit -m "feat(crm): Today route and sidebar nav entry"
```

**Phase A gate:** `npm run build` succeeds. The Today screen is reachable, `waiting` is now a mutable state, and `computeHealth` can return all four values.

---

# Phase B — Customer becomes a live entity

## Task 6: `findOrCreateCustomerCore` with durable email dedup

`createCustomerCore` stores `email` with its original case, so an equality query can miss `Dana@Riv.co` vs `dana@riv.co`. Store a normalized `email_lower` alongside it and dedup on that. The deployment is pre-launch, so re-running `npm run crm:migrate` backfills the field with no data at risk.

**Files:**
- Modify: `lib/types.ts` (`Customer`)
- Modify: `lib/crm/customers.ts`
- Modify: `actions/customers.ts` (`updateCustomer` keeps `email_lower` in sync)
- Test: `__tests__/lib/crm/find-or-create-customer.test.ts`

**Interfaces:**
- Produces: `normalizeEmail(email?: string): string | undefined`; `findOrCreateCustomerCore(orgId: string, input: CreateCustomerInput): Promise<{ customer: Customer; created: boolean }>`; `Customer.email_lower?: string`.
- Consumes: `customersRef`, `createCustomerCore`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/crm/find-or-create-customer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const existing = vi.hoisted(() => ({ docs: [] as Array<{ data: () => unknown }> }))
const custDoc = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined) }))
const query = vi.hoisted(() => ({ limit: vi.fn(() => ({ get: vi.fn(async () => existing) })) }))
const collRef = vi.hoisted(() => ({ doc: vi.fn(() => custDoc), where: vi.fn(() => query) }))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))

import { findOrCreateCustomerCore, normalizeEmail } from '@/lib/crm/customers'

describe('normalizeEmail', () => {
  it('lowercases and trims', () => expect(normalizeEmail('  Dana@Riv.CO ')).toBe('dana@riv.co'))
  it('returns undefined for blank', () => expect(normalizeEmail('   ')).toBeUndefined())
})

describe('findOrCreateCustomerCore', () => {
  beforeEach(() => { vi.clearAllMocks(); existing.docs = [] })

  it('creates a customer with email_lower when none matches', async () => {
    const { customer, created } = await findOrCreateCustomerCore('o1', { name: 'Dana Kim', email: 'Dana@Riv.CO' })
    expect(created).toBe(true)
    expect(customer.email).toBe('Dana@Riv.CO')
    expect(customer.email_lower).toBe('dana@riv.co')
    expect(custDoc.set).toHaveBeenCalledOnce()
  })

  it('reuses an existing customer matched case-insensitively', async () => {
    existing.docs = [{ data: () => ({ id: 'c-existing', name: 'Dana Kim', email: 'dana@riv.co', email_lower: 'dana@riv.co', created_at: 'x' }) }]
    const { customer, created } = await findOrCreateCustomerCore('o1', { name: 'D. Kim', email: 'DANA@riv.co' })
    expect(created).toBe(false)
    expect(customer.id).toBe('c-existing')
    expect(collRef.where).toHaveBeenCalledWith('email_lower', '==', 'dana@riv.co')
    expect(custDoc.set).not.toHaveBeenCalled()
  })

  it('always creates when there is no email to dedup on', async () => {
    const { created } = await findOrCreateCustomerCore('o1', { name: 'Walk-in' })
    expect(created).toBe(true)
    expect(collRef.where).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- find-or-create-customer`
Expected: FAIL — `findOrCreateCustomerCore` / `normalizeEmail` not exported.

- [ ] **Step 3: Implement**

In `lib/types.ts`, add to `Customer`:

```ts
  email_lower?: string   // normalized dedup key; derived from email, never displayed
```

In `lib/crm/customers.ts`:

```ts
/** Lowercased, trimmed email — the durable dedup key. Undefined when there is no usable email. */
export function normalizeEmail(email?: string): string | undefined {
  const e = email?.trim().toLowerCase()
  return e ? e : undefined
}
```

Inside `createCustomerCore`, alongside the existing `email` spread, add the derived key:

```ts
    ...(input.email?.trim() ? { email: input.email.trim(), email_lower: normalizeEmail(input.email) } : {}),
```

Then add:

```ts
/**
 * Find a customer by normalized email, or create one. Returns `created: false`
 * when an existing record was reused. Without an email there is nothing durable
 * to dedup on, so a new customer is always created.
 */
export async function findOrCreateCustomerCore(
  orgId: string,
  input: CreateCustomerInput
): Promise<{ customer: Customer; created: boolean }> {
  const key = normalizeEmail(input.email)
  if (key) {
    const snap = await customersRef(orgId).where('email_lower', '==', key).limit(1).get()
    if (!snap.empty) return { customer: snap.docs[0].data() as Customer, created: false }
  }
  return { customer: await createCustomerCore(orgId, input), created: true }
}
```

In `actions/customers.ts`, keep the key in sync inside `updateCustomer` — after the existing cleaned-update loop, before the write:

```ts
  if (updates.email !== undefined) {
    const key = updates.email === null ? null : normalizeEmail(updates.email)
    cleaned.email_lower = key === null || key === undefined ? FieldValue.delete() : key
  }
```

Import `normalizeEmail` from `@/lib/crm/customers`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- customers` → PASS.

Both existing customer tests assert with `expect.objectContaining(…)`, so the added `email_lower` does **not** break them and they need no edit. Pin the new behaviour explicitly instead — add one assertion to `__tests__/lib/crm/customers.test.ts`:

```ts
it('derives email_lower from a mixed-case email', async () => {
  await createCustomerCore('o1', { name: 'Dana Kim', email: 'Dana@Riv.CO' })
  expect(custDoc.set).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'Dana@Riv.CO', email_lower: 'dana@riv.co' })
  )
})
```

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/crm/customers.ts actions/customers.ts __tests__/lib/crm/find-or-create-customer.test.ts __tests__/lib/crm/customers.test.ts
git commit -m "feat(crm): findOrCreateCustomerCore with a durable email_lower dedup key"
```

---

## Task 7: `createLead` links a Customer

This is the fix that stops `customers` from ossifying the day after migration.

**Files:**
- Modify: `actions/leads.ts` (`createLead`)
- Test: `__tests__/actions/leads.test.ts` (extend)

**Interfaces:**
- Consumes: `findOrCreateCustomerCore`.
- Produces: `createLead` now returns a `Lead` whose `customer_id` is always set.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/actions/leads.test.ts` (mock `@/lib/crm/customers` in the same `vi.hoisted` style already used in that file):

```ts
it('links a customer on create, reusing one that matches by email', async () => {
  findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' }, created: false })
  const lead = await createLead('o1', { name: 'Dana Kim', email: 'dana@riv.co', organization: 'Riverside' })
  expect(findOrCreateCustomerCore).toHaveBeenCalledWith('o1', {
    name: 'Dana Kim', email: 'dana@riv.co', company: 'Riverside',
  })
  expect(lead.customer_id).toBe('c1')
})

it('still creates the lead when no email is supplied', async () => {
  findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c2', name: 'Walk-in', created_at: 'x' }, created: true })
  const lead = await createLead('o1', { name: 'Walk-in' })
  expect(lead.customer_id).toBe('c2')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- actions/leads`
Expected: FAIL — `lead.customer_id` is `undefined`.

- [ ] **Step 3: Implement**

In `actions/leads.ts`, inside `createLead` after stage validation and before building the lead:

```ts
  const { customer } = await findOrCreateCustomerCore(orgId, {
    name: input.name.trim(),
    ...(input.organization?.trim() ? { company: input.organization.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
  })
```

then add `customer_id: customer.id,` to the `Lead` literal. Import `findOrCreateCustomerCore` from `@/lib/crm/customers`.

Note the field mapping: the lead's `organization` becomes the customer's `company`. This matches `leadToCustomerInput` in `scripts/crm-migrate-customers.ts`, so migrated and newly-created customers have identical shape.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- leads` → PASS, then full `npm test` and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add actions/leads.ts __tests__/actions/leads.test.ts
git commit -m "feat(crm): createLead finds or creates and links a Customer"
```

**Phase B gate:** every new opportunity carries a `customer_id`. Invoice→customer linking (`actions/invoices.ts:59`) now populates for new leads instead of silently no-opping.

---

# Phase C — Resolve the contact-edit divergence

## Task 8: The opportunity gets its own title

`ContactCard` reads `customer?.name ?? lead.name` while `OpportunityDetailsForm` writes `lead.name` — so once a customer is linked, editing the name on the opportunity appears to do nothing. The spec's `Opportunity` has a `title` distinct from the contact's name; adding it is what lets contact details move to the Customer without leaving the opportunity unlabelled.

**Files:**
- Modify: `lib/types.ts` (`Lead`)
- Modify: `lib/crm/leads.ts` (`LeadUpdate`)
- Modify: `lib/leads.ts` (add `opportunityTitle`)
- Test: `__tests__/lib/leads.test.ts` (extend)

**Interfaces:**
- Produces: `Lead.title?: string`; `LeadUpdate.title?: string | null`; `opportunityTitle(lead: Pick<Lead, 'title' | 'name'>): string`.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/lib/leads.test.ts`:

```ts
import { opportunityTitle } from '@/lib/leads'

describe('opportunityTitle', () => {
  it('prefers an explicit title', () => {
    expect(opportunityTitle({ title: 'Riverside gala', name: 'Dana Kim' })).toBe('Riverside gala')
  })
  it('falls back to the contact name for legacy leads', () => {
    expect(opportunityTitle({ name: 'Dana Kim' })).toBe('Dana Kim')
  })
  it('treats a blank title as absent', () => {
    expect(opportunityTitle({ title: '   ', name: 'Dana Kim' })).toBe('Dana Kim')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/leads`
Expected: FAIL — `opportunityTitle` not exported.

- [ ] **Step 3: Implement**

In `lib/types.ts`, add to `Lead`, directly under `name`:

```ts
  title?: string               // the opportunity's own label; falls back to `name` when absent
```

In `lib/crm/leads.ts`, add `title?: string | null` to `LeadUpdate`.

In `lib/leads.ts`:

```ts
/** The opportunity's display label — its own title, or the contact name for legacy leads. */
export function opportunityTitle(lead: Pick<Lead, 'title' | 'name'>): string {
  return lead.title?.trim() || lead.name
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/leads` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/crm/leads.ts lib/leads.ts __tests__/lib/leads.test.ts
git commit -m "feat(crm): Lead.title with a name fallback via opportunityTitle"
```

---

## Task 9: Contact details become the Customer's, not the opportunity's

**Files:**
- Modify: `components/admin/opportunity/OpportunityDetailsForm.tsx`
- Modify: `components/admin/opportunity/ContactCard.tsx`
- Modify: `components/admin/OpportunityDetailClient.tsx`
- Test: `__tests__/components/opportunity/OpportunityDetailsForm.test.tsx`, `__tests__/components/opportunity/ContactCard.test.tsx`

**Interfaces:**
- Consumes: `opportunityTitle`, `Customer`.
- Produces: `OpportunityDetailsForm` gains a required `customer: Customer | null` prop.

- [ ] **Step 1: Write the failing tests**

In `__tests__/components/opportunity/OpportunityDetailsForm.test.tsx`:

```ts
const lead = { id: 'l1', name: 'Dana Kim', stage: 'inquiry', created_at: 'x' } as Lead
const customer = { id: 'c1', name: 'Dana Kim', email: 'dana@riv.co', created_at: 'x' } as Customer

it('edits the opportunity title', () => {
  render(<OpportunityDetailsForm orgId="o1" lead={lead} customer={customer} />)
  expect(screen.getByLabelText('Title')).toBeInTheDocument()
})

it('hides contact fields when a customer is linked', () => {
  render(<OpportunityDetailsForm orgId="o1" lead={lead} customer={customer} />)
  expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Organization')).not.toBeInTheDocument()
})

it('still offers contact fields for an unlinked legacy lead', () => {
  render(<OpportunityDetailsForm orgId="o1" lead={lead} customer={null} />)
  expect(screen.getByLabelText('Email')).toBeInTheDocument()
})
```

In `__tests__/components/opportunity/ContactCard.test.tsx`:

```ts
it('links to the customer record when one is linked', () => {
  render(<ContactCard orgSlug="acme" customer={customer} lead={lead} />)
  expect(screen.getByRole('link', { name: /view customer/i })).toHaveAttribute('href', '/acme/clients/c1')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- opportunity`
Expected: FAIL — no Title field; contact fields still render; no customer link.

- [ ] **Step 3: Implement**

In `OpportunityDetailsForm.tsx`:
- Add a `customer: Customer | null` prop.
- Add a `title` state seeded from `lead.title ?? ''`, rendered as the first field with `<Label htmlFor="oppTitle">Title</Label>` and `<Input id="oppTitle" …>`, placeholder `"e.g. Riverside gala"`. Include `title: title.trim() || null` in the `updateLead` payload.
- Wrap the `oppName` / `oppOrg` / `oppEmail` / `oppPhone` field group in `{!customer && ( … )}`, and when `customer` is truthy render instead:

```tsx
<p className="text-sm text-muted-foreground">
  Contact details live on the customer record.{' '}
  <Link href={`/${orgSlug}/clients/${customer.id}`} className="underline">Edit {customer.name}</Link>
</p>
```

This requires an `orgSlug` prop — thread it from `OpportunityDetailClient`, which already receives it.

In `ContactCard.tsx`: add an `orgSlug: string` prop and, when `customer` is non-null, render inside the expanded disclosure:

```tsx
<Link href={`/${orgSlug}/clients/${customer.id}`} className="text-xs underline text-muted-foreground hover:text-foreground">
  View customer
</Link>
```

In `OpportunityDetailClient.tsx`: pass `customer` and `orgSlug` down to both components, and use `opportunityTitle(lead)` for the page heading instead of `lead.name`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- opportunity` → PASS, then full `npm test` and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add components/admin/opportunity components/admin/OpportunityDetailClient.tsx __tests__/components/opportunity
git commit -m "fix(crm): contact details edit on the customer; opportunity edits its own title"
```

**Phase C gate:** editing a linked opportunity's contact info is no longer a silent no-op — the form sends you to the customer record.

---

# Phase D — Customer detail roll-up

## Task 10: Roll-up query + pure math + index

**Files:**
- Modify: `lib/crm/leads.ts` (add `listLeadsByCustomerCore`)
- Create: `lib/crm/customer-rollup.ts`
- Modify: `actions/customers.ts` (add `listCustomerOpportunities`)
- Modify: `firestore.indexes.json`
- Test: `__tests__/lib/crm/customer-rollup.test.ts`

**Interfaces:**
- Produces: `listLeadsByCustomerCore(orgId: string, customerId: string): Promise<Lead[]>`; `rollupCustomer(leads: Lead[]): CustomerRollup` where `interface CustomerRollup { openCount: number; wonCount: number; lostCount: number; totalWonValue: number; openValue: number; lastActivityAt?: string }`; `listCustomerOpportunities(orgId, customerId): Promise<Lead[]>`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/crm/customer-rollup.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rollupCustomer } from '@/lib/crm/customer-rollup'
import type { Lead } from '@/lib/types'

const lead = (over: Partial<Lead>): Lead =>
  ({ id: 'x', name: 'n', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z', ...over }) as Lead

describe('rollupCustomer', () => {
  it('returns zeros for a customer with no opportunities', () => {
    expect(rollupCustomer([])).toEqual({
      openCount: 0, wonCount: 0, lostCount: 0, totalWonValue: 0, openValue: 0, lastActivityAt: undefined,
    })
  })

  it('counts by outcome and sums won separately from open', () => {
    const r = rollupCustomer([
      lead({ stage: 'inquiry', estimated_value: 100 }),
      lead({ stage: 'proposal', estimated_value: 250 }),
      lead({ stage: 'closed_won', estimated_value: 1000 }),
      lead({ stage: 'closed_won', estimated_value: 500 }),
      lead({ stage: 'closed_lost', estimated_value: 900 }),
    ])
    expect(r.openCount).toBe(2)
    expect(r.wonCount).toBe(2)
    expect(r.lostCount).toBe(1)
    expect(r.totalWonValue).toBe(1500)
    expect(r.openValue).toBe(350)
  })

  it('treats a missing estimated_value as zero', () => {
    expect(rollupCustomer([lead({ stage: 'closed_won' })]).totalWonValue).toBe(0)
  })

  it('reports the most recent updated_at, falling back to created_at', () => {
    const r = rollupCustomer([
      lead({ created_at: '2026-01-01T00:00:00.000Z' }),
      lead({ created_at: '2026-02-01T00:00:00.000Z', updated_at: '2026-03-05T00:00:00.000Z' }),
      lead({ created_at: '2026-02-20T00:00:00.000Z' }),
    ])
    expect(r.lastActivityAt).toBe('2026-03-05T00:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- customer-rollup`
Expected: FAIL — cannot resolve `@/lib/crm/customer-rollup`.

- [ ] **Step 3: Implement**

Create `lib/crm/customer-rollup.ts`:

```ts
import { OPEN_STAGES } from '@/lib/leads'
import type { Lead, LeadStage } from '@/lib/types'

export interface CustomerRollup {
  openCount: number
  wonCount: number
  lostCount: number
  totalWonValue: number
  openValue: number
  lastActivityAt?: string
}

/** Repeat-business summary across every opportunity belonging to one customer. */
export function rollupCustomer(leads: Lead[]): CustomerRollup {
  const isOpen = (s: LeadStage) => (OPEN_STAGES as LeadStage[]).includes(s)
  const value = (l: Lead) => l.estimated_value ?? 0
  const open = leads.filter((l) => isOpen(l.stage))
  const won = leads.filter((l) => l.stage === 'closed_won')
  const stamps = leads.map((l) => l.updated_at ?? l.created_at).filter(Boolean).sort()
  return {
    openCount: open.length,
    wonCount: won.length,
    lostCount: leads.filter((l) => l.stage === 'closed_lost').length,
    totalWonValue: won.reduce((n, l) => n + value(l), 0),
    openValue: open.reduce((n, l) => n + value(l), 0),
    lastActivityAt: stamps[stamps.length - 1],
  }
}
```

In `lib/crm/leads.ts`:

```ts
export async function listLeadsByCustomerCore(orgId: string, customerId: string): Promise<Lead[]> {
  const snap = await leadsRef(orgId).where('customer_id', '==', customerId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Lead)
}
```

In `actions/customers.ts`:

```ts
export async function listCustomerOpportunities(orgId: string, customerId: string): Promise<Lead[]> {
  await assertOrgMember(orgId)
  return listLeadsByCustomerCore(orgId, customerId)
}
```

In `firestore.indexes.json`, add to the `indexes` array (the equality + ordered range needs a composite index):

```json
    {
      "collectionGroup": "leads",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "customer_id", "order": "ASCENDING" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- customer-rollup` → PASS, then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add lib/crm/customer-rollup.ts lib/crm/leads.ts actions/customers.ts firestore.indexes.json __tests__/lib/crm/customer-rollup.test.ts
git commit -m "feat(crm): customer opportunity roll-up query, pure math, and Firestore index"
```

---

## Task 11: `/clients` lists real Customers

**Files:**
- Modify: `app/(admin)/[orgSlug]/clients/page.tsx`
- Modify: `components/admin/ClientsTable.tsx`
- Test: `__tests__/components/admin/ClientsTable.test.tsx` (create)

**Interfaces:**
- Consumes: `listCustomers`, `listLeadsCore`, `rollupCustomer`.
- Produces: `ClientsTable({ orgSlug, rows })` where `rows: Array<{ customer: Customer; rollup: CustomerRollup }>`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/admin/ClientsTable.test.tsx`:

Type the fixture properly — do **not** reach for `as never` or `as any` to silence the compiler. A cast there would hide exactly the prop-shape mismatch these tests exist to catch.

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ClientsTable } from '@/components/admin/ClientsTable'
import type { CustomerRollup } from '@/lib/crm/customer-rollup'
import type { Customer } from '@/lib/types'

const row: { customer: Customer; rollup: CustomerRollup } = {
  customer: {
    id: 'c1',
    name: 'Dana Kim',
    company: 'Riverside',
    email: 'dana@riv.co',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  rollup: {
    openCount: 1,
    wonCount: 2,
    lostCount: 0,
    totalWonValue: 1500,
    openValue: 250,
    lastActivityAt: '2026-03-05T00:00:00.000Z',
  },
}

describe('ClientsTable', () => {
  it('links each customer to their detail page', () => {
    render(<ClientsTable orgSlug="acme" rows={[row]} />)
    expect(screen.getByRole('link', { name: 'Dana Kim' })).toHaveAttribute('href', '/acme/clients/c1')
  })

  it('shows repeat-business figures', () => {
    render(<ClientsTable orgSlug="acme" rows={[row]} />)
    expect(screen.getByText('$1,500')).toBeInTheDocument()
    expect(screen.getByText(/2 won/i)).toBeInTheDocument()
  })

  it('renders an empty state with no customers', () => {
    render(<ClientsTable orgSlug="acme" rows={[]} />)
    expect(screen.getByText(/no clients yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ClientsTable`
Expected: FAIL — `ClientsTable` still takes a `leads` prop and links to `/leads/:id`.

- [ ] **Step 3: Implement**

Rewrite `components/admin/ClientsTable.tsx` to take `rows` and render columns: **Name** (link to `/${orgSlug}/clients/${customer.id}`), **Company**, **Open** (`rollup.openCount`), **Won** (`${rollup.wonCount} won`), **Lifetime value** (`$${rollup.totalWonValue.toLocaleString()}`), **Last activity** (`formatRelativeTime(rollup.lastActivityAt)` from `@/lib/opportunity-detail`, or `—`). Keep the existing dense bordered-table markup and the empty-state row — only the data and links change.

Rewrite the page to assemble rows with one leads read rather than one per customer:

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listCustomers } from '@/actions/customers'
import { listLeadsCore } from '@/lib/crm/leads'
import { rollupCustomer } from '@/lib/crm/customer-rollup'
import { ClientsTable } from '@/components/admin/ClientsTable'
import type { Lead } from '@/lib/types'

export default async function ClientsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const [customers, leads] = await Promise.all([listCustomers(orgId), listLeadsCore(orgId)])
  const byCustomer = new Map<string, Lead[]>()
  for (const l of leads) {
    if (!l.customer_id) continue
    byCustomer.set(l.customer_id, [...(byCustomer.get(l.customer_id) ?? []), l])
  }

  const rows = customers.map((customer) => ({
    customer,
    rollup: rollupCustomer(byCustomer.get(customer.id) ?? []),
  }))

  return <ClientsTable orgSlug={orgSlug} rows={rows} />
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ClientsTable` → PASS, then full `npm test` and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/[orgSlug]/clients/page.tsx" components/admin/ClientsTable.tsx __tests__/components/admin/ClientsTable.test.tsx
git commit -m "feat(crm): /clients lists real Customers with repeat-business figures"
```

---

## Task 12: Customer detail screen

**Files:**
- Create: `app/(admin)/[orgSlug]/clients/[customerId]/page.tsx`
- Create: `components/admin/CustomerDetailClient.tsx`
- Test: `__tests__/components/admin/CustomerDetailClient.test.tsx`

**Interfaces:**
- Consumes: `getCustomer`, `listCustomerOpportunities`, `listNotes`, `listActivity`, `rollupCustomer`, `opportunityTitle`, `LEAD_STAGE_LABELS`.
- Produces: `CustomerDetailClient({ orgId, orgSlug, customer, opportunities, rollup, notes })`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/admin/CustomerDetailClient.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CustomerDetailClient } from '@/components/admin/CustomerDetailClient'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

Type the fixtures properly — do **not** reach for `as never` or `as any`. A cast would hide exactly the prop-shape mismatch these tests exist to catch.

```tsx
import type { CustomerRollup } from '@/lib/crm/customer-rollup'
import type { Customer, Lead, Note } from '@/lib/types'

const customer: Customer = {
  id: 'c1', name: 'Dana Kim', company: 'Riverside', email: 'dana@riv.co',
  tags: ['vip'], created_at: '2026-01-01T00:00:00.000Z',
}
const opportunities: Lead[] = [
  { id: 'l1', name: 'Dana Kim', title: 'Spring gala', stage: 'closed_won', estimated_value: 1000, created_at: '2026-02-01T00:00:00.000Z' },
  { id: 'l2', name: 'Dana Kim', stage: 'inquiry', estimated_value: 250, created_at: '2026-01-15T00:00:00.000Z' },
]
const rollup: CustomerRollup = { openCount: 1, wonCount: 1, lostCount: 0, totalWonValue: 1000, openValue: 250 }
const notes: Note[] = []

const props = { orgId: 'o1', orgSlug: 'acme', customer, opportunities, rollup, notes }

describe('CustomerDetailClient', () => {
  it('shows the customer identity and tags', () => {
    render(<CustomerDetailClient {...props} />)
    expect(screen.getByRole('heading', { name: 'Dana Kim' })).toBeInTheDocument()
    expect(screen.getByText('vip')).toBeInTheDocument()
  })

  it('rolls up every opportunity, open and past, each linking to its detail page', () => {
    render(<CustomerDetailClient {...props} />)
    expect(screen.getByRole('link', { name: 'Spring gala' })).toHaveAttribute('href', '/acme/leads/l1')
    expect(screen.getByRole('link', { name: 'Dana Kim' })).toHaveAttribute('href', '/acme/leads/l2')
  })

  it('surfaces lifetime won value', () => {
    render(<CustomerDetailClient {...props} />)
    expect(screen.getByText('$1,000')).toBeInTheDocument()
  })

  it('renders an empty state when the customer has no opportunities', () => {
    render(<CustomerDetailClient {...props} opportunities={[]} />)
    expect(screen.getByText(/no opportunities yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CustomerDetailClient`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `components/admin/CustomerDetailClient.tsx` as a client component laid out with the same restraint as `OpportunityDetailClient`:

- **Header:** `<h1>` = `customer.name`; `customer.company` beneath as muted text; `mailto:`/`tel:` buttons reusing the `ContactCard` link styling; tag badges.
- **Roll-up strip:** three compact tiles — `Lifetime won` (`$${rollup.totalWonValue.toLocaleString()}`), `Open` (`${rollup.openCount} · $${rollup.openValue.toLocaleString()}`), `Won / Lost` (`${rollup.wonCount} / ${rollup.lostCount}`).
- **Opportunities table:** dense bordered rows, newest first, each row = `<Link href={`/${orgSlug}/leads/${l.id}`}>{opportunityTitle(l)}</Link>`, a `LEAD_STAGE_LABELS[l.stage]` badge, `event_date ?? '—'`, and the estimated value right-aligned. Empty state copy: `No opportunities yet.`
- **Notes:** reuse the composer pattern from `ActivityTimeline` — a textarea plus a save button calling `createNote(orgId, { parent_type: 'customer', parent_id: customer.id, body })`, then `router.refresh()`. List existing notes below, newest first, with `formatRelativeTime`.

Create the page:

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getCustomer, listCustomerOpportunities } from '@/actions/customers'
import { listNotes } from '@/actions/notes'
import { rollupCustomer } from '@/lib/crm/customer-rollup'
import { CustomerDetailClient } from '@/components/admin/CustomerDetailClient'

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; customerId: string }>
}) {
  const { orgSlug, customerId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const customer = await getCustomer(orgId, customerId)
  if (!customer) notFound()

  const [opportunities, notes] = await Promise.all([
    listCustomerOpportunities(orgId, customerId),
    listNotes(orgId, 'customer', customerId),
  ])

  return (
    <CustomerDetailClient
      orgId={orgId}
      orgSlug={orgSlug}
      customer={customer}
      opportunities={opportunities}
      rollup={rollupCustomer(opportunities)}
      notes={notes}
    />
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- CustomerDetailClient` → PASS, then full `npm test`, `npx tsc --noEmit`, and `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/[orgSlug]/clients/[customerId]" components/admin/CustomerDetailClient.tsx __tests__/components/admin/CustomerDetailClient.test.tsx
git commit -m "feat(crm): customer detail screen with repeat-business roll-up"
```

**Phase D gate:** `npm run build` succeeds; a customer's full history is one click from the pipeline, and repeat business is never re-keyed.

---

## Out of scope (deliberately deferred)

These remain unbuilt from the CRM V1 spec and are **not** part of this plan:

- **Board polish** — health dots, customer name on cards, drag-to-change-stage (the board still uses a per-card `<select>`).
- **Smart views** — saved filter presets over opportunities.
- **Intake form** — the public tokenized lead-capture form and its `form` activity event.
- **Tag write path** — tags render as read-only badges; no editor and no org-level distinct-tag autocomplete.
- **Email notifications** — new-intake-submission and task-due reminders via Resend.

Track these as a follow-up increment.

## Post-merge operational note

`email_lower` is new on `Customer`. **`npm run crm:migrate` does NOT backfill it** — `scripts/crm-migrate-customers.ts:38-41` skips every lead that already carries a `customer_id`, so previously-created Customer docs are never touched. An earlier draft of this plan claimed otherwise; that was wrong.

Task 6a adds a dedicated, idempotent, dry-run-capable backfill. Run it per org after merge:

```bash
npm run crm:backfill-email-lower -- <orgId> --dry-run   # inspect first
npm run crm:backfill-email-lower -- <orgId>
```

Then the customer migration, as before, for any unlinked leads:

```bash
npm run crm:migrate -- <orgId> --dry-run
npm run crm:migrate -- <orgId>
```
