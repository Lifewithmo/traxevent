# Pipeline KPI Header + Backlog Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pipeline page's scoreboard-style summary with three action-driving header tiles (Booked this month vs last year, Booked ahead next 90 days, Needs action) plus a booked-revenue-by-month backlog bar, and start capturing two fields (lead `source`, structured `stage` on activity events) so future Reports work has data accruing.

**Architecture:** All KPI math lives in a new pure module `lib/pipeline-stats.ts` (unit-tested, no Firestore). A new server-renderable presentational component `PipelineStatsHeader` renders the tiles and bars; `app/(admin)/[orgSlug]/leads/page.tsx` computes stats from data it already loads and renders the header above both list and board views. Capture fields are additive optional properties — no migration needed.

**Tech Stack:** Next.js App Router (READ `node_modules/next/dist/docs/` before writing route/component code — this Next version has breaking changes), TypeScript, Tailwind + shadcn/ui, Vitest, Firestore via firebase-admin.

## Global Constraints

- Work in an isolated worktree (memory: `EnterWorktree` branches from `origin/main` — reset to local `main` and rename branch after creating; fresh worktrees need `npm install` and a copied `.env.local` for build).
- Run vitest with `--exclude '**/.claude/**'` if ever run from the primary checkout.
- `next build` must pass before the branch is called green (memory: tsc alone misses 'use server' RSC errors).
- Never re-export a type from a `'use server'` module.
- Dollars are plain numbers (`estimated_value`), formatted with a local `money()` helper per existing convention (see `components/admin/pipeline/PipelineListClient.tsx`).
- Dates are ISO strings; "today" is a `YYYY-MM-DD` string from `todayYmd()` in `lib/opportunity-detail.ts`.
- Push requires `gh auth switch` to the Lifewithmo account.

---

### Task 1: Pure stats module `lib/pipeline-stats.ts`

**Files:**
- Create: `lib/pipeline-stats.ts`
- Test: `__tests__/lib/pipeline-stats.test.ts`

**Interfaces:**
- Consumes: `Lead` from `@/lib/types`; `OPEN_STAGES` from `@/lib/leads`.
- Produces:
  - `wonValueInMonth(leads: Lead[], ym: string): { count: number; value: number }` — closed_won leads whose `closed_at` month equals `ym` (`'2026-08'`).
  - `bookedAhead(leads: Lead[], today: string, days?: number): { count: number; value: number }` — closed_won leads with `event_date` in `[today, today+days)`, default 90.
  - `backlogByMonth(leads: Lead[], today: string, months?: number): BacklogMonth[]` — default 6 entries starting at today's month; `BacklogMonth = { ym: string; label: string; booked: number; open: number }` where `booked` sums closed_won `estimated_value` by `event_date` month and `open` sums OPEN_STAGES leads the same way. `label` is `'Aug'`-style.
  - `addMonths(ym: string, n: number): string` and `addDaysYmd(ymd: string, n: number): string` — exported date helpers, pure string/Date-UTC math.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/lib/pipeline-stats.test.ts
import { describe, it, expect } from 'vitest'
import { wonValueInMonth, bookedAhead, backlogByMonth, addMonths, addDaysYmd } from '@/lib/pipeline-stats'
import type { Lead } from '@/lib/types'

function lead(over: Partial<Lead>): Lead {
  return { id: 'x', name: 'n', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z', ...over } as Lead
}

describe('addMonths / addDaysYmd', () => {
  it('adds months across year boundary', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
  })
  it('adds days across month boundary', () => {
    expect(addDaysYmd('2026-08-25', 10)).toBe('2026-09-04')
  })
})

describe('wonValueInMonth', () => {
  it('sums closed_won by closed_at month, ignores lost and other months', () => {
    const leads = [
      lead({ stage: 'closed_won', closed_at: '2026-08-05T10:00:00.000Z', estimated_value: 3000 }),
      lead({ stage: 'closed_won', closed_at: '2026-08-20T10:00:00.000Z', estimated_value: 3300 }),
      lead({ stage: 'closed_lost', closed_at: '2026-08-06T10:00:00.000Z', estimated_value: 800 }),
      lead({ stage: 'closed_won', closed_at: '2026-07-30T10:00:00.000Z', estimated_value: 999 }),
    ]
    expect(wonValueInMonth(leads, '2026-08')).toEqual({ count: 2, value: 6300 })
  })
  it('treats missing estimated_value as 0', () => {
    const leads = [lead({ stage: 'closed_won', closed_at: '2026-08-05T10:00:00.000Z' })]
    expect(wonValueInMonth(leads, '2026-08')).toEqual({ count: 1, value: 0 })
  })
})

