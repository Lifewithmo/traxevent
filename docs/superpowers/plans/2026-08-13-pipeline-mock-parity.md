# Pipeline & Sidebar Mock Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring production's sidebar IA and pipeline page to parity with the design mock — spec `docs/superpowers/specs/2026-08-13-pipeline-mock-parity-design.md`.

**Architecture:** Pure-lib copy changes in `lib/pipeline-view.ts` (+ delegation to `lib/pipeline-stats.ts`), a restructured `AdminSidebar`, a 4th KPI + retitled 12-month chart in `PipelineStatsHeader`, and board/list polish including a new shared `ClosedMonthSummary` component. No schema or action changes.

**Tech Stack:** Next.js App Router (this repo's Next has breaking changes — read `node_modules/next/dist/docs/` before writing Next-specific code), TypeScript, Vitest + Testing Library.

## Global Constraints

- The branch is not green until both `npx vitest run` AND `npx next build` pass. Pre-existing tsc error in `__tests__/lib/calendar-feed.test.ts` exists on main — ignore it, never fix it here.
- Never re-export a type from a `'use server'` module.
- All work in github.com/Lifewithmo/traxevent only; pushing requires `gh auth switch` to Lifewithmo.
- Exact user-facing copy is normative: statusLines in spec §6, KPI labels in §4, summary sentence in §5. Do not paraphrase.
- Module gating pattern is `has(m) = !enabledModules || enabledModules.includes(m)` — new links follow it.

---

### Task 1: Health copy + closedThisMonth delegation (pure libs)

**Files:**
- Modify: `lib/pipeline-view.ts:56-76` (statusLines), `lib/pipeline-view.ts:95-102` (closedThisMonth)
- Modify: `__tests__/lib/pipeline-view.test.ts` (expectations)
- Modify: `__tests__/lib/pipeline-stats.test.ts` (add 12-month case)

**Interfaces:**
- Consumes: `wonValueInMonth(leads, ym)` from `@/lib/pipeline-stats` (existing).
- Produces: `PipelineRow.statusLine` strings in the new voice (exact strings below) — Tasks 3–4 render them verbatim; `closedThisMonth` keeps its exact return shape `{ wonCount, wonValue, lostCount, lostValue }`.

- [ ] **Step 1: Update the failing test expectations**

In `__tests__/lib/pipeline-view.test.ts` change exactly these three assertions (line numbers approximate — match on the old strings):

```ts
expect(g.needs_attention[0].statusLine).toBe('No next step — last touched 11 days ago')
```
(replaces `'Sep 4 · 60 guests · no task, no touch in 11 days'`)

```ts
expect(g.needs_attention[0].statusLine).toBe('Proposal sent 9 days ago — no opens')
```
(replaces BOTH occurrences of `'proposal sent 9 days ago, unopened'`)

```ts
expect(g.waiting[0].statusLine).toBe('Waiting on them — PO number · follow up 2026-08-09')
```
(replaces `'Waiting: PO number · follow up 2026-08-09'`)

The `'Next: Send options · due 2026-08-07'` assertion is unchanged.

In `__tests__/lib/pipeline-stats.test.ts` add:

```ts
it('backlogByMonth spans 12 months and wraps the year', () => {
  const rows = backlogByMonth([], '2026-08-13', 12)
  expect(rows).toHaveLength(12)
  expect(rows[0]).toMatchObject({ ym: '2026-08', label: 'Aug' })
  expect(rows[11]).toMatchObject({ ym: '2027-07', label: 'Jul' })
})
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run __tests__/lib/pipeline-view.test.ts __tests__/lib/pipeline-stats.test.ts`
Expected: the three copy assertions FAIL against old strings; the 12-month test PASSES already (the param exists) — that's fine, it pins the contract Task 3 relies on.

- [ ] **Step 3: Implement the copy changes in `lib/pipeline-view.ts`**

Replace the unopened-proposal statusLine (line 60):
```ts
          statusLine: `Proposal sent ${n} day${n === 1 ? '' : 's'} ago — no opens`,
```

Replace the no-task branch (lines 63-69) with:
```ts
      } else {
        const quiet = daysSince(lastTouchIso(lead), today)
        groups.needs_attention.push({
          lead, health, quickAction: 'set_next_step',
          statusLine: `No next step — last touched ${quiet} day${quiet === 1 ? '' : 's'} ago`,
        })
      }
```
(The dropped date/guests fragment survives elsewhere: board subtitle + list badges. If `shortDate` becomes unused after this, delete it.)

Replace the waiting statusLine (line 75):
```ts
        statusLine: `Waiting on them — ${w.reason}${w.follow_up_date ? ` · follow up ${w.follow_up_date}` : ''}`,
```

Replace `closedThisMonth` (lines 95-102) with:
```ts
export function closedThisMonth(leads: Lead[], today: string) {
  const month = today.slice(0, 7)
  const won = wonValueInMonth(leads, month)
  const lost = leads.filter((l) => l.stage === 'closed_lost' && l.closed_at?.slice(0, 7) === month)
  return {
    wonCount: won.count,
    wonValue: won.value,
    lostCount: lost.length,
    lostValue: lost.reduce((s, l) => s + (l.estimated_value ?? 0), 0),
  }
}
```
and add to the imports at the top:
```ts
import { wonValueInMonth } from '@/lib/pipeline-stats'
```
(pipeline-stats does not import pipeline-view — no cycle.)

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run __tests__/lib/pipeline-view.test.ts __tests__/lib/pipeline-stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline-view.ts __tests__/lib/pipeline-view.test.ts __tests__/lib/pipeline-stats.test.ts
git commit -m "feat(pipeline): mock-voice health copy; closedThisMonth delegates to wonValueInMonth"
```

---

### Task 2: Sidebar IA + forms module

**Files:**
- Modify: `lib/industry-packs.ts` (ModuleId union :3-6, `ALL_CURRENT_MODULES` :23-26, every `modules:` array in `BUILT_IN_PACKS`)
- Modify: `components/layout/AdminSidebar.tsx:92-106` (link lists) and `:208-237` (sections)
- Test: `__tests__/components/layout/AdminSidebar.test.tsx`, `__tests__/lib/industry-packs.test.ts`

**Interfaces:**
- Consumes: existing `has()` gating and `Section` helper.
- Produces: `'forms'` as a valid `ModuleId` enabled for every built-in pack; sidebar sections per spec §3. Nothing downstream consumes new exports.

- [ ] **Step 1: Add the `'forms'` module id**

In `lib/industry-packs.ts`:
1. Union (line 3-6): change the shipped-modules line to
```ts
  | 'events' | 'registrants' | 'vendors' | 'calendar' | 'reports' | 'forms'
```
2. Append `'forms'` to `ALL_CURRENT_MODULES`.
3. Append `'forms'` to the `modules:` array of EVERY pack in `BUILT_IN_PACKS` that lists modules explicitly (the forms page is reachable by all orgs today; no pack may lose it).

- [ ] **Step 2: Restructure `AdminSidebar.tsx`**

1. Replace the `quickLinks` list (lines 92-95) with (order is the mock's; Events is handled separately because it needs exact-match):
```ts
  const quickLinks = [
    { module: 'calendar' as ModuleId, label: 'Calendar', slug: 'calendar' },
    { module: 'clients' as ModuleId, label: 'Clients', slug: 'clients' },
    { module: 'leads' as ModuleId, label: 'Today', slug: 'today' },
    { module: 'registrants' as ModuleId, label: 'Registrants', slug: 'registrants' },
  ].filter((l) => has(l.module))
```
2. Delete the `eventLinks` list (lines 102-106).
3. In the Quick Links section render, insert the Events link (exact-match class) between Clients and Today:
```tsx
          {(quickLinks.length > 0 || has('events')) && (
            <Section label="Quick Links">
              {quickLinks.slice(0, 2).map((l) => (
                <Link key={l.slug} href={`/${orgSlug}/${l.slug}`} className={navClass(`/${orgSlug}/${l.slug}`)}>
                  {l.label}
                </Link>
              ))}
              {has('events') && (
                <Link href={`/${orgSlug}`} className={exactNavClass(`/${orgSlug}`)}>
                  Events
                </Link>
              )}
              {quickLinks.slice(2).map((l) => (
                <Link key={l.slug} href={`/${orgSlug}/${l.slug}`} className={navClass(`/${orgSlug}/${l.slug}`)}>
                  {l.label}
                </Link>
              ))}
            </Section>
          )}
```
(`slice(0, 2)` / `slice(2)` split around the two mock positions before Events — Calendar, Clients — then Today, Registrants after. The slice boundaries refer to the UNFILTERED intent; since `.filter` may remove gated items, compute the split by slug instead:)
```ts
  const beforeEvents = quickLinks.filter((l) => l.slug === 'calendar' || l.slug === 'clients')
  const afterEvents = quickLinks.filter((l) => l.slug === 'today' || l.slug === 'registrants')
```
and map `beforeEvents` / `afterEvents` in place of the slices.
4. Delete the whole Events `<Section>` (lines 208-221).
5. Replace the Operations IIFE's `opsLinks` (lines 224-227) with:
```ts
            const opsLinks = [
              ...(has('vendors') ? [{ label: 'Vendors', slug: 'vendors' }] : []),
              ...(has('catalog') ? [{ label: catalogLabel ?? 'Packages', slug: 'packages' }] : []),
              ...(has('forms') ? [{ label: 'Forms', slug: 'forms' }] : []),
              ...(has('compliance') ? [{ label: 'Compliance', slug: 'compliance' }] : []),
            ]
```

- [ ] **Step 3: Update tests, run**

Run: `npx vitest run __tests__/components/layout/AdminSidebar.test.tsx __tests__/lib/industry-packs.test.ts`
Update failing assertions to the new structure — the tests must end up asserting: Quick Links order Calendar → Clients → Events → Today (→ Registrants when gated in); no "Events" section label; Operations contains Vendors, Forms (and Packages/Compliance when their modules are on); a pack-module test accepting `'forms'` in every built-in pack. Add a case if none covers Operations content:
```ts
expect(within(operationsSection).getByText('Vendors')).toBeInTheDocument()
expect(within(operationsSection).getByText('Forms')).toBeInTheDocument()
```
Expected: PASS after updates.

- [ ] **Step 4: Commit**

```bash
git add lib/industry-packs.ts components/layout/AdminSidebar.tsx __tests__/components/layout/AdminSidebar.test.tsx __tests__/lib/industry-packs.test.ts
git commit -m "feat(nav): mock-parity sidebar — Operations gains Vendors+Forms, Events folds into Quick Links"
```

---

### Task 3: Stats header — Open pipeline KPI + 12-month chart

**Files:**
- Modify: `components/admin/pipeline/PipelineStatsHeader.tsx`
- Modify: `app/(admin)/[orgSlug]/leads/page.tsx:51-57`
- Test: create `__tests__/components/admin/pipeline/PipelineStatsHeader.test.tsx`

**Interfaces:**
- Consumes: `backlogByMonth(leads, today, 12)` (Task 1 pinned the 12-month contract).
- Produces: `PipelineHeaderStats` gains `openPipeline: { count: number; value: number }` — the page must supply it.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/admin/pipeline/PipelineStatsHeader.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineStatsHeader } from '@/components/admin/pipeline/PipelineStatsHeader'

const stats = {
  bookedThisMonth: { count: 2, value: 6300 },
  bookedLastYearSameMonth: { count: 1, value: 5385 },
  bookedNext90: { count: 5, value: 18450 },
  openPipeline: { count: 5, value: 16350 },
  needsActionCount: 2,
  backlog: Array.from({ length: 12 }, (_, i) => ({
    ym: `2026-${String(i + 1).padStart(2, '0')}`, label: 'M', booked: 0, open: 0,
  })),
}

describe('PipelineStatsHeader', () => {
  it('renders all four KPIs including open pipeline', () => {
    render(<PipelineStatsHeader stats={stats} />)
    expect(screen.getByText('Booked this month')).toBeInTheDocument()
    expect(screen.getByText('Open pipeline')).toBeInTheDocument()
    expect(screen.getByText('$16,350')).toBeInTheDocument()
    expect(screen.getByText('5 opportunities')).toBeInTheDocument()
    expect(screen.getByText('up 17% vs this month last year')).toBeInTheDocument()
  })

  it('titles the chart Revenue by month with the rolling-12 legend', () => {
    render(<PipelineStatsHeader stats={stats} />)
    expect(screen.getByText('Revenue by month')).toBeInTheDocument()
    expect(screen.getByText('rolling 12 months · solid booked · light open')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/components/admin/pipeline/PipelineStatsHeader.test.tsx`
Expected: FAIL — `openPipeline` not in type / "Open pipeline" not rendered.

- [ ] **Step 3: Implement**

In `PipelineStatsHeader.tsx`:
1. Add to `PipelineHeaderStats` after `bookedNext90`:
```ts
  openPipeline: { count: number; value: number }
```
2. Destructure it (line 24) and change the grid (line 29) to `sm:grid-cols-2 lg:grid-cols-4`.
3. Insert between the booked-ahead card and the needs-action card:
```tsx
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Open pipeline</p>
            <p className="text-2xl font-semibold">{money(openPipeline.value)}</p>
            <p className="text-xs text-muted-foreground">
              {`${openPipeline.count} opportunit${openPipeline.count === 1 ? 'y' : 'ies'}`}
            </p>
          </CardContent>
        </Card>
```
4. Chart title (line 63) → `Revenue by month`; legend (line 64) → `rolling 12 months · solid booked · light open`.

In `app/(admin)/[orgSlug]/leads/page.tsx`, update the `stats` object (lines 51-57):
```ts
  const stats = {
    bookedThisMonth: wonValueInMonth(leads, ym),
    bookedLastYearSameMonth: wonValueInMonth(leads, addMonths(ym, -12)),
    bookedNext90: bookedAhead(leads, today),
    openPipeline: { count: open.length, value: openValue },
    needsActionCount: groups.needs_attention.length,
    backlog: backlogByMonth(leads, today, 12),
  }
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run __tests__/components/admin/pipeline/PipelineStatsHeader.test.tsx`
Expected: PASS. Also `npx tsc --noEmit` shows no NEW errors (calendar-feed pre-exists).

- [ ] **Step 5: Commit**

```bash
git add components/admin/pipeline/PipelineStatsHeader.tsx "app/(admin)/[orgSlug]/leads/page.tsx" __tests__/components/admin/pipeline/PipelineStatsHeader.test.tsx
git commit -m "feat(pipeline): open-pipeline KPI, 12-month Revenue by month chart"
```

---

### Task 4: Board & list polish + ClosedMonthSummary + intake dedupe

**Files:**
- Create: `components/admin/pipeline/ClosedMonthSummary.tsx`
- Modify: `components/admin/pipeline/PipelineBoardView.tsx` (:101-104 header, :118-124 card, :144-146 footer, :152-156 summary)
- Modify: `components/admin/pipeline/PipelineListClient.tsx` (:63 statusLine, :145-147 intake dedupe, end of component summary)
- Test: create `__tests__/components/admin/pipeline/PipelineListClient.test.tsx`

**Interfaces:**
- Consumes: `PipelineRow.health`/`statusLine` (Task 1), `closedThisMonth` shape.
- Produces: `ClosedMonthSummary({ orgSlug, monthly })` — a `<p>` with the exact sentence both views share.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/admin/pipeline/PipelineListClient.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineListClient } from '@/components/admin/pipeline/PipelineListClient'
import type { Lead } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/actions/nudge', () => ({ nudgeProposal: vi.fn() }))
vi.mock('@/actions/intake', () => ({ getIntakeLink: vi.fn(), regenerateIntakeLink: vi.fn() }))

