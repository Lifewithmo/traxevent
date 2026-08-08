# Pipeline & Opportunity Detail Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stage-column pipeline with a health-grouped list (default) + three-open-column board, and recompose the opportunity page per wireframes 12a/12b/12c — including lost reasons, waiting, guest count, last-touch, proposal open tracking, and Nudge.

**Architecture:** Pure display logic lands in `lib/` (tested with vitest); server actions stamp new denormalized fields (`last_touch_at`, `closed_at`, proposal open stamps) at existing choke points; the pipeline page becomes a server component that assembles per-lead rows and renders one of two client views; the opportunity page keeps its existing panels and changes composition only.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Firestore via firebase-admin, vitest + testing-library, Resend for email, shadcn-style UI components in `components/ui`.

**Spec:** `docs/superpowers/specs/2026-08-07-pipeline-redesign-design.md`

## Global Constraints

- **Read `node_modules/next/dist/docs/` before writing Next-specific code** — this Next version has breaking changes vs. training data (AGENTS.md).
- **Never re-export a type from a `'use server'` module** — `tsc` passes but `next build` fails. Types go in `lib/`.
- **`next build` must pass before the branch is called green** (needs `.env.local` copied into the worktree).
- Execute in a worktree; after `EnterWorktree`, reset to local `main` (worktrees branch from `origin/main`, which is missing local-only commits — including the spec this plan implements). Run `npm install` there; run tests as `npx vitest run --exclude '**/.claude/**'`.
- Push with the `Lifewithmo` gh account (`gh auth switch`) — the default account 403s.
- All new Lead/Proposal fields are optional; no backfill/migration.
- Money display: `$` + `toLocaleString()` (matches existing `money` helper).
- Commit after every task; commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| `lib/types.ts` (modify) | `LostReason`, Lead/Proposal field additions, ActivityEvent kinds |
| `lib/leads.ts` (modify) | `LOST_REASONS` / `LOST_REASON_LABELS`, `closedAtPatch` |
| `lib/opportunity-detail.ts` (modify) | `daysSince`, `lastTouchIso`, `convertBlockReason` |
| `lib/proposal-opens.ts` (create) | `isProposalOpened`, `openStampPatch` (throttle rule) |
| `lib/pipeline-view.ts` (create) | row building: health groups, status sentences, countdowns, monthly won/lost rollup |
| `lib/activity.ts` (modify) | stamp `last_touch_at` on the lead inside `logActivity` |
| `lib/email.ts` (modify) | `sendProposalNudge` |
| `actions/leads.ts` (modify) | `markLeadLost`, closed-at stamping, `guest_count` input |
| `lib/crm/leads.ts` (modify) | `LeadUpdate.guest_count`, `closed_at`, `lost` passthrough |
| `actions/proposals-public.ts` (modify) | `recordProposalView` stamps open fields |
| `actions/nudge.ts` (create) | `nudgeProposal` server action |
| `app/(admin)/[orgSlug]/leads/page.tsx` (rewrite) | server assembly: leads + per-lead tasks/proposals → rows; view switch |
| `components/admin/pipeline/PipelineListClient.tsx` (create) | 12a list: tabs, health groups, quick actions |
| `components/admin/pipeline/PipelineBoardView.tsx` (create) | 12b board: three open columns, won/lost strip, drag + select |
| `components/admin/pipeline/NewOpportunityForm.tsx` (create) | extracted create form + guest count |
| `components/admin/LeadsBoardClient.tsx` (delete in final task) | superseded |
| `components/admin/opportunity/MarkLostDialog.tsx` (create) | one-tap lost reason + note |
| `components/admin/opportunity/StageMenu.tsx` (create) | Move stage menu; won → convert prompt |
| `components/admin/opportunity/FactsGrid.tsx` (create) | read-only facts + Edit toggle wrapping existing form |
| `components/admin/opportunity/MarkWaitingForm.tsx` (create) | reason + follow-up date popover for the banner |
| `components/admin/OpportunityDetailClient.tsx` (modify) | new header/composition |
| `components/admin/opportunity/NextActionBanner.tsx` (modify) | Mark as waiting, Resume, last-touch |
| `components/admin/opportunity/ContactCard.tsx` (modify) | horizontal variant + returning-client line |
| `components/admin/opportunity/ConvertToWorkCard.tsx` (modify) | always visible, block reason, auto-open on `?convert=1` |

---

### Task 1: Types, lost reasons, closed-at patch

**Files:**
- Modify: `lib/types.ts` (Lead ~:395, Proposal ~:extra fields, ActivityEvent kind)
- Modify: `lib/leads.ts`
- Test: `__tests__/lib/leads.test.ts` (exists — append)

**Interfaces:**
- Produces: `LostReason`, `Lead.guest_count?/last_touch_at?/closed_at?/lost?`, `Proposal.first_opened_at?/last_opened_at?`, `ActivityEvent.kind` ∪ `'lost' | 'nudge'`, `LOST_REASONS: { value: LostReason; label: string }[]`, `LOST_REASON_LABELS: Record<LostReason, string>`, `closedAtPatch(prev: LeadStage, next: LeadStage, nowIso: string): { closed_at?: string | null }`

- [ ] **Step 1: Write the failing tests** (append to `__tests__/lib/leads.test.ts`)

```ts
import { closedAtPatch, LOST_REASON_LABELS } from '@/lib/leads'

describe('closedAtPatch', () => {
  const now = '2026-08-07T20:00:00.000Z'
  it('stamps closed_at when entering a closed stage from an open one', () => {
    expect(closedAtPatch('proposal', 'closed_won', now)).toEqual({ closed_at: now })
    expect(closedAtPatch('inquiry', 'closed_lost', now)).toEqual({ closed_at: now })
  })
  it('clears closed_at when reopening', () => {
    expect(closedAtPatch('closed_won', 'proposal', now)).toEqual({ closed_at: null })
  })
  it('is a no-op when the closed-ness does not change', () => {
    expect(closedAtPatch('inquiry', 'consultation', now)).toEqual({})
    expect(closedAtPatch('closed_won', 'closed_lost', now)).toEqual({})
  })
})

describe('LOST_REASON_LABELS', () => {
  it('labels all four reasons', () => {
    expect(LOST_REASON_LABELS.over_budget).toBe('Over budget')
    expect(LOST_REASON_LABELS.went_elsewhere).toBe('Went elsewhere')
    expect(LOST_REASON_LABELS.date_fell_through).toBe('Date fell through')
    expect(LOST_REASON_LABELS.no_response).toBe('No response')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/lib/leads.test.ts` → FAIL (`closedAtPatch` not exported).

- [ ] **Step 3: Implement.** In `lib/types.ts`:

