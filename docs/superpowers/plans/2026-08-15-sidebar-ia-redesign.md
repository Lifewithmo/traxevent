# Sidebar IA Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five-group admin sidebar with eight flat split-click sections, add a live "today + 4" event list that keeps job context inside the business nav, and build the three overview pages that give every parent row a destination.

**Architecture:** Three layers, built bottom-up. Pure helpers in `lib/` (upcoming-event selection, money rollup, catalog health, settings completeness) are unit-tested with no Firestore. Server actions wrap them with `assertOrgMember`. The sidebar is rewritten last, once every route it links to exists. Split-click means each parent row renders two sibling controls — an `<a>` for the label and a `<button aria-expanded>` for the chevron — never one nested inside the other.

**Tech Stack:** Next.js 16 App Router (`params` is a `Promise`), React 19 client components, Firebase Admin SDK, Vitest + Testing Library, Tailwind with `--sidebar-*` CSS custom properties.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-15-sidebar-ia-redesign-design.md`. Read it before Task 1.
- **Test command:** `npx vitest run --exclude '**/.claude/**' --maxWorkers=2`. The `--exclude` is mandatory — without it vitest picks up worktrees under `.claude/` and the run pollutes. Worker-spawn timeout warnings in this environment are harmless, not failures.
- **`next build` is the real gate.** `tsc` passes on code `next build` rejects. Never re-export a type from a `'use server'` module — it breaks the build. Run `npm run build` before calling the branch green.
- **The type is `Event` with `event_start`/`event_end`** (`lib/types.ts:107`). There is no `Camp` type and no `camp_start` field; the 2026-07-05 business-nav plan is stale on this point.
- **Module gating is preserved everywhere.** Use the existing `has(m: ModuleId)` pattern in `AdminSidebar`. Never render a section whose module is off.
- **Sentence case** for all nav labels and page copy. "All events", not "All Events".
- **Screen composition is a hard gate.** Every page in this plan must satisfy the project's `screen-composition` skill: no uniform card stacks (3+ equal-weight sibling `<Card>` in a `space-y-*` column is a defect), exactly one focal element and it must be the deciding value, no value rendered twice, every number carries its interpretation, and empty/one/many/error are designed rather than assumed. `components/admin/pipeline/PipelineStatsHeader.tsx` is the reference; `components/admin/InvoiceEditorClient.tsx` is the cautionary example. The page code in Tasks 4, 6, and 7 is already composed this way — do not "simplify" it back into cards.
- **No raw hex literals.** `app/globals.css` re-grades the Tailwind palettes (`gray→warm`, `blue→copper`, `red→terracotta`); inline hex escapes the re-grade. Use semantic tokens (`var(--border)`, `var(--muted-foreground)`) or re-graded utilities. `docs/design-system.md` is stale — `app/globals.css` is the source of truth.
- **Dates are ISO `YYYY-MM-DD` strings.** Compare lexicographically; never construct a `Date` for ordering.
- **All `lib/` helpers in this plan are pure** — no Firestore, no `Date.now()` inside the function body. `now` is always an explicit parameter so tests are deterministic.
- **Commit after every task.** Conventional commits (`feat:`, `test:`, `refactor:`).
- **Deliberate deviation from the spec — no Payments child.** The spec lists Money's children as Invoices · Payments · Reports, but there is no `/[orgSlug]/payments` route and no payments list action; payments exist only as an array on each invoice. This plan ships Money with Invoices and Reports only. The `paidThisMonth` figure on `/money` covers the immediate need. A standalone Payments page is a separate increment.
- **`InvoicePayment` uses `recorded_at`, not `paid_at`** (`lib/types.ts:652`). Getting this wrong silently yields a permanent `paidThisMonth: 0`.

---

## File Structure

**New pure helpers (`lib/`)** — one responsibility each, all unit-tested without Firestore:
- `lib/sidebar-events.ts` — selects and labels the today + 4 event rows
- `lib/money-overview.ts` — rolls invoices into totals and aging buckets
- `lib/catalog-health.ts` — finds expiring compliance docs and counts catalog entities
- `lib/settings-health.ts` — computes which settings areas are unconfigured

**New server actions (`actions/`)** — thin `assertOrgMember` wrappers over the helpers:
- `actions/sidebar-events.ts`, `actions/money-overview.ts`, `actions/catalog-overview.ts`, `actions/settings-overview.ts`

**New pages (`app/(admin)/[orgSlug]/`)**:
- `money/page.tsx`, `catalog/page.tsx`, `settings/page.tsx`

**New components (`components/layout/`)**:
- `SidebarSection.tsx` — the split-click parent row (label link + chevron button)

**Modified**:
- `components/layout/AdminSidebar.tsx` — the IA rewrite (Task 9)
- `components/admin/pipeline/PipelineSubNav.tsx` — drop the Calendar tab (Task 10)
- `app/(admin)/[orgSlug]/layout.tsx` — pass upcoming events into the sidebar (Task 9)

---

### Task 1: Upcoming-event selection helper

**Files:**
- Create: `lib/sidebar-events.ts`
- Test: `__tests__/lib/sidebar-events.test.ts`

**Interfaces:**
- Consumes: `Event` from `@/lib/types` (fields used: `id`, `name`, `slug`, `event_start`, `status`)
- Produces: `interface SidebarEventRow { id: string; name: string; slug: string; label: string; isToday: boolean }` and `selectUpcomingEvents(events: Event[], now: string, limit?: number): SidebarEventRow[]`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/sidebar-events.test.ts
import { describe, it, expect } from 'vitest'
import { selectUpcomingEvents } from '@/lib/sidebar-events'
import type { Event } from '@/lib/types'

function ev(id: string, start: string, status: Event['status'] = 'active'): Event {
  return { id, name: `Event ${id}`, slug: `event-${id}`, event_start: start, status } as Event
}

describe('selectUpcomingEvents', () => {
  it('returns at most 5 rows sorted by start date ascending', () => {
    const events = [
      ev('e', '2026-09-01'), ev('a', '2026-08-16'), ev('c', '2026-08-20'),
      ev('b', '2026-08-18'), ev('f', '2026-09-10'), ev('d', '2026-08-25'),
    ]
    const rows = selectUpcomingEvents(events, '2026-08-15')
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('labels an event starting today as "Today" and flags isToday', () => {
    const rows = selectUpcomingEvents([ev('a', '2026-08-15')], '2026-08-15')
    expect(rows[0].label).toBe('Today')
    expect(rows[0].isToday).toBe(true)
  })

  it('labels a future event with a short date and does not flag isToday', () => {
    const rows = selectUpcomingEvents([ev('a', '2026-08-20')], '2026-08-15')
    expect(rows[0].label).toBe('Aug 20')
    expect(rows[0].isToday).toBe(false)
  })

  it('excludes events that started before today', () => {
    const rows = selectUpcomingEvents([ev('past', '2026-08-14'), ev('now', '2026-08-15')], '2026-08-15')
    expect(rows.map((r) => r.id)).toEqual(['now'])
  })

  it('excludes archived events', () => {
    const rows = selectUpcomingEvents([ev('a', '2026-08-20', 'archived'), ev('b', '2026-08-21')], '2026-08-15')
    expect(rows.map((r) => r.id)).toEqual(['b'])
  })

  it('returns fewer than 5 rows when fewer events qualify', () => {
    expect(selectUpcomingEvents([ev('a', '2026-08-20')], '2026-08-15')).toHaveLength(1)
  })

  it('returns an empty array when nothing is upcoming', () => {
    expect(selectUpcomingEvents([], '2026-08-15')).toEqual([])
  })

  it('omits events with no start date', () => {
    const noDate = { id: 'x', name: 'X', slug: 'x', status: 'active' } as Event
    expect(selectUpcomingEvents([noDate], '2026-08-15')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/sidebar-events.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: FAIL — cannot resolve `@/lib/sidebar-events`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/sidebar-events.ts
import type { Event } from '@/lib/types'

export interface SidebarEventRow {
  id: string
  name: string
  slug: string
  label: string      // 'Today' when the event starts today, else 'Aug 20'
  isToday: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// 'YYYY-MM-DD' -> 'Aug 20'. String math only — no Date, so no timezone drift.
function shortDate(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split('-')
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`
}

/**
 * The sidebar's Events list: today's events first, then the soonest upcoming,
 * capped at `limit`. Always the same shape regardless of how many are today —
 * an event starting today is just a row whose label reads 'Today'.
 * `now` is an ISO date string (YYYY-MM-DD) so callers control the clock.
 */