const lead = (over: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Halcyon Studios', stage: 'proposal', created_at: 't', updated_at: 't', ...over,
} as Lead)

const baseProps = {
  orgId: 'o1', orgSlug: 'demo',
  groups: {
    needs_attention: [{ lead: lead({}), health: 'needs_attention' as const, statusLine: 'Proposal sent 6 days ago — no opens' }],
    waiting: [], active: [],
  },
  closed: [],
  openCount: 1, openValue: 4800,
  monthly: { wonCount: 2, wonValue: 6300, lostCount: 1, lostValue: 800 },
}

describe('PipelineListClient', () => {
  it('renders exactly one intake link control block', () => {
    const { container } = render(<PipelineListClient {...baseProps} />)
    expect(screen.getAllByRole('button', { name: 'Intake link' })).toHaveLength(1)
    expect(container.querySelectorAll('[data-intake-card]').length).toBeLessThanOrEqual(1)
  })

  it('shows the won/lost month summary', () => {
    render(<PipelineListClient {...baseProps} />)
    expect(screen.getByText(/Won this month: 2 · \$6,300/)).toBeInTheDocument()
    expect(screen.getByText(/Lost: 1 · \$800 · archived/)).toBeInTheDocument()
  })

  it('renders a needs-attention statusLine in the destructive tone', () => {
    render(<PipelineListClient {...baseProps} />)
    const line = screen.getByText('Proposal sent 6 days ago — no opens')
    expect(line.className).toContain('text-destructive')
  })
})
```

Adjust the two `vi.mock` action paths to whatever `IntakeLinkCard` actually imports (open the file; mock every server-action module it pulls in). If `IntakeLinkCard`'s root element lacks a hook for counting, add `data-intake-card` to its root as part of this task.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/components/admin/pipeline/PipelineListClient.test.tsx`
Expected: FAIL — no summary text in list view; statusLine not destructive (and possibly two intake buttons if the duplicate renders its own).

