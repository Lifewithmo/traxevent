# Opportunity Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the admin sidebar light, recompose the opportunity page into record-left / working-right columns with an expanding "Tasks & documents" pill row, and add the DatesPanel ten-day availability window.

**Architecture:** Pure window/label/bucketing math lands in `lib/date-window.ts` and a pure range-assembly function in `lib/calendar.ts` (vitest-covered); one new server action fetches `CalendarItem`s for a date range; the opportunity page moves its document lists into a pill-selected pane and its right column becomes DatesPanel + Activity. Composers (task input, note box) open on demand.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Firestore via firebase-admin, vitest + testing-library, shadcn-style components in `components/ui`.

**Spec:** `docs/superpowers/specs/2026-08-08-opportunity-workspace-design.md`

## Global Constraints

- **Read `node_modules/next/dist/docs/` before writing Next-specific code** — this Next version has breaking changes vs. training data (AGENTS.md).
- **Never re-export a type from a `'use server'` module** — `tsc` passes but `next build` fails. Types go in `lib/`.
- **`next build` must pass before the branch is called green.**
- Branch: `claude/opportunity-workspace` (already created off merged main). Worktree already set up (`npm install` done, `.env.local` present). Tests run as `npx vitest run --exclude '**/.claude/**'`.
- **Do NOT touch, commit, or revert `lib/firebase.ts` / `lib/firebase-admin.ts`** — they carry intentional uncommitted emulator wiring.
- Push with the `Lifewithmo` gh account (`gh auth switch --user Lifewithmo`).
- Cross-lead task reads use per-open-lead parallel fetches. **Never a bare `collectionGroup('tasks')`** — it spans orgs (tenancy leak).
- DatesPanel never writes: hover and pin are local state only.
- Every day chip and bar: `box-sizing: border-box` (Tailwind default `box-border` is fine to state explicitly) and unemphasized chips get `border border-transparent` so bordered variants don't lay out 2px larger.
- Money display: `$` + `toLocaleString()`.
- Commit after every task; commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

| File | Responsibility |
|---|---|
| `components/layout/AdminSidebar.tsx` (modify) | light-shell class swap only |
| `lib/date-window.ts` (create) | window/month/label/bucket math |
| `lib/opportunity-detail.ts` (modify) | `attachmentChips()` gains tasks entry + `danger` flag |
| `lib/calendar.ts` (modify) | `CalendarItem.kind` + `'task'`; pure `calendarRangeItems()` |
| `actions/calendar.ts` (create) | `listCalendarRange` server action |
| `hooks/useDismissable.ts` (modify) | capture trigger at open interaction (carried fix) |
| `components/admin/opportunity/MarkWaitingForm.tsx` (modify) | dedicated dismissal test target; no code change expected beyond what the hook fix needs |
| `components/admin/opportunity/TasksPanel.tsx` (modify) | on-demand composer, `TasksPanelHandle`, one-line empty state |
| `components/admin/opportunity/ActivityTimeline.tsx` (modify) | on-demand note composer, one-line empty state |
| `components/admin/opportunity/AttachmentChips.tsx` (modify) | presentational toggle row (`aria-pressed`, danger hints) |
| `components/admin/opportunity/TasksAndDocuments.tsx` (create) | owns pill selection; renders row + one pane |
| `components/admin/opportunity/DatesPanel.tsx` (create) | ten-day strip, month grid, list, hover/pin |
| `components/admin/OpportunityDetailClient.tsx` (modify) | new column composition; passes panes' data down |
| `components/admin/Lead{Proposals,Invoices,Contracts,Vendors}Client.tsx` (modify) | outer wrapper `p-6 pt-0 max-w-2xl space-y-6` → `space-y-6` (pane provides layout) |
| `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx` (modify) | drop stacked sections; server-load initial window items |

---

### Task 1: Sidebar → light shell

**Files:**
- Modify: `components/layout/AdminSidebar.tsx`
- Test: `__tests__/components/AdminSidebar.test.tsx` (exists — append)

**Interfaces:** none produced; class-only change.

- [ ] **Step 1: Write the failing test** (append):

```tsx
it('renders the light shell', () => {
  renderSidebar()  // reuse the file's existing render helper/props pattern
  const sidebar = screen.getByRole('complementary')
  expect(sidebar).toHaveClass('bg-gray-50')
  expect(sidebar).not.toHaveClass('bg-gray-900')
})
```