```ts
export type LostReason = 'over_budget' | 'went_elsewhere' | 'date_fell_through' | 'no_response'
```

Add to `interface Lead` (after `waiting?`):

```ts
  guest_count?: number     // estimated guests; prefills convert headcount
  last_touch_at?: string   // ISO; stamped by logActivity; fallback updated_at ?? created_at
  closed_at?: string       // ISO; stamped entering closed_won/closed_lost, cleared on reopen
  lost?: { reason: LostReason; note?: string }
```

Add to `interface Proposal` (after `client_response_at?`):

```ts
  first_opened_at?: string // first portal view of a sent proposal
  last_opened_at?: string  // latest portal view; throttled to one write per hour
```

Extend `ActivityEvent.kind` union with `'lost' | 'nudge'`. In `lib/leads.ts`:

```ts
import type { Lead, LeadStage, LostReason } from '@/lib/types'

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  over_budget: 'Over budget',
  went_elsewhere: 'Went elsewhere',
  date_fell_through: 'Date fell through',
  no_response: 'No response',
}
export const LOST_REASONS = (Object.entries(LOST_REASON_LABELS) as [LostReason, string][])
  .map(([value, label]) => ({ value, label }))

/** closed_at delta for a stage transition; {} when closed-ness is unchanged. */
export function closedAtPatch(prev: LeadStage, next: LeadStage, nowIso: string): { closed_at?: string | null } {
  const wasClosed = CLOSED_STAGES.includes(prev)
  const isClosed = CLOSED_STAGES.includes(next)
  if (!wasClosed && isClosed) return { closed_at: nowIso }
  if (wasClosed && !isClosed) return { closed_at: null }
  return {}
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run __tests__/lib/leads.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(crm): lost reasons, guest count, closed-at/last-touch fields`

---

### Task 2: Last-touch stamping + date helpers

**Files:**
- Modify: `lib/activity.ts` (`logActivity`)
- Modify: `lib/opportunity-detail.ts`
- Test: `__tests__/lib/opportunity-detail.test.ts` (exists — append)

**Interfaces:**
- Produces: `daysSince(iso: string, todayYmd: string): number`, `lastTouchIso(lead: Pick<Lead, 'last_touch_at' | 'updated_at' | 'created_at'>): string`. `logActivity` additionally best-effort-updates `leads/{parent_id}.last_touch_at` when `parent_type === 'opportunity'`.

- [ ] **Step 1: Write the failing tests** (append):

```ts
import { daysSince, lastTouchIso } from '@/lib/opportunity-detail'

describe('daysSince', () => {
  it('counts whole calendar days from the ISO date part', () => {
    expect(daysSince('2026-07-27T15:00:00.000Z', '2026-08-07')).toBe(11)
    expect(daysSince('2026-08-07T01:00:00.000Z', '2026-08-07')).toBe(0)
  })
})

describe('lastTouchIso', () => {
  it('prefers last_touch_at, then updated_at, then created_at', () => {
    expect(lastTouchIso({ last_touch_at: 'a', updated_at: 'b', created_at: 'c' })).toBe('a')
    expect(lastTouchIso({ updated_at: 'b', created_at: 'c' })).toBe('b')
    expect(lastTouchIso({ created_at: 'c' })).toBe('c')
  })
})
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** In `lib/opportunity-detail.ts` (near `addDays`):

```ts
/** Whole calendar days between an ISO timestamp's date part and todayYmd. */
export function daysSince(iso: string, todayYmd: string): number {
  const a = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).getTime()
  const b = new Date(`${todayYmd}T00:00:00.000Z`).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export function lastTouchIso(lead: { last_touch_at?: string; updated_at?: string; created_at: string }): string {
  return lead.last_touch_at ?? lead.updated_at ?? lead.created_at
}
```

In `lib/activity.ts`, inside `logActivity`'s existing try block, after the activity write:

```ts
    if (e.parent_type === 'opportunity') {
      // Denormalized freshness signal for the pipeline; best-effort like the rest.
      await adminDb.collection('orgs').doc(orgId).collection('leads')
        .doc(e.parent_id).update({ last_touch_at: created_at })
        .catch(() => {})
    }
```

(Keep it inside the outer try/catch; a missing lead doc must not throw.)

- [ ] **Step 4: Run to verify pass** — `npx vitest run __tests__/lib/opportunity-detail.test.ts`.
- [ ] **Step 5: Commit** — `feat(crm): stamp last_touch_at from activity log`

---

### Task 3: Proposal open tracking

**Files:**
- Create: `lib/proposal-opens.ts`
- Modify: `actions/proposals-public.ts` (`recordProposalView`, ~:229)
- Test: `__tests__/lib/proposal-opens.test.ts` (create)

**Interfaces:**
- Produces: `isProposalOpened(p: Pick<Proposal, 'first_opened_at' | 'events'>): boolean`, `openStampPatch(p: Pick<Proposal, 'first_opened_at' | 'last_opened_at'>, nowIso: string): { first_opened_at?: string; last_opened_at?: string }`

- [ ] **Step 1: Write the failing tests:**

```ts
import { describe, it, expect } from 'vitest'
import { isProposalOpened, openStampPatch } from '@/lib/proposal-opens'

describe('isProposalOpened', () => {
  it('true with a first_opened_at stamp or a legacy viewed event', () => {
    expect(isProposalOpened({ first_opened_at: '2026-08-01T00:00:00.000Z' })).toBe(true)
    expect(isProposalOpened({ events: [{ kind: 'viewed', at: 'x' }] })).toBe(true)
    expect(isProposalOpened({ events: [{ kind: 'sent', at: 'x' }] })).toBe(false)
    expect(isProposalOpened({})).toBe(false)
  })
})