- [ ] **Step 3: Implement**

1. Create `components/admin/pipeline/ClosedMonthSummary.tsx`:
```tsx
import Link from 'next/link'
import type { closedThisMonth } from '@/lib/pipeline-view'

const money = (n: number) => `$${n.toLocaleString()}`

export function ClosedMonthSummary({
  orgSlug, monthly,
}: { orgSlug: string; monthly: ReturnType<typeof closedThisMonth> }) {
  return (
    <p className="text-sm text-muted-foreground">
      Won this month: {monthly.wonCount} · {money(monthly.wonValue)} — moved to{' '}
      <Link href={`/${orgSlug}/calendar`} className="underline underline-offset-4">Events</Link>
      {' '}· Lost: {monthly.lostCount} · {money(monthly.lostValue)} · archived
    </p>
  )
}
```
2. `PipelineBoardView.tsx`:
   - Replace the inline summary `<p>` (lines 152-156) with `<ClosedMonthSummary orgSlug={orgSlug} monthly={monthly} />` (+ import).
   - Column header (lines 101-104): replace the `<Badge>` with
```tsx
                <span className="text-xs text-muted-foreground">{`${cards.length} · ${money(value)}`}</span>
```
     and delete the footer `<p>` (lines 144-146). Remove the now-unused `Badge` import if nothing else uses it.
   - Card (lines 121-124): title line gains the dot; statusLine gains conditional tone:
