# CRM V1 — Today Dashboard (Increment 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CRM V1 "Today" dashboard — a surfaced-not-blocking screen that lists needs-attention orphans, due/overdue tasks, and waiting deals across all open opportunities — plus the `waiting` workflow it depends on.

**Architecture:** A pure `lib/today.ts` aggregator (`buildToday`) computes the three lists + tiles from leads + their tasks, reusing `computeHealth`/`pipelineSummary`. A thin `actions/today.ts` gathers the data (leads + tasks for open leads) and calls the pure builder. Two additive `waiting` mutations land in `actions/leads.ts`. Client components under `components/admin/today/` render the screen; a new `/[orgSlug]/today` route + sidebar item host it.

**Tech Stack:** Next.js 16 App Router (server components + server actions), React 19, TypeScript, Tailwind, `components/ui/*`, `lucide-react`, Vitest + jsdom + @testing-library/react.

## Global Constraints

- **This is NOT the Next.js you know.** Before writing any page/route/server-action code, read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices (per AGENTS.md).
- **Additive only to shared model/actions.** New exports `setLeadWaiting`/`clearLeadWaiting` in `actions/leads.ts`; one additive union member `'waiting'` in `ActivityEvent['kind']` (`lib/types.ts`); one additive icon entry in the increment-2 `ActivityTimeline`. Do NOT change any existing action signature/behavior or any existing model shape.
- **Mutations used by Today:** `createTask`, `completeTask`, `snoozeTask` (existing) and `setLeadWaiting`/`clearLeadWaiting` (new). No proposal/invoice/contract/vendor mutations.
- **Derived, not stored:** the three lists + tiles are computed each render; no stored "needs attention" flag.
- **Reuse increment-1/2 primitives:** `computeHealth` (`lib/opportunity-health`), `OPEN_STAGES`/`pipelineSummary`/`LEAD_STAGE_LABELS` (`lib/leads`), `todayYmd`/`addDays`/`dueStatus` (`lib/opportunity-detail`), `createTask`/`completeTask`/`snoozeTask` (`actions/tasks`), `listLeads`/`listTasks`. Do not duplicate them.
- **Mobile-responsive throughout;** dense bordered rows, one clear action per row, quiet empty states (restraint).
- **Green gate every task:** `npx tsc --noEmit` clean AND `npm test` (vitest) passing. Run `npm install` first if ~5 server-only load failures appear (node_modules sync quirk; no lockfile change).
- **Route/paths:** page at `app/(admin)/[orgSlug]/today/page.tsx`; components under `components/admin/today/`; pure logic in `lib/today.ts`; tests under `__tests__/`.
- **Do NOT commit to `main`.** Confirm `git rev-parse --abbrev-ref HEAD` = `claude/crm-v3-today-dashboard` before every commit.

---

## File Structure

**Created:**
- `lib/today.ts` — pure `buildToday` + Today types.
- `actions/today.ts` — `getTodayData(orgId)` thin aggregator.
- `components/admin/today/TodayTiles.tsx` — three metric tiles (presentational).
- `components/admin/today/NeedsAttentionList.tsx` — orphan rows with inline Add-next-step / Mark-waiting (client).
- `components/admin/today/DueTasksList.tsx` — due/overdue task rows with Done / Snooze (client).
- `components/admin/today/WaitingList.tsx` — waiting rows with follow-up / resume (client).
- `components/admin/today/TodayClient.tsx` — orchestrator (client).
- `app/(admin)/[orgSlug]/today/page.tsx` — server page.
- Tests: `__tests__/lib/today.test.ts`, `__tests__/actions/today.test.ts`, `__tests__/actions/leads-waiting.test.ts`, `__tests__/components/today/*.test.tsx`, plus an assertion added to `__tests__/components/AdminSidebar.test.tsx`.

**Modified:**
- `lib/types.ts` — add `'waiting'` to `ActivityEvent['kind']`.
- `actions/leads.ts` — add `setLeadWaiting` / `clearLeadWaiting`.
- `components/admin/opportunity/ActivityTimeline.tsx` — add `Clock` icon for kind `'waiting'`.
- `components/layout/AdminSidebar.tsx` — add the "Today" nav item.

---

### Task 1: Pure aggregator (`lib/today.ts`)

**Files:**
- Create: `lib/today.ts`
- Test: `__tests__/lib/today.test.ts`

**Interfaces:**
- Consumes: `Lead`, `Task`, `LeadStage` from `@/lib/types`; `computeHealth` from `@/lib/opportunity-health`; `OPEN_STAGES`, `pipelineSummary` from `@/lib/leads`; `dueStatus` from `@/lib/opportunity-detail`.
- Produces: `buildToday(input: { leads: Lead[]; tasksByLeadId: Record<string, Task[]>; today: string }): TodayData` and the exported interfaces `TodayTiles`, `NeedsAttentionItem`, `DueTaskItem`, `WaitingItem`, `TodayData`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/today.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildToday } from '@/lib/today'
import type { Lead, Task } from '@/lib/types'

const lead = (over: Partial<Lead>): Lead => ({ id: 'x', name: 'X', stage: 'inquiry', created_at: '2026-08-01T00:00:00.000Z', ...over })
const task = (over: Partial<Task>): Task => ({ id: 't', lead_id: 'x', title: 'T', done: false, created_at: '2026-08-01T00:00:00.000Z', ...over })