describe('openStampPatch', () => {
  const now = '2026-08-07T20:00:00.000Z'
  it('sets both stamps on first open', () => {
    expect(openStampPatch({}, now)).toEqual({ first_opened_at: now, last_opened_at: now })
  })
  it('updates last_opened_at when the previous open is over an hour old', () => {
    expect(openStampPatch({ first_opened_at: 'a', last_opened_at: '2026-08-07T18:59:00.000Z' }, now))
      .toEqual({ last_opened_at: now })
  })
  it('is empty within the one-hour throttle', () => {
    expect(openStampPatch({ first_opened_at: 'a', last_opened_at: '2026-08-07T19:30:00.000Z' }, now))
      .toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** `lib/proposal-opens.ts`:

```ts
import type { Proposal } from '@/lib/types'

const HOUR_MS = 3_600_000

export function isProposalOpened(p: Pick<Proposal, 'first_opened_at' | 'events'>): boolean {
  return !!p.first_opened_at || (p.events ?? []).some((e) => e.kind === 'viewed')
}

/** Fields to write for a portal view at nowIso; {} when inside the 1h throttle. */
export function openStampPatch(
  p: Pick<Proposal, 'first_opened_at' | 'last_opened_at'>,
  nowIso: string
): { first_opened_at?: string; last_opened_at?: string } {
  if (!p.first_opened_at) return { first_opened_at: nowIso, last_opened_at: nowIso }
  const last = p.last_opened_at ? new Date(p.last_opened_at).getTime() : 0
  if (new Date(nowIso).getTime() - last >= HOUR_MS) return { last_opened_at: nowIso }
  return {}
}
```

In `actions/proposals-public.ts` `recordProposalView`, after the existing `events` arrayUnion update line, merge the stamp into the same update call instead of a second write:

```ts
    const stamp = openStampPatch(proposal, now)
    await doc.ref.update({
      events: FieldValue.arrayUnion({ kind: 'viewed', at: now, ...ctx }),
      ...stamp,
    })
```

(Import `openStampPatch` from `@/lib/proposal-opens` — a plain lib module, safe to import from the `'use server'` file; do not re-export its types.)

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `feat(proposals): first/last-opened stamps on portal views`

---

### Task 4: Pipeline row building (`lib/pipeline-view.ts`)

**Files:**
- Create: `lib/pipeline-view.ts`
- Test: `__tests__/lib/pipeline-view.test.ts` (create)

**Interfaces:**
- Consumes: `computeHealth`, `nextAction` (`@/lib/opportunity-health`); `daysSince`, `lastTouchIso`, `dueStatus` (`@/lib/opportunity-detail`); `isProposalOpened` (`@/lib/proposal-opens`); `opportunityTitle` (`@/lib/leads`)
- Produces:

```ts
export interface PipelineRow {
  lead: Lead
  health: OppHealth
  statusLine: string
  countdown?: string                       // 'Today' | 'in N days' | 'N days overdue'
  quickAction?: 'set_next_step' | 'nudge'
}
export interface PipelineGroups {
  needs_attention: PipelineRow[]
  waiting: PipelineRow[]
  active: PipelineRow[]
}
export function countdownLabel(dueYmd: string, today: string): string
export function buildPipelineRows(
  inputs: Array<{ lead: Lead; tasks: Task[]; proposals: Proposal[] }>,
  today: string
): PipelineGroups
export function closedThisMonth(leads: Lead[], today: string): {
  wonCount: number; wonValue: number; lostCount: number; lostValue: number
}
```

- [ ] **Step 1: Write the failing tests:**

```ts
import { describe, it, expect } from 'vitest'
import { buildPipelineRows, countdownLabel, closedThisMonth } from '@/lib/pipeline-view'
import type { Lead, Task, Proposal } from '@/lib/types'

const today = '2026-08-07'
const lead = (over: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Dana', stage: 'consultation', created_at: '2026-07-01T00:00:00.000Z', ...over,
} as Lead)
const task = (over: Partial<Task>): Task => ({
  id: 't1', lead_id: 'l1', title: 'Site visit', done: false, created_at: '2026-08-01T00:00:00.000Z', ...over,
} as Task)

describe('countdownLabel', () => {
  it('labels today, future, and overdue', () => {
    expect(countdownLabel('2026-08-07', today)).toBe('Today')
    expect(countdownLabel('2026-08-09', today)).toBe('in 2 days')
    expect(countdownLabel('2026-08-05', today)).toBe('2 days overdue')
  })
})

describe('buildPipelineRows', () => {
  it('groups by health and builds the needs-attention sentence', () => {
    const g = buildPipelineRows([{
      lead: lead({ event_date: '2026-09-04', guest_count: 60, last_touch_at: '2026-07-27T00:00:00.000Z' }),
      tasks: [], proposals: [],
    }], today)
    expect(g.needs_attention).toHaveLength(1)
    expect(g.needs_attention[0].statusLine).toBe('Sep 4 · 60 guests · no task, no touch in 11 days')
    expect(g.needs_attention[0].quickAction).toBe('set_next_step')
  })
  it('flags an unopened sent proposal with a nudge action', () => {
    const g = buildPipelineRows([{
      lead: lead({ stage: 'proposal', last_touch_at: '2026-07-29T00:00:00.000Z' }),
      tasks: [],
      proposals: [{ id: 'p1', status: 'sent', created_at: '2026-07-29T00:00:00.000Z', updated_at: '2026-07-29T00:00:00.000Z' } as Proposal],
    }], today)
    expect(g.needs_attention[0].statusLine).toBe('proposal sent 9 days ago, unopened')
    expect(g.needs_attention[0].quickAction).toBe('nudge')
  })
  it('builds waiting rows with follow-up countdown', () => {
    const g = buildPipelineRows([{
      lead: lead({ waiting: { reason: 'PO number', follow_up_date: '2026-08-09' } }),
      tasks: [], proposals: [],
    }], today)
    expect(g.waiting[0].statusLine).toBe('Waiting: PO number · follow up 2026-08-09')
    expect(g.waiting[0].countdown).toBe('in 2 days')
  })
  it('builds active rows from the next task and sorts groups oldest-touch first', () => {
    const g = buildPipelineRows([
      { lead: lead({ id: 'newer', last_touch_at: '2026-08-06T00:00:00.000Z' }),
        tasks: [task({ due_date: '2026-08-11' })], proposals: [] },
      { lead: lead({ id: 'older', last_touch_at: '2026-08-01T00:00:00.000Z' }),
        tasks: [task({ title: 'Send options', due_date: '2026-08-07' })], proposals: [] },
    ], today)
    expect(g.active.map((r) => r.lead.id)).toEqual(['older', 'newer'])
    expect(g.active[0].statusLine).toBe('Next: Send options · due 2026-08-07')
    expect(g.active[0].countdown).toBe('Today')
  })
  it('excludes closed leads', () => {
    const g = buildPipelineRows([{ lead: lead({ stage: 'closed_won' }), tasks: [], proposals: [] }], today)
    expect(g.needs_attention.length + g.waiting.length + g.active.length).toBe(0)
  })
})

describe('closedThisMonth', () => {
  it('rolls up only leads closed in the current month', () => {
    const r = closedThisMonth([
      lead({ stage: 'closed_won', closed_at: '2026-08-02T00:00:00.000Z', estimated_value: 1000 }),
      lead({ stage: 'closed_won', closed_at: '2026-07-30T00:00:00.000Z', estimated_value: 500 }),
      lead({ stage: 'closed_lost', closed_at: '2026-08-05T00:00:00.000Z', estimated_value: 540 }),
    ], today)
    expect(r).toEqual({ wonCount: 1, wonValue: 1000, lostCount: 1, lostValue: 540 })
  })
})
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** `lib/pipeline-view.ts`:

```ts
import type { Lead, Task, Proposal } from '@/lib/types'
import { computeHealth, nextAction, type OppHealth } from '@/lib/opportunity-health'
import { daysSince, lastTouchIso } from '@/lib/opportunity-detail'
import { isProposalOpened } from '@/lib/proposal-opens'
import { CLOSED_STAGES } from '@/lib/leads'

export interface PipelineRow {
  lead: Lead
  health: OppHealth
  statusLine: string
  countdown?: string
  quickAction?: 'set_next_step' | 'nudge'
}
export interface PipelineGroups {
  needs_attention: PipelineRow[]
  waiting: PipelineRow[]
  active: PipelineRow[]
}

export function countdownLabel(dueYmd: string, today: string): string {
  if (dueYmd === today) return 'Today'
  if (dueYmd > today) {
    const n = daysSince(`${today}T00:00:00.000Z`, dueYmd)
    return `in ${n} day${n === 1 ? '' : 's'}`
  }
  const n = daysSince(`${dueYmd}T00:00:00.000Z`, today)
  return `${n} day${n === 1 ? '' : 's'} overdue`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function shortDate(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

function unopenedSentProposal(proposals: Proposal[]): Proposal | null {
  const candidates = proposals.filter((p) => p.status === 'sent' && !isProposalOpened(p))
  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => (a.created_at >= b.created_at ? a : b))
}

export function buildPipelineRows(
  inputs: Array<{ lead: Lead; tasks: Task[]; proposals: Proposal[] }>,
  today: string
): PipelineGroups {
  const groups: PipelineGroups = { needs_attention: [], waiting: [], active: [] }
  for (const { lead, tasks, proposals } of inputs) {
    if (CLOSED_STAGES.includes(lead.stage)) continue
    const health = computeHealth(lead, tasks)
    if (health === 'needs_attention') {
      const unopened = unopenedSentProposal(proposals)
      if (unopened) {
        const n = daysSince(unopened.created_at, today)
        groups.needs_attention.push({
          lead, health, quickAction: 'nudge',
          statusLine: `proposal sent ${n} day${n === 1 ? '' : 's'} ago, unopened`,
        })
      } else {
        const quiet = daysSince(lastTouchIso(lead), today)
        const parts = [
          lead.event_date ? shortDate(lead.event_date) : null,
          lead.guest_count != null ? `${lead.guest_count} guests` : null,
          `no task, no touch in ${quiet} day${quiet === 1 ? '' : 's'}`,
        ].filter(Boolean)
        groups.needs_attention.push({ lead, health, quickAction: 'set_next_step', statusLine: parts.join(' · ') })
      }
    } else if (health === 'waiting') {
      const w = lead.waiting!
      groups.waiting.push({
        lead, health,
        statusLine: `Waiting: ${w.reason}${w.follow_up_date ? ` · follow up ${w.follow_up_date}` : ''}`,
        countdown: w.follow_up_date ? countdownLabel(w.follow_up_date, today) : undefined,
      })
    } else if (health === 'active') {
      const next = nextAction(tasks)!
      groups.active.push({
        lead, health,
        statusLine: `Next: ${next.title} · due ${next.due_date}`,
        countdown: next.due_date ? countdownLabel(next.due_date, today) : undefined,
      })
    }
  }
  const byOldestTouch = (a: PipelineRow, b: PipelineRow) =>
    lastTouchIso(a.lead).localeCompare(lastTouchIso(b.lead))
  groups.needs_attention.sort(byOldestTouch)
  groups.waiting.sort(byOldestTouch)
  groups.active.sort(byOldestTouch)
  return groups
}

export function closedThisMonth(leads: Lead[], today: string) {
  const month = today.slice(0, 7)
  const closed = leads.filter((l) => l.closed_at?.slice(0, 7) === month)
  const won = closed.filter((l) => l.stage === 'closed_won')
  const lost = closed.filter((l) => l.stage === 'closed_lost')
  const value = (ls: Lead[]) => ls.reduce((s, l) => s + (l.estimated_value ?? 0), 0)
  return { wonCount: won.length, wonValue: value(won), lostCount: lost.length, lostValue: value(lost) }
}
```

Note: `countdownLabel` calls `daysSince(isoOfToday, futureYmd)` with swapped arguments for future dates — `daysSince` clamps at 0, so implement the future branch by swapping: `daysSince('${today}T00:00:00.000Z', dueYmd)` computes days from today to due. Verify against the test; if the helper's argument order fights you, compute inline: `Math.round((Date.parse(dueYmd) - Date.parse(today)) / 86_400_000)`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run __tests__/lib/pipeline-view.test.ts`.
- [ ] **Step 5: Commit** — `feat(crm): pipeline row builder (health groups, sentences, countdowns)`

---

### Task 5: Lead actions — `markLeadLost`, closed-at wiring, guest count

**Files:**
- Modify: `actions/leads.ts` (`setLeadStage` :84, `updateLead` :71, `CreateLeadInput` :16, `createLead` :40)
- Modify: `lib/crm/leads.ts` (`LeadUpdate`)
- Test: `__tests__/lib/crm/` — follow the existing firestore-mock pattern from `__tests__/actions/reports.test.ts` only if an actions test for leads already exists; otherwise cover via the pure `closedAtPatch` (Task 1) and add the action test below.
- Test: `__tests__/actions/leads-lost.test.ts` (create)

**Interfaces:**
- Consumes: `closedAtPatch`, `LOST_REASON_LABELS` (Task 1), `updateLeadCore`, `logActivity`
- Produces: `markLeadLost(orgId: string, leadId: string, input: { reason: LostReason; note?: string }): Promise<void>`; `CreateLeadInput.guest_count?: number`; `LeadUpdate.guest_count?: number | null`, `LeadUpdate.closed_at?: string | null`, `LeadUpdate.lost?: { reason: LostReason; note?: string } | null`

- [ ] **Step 1: Write the failing test** (`__tests__/actions/leads-lost.test.ts`) — mock `@/lib/auth/assert` (`assertOrgAdmin: vi.fn()`), `@/lib/activity` (`logActivity: vi.fn()`), and `@/lib/crm/leads` (`updateLeadCore: vi.fn()`, plus re-exported `getLeadCore`-style reads if imported); assert:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateLeadCoreSpy = vi.hoisted(() => vi.fn())
const logActivitySpy = vi.hoisted(() => vi.fn())
const getLeadSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/assert', () => ({ assertOrgAdmin: vi.fn(), assertOrgMember: vi.fn() }))
vi.mock('@/lib/activity', () => ({ logActivity: logActivitySpy }))
vi.mock('@/lib/crm/leads', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateLeadCore: updateLeadCoreSpy,
  getLeadCore: getLeadSpy,
}))

import { markLeadLost } from '@/actions/leads'

describe('markLeadLost', () => {
  beforeEach(() => { vi.clearAllMocks(); getLeadSpy.mockResolvedValue({ id: 'l1', stage: 'proposal' }) })
  it('sets stage, lost reason, closed_at, and logs', async () => {
    await markLeadLost('org1', 'l1', { reason: 'over_budget', note: 'went with a food truck' })
    const patch = updateLeadCoreSpy.mock.calls[0][2]
    expect(patch.stage).toBe('closed_lost')
    expect(patch.lost).toEqual({ reason: 'over_budget', note: 'went with a food truck' })
    expect(typeof patch.closed_at).toBe('string')
    expect(logActivitySpy).toHaveBeenCalledWith('org1', expect.objectContaining({
      kind: 'lost', summary: 'Lost — Over budget · went with a food truck',
    }))
  })
})
```

Adjust the mock of the lead read to whatever `actions/leads.ts` actually uses to fetch the current stage (`getLead` reads via `leadsRef` today — if there is no `getLeadCore`, mock `leadsRef` or read the prev stage by calling the exported `getLead`; match the code, not this sketch).

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** `lib/crm/leads.ts` — extend `LeadUpdate`:

```ts
  guest_count?: number | null
  closed_at?: string | null
  lost?: { reason: LostReason; note?: string } | null
```

(import `LostReason` type from `@/lib/types`). `actions/leads.ts`:

```ts
import { closedAtPatch, LOST_REASON_LABELS } from '@/lib/leads'
import type { LostReason } from '@/lib/types'

export async function markLeadLost(
  orgId: string, leadId: string, input: { reason: LostReason; note?: string }
): Promise<void> {
  await assertOrgAdmin(orgId)
  const lead = await getLead(orgId, leadId)
  if (!lead) throw new Error('Lead not found')
  const note = input.note?.trim()
  await updateLeadCore(orgId, leadId, {
    stage: 'closed_lost',
    lost: { reason: input.reason, ...(note ? { note } : {}) },
    ...closedAtPatch(lead.stage, 'closed_lost', new Date().toISOString()),
  })
  await logActivity(orgId, {
    parent_type: 'opportunity', parent_id: leadId, kind: 'lost',
    summary: `Lost — ${LOST_REASON_LABELS[input.reason]}${note ? ` · ${note}` : ''}`,
  })
}
```

In `setLeadStage`, read the lead first (it currently writes blind) and spread `closedAtPatch(prev.stage, stage, new Date().toISOString())` into the update; same in `updateLead` when `updates.stage` is present. Add `guest_count` to `CreateLeadInput` and pass it through `createLead` like `estimated_value`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run __tests__/actions/leads-lost.test.ts`.
- [ ] **Step 5: Commit** — `feat(crm): markLeadLost + closed-at stamping + guest_count input`

---

### Task 6: Nudge email + action

**Files:**
- Modify: `lib/email.ts` (add `sendProposalNudge`, model on `sendProposalSignedConfirmation` :112)
- Create: `actions/nudge.ts`
- Test: `__tests__/lib/email.test.ts` (exists — append, following its current Resend-mock pattern)

**Interfaces:**
- Consumes: `getResend`, `buildFromAddress`, `PROPOSAL_BASE_URL` (existing in `lib/email.ts`); branding resolution — copy the pattern `actions/communicate.ts:17` (`sendEmailBlast`) uses to derive `fromDisplayName`/`fromDomain`/`replyTo`.
- Produces: `sendProposalNudge(params: { to: string; contactName: string; proposalTitle?: string; token: string; fromDisplayName?: string; fromDomain?: string; replyTo?: string }): Promise<void>`; `nudgeProposal(orgId: string, leadId: string, proposalId: string): Promise<void>`

- [ ] **Step 1: Write the failing test** (append to `__tests__/lib/email.test.ts`, reusing its existing mock of the Resend client): assert `sendProposalNudge` sends to `params.to`, subject `'A reminder about your proposal'`, and the html contains `/proposals/${token}`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** `lib/email.ts`:

```ts
export interface ProposalNudgeParams {
  to: string
  contactName: string
  proposalTitle?: string
  token: string
  fromDisplayName?: string
  fromDomain?: string
  replyTo?: string
}

export async function sendProposalNudge(params: ProposalNudgeParams): Promise<void> {
  const from = buildFromAddress({ displayName: params.fromDisplayName, domain: params.fromDomain })
  const proposalUrl = `${PROPOSAL_BASE_URL}/proposals/${params.token}`
  await getResend().emails.send({
    from,
    to: params.to,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    subject: 'A reminder about your proposal',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <p style="font-size:16px">Hi ${params.contactName},</p>
        <p style="font-size:16px">
          Just a friendly reminder that your proposal${params.proposalTitle ? ` “${params.proposalTitle}”` : ''}
          is ready for you to review.
        </p>
        <a href="${proposalUrl}"
           style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600">
          View your proposal
        </a>
      </div>
    `,
  })
}
```

`actions/nudge.ts` (`'use server'`): `assertOrgAdmin` → `getLead` (throw if no `lead.email`) → `getProposal` (throw unless `status === 'sent'`) → resolve branding exactly the way `actions/communicate.ts` does → `sendProposalNudge` → `logActivity(orgId, { parent_type: 'opportunity', parent_id: leadId, kind: 'nudge', summary: 'Nudged — proposal reminder sent' })`. No type re-exports.

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `feat(crm): proposal nudge email + action`

---

### Task 7: Pipeline page — server assembly + list view (12a)

**Files:**
- Rewrite: `app/(admin)/[orgSlug]/leads/page.tsx`
- Create: `components/admin/pipeline/PipelineListClient.tsx`
- Create: `components/admin/pipeline/NewOpportunityForm.tsx` (extract the create-form JSX + state from `components/admin/LeadsBoardClient.tsx:98-150`, add a Guest count number input wired to `guest_count`)
- Test: `__tests__/components/pipeline-list.test.tsx` (create; follow the existing pattern in `__tests__/components/`)

**Interfaces:**
- Consumes: `buildPipelineRows`, `closedThisMonth`, `PipelineGroups`, `PipelineRow` (Task 4); `todayYmd` (`@/lib/opportunity-detail`); `listLeads`, `listTasks`, `listProposals`, `nudgeProposal`; `LEAD_STAGE_LABELS`, `LOST_REASON_LABELS`, `opportunityTitle`
- Produces: `PipelineListClient` props: `{ orgId: string; orgSlug: string; groups: PipelineGroups; closed: Lead[]; openCount: number; openValue: number; monthly: ReturnType<typeof closedThisMonth>; view: 'list' | 'board' }`

- [ ] **Step 1: Server assembly.** New `page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listLeads } from '@/actions/leads'
import { listTasks } from '@/actions/tasks'
import { listProposals } from '@/actions/proposals'
import { buildPipelineRows, closedThisMonth } from '@/lib/pipeline-view'
import { todayYmd } from '@/lib/opportunity-detail'
import { OPEN_STAGES, CLOSED_STAGES } from '@/lib/leads'
import { PipelineListClient } from '@/components/admin/pipeline/PipelineListClient'
import { PipelineBoardView } from '@/components/admin/pipeline/PipelineBoardView'