(Adapt to the file's existing setup — it already renders the sidebar and asserts classes on the `aside`.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/components/AdminSidebar.test.tsx` → FAIL (has `bg-gray-900`).

- [ ] **Step 3: Implement.** In `components/layout/AdminSidebar.tsx`, exact replacements:

| Find | Replace |
|---|---|
| `bg-gray-900 text-gray-100` (aside, :135) | `bg-gray-50 text-gray-900 border-r border-gray-200` |
| `border-b border-gray-700` (:136) | `border-b border-gray-200` |
| `font-bold text-white text-lg` (:137) | `font-bold text-gray-900 text-lg` |
| `bg-gray-700 text-white` (navClass + exactNavClass active arms, :119/:129) | `bg-gray-100 text-gray-900 border-l-2 border-gray-900` |
| `text-gray-300 hover:bg-gray-700 hover:text-white` (navClass + exactNavClass inactive arms :120/:130, and the Sign out button :237) | `text-gray-600 hover:bg-gray-100 hover:text-gray-900` |
| `text-gray-400 hover:bg-gray-700 hover:text-white` (event back link, :146) | `text-gray-500 hover:bg-gray-100 hover:text-gray-900` |
| `border-t border-gray-700` (:234) | `border-t border-gray-200` |
| `hover:text-gray-300` (settings toggle, :213) | `hover:text-gray-700` |

`Section` label `text-gray-500` stays. No structural change.

- [ ] **Step 4: Run to verify pass** — same command → PASS (whole file).
- [ ] **Step 5: Commit** — `feat(admin): light sidebar shell`

---

### Task 2: Date-window math (`lib/date-window.ts`)

**Files:**
- Create: `lib/date-window.ts`
- Test: `__tests__/lib/date-window.test.ts` (create)

**Interfaces:**
- Consumes: `addDays` from `@/lib/opportunity-detail`; `CalendarItem` type from `@/lib/calendar`.
- Produces (later tasks rely on these exact names):

```ts
export function windowDays(centerYmd: string): string[]            // 10 days: center-5 … center+4
export function rangeLabel(days: string[]): string                 // 'AUG 9 – 18' / 'AUG 30 – SEP 8'
export function daysOutLabel(eventYmd: string | undefined, today: string): string | null
export function monthStartOf(ymd: string): string                  // 'YYYY-MM-01'
export function addMonths(monthStartYmd: string, delta: number): string
export function monthLabel(monthStartYmd: string): string          // 'AUGUST 2026'
export interface MonthCell { ymd: string; inMonth: boolean }
export function monthGrid(monthStartYmd: string): MonthCell[]      // Monday-first full weeks
export function bucketByDay(items: CalendarItem[], days: string[]): Record<string, CalendarItem[]>
export function shortDayLabel(ymd: string): { weekday: string; day: number }  // { weekday: 'S', day: 9 }
export function listDateLabel(ymd: string): string                 // 'Wed Aug 12'
```

- [ ] **Step 1: Write the failing tests:**

```ts
import { describe, it, expect } from 'vitest'
import {
  windowDays, rangeLabel, daysOutLabel, monthStartOf, addMonths,
  monthLabel, monthGrid, bucketByDay, shortDayLabel, listDateLabel,
} from '@/lib/date-window'
import type { CalendarItem } from '@/lib/calendar'

describe('windowDays', () => {
  it('is five before, the center, four after', () => {
    const days = windowDays('2026-08-14')
    expect(days).toHaveLength(10)
    expect(days[0]).toBe('2026-08-09')
    expect(days[5]).toBe('2026-08-14')
    expect(days[9]).toBe('2026-08-18')
  })
  it('crosses month boundaries', () => {
    const days = windowDays('2026-09-04')
    expect(days[0]).toBe('2026-08-30')
    expect(days[9]).toBe('2026-09-08')
  })
})

describe('rangeLabel', () => {
  it('labels same-month and cross-month windows', () => {
    expect(rangeLabel(windowDays('2026-08-14'))).toBe('AUG 9 – 18')
    expect(rangeLabel(windowDays('2026-09-04'))).toBe('AUG 30 – SEP 8')
  })
})

describe('daysOutLabel', () => {
  it('handles future, today, past, and missing dates', () => {
    expect(daysOutLabel('2026-09-04', '2026-08-07')).toBe('28 days out')
    expect(daysOutLabel('2026-08-08', '2026-08-07')).toBe('1 day out')
    expect(daysOutLabel('2026-08-07', '2026-08-07')).toBe('today')
    expect(daysOutLabel('2026-08-04', '2026-08-07')).toBe('3 days ago')
    expect(daysOutLabel(undefined, '2026-08-07')).toBeNull()
  })
})

describe('month math', () => {
  it('finds month start and pages by month', () => {
    expect(monthStartOf('2026-08-14')).toBe('2026-08-01')
    expect(addMonths('2026-08-01', 1)).toBe('2026-09-01')
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
    expect(monthLabel('2026-08-01')).toBe('AUGUST 2026')
  })
  it('builds a Monday-first grid covering August 2026 (Jul 27 – Sep 6)', () => {
    const grid = monthGrid('2026-08-01')
    expect(grid[0]).toEqual({ ymd: '2026-07-27', inMonth: false })
    expect(grid[5]).toEqual({ ymd: '2026-08-01', inMonth: true })
    expect(grid[grid.length - 1]).toEqual({ ymd: '2026-09-06', inMonth: false })
    expect(grid).toHaveLength(42)
  })
})

describe('bucketByDay', () => {
  it('buckets by the date part, only for the given days', () => {
    const items = [
      { id: 'e1', title: 'Gala', date: '2026-08-12', kind: 'event', href: '#' },
      { id: 't1', title: 'Call', date: '2026-08-12', kind: 'task', href: '#' },
      { id: 'e2', title: 'Out of window', date: '2026-08-25T18:00:00.000Z', kind: 'event', href: '#' },
    ] as CalendarItem[]
    const buckets = bucketByDay(items, windowDays('2026-08-14'))
    expect(buckets['2026-08-12'].map((i) => i.id)).toEqual(['e1', 't1'])
    expect(buckets['2026-08-25']).toBeUndefined()
  })
})

describe('labels', () => {
  it('formats day cells and list dates', () => {
    expect(shortDayLabel('2026-08-09')).toEqual({ weekday: 'S', day: 9 })   // Sunday
    expect(shortDayLabel('2026-08-10')).toEqual({ weekday: 'M', day: 10 })
    expect(listDateLabel('2026-08-12')).toBe('Wed Aug 12')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/lib/date-window.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `lib/date-window.ts`:

```ts
import { addDays } from '@/lib/opportunity-detail'
import type { CalendarItem } from '@/lib/calendar'

const MONTHS_UP = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const MONTHS_FULL = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
const MONTHS_LIST = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']          // getUTCDay order
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d }
}

function utcDay(ymd: string): number {
  return new Date(`${ymd}T00:00:00.000Z`).getUTCDay()
}

/** The ten-day availability window: five days before the center, the center, four after. */
export function windowDays(centerYmd: string): string[] {
  return Array.from({ length: 10 }, (_, i) => addDays(centerYmd, i - 5))
}

export function rangeLabel(days: string[]): string {
  const a = parts(days[0])
  const b = parts(days[days.length - 1])
  const left = `${MONTHS_UP[a.m - 1]} ${a.d}`
  return a.m === b.m && a.y === b.y ? `${left} – ${b.d}` : `${left} – ${MONTHS_UP[b.m - 1]} ${b.d}`
}