```tsx
                          <p className="flex items-center gap-1.5 text-sm font-medium">
                            {row.health === 'needs_attention' && (
                              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                            )}
                            {opportunityTitle(lead)}
                          </p>
```
```tsx
                          <p className={`truncate text-xs ${row.health === 'needs_attention' ? 'text-destructive' : 'text-muted-foreground'}`}>{row.statusLine}</p>
```
3. `PipelineListClient.tsx`:
   - Delete the duplicate `<IntakeLinkCard …/>` (line 147).
   - statusLine (line 63) becomes:
```tsx
            <p className={`text-xs ${row.health === 'needs_attention' ? 'text-destructive' : 'text-muted-foreground'}`}>{row.statusLine}</p>
```
   - After the closed-tab block (line 217), before the closing `</div>`, add `<ClosedMonthSummary orgSlug={orgSlug} monthly={monthly} />` (+ import).

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run __tests__/components/admin/pipeline/`
Expected: PASS (including the pre-existing customer-picker / new-opportunity tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/pipeline/ __tests__/components/admin/pipeline/
git commit -m "feat(pipeline): column totals in headers, shared won/lost summary, health tone, intake card dedupe"
```

---

### Task 5: Full verification

**Files:** none — whole-repo checks.

**Interfaces:** consumes everything above; produces a green branch.

- [ ] **Step 1:** `npx vitest run` — all pass.
- [ ] **Step 2:** `npx tsc --noEmit` — only the pre-existing `__tests__/lib/calendar-feed.test.ts` error; then `npx next build` — succeeds.
- [ ] **Step 3:** `git status` — commit any stragglers or confirm clean.