export default async function LeadsPage({
  params, searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const [{ orgSlug }, { view }] = await Promise.all([params, searchParams])
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const leads = await listLeads(orgId)
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage))
  const closed = leads.filter((l) => CLOSED_STAGES.includes(l.stage))
  const inputs = await Promise.all(open.map(async (lead) => {
    const [tasks, proposals] = await Promise.all([
      listTasks(orgId, lead.id),
      lead.stage === 'proposal' ? listProposals(orgId, lead.id) : Promise.resolve([]),
    ])
    return { lead, tasks, proposals }
  }))

  const today = todayYmd()
  const groups = buildPipelineRows(inputs, today)
  const monthly = closedThisMonth(leads, today)
  const openValue = open.reduce((s, l) => s + (l.estimated_value ?? 0), 0)

  const shared = {
    orgId, orgSlug, groups, closed,
    openCount: open.length, openValue, monthly,
  }
  return view === 'board'
    ? <PipelineBoardView {...shared} />
    : <PipelineListClient {...shared} view="list" />
}
```

(Task 8 creates `PipelineBoardView`; until then render the list unconditionally and leave the import out.)

- [ ] **Step 2: Write the failing component test** (`__tests__/components/pipeline-list.test.tsx`):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineListClient } from '@/components/admin/pipeline/PipelineListClient'
import type { Lead } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const lead = (over: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Dana', stage: 'consultation', created_at: '2026-07-01T00:00:00.000Z', ...over,
} as Lead)

const base = {
  orgId: 'o1', orgSlug: 'demo', view: 'list' as const,
  closed: [], openCount: 1, openValue: 1180,
  monthly: { wonCount: 3, wonValue: 4120, lostCount: 1, lostValue: 540 },
}

describe('PipelineListClient', () => {
  it('renders health groups with status sentences and quick actions', () => {
    render(<PipelineListClient {...base} groups={{
      needs_attention: [{ lead: lead({ title: 'Fairhaven Realty — agent open house' }),
        health: 'needs_attention', statusLine: 'Sep 4 · 60 guests · no task, no touch in 11 days',
        quickAction: 'set_next_step' }],
      waiting: [], active: [],
    }} />)
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Sep 4 · 60 guests · no task, no touch in 11 days')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /set next step/i })).toBeInTheDocument()
    expect(screen.getByText(/1 open · \$1,180 · 3 booked this month/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run to verify failure**, then implement `PipelineListClient`. Structure:

```tsx
'use client'