describe('bookedAhead', () => {
  it('counts closed_won with event_date inside the window, excluding today-past and beyond', () => {
    const today = '2026-08-12'
    const leads = [
      lead({ stage: 'closed_won', event_date: '2026-08-12', estimated_value: 100 }),
      lead({ stage: 'closed_won', event_date: '2026-11-09', estimated_value: 200 }),
      lead({ stage: 'closed_won', event_date: '2026-11-11', estimated_value: 400 }),
      lead({ stage: 'closed_won', event_date: '2026-08-11', estimated_value: 800 }),
      lead({ stage: 'proposal', event_date: '2026-09-01', estimated_value: 1600 }),
      lead({ stage: 'closed_won', estimated_value: 3200 }),
    ]
    expect(bookedAhead(leads, today)).toEqual({ count: 2, value: 300 })
  })
})

describe('backlogByMonth', () => {
  it('buckets booked and open value by event_date month from the current month', () => {
    const today = '2026-08-12'
    const leads = [
      lead({ stage: 'closed_won', event_date: '2026-08-30', estimated_value: 1000 }),
      lead({ stage: 'closed_won', event_date: '2026-09-14', estimated_value: 5150 }),
      lead({ stage: 'proposal', event_date: '2026-09-20', estimated_value: 2000 }),
      lead({ stage: 'inquiry', event_date: '2026-11-08', estimated_value: 1800 }),
      lead({ stage: 'closed_lost', event_date: '2026-09-01', estimated_value: 700 }),
      lead({ stage: 'closed_won', event_date: '2026-07-01', estimated_value: 999 }),
    ]
    const rows = backlogByMonth(leads, today, 4)
    expect(rows.map((r) => r.ym)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
    expect(rows[0]).toMatchObject({ label: 'Aug', booked: 1000, open: 0 })
    expect(rows[1]).toMatchObject({ label: 'Sep', booked: 5150, open: 2000 })
    expect(rows[2]).toMatchObject({ label: 'Oct', booked: 0, open: 0 })
    expect(rows[3]).toMatchObject({ label: 'Nov', booked: 0, open: 1800 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/pipeline-stats.test.ts`
Expected: FAIL — cannot resolve `@/lib/pipeline-stats`.

- [ ] **Step 3: Implement `lib/pipeline-stats.ts`**

```ts
import type { Lead } from '@/lib/types'
import { OPEN_STAGES } from '@/lib/leads'

export interface BacklogMonth {
  ym: string      // '2026-08'
  label: string   // 'Aug'
  booked: number  // closed_won estimated_value with event_date in this month
  open: number    // open-stage estimated_value with event_date in this month
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function wonValueInMonth(leads: Lead[], ym: string): { count: number; value: number } {
  const won = leads.filter((l) => l.stage === 'closed_won' && l.closed_at?.slice(0, 7) === ym)
  return { count: won.length, value: won.reduce((s, l) => s + (l.estimated_value ?? 0), 0) }
}

export function bookedAhead(leads: Lead[], today: string, days = 90): { count: number; value: number } {
  const end = addDaysYmd(today, days)
  const inWindow = leads.filter(
    (l) => l.stage === 'closed_won' && l.event_date && l.event_date >= today && l.event_date < end
  )
  return { count: inWindow.length, value: inWindow.reduce((s, l) => s + (l.estimated_value ?? 0), 0) }
}

export function backlogByMonth(leads: Lead[], today: string, months = 6): BacklogMonth[] {
  const start = today.slice(0, 7)
  return Array.from({ length: months }, (_, i) => {
    const ym = addMonths(start, i)
    const inMonth = leads.filter((l) => l.event_date?.slice(0, 7) === ym)
    const sum = (ls: Lead[]) => ls.reduce((s, l) => s + (l.estimated_value ?? 0), 0)
    return {
      ym,
      label: MONTHS[Number(ym.slice(5)) - 1],
      booked: sum(inMonth.filter((l) => l.stage === 'closed_won')),
      open: sum(inMonth.filter((l) => OPEN_STAGES.includes(l.stage))),
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/pipeline-stats.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline-stats.ts __tests__/lib/pipeline-stats.test.ts
git commit -m "feat(pipeline): pure stats helpers — won-in-month, booked-ahead, backlog-by-month"
```

---

### Task 2: `PipelineStatsHeader` component wired into the leads page

**Files:**
- Create: `components/admin/pipeline/PipelineStatsHeader.tsx`
- Modify: `app/(admin)/[orgSlug]/leads/page.tsx`

**Interfaces:**
- Consumes: `wonValueInMonth`, `bookedAhead`, `backlogByMonth`, `addMonths`, `BacklogMonth` from `@/lib/pipeline-stats` (Task 1); `groups.needs_attention` from `buildPipelineRows` (existing).
- Produces: `<PipelineStatsHeader stats={PipelineHeaderStats} />` where:

```ts
export interface PipelineHeaderStats {
  bookedThisMonth: { count: number; value: number }
  bookedLastYearSameMonth: { count: number; value: number }
  bookedNext90: { count: number; value: number }
  needsActionCount: number
  backlog: BacklogMonth[]
}
```

- [ ] **Step 1: Read the existing UI conventions**

Read `components/admin/pipeline/PipelineListClient.tsx` fully (Tailwind classes, `Card`/`CardContent`, `text-muted-foreground`, local `money()` helper) and mirror them. This is a presentational server component — no `'use client'`, no hooks.

- [ ] **Step 2: Implement the component**

```tsx
// components/admin/pipeline/PipelineStatsHeader.tsx
import { Card, CardContent } from '@/components/ui/card'
import type { BacklogMonth } from '@/lib/pipeline-stats'

export interface PipelineHeaderStats {
  bookedThisMonth: { count: number; value: number }
  bookedLastYearSameMonth: { count: number; value: number }
  bookedNext90: { count: number; value: number }
  needsActionCount: number
  backlog: BacklogMonth[]
}

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

function yoyLine(now: number, lastYear: number): string | null {
  if (lastYear <= 0) return null
  const pct = Math.round(((now - lastYear) / lastYear) * 100)
  if (pct === 0) return 'even with this month last year'
  return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% vs this month last year`
}

export function PipelineStatsHeader({ stats }: { stats: PipelineHeaderStats }) {
  const { bookedThisMonth, bookedLastYearSameMonth, bookedNext90, needsActionCount, backlog } = stats
  const yoy = yoyLine(bookedThisMonth.value, bookedLastYearSameMonth.value)
  const max = Math.max(1, ...backlog.map((m) => m.booked + m.open))
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Booked this month</p>
            <p className="text-2xl font-semibold">{money(bookedThisMonth.value)}</p>
            <p className="text-xs text-muted-foreground">
              {yoy ?? `${bookedThisMonth.count} won`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Booked ahead · next 90 days</p>
            <p className="text-2xl font-semibold">{money(bookedNext90.value)}</p>
            <p className="text-xs text-muted-foreground">{bookedNext90.count} events on the calendar</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Needs action</p>
            <p className={`text-2xl font-semibold ${needsActionCount > 0 ? 'text-destructive' : ''}`}>
              {needsActionCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {needsActionCount > 0 ? 'stale or unopened — see below' : 'all caught up'}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-sm font-medium">Booked revenue by month</p>
            <p className="text-xs text-muted-foreground">solid = booked · light = open pipeline with dates</p>
          </div>
          <div className="flex h-28 items-end gap-3">
            {backlog.map((m) => (
              <div key={m.ym} className="flex h-full flex-1 flex-col justify-end">
                <div
                  className="rounded-t-sm bg-primary/25"
                  style={{ height: `${(m.open / max) * 100}%` }}
                  title={`${m.label} open ${money(m.open)}`}
                />
                <div
                  className="bg-primary"
                  style={{ height: `${(m.booked / max) * 100}%` }}
                  title={`${m.label} booked ${money(m.booked)}`}
                />
                <p className="mt-1 text-center text-xs text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Wire into the page**

In `app/(admin)/[orgSlug]/leads/page.tsx`, after `const monthly = closedThisMonth(leads, today)` add:

```tsx
import { wonValueInMonth, bookedAhead, backlogByMonth, addMonths } from '@/lib/pipeline-stats'
import { PipelineStatsHeader } from '@/components/admin/pipeline/PipelineStatsHeader'

// inside the component, after `groups`/`monthly`:
const ym = today.slice(0, 7)
const stats = {
  bookedThisMonth: wonValueInMonth(leads, ym),
  bookedLastYearSameMonth: wonValueInMonth(leads, addMonths(ym, -12)),
  bookedNext90: bookedAhead(leads, today),
  needsActionCount: groups.needs_attention.length,
  backlog: backlogByMonth(leads, today),
}
```

Render `<PipelineStatsHeader stats={stats} />` between `<PipelineSubNav …/>` and the view switch, wrapped to match page padding (the list/board views own `p-6`; wrap the header in `<div className="px-6 pt-6">` so it aligns — verify against actual rendering and adjust).

- [ ] **Step 4: Verify with existing tests + typecheck**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add components/admin/pipeline/PipelineStatsHeader.tsx "app/(admin)/[orgSlug]/leads/page.tsx"
git commit -m "feat(pipeline): KPI header — booked this month vs LY, booked ahead, needs action, backlog bar"
```

---

### Task 3: Capture `source` on leads

**Files:**
- Modify: `lib/types.ts` (Lead interface), `lib/crm/leads.ts` (CreateLeadCoreInput + createLeadCore), `actions/leads.ts` (createLead), `actions/intake-public.ts` (createLeadCore call ~line 106)
- Test: extend `__tests__/lib/crm/leads.test.ts` if it exists, else `__tests__/lib/leads.test.ts` sibling `__tests__/lib/crm/` — locate the existing createLeadCore test file first and follow its mocking pattern for `adminDb`.

**Interfaces:**
- Produces: `Lead.source?: 'intake' | 'manual'`; `CreateLeadCoreInput.source?: 'intake' | 'manual'`.

- [ ] **Step 1: Write the failing test**

Follow the existing test file's Firestore mock pattern exactly (read it first). Assert:

```ts
it('stamps source when provided', async () => {
  const lead = await createLeadCore('org1', { name: 'A', stage: 'inquiry', customer_id: 'c1', source: 'intake' })
  expect(lead.source).toBe('intake')
})
it('omits source when not provided', async () => {
  const lead = await createLeadCore('org1', { name: 'A', stage: 'inquiry', customer_id: 'c1' })
  expect('source' in lead).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run <that test file>`
Expected: FAIL — `source` typed/undefined mismatch.

- [ ] **Step 3: Implement**

`lib/types.ts` — in `Lead`, after `guest_count`:

```ts
  source?: 'intake' | 'manual'  // how the lead entered the pipeline; absent on pre-2026-08 leads
```

`lib/crm/leads.ts` — add `source?: 'intake' | 'manual'` to `CreateLeadCoreInput`; in `createLeadCore`'s object literal add `...(input.source ? { source: input.source } : {}),`.

`actions/leads.ts` `createLead` — pass `source: 'manual'` in the `createLeadCore` call.

`actions/intake-public.ts` — pass `source: 'intake'` in its `createLeadCore` call.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run` (full suite — intake/lead action tests must still pass)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/crm/leads.ts actions/leads.ts actions/intake-public.ts __tests__
git commit -m "feat(leads): stamp source (intake|manual) at creation for future attribution reporting"
```

---

### Task 4: Structured `stage` on stage-change activity events

**Files:**
- Modify: `lib/types.ts` (ActivityEvent), `lib/activity.ts` (logActivity param type), `actions/leads.ts` (both stage logActivity calls, lines ~79 and ~92)
- Test: extend the existing `logActivity` test (find it — worktree copies exist at `__tests__/actions/activity.test.ts`; locate the primary-checkout equivalent and follow its pattern).

**Interfaces:**
- Produces: `ActivityEvent.stage?: LeadStage`; `logActivity(orgId, e)` accepts optional `stage`.

- [ ] **Step 1: Write the failing test**

In the activity test file, following its existing mock pattern:

```ts
it('persists structured stage when provided', async () => {
  await logActivity('o1', { parent_type: 'opportunity', parent_id: 'l1', kind: 'stage', summary: 'Stage → proposal', stage: 'proposal' })
  // assert the doc set() payload includes stage: 'proposal' (per the file's existing spy pattern)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run <activity test file>`
Expected: FAIL — `stage` not accepted / not persisted.

- [ ] **Step 3: Implement**

`lib/types.ts` — in `ActivityEvent`, after `summary`:

```ts
  stage?: LeadStage   // structured stage for kind:'stage' events; summary string is display-only
```

(Import `LeadStage` is already in scope in types.ts — same file.)

`lib/activity.ts` — widen the param:

```ts
  e: {
    parent_type: ActivityEvent['parent_type']
    parent_id: string
    kind: ActivityEvent['kind']
    summary: string
    stage?: ActivityEvent['stage']
  }
```

(The spread `...e` already persists it; ensure `undefined` isn't written — use `...(e.stage ? { stage: e.stage } : {})` and spread the rest explicitly, since Firestore `set` rejects undefined values depending on settings.)

`actions/leads.ts` — both stage-change `logActivity` calls gain `stage: updates.stage` / `stage`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/activity.ts actions/leads.ts __tests__
git commit -m "feat(activity): structured stage field on stage-change events for cohort funnel math"
```

---

### Task 5: Green build, roadmap note, PR

**Files:**
- Modify: `docs/ROADMAP.md` (one-line status entry per repo convention)

- [ ] **Step 1: Full verification**

```bash
npx vitest run
npx tsc --noEmit
npx next build
```

Expected: all pass. (`next build` is mandatory — memory: 'use server' type re-export class of errors only surfaces there.)

- [ ] **Step 2: Update roadmap**

Add a line to `docs/ROADMAP.md` following its existing format: pipeline KPI header + backlog bar shipped; source/stage capture fields live.

- [ ] **Step 3: Commit and push**

```bash
git add docs/ROADMAP.md
git commit -m "docs: roadmap — pipeline KPI header shipped"
gh auth switch --user Lifewithmo
git push -u origin HEAD
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "feat(pipeline): KPI header, backlog-by-month bar, source/stage capture" --body "…summary of the four tasks, note zero-migration additive schema fields…

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