describe('buildToday', () => {
  const today = '2026-08-05'

  it('needs-attention = open lead, not waiting, no dated task', () => {
    const l = lead({ id: 'a', name: 'Ann', organization: 'Acme' })
    const d = buildToday({ leads: [l], tasksByLeadId: { a: [] }, today })
    expect(d.needsAttention.map((n) => n.leadId)).toEqual(['a'])
    expect(d.needsAttention[0].company).toBe('Acme')
    expect(d.tiles.needsAttention).toBe(1)
  })

  it('a dated open task moves a lead out of needs-attention and into due when due<=today', () => {
    const l = lead({ id: 'b' })
    const d = buildToday({ leads: [l], tasksByLeadId: { b: [task({ id: 't1', lead_id: 'b', due_date: '2026-08-05' })] }, today })
    expect(d.needsAttention).toHaveLength(0)
    expect(d.dueTasks.map((x) => x.task.id)).toEqual(['t1'])
    expect(d.dueTasks[0].status).toBe('today')
    expect(d.tiles.tasksDue).toBe(1)
  })

  it('classifies overdue vs today and excludes future/done', () => {
    const l = lead({ id: 'c' })
    const tasks = [
      task({ id: 'over', lead_id: 'c', due_date: '2026-08-01' }),
      task({ id: 'fut', lead_id: 'c', due_date: '2026-08-09' }),
      task({ id: 'donetoday', lead_id: 'c', due_date: '2026-08-05', done: true }),
    ]
    const d = buildToday({ leads: [l], tasksByLeadId: { c: tasks }, today })
    expect(d.dueTasks.map((x) => x.task.id)).toEqual(['over'])
    expect(d.dueTasks[0].status).toBe('overdue')
  })

  it('waiting list carries reason, follow-up-due and quiet days; sorts due-first', () => {
    const notDue = lead({ id: 'w1', name: 'W1', updated_at: '2026-08-04T00:00:00.000Z', waiting: { reason: 'quote', follow_up_date: '2026-08-10' } })
    const due = lead({ id: 'w2', name: 'W2', updated_at: '2026-08-01T00:00:00.000Z', waiting: { reason: 'sign', follow_up_date: '2026-08-03' } })
    const d = buildToday({ leads: [notDue, due], tasksByLeadId: { w1: [], w2: [] }, today })
    expect(d.waiting.map((w) => w.leadId)).toEqual(['w2', 'w1']) // due first
    expect(d.waiting[0].followUpDue).toBe(true)
    expect(d.waiting[0].quietDays).toBe(4)
    expect(d.waiting[1].followUpDue).toBe(false)
  })

  it('open pipeline value sums estimated_value over open leads only', () => {
    const leads = [
      lead({ id: 'o1', stage: 'proposal', estimated_value: 1000 }),
      lead({ id: 'o2', stage: 'inquiry', estimated_value: 500 }),
      lead({ id: 'won', stage: 'closed_won', estimated_value: 9999 }),
    ]
    const d = buildToday({ leads, tasksByLeadId: { o1: [], o2: [] }, today })
    expect(d.tiles.openPipelineValue).toBe(1500)
  })

  it('excludes closed leads from every list', () => {
    const leads = [lead({ id: 'lost', stage: 'closed_lost' }), lead({ id: 'won', stage: 'closed_won' })]
    const d = buildToday({ leads, tasksByLeadId: {}, today })
    expect(d.needsAttention).toHaveLength(0)
    expect(d.dueTasks).toHaveLength(0)
    expect(d.waiting).toHaveLength(0)
  })

  it('needs-attention sorts stalest (oldest updated_at) first', () => {
    const fresh = lead({ id: 'fresh', updated_at: '2026-08-04T00:00:00.000Z' })
    const stale = lead({ id: 'stale', updated_at: '2026-08-01T00:00:00.000Z' })
    const d = buildToday({ leads: [fresh, stale], tasksByLeadId: { fresh: [], stale: [] }, today })
    expect(d.needsAttention.map((n) => n.leadId)).toEqual(['stale', 'fresh'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/today.test.ts`
Expected: FAIL — module `@/lib/today` not found.

- [ ] **Step 3: Write the implementation**

Create `lib/today.ts`:

```ts
import type { Lead, Task, LeadStage } from '@/lib/types'
import { computeHealth } from '@/lib/opportunity-health'
import { OPEN_STAGES, pipelineSummary } from '@/lib/leads'
import { dueStatus } from '@/lib/opportunity-detail'

export interface TodayTiles {
  tasksDue: number
  needsAttention: number
  openPipelineValue: number
}

export interface NeedsAttentionItem {
  leadId: string
  name: string
  company?: string
  stage: LeadStage
}

export interface DueTaskItem {
  task: Task
  leadId: string
  leadName: string
  company?: string
  status: 'overdue' | 'today'
}

export interface WaitingItem {
  leadId: string
  name: string
  company?: string
  reason: string
  followUpDate?: string
  followUpDue: boolean
  quietDays: number
}

export interface TodayData {
  tiles: TodayTiles
  needsAttention: NeedsAttentionItem[]
  dueTasks: DueTaskItem[]
  waiting: WaitingItem[]
}

/** Whole days between an ISO timestamp (or YYYY-MM-DD) and `today` (YYYY-MM-DD), never negative. */
function quietDaysSince(sinceIso: string, today: string): number {
  const from = Date.parse(`${sinceIso.slice(0, 10)}T00:00:00.000Z`)
  const to = Date.parse(`${today}T00:00:00.000Z`)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.max(0, Math.round((to - from) / 86_400_000))
}

export function buildToday(input: {
  leads: Lead[]
  tasksByLeadId: Record<string, Task[]>
  today: string
}): TodayData {
  const { leads, tasksByLeadId, today } = input
  const isOpen = (s: LeadStage) => (OPEN_STAGES as LeadStage[]).includes(s)
  const openLeads = leads.filter((l) => isOpen(l.stage))
  const byId = new Map(leads.map((l) => [l.id, l]))

  const needsAttention: NeedsAttentionItem[] = []
  const dueTasks: DueTaskItem[] = []
  const waiting: WaitingItem[] = []

  for (const lead of openLeads) {
    const tasks = tasksByLeadId[lead.id] ?? []
    const health = computeHealth(lead, tasks)

    if (health === 'needs_attention') {
      needsAttention.push({ leadId: lead.id, name: lead.name, company: lead.organization, stage: lead.stage })
    } else if (health === 'waiting' && lead.waiting) {
      const followUpDate = lead.waiting.follow_up_date
      waiting.push({
        leadId: lead.id,
        name: lead.name,
        company: lead.organization,
        reason: lead.waiting.reason,
        followUpDate,
        followUpDue: !!followUpDate && followUpDate <= today,
        quietDays: quietDaysSince(lead.updated_at ?? lead.created_at, today),
      })
    }

    // Due list is task-centric: any open, dated task due today or earlier.
    for (const t of tasks) {
      if (t.done || !t.due_date || t.due_date > today) continue
      dueTasks.push({
        task: t,
        leadId: lead.id,
        leadName: lead.name,
        company: lead.organization,
        status: dueStatus(t.due_date, today) === 'overdue' ? 'overdue' : 'today',
      })
    }
  }

  const staleKey = (leadId: string) => byId.get(leadId)?.updated_at ?? byId.get(leadId)?.created_at ?? ''
  needsAttention.sort((a, b) => staleKey(a.leadId).localeCompare(staleKey(b.leadId)))
  dueTasks.sort((a, b) =>
    a.task.due_date === b.task.due_date
      ? a.task.created_at.localeCompare(b.task.created_at)
      : a.task.due_date!.localeCompare(b.task.due_date!)
  )
  waiting.sort((a, b) => (a.followUpDue !== b.followUpDue ? (a.followUpDue ? -1 : 1) : b.quietDays - a.quietDays))

  return {
    tiles: {
      tasksDue: dueTasks.length,
      needsAttention: needsAttention.length,
      openPipelineValue: pipelineSummary(leads).openValue,
    },
    needsAttention,
    dueTasks,
    waiting,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/today.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add lib/today.ts __tests__/lib/today.test.ts
git commit -m "feat(crm): pure Today aggregator (needs-attention/due/waiting + tiles)"
```

---

### Task 2: Waiting mutations + `'waiting'` activity kind

**Files:**
- Modify: `lib/types.ts` (add `'waiting'` to `ActivityEvent['kind']`)
- Modify: `actions/leads.ts` (add `setLeadWaiting`, `clearLeadWaiting`)
- Modify: `components/admin/opportunity/ActivityTimeline.tsx` (add `Clock` icon for `'waiting'`)
- Test: `__tests__/actions/leads-waiting.test.ts`

**Interfaces:**
- Produces: `setLeadWaiting(orgId, leadId, input: { reason: string; follow_up_date?: string }): Promise<void>` and `clearLeadWaiting(orgId, leadId): Promise<void>`.

- [ ] **Step 1: Add the `'waiting'` activity kind**

In `lib/types.ts`, change the `ActivityEvent` `kind` union to include `'waiting'`:

```ts
  kind: 'stage' | 'task' | 'note' | 'email' | 'form' | 'created' | 'waiting'
```

- [ ] **Step 2: Give the timeline a `'waiting'` icon**

In `components/admin/opportunity/ActivityTimeline.tsx`, add `Clock` to the lucide import and a `waiting` entry to `KIND_ICON`:

```tsx
import { StickyNote, ArrowRightLeft, CheckSquare, Mail, FileText, Sparkles, Clock } from 'lucide-react'
```
```tsx
const KIND_ICON = {
  note: StickyNote,
  stage: ArrowRightLeft,
  task: CheckSquare,
  email: Mail,
  form: FileText,
  created: Sparkles,
  waiting: Clock,
} as const
```

- [ ] **Step 3: Write the failing test**

Create `__tests__/actions/leads-waiting.test.ts` (mirror the mock shape used by `__tests__/actions/tasks.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const leadDocSpy = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(leadDocSpy) }),
      }),
    }),
  },
}))
vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }))