// Props per Interfaces block. Local state: activeTab: 'needs_move' | 'open' | 'closed';
// nudging: string | null (lead id while the nudge server action is in flight); error: string | null.

// Header row: <h1>Pipeline</h1>, summary line
//   `${openCount} open · $${openValue.toLocaleString()} · ${monthly.wonCount} booked this month`,
//   <Link href={`/${orgSlug}/leads?view=board`}>Board view</Link>, NewOpportunityForm trigger button.

// Tabs (buttons, aria-pressed): `Needs a move (${groups.needs_attention.length})`,
//   `All open (${openCount})`, `Closed (${closed.length})`.

// 'needs_move' tab → render only the needs_attention group.
// 'open' tab → three sections in order, each a heading + rows:
//   'Needs attention' (destructive accent), 'Waiting on them', 'Moving'.
// Row: left = title (Link to `/${orgSlug}/leads/${lead.id}`) + statusLine underneath;
//   right = stage Badge (LEAD_STAGE_LABELS), `$${estimated_value.toLocaleString()}`,
//   countdown chip when present, quick action:
//     set_next_step → <Link href={`/${orgSlug}/leads/${lead.id}?focus=task`}><Button size="sm">Set next step</Button></Link>
//     nudge → <Button size="sm" onClick={handleNudge(row)}>Nudge</Button>, disabled while nudging
//       or when !row.lead.email; handleNudge calls nudgeProposal(orgId, lead.id, proposalId) —
//       pass the proposal id through PipelineRow? No: quickAction stays a string; the nudge
//       handler calls the action with the lead id and the action re-derives the latest sent
//       unopened proposal server-side. CHANGE actions/nudge.ts signature accordingly:
//       nudgeProposal(orgId, leadId) → looks up the newest sent unopened proposal itself.
// 'closed' tab → rows: title, stage Badge, closed_at date, `Lost — ${LOST_REASON_LABELS[lead.lost.reason]}`
//   when lost, value.
// Empty states: 'Nothing needs a move — everything has a next step.' / 'No open opportunities.' /
//   'Nothing closed yet.'
```

Implement fully (no placeholder comments in the real file); reuse `Card`, `Badge`, `Button` from `components/ui`. **Note the interface correction:** `nudgeProposal(orgId, leadId)` (two args) — Task 6's action derives the proposal itself via `unopenedSentProposal`; export that helper from `lib/pipeline-view.ts`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run __tests__/components/pipeline-list.test.tsx`.
- [ ] **Step 5: Commit** — `feat(crm): health-grouped pipeline list view`