export function daysOutLabel(eventYmd: string | undefined, today: string): string | null {
  if (!eventYmd) return null
  const diff = Math.round(
    (Date.parse(`${eventYmd}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000
  )
  if (diff === 0) return 'today'
  if (diff > 0) return `${diff} day${diff === 1 ? '' : 's'} out`
  return `${-diff} day${diff === -1 ? '' : 's'} ago`
}

export function monthStartOf(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`
}

export function addMonths(monthStartYmd: string, delta: number): string {
  const { y, m } = parts(monthStartYmd)
  const zero = y * 12 + (m - 1) + delta
  const ny = Math.floor(zero / 12)
  const nm = (zero % 12 + 12) % 12
  return `${ny}-${String(nm + 1).padStart(2, '0')}-01`
}

export function monthLabel(monthStartYmd: string): string {
  const { y, m } = parts(monthStartYmd)
  return `${MONTHS_FULL[m - 1]} ${y}`
}

export interface MonthCell { ymd: string; inMonth: boolean }

/** Monday-first full weeks covering the month (adjacent-month fill days included). */
export function monthGrid(monthStartYmd: string): MonthCell[] {
  const month = monthStartYmd.slice(0, 7)
  const monthEnd = addDays(addMonths(monthStartYmd, 1), -1)
  const gridStart = addDays(monthStartYmd, -((utcDay(monthStartYmd) + 6) % 7))
  const gridEnd = addDays(monthEnd, 6 - ((utcDay(monthEnd) + 6) % 7))
  const cells: MonthCell[] = []
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    cells.push({ ymd: d, inMonth: d.slice(0, 7) === month })
  }
  return cells
}

/** Items keyed by YYYY-MM-DD, restricted to the given days. */
export function bucketByDay(items: CalendarItem[], days: string[]): Record<string, CalendarItem[]> {
  const wanted = new Set(days)
  const buckets: Record<string, CalendarItem[]> = {}
  for (const item of items) {
    const day = item.date.slice(0, 10)
    if (!wanted.has(day)) continue
    ;(buckets[day] ??= []).push(item)
  }
  return buckets
}

export function shortDayLabel(ymd: string): { weekday: string; day: number } {
  return { weekday: WEEKDAY_INITIALS[utcDay(ymd)], day: parts(ymd).d }
}

export function listDateLabel(ymd: string): string {
  const { m, d } = parts(ymd)
  return `${WEEKDAYS_SHORT[utcDay(ymd)]} ${MONTHS_LIST[m - 1]} ${d}`
}
```

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `feat(crm): date-window math for the dates panel`

---

### Task 3: Tasks chip + danger flag in `attachmentChips()`

**Files:**
- Modify: `lib/opportunity-detail.ts` (`AttachmentChip` :136-163)
- Test: `__tests__/lib/opportunity-detail.test.ts` (exists — append)

**Interfaces:**
- Produces: `AttachmentChip.kind` gains `'task'`; `AttachmentChip.danger?: boolean`; `attachmentChips()` input gains `tasks: Task[]` and `today: string`, returns the tasks chip **first**.

- [ ] **Step 1: Write the failing tests** (append; reuse the file's existing fixture style):

```ts
describe('attachmentChips tasks entry', () => {
  const task = (over: Partial<Task>): Task => ({
    id: 't1', lead_id: 'l1', title: 'Call', done: false, created_at: '2026-08-01T00:00:00.000Z', ...over,
  } as Task)
  const base = { proposals: [], invoices: [], contracts: [], vendors: [], today: '2026-08-07' }

  it('leads with a Tasks chip counting open tasks', () => {
    const chips = attachmentChips({ ...base, tasks: [task({}), task({ id: 't2', done: true })] })
    expect(chips[0]).toMatchObject({ kind: 'task', label: 'Tasks', count: 1 })
  })
  it('flags overdue tasks as danger', () => {
    const chips = attachmentChips({ ...base, tasks: [task({ due_date: '2026-08-05' })] })
    expect(chips[0]).toMatchObject({ hint: '1 overdue', danger: true })
  })
  it('hints the next due date when nothing is overdue', () => {
    const chips = attachmentChips({ ...base, tasks: [task({ due_date: '2026-08-09' }), task({ id: 't2', due_date: '2026-08-12' })] })
    expect(chips[0]).toMatchObject({ hint: 'next due Aug 9' })
    expect(chips[0].danger).toBeUndefined()
  })
  it('marks unsigned contracts and unpaid invoices as danger', () => {
    const chips = attachmentChips({ ...base, tasks: [], contracts: [{ status: 'sent' } as Contract] })
    const contracts = chips.find((c) => c.kind === 'contract')!
    expect(contracts).toMatchObject({ hint: 'unsigned', danger: true })
  })
})
```

(Add `Task`/`Contract` to the test file's type imports.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** In `lib/opportunity-detail.ts`, extend the interface and function:

```ts
export interface AttachmentChip {
  kind: 'task' | 'proposal' | 'invoice' | 'contract' | 'vendor'
  label: string
  count: number
  hint?: string
  danger?: boolean
}

export function attachmentChips(i: {
  tasks: Task[]
  proposals: Proposal[]
  invoices: Invoice[]
  contracts: Contract[]
  vendors: Vendor[]
  today: string
}): AttachmentChip[] {
```

Tasks entry, computed first (import `Task` type; reuse `MONTHS_LIST`-style formatting via `listDateLabel`? No — keep this file dependency-free of `lib/date-window`; format inline as below):

```ts
  const openTasks = i.tasks.filter((t) => !t.done)
  const overdue = openTasks.filter((t) => t.due_date && t.due_date < i.today).length
  const dated = openTasks.filter((t) => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))
  const shortDue = (ymd: string) => {
    const [, m, d] = ymd.split('-').map(Number)
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]} ${d}`
  }
  const tasksChip: AttachmentChip = {
    kind: 'task', label: 'Tasks', count: openTasks.length,
    ...(overdue
      ? { hint: `${overdue} overdue`, danger: true }
      : dated.length ? { hint: `next due ${shortDue(dated[0].due_date!)}` } : {}),
  }
```

Return `[tasksChip, ...existing four]`, and set `danger: true` on the contract chip when its hint is `'unsigned'` and on the invoice chip when its hint ends in `'unpaid'` (i.e. when `outstanding > 0`). Update the one existing call site (`page.tsx`) minimally to pass `tasks` and `today: todayYmd()` so the build stays green — Task 7 restructures it properly.

- [ ] **Step 4: Run to verify pass** — `npx vitest run __tests__/lib/opportunity-detail.test.ts`, then `npx vitest run --exclude '**/.claude/**'` (the `AttachmentChips` component compiles against the new shape — fix its props usage if the suite catches it; the component is rewritten in Task 7 anyway).
- [ ] **Step 5: Commit** — `feat(crm): tasks entry + danger flag on attachment chips`

---

### Task 4: Calendar range — kind `'task'`, pure assembly, server action

**Files:**
- Modify: `lib/calendar.ts`
- Create: `actions/calendar.ts`
- Test: `__tests__/lib/calendar.test.ts` (exists — append; check the current fixture style first)

**Interfaces:**
- Consumes: `buildCalendar(orgSlug, events, leads)` (existing, unchanged signature); `OPEN_STAGES` from `@/lib/leads`; `tasksRef` helper in `lib/crm/tasks.ts`; `listLeadsCore` from `@/lib/crm/leads`; the events fetch used by `actions/events.ts:listEvents` (reuse its core/collection — read that file and match it).
- Produces:

```ts
// lib/calendar.ts
export interface CalendarItem { id: string; title: string; date: string; kind: 'event' | 'lead' | 'task'; href: string }
export function calendarRangeItems(
  orgSlug: string,
  events: Event[],
  leads: Lead[],
  leadTasks: Array<{ lead: Lead; tasks: Task[] }>,
  fromYmd: string,
  toYmd: string
): CalendarItem[]

// actions/calendar.ts ('use server')
export async function listCalendarRange(orgId: string, orgSlug: string, fromYmd: string, toYmd: string): Promise<CalendarItem[]>
```

- [ ] **Step 1: Write the failing tests** (append):

```ts
import { calendarRangeItems } from '@/lib/calendar'

describe('calendarRangeItems', () => {
  const event = (over: Partial<Event>): Event => ({
    id: 'e1', name: 'Gala', slug: 'gala', event_start: '2026-08-12', ...over,
  } as Event)
  const lead = (over: Partial<Lead>): Lead => ({
    id: 'l1', name: 'Dana', stage: 'consultation', created_at: '2026-07-01T00:00:00.000Z', ...over,
  } as Lead)
  const task = (over: Partial<Task>): Task => ({
    id: 't1', lead_id: 'l1', title: 'Site visit', done: false, created_at: '2026-08-01T00:00:00.000Z', ...over,
  } as Task)

  it('merges events, tentative leads, and dated open tasks inside the range, sorted', () => {
    const l = lead({ event_date: '2026-08-15' })
    const items = calendarRangeItems('demo', [event({})], [l],
      [{ lead: l, tasks: [task({ due_date: '2026-08-10' })] }], '2026-08-09', '2026-08-18')
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['task:t1', 'event:e1', 'lead:l1'])
    expect(items[0].href).toBe('/demo/leads/l1')
  })
  it('excludes items outside the range, done tasks, undated tasks, and scheduled leads', () => {
    const scheduled = lead({ id: 'l2', event_date: '2026-08-15' })
    const items = calendarRangeItems('demo',
      [event({ event_start: '2026-08-25' }), event({ id: 'e2', lead_id: 'l2', event_start: '2026-08-15' })],
      [scheduled],
      [{ lead: scheduled, tasks: [task({ done: true, due_date: '2026-08-10' }), task({ id: 't2' })] }],
      '2026-08-09', '2026-08-18')
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['event:e2'])
  })
})
```

(Add `Event`/`Task` to imports; match the existing test file's fixture idioms.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** In `lib/calendar.ts`: widen the `kind` union to `'event' | 'lead' | 'task'` and add:

```ts
/** Everything on the calendar in [fromYmd, toYmd]: booked events, tentative
 *  (unconverted) opportunity dates, and open dated tasks. Range compares the
 *  ISO date part, inclusive. */
export function calendarRangeItems(
  orgSlug: string,
  events: Event[],
  leads: Lead[],
  leadTasks: Array<{ lead: Lead; tasks: Task[] }>,
  fromYmd: string,
  toYmd: string
): CalendarItem[] {
  const inRange = (date: string) => {
    const d = date.slice(0, 10)
    return d >= fromYmd && d <= toYmd
  }
  const items = buildCalendar(orgSlug, events, leads).filter((i) => inRange(i.date))
  for (const { lead, tasks } of leadTasks) {
    for (const t of tasks) {
      if (t.done || !t.due_date || !inRange(t.due_date)) continue
      items.push({ id: t.id, title: t.title, date: t.due_date, kind: 'task', href: `/${orgSlug}/leads/${lead.id}` })
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date))
}
```

`actions/calendar.ts` (`'use server'`): `assertOrgMember(orgId)`; fetch all events the same way `actions/events.ts:listEvents` does (read it; reuse its core helper if one exists, else the same collection query); `listLeadsCore(orgId)`; filter leads to `OPEN_STAGES` and fetch each open lead's tasks in parallel from the tasks subcollection helper in `lib/crm/tasks.ts`; return `calendarRangeItems(orgSlug, events, leads, openLeadTasks, fromYmd, toYmd)`. No type re-exports.

- [ ] **Step 4: Run to verify pass** — `npx vitest run __tests__/lib/calendar.test.ts`.
- [ ] **Step 5: Commit** — `feat(crm): calendar range assembly + listCalendarRange action`

---

### Task 5: `useDismissable` trigger capture (carried fix from PR #63)

**Files:**
- Modify: `hooks/useDismissable.ts`
- Modify: callers only if the signature forces it (it does not — see below)
- Test: `__tests__/components/opportunity/mark-waiting-form.test.tsx` (create)

**Interfaces:**
- Produces: same hook signature. Behavior change: the focus-return target is captured on the open *transition* using the pointer/keyboard event target, not `document.activeElement` at effect time.

**The bug:** `MarkWaitingForm`'s panel `<Input autoFocus …>` steals focus during React's commit phase, *before* the hook's effect captures `document.activeElement` — so focus "returns" to the dead input, not the trigger.

- [ ] **Step 1: Write the failing test:**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkWaitingForm } from '@/components/admin/opportunity/MarkWaitingForm'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/actions/leads', () => ({ setLeadWaiting: vi.fn() }))

describe('MarkWaitingForm dismissal', () => {
  it('closes on Escape and returns focus to the trigger despite the autoFocus input', async () => {
    const user = userEvent.setup()
    render(<MarkWaitingForm orgId="o1" leadId="l1" />)
    const trigger = screen.getByRole('button', { name: 'Mark as waiting' })
    await user.click(trigger)
    expect(screen.getByPlaceholderText('Waiting on…')).toHaveFocus()  // autoFocus won
    await user.keyboard('{Escape}')
    expect(screen.queryByPlaceholderText('Waiting on…')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
  it('closes on outside pointerdown', async () => {
    const user = userEvent.setup()
    render(<div><MarkWaitingForm orgId="o1" leadId="l1" /><button>outside</button></div>)
    await user.click(screen.getByRole('button', { name: 'Mark as waiting' }))
    await user.click(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByPlaceholderText('Waiting on…')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure** — the Escape test fails on `expect(trigger).toHaveFocus()`.

- [ ] **Step 3: Implement.** In `hooks/useDismissable.ts`, capture the trigger from the last interaction *before* the open commit instead of reading `document.activeElement` after it:

```ts
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    // Capture synchronously on the open transition would still lose to autoFocus,
    // which runs during commit — so remember the element that was focused *before*
    // this open began: the focusin that most recently preceded the effect.
    ...
```

Concretely: add a module-scoped listener-free approach — track the last pointerdown/keydown target at the document level *inside the hook while closed*:

```ts
export function useDismissable<T extends HTMLElement>(
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
  containerRef: RefObject<T | null>
) {
  const triggerRef = useRef<HTMLElement | null>(null)

  // While closed, remember what would become the trigger: the container's
  // focused descendant (the trigger button lives inside the container).
  useEffect(() => {
    if (open) return
    function remember(e: FocusEvent) {
      if (containerRef.current?.contains(e.target as Node)) {
        triggerRef.current = e.target as HTMLElement
      }
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [open, containerRef])

  useEffect(() => {
    if (!open) return
    // Fallback for programmatic opens (no prior focus inside the container).
    triggerRef.current ??= document.activeElement as HTMLElement | null

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
      triggerRef.current?.focus()
    }
  }, [open, setOpen, containerRef])
}
```

This keeps the public signature identical; all four existing callers are untouched. The hook's doc comment updates to describe the focusin capture. Keep the existing dismissal tests green (`__tests__/components/opportunity/mark-lost-dialog.test.tsx`).

- [ ] **Step 4: Run to verify pass** — `npx vitest run __tests__/components/opportunity/mark-waiting-form.test.tsx __tests__/components/opportunity/mark-lost-dialog.test.tsx`.
- [ ] **Step 5: Commit** — `fix(crm): popover focus-return survives autoFocus inputs`

---

### Task 6: On-demand composers + one-line empty states

**Files:**
- Modify: `components/admin/opportunity/TasksPanel.tsx`
- Modify: `components/admin/opportunity/ActivityTimeline.tsx`
- Test: `__tests__/components/opportunity/tasks-panel.test.tsx` (create; if an existing TasksPanel test exists, append there instead — check first)

**Interfaces:**
- Produces: `TasksPanel` ref type changes from `HTMLInputElement` to:

```ts
export interface TasksPanelHandle { openComposer(): void }
export const TasksPanel = forwardRef<TasksPanelHandle, TasksPanelProps>(…)
```

- Consumers updated in this task: `components/admin/OpportunityDetailClient.tsx` compiles against the new ref type — change its `taskInputRef` to `useRef<TasksPanelHandle>(null)` and its two call sites (`?focus=task` effect and `NextActionBanner onAddNextStep`) to `taskInputRef.current?.openComposer()`. (Task 7 moves where the panel renders; this task only keeps types/behavior sound.)

- [ ] **Step 1: Write the failing tests:**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TasksPanel, type TasksPanelHandle } from '@/components/admin/opportunity/TasksPanel'
import type { Task } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/actions/tasks', () => ({ createTask: vi.fn(), completeTask: vi.fn() }))

const task = (over: Partial<Task>): Task => ({
  id: 't1', lead_id: 'l1', title: 'Site visit', done: false, created_at: '2026-08-01T00:00:00.000Z', ...over,
} as Task)

describe('TasksPanel composer', () => {
  it('renders a one-line empty state with an inline action when there are no tasks', () => {
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[]} />)
    expect(screen.getByText(/No tasks/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Add a task…')).not.toBeInTheDocument()
  })
  it('opens the composer on demand and focuses the input', async () => {
    const user = userEvent.setup()
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[task({})]} />)
    expect(screen.queryByPlaceholderText('Add a task…')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add a task' }))
    expect(screen.getByPlaceholderText('Add a task…')).toHaveFocus()
  })
  it('opens the composer via the imperative handle', () => {
    const ref = createRef<TasksPanelHandle>()
    render(<TasksPanel ref={ref} orgId="o1" leadId="l1" tasks={[]} />)
    ref.current!.openComposer()
    expect(screen.getByPlaceholderText('Add a task…')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.**

`TasksPanel.tsx`: add `composerOpen` state and an internal `inputRef`; `useImperativeHandle(ref, () => ({ openComposer: () => setComposerOpen(true) }))`; an effect focuses `inputRef` when `composerOpen` flips true. Rendering:

- `tasks.length === 0 && !composerOpen` → no Card, one line:
  `<p className="text-sm text-muted-foreground">No tasks — <Button variant="link" className="h-auto p-0" onClick={() => setComposerOpen(true)}>Add a task</Button> to give this deal a next step.</p>`
  (Match the accessible name `Add a task` used in the test.)
- Otherwise the existing Card; the composer row (`Input placeholder="Add a task…"` + date input + Add button) renders only when `composerOpen`, replaced otherwise by a ghost `<Button variant="ghost" size="sm">Add a task</Button>`.
- Collapse on blur when empty: on the composer container `onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node) && !title.trim() && !due) setComposerOpen(false) }}`.
- Keep `handleAdd`/`handleComplete` unchanged; keep the input's placeholder exactly `Add a task…`.

`ActivityTimeline.tsx`: same pattern for the note composer — a `composerOpen` state, `<Button variant="ghost" size="sm">Add a note</Button>` affordance, textarea (placeholder `Add a note…`) autofocused when opened, collapse on blur-empty. Empty activity list renders one muted line `No activity yet.` inside the card body instead of an empty list block.

`OpportunityDetailClient.tsx`: swap `useRef<HTMLInputElement>` → `useRef<TasksPanelHandle>(null)` (import the type), and both `.focus()` call sites → `.openComposer()`.

- [ ] **Step 4: Run to verify pass** — new test file, then the whole suite (`npx vitest run --exclude '**/.claude/**'`) since `OpportunityDetailClient` tests may touch the ref.
- [ ] **Step 5: Commit** — `feat(crm): on-demand composers + one-line empty states`

---

### Task 7: Tasks & documents pill row

**Files:**
- Modify: `components/admin/opportunity/AttachmentChips.tsx` (presentational toggle row)
- Create: `components/admin/opportunity/TasksAndDocuments.tsx`
- Modify: `components/admin/OpportunityDetailClient.tsx` (left column composition; new props)
- Modify: `components/admin/Lead{Proposals,Invoices,Contracts,Vendors}Client.tsx` (outer `p-6 pt-0 max-w-2xl space-y-6` → `space-y-6`)
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx` (drop stacked sections)
- Test: `__tests__/components/opportunity/tasks-and-documents.test.tsx` (create)

**Interfaces:**
- Consumes: `attachmentChips` (Task 3 shape), `TasksPanel`/`TasksPanelHandle` (Task 6), the four `Lead*Client` components with their current props (`LeadInvoicesClient` needs `acceptedProposals: { id: string; title: string }[]`), `todayYmd`.
- Produces:

```ts
// TasksAndDocuments.tsx ('use client')
interface TasksAndDocumentsProps {
  orgId: string
  orgSlug: string
  leadId: string
  tasks: Task[]
  proposals: Proposal[]
  invoices: Invoice[]
  contracts: Contract[]
  vendors: Vendor[]
  acceptedProposals: { id: string; title: string }[]
  tasksPanelRef?: React.Ref<TasksPanelHandle>
}
// AttachmentChips.tsx becomes:
interface AttachmentChipsProps {
  chips: AttachmentChip[]
  selected: AttachmentChip['kind']
  onSelect: (kind: AttachmentChip['kind']) => void
}
```

`OpportunityDetailClient` props gain `proposals`, `invoices`, `contracts`, `vendors`, `acceptedProposals` (same types as above).

- [ ] **Step 1: Write the failing test:**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TasksAndDocuments } from '@/components/admin/opportunity/TasksAndDocuments'
import type { Contract, Task } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/demo/leads/l1' }))
vi.mock('@/actions/tasks', () => ({ createTask: vi.fn(), completeTask: vi.fn() }))

const base = {
  orgId: 'o1', orgSlug: 'demo', leadId: 'l1',
  tasks: [] as Task[], proposals: [], invoices: [],
  contracts: [{ id: 'c1', status: 'sent' } as Contract], vendors: [], acceptedProposals: [],
}

describe('TasksAndDocuments', () => {
  it('renders the pill row with Tasks selected by default and one pane open', () => {
    render(<TasksAndDocuments {...base} />)
    expect(screen.getByText('Tasks & documents')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tasks/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Contracts/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/No tasks/)).toBeInTheDocument()          // Tasks pane
    expect(screen.queryByText(/New contract/i)).not.toBeInTheDocument() // Contracts pane closed
  })
  it('switches panes and keeps only one open', async () => {
    const user = userEvent.setup()
    render(<TasksAndDocuments {...base} />)
    await user.click(screen.getByRole('button', { name: /Contracts/ }))
    expect(screen.getByRole('button', { name: /Contracts/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Tasks/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(/No tasks/)).not.toBeInTheDocument()
  })
  it('shows danger hints in the destructive color', () => {
    render(<TasksAndDocuments {...base} />)
    expect(screen.getByText('· unsigned')).toHaveClass('text-destructive')
  })
})
```

(If the Contracts pane's mounted content needs more mocks — check `LeadContractsClient`'s imports and mock its actions the same way; adjust the "pane closed" assertion to any stable text that pane renders.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.**

`AttachmentChips.tsx` — presentational toggle row:

```tsx
'use client'

import type { AttachmentChip } from '@/lib/opportunity-detail'

interface AttachmentChipsProps {
  chips: AttachmentChip[]
  selected: AttachmentChip['kind']
  onSelect: (kind: AttachmentChip['kind']) => void
}

export function AttachmentChips({ chips, selected, onSelect }: AttachmentChipsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Tasks & documents">
      {chips.map((c) => (
        <button
          key={c.kind}
          type="button"
          aria-pressed={selected === c.kind}
          onClick={() => onSelect(c.kind)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
            selected === c.kind
              ? 'border-foreground bg-foreground text-background'
              : c.count === 0
                ? 'border-border text-muted-foreground hover:bg-muted/50'
                : 'border-border bg-muted/50 hover:bg-muted'
          }`}
        >
          <span className="font-medium">{c.label}</span>
          <span>{c.count}</span>
          {c.hint && (
            <span className={c.danger && selected !== c.kind ? 'text-destructive' : selected === c.kind ? '' : 'text-muted-foreground'}>
              · {c.hint}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
```

(The danger-hint test asserts on the `· unsigned` span — keep hint text and the `·` in one span so `getByText('· unsigned')` matches.)

`TasksAndDocuments.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { attachmentChips, todayYmd, type AttachmentChip } from '@/lib/opportunity-detail'
import { AttachmentChips } from '@/components/admin/opportunity/AttachmentChips'
import { TasksPanel, type TasksPanelHandle } from '@/components/admin/opportunity/TasksPanel'
import { LeadProposalsClient } from '@/components/admin/LeadProposalsClient'
import { LeadInvoicesClient } from '@/components/admin/LeadInvoicesClient'
import { LeadContractsClient } from '@/components/admin/LeadContractsClient'
import { LeadVendorsClient } from '@/components/admin/LeadVendorsClient'
import type { Contract, Invoice, Proposal, Task, Vendor } from '@/lib/types'

interface TasksAndDocumentsProps { /* as in Interfaces block above */ }

export function TasksAndDocuments({ orgId, orgSlug, leadId, tasks, proposals, invoices, contracts, vendors, acceptedProposals, tasksPanelRef }: TasksAndDocumentsProps) {
  const [selected, setSelected] = useState<AttachmentChip['kind']>('task')
  const chips = attachmentChips({ tasks, proposals, invoices, contracts, vendors, today: todayYmd() })
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Tasks & documents</h2>
      <AttachmentChips chips={chips} selected={selected} onSelect={setSelected} />
      {selected === 'task' && <TasksPanel ref={tasksPanelRef} orgId={orgId} leadId={leadId} tasks={tasks} />}
      {selected === 'proposal' && <LeadProposalsClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} proposals={proposals} />}
      {selected === 'invoice' && <LeadInvoicesClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} invoices={invoices} acceptedProposals={acceptedProposals} />}
      {selected === 'contract' && <LeadContractsClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} contracts={contracts} />}
      {selected === 'vendor' && <LeadVendorsClient orgId={orgId} leadId={leadId} vendors={vendors} />}
    </div>
  )
}
```

Four `Lead*Client` files: change the outer wrapper div class `p-6 pt-0 max-w-2xl space-y-6` → `space-y-6` (verify each file's exact class string first; only the width/padding comes off).

`OpportunityDetailClient.tsx`: add the five new props; left column becomes ContactCard strip → FactsGrid → `<TasksAndDocuments … tasksPanelRef={taskInputRef} />` → ConvertToWorkCard; right column keeps only `ActivityTimeline` for now (DatesPanel arrives in Task 8). The `?focus=task` effect and `onAddNextStep` already call `openComposer()` (Task 6); since Tasks is the default pane no pane-switching is needed for them — but reset `selected` isn't reachable from here, so pass nothing extra: the default covers it.

`page.tsx`: delete the `Attachments` heading block, the `AttachmentChips` usage, and the four stacked `Lead*Client` renders + their imports (keep `ClientPortalLinkClient`); pass `proposals`, `invoices`, `contracts`, `vendors`, `acceptedProposals` into `OpportunityDetailClient`.

- [ ] **Step 4: Run to verify pass** — new test file, then full suite.
- [ ] **Step 5: Commit** — `feat(crm): tasks & documents pill row replaces stacked sections`

---

### Task 8: DatesPanel

**Files:**
- Create: `components/admin/opportunity/DatesPanel.tsx`
- Modify: `components/admin/OpportunityDetailClient.tsx` (right column: DatesPanel above ActivityTimeline; new props)
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx` (server-load initial window items)
- Test: `__tests__/components/opportunity/dates-panel.test.tsx` (create)

**Interfaces:**
- Consumes: everything from `lib/date-window.ts` (Task 2); `listCalendarRange(orgId, orgSlug, fromYmd, toYmd)` (Task 4); `todayYmd` from `@/lib/opportunity-detail`.
- Produces:

```ts
interface DatesPanelProps {
  orgId: string
  orgSlug: string
  lead: Lead
  today: string                 // todayYmd() from the server render
  initialItems: CalendarItem[]  // items covering the initial window
}
```

`OpportunityDetailClient` props gain `today: string` and `calendarItems: CalendarItem[]`.

- [ ] **Step 1: Write the failing tests:**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatesPanel } from '@/components/admin/opportunity/DatesPanel'
import type { CalendarItem } from '@/lib/calendar'
import type { Lead } from '@/lib/types'

const listCalendarRange = vi.hoisted(() => vi.fn(async () => []))
vi.mock('@/actions/calendar', () => ({ listCalendarRange }))

const lead = { id: 'l1', name: 'Dana', stage: 'consultation', event_date: '2026-09-04', created_at: '2026-07-01T00:00:00.000Z' } as Lead
const items: CalendarItem[] = [
  { id: 'e1', title: 'Mission Co-op', date: '2026-09-02', kind: 'event', href: '/demo/gala/dashboard' },
  { id: 'l9', title: 'Farmers market stall', date: '2026-09-05', kind: 'lead', href: '/demo/leads/l9' },
  { id: 't1', title: 'Call venue', date: '2026-09-03', kind: 'task', href: '/demo/leads/l1' },
]

function renderPanel() {
  return render(<DatesPanel orgId="o1" orgSlug="demo" lead={lead} today="2026-08-07" initialItems={items} />)
}

describe('DatesPanel', () => {
  it('renders the event-centred window, distance, and list', () => {
    renderPanel()
    expect(screen.getByText('Dates')).toBeInTheDocument()
    expect(screen.getByText('28 days out')).toBeInTheDocument()
    expect(screen.getByText('AUG 30 – SEP 8')).toBeInTheDocument()
    expect(screen.getByText(/Mission Co-op/)).toBeInTheDocument()      // event line
    expect(screen.getByText(/Farmers market stall/)).toBeInTheDocument() // tentative line
    expect(screen.getByText('1 task across the window')).toBeInTheDocument()
  })
  it('opens the month grid beneath the strip', async () => {
    const user = userEvent.setup()
    renderPanel()
    expect(screen.queryByText('SEPTEMBER 2026')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Toggle month' }))
    expect(screen.getByText('SEPTEMBER 2026')).toBeInTheDocument()
  })
  it('hover previews, mouse-leave restores, click pins, Escape unpins', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Toggle month' }))
    const day14 = screen.getByRole('button', { name: 'Sep 14' })
    fireEvent.mouseEnter(day14)
    expect(screen.getByText('previewing Sep 14')).toBeInTheDocument()
    expect(screen.getByText('SEP 9 – 18')).toBeInTheDocument()
    fireEvent.mouseLeave(day14)
    expect(screen.getByText('AUG 30 – SEP 8')).toBeInTheDocument()
    fireEvent.mouseEnter(day14)
    fireEvent.click(day14)                       // pin
    fireEvent.mouseLeave(day14)
    expect(screen.getByText('SEP 9 – 18')).toBeInTheDocument()   // pinned survives leave
    await user.keyboard('{Escape}')
    expect(screen.getByText('AUG 30 – SEP 8')).toBeInTheDocument()
  })
  it('slides the strip and fetches the uncovered range', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Later dates' }))
    expect(screen.getByText('SEP 9 – 18')).toBeInTheDocument()
    expect(listCalendarRange).toHaveBeenCalledWith('o1', 'demo', expect.any(String), expect.any(String))
  })
})
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** `DatesPanel.tsx` (`'use client'`). Complete structure:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { listCalendarRange } from '@/actions/calendar'
import {
  windowDays, rangeLabel, daysOutLabel, monthStartOf, addMonths,
  monthLabel, monthGrid, bucketByDay, shortDayLabel, listDateLabel,
} from '@/lib/date-window'
import { addDays } from '@/lib/opportunity-detail'
import type { CalendarItem } from '@/lib/calendar'
import type { Lead } from '@/lib/types'

interface DatesPanelProps { /* as in Interfaces block */ }

export function DatesPanel({ orgId, orgSlug, lead, today, initialItems }: DatesPanelProps) {
  const homeCenter = lead.event_date ?? today
  const [center, setCenter] = useState(homeCenter)      // moved by arrows and by pinning
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [monthOpen, setMonthOpen] = useState(false)
  const [monthStart, setMonthStart] = useState(monthStartOf(homeCenter))
  const [items, setItems] = useState<CalendarItem[]>(initialItems)
  // One contiguous covered range; grow it as the user pages/hovers beyond it.
  const covered = useRef({ from: windowDays(homeCenter)[0], to: windowDays(homeCenter)[9] })

  const displayCenter = pinned ? center : hovered ?? center
  const days = windowDays(displayCenter)
  const buckets = bucketByDay(items, days)
  const previewing = pinned || hovered != null

  async function ensureRange(from: string, to: string) {
    const c = covered.current
    if (from >= c.from && to <= c.to) return
    const newFrom = from < c.from ? from : c.from
    const newTo = to > c.to ? to : c.to
    covered.current = { from: newFrom, to: newTo }
    const fetched = await listCalendarRange(orgId, orgSlug, newFrom, newTo)
    setItems((prev) => {
      const seen = new Set(fetched.map((i) => `${i.kind}:${i.id}`))
      return [...fetched, ...prev.filter((i) => !seen.has(`${i.kind}:${i.id}`))]
    })
  }

  useEffect(() => { void ensureRange(days[0], days[9]) }, [days[0], days[9]])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pinned) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setPinned(false); setCenter(homeCenter); setHovered(null) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pinned, homeCenter])

  function pinDay(ymd: string) {
    if (pinned && ymd === center) { setPinned(false); setCenter(homeCenter) }
    else { setPinned(true); setCenter(ymd) }
    setHovered(null)
  }
  …
}
```

Rendering, top to bottom (all day chips/bars `box-border`; unemphasized chips `border border-transparent`):

1. **Header row:** `<span className="text-sm font-semibold">Dates</span>`; right side: `previewing` → `<span className="text-xs font-medium text-destructive">previewing {listDateLabel(displayCenter).slice(4)}</span>` — use `listDateLabel` minus the weekday, i.e. build `'Sep 14'` via the same month-short + day formatting (`previewing Sep 14` exactly, to match the test) — else `daysOutLabel(lead.event_date, today)` in muted text (omit when null).
2. **Strip controls row:** caret `<button aria-label="Toggle month" aria-expanded={monthOpen} onClick={() => setMonthOpen((v) => !v)}>▾</button>`; range label `<span className={previewing ? 'text-destructive' : ''}>{rangeLabel(days)}</span>`; `<button aria-label="Earlier dates" onClick={() => { setCenter(addDays(center, -10)); setPinned(false) }}>←</button>` and `<button aria-label="Later dates" onClick={() => { setCenter(addDays(center, 10)); setPinned(false) }}>→</button>`.
3. **Ten-day strip:** `grid grid-cols-10`; each column: weekday initial (`shortDayLabel(d).weekday`, muted 10px), the day-number chip (filled `bg-foreground text-background` when `d === lead.event_date`; outlined `border-foreground` when `d === displayCenter && previewing`; otherwise `border border-transparent`), then stacked bars from `buckets[d]`: kind `event` → `h-6 w-full rounded-sm bg-foreground`, kind `lead` → `h-6 w-full rounded-sm border border-dashed border-foreground box-border`, kind `task` → `h-1.5 w-full rounded-sm bg-muted-foreground/40`.
4. **Month grid** (when `monthOpen`), rendered *after* the strip in the DOM: header `{monthLabel(monthStart)}` + `←`/`→` (`aria-label="Previous month"`/`"Next month"`, `setMonthStart(addMonths(monthStart, ±1))`); weekday header row `M T W T F S S`; `grid grid-cols-7` of `monthGrid(monthStart)` cells — each an inline `<button aria-label={listDateLabel(cell.ymd).slice(4)}>` — accessible name must be e.g. `Sep 14`, so compute `'Sep 14'`-style label (month-short + day) for `aria-label` — with `onMouseEnter={() => !pinned && setHovered(cell.ymd)}`, `onMouseLeave={() => !pinned && setHovered(null)}`, `onClick={() => pinDay(cell.ymd)}`; muted text when `!cell.inMonth`; shaded `bg-muted` when the cell is in the current `days` window; `border border-transparent box-border` baseline.
5. **List:** items in the window sorted by date — `event`/`lead` kinds each one line: `<Link href={item.href}>` with `{listDateLabel(date)} — {title}` and a muted second span `Booked` / `Tentative`; `task` kinds aggregate to one muted line `{n} task{n === 1 ? '' : 's'} across the window` (omit when 0). Empty window: one muted line `Nothing on the calendar in this window.`

Wrap in `Card`/`CardContent`. Expanding the month must not move the strip (it renders below).

`page.tsx`: compute `const today = todayYmd()`, `const center = lead.event_date ?? today`, `const win = windowDays(center)`, fetch `const calendarItems = await listCalendarRange(orgId, orgSlug, win[0], win[9])` inside the existing `Promise.all`, and pass `today` + `calendarItems` into `OpportunityDetailClient`.

`OpportunityDetailClient.tsx`: right column becomes `<DatesPanel orgId={orgId} orgSlug={orgSlug} lead={lead} today={today} initialItems={calendarItems} />` then `<ActivityTimeline …/>`.

- [ ] **Step 4: Run to verify pass** — new test file, then full suite.
- [ ] **Step 5: Commit** — `feat(crm): dates panel — ten-day window with month grid, hover preview, pin`

---

### Task 9: Verify, walk, ship

**Files:** none new.

- [ ] **Step 1: Full suite** — `npx vitest run --exclude '**/.claude/**'` → all green.
- [ ] **Step 2: `next build`** → green (watch the `'use server'` re-export rule).
- [ ] **Step 3: Emulator walkthrough** — `npm run emulators` + `npm run dev:emulator` (emulator wiring is already sitting uncommitted in the worktree), seed demo data; verify: light sidebar everywhere; opportunity page: pill row under facts with Tasks default and one-pane switching; danger hint on an unsigned contract; empty-state one-liners; composers open on demand; `?focus=task` opens the composer; DatesPanel: correct window for a dated lead, bars for a booked event + tentative + task, hover preview + pin + Esc, month unfolds beneath without moving the strip, arrows slide and fetch; screenshots into `docs/superpowers/walkthroughs/2026-08-08-opportunity-workspace/`.
- [ ] **Step 4: Commit walkthrough, push (`gh auth switch --user Lifewithmo`), open PR** titled `feat(crm): opportunity workspace (light shell, pill row, dates panel)` against `main`, body linking the spec + screenshots, ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

## Self-Review

**Spec coverage:** §1 sidebar ✔ (T1); §2 columns + density ✔ (T6 composers/empty states, T7 left column, T8 right column); §3 pill row ✔ (T3 chips, T7 row/panes); §4 DatesPanel ✔ (T2 math, T4 data, T8 component — hover/pin/Esc, border-box guard, month-beneath-strip); carried `useDismissable` fix ✔ (T5); testing section ✔ (per task + T9); out-of-scope respected (no writes from the panel, no sub-nav).
**Placeholder scan:** none — every code step carries real code; the two "match the file's existing pattern" notes point at concrete files the implementer must read, not omitted content.
**Type consistency:** `TasksPanelHandle` defined T6, consumed T7/T8 via `tasksPanelRef`/`taskInputRef`; `AttachmentChip.kind` values (`'task'`…) used in T7's `selected === 'task'` branches match T3; `calendarRangeItems`/`listCalendarRange` signatures match between T4 and T8; `windowDays`/`rangeLabel`/etc. names match T2 ↔ T8. `attachmentChips` gains `tasks`+`today` in T3 and its one interim call site is patched the same task, so the suite never sees a broken build between tasks.