import { setLeadWaiting, clearLeadWaiting } from '@/actions/leads'
import { logActivity } from '@/lib/activity'

describe('setLeadWaiting', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires a reason', async () => {
    await expect(setLeadWaiting('o1', 'l1', { reason: '  ' })).rejects.toThrow('reason')
  })

  it('writes the waiting object (with follow-up) and logs activity', async () => {
    await setLeadWaiting('o1', 'l1', { reason: 'Client reviewing', follow_up_date: '2026-08-10' })
    expect(leadDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({ waiting: { reason: 'Client reviewing', follow_up_date: '2026-08-10' } })
    )
    expect(logActivity).toHaveBeenCalledWith('o1', expect.objectContaining({ kind: 'waiting', parent_id: 'l1' }))
  })

  it('omits follow_up_date when blank', async () => {
    await setLeadWaiting('o1', 'l1', { reason: 'x', follow_up_date: '  ' })
    expect(leadDocSpy.update).toHaveBeenCalledWith(expect.objectContaining({ waiting: { reason: 'x' } }))
  })
})

describe('clearLeadWaiting', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes waiting and logs activity', async () => {
    await clearLeadWaiting('o1', 'l1')
    const arg = leadDocSpy.update.mock.calls[0][0]
    expect('waiting' in arg).toBe(true) // set to FieldValue.delete()
    expect(logActivity).toHaveBeenCalledWith('o1', expect.objectContaining({ kind: 'waiting' }))
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run __tests__/actions/leads-waiting.test.ts`
Expected: FAIL — `setLeadWaiting`/`clearLeadWaiting` not exported.

- [ ] **Step 5: Implement the mutations**

In `actions/leads.ts`: add `LeadWaiting` to the type import from `@/lib/types`, then add after `setLeadStage`:

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
  await leadsRef(orgId).doc(leadId).update({ waiting, updated_at: new Date().toISOString() })
  await logActivity(orgId, { parent_type: 'opportunity', parent_id: leadId, kind: 'waiting', summary: `Waiting: ${waiting.reason}` })
}

export async function clearLeadWaiting(orgId: string, leadId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await leadsRef(orgId).doc(leadId).update({ waiting: FieldValue.delete(), updated_at: new Date().toISOString() })
  await logActivity(orgId, { parent_type: 'opportunity', parent_id: leadId, kind: 'waiting', summary: 'Resumed — cleared waiting' })
}
```

(`leadsRef`, `assertOrgAdmin`, `FieldValue`, and `logActivity` are already imported in `actions/leads.ts`.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run __tests__/actions/leads-waiting.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add lib/types.ts actions/leads.ts components/admin/opportunity/ActivityTimeline.tsx __tests__/actions/leads-waiting.test.ts
git commit -m "feat(crm): setLeadWaiting/clearLeadWaiting + 'waiting' activity kind"
```

---

### Task 3: Thin aggregator action (`actions/today.ts`)

**Files:**
- Create: `actions/today.ts`
- Test: `__tests__/actions/today.test.ts`

**Interfaces:**
- Consumes: `assertOrgMember` (`@/lib/auth/assert`), `listLeads` (`@/actions/leads`), `listTasks` (`@/actions/tasks`), `OPEN_STAGES` (`@/lib/leads`), `todayYmd` (`@/lib/opportunity-detail`), `buildToday` (`@/lib/today`).
- Produces: `getTodayData(orgId: string): Promise<TodayData>`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/actions/today.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }) }))
const listLeads = vi.fn()
const listTasks = vi.fn()
vi.mock('@/actions/leads', () => ({ listLeads: (...a: unknown[]) => listLeads(...a) }))
vi.mock('@/actions/tasks', () => ({ listTasks: (...a: unknown[]) => listTasks(...a) }))

import { getTodayData } from '@/actions/today'

describe('getTodayData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches tasks only for open leads and returns aggregated data', async () => {
    listLeads.mockResolvedValue([
      { id: 'open1', name: 'A', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z', estimated_value: 200 },
      { id: 'closed1', name: 'B', stage: 'closed_won', created_at: '2026-01-01T00:00:00.000Z', estimated_value: 999 },
    ])
    listTasks.mockResolvedValue([]) // open1 has no tasks -> needs attention
    const data = await getTodayData('o1')
    // listTasks called once, for the open lead only
    expect(listTasks).toHaveBeenCalledTimes(1)
    expect(listTasks).toHaveBeenCalledWith('o1', 'open1')
    expect(data.needsAttention.map((n) => n.leadId)).toEqual(['open1'])
    expect(data.tiles.openPipelineValue).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/actions/today.test.ts`
Expected: FAIL — `@/actions/today` not found.

- [ ] **Step 3: Write the implementation**

Create `actions/today.ts`:

```ts
'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listLeads } from '@/actions/leads'
import { listTasks } from '@/actions/tasks'
import { OPEN_STAGES } from '@/lib/leads'
import { todayYmd } from '@/lib/opportunity-detail'
import { buildToday, type TodayData } from '@/lib/today'
import type { LeadStage, Task } from '@/lib/types'

export async function getTodayData(orgId: string): Promise<TodayData> {
  await assertOrgMember(orgId)
  const leads = await listLeads(orgId)
  const openLeads = leads.filter((l) => (OPEN_STAGES as LeadStage[]).includes(l.stage))
  const taskLists = await Promise.all(openLeads.map((l) => listTasks(orgId, l.id)))
  const tasksByLeadId: Record<string, Task[]> = {}
  openLeads.forEach((l, i) => { tasksByLeadId[l.id] = taskLists[i] })
  return buildToday({ leads, tasksByLeadId, today: todayYmd() })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/actions/today.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add actions/today.ts __tests__/actions/today.test.ts
git commit -m "feat(crm): getTodayData aggregator action"
```

---

### Task 4: `TodayTiles` component

**Files:**
- Create: `components/admin/today/TodayTiles.tsx`
- Test: `__tests__/components/today/TodayTiles.test.tsx`

**Interfaces:**
- Produces: `TodayTiles(props: { tasksDue: number; needsAttention: number; openPipelineValue: number }): JSX.Element` — presentational, three tiles; money formatted `$X.XX`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/today/TodayTiles.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodayTiles } from '@/components/admin/today/TodayTiles'

describe('TodayTiles', () => {
  it('renders the three metrics', () => {
    render(<TodayTiles tasksDue={3} needsAttention={2} openPipelineValue={1500} />)
    expect(screen.getByText('Tasks due')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Open pipeline')).toBeInTheDocument()
    expect(screen.getByText('$1500.00')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/today/TodayTiles.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `components/admin/today/TodayTiles.tsx`:

```tsx
import { Card, CardContent } from '@/components/ui/card'

interface TodayTilesProps {
  tasksDue: number
  needsAttention: number
  openPipelineValue: number
}

const money = (n: number) => `$${n.toFixed(2)}`

export function TodayTiles({ tasksDue, needsAttention, openPipelineValue }: TodayTilesProps) {
  const tiles = [
    { label: 'Tasks due', value: String(tasksDue) },
    { label: 'Needs attention', value: String(needsAttention) },
    { label: 'Open pipeline', value: money(openPipelineValue) },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t.label}</p>
            <p className="text-2xl font-bold">{t.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/today/TodayTiles.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add components/admin/today/TodayTiles.tsx __tests__/components/today/TodayTiles.test.tsx
git commit -m "feat(crm): Today metric tiles"
```

---

### Task 5: `NeedsAttentionList` component

**Files:**
- Create: `components/admin/today/NeedsAttentionList.tsx`
- Test: `__tests__/components/today/NeedsAttentionList.test.tsx`

**Interfaces:**
- Consumes: `createTask` (`@/actions/tasks`), `setLeadWaiting` (`@/actions/leads`), `NeedsAttentionItem` (`@/lib/today`); `useRouter`, `Link`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Button`, `Input`.
- Produces: `NeedsAttentionList(props: { orgId: string; orgSlug: string; items: NeedsAttentionItem[] }): JSX.Element`. Each row links to the opportunity and toggles one of two inline forms: **Add next step** (title + optional date → `createTask`) and **Mark waiting** (reason + optional follow-up date → `setLeadWaiting`); `router.refresh()` on success. Empty state: "Nothing needs attention."

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/today/NeedsAttentionList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const createTask = vi.fn().mockResolvedValue({})
const setLeadWaiting = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/tasks', () => ({ createTask: (...a: unknown[]) => createTask(...a) }))
vi.mock('@/actions/leads', () => ({ setLeadWaiting: (...a: unknown[]) => setLeadWaiting(...a) }))

import { NeedsAttentionList } from '@/components/admin/today/NeedsAttentionList'
import type { NeedsAttentionItem } from '@/lib/today'

const items: NeedsAttentionItem[] = [{ leadId: 'l1', name: 'Ann', company: 'Acme', stage: 'inquiry' }]

describe('NeedsAttentionList', () => {
  beforeEach(() => { refresh.mockClear(); createTask.mockClear(); setLeadWaiting.mockClear() })

  it('empty state', () => {
    render(<NeedsAttentionList orgId="o1" orgSlug="acme" items={[]} />)
    expect(screen.getByText(/nothing needs attention/i)).toBeInTheDocument()
  })

  it('adds a next step', async () => {
    render(<NeedsAttentionList orgId="o1" orgSlug="acme" items={items} />)
    fireEvent.click(screen.getByRole('button', { name: /add next step/i }))
    fireEvent.change(screen.getByPlaceholderText(/task/i), { target: { value: 'Call Ann' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('o1', 'l1', expect.objectContaining({ title: 'Call Ann' })))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('marks waiting', async () => {
    render(<NeedsAttentionList orgId="o1" orgSlug="acme" items={items} />)
    fireEvent.click(screen.getByRole('button', { name: /mark waiting/i }))
    fireEvent.change(screen.getByPlaceholderText(/waiting on/i), { target: { value: 'Client reviewing' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(setLeadWaiting).toHaveBeenCalledWith('o1', 'l1', expect.objectContaining({ reason: 'Client reviewing' })))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/today/NeedsAttentionList.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `components/admin/today/NeedsAttentionList.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createTask } from '@/actions/tasks'
import { setLeadWaiting } from '@/actions/leads'
import type { NeedsAttentionItem } from '@/lib/today'

type Mode = 'idle' | 'task' | 'waiting'

function Row({ orgId, orgSlug, item }: { orgId: string; orgSlug: string; item: NeedsAttentionItem }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('idle')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [reason, setReason] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn(); setMode('idle'); router.refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Action failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/${orgSlug}/leads/${item.leadId}`} className="min-w-0 flex-1 hover:underline">
          <span className="text-sm font-medium">{item.name}</span>
          {item.company && <span className="ml-2 text-xs text-muted-foreground">{item.company}</span>}
        </Link>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode(mode === 'task' ? 'idle' : 'task')}>Add next step</Button>
          <Button size="sm" variant="outline" onClick={() => setMode(mode === 'waiting' ? 'idle' : 'waiting')}>Mark waiting</Button>
        </div>
      </div>

      {mode === 'task' && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Next task…" className="flex-1" />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="sm:w-40" aria-label="Due date" />
          <Button size="sm" disabled={busy || !title.trim()} onClick={() => run(() => createTask(orgId, item.leadId, { title: title.trim(), ...(due ? { due_date: due } : {}) }))}>Add</Button>
        </div>
      )}

      {mode === 'waiting' && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Waiting on…" className="flex-1" />
          <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="sm:w-40" aria-label="Follow-up date" />
          <Button size="sm" disabled={busy || !reason.trim()} onClick={() => run(() => setLeadWaiting(orgId, item.leadId, { reason: reason.trim(), ...(followUp ? { follow_up_date: followUp } : {}) }))}>Save</Button>
        </div>
      )}

      {error && <p className="mt-1 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  )
}

interface NeedsAttentionListProps {
  orgId: string
  orgSlug: string
  items: NeedsAttentionItem[]
}

export function NeedsAttentionList({ orgId, orgSlug, items }: NeedsAttentionListProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Needs attention</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0
          ? <p className="text-sm text-muted-foreground">Nothing needs attention.</p>
          : items.map((it) => <Row key={it.leadId} orgId={orgId} orgSlug={orgSlug} item={it} />)}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/today/NeedsAttentionList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add components/admin/today/NeedsAttentionList.tsx __tests__/components/today/NeedsAttentionList.test.tsx
git commit -m "feat(crm): Today needs-attention list (add-step / mark-waiting)"
```

---

### Task 6: `DueTasksList` component

**Files:**
- Create: `components/admin/today/DueTasksList.tsx`
- Test: `__tests__/components/today/DueTasksList.test.tsx`

**Interfaces:**
- Consumes: `completeTask`, `snoozeTask` (`@/actions/tasks`), `addDays`, `todayYmd` (`@/lib/opportunity-detail`), `DueTaskItem` (`@/lib/today`); `useRouter`, `Link`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Button`.
- Produces: `DueTasksList(props: { orgId: string; orgSlug: string; items: DueTaskItem[] }): JSX.Element`. Each row: task title, a customer/opportunity link, an `overdue`/`today` badge, **Done** (`completeTask`) and **Snooze** (`snoozeTask(orgId, leadId, taskId, addDays(due_date ?? today, 3))`); `router.refresh()` on success. Empty state: "Nothing due."

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/today/DueTasksList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const completeTask = vi.fn().mockResolvedValue(undefined)
const snoozeTask = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/tasks', () => ({
  completeTask: (...a: unknown[]) => completeTask(...a),
  snoozeTask: (...a: unknown[]) => snoozeTask(...a),
}))

import { DueTasksList } from '@/components/admin/today/DueTasksList'
import type { DueTaskItem } from '@/lib/today'

const items: DueTaskItem[] = [{
  task: { id: 't1', lead_id: 'l1', title: 'Call venue', due_date: '2026-08-01', done: false, created_at: '' },
  leadId: 'l1', leadName: 'Ann', company: 'Acme', status: 'overdue',
}]

describe('DueTasksList', () => {
  beforeEach(() => { refresh.mockClear(); completeTask.mockClear(); snoozeTask.mockClear() })

  it('empty state', () => {
    render(<DueTasksList orgId="o1" orgSlug="acme" items={[]} />)
    expect(screen.getByText(/nothing due/i)).toBeInTheDocument()
  })

  it('renders and completes', async () => {
    render(<DueTasksList orgId="o1" orgSlug="acme" items={items} />)
    expect(screen.getByText('Call venue')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => expect(completeTask).toHaveBeenCalledWith('o1', 'l1', 't1'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('snoozes 3 days from the due date', async () => {
    render(<DueTasksList orgId="o1" orgSlug="acme" items={items} />)
    fireEvent.click(screen.getByRole('button', { name: /snooze/i }))
    await waitFor(() => expect(snoozeTask).toHaveBeenCalledWith('o1', 'l1', 't1', '2026-08-04'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/today/DueTasksList.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `components/admin/today/DueTasksList.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { completeTask, snoozeTask } from '@/actions/tasks'
import { addDays, todayYmd } from '@/lib/opportunity-detail'
import type { DueTaskItem } from '@/lib/today'

function Row({ orgId, orgSlug, item }: { orgId: string; orgSlug: string; item: DueTaskItem }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = todayYmd()

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Action failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.task.title}</p>
          <Link href={`/${orgSlug}/leads/${item.leadId}`} className="text-xs text-muted-foreground hover:underline">
            {item.leadName}{item.company ? ` · ${item.company}` : ''}
          </Link>
        </div>
        <span className={`shrink-0 text-xs font-medium ${item.status === 'overdue' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
          {item.status === 'overdue' ? 'Overdue' : 'Today'}
        </span>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" disabled={busy} onClick={() => run(() => completeTask(orgId, item.leadId, item.task.id))}>Done</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => snoozeTask(orgId, item.leadId, item.task.id, addDays(item.task.due_date ?? today, 3)))}>Snooze</Button>
        </div>
      </div>
      {error && <p className="mt-1 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  )
}

interface DueTasksListProps {
  orgId: string
  orgSlug: string
  items: DueTaskItem[]
}

export function DueTasksList({ orgId, orgSlug, items }: DueTasksListProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Due today / overdue</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0
          ? <p className="text-sm text-muted-foreground">Nothing due.</p>
          : items.map((it) => <Row key={it.task.id} orgId={orgId} orgSlug={orgSlug} item={it} />)}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/today/DueTasksList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add components/admin/today/DueTasksList.tsx __tests__/components/today/DueTasksList.test.tsx
git commit -m "feat(crm): Today due/overdue task list (done / snooze)"
```

---

### Task 7: `WaitingList` component

**Files:**
- Create: `components/admin/today/WaitingList.tsx`
- Test: `__tests__/components/today/WaitingList.test.tsx`

**Interfaces:**
- Consumes: `createTask` (`@/actions/tasks`), `setLeadWaiting`, `clearLeadWaiting` (`@/actions/leads`), `addDays`, `todayYmd` (`@/lib/opportunity-detail`), `WaitingItem` (`@/lib/today`); `useRouter`, `Link`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Button`.
- Produces: `WaitingList(props: { orgId: string; orgSlug: string; items: WaitingItem[] }): JSX.Element`. Each row: name/company link, reason, quiet duration. `followUpDue` rows are highlighted and offer **Follow up now** (`createTask` titled `Follow up: <reason>`, due today), **Still waiting** (`setLeadWaiting` keeping reason, `follow_up_date = addDays(today, 3)`), and **Resume** (`clearLeadWaiting`); non-due rows offer **Resume** only. `router.refresh()` on success. Empty state: "No one is waiting."

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/today/WaitingList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const createTask = vi.fn().mockResolvedValue({})
const setLeadWaiting = vi.fn().mockResolvedValue(undefined)
const clearLeadWaiting = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/tasks', () => ({ createTask: (...a: unknown[]) => createTask(...a) }))
vi.mock('@/actions/leads', () => ({
  setLeadWaiting: (...a: unknown[]) => setLeadWaiting(...a),
  clearLeadWaiting: (...a: unknown[]) => clearLeadWaiting(...a),
}))

import { WaitingList } from '@/components/admin/today/WaitingList'
import type { WaitingItem } from '@/lib/today'

const due: WaitingItem = { leadId: 'l1', name: 'Ann', company: 'Acme', reason: 'Client reviewing', followUpDate: '2026-08-03', followUpDue: true, quietDays: 4 }
const notDue: WaitingItem = { leadId: 'l2', name: 'Bob', reason: 'Awaiting deposit', followUpDate: '2026-09-01', followUpDue: false, quietDays: 1 }

describe('WaitingList', () => {
  beforeEach(() => { refresh.mockClear(); createTask.mockClear(); setLeadWaiting.mockClear(); clearLeadWaiting.mockClear() })

  it('empty state', () => {
    render(<WaitingList orgId="o1" orgSlug="acme" items={[]} />)
    expect(screen.getByText(/no one is waiting/i)).toBeInTheDocument()
  })

  it('follow-up-due row offers follow-up now', async () => {
    render(<WaitingList orgId="o1" orgSlug="acme" items={[due]} />)
    fireEvent.click(screen.getByRole('button', { name: /follow up now/i }))
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('o1', 'l1', expect.objectContaining({ title: expect.stringContaining('Follow up') })))
  })

  it('non-due row offers resume only', async () => {
    render(<WaitingList orgId="o1" orgSlug="acme" items={[notDue]} />)
    expect(screen.queryByRole('button', { name: /follow up now/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /resume/i }))
    await waitFor(() => expect(clearLeadWaiting).toHaveBeenCalledWith('o1', 'l2'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/today/WaitingList.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `components/admin/today/WaitingList.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createTask } from '@/actions/tasks'
import { setLeadWaiting, clearLeadWaiting } from '@/actions/leads'
import { addDays, todayYmd } from '@/lib/opportunity-detail'
import type { WaitingItem } from '@/lib/today'

function Row({ orgId, orgSlug, item }: { orgId: string; orgSlug: string; item: WaitingItem }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = todayYmd()

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Action failed') }
    finally { setBusy(false) }
  }

  return (
    <div className={`rounded-md border px-3 py-2 ${item.followUpDue ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30' : 'border-border'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link href={`/${orgSlug}/leads/${item.leadId}`} className="hover:underline">
            <span className="text-sm font-medium">{item.name}</span>
            {item.company && <span className="ml-2 text-xs text-muted-foreground">{item.company}</span>}
          </Link>
          <p className="text-xs text-muted-foreground">{item.reason} · quiet {item.quietDays}d</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {item.followUpDue && (
            <>
              <Button size="sm" disabled={busy} onClick={() => run(() => createTask(orgId, item.leadId, { title: `Follow up: ${item.reason}`, due_date: today }))}>Follow up now</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => setLeadWaiting(orgId, item.leadId, { reason: item.reason, follow_up_date: addDays(today, 3) }))}>Still waiting</Button>
            </>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => clearLeadWaiting(orgId, item.leadId))}>Resume</Button>
        </div>
      </div>
      {error && <p className="mt-1 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  )
}

interface WaitingListProps {
  orgId: string
  orgSlug: string
  items: WaitingItem[]
}

export function WaitingList({ orgId, orgSlug, items }: WaitingListProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Waiting on</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0
          ? <p className="text-sm text-muted-foreground">No one is waiting.</p>
          : items.map((it) => <Row key={it.leadId} orgId={orgId} orgSlug={orgSlug} item={it} />)}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/today/WaitingList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add components/admin/today/WaitingList.tsx __tests__/components/today/WaitingList.test.tsx
git commit -m "feat(crm): Today waiting-on list (follow-up / still-waiting / resume)"
```

---

### Task 8: `TodayClient` orchestrator

**Files:**
- Create: `components/admin/today/TodayClient.tsx`
- Test: `__tests__/components/today/TodayClient.test.tsx`

**Interfaces:**
- Consumes: `TodayTiles`, `NeedsAttentionList`, `DueTasksList`, `WaitingList`; `TodayData` (`@/lib/today`).
- Produces: `TodayClient(props: { orgId: string; orgSlug: string; data: TodayData }): JSX.Element` — header "Today", tiles, then the three lists stacked; passes `orgId`/`orgSlug` and the corresponding slice of `data` to each.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/today/TodayClient.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/actions/tasks', () => ({ createTask: vi.fn(), completeTask: vi.fn(), snoozeTask: vi.fn() }))
vi.mock('@/actions/leads', () => ({ setLeadWaiting: vi.fn(), clearLeadWaiting: vi.fn() }))

import { TodayClient } from '@/components/admin/today/TodayClient'
import type { TodayData } from '@/lib/today'

const data: TodayData = {
  tiles: { tasksDue: 1, needsAttention: 1, openPipelineValue: 500 },
  needsAttention: [{ leadId: 'l1', name: 'Ann', stage: 'inquiry' }],
  dueTasks: [{ task: { id: 't1', lead_id: 'l1', title: 'Call', due_date: '2026-08-05', done: false, created_at: '' }, leadId: 'l1', leadName: 'Ann', status: 'today' }],
  waiting: [],
}

describe('TodayClient', () => {
  it('renders the three sections and tiles', () => {
    render(<TodayClient orgId="o1" orgSlug="acme" data={data} />)
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Due today / overdue')).toBeInTheDocument()
    expect(screen.getByText('Waiting on')).toBeInTheDocument()
    expect(screen.getByText('Ann')).toBeInTheDocument()
    expect(screen.getByText('Call')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/today/TodayClient.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `components/admin/today/TodayClient.tsx`:

```tsx
'use client'

import { TodayTiles } from '@/components/admin/today/TodayTiles'
import { NeedsAttentionList } from '@/components/admin/today/NeedsAttentionList'
import { DueTasksList } from '@/components/admin/today/DueTasksList'
import { WaitingList } from '@/components/admin/today/WaitingList'
import type { TodayData } from '@/lib/today'

interface TodayClientProps {
  orgId: string
  orgSlug: string
  data: TodayData
}

export function TodayClient({ orgId, orgSlug, data }: TodayClientProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Today</h1>
      <TodayTiles
        tasksDue={data.tiles.tasksDue}
        needsAttention={data.tiles.needsAttention}
        openPipelineValue={data.tiles.openPipelineValue}
      />
      <NeedsAttentionList orgId={orgId} orgSlug={orgSlug} items={data.needsAttention} />
      <DueTasksList orgId={orgId} orgSlug={orgSlug} items={data.dueTasks} />
      <WaitingList orgId={orgId} orgSlug={orgSlug} items={data.waiting} />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/today/TodayClient.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add components/admin/today/TodayClient.tsx __tests__/components/today/TodayClient.test.tsx
git commit -m "feat(crm): Today orchestrator"
```

---

### Task 9: Page + sidebar nav wiring

**Files:**
- Create: `app/(admin)/[orgSlug]/today/page.tsx`
- Modify: `components/layout/AdminSidebar.tsx`
- Test: `__tests__/components/AdminSidebar.test.tsx` (add one assertion)

**Interfaces:**
- Consumes: `getTodayData` (`@/actions/today`), `TodayClient`; the existing org-slug → orgId resolution pattern used by other pages.

- [ ] **Step 1: Add the sidebar nav item + test assertion**

In `components/layout/AdminSidebar.tsx`, find the workspace/CRM link list that contains `{ module: 'leads' as ModuleId, label: 'Pipeline', slug: 'leads' }` and add a Today item immediately before it:

```tsx
    { module: 'leads' as ModuleId, label: 'Today', slug: 'today' },
    { module: 'leads' as ModuleId, label: 'Pipeline', slug: 'leads' },
```

Then in `__tests__/components/AdminSidebar.test.tsx`, in the test that renders with `enabledModules={['leads', ...]}` (or the "shows every workspace link" test), add:

```tsx
    expect(screen.getByText('Today')).toBeInTheDocument()
```

- [ ] **Step 2: Run the sidebar test to verify it passes**

Run: `npx vitest run __tests__/components/AdminSidebar.test.tsx`
Expected: PASS (new assertion + existing).

- [ ] **Step 3: Write the page**

Create `app/(admin)/[orgSlug]/today/page.tsx` (mirror the org-resolution pattern in `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`):

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getTodayData } from '@/actions/today'
import { TodayClient } from '@/components/admin/today/TodayClient'

export default async function TodayPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const data = await getTodayData(orgId)
  return <TodayClient orgId={orgId} orgSlug={orgSlug} data={data} />
}
```

- [ ] **Step 4: Full green gate**

Run: `npx tsc --noEmit` → clean.
Run: `npm test` → all suites pass (run `npm install` first if ~5 server-only load failures appear).
Run: `npx next build` → confirm the new route type-checks/compiles (page-data collection may fail on missing Firebase Admin env in this environment — that is pre-existing/environmental, not a diff defect; capture the exact error if so and note it).

- [ ] **Step 5: Browser verification (best-effort)**

If a seeded org is available, open `/{orgSlug}/today` and confirm: tiles reflect counts; needs-attention rows can add a step / mark waiting; due tasks complete/snooze; waiting rows (with a past follow-up date) show Follow-up-now / Still-waiting / Resume; empty states render; layout stacks on mobile. If no seeded data/creds, state that live verification was not run and rely on `next build` + the suite.

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/[orgSlug]/today/page.tsx" components/layout/AdminSidebar.tsx __tests__/components/AdminSidebar.test.tsx
git commit -m "feat(crm): Today page + sidebar nav"
```

---

## Final whole-branch review

After Task 9, run a whole-branch review (superpowers:requesting-code-review) covering: additive-only shared-model/action changes (`setLeadWaiting`/`clearLeadWaiting`, `'waiting'` kind); derived-not-stored aggregation; reuse of increment-1/2 primitives; correct per-row mutations; responsive layout; tsc + full vitest green; no `main` commits. Address findings, then open a PR against `main` and STOP (do not merge without the human).

---

## Self-Review (author checklist — completed)

**Spec coverage** (design §Screens#1 "Today" + increment-3 design doc):
- Three metric tiles → Task 4 (`TodayTiles`), fed by `buildToday` tiles. ✔
- Needs-attention list with Add-next-step / Mark-waiting → Task 5 + `setLeadWaiting` (Task 2). ✔
- Due today / overdue list with complete + snooze → Task 6 (reuses `completeTask`/`snoozeTask`). ✔
- Waiting-on list with quiet duration + follow-up-due surfacing (derived, no writes) → Task 7 + `buildToday` `followUpDue`/`quietDays`. ✔
- Placement: new `/today` route + sidebar item → Task 9. ✔
- `waiting` workflow (set/clear/push) → Task 2 (`setLeadWaiting`/`clearLeadWaiting`) + Tasks 5/7. ✔
- Derived aggregation behind a thin action → Tasks 1 & 3. ✔
- Mobile-responsive; quiet empty states → Tasks 5–8. ✔
- Email reminders explicitly out of scope → not planned. ✔

**Placeholder scan:** every code step has real code; no TBD/TODO. ✔

**Type consistency:** signatures match the base — `computeHealth(lead, tasks)`, `pipelineSummary(leads).openValue`, `OPEN_STAGES`, `dueStatus`/`addDays`/`todayYmd`, `createTask(orgId, leadId, {title, due_date?})`, `completeTask(orgId, leadId, taskId)`, `snoozeTask(orgId, leadId, taskId, dueDate)`, `setLeadWaiting(orgId, leadId, {reason, follow_up_date?})`, `clearLeadWaiting(orgId, leadId)`, `listLeads`/`listTasks`. `TodayData`/`NeedsAttentionItem`/`DueTaskItem`/`WaitingItem` are defined in Task 1 and consumed unchanged in Tasks 3–8. `ActivityEvent['kind']` gains `'waiting'` (Task 2) before any code logs that kind. ✔