---

### Task 8: Board view (12b) + toggle

**Files:**
- Create: `components/admin/pipeline/PipelineBoardView.tsx`
- Modify: `app/(admin)/[orgSlug]/leads/page.tsx` (enable the `view === 'board'` branch)
- Test: `__tests__/components/pipeline-board.test.tsx` (create)

**Interfaces:**
- Consumes: same props as `PipelineListClient` minus `view`; `setLeadStage`; `OPEN_STAGES`, `LEAD_STAGE_LABELS`
- Produces: board with three columns, footer `${count} · $${value}`, won/lost strip

- [ ] **Step 1: Write the failing test:** renders three column headings (Inquiry/Consultation/Proposal) and the strip `Won this month: 3 · $4,120 — moved to Events`; a needs-attention card has `data-health="needs_attention"`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Flatten `groups` into one `PipelineRow[]`, bucket by `lead.stage` over `OPEN_STAGES` only. Card: title, `${event_type ?? ''} · ${shortDate(event_date)}` subtitle, `statusLine` (one line, truncated), value; `border-l-2 border-destructive` when `health === 'needs_attention'`; keep the existing per-card stage `<select>` (all five stages — selecting `closed_won` routes to `/${orgSlug}/leads/${id}?convert=1` after saving; `closed_lost` is not offered here — the select lists open stages plus Closed won; losing happens on the opportunity page). Native drag: `draggable` on cards, `onDragOver`/`onDrop` on columns calling the same `handleStageChange`. Column footer: `${cards.length} · $${value.toLocaleString()}`. Bottom strip: `Won this month: ${monthly.wonCount} · $${monthly.wonValue.toLocaleString()} — moved to <Link href={`/${orgSlug}/calendar`}>Events</Link> · Lost: ${monthly.lostCount} · $${monthly.lostValue.toLocaleString()} · archived`. Header includes `<Link href={`/${orgSlug}/leads`}>List view</Link>`.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `feat(crm): three-column board view with won/lost strip`