export function selectUpcomingEvents(events: Event[], now: string, limit = 5): SidebarEventRow[] {
  const today = now.slice(0, 10)
  return events
    .filter((e) => e.status !== 'archived')
    .filter((e) => typeof e.event_start === 'string' && e.event_start.slice(0, 10) >= today)
    .sort((a, b) => a.event_start.localeCompare(b.event_start))
    .slice(0, limit)
    .map((e) => {
      const start = e.event_start.slice(0, 10)
      const isToday = start === today
      return { id: e.id, name: e.name, slug: e.slug, label: isToday ? 'Today' : shortDate(start), isToday }
    })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/sidebar-events.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/sidebar-events.ts __tests__/lib/sidebar-events.test.ts
git commit -m "feat(nav): today + 4 upcoming event selection helper"
```

---

### Task 2: Upcoming-events server action

**Files:**
- Create: `actions/sidebar-events.ts`
- Test: `__tests__/actions/sidebar-events.test.ts`

**Interfaces:**
- Consumes: `selectUpcomingEvents`, `SidebarEventRow` (Task 1); `listEvents(orgId: string): Promise<Event[]>` from `@/actions/events`
- Produces: `listSidebarEvents(orgId: string, now?: string): Promise<SidebarEventRow[]>`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/actions/sidebar-events.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Event } from '@/lib/types'

const listEvents = vi.fn()
const assertOrgMember = vi.fn()

vi.mock('@/actions/events', () => ({ listEvents: (...a: unknown[]) => listEvents(...a) }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: (...a: unknown[]) => assertOrgMember(...a) }))

import { listSidebarEvents } from '@/actions/sidebar-events'

function ev(id: string, start: string): Event {
  return { id, name: `Event ${id}`, slug: `event-${id}`, event_start: start, status: 'active' } as Event
}

describe('listSidebarEvents', () => {
  beforeEach(() => {
    listEvents.mockReset()
    assertOrgMember.mockReset().mockResolvedValue(undefined)
  })

  it('asserts org membership before reading', async () => {
    listEvents.mockResolvedValue([])
    await listSidebarEvents('org1', '2026-08-15')
    expect(assertOrgMember).toHaveBeenCalledWith('org1')
  })

  it('returns at most 5 rows from the org event list', async () => {
    listEvents.mockResolvedValue([
      ev('a', '2026-08-16'), ev('b', '2026-08-17'), ev('c', '2026-08-18'),
      ev('d', '2026-08-19'), ev('e', '2026-08-20'), ev('f', '2026-08-21'),
    ])
    const rows = await listSidebarEvents('org1', '2026-08-15')
    expect(rows).toHaveLength(5)
    expect(rows[0].id).toBe('a')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/actions/sidebar-events.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: FAIL — cannot resolve `@/actions/sidebar-events`.

- [ ] **Step 3: Write the implementation**

Note: this file must NOT re-export `SidebarEventRow` — re-exporting a type from a `'use server'` module breaks `next build`. Consumers import the type from `@/lib/sidebar-events` directly.

```typescript
// actions/sidebar-events.ts
'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listEvents } from '@/actions/events'
import { selectUpcomingEvents } from '@/lib/sidebar-events'
import type { SidebarEventRow } from '@/lib/sidebar-events'

export async function listSidebarEvents(orgId: string, now?: string): Promise<SidebarEventRow[]> {
  await assertOrgMember(orgId)
  const events = await listEvents(orgId)
  return selectUpcomingEvents(events, now ?? new Date().toISOString().slice(0, 10))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/actions/sidebar-events.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add actions/sidebar-events.ts __tests__/actions/sidebar-events.test.ts
git commit -m "feat(nav): listSidebarEvents server action"
```

---

### Task 3: Money rollup helper

**Files:**
- Create: `lib/money-overview.ts`
- Test: `__tests__/lib/money-overview.test.ts`

**Interfaces:**
- Consumes: `NormalizedInvoice` from `@/lib/types`; `invoiceAmountDue(invoice)` and `amountPaid(payments)` from `@/lib/invoices`; `deriveAging({ dueDate, balance, lifecycle }, now: Date)` from `@/lib/invoice-status`, which returns `InvoiceAgingBucket` (`'current' | 'due_soon' | 'due_today' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus'`)
- Produces: `interface OverdueInvoice { id: string; leadId: string; label: string; balance: number; daysOverdue: number }`, `interface MoneyOverview { outstanding: number; overdue: number; overdueCount: number; paidThisMonth: number; aging: Record<InvoiceAgingBucket, number>; overdueInvoices: OverdueInvoice[] }`, and `buildMoneyOverview(invoices: NormalizedInvoice[], now: Date): MoneyOverview`

The rollup returns the overdue invoices themselves, not just their total. The `/money` page's whole job is chasing late payers, and a page that shows a number without the rows it came from puts the action somewhere other than the thing it acts on.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/money-overview.test.ts
import { describe, it, expect } from 'vitest'
import { buildMoneyOverview } from '@/lib/money-overview'
import type { NormalizedInvoice } from '@/lib/types'

const NOW = new Date('2026-08-15T12:00:00Z')

function inv(over: Partial<NormalizedInvoice> & { id: string }): NormalizedInvoice {
  return {
    line_items: [{ description: 'Service', quantity: 1, unit_price: 100 }],
    payments: [],
    lifecycle: 'issued',
    ...over,
  } as NormalizedInvoice
}

describe('buildMoneyOverview', () => {
  it('sums the unpaid balance of issued invoices as outstanding', () => {
    const o = buildMoneyOverview([inv({ id: 'a' }), inv({ id: 'b' })], NOW)
    expect(o.outstanding).toBe(200)
  })

  it('subtracts payments from outstanding', () => {
    const o = buildMoneyOverview(
      [inv({ id: 'a', payments: [{ amount: 40, recorded_at: '2026-08-10' }] } as Partial<NormalizedInvoice> & { id: string })],
      NOW,
    )
    expect(o.outstanding).toBe(60)
  })

  it('excludes draft, voided, and replaced invoices from outstanding', () => {
    const o = buildMoneyOverview(
      [inv({ id: 'a', lifecycle: 'draft' }), inv({ id: 'b', lifecycle: 'voided' }), inv({ id: 'c', lifecycle: 'replaced' })],
      NOW,
    )
    expect(o.outstanding).toBe(0)
  })

  it('counts and sums invoices past their due date as overdue', () => {
    const o = buildMoneyOverview(
      [inv({ id: 'a', due_date: '2026-08-01' }), inv({ id: 'b', due_date: '2026-09-01' })],
      NOW,
    )
    expect(o.overdue).toBe(100)
    expect(o.overdueCount).toBe(1)
  })

  it('buckets balances by aging', () => {
    const o = buildMoneyOverview(
      [inv({ id: 'a', due_date: '2026-08-01' }), inv({ id: 'b', due_date: '2026-04-01' })],
      NOW,
    )
    expect(o.aging.d1_30).toBe(100)
    expect(o.aging.d90_plus).toBe(100)
  })

  it('sums payments received in the current calendar month', () => {
    const o = buildMoneyOverview(
      [inv({ id: 'a', payments: [{ amount: 30, recorded_at: '2026-08-03' }, { amount: 20, recorded_at: '2026-07-28' }] } as Partial<NormalizedInvoice> & { id: string })],
      NOW,
    )
    expect(o.paidThisMonth).toBe(30)
  })

  it('returns zeroed totals and no overdue rows for an empty list', () => {
    const o = buildMoneyOverview([], NOW)
    expect(o).toMatchObject({ outstanding: 0, overdue: 0, overdueCount: 0, paidThisMonth: 0 })
    expect(o.overdueInvoices).toEqual([])
  })

  it('returns the overdue invoices themselves, most overdue first', () => {
    const o = buildMoneyOverview(
      [
        inv({ id: 'recent', lead_id: 'l1', number: 'INV-2', due_date: '2026-08-10' }),
        inv({ id: 'old', lead_id: 'l2', number: 'INV-1', due_date: '2026-07-01' }),
      ],
      NOW,
    )
    expect(o.overdueInvoices.map((i) => i.id)).toEqual(['old', 'recent'])
    expect(o.overdueInvoices[0]).toMatchObject({ leadId: 'l2', label: 'INV-1', balance: 100, daysOverdue: 45 })
  })

  it('falls back to the invoice title, then a placeholder, when there is no number', () => {
    const titled = buildMoneyOverview([inv({ id: 'a', title: 'Deposit', due_date: '2026-08-01' })], NOW)
    expect(titled.overdueInvoices[0].label).toBe('Deposit')
    const bare = buildMoneyOverview([inv({ id: 'a', due_date: '2026-08-01' })], NOW)
    expect(bare.overdueInvoices[0].label).toBe('Untitled invoice')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/money-overview.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: FAIL — cannot resolve `@/lib/money-overview`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/money-overview.ts
import type { InvoiceAgingBucket, NormalizedInvoice } from '@/lib/types'
import { invoiceAmountDue, amountPaid } from '@/lib/invoices'
import { deriveAging } from '@/lib/invoice-status'

export interface OverdueInvoice {
  id: string
  leadId: string
  label: string        // invoice number, else title, else 'Untitled invoice'
  balance: number
  daysOverdue: number
}

export interface MoneyOverview {
  outstanding: number
  overdue: number
  overdueCount: number
  paidThisMonth: number
  aging: Record<InvoiceAgingBucket, number>
  overdueInvoices: OverdueInvoice[]   // most overdue first
}

const EMPTY_AGING: Record<InvoiceAgingBucket, number> = {
  current: 0, due_soon: 0, due_today: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0,
}

const OVERDUE_BUCKETS: InvoiceAgingBucket[] = ['d1_30', 'd31_60', 'd61_90', 'd90_plus']

// Only these lifecycles represent money the org is actually owed.
function isCollectable(inv: NormalizedInvoice): boolean {
  return inv.lifecycle === 'issued' || inv.lifecycle === 'approved'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const DAY_MS = 86_400_000

function daysPastDue(dueDate: string, now: Date): number {
  const due = new Date(dueDate.slice(0, 10) + 'T00:00:00Z').getTime()
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((today - due) / DAY_MS)
}

/** Rolls the org's invoices into the numbers — and the rows — the /money overview answers. */
export function buildMoneyOverview(invoices: NormalizedInvoice[], now: Date): MoneyOverview {
  const month = now.toISOString().slice(0, 7)
  const aging = { ...EMPTY_AGING }
  const overdueInvoices: OverdueInvoice[] = []
  let outstanding = 0
  let overdue = 0
  let paidThisMonth = 0

  for (const inv of invoices) {
    // InvoicePayment's timestamp field is `recorded_at`, not `paid_at`.
    for (const p of inv.payments ?? []) {
      if (typeof p.recorded_at === 'string' && p.recorded_at.slice(0, 7) === month) paidThisMonth += p.amount
    }

    if (!isCollectable(inv)) continue

    const balance = round2(invoiceAmountDue(inv) - amountPaid(inv.payments ?? []))
    if (balance <= 0) continue

    outstanding += balance
    const bucket = deriveAging({ dueDate: inv.due_date, balance, lifecycle: inv.lifecycle }, now)
    aging[bucket] += balance
    if (OVERDUE_BUCKETS.includes(bucket)) {
      overdue += balance
      overdueInvoices.push({
        id: inv.id,
        leadId: inv.lead_id,
        label: inv.number ?? inv.title ?? 'Untitled invoice',
        balance,
        daysOverdue: inv.due_date ? daysPastDue(inv.due_date, now) : 0,
      })
    }
  }

  overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue)
  for (const k of Object.keys(aging) as InvoiceAgingBucket[]) aging[k] = round2(aging[k])
  return {
    outstanding: round2(outstanding),
    overdue: round2(overdue),
    overdueCount: overdueInvoices.length,
    paidThisMonth: round2(paidThisMonth),
    aging,
    overdueInvoices,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/money-overview.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/money-overview.ts __tests__/lib/money-overview.test.ts
git commit -m "feat(money): invoice rollup helper for the money overview"
```

---

### Task 4: Money overview page

**Files:**
- Create: `actions/money-overview.ts`
- Create: `app/(admin)/[orgSlug]/money/page.tsx`
- Test: `__tests__/actions/money-overview.test.ts`

**Interfaces:**
- Consumes: `buildMoneyOverview`, `MoneyOverview` (Task 3); `listAllInvoices(orgId: string): Promise<NormalizedInvoice[]>` from `@/actions/invoices`; `requireOrgMember(orgSlug): Promise<{ org: Org; orgId: string; member: OrgMember }>` from `@/lib/auth/guards`
- Produces: `getMoneyOverview(orgId: string): Promise<MoneyOverview>`; route `/[orgSlug]/money`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/actions/money-overview.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NormalizedInvoice } from '@/lib/types'

const listAllInvoices = vi.fn()
const assertOrgMember = vi.fn()

vi.mock('@/actions/invoices', () => ({ listAllInvoices: (...a: unknown[]) => listAllInvoices(...a) }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: (...a: unknown[]) => assertOrgMember(...a) }))

import { getMoneyOverview } from '@/actions/money-overview'

describe('getMoneyOverview', () => {
  beforeEach(() => {
    listAllInvoices.mockReset().mockResolvedValue([])
    assertOrgMember.mockReset().mockResolvedValue(undefined)
  })

  it('asserts org membership before reading', async () => {
    await getMoneyOverview('org1')
    expect(assertOrgMember).toHaveBeenCalledWith('org1')
  })

  it('returns a rollup of the org invoices', async () => {
    listAllInvoices.mockResolvedValue([
      { id: 'a', lifecycle: 'issued', line_items: [{ description: 'x', quantity: 1, unit_price: 250 }], payments: [] },
    ] as unknown as NormalizedInvoice[])
    const o = await getMoneyOverview('org1')
    expect(o.outstanding).toBe(250)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/actions/money-overview.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: FAIL — cannot resolve `@/actions/money-overview`.

- [ ] **Step 3: Write the action**

```typescript
// actions/money-overview.ts
'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listAllInvoices } from '@/actions/invoices'
import { buildMoneyOverview } from '@/lib/money-overview'
import type { MoneyOverview } from '@/lib/money-overview'

export async function getMoneyOverview(orgId: string): Promise<MoneyOverview> {
  await assertOrgMember(orgId)
  return buildMoneyOverview(await listAllInvoices(orgId), new Date())
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/actions/money-overview.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the page**

**Composition (required reading: the `screen-composition` skill).** This is not a card stack — an earlier draft of this plan was one, and it violated the repo's hard rules.

- **Job:** "Find out who owes me money that's late, and go chase them."
- **Deciding value:** the overdue total. It is the focal element — it is the only figure on the page that triggers an action. Outstanding and paid-this-month are context, rendered smaller and quieter.
- **Order:** overdue total → the late invoices themselves (the action lives with the thing it acts on) → supporting context → aging, behind the fold.
- **Containers:** none. Hairline rules and spacing group, following `components/admin/pipeline/PipelineStatsHeader.tsx`. No `<Card>` on this page.
- **States:** nothing overdue but money outstanding → a calm "nothing overdue" line, outstanding still shown. No invoices at all → an empty state naming the space with a link to create one. Singular/plural handled on every count.

```tsx
// app/(admin)/[orgSlug]/money/page.tsx
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireOrgMember } from '@/lib/auth/guards'
import { getMoneyOverview } from '@/actions/money-overview'

const AGING_ROWS: Array<{ key: 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus'; label: string }> = [
  { key: 'd1_30', label: '1–30 days' },
  { key: 'd31_60', label: '31–60 days' },
  { key: 'd61_90', label: '61–90 days' },
  { key: 'd90_plus', label: '90+ days' },
]

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

function KpiLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-mono text-[11px] font-semibold uppercase tracking-[.04em]"
      style={{ color: 'color-mix(in oklab, var(--muted-foreground) 70%, var(--foreground))' }}
    >
      {children}
    </p>
  )
}

export default async function MoneyPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { orgId } = await requireOrgMember(orgSlug)
  const o = await getMoneyOverview(orgId)

  const nothingAtAll = o.outstanding === 0 && o.paidThisMonth === 0 && o.overdueCount === 0

  if (nothingAtAll) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Money</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Invoices you issue show up here — what&apos;s outstanding, what&apos;s late, and what came in this month.
        </p>
        <Link href={`/${orgSlug}/invoices`} className="mt-4 inline-block text-sm font-medium text-primary underline">
          Go to invoices
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="sr-only">Money</h1>

      <div
        className="grid grid-cols-[minmax(0,1fr)_minmax(260px,380px)] gap-8 max-[1100px]:grid-cols-1"
        style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20 }}
      >
        <div>
          <KpiLabel>Overdue</KpiLabel>
          <p
            className={`text-[40px] font-semibold leading-none tabular-nums tracking-[-.02em]${
              o.overdueCount > 0 ? ' text-destructive' : ''
            }`}
          >
            {money(o.overdue)}
          </p>
          <p className={`mt-1 text-sm ${o.overdueCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {o.overdueCount > 0
              ? `${o.overdueCount} invoice${o.overdueCount === 1 ? '' : 's'} past due`
              : 'nothing overdue — all invoices are current'}
          </p>

          {o.overdueInvoices.length > 0 && (
            <ul className="mt-4">
              {o.overdueInvoices.map((i) => (
                <li key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <Link
                    href={`/${orgSlug}/leads/${i.leadId}/invoices/${i.id}`}
                    className="flex items-baseline justify-between gap-4 py-2 hover:bg-muted/40"
                  >
                    <span className="truncate text-sm font-medium">{i.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {i.daysOverdue} day{i.daysOverdue === 1 ? '' : 's'} late
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">{money(i.balance)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-4 max-[1100px]:flex-row max-[1100px]:gap-8">
          <div>
            <KpiLabel>Outstanding</KpiLabel>
            <p className="text-[22px] font-semibold leading-tight tabular-nums">{money(o.outstanding)}</p>
            <p className="text-xs text-muted-foreground">everything issued and unpaid</p>
          </div>
          <div>
            <KpiLabel>Paid this month</KpiLabel>
            <p className="text-[22px] font-semibold leading-tight tabular-nums">{money(o.paidThisMonth)}</p>
            <p className="text-xs text-muted-foreground">payments recorded so far</p>
          </div>
        </div>
      </div>

      {o.outstanding > 0 && (
        <div className="flex flex-wrap gap-x-8 gap-y-3 pt-4">
          {AGING_ROWS.map((r) => (
            <div key={r.key}>
              <KpiLabel>{r.label}</KpiLabel>
              <p className="text-sm tabular-nums">{money(o.aging[r.key])}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-4 pt-6 text-sm">
        <Link href={`/${orgSlug}/invoices`} className="underline">All invoices</Link>
        <Link href={`/${orgSlug}/reports`} className="underline">Reports</Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Verify the page compiles**

Run: `npm run build`
Expected: build succeeds, `/[orgSlug]/money` appears in the route list.

- [ ] **Step 7: Commit**

```bash
git add actions/money-overview.ts app/\(admin\)/\[orgSlug\]/money/page.tsx __tests__/actions/money-overview.test.ts
git commit -m "feat(money): /money overview page with aging and outstanding totals"
```

---

### Task 5: Catalog health helper

**Files:**
- Create: `lib/catalog-health.ts`
- Test: `__tests__/lib/catalog-health.test.ts`

**Interfaces:**
- Consumes: `ComplianceDoc` from `@/lib/types` (fields: `id`, `name`, `expires_on?`)
- Produces: `interface ExpiringDoc { id: string; name: string; expiresOn: string; daysLeft: number }` and `findExpiringDocs(docs: ComplianceDoc[], now: string, withinDays?: number): ExpiringDoc[]`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/catalog-health.test.ts
import { describe, it, expect } from 'vitest'
import { findExpiringDocs } from '@/lib/catalog-health'
import type { ComplianceDoc } from '@/lib/types'

function doc(id: string, expires?: string): ComplianceDoc {
  return { id, name: `Doc ${id}`, expires_on: expires, created_at: '2026-01-01' }
}

describe('findExpiringDocs', () => {
  it('includes docs expiring within the window, soonest first', () => {
    const out = findExpiringDocs([doc('b', '2026-09-10'), doc('a', '2026-08-20')], '2026-08-15')
    expect(out.map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('includes already-expired docs with a negative daysLeft', () => {
    const out = findExpiringDocs([doc('a', '2026-08-10')], '2026-08-15')
    expect(out[0].daysLeft).toBe(-5)
  })

  it('excludes docs expiring beyond the window', () => {
    expect(findExpiringDocs([doc('a', '2026-12-01')], '2026-08-15')).toEqual([])
  })

  it('excludes docs with no expiry date', () => {
    expect(findExpiringDocs([doc('a')], '2026-08-15')).toEqual([])
  })

  it('computes daysLeft for a future expiry', () => {
    expect(findExpiringDocs([doc('a', '2026-08-25')], '2026-08-15')[0].daysLeft).toBe(10)
  })

  it('honours a custom window', () => {
    expect(findExpiringDocs([doc('a', '2026-08-25')], '2026-08-15', 5)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/catalog-health.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: FAIL — cannot resolve `@/lib/catalog-health`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/catalog-health.ts
import type { ComplianceDoc } from '@/lib/types'

export interface ExpiringDoc {
  id: string
  name: string
  expiresOn: string
  daysLeft: number   // negative when already expired
}

const DAY_MS = 86_400_000

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00Z').getTime()
  const b = new Date(toIso + 'T00:00:00Z').getTime()
  return Math.round((b - a) / DAY_MS)
}

/**
 * Compliance docs that are expired or expiring soon — the one genuinely urgent
 * thing in the catalog section. `now` is an ISO date string (YYYY-MM-DD).
 */
export function findExpiringDocs(docs: ComplianceDoc[], now: string, withinDays = 60): ExpiringDoc[] {
  const today = now.slice(0, 10)
  return docs
    .filter((d): d is ComplianceDoc & { expires_on: string } => typeof d.expires_on === 'string')
    .map((d) => ({
      id: d.id,
      name: d.name,
      expiresOn: d.expires_on.slice(0, 10),
      daysLeft: daysBetween(today, d.expires_on.slice(0, 10)),
    }))
    .filter((d) => d.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/catalog-health.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog-health.ts __tests__/lib/catalog-health.test.ts
git commit -m "feat(catalog): expiring compliance doc helper"
```

---

### Task 6: Catalog overview page

**Files:**
- Create: `actions/catalog-overview.ts`
- Create: `app/(admin)/[orgSlug]/catalog/page.tsx`
- Test: `__tests__/actions/catalog-overview.test.ts`

**Interfaces:**
- Consumes: `findExpiringDocs`, `ExpiringDoc` (Task 5); `listAllVendors(orgId: string): Promise<Vendor[]>` from `@/actions/vendors`; `listComplianceDocs(orgId: string): Promise<ComplianceDoc[]>` from `@/actions/compliance`; `listFormTemplates(orgId: string): Promise<FormTemplate[]>` from `@/actions/forms`
- Produces: `interface CatalogOverview { vendorCount: number; formCount: number; expiring: ExpiringDoc[] }` (declared in `lib/catalog-health.ts`, not in the action file) and `getCatalogOverview(orgId: string): Promise<CatalogOverview>`

- [ ] **Step 1: Add the `CatalogOverview` type to the helper module**

It lives in `lib/catalog-health.ts` because a `'use server'` module cannot re-export types without breaking `next build`.

```typescript
// append to lib/catalog-health.ts
export interface CatalogOverview {
  vendorCount: number
  formCount: number
  expiring: ExpiringDoc[]
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// __tests__/actions/catalog-overview.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listAllVendors = vi.fn()
const listComplianceDocs = vi.fn()
const listFormTemplates = vi.fn()
const assertOrgMember = vi.fn()

vi.mock('@/actions/vendors', () => ({ listAllVendors: (...a: unknown[]) => listAllVendors(...a) }))
vi.mock('@/actions/compliance', () => ({ listComplianceDocs: (...a: unknown[]) => listComplianceDocs(...a) }))
vi.mock('@/actions/forms', () => ({ listFormTemplates: (...a: unknown[]) => listFormTemplates(...a) }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: (...a: unknown[]) => assertOrgMember(...a) }))

import { getCatalogOverview } from '@/actions/catalog-overview'

describe('getCatalogOverview', () => {
  beforeEach(() => {
    listAllVendors.mockReset().mockResolvedValue([])
    listComplianceDocs.mockReset().mockResolvedValue([])
    listFormTemplates.mockReset().mockResolvedValue([])
    assertOrgMember.mockReset().mockResolvedValue(undefined)
  })

  it('asserts org membership before reading', async () => {
    await getCatalogOverview('org1')
    expect(assertOrgMember).toHaveBeenCalledWith('org1')
  })

  it('counts vendors and forms', async () => {
    listAllVendors.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }])
    listFormTemplates.mockResolvedValue([{ id: 'f1' }])
    const o = await getCatalogOverview('org1')
    expect(o.vendorCount).toBe(2)
    expect(o.formCount).toBe(1)
  })

  it('surfaces expiring compliance docs', async () => {
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    listComplianceDocs.mockResolvedValue([{ id: 'd1', name: 'Liability insurance', expires_on: soon, created_at: '2026-01-01' }])
    const o = await getCatalogOverview('org1')
    expect(o.expiring.map((d) => d.id)).toEqual(['d1'])
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run __tests__/actions/catalog-overview.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: FAIL — cannot resolve `@/actions/catalog-overview`.

- [ ] **Step 4: Write the action**

```typescript
// actions/catalog-overview.ts
'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listAllVendors } from '@/actions/vendors'
import { listComplianceDocs } from '@/actions/compliance'
import { listFormTemplates } from '@/actions/forms'
import { findExpiringDocs } from '@/lib/catalog-health'
import type { CatalogOverview } from '@/lib/catalog-health'

export async function getCatalogOverview(orgId: string): Promise<CatalogOverview> {
  await assertOrgMember(orgId)
  const [vendors, docs, forms] = await Promise.all([
    listAllVendors(orgId),
    listComplianceDocs(orgId),
    listFormTemplates(orgId),
  ])
  return {
    vendorCount: vendors.length,
    formCount: forms.length,
    expiring: findExpiringDocs(docs, new Date().toISOString().slice(0, 10)),
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run __tests__/actions/catalog-overview.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: PASS, 3 tests.

- [ ] **Step 6: Write the page**

**Composition (required reading: the `screen-composition` skill).** No cards.

- **Job:** "Check nothing has lapsed before I quote a job or send a crew out."
- **Deciding value:** the count of expired or expiring documents. Focal, and destructive-coloured when anything is actually expired. Vendor and form counts are a quiet index line, not KPI tiles — nobody acts on them.
- **Order:** what's lapsed (the action) → the rest of the catalog as navigation.
- **Containers:** hairline rules only.
- **States:** nothing expiring → a calm "all current" line rather than a blank space. Nothing in the catalog at all → an empty state naming the space.

```tsx
// app/(admin)/[orgSlug]/catalog/page.tsx
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireOrgMember } from '@/lib/auth/guards'
import { getCatalogOverview } from '@/actions/catalog-overview'
import { getIndustryPack, catalogLabel } from '@/lib/industry-packs'

export default async function CatalogPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, orgId } = await requireOrgMember(orgSlug)
  const o = await getCatalogOverview(orgId)
  const packagesLabel = catalogLabel(getIndustryPack(org.industry_pack_id))

  const expired = o.expiring.filter((d) => d.daysLeft < 0)
  const links = [
    { href: `/${orgSlug}/packages`, label: packagesLabel },
    { href: `/${orgSlug}/vendors`, label: `Vendors · ${o.vendorCount}` },
    { href: `/${orgSlug}/forms`, label: `Forms · ${o.formCount}` },
    { href: `/${orgSlug}/compliance`, label: 'Compliance' },
  ]

  const empty = o.vendorCount === 0 && o.formCount === 0 && o.expiring.length === 0

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Catalog</h1>

      {empty ? (
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          What you sell and who helps you deliver it — packages, vendors, forms, and the documents that have to stay
          current. Start with {packagesLabel.toLowerCase()}.
        </p>
      ) : (
        <>
          <div className="mt-5" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
            <p
              className="font-mono text-[11px] font-semibold uppercase tracking-[.04em]"
              style={{ color: 'color-mix(in oklab, var(--muted-foreground) 70%, var(--foreground))' }}
            >
              Documents
            </p>
            <p
              className={`text-[32px] font-semibold leading-none tabular-nums${
                expired.length > 0 ? ' text-destructive' : ''
              }`}
            >
              {o.expiring.length}
            </p>
            <p className={`mt-1 text-sm ${expired.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {o.expiring.length === 0
                ? 'all current — nothing expiring in the next 60 days'
                : expired.length > 0
                  ? `${expired.length} already expired`
                  : `expiring within 60 days`}
            </p>

            {o.expiring.length > 0 && (
              <ul className="mt-4">
                {o.expiring.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-baseline justify-between gap-4 py-2"
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <span className="truncate text-sm font-medium">{d.name}</span>
                    <span className={`shrink-0 text-xs ${d.daysLeft < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {d.daysLeft < 0
                        ? `expired ${-d.daysLeft} day${d.daysLeft === -1 ? '' : 's'} ago`
                        : `${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'} left`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="underline">{l.label}</Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Verify the page compiles**

Run: `npm run build`
Expected: build succeeds, `/[orgSlug]/catalog` appears in the route list.

- [ ] **Step 8: Commit**

```bash
git add lib/catalog-health.ts actions/catalog-overview.ts app/\(admin\)/\[orgSlug\]/catalog/page.tsx __tests__/actions/catalog-overview.test.ts
git commit -m "feat(catalog): /catalog overview page with expiring-doc alerts"
```

---

### Task 7: Settings completeness helper and overview page

**Files:**
- Create: `lib/settings-health.ts`
- Create: `actions/settings-overview.ts`
- Create: `app/(admin)/[orgSlug]/settings/page.tsx`
- Test: `__tests__/lib/settings-health.test.ts`

**Interfaces:**
- Consumes: `Org` from `@/lib/types`; `listMembers(orgId: string): Promise<OrgMember[]>` from `@/actions/members`; `listProposalTemplates(orgId: string): Promise<ProposalTemplate[]>` from `@/actions/proposal-templates`
- Produces: `interface SettingsArea { slug: string; label: string; configured: boolean }`, `buildSettingsAreas(input: SettingsInput): SettingsArea[]`, `interface SettingsInput { org: Pick<Org, 'name' | 'logo_url' | 'public_profile_enabled' | 'email_domain_verified'>; memberCount: number; templateCount: number }`, and `getSettingsOverview(orgId: string): Promise<{ areas: SettingsArea[]; memberCount: number }>`

Before writing, confirm the actual field names on `Org` in `lib/types.ts` — `logo_url`, `public_profile_enabled`, and `email_domain_verified` are the expected names but must be verified. If a field is named differently, use the real name in both the interface and the implementation, and adjust the test.

- [ ] **Step 1: Verify the Org field names**

Run: `grep -n "interface Org" -A 30 lib/types.ts`
Note the real names for branding, public profile, and email-domain verification state. Use them consistently below.

- [ ] **Step 2: Write the failing test**

```typescript
// __tests__/lib/settings-health.test.ts
import { describe, it, expect } from 'vitest'
import { buildSettingsAreas } from '@/lib/settings-health'

const base = {
  org: { name: 'BrewTrax', logo_url: undefined, public_profile_enabled: false, email_domain_verified: false },
  memberCount: 1,
  templateCount: 0,
}

describe('buildSettingsAreas', () => {
  it('returns one entry per settings area', () => {
    expect(buildSettingsAreas(base)).toHaveLength(9)
  })

  it('marks branding unconfigured when there is no logo', () => {
    const branding = buildSettingsAreas(base).find((a) => a.slug === 'branding')
    expect(branding?.configured).toBe(false)
  })

  it('marks branding configured once a logo is set', () => {
    const areas = buildSettingsAreas({ ...base, org: { ...base.org, logo_url: 'https://cdn/logo.png' } })
    expect(areas.find((a) => a.slug === 'branding')?.configured).toBe(true)
  })

  it('marks proposal templates configured when at least one exists', () => {
    const areas = buildSettingsAreas({ ...base, templateCount: 2 })
    expect(areas.find((a) => a.slug === 'proposal-templates')?.configured).toBe(true)
  })

  it('marks members configured only when more than one member exists', () => {
    expect(buildSettingsAreas(base).find((a) => a.slug === 'members')?.configured).toBe(false)
    expect(buildSettingsAreas({ ...base, memberCount: 3 }).find((a) => a.slug === 'members')?.configured).toBe(true)
  })

  it('marks email domain configured when verified', () => {
    const areas = buildSettingsAreas({ ...base, org: { ...base.org, email_domain_verified: true } })
    expect(areas.find((a) => a.slug === 'email-domain')?.configured).toBe(true)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/settings-health.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: FAIL — cannot resolve `@/lib/settings-health`.

- [ ] **Step 4: Write the helper**

```typescript
// lib/settings-health.ts
import type { Org } from '@/lib/types'

export interface SettingsArea {
  slug: string
  label: string
  configured: boolean
}

export interface SettingsInput {
  org: Pick<Org, 'name' | 'logo_url' | 'public_profile_enabled' | 'email_domain_verified'>
  memberCount: number
  templateCount: number
}

/**
 * The nine settings areas plus whether each has been set up. Drives the
 * "what's left to configure" list on the /settings overview.
 * Areas with no meaningful completeness signal report `configured: true`.
 */
export function buildSettingsAreas({ org, memberCount, templateCount }: SettingsInput): SettingsArea[] {
  return [
    { slug: 'members', label: 'Members', configured: memberCount > 1 },
    { slug: 'permissions', label: 'Permissions', configured: true },
    { slug: 'billing', label: 'Billing', configured: true },
    { slug: 'branding', label: 'Branding', configured: Boolean(org.logo_url) },
    { slug: 'proposal-templates', label: 'Proposal templates', configured: templateCount > 0 },
    { slug: 'public-profile', label: 'Public profile', configured: Boolean(org.public_profile_enabled) },
    { slug: 'email-domain', label: 'Email domain', configured: Boolean(org.email_domain_verified) },
    { slug: 'event-types', label: 'Event types', configured: true },
    { slug: 'departments', label: 'Departments', configured: true },
  ]
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/settings-health.test.ts --exclude '**/.claude/**' --maxWorkers=2`
Expected: PASS, 6 tests.

- [ ] **Step 6: Write the action**

```typescript
// actions/settings-overview.ts
'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listMembers } from '@/actions/members'
import { listProposalTemplates } from '@/actions/proposal-templates'
import { buildSettingsAreas } from '@/lib/settings-health'
import type { SettingsArea, SettingsInput } from '@/lib/settings-health'

export async function getSettingsOverview(
  orgId: string,
  org: SettingsInput['org'],
): Promise<{ areas: SettingsArea[]; memberCount: number }> {
  await assertOrgMember(orgId)
  const [members, templates] = await Promise.all([listMembers(orgId), listProposalTemplates(orgId)])
  return {
    areas: buildSettingsAreas({ org, memberCount: members.length, templateCount: templates.length }),
    memberCount: members.length,
  }
}
```

- [ ] **Step 7: Write the page**

**Composition (required reading: the `screen-composition` skill).** No cards.

- **Job:** "Finish setting up the business so nothing looks half-built to a client."
- **Deciding value:** how many areas are still unconfigured. Focal when there are any; the page becomes a plain index once everything is done. The org name and member count are a subtitle, not KPI tiles — nobody acts on them.
- **Order:** what's unfinished (the action) → the full index.
- **Containers:** none. The unconfigured list is the only emphasized element.
- **States:** everything configured → the count block is replaced by a single "fully set up" line and the index stands alone. Member count handles singular/plural.

```tsx
// app/(admin)/[orgSlug]/settings/page.tsx
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireOrgMember } from '@/lib/auth/guards'
import { getSettingsOverview } from '@/actions/settings-overview'

export default async function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, orgId } = await requireOrgMember(orgSlug)
  const { areas, memberCount } = await getSettingsOverview(orgId, org)
  const unconfigured = areas.filter((a) => !a.configured)

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{org.name}</h1>
      <p className="text-sm text-muted-foreground">
        {memberCount} member{memberCount === 1 ? '' : 's'}
      </p>

      <div className="mt-5" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
        {unconfigured.length === 0 ? (
          <p className="text-sm text-muted-foreground">Fully set up — nothing left to configure.</p>
        ) : (
          <>
            <p
              className="font-mono text-[11px] font-semibold uppercase tracking-[.04em]"
              style={{ color: 'color-mix(in oklab, var(--muted-foreground) 70%, var(--foreground))' }}
            >
              Not set up yet
            </p>
            <p className="text-[32px] font-semibold leading-none tabular-nums">{unconfigured.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              area{unconfigured.length === 1 ? '' : 's'} clients may notice
            </p>
            <ul className="mt-4">
              {unconfigured.map((a) => (
                <li key={a.slug} style={{ borderTop: '1px solid var(--border)' }}>
                  <Link href={`/${orgSlug}/${a.slug}`} className="block py-2 text-sm font-medium hover:bg-muted/40">
                    {a.label}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-4 text-sm">
        {areas.map((a) => (
          <li key={a.slug}>
            <Link href={`/${orgSlug}/${a.slug}`} className="underline">{a.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 8: Verify the page compiles**

Run: `npm run build`
Expected: build succeeds, `/[orgSlug]/settings` appears in the route list.

- [ ] **Step 9: Commit**

```bash
git add lib/settings-health.ts actions/settings-overview.ts app/\(admin\)/\[orgSlug\]/settings/page.tsx __tests__/lib/settings-health.test.ts
git commit -m "feat(settings): /settings overview with setup completeness"
```

---

### Task 8: SidebarSection split-click component

**Files:**
- Create: `components/layout/SidebarSection.tsx`
- Test: `__tests__/components/layout/SidebarSection.test.tsx`

**Interfaces:**
- Consumes: `NavIcon`, `NavIconName` from `@/components/layout/NavIcons`
- Produces: `SidebarSection` with props `{ href: string; label: string; icon: NavIconName; active: boolean; open: boolean; onToggle: () => void; badge?: string; children: React.ReactNode }`

The label and the chevron are **sibling** controls — an `<a>` and a `<button>`. Never nest one inside the other; nested interactive elements are invalid HTML and break keyboard navigation. The chevron's hit area must be at least 24×24px even though the glyph is 12px.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/layout/SidebarSection.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SidebarSection } from '@/components/layout/SidebarSection'

function setup(open = false, onToggle = vi.fn()) {
  render(
    <SidebarSection href="/acme/money" label="Money" icon="invoices" active={false} open={open} onToggle={onToggle}>
      <a href="/acme/invoices">Invoices</a>
    </SidebarSection>,
  )
  return { onToggle }
}

describe('SidebarSection', () => {
  it('renders the label as a link to the section landing page', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Money' })).toHaveAttribute('href', '/acme/money')
  })

  it('renders the chevron as a separate button, not inside the link', () => {
    setup()
    const toggle = screen.getByRole('button', { name: /money/i })
    expect(toggle).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Money' })).not.toContainElement(toggle)
  })

  it('calls onToggle when the chevron is clicked', () => {
    const { onToggle } = setup()
    fireEvent.click(screen.getByRole('button', { name: /money/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('does not call onToggle when the label is clicked', () => {
    const { onToggle } = setup()
    fireEvent.click(screen.getByRole('link', { name: 'Money' }))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('reflects open state via aria-expanded', () => {
    setup(false)
    expect(screen.getByRole('button', { name: /money/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('hides children when closed and shows them when open', () => {
    const { unmount } = render(
      <SidebarSection href="/acme/money" label="Money" icon="invoices" active={false} open={false} onToggle={vi.fn()}>
        <a href="/acme/invoices">Invoices</a>
      </SidebarSection>,
    )
    expect(screen.queryByText('Invoices')).not.toBeInTheDocument()
    unmount()
    render(
      <SidebarSection href="/acme/money" label="Money" icon="invoices" active={false} open onToggle={vi.fn()}>
        <a href="/acme/invoices">Invoices</a>
      </SidebarSection>,
    )
    expect(screen.getByText('Invoices')).toBeInTheDocument()
  })

  it('renders a badge when provided', () => {
    render(
      <SidebarSection href="/acme/money" label="Money" icon="invoices" active={false} open={false} onToggle={vi.fn()} badge="2 late">
        <a href="/acme/invoices">Invoices</a>
      </SidebarSection>,
    )
    expect(screen.getByText('2 late')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/components/layout/SidebarSection.test.tsx --exclude '**/.claude/**' --maxWorkers=2`
Expected: FAIL — cannot resolve `@/components/layout/SidebarSection`.

- [ ] **Step 3: Write the component**

```tsx
// components/layout/SidebarSection.tsx
'use client'

import Link from 'next/link'
import { NavIcon, type NavIconName } from '@/components/layout/NavIcons'

interface SidebarSectionProps {
  href: string
  label: string
  icon: NavIconName
  active: boolean
  open: boolean
  onToggle: () => void
  badge?: string
  children: React.ReactNode
}

/**
 * A split-click parent row: the label navigates to the section's landing page,
 * the chevron toggles its children. Two sibling controls, never nested —
 * the same pattern as Notion's sidebar and the GitHub file tree.
 */
export function SidebarSection({ href, label, icon, active, open, onToggle, badge, children }: SidebarSectionProps) {
  return (
    <div>
      <div
        className={[
          'flex items-center rounded-md pr-1 border-l-2',
          active
            ? 'bg-[color:var(--sidebar-accent)] text-[color:var(--sidebar-accent-foreground)] border-[color:var(--sidebar-primary)]'
            : 'text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-accent)] hover:text-[color:var(--sidebar-accent-foreground)] border-transparent',
        ].join(' ')}
      >
        <Link href={href} className="flex flex-1 items-center gap-[10px] px-3 py-2 text-sm font-medium min-w-0">
          <NavIcon name={icon} />
          <span className="truncate">{label}</span>
        </Link>
        {badge && (
          <span className="mr-1 rounded-full bg-[color:var(--sidebar-accent)] px-1.5 py-0.5 text-[10px] font-semibold">
            {badge}
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
        >
          <span aria-hidden className={`text-[10px] transition-transform duration-150 ${open ? '' : '-rotate-90'}`}>
            &#9662;
          </span>
        </button>
      </div>
      {open && <div className="mt-0.5 space-y-0.5">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/components/layout/SidebarSection.test.tsx --exclude '**/.claude/**' --maxWorkers=2`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add components/layout/SidebarSection.tsx __tests__/components/layout/SidebarSection.test.tsx
git commit -m "feat(nav): split-click SidebarSection component"
```

---

### Task 9: Rewrite the sidebar IA

**Files:**
- Modify: `components/layout/AdminSidebar.tsx`
- Modify: `app/(admin)/[orgSlug]/layout.tsx`
- Modify: `__tests__/components/layout/AdminSidebar.test.tsx`
- Modify: `__tests__/components/AdminSidebar.test.tsx`

**Interfaces:**
- Consumes: `SidebarSection` (Task 8); `SidebarEventRow` from `@/lib/sidebar-events` (Task 1); `listSidebarEvents` (Task 2)
- Produces: `AdminSidebar` gains one prop — `upcomingEvents?: SidebarEventRow[]`. All existing props are unchanged.

The event sidebar branch (`eventSlug` present) is **deleted**. Job nav now renders inside the Events section of the one sidebar.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/components/layout/AdminSidebar.test.tsx`. The existing `vi.mock('next/navigation')` at the top of that file returns `usePathname: () => '/acme'` — these tests rely on it.

```tsx
describe('AdminSidebar — Option C IA', () => {
  const events = [
    { id: 'e1', name: 'Hendricks wedding', slug: 'hendricks', label: 'Today', isToday: true },
    { id: 'e2', name: 'Boise chamber mixer', slug: 'boise', label: 'Aug 20', isToday: false },
  ]

  it('renders the top trio in order: Today, Calendar, Clients', () => {
    render(<AdminSidebar orgSlug="acme" />)
    const links = screen.getAllByRole('link').map((a) => a.textContent)
    const today = links.indexOf('Today')
    expect(today).toBeGreaterThanOrEqual(0)
    expect(links.indexOf('Calendar')).toBe(today + 1)
    expect(links.indexOf('Clients')).toBe(today + 2)
  })

  it('does not render a "Quick Links" group label', () => {
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.queryByText('Quick Links')).not.toBeInTheDocument()
  })

  it('links the Money label to the money landing page', () => {
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'Money' })).toHaveAttribute('href', '/acme/money')
  })

  it('links the Catalog label to the catalog landing page', () => {
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'Catalog' })).toHaveAttribute('href', '/acme/catalog')
  })

  it('links the Settings label to the settings landing page', () => {
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/acme/settings')
  })

  it('expands a section when its chevron is clicked, without navigating', () => {
    render(<AdminSidebar orgSlug="acme" />)
    fireEvent.click(screen.getByRole('button', { name: /expand money/i }))
    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('href', '/acme/invoices')
  })

  it('renders upcoming events with their date labels when Events is expanded', () => {
    render(<AdminSidebar orgSlug="acme" upcomingEvents={events} />)
    fireEvent.click(screen.getByRole('button', { name: /expand events/i }))
    expect(screen.getByText('Hendricks wedding')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Aug 20')).toBeInTheDocument()
  })

  it('links an upcoming event row to that job dashboard', () => {
    render(<AdminSidebar orgSlug="acme" upcomingEvents={events} />)
    fireEvent.click(screen.getByRole('button', { name: /expand events/i }))
    expect(screen.getByRole('link', { name: /Hendricks wedding/ })).toHaveAttribute('href', '/acme/hendricks/dashboard')
  })

  it('hides the Money section when the invoices module is off', () => {
    const modules: ModuleId[] = ['events', 'calendar', 'clients']
    render(<AdminSidebar orgSlug="acme" enabledModules={modules} />)
    expect(screen.queryByRole('link', { name: 'Money' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/components/layout/AdminSidebar.test.tsx --exclude '**/.claude/**' --maxWorkers=2`
Expected: FAIL — the new IA does not exist yet. Existing tests asserting the old group labels ("Quick Links", "Sales Pipeline", "Operations", "Insights") will also fail; delete those specific assertions as part of Step 3, since the groups they name are being removed by design.

- [ ] **Step 3: Rewrite the sidebar**

Replace the section-building code in `components/layout/AdminSidebar.tsx` with this IA. Keep the existing `isActive`, `PanelIcon`, `NavItem`, `IconRailItem`, `IconRailGroup`, `handleSignOut`, the collapsed-rail behavior, and the `SIDEBAR_COLLAPSED_KEY` persistence unchanged.

Key changes:
1. Add `upcomingEvents?: SidebarEventRow[]` to `AdminSidebarProps`.
2. Add `'money'`, `'catalog'`, `'settings'` to `ORG_PAGE_SLUGS` so the sidebar renders on the new routes.
3. Delete the `eventSlug` branch entirely (the whole `{eventSlug ? (...)` arm at lines 334–360). The event nav moves inside the Events section.
4. Replace the five `Section` groups with: three flat `NavItem`s (Today, Calendar, Clients), then five `SidebarSection`s (Pipeline, Events, Money, Catalog, Settings), plus Registrants as a flat `NavItem` between Events and Money when `has('registrants')`.
5. One open-section state, not one boolean per section — only one section is open at a time.

```tsx
const [openSection, setOpenSection] = useState<string | null>(null)

function toggleSection(key: string) {
  setOpenSection((cur) => (cur === key ? null : key))
}
```

Section definitions — note `Reports` moves under Money, and Proposals moves under Pipeline:

```tsx
const pipelineChildren: NavLink[] = [
  { slug: 'leads', label: 'Opportunities', icon: 'pipeline' as NavIconName },
  { slug: 'leads/tasks', label: 'Tasks', icon: 'today' as NavIconName },
  { slug: 'proposals', label: 'Proposals', icon: 'proposals' as NavIconName },
].map((l) => ({
  href: `/${orgSlug}/${l.slug}`, label: l.label, icon: l.icon,
  active: isActive(pathname, `/${orgSlug}/${l.slug}`),
}))

const moneyChildren: NavLink[] = [
  { slug: 'invoices', label: 'Invoices', icon: 'invoices' as NavIconName },
  { slug: 'reports', label: 'Reports', icon: 'reports' as NavIconName },
].map((l) => ({
  href: `/${orgSlug}/${l.slug}`, label: l.label, icon: l.icon,
  active: isActive(pathname, `/${orgSlug}/${l.slug}`),
}))

const catalogChildren: NavLink[] = [
  ...(has('catalog') ? [{ slug: 'packages', label: catalogLabel ?? 'Packages', icon: 'packages' as NavIconName }] : []),
  ...(has('vendors') ? [{ slug: 'vendors', label: 'Vendors', icon: 'vendors' as NavIconName }] : []),
  ...(has('forms') ? [{ slug: 'forms', label: 'Forms', icon: 'forms' as NavIconName }] : []),
  ...(has('compliance') ? [{ slug: 'compliance', label: 'Compliance', icon: 'compliance' as NavIconName }] : []),
].map((l) => ({
  href: `/${orgSlug}/${l.slug}`, label: l.label, icon: l.icon,
  active: isActive(pathname, `/${orgSlug}/${l.slug}`),
}))
```

`settingsLinks` keeps its existing nine entries unchanged.

The Events section children — the 5 event rows, then the three standing links, or the current job's nav when `eventSlug` is set:

```tsx
{has('events') && (
  <SidebarSection
    href={`/${orgSlug}`}
    label="Events"
    icon="events"
    active={pathname === `/${orgSlug}` || Boolean(eventSlug)}
    open={openSection === 'events' || Boolean(eventSlug)}
    onToggle={() => toggleSection('events')}
  >
    {eventSlug ? (
      <>
        {visibleEventNav.map(({ key, label }) => (
          <NavItem
            key={key}
            href={`/${orgSlug}/${eventSlug}/${key}`}
            label={label}
            icon="events"
            active={isActive(pathname, `/${orgSlug}/${eventSlug}/${key}`)}
            indent
          />
        ))}
        <NavItem href={`/${orgSlug}`} label="All events" icon="events" active={false} indent />
      </>
    ) : (
      <>
        {(upcomingEvents ?? []).map((e) => (
          <Link
            key={e.id}
            href={`/${orgSlug}/${e.slug}/dashboard`}
            className="flex items-center gap-2 pl-[26px] pr-3 py-2 rounded-md text-sm text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-accent)] hover:text-[color:var(--sidebar-accent-foreground)]"
          >
            <span className="truncate flex-1">{e.name}</span>
            <span className={`text-[10px] shrink-0 ${e.isToday ? 'font-semibold' : ''}`}>{e.label}</span>
          </Link>
        ))}
        <NavItem href={`/${orgSlug}`} label="All events" icon="events" active={false} indent />
        <NavItem href={`/${orgSlug}/new-event`} label="+ New event" icon="events" active={false} indent />
      </>
    )}
  </SidebarSection>
)}
```

The collapsed icon rail replaces its five `IconRailGroup` calls with one group of flat icon links to the section landing pages — no chevrons, since there is nothing to expand at 52px wide:

```tsx
const railLinks: NavLink[] = [
  ...allQuickLinks,
  ...(has('leads') ? [{ href: `/${orgSlug}/leads`, label: 'Pipeline', icon: 'pipeline' as NavIconName, active: isActive(pathname, `/${orgSlug}/leads`) }] : []),
  ...(has('events') ? [{ href: `/${orgSlug}`, label: 'Events', icon: 'events' as NavIconName, active: pathname === `/${orgSlug}` }] : []),
  ...(has('invoices') ? [{ href: `/${orgSlug}/money`, label: 'Money', icon: 'invoices' as NavIconName, active: isActive(pathname, `/${orgSlug}/money`) }] : []),
  { href: `/${orgSlug}/catalog`, label: 'Catalog', icon: 'packages' as NavIconName, active: isActive(pathname, `/${orgSlug}/catalog`) },
  { href: `/${orgSlug}/settings`, label: 'Settings', icon: 'settings' as NavIconName, active: settingsActive || isActive(pathname, `/${orgSlug}/settings`) },
]
```

Rendered as `<IconRailGroup items={railLinks} />` inside the existing `collapsed` branch.

- [ ] **Step 4: Wire the layout to fetch upcoming events**

```tsx
// app/(admin)/[orgSlug]/layout.tsx
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { requireOrgMember } from '@/lib/auth/guards'
import { resolveEnabledModules, getIndustryPack, catalogLabel } from '@/lib/industry-packs'
import { listSidebarEvents } from '@/actions/sidebar-events'

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, orgId } = await requireOrgMember(orgSlug)
  const enabledModules = resolveEnabledModules(org.industry_pack_id)
  const upcomingEvents = enabledModules.includes('events') ? await listSidebarEvents(orgId) : []
  return (
    <div className="flex min-h-screen">
      <AdminSidebar
        orgSlug={orgSlug}
        enabledModules={enabledModules}
        catalogLabel={catalogLabel(getIndustryPack(org.industry_pack_id))}
        upcomingEvents={upcomingEvents}
      />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run --exclude '**/.claude/**' --maxWorkers=2`
Expected: PASS. Both sidebar test files must be green. Fix any test that asserted the deleted group labels by removing that assertion, not by restoring the group.

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/layout/AdminSidebar.tsx app/\(admin\)/\[orgSlug\]/layout.tsx __tests__/components/layout/AdminSidebar.test.tsx __tests__/components/AdminSidebar.test.tsx
git commit -m "feat(nav): Option C sidebar IA — flat sections, split-click rows, in-nav job context"
```

---

### Task 10: Retire the duplicate pipeline calendar

**Files:**
- Modify: `components/admin/pipeline/PipelineSubNav.tsx`
- Modify: `__tests__/components/pipeline/PipelineSubNav.test.tsx`
- Delete: `app/(admin)/[orgSlug]/leads/calendar/` (only if it exists and nothing else links to it)

**Interfaces:**
- Produces: `PipelineSubPage` narrows from `'opportunities' | 'calendar' | 'tasks'` to `'opportunities' | 'tasks'`

- [ ] **Step 1: Find every reference to the pipeline calendar**

Run: `grep -rn "leads/calendar\|'calendar'" --include='*.tsx' --include='*.ts' app components __tests__`
Every `PipelineSubNav` call site passing `active="calendar"` must be updated. If `app/(admin)/[orgSlug]/leads/calendar/page.tsx` exists, note it for deletion in Step 4.

- [ ] **Step 2: Update the test**

```tsx
it('renders only Opportunities and Tasks', () => {
  render(<PipelineSubNav orgSlug="acme" active="opportunities" />)
  expect(screen.getByRole('link', { name: /Opportunities/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Tasks/ })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Calendar' })).not.toBeInTheDocument()
})
```

Delete any existing test asserting the Calendar tab.

- [ ] **Step 3: Update the component**

In `components/admin/pipeline/PipelineSubNav.tsx`, change the type on line 3 to `export type PipelineSubPage = 'opportunities' | 'tasks'` and remove the calendar entry from the `tabs` array (line 21). Everything else is unchanged.

- [ ] **Step 4: Remove the route if it exists**

If `app/(admin)/[orgSlug]/leads/calendar/` exists and Step 1 found no remaining links to it:

```bash
git rm -r app/\(admin\)/\[orgSlug\]/leads/calendar
```

- [ ] **Step 5: Run the full suite and build**

Run: `npx vitest run --exclude '**/.claude/**' --maxWorkers=2 && npm run build`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add -A components/admin/pipeline __tests__/components/pipeline app
git commit -m "refactor(pipeline): retire duplicate calendar tab in favour of the top-level calendar"
```

---

### Task 11: Verify in the running app

**Files:** none — verification only.

- [ ] **Step 1: Start the dev server and sign in**

Use the `preview_start` tool with the project's `.claude/launch.json` entry (never `npm run dev` via Bash). Sign in to the demo org.

- [ ] **Step 2: Walk the checklist**

- [ ] Top trio reads Today, Calendar, Clients in that order
- [ ] Clicking the **Money** label lands on `/money` and does not expand the section
- [ ] Clicking the **Money chevron** expands it and does not navigate
- [ ] The same holds for Pipeline, Events, Catalog, Settings
- [ ] Events shows at most 5 rows; any event starting today reads "Today"
- [ ] Clicking an event row opens that job and the business nav stays in place
- [ ] Inside a job, the Events section shows that job's nav plus "All events"
- [ ] `/catalog` lists expiring compliance docs when any exist
- [ ] `/settings` lists unconfigured areas
- [ ] Collapsing the rail still works and persists across reload
- [ ] Keyboard: Tab reaches both the label link and the chevron button on every section
- [ ] The pipeline page shows two tabs, not three

- [ ] **Step 3: Screenshot the sidebar at rest and inside a job**

Save both to `docs/superpowers/walkthroughs/2026-08-15-sidebar-ia/`.

- [ ] **Step 4: Commit the walkthrough**

```bash
git add docs/superpowers/walkthroughs/2026-08-15-sidebar-ia
git commit -m "docs: sidebar IA walkthrough screenshots"
```

---

### Task 12: Port the pipeline filter onto the top-level calendar

**Added mid-execution.** Task 10's review found that `/leads/calendar` was not a duplicate of `/calendar`: it filtered the feed to `PIPELINE_KINDS` (`lead`, `task`, `follow_up`), deliberately excluding booked events, compliance, and invoices, and it showed a count of open opportunities with no date. The top-level calendar shows everything unfiltered and offers neither. Deleting it lost a real capability. This task restores that capability on the surviving calendar, so there is still exactly one calendar. Runs before Task 11.

**Files:**
- Modify: `app/(admin)/[orgSlug]/calendar/page.tsx`
- Create: `components/admin/calendar/CalendarKindFilter.tsx`
- Test: `__tests__/components/calendar/CalendarKindFilter.test.tsx`
- Test: `__tests__/lib/calendar.test.ts` (extend)

**Interfaces:**
- Consumes: `filterFeed(items: CalendarItem[], kinds: CalendarKind[])`, `PIPELINE_KINDS`, `CALENDAR_KINDS`, `CalendarKind` from `@/lib/calendar`; `listLeads(orgId)` from `@/actions/leads`; `OPEN_STAGES` from `@/lib/leads`; `CalendarWeekClient`, which already accepts an optional `footnote?: React.ReactNode` prop
- Produces: `CalendarKindFilter` with props `{ orgSlug: string; active: 'all' | 'pipeline'; week?: string; view?: string }`

The filter is a URL-driven pair of links (`?kinds=pipeline`), not client state — the calendar page is a server component and the week/view params already round-trip through the URL.

- [ ] **Step 1: Write the failing filter-component test**

```tsx
// __tests__/components/calendar/CalendarKindFilter.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CalendarKindFilter } from '@/components/admin/calendar/CalendarKindFilter'

describe('CalendarKindFilter', () => {
  it('links to the unfiltered calendar and the pipeline-only calendar', () => {
    render(<CalendarKindFilter orgSlug="acme" active="all" />)
    expect(screen.getByRole('link', { name: 'Everything' })).toHaveAttribute('href', '/acme/calendar')
    expect(screen.getByRole('link', { name: 'Pipeline only' })).toHaveAttribute('href', '/acme/calendar?kinds=pipeline')
  })

  it('marks the active filter with aria-current', () => {
    render(<CalendarKindFilter orgSlug="acme" active="pipeline" />)
    expect(screen.getByRole('link', { name: 'Pipeline only' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Everything' })).not.toHaveAttribute('aria-current')
  })

  it('preserves the week and view params across a filter change', () => {
    render(<CalendarKindFilter orgSlug="acme" active="all" week="2026-09-07" view="agenda" />)
    expect(screen.getByRole('link', { name: 'Pipeline only' })).toHaveAttribute(
      'href',
      '/acme/calendar?kinds=pipeline&week=2026-09-07&view=agenda',
    )
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run __tests__/components/calendar/CalendarKindFilter.test.tsx --exclude '**/.claude/**' --maxWorkers=2`
Expected: FAIL — cannot resolve `@/components/admin/calendar/CalendarKindFilter`.

- [ ] **Step 3: Write the component**

Two links with a hairline rule, matching the composition rules — no cards, no button row.

```tsx
// components/admin/calendar/CalendarKindFilter.tsx
import Link from 'next/link'

interface CalendarKindFilterProps {
  orgSlug: string
  active: 'all' | 'pipeline'
  week?: string
  view?: string
}

/** URL-driven filter for the one calendar: everything, or pipeline work only. */
export function CalendarKindFilter({ orgSlug, active, week, view }: CalendarKindFilterProps) {
  const href = (kinds?: 'pipeline') => {
    const p = new URLSearchParams()
    if (kinds) p.set('kinds', kinds)
    if (week) p.set('week', week)
    if (view) p.set('view', view)
    const q = p.toString()
    return `/${orgSlug}/calendar${q ? `?${q}` : ''}`
  }

  const tabs: Array<{ key: 'all' | 'pipeline'; label: string; href: string }> = [
    { key: 'all', label: 'Everything', href: href() },
    { key: 'pipeline', label: 'Pipeline only', href: href('pipeline') },
  ]

  return (
    <nav aria-label="Calendar filter" className="flex items-center gap-4 px-5 pt-3 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? 'page' : undefined}
          className={t.key === active ? 'font-semibold' : 'text-muted-foreground hover:text-foreground'}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run __tests__/components/calendar/CalendarKindFilter.test.tsx --exclude '**/.claude/**' --maxWorkers=2`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire the calendar page**

Modify `app/(admin)/[orgSlug]/calendar/page.tsx`. Add `kinds` to the awaited `searchParams`, filter when it is `'pipeline'`, compute the undated-opportunity count in that mode only, and pass both the filter nav and the footnote to `CalendarWeekClient`. Read the deleted page for reference: `git show 0a4ed50:'app/(admin)/[orgSlug]/leads/calendar/page.tsx'`.

Key fragments:

```tsx
const [{ orgSlug }, { week, view, kinds }] = await Promise.all([params, searchParams])
const pipelineOnly = kinds === 'pipeline'

const [feed, icsToken, leads] = await Promise.all([
  getCalendarFeed(orgId, orgSlug),
  ensureIcsToken(orgId),
  pipelineOnly ? listLeads(orgId) : Promise.resolve([]),
])

const items = pipelineOnly ? filterFeed(feed, PIPELINE_KINDS) : feed
const undated = pipelineOnly
  ? leads.filter((l) => (OPEN_STAGES as (typeof l.stage)[]).includes(l.stage) && !l.event_date).length
  : 0
```

The footnote must carry its own interpretation and handle singular/plural and zero — a bare count is decoration:

```tsx
footnote={
  pipelineOnly && undated > 0 ? (
    <span>
      {undated} open opportunit{undated === 1 ? 'y has' : 'ies have'} no date yet — they will not appear on any week.
    </span>
  ) : undefined
}
```

`searchParams` type becomes `Promise<{ week?: string; view?: string; kinds?: string }>`.

- [ ] **Step 6: Extend the calendar lib test**

Add to `__tests__/lib/calendar.test.ts` a test proving `filterFeed(feed, PIPELINE_KINDS)` keeps `lead`/`task`/`follow_up` and drops `event`/`compliance`/`invoice_due`. This pins the behavior that was previously only exercised by the deleted page.

- [ ] **Step 7: Run the full suite and build**

Run: `npx vitest run --exclude '**/.claude/**' --maxWorkers=2 && npm run build`
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add app components __tests__
git commit -m "feat(calendar): pipeline-only filter and undated-opportunity count on the single calendar"
```

---

## Deferred

Recorded so they are not silently dropped:

- **Today-vs-Calendar ordering** is inferred, not measured. One real week of BrewTrax usage settles it.
- **Job switcher in the page header** — only if hopping between two live jobs turns out to be frequent. The pinned sidebar list was explicitly rejected as clutter.
- **Sub-grouping Settings' nine children** into Business / Team / Account if the expanded section proves too tall.
- **Renaming Events to Jobs** — merited by the positioning thesis, but it touches `ModuleId`, routes, and terminology config. Separate decision, separate plan.