---

### Task 9: Opportunity header — stage chip, Move stage, Mark lost, overflow Delete

**Files:**
- Create: `components/admin/opportunity/MarkLostDialog.tsx`
- Create: `components/admin/opportunity/StageMenu.tsx`
- Modify: `components/admin/OpportunityDetailClient.tsx` (header block :53-61)
- Test: `__tests__/components/mark-lost-dialog.test.tsx` (create)

**Interfaces:**
- Consumes: `markLeadLost`, `setLeadStage` (Task 5), `LOST_REASONS`, `LEAD_STAGE_LABELS`, `OPEN_STAGES`
- Produces: `MarkLostDialog({ orgId, leadId, onDone }: { orgId: string; leadId: string; onDone: () => void })`; `StageMenu({ orgId, lead, onWon }: { orgId: string; lead: Lead; onWon: () => void })`

- [ ] **Step 1: Write the failing test:** render `MarkLostDialog` open; four reason buttons (Over budget / Went elsewhere / Date fell through / No response) and an optional note input; clicking a reason then "Mark lost" calls `markLeadLost` (mock `@/actions/leads`) with `{ reason: 'over_budget', note: '' → omitted }`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** `MarkLostDialog`: trigger `<Button variant="outline">Mark lost</Button>` opening an inline popover/card with the four `LOST_REASONS` as selectable chips, a note `<Input>`, Cancel + destructive confirm; on confirm → `markLeadLost` → `router.refresh()`. `StageMenu`: `<Button>Move stage</Button>` opening a menu of `[...OPEN_STAGES, 'closed_won']` (current stage disabled); choosing `closed_won` → `setLeadStage` → `onWon()`; other stages → `setLeadStage` → `router.refresh()`. In `OpportunityDetailClient`: header becomes title + `<Badge>{LEAD_STAGE_LABELS[lead.stage]}</Badge>`; right side `<MarkLostDialog …/>` `<StageMenu … onWon={() => setConvertOpen(true)}/>` and a More menu (`⋯` button) containing the existing Delete handler. Add `const [convertOpen, setConvertOpen] = useState(false)`, initialized true when the URL has `?convert=1` (`useSearchParams`), passed to `ConvertToWorkCard` (Task 11 adds the prop). Also: when the page is opened with `?focus=task`, call `taskInputRef.current?.focus()` in an effect.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `feat(crm): opportunity header with mark-lost and move-stage`

---

### Task 10: Banner — Mark as waiting, Resume, last touch

**Files:**
- Create: `components/admin/opportunity/MarkWaitingForm.tsx`
- Modify: `components/admin/opportunity/NextActionBanner.tsx`
- Test: extend `__tests__/lib/opportunity-detail.test.ts` (banner content) — the component wiring is exercised manually in Task 12

**Interfaces:**
- Consumes: `setLeadWaiting(orgId, leadId, { reason, follow_up_date? })`, `clearLeadWaiting(orgId, leadId)` (existing, `actions/leads.ts:96/113`); `daysSince`, `lastTouchIso` (Task 2)
- Produces: `bannerContent` gains `lastTouchDays?: number` on `BannerInput`, appending `· Last touch ${n} days ago` to the needs-attention detail

- [ ] **Step 1: Write the failing test** (append to the existing `bannerContent` tests):

```ts
it('appends last-touch to the needs-attention detail', () => {
  const c = bannerContent('needs_attention', { todayYmd: '2026-08-07', stageLabel: 'Consultation', lastTouchDays: 11 })
  expect(c.detail).toBe('This opportunity has nothing scheduled — add a next step so it never rots. Last touch 11 days ago.')
})
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** `BannerInput.lastTouchDays?: number`; in the `needs_attention` branch append `` ` Last touch ${n} day${n === 1 ? '' : 's'} ago.` `` when provided. `MarkWaitingForm`: small inline form (reason `<Input>`, follow-up `<Input type="date">`, Save/Cancel) calling `setLeadWaiting` then `router.refresh()`. In `NextActionBanner`: compute `lastTouchDays: daysSince(lastTouchIso(lead), today)`; in the `needs_attention` action group add `<MarkWaitingForm …/>` trigger (`<Button size="sm" variant="outline">Mark as waiting</Button>`); in the `waiting` tone add `<Button size="sm" variant="outline" onClick={() => run(() => clearLeadWaiting(orgId, lead.id))}>Resume</Button>`.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `feat(crm): waiting controls + last-touch in banner`

---

### Task 11: Facts grid, contact strip, convert card

**Files:**
- Create: `components/admin/opportunity/FactsGrid.tsx`
- Modify: `components/admin/opportunity/OpportunityDetailsForm.tsx` (add Guest count input; remove the Stage select — stage moves via header now; keep Notes)
- Modify: `components/admin/opportunity/ContactCard.tsx` (add `variant?: 'strip'` + `pastBookings?: number`)
- Modify: `components/admin/opportunity/ConvertToWorkCard.tsx` (always render; `blockReason`; `open` prop; prefill headcount from `lead.guest_count`)
- Modify: `components/admin/OpportunityDetailClient.tsx` (compose: banner → contact strip → FactsGrid → chips stay in page.tsx → tasks/activity right column → convert card)
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx` (pass `proposals`/`contracts` + `pastBookings` down)
- Modify: `lib/opportunity-detail.ts` (+ `convertBlockReason`)
- Test: `__tests__/lib/opportunity-detail.test.ts` (append)

**Interfaces:**
- Consumes: `listLeadsByCustomerCore` — expose as `listLeadsByCustomer` action or reuse an existing caller; compute `pastBookings = customerLeads.filter(l => l.stage === 'closed_won' && l.id !== lead.id).length` server-side in `page.tsx`
- Produces:

```ts
export function convertBlockReason(i: {
  stage: LeadStage
  proposals: Pick<Proposal, 'status'>[]
  contracts: Pick<Contract, 'status'>[]
  guestCount?: number
}): { ready: boolean; message: string }
```

- [ ] **Step 1: Write the failing tests:**

```ts
import { convertBlockReason } from '@/lib/opportunity-detail'

describe('convertBlockReason', () => {
  it('is ready at closed_won regardless of attachments', () => {
    expect(convertBlockReason({ stage: 'closed_won', proposals: [], contracts: [] }).ready).toBe(true)
  })
  it('names the missing accepted proposal first', () => {
    const r = convertBlockReason({ stage: 'consultation', proposals: [{ status: 'sent' }], contracts: [] })
    expect(r.ready).toBe(false)
    expect(r.message).toBe('Blocked: no accepted proposal yet. Acceptance carries the package into Events.')
  })
  it('then the unsigned contract, mentioning guests when known', () => {
    const r = convertBlockReason({
      stage: 'consultation', proposals: [{ status: 'accepted' }], contracts: [{ status: 'sent' }], guestCount: 60,
    })
    expect(r.message).toBe('Blocked: the contract is unsigned. Signing carries the accepted package and 60 guests into Events.')
  })
  it('otherwise: ready once won', () => {
    const r = convertBlockReason({
      stage: 'consultation', proposals: [{ status: 'accepted' }], contracts: [{ status: 'signed' }],
    })
    expect(r.message).toBe('Ready — mark the deal won to convert.')
    expect(r.ready).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**

`lib/opportunity-detail.ts`:

```ts
export function convertBlockReason(i: {
  stage: LeadStage
  proposals: Pick<Proposal, 'status'>[]
  contracts: Pick<Contract, 'status'>[]
  guestCount?: number
}): { ready: boolean; message: string } {
  if (i.stage === 'closed_won') return { ready: true, message: '' }
  if (!i.proposals.some((p) => p.status === 'accepted')) {
    return { ready: false, message: 'Blocked: no accepted proposal yet. Acceptance carries the package into Events.' }
  }
  if (!i.contracts.some((c) => c.status === 'signed')) {
    const guests = i.guestCount != null ? ` and ${i.guestCount} guests` : ''
    return { ready: false, message: `Blocked: the contract is unsigned. Signing carries the accepted package${guests} into Events.` }
  }
  return { ready: false, message: 'Ready — mark the deal won to convert.' }
}
```

(import `LeadStage`, `Proposal`, `Contract` types.)

`FactsGrid`: client component, props `{ orgId, orgSlug, lead, customer }`. Read mode: 2×2 grid of label/value pairs — Event date (`shortDate` or raw), Guest count (`${n} (estimate)`), Event type, Estimated value (`$…`) — each `—` when absent; an `Edit` ghost button toggles to `<OpportunityDetailsForm …/>` with a Done link back to read mode (the form's own Save already persists; after save call `router.refresh()`).

`ContactCard` `variant="strip"`: horizontal layout — avatar, name, `${email} · ${phone}`, `${company} · returning client (${pastBookings} past event${s})` when `pastBookings > 0`; keep existing Email/Call/More/View customer affordances.

`ConvertToWorkCard`: new props `open?: boolean` (controlled initial open from `?convert=1` / StageMenu) and `blockReason?: string`. Render always: when `job` exists keep the current "Scheduled as" row; when `lead.stage !== 'closed_won'` render the card with `blockReason` text and a disabled `Convert` button; at `closed_won` behave as today. Prefill `headcount` state from `lead.guest_count ?? ''`.

`OpportunityDetailClient` final order: header (Task 9) → error → `NextActionBanner` → `ContactCard variant="strip"` → `ConvertToWorkCard` → grid: left column `FactsGrid`, right column `TasksPanel` + `ActivityTimeline`. Remove `OpportunityDetailsForm` from the always-visible flow (it lives inside FactsGrid now).

`page.tsx`: pass `proposals`, `contracts`, and `pastBookings` into `OpportunityDetailClient`; compute `convertBlockReason` server-side and pass the message down.

- [ ] **Step 4: Run to verify pass** — full suite: `npx vitest run --exclude '**/.claude/**'`.
- [ ] **Step 5: Commit** — `feat(crm): opportunity page recomposition (facts grid, contact strip, convert reason)`

---

### Task 12: Retire the old board, build, walk, PR

**Files:**
- Delete: `components/admin/LeadsBoardClient.tsx`
- Verify: no remaining importers (`grep -rn "LeadsBoardClient" app components`)

- [ ] **Step 1: Delete** `components/admin/LeadsBoardClient.tsx`; fix any straggler imports.
- [ ] **Step 2: Full test suite** — `npx vitest run --exclude '**/.claude/**'` → all green.
- [ ] **Step 3: `next build`** (worktree needs `.env.local` copied from the primary checkout) → green. Fix anything it surfaces (watch the `'use server'` re-export rule).
- [ ] **Step 4: Emulator walkthrough** — `npm run emulators` + `npm run dev:emulator` (or reuse running ones), seed with `npm run seed:demo` if present on the branch; verify: list groups render with a needs-attention lead; Nudge disabled without email; board drag moves stage; moving to Closed won opens the convert form prefilled with guest count; Mark lost records the reason in the Closed tab and activity; portal proposal view flips a row from "unopened".
- [ ] **Step 5: Commit, push (`gh auth switch` to Lifewithmo first), open PR** titled `feat(crm): pipeline & opportunity detail redesign (wireframes 12a-c)`, body summarizing the spec link + screenshots from the walkthrough. PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

## Self-Review

**Spec coverage:** data model ✔ (T1–T3); list view ✔ (T4, T7); board ✔ (T8); opportunity page ✔ (T9–T11); won handoff ✔ (T8 select → `?convert=1`, T9 StageMenu `onWon`); lost reason ✔ (T5, T9); open tracking + nudge ✔ (T3, T6, T7); testing ✔ (per task + T12).
**Known interface corrections made inline:** `nudgeProposal(orgId, leadId)` two-arg form (T7 note supersedes T6's three-arg sketch — implement the two-arg form in T6); `unopenedSentProposal` exported from `lib/pipeline-view.ts` for the action's reuse.
**Type consistency:** `PipelineRow`/`PipelineGroups` names match between T4 and T7/T8; `convertBlockReason` consumed in T11 only; `LostReason` defined T1, used T5/T9.
