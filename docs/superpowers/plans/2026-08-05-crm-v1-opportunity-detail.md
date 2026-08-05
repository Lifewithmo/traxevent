# CRM V1 — Opportunity Detail (Increment 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing Lead detail page into the validated CRM V1 "Opportunity detail" screen — compact contact card, a prominent next-action banner, Tasks + Activity sharing the main space, and attachment chips — reusing the increment-1 model/actions and the existing Proposal/Invoice/Contract/Vendor modules.

**Architecture:** A new server page composes the increment-1 read actions (`getLead`, `getCustomer`, `listTasks`, `listActivity`, plus the existing `list*` for attachments) and passes them to a new client orchestrator `OpportunityDetailClient`. The orchestrator lays out a responsive two-column grid (main = banner + tasks + activity + editable details; aside/top-on-mobile = contact card) and renders the **unchanged** existing `Lead*Client` attachment modules below a compact chip summary. Derived health drives the banner via the existing `computeHealth`/`nextAction`. All display logic that can be pure lives in `lib/opportunity-detail.ts` and is unit-tested; components get light Testing-Library tests.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), React 19, TypeScript, Tailwind, shadcn-style UI primitives in `components/ui/*`, `lucide-react`, Vitest + jsdom + @testing-library/react.

## Global Constraints

- **This is NOT the Next.js you know.** Before writing any page/route/server-action code, read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices (per AGENTS.md).
- **Increment-1 model + actions stay unchanged**, with ONE surgical, additive exception: a new `snoozeTask` export in `actions/tasks.ts`. Do not change any existing action signature or behavior, and do not touch `lib/types.ts` or the `Lead`/`Task`/`Note`/`ActivityEvent` shapes.
- **Mutations allowed in this increment:** task create (`createTask`), task complete (`completeTask`), task snooze (`snoozeTask`, new), note create (`createNote`). No `waiting`/lead-model mutations (that is the increment-3 Today screen).
- **Reuse, do not rebuild** the Proposal/Invoice/Contract/Vendor modules — render the existing `LeadProposalsClient` / `LeadInvoicesClient` / `LeadContractsClient` / `LeadVendorsClient` as-is.
- **Mobile-responsive throughout:** single-column stacking on narrow screens; contact card is compact and moves to the top on mobile.
- **Green gate every task:** `npx tsc --noEmit` clean AND `npm test` (vitest) passing. Run `npm install` first if you see ~5 server-only load failures (node_modules sync quirk; no lockfile change).
- **Restraint (design principle):** one clear action per view; quiet, dense bordered rows, not card-soup.
- **Route/paths:** page is `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`; new components live under `components/admin/opportunity/`; tests under `__tests__/`.
- **Do NOT commit to `main`.** Confirm `git rev-parse --abbrev-ref HEAD` = `claude/crm-v1-opportunity-detail-da3423` before every commit. Do not touch other worktrees/branches.

---

## File Structure

**Created:**
- `lib/opportunity-detail.ts` — pure display helpers (initials, date math, due status, relative time, banner content, attachment chips).
- `components/admin/opportunity/ContactCard.tsx` — compact customer card (client; expand disclosure + call/email links).
- `components/admin/opportunity/NextActionBanner.tsx` — health-driven banner with Done / Snooze / Add-next-step (client).
- `components/admin/opportunity/TasksPanel.tsx` — task list + add + complete (client).
- `components/admin/opportunity/ActivityTimeline.tsx` — add-note composer + activity list (client).
- `components/admin/opportunity/AttachmentChips.tsx` — compact derived summary strip (presentational).
- `components/admin/opportunity/OpportunityDetailsForm.tsx` — editable lead fields (extracted from the old `LeadDetailClient`).
- `components/admin/OpportunityDetailClient.tsx` — top-level orchestrator (header/delete, banner, grid, contact card).
- Tests: `__tests__/lib/opportunity-detail.test.ts`, `__tests__/components/opportunity/*.test.tsx`.

**Modified:**
- `actions/tasks.ts` — add `snoozeTask` (additive export only).
- `__tests__/actions/tasks.test.ts` — add `snoozeTask` coverage.
- `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx` — fetch customer/tasks/activity; render orchestrator + existing attachment modules.

**Deleted:**
- `components/admin/LeadDetailClient.tsx` — its edit form is extracted into `OpportunityDetailsForm`; the page no longer uses it. (Confirmed sole consumer is the detail page.)

---

### Task 1: Pure display helpers (`lib/opportunity-detail.ts`)

**Files:**
- Create: `lib/opportunity-detail.ts`
- Test: `__tests__/lib/opportunity-detail.test.ts`

**Interfaces:**
- Consumes: `OppHealth` from `@/lib/opportunity-health`; `Proposal, Invoice, Contract, Vendor` from `@/lib/types`.
- Produces:
  - `initials(name: string): string`
  - `addDays(baseYmd: string, days: number): string` (YYYY-MM-DD in/out)
  - `type DueStatus = 'overdue' | 'today' | 'upcoming'`
  - `dueStatus(dueYmd: string, todayYmd: string): DueStatus`
  - `todayYmd(now?: Date): string` (local YYYY-MM-DD)
  - `formatRelativeTime(iso: string, now?: Date): string`
  - `interface BannerContent { tone: 'active'|'waiting'|'attention'|'closed'; heading: string; detail: string }`
  - `bannerContent(health: OppHealth, o: BannerInput): BannerContent` where `interface BannerInput { nextTitle?: string; dueYmd?: string; todayYmd: string; waitingReason?: string; waitingFollowUp?: string; stageLabel: string }`
  - `interface AttachmentChip { kind: 'proposal'|'invoice'|'contract'|'vendor'; label: string; count: number; hint?: string }`
  - `attachmentChips(i: { proposals: Proposal[]; invoices: Invoice[]; contracts: Contract[]; vendors: Vendor[] }): AttachmentChip[]`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/opportunity-detail.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  initials, addDays, dueStatus, todayYmd, formatRelativeTime,
  bannerContent, attachmentChips,
} from '@/lib/opportunity-detail'

describe('initials', () => {
  it('takes first+last initial', () => expect(initials('Ada Lovelace')).toBe('AL'))
  it('single word takes two letters', () => expect(initials('cher')).toBe('CH'))
  it('empty falls back', () => expect(initials('   ')).toBe('?'))
})

describe('addDays', () => {
  it('adds across a month boundary', () => expect(addDays('2026-01-30', 3)).toBe('2026-02-02'))
})

describe('dueStatus', () => {
  it('past is overdue', () => expect(dueStatus('2026-08-04', '2026-08-05')).toBe('overdue'))
  it('same day is today', () => expect(dueStatus('2026-08-05', '2026-08-05')).toBe('today'))
  it('future is upcoming', () => expect(dueStatus('2026-08-06', '2026-08-05')).toBe('upcoming'))
})

describe('todayYmd', () => {
  it('formats a local date', () => expect(todayYmd(new Date(2026, 7, 5, 9, 0, 0))).toBe('2026-08-05'))
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-05T12:00:00.000Z')
  it('under a minute', () => expect(formatRelativeTime('2026-08-05T11:59:30.000Z', now)).toBe('just now'))
  it('minutes', () => expect(formatRelativeTime('2026-08-05T11:30:00.000Z', now)).toBe('30m ago'))
  it('hours', () => expect(formatRelativeTime('2026-08-05T09:00:00.000Z', now)).toBe('3h ago'))
  it('days', () => expect(formatRelativeTime('2026-08-03T12:00:00.000Z', now)).toBe('2d ago'))
})

describe('bannerContent', () => {
  it('active surfaces the next action', () => {
    const b = bannerContent('active', { nextTitle: 'Call venue', dueYmd: '2026-08-05', todayYmd: '2026-08-05', stageLabel: 'Proposal' })
    expect(b.tone).toBe('active')
    expect(b.heading).toBe('Call venue')
    expect(b.detail).toContain('Due today')
  })
  it('overdue active flags it', () => {
    const b = bannerContent('active', { nextTitle: 'Send quote', dueYmd: '2026-08-01', todayYmd: '2026-08-05', stageLabel: 'Proposal' })
    expect(b.detail).toContain('Overdue')
  })
  it('waiting shows reason', () => {
    const b = bannerContent('waiting', { waitingReason: 'Client reviewing', waitingFollowUp: '2026-08-10', todayYmd: '2026-08-05', stageLabel: 'Proposal' })
    expect(b.tone).toBe('waiting')
    expect(b.heading).toBe('Waiting')
    expect(b.detail).toContain('Client reviewing')
  })
  it('needs attention prompts a next step', () => {
    const b = bannerContent('needs_attention', { todayYmd: '2026-08-05', stageLabel: 'Inquiry' })
    expect(b.tone).toBe('attention')
    expect(b.heading).toContain('No next action')
  })
  it('closed reflects the outcome', () => {
    const b = bannerContent('closed', { todayYmd: '2026-08-05', stageLabel: 'Closed Won' })
    expect(b.tone).toBe('closed')
    expect(b.detail).toContain('Closed Won')
  })
})

describe('attachmentChips', () => {
  it('summarizes counts and hints', () => {
    const chips = attachmentChips({
      proposals: [{ status: 'accepted' } as any, { status: 'draft' } as any],
      invoices: [{ status: 'sent' } as any],
      contracts: [{ status: 'signed' } as any],
      vendors: [],
    })
    const byKind = Object.fromEntries(chips.map((c) => [c.kind, c]))
    expect(byKind.proposal.count).toBe(2)
    expect(byKind.proposal.hint).toBe('1 accepted')
    expect(byKind.invoice.count).toBe(1)
    expect(byKind.invoice.hint).toBe('1 unpaid')
    expect(byKind.contract.hint).toBe('signed')
    expect(byKind.vendor.count).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/opportunity-detail.test.ts`
Expected: FAIL — module `@/lib/opportunity-detail` not found.

- [ ] **Step 3: Write the implementation**

Create `lib/opportunity-detail.ts`:

```ts
import type { Proposal, Invoice, Contract, Vendor } from '@/lib/types'
import type { OppHealth } from '@/lib/opportunity-health'

/** Up to two uppercase initials from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** ISO date (YYYY-MM-DD) `days` after the given YYYY-MM-DD base. */
export function addDays(baseYmd: string, days: number): string {
  const d = new Date(`${baseYmd}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Local calendar date as YYYY-MM-DD (matches <input type="date"> values). */
export function todayYmd(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type DueStatus = 'overdue' | 'today' | 'upcoming'

export function dueStatus(dueYmd: string, today: string): DueStatus {
  if (dueYmd < today) return 'overdue'
  if (dueYmd === today) return 'today'
  return 'upcoming'
}

/** Coarse "n ago" label for activity/timeline. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

export interface BannerContent {
  tone: 'active' | 'waiting' | 'attention' | 'closed'
  heading: string
  detail: string
}

export interface BannerInput {
  nextTitle?: string
  dueYmd?: string
  todayYmd: string
  waitingReason?: string
  waitingFollowUp?: string
  stageLabel: string
}

function dueLabel(dueYmd: string, today: string): string {
  const s = dueStatus(dueYmd, today)
  if (s === 'overdue') return `Overdue · was due ${dueYmd}`
  if (s === 'today') return 'Due today'
  return `Due ${dueYmd}`
}

export function bannerContent(health: OppHealth, o: BannerInput): BannerContent {
  switch (health) {
    case 'active':
      return {
        tone: 'active',
        heading: o.nextTitle ?? 'Next action',
        detail: o.dueYmd ? dueLabel(o.dueYmd, o.todayYmd) : 'Scheduled',
      }
    case 'waiting':
      return {
        tone: 'waiting',
        heading: 'Waiting',
        detail: [o.waitingReason, o.waitingFollowUp ? `follow up ${o.waitingFollowUp}` : null]
          .filter(Boolean)
          .join(' · ') || 'Waiting on a reply',
      }
    case 'needs_attention':
      return {
        tone: 'attention',
        heading: 'No next action',
        detail: 'This opportunity has nothing scheduled — add a next step so it never rots.',
      }
    case 'closed':
    default:
      return { tone: 'closed', heading: 'Closed', detail: o.stageLabel }
  }
}

export interface AttachmentChip {
  kind: 'proposal' | 'invoice' | 'contract' | 'vendor'
  label: string
  count: number
  hint?: string
}

export function attachmentChips(i: {
  proposals: Proposal[]
  invoices: Invoice[]
  contracts: Contract[]
  vendors: Vendor[]
}): AttachmentChip[] {
  const accepted = i.proposals.filter((p) => p.status === 'accepted').length
  const unpaid = i.invoices.filter((v) => v.status !== 'paid' && v.status !== 'void').length
  const signed = i.contracts.filter((c) => c.status === 'signed').length
  const confirmed = i.vendors.filter((v) => v.status === 'confirmed').length
  return [
    { kind: 'proposal', label: 'Proposals', count: i.proposals.length, hint: accepted ? `${accepted} accepted` : undefined },
    { kind: 'invoice', label: 'Invoices', count: i.invoices.length, hint: unpaid ? `${unpaid} unpaid` : (i.invoices.length ? 'paid' : undefined) },
    { kind: 'contract', label: 'Contracts', count: i.contracts.length, hint: signed ? 'signed' : (i.contracts.length ? 'unsigned' : undefined) },
    { kind: 'vendor', label: 'Vendors', count: i.vendors.length, hint: confirmed ? `${confirmed} confirmed` : undefined },
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/opportunity-detail.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add lib/opportunity-detail.ts __tests__/lib/opportunity-detail.test.ts
git commit -m "feat(crm): pure display helpers for opportunity detail"
```

---

### Task 2: Additive `snoozeTask` server action

**Files:**
- Modify: `actions/tasks.ts` (add one export; do not change existing functions)
- Test: `__tests__/actions/tasks.test.ts` (add a `snoozeTask` block)

**Interfaces:**
- Produces: `snoozeTask(orgId: string, leadId: string, taskId: string, dueDate: string): Promise<void>` — sets the task's `due_date` to `dueDate` and logs a best-effort `task` activity `Snoozed: <title> → <dueDate>`.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/actions/tasks.test.ts` (the existing mocks for `firebase-admin`, `@/lib/auth/assert`, and `@/lib/activity` already cover this; `taskDocSpy` exposes `update` and `get`). Add `snoozeTask` to the import line, then add:

```ts
describe('snoozeTask', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates the due_date', async () => {
    await snoozeTask('o1', 'l1', 't1', '2026-08-08')
    expect(taskDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({ due_date: '2026-08-08' })
    )
  })

  it('rejects a blank date', async () => {
    await expect(snoozeTask('o1', 'l1', 't1', '  ')).rejects.toThrow('due date')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/actions/tasks.test.ts -t snoozeTask`
Expected: FAIL — `snoozeTask` is not exported.

- [ ] **Step 3: Add the implementation**

In `actions/tasks.ts`, add after `completeTask` (keep style consistent with the file):

```ts
export async function snoozeTask(
  orgId: string,
  leadId: string,
  taskId: string,
  dueDate: string
): Promise<void> {
  await assertOrgAdmin(orgId)
  if (!dueDate?.trim()) throw new Error('A due date is required to snooze')
  const snap = await tasksRef(orgId, leadId).doc(taskId).get()
  const title = snap.exists ? (snap.data() as Task).title : undefined
  await tasksRef(orgId, leadId).doc(taskId).update({ due_date: dueDate.trim() })
  await logActivity(orgId, {
    parent_type: 'opportunity',
    parent_id: leadId,
    kind: 'task',
    summary: `Snoozed: ${title ?? 'task'} → ${dueDate.trim()}`,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/actions/tasks.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add actions/tasks.ts __tests__/actions/tasks.test.ts
git commit -m "feat(crm): additive snoozeTask action (bumps next-action due date)"
```

---

### Task 3: `ContactCard` component

**Files:**
- Create: `components/admin/opportunity/ContactCard.tsx`
- Test: `__tests__/components/opportunity/ContactCard.test.tsx`

**Interfaces:**
- Consumes: `initials` from `@/lib/opportunity-detail`; `Customer`, `Lead` from `@/lib/types`; `Card`/`CardContent` and `Button`; `Phone, Mail, ChevronDown` from `lucide-react`.
- Produces: `ContactCard(props: { customer: Customer | null; lead: Lead }): JSX.Element`. When `customer` is null it falls back to the lead's inline contact fields (`name`, `organization`, `email`, `phone`). Compact by default; an expand toggle reveals email/phone/tags/notes. Quick actions are `mailto:`/`tel:` links, shown only when the value exists.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/opportunity/ContactCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContactCard } from '@/components/admin/opportunity/ContactCard'
import type { Customer, Lead } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'Fallback Person', stage: 'inquiry', created_at: '', organization: 'Fallback Co', email: 'f@x.com' }

describe('ContactCard', () => {
  it('renders the customer when present', () => {
    const customer: Customer = { id: 'c1', name: 'Ada Lovelace', company: 'Analytical Co', email: 'ada@x.com', phone: '5551234', created_at: '' }
    render(<ContactCard customer={customer} lead={lead} />)
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Analytical Co')).toBeInTheDocument()
    expect(screen.getByText('AL')).toBeInTheDocument() // initials avatar
    expect(screen.getByRole('link', { name: /email/i })).toHaveAttribute('href', 'mailto:ada@x.com')
  })

  it('falls back to lead contact when no customer', () => {
    render(<ContactCard customer={null} lead={lead} />)
    expect(screen.getByText('Fallback Person')).toBeInTheDocument()
    expect(screen.getByText('Fallback Co')).toBeInTheDocument()
  })

  it('expands to reveal details', () => {
    const customer: Customer = { id: 'c1', name: 'Ada', email: 'ada@x.com', phone: '5551234', created_at: '' }
    render(<ContactCard customer={customer} lead={lead} />)
    expect(screen.queryByText('5551234')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /expand/i }))
    expect(screen.getByText('5551234')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/opportunity/ContactCard.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `components/admin/opportunity/ContactCard.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Phone, Mail, ChevronDown } from 'lucide-react'
import { initials } from '@/lib/opportunity-detail'
import type { Customer, Lead } from '@/lib/types'

interface ContactCardProps {
  customer: Customer | null
  lead: Lead
}

export function ContactCard({ customer, lead }: ContactCardProps) {
  const [expanded, setExpanded] = useState(false)

  const name = customer?.name ?? lead.name
  const company = customer?.company ?? lead.organization
  const email = customer?.email ?? lead.email
  const phone = customer?.phone ?? lead.phone
  const tags = customer?.tags ?? lead.tags ?? []
  const notes = customer?.notes

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
          >
            {initials(name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{name}</p>
            {company && <p className="truncate text-sm text-muted-foreground">{company}</p>}
          </div>
        </div>

        <div className="flex gap-2">
          {email && (
            <a
              href={`mailto:${email}`}
              aria-label="Email"
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border text-sm hover:bg-muted"
            >
              <Mail className="h-4 w-4" /> Email
            </a>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              aria-label="Call"
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border text-sm hover:bg-muted"
            >
              <Phone className="h-4 w-4" /> Call
            </a>
          )}
        </div>

        <button
          type="button"
          aria-label={expanded ? 'Collapse contact' : 'Expand contact'}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? 'Less' : 'More'}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {expanded && (
          <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
            {email && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Email</dt><dd className="truncate">{email}</dd></div>}
            {phone && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Phone</dt><dd>{phone}</dd></div>}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
              </div>
            )}
            {notes && <p className="pt-1 text-muted-foreground">{notes}</p>}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/opportunity/ContactCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add components/admin/opportunity/ContactCard.tsx __tests__/components/opportunity/ContactCard.test.tsx
git commit -m "feat(crm): compact opportunity contact card"
```

---

### Task 4: `NextActionBanner` component

**Files:**
- Create: `components/admin/opportunity/NextActionBanner.tsx`
- Test: `__tests__/components/opportunity/NextActionBanner.test.tsx`

**Interfaces:**
- Consumes: `computeHealth`, `nextAction` from `@/lib/opportunity-health`; `bannerContent`, `todayYmd`, `addDays` from `@/lib/opportunity-detail`; `completeTask`, `snoozeTask` from `@/actions/tasks`; `useRouter` from `next/navigation`; `LEAD_STAGE_LABELS` from `@/lib/leads`.
- Produces: `NextActionBanner(props: { orgId: string; lead: Lead; tasks: Task[]; onAddNextStep: () => void }): JSX.Element`.
  - **active** → shows next task + Done (`completeTask`) + Snooze 3 days (`snoozeTask` with `addDays(due||today, 3)`), then `router.refresh()`.
  - **needs_attention** → "Add next step" button calls `onAddNextStep`.
  - **waiting** → read-only reason/follow-up (no mutation this increment).
  - **closed** → outcome label, no actions.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/opportunity/NextActionBanner.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const completeTask = vi.fn().mockResolvedValue(undefined)
const snoozeTask = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/tasks', () => ({ completeTask: (...a: unknown[]) => completeTask(...a), snoozeTask: (...a: unknown[]) => snoozeTask(...a) }))

import { NextActionBanner } from '@/components/admin/opportunity/NextActionBanner'
import type { Lead, Task } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'X', stage: 'proposal', created_at: '' }
const dated: Task = { id: 't1', lead_id: 'l1', title: 'Call venue', due_date: '2026-08-05', done: false, created_at: '' }

describe('NextActionBanner', () => {
  beforeEach(() => { refresh.mockClear(); completeTask.mockClear(); snoozeTask.mockClear() })

  it('active: completes the next action', async () => {
    render(<NextActionBanner orgId="o1" lead={lead} tasks={[dated]} onAddNextStep={vi.fn()} />)
    expect(screen.getByText('Call venue')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => expect(completeTask).toHaveBeenCalledWith('o1', 'l1', 't1'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('active: snoozes the next action', async () => {
    render(<NextActionBanner orgId="o1" lead={lead} tasks={[dated]} onAddNextStep={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /snooze/i }))
    await waitFor(() => expect(snoozeTask).toHaveBeenCalledWith('o1', 'l1', 't1', '2026-08-08'))
  })

  it('needs attention: prompts to add a next step', () => {
    const onAdd = vi.fn()
    render(<NextActionBanner orgId="o1" lead={lead} tasks={[]} onAddNextStep={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add next step/i }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('closed: shows the outcome and no actions', () => {
    render(<NextActionBanner orgId="o1" lead={{ ...lead, stage: 'closed_won' }} tasks={[]} onAddNextStep={vi.fn()} />)
    expect(screen.getByText('Closed Won')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /done/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/opportunity/NextActionBanner.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `components/admin/opportunity/NextActionBanner.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Check, Clock, AlertCircle, CheckCircle2, PlusCircle } from 'lucide-react'
import { computeHealth, nextAction } from '@/lib/opportunity-health'
import { bannerContent, todayYmd, addDays } from '@/lib/opportunity-detail'
import { completeTask, snoozeTask } from '@/actions/tasks'
import { LEAD_STAGE_LABELS } from '@/lib/leads'
import type { Lead, Task } from '@/lib/types'

interface NextActionBannerProps {
  orgId: string
  lead: Lead
  tasks: Task[]
  onAddNextStep: () => void
}

const TONE: Record<string, string> = {
  active: 'border-primary/30 bg-primary/5',
  waiting: 'border-amber-300 bg-amber-50 dark:bg-amber-950/30',
  attention: 'border-destructive/40 bg-destructive/5',
  closed: 'border-border bg-muted/40',
}

export function NextActionBanner({ orgId, lead, tasks, onAddNextStep }: NextActionBannerProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const health = computeHealth(lead, tasks)
  const next = nextAction(tasks)
  const today = todayYmd()
  const content = bannerContent(health, {
    nextTitle: next?.title,
    dueYmd: next?.due_date,
    todayYmd: today,
    waitingReason: lead.waiting?.reason,
    waitingFollowUp: lead.waiting?.follow_up_date,
    stageLabel: LEAD_STAGE_LABELS[lead.stage],
  })

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Action failed'); setBusy(false) }
  }

  const Icon = content.tone === 'active' ? Clock
    : content.tone === 'waiting' ? Clock
    : content.tone === 'attention' ? AlertCircle
    : CheckCircle2

  return (
    <div className={`rounded-lg border p-4 ${TONE[content.tone]}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{content.heading}</p>
            <p className="text-sm text-muted-foreground">{content.detail}</p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {health === 'active' && next && (
            <>
              <Button size="sm" disabled={busy} onClick={() => run(() => completeTask(orgId, lead.id, next.id))}>
                <Check className="mr-1 h-4 w-4" /> Done
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => run(() => snoozeTask(orgId, lead.id, next.id, addDays(next.due_date ?? today, 3)))}
              >
                Snooze 3d
              </Button>
            </>
          )}
          {health === 'needs_attention' && (
            <Button size="sm" onClick={onAddNextStep}>
              <PlusCircle className="mr-1 h-4 w-4" /> Add next step
            </Button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/opportunity/NextActionBanner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add components/admin/opportunity/NextActionBanner.tsx __tests__/components/opportunity/NextActionBanner.test.tsx
git commit -m "feat(crm): next-action banner (done/snooze/add-next-step)"
```

---

### Task 5: `TasksPanel` component

**Files:**
- Create: `components/admin/opportunity/TasksPanel.tsx`
- Test: `__tests__/components/opportunity/TasksPanel.test.tsx`

**Interfaces:**
- Consumes: `createTask`, `completeTask` from `@/actions/tasks`; `dueStatus`, `todayYmd` from `@/lib/opportunity-detail`; `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Button`, `Input`; `useRouter`.
- Produces: `TasksPanel(props: { orgId: string; leadId: string; tasks: Task[]; addFormRef?: React.Ref<HTMLInputElement> }): JSX.Element`. Lists open then completed tasks; add form (title + optional date) calls `createTask`; each open task has a Complete control (`completeTask`); overdue/today due dates are visually flagged. Refreshes via `router.refresh()`. The `addFormRef` is forwarded to the title input so the banner's "Add next step" can focus it.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/opportunity/TasksPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const createTask = vi.fn().mockResolvedValue({})
const completeTask = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/tasks', () => ({
  createTask: (...a: unknown[]) => createTask(...a),
  completeTask: (...a: unknown[]) => completeTask(...a),
}))

import { TasksPanel } from '@/components/admin/opportunity/TasksPanel'
import type { Task } from '@/lib/types'

const open: Task = { id: 't1', lead_id: 'l1', title: 'Email client', done: false, created_at: '' }
const done: Task = { id: 't2', lead_id: 'l1', title: 'Old task', done: true, created_at: '' }

describe('TasksPanel', () => {
  beforeEach(() => { refresh.mockClear(); createTask.mockClear(); completeTask.mockClear() })

  it('lists tasks', () => {
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[open, done]} />)
    expect(screen.getByText('Email client')).toBeInTheDocument()
    expect(screen.getByText('Old task')).toBeInTheDocument()
  })

  it('adds a task', async () => {
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[]} />)
    fireEvent.change(screen.getByPlaceholderText(/add a task/i), { target: { value: 'Call caterer' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('o1', 'l1', expect.objectContaining({ title: 'Call caterer' })))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('completes a task', async () => {
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[open]} />)
    fireEvent.click(screen.getByRole('button', { name: /complete/i }))
    await waitFor(() => expect(completeTask).toHaveBeenCalledWith('o1', 'l1', 't1'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/opportunity/TasksPanel.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `components/admin/opportunity/TasksPanel.tsx`:

```tsx
'use client'

import { forwardRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Circle } from 'lucide-react'
import { createTask, completeTask } from '@/actions/tasks'
import { dueStatus, todayYmd } from '@/lib/opportunity-detail'
import type { Task } from '@/lib/types'

interface TasksPanelProps {
  orgId: string
  leadId: string
  tasks: Task[]
}

const dueClass: Record<string, string> = {
  overdue: 'text-destructive font-medium',
  today: 'text-amber-600 dark:text-amber-400 font-medium',
  upcoming: 'text-muted-foreground',
}

export const TasksPanel = forwardRef<HTMLInputElement, TasksPanelProps>(function TasksPanel(
  { orgId, leadId, tasks },
  titleRef
) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = todayYmd()

  const openTasks = tasks.filter((t) => !t.done)
  const doneTasks = tasks.filter((t) => t.done)

  async function handleAdd() {
    if (!title.trim()) return
    setBusy(true); setError(null)
    try {
      await createTask(orgId, leadId, { title: title.trim(), ...(due ? { due_date: due } : {}) })
      setTitle(''); setDue(''); router.refresh()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not add task') }
    finally { setBusy(false) }
  }

  async function handleComplete(id: string) {
    setError(null)
    try { await completeTask(orgId, leadId, id); router.refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not complete task') }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tasks</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            placeholder="Add a task…"
            className="flex-1"
          />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="sm:w-40" aria-label="Due date" />
          <Button onClick={handleAdd} disabled={busy || !title.trim()}>Add</Button>
        </div>

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        {openTasks.length === 0 && doneTasks.length === 0 && (
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        )}

        <ul className="divide-y divide-border">
          {openTasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <button
                type="button"
                aria-label={`Complete ${t.title}`}
                onClick={() => handleComplete(t.id)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Circle className="h-4 w-4" />
              </button>
              <span className="flex-1 text-sm">{t.title}</span>
              {t.due_date && (
                <span className={`text-xs ${dueClass[dueStatus(t.due_date, today)]}`}>{t.due_date}</span>
              )}
            </li>
          ))}
          {doneTasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2 text-muted-foreground">
              <span className="text-sm line-through">{t.title}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/opportunity/TasksPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add components/admin/opportunity/TasksPanel.tsx __tests__/components/opportunity/TasksPanel.test.tsx
git commit -m "feat(crm): tasks panel (list/add/complete)"
```

---

### Task 6: `ActivityTimeline` component (with add-note composer)

**Files:**
- Create: `components/admin/opportunity/ActivityTimeline.tsx`
- Test: `__tests__/components/opportunity/ActivityTimeline.test.tsx`

**Interfaces:**
- Consumes: `createNote` from `@/actions/notes`; `formatRelativeTime` from `@/lib/opportunity-detail`; `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Button`; `useRouter`; icons `StickyNote, ArrowRightLeft, CheckSquare, Mail, FileText, Sparkles` from `lucide-react`.
- Produces: `ActivityTimeline(props: { orgId: string; leadId: string; activity: ActivityEvent[] }): JSX.Element`. A note composer at the top calls `createNote({ parent_type: 'opportunity', parent_id: leadId, body })` then `router.refresh()` (the note surfaces in the timeline via its logged `note` activity). The list renders each `ActivityEvent` with a kind icon, summary, and relative time.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/opportunity/ActivityTimeline.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const createNote = vi.fn().mockResolvedValue({})
vi.mock('@/actions/notes', () => ({ createNote: (...a: unknown[]) => createNote(...a) }))

import { ActivityTimeline } from '@/components/admin/opportunity/ActivityTimeline'
import type { ActivityEvent } from '@/lib/types'

const events: ActivityEvent[] = [
  { id: 'a1', parent_type: 'opportunity', parent_id: 'l1', kind: 'stage', summary: 'Stage → proposal', created_at: '2026-08-05T10:00:00.000Z' },
]

describe('ActivityTimeline', () => {
  beforeEach(() => { refresh.mockClear(); createNote.mockClear() })

  it('renders events', () => {
    render(<ActivityTimeline orgId="o1" leadId="l1" activity={events} />)
    expect(screen.getByText('Stage → proposal')).toBeInTheDocument()
  })

  it('shows an empty state', () => {
    render(<ActivityTimeline orgId="o1" leadId="l1" activity={[]} />)
    expect(screen.getByText(/no activity/i)).toBeInTheDocument()
  })

  it('adds a note', async () => {
    render(<ActivityTimeline orgId="o1" leadId="l1" activity={[]} />)
    fireEvent.change(screen.getByPlaceholderText(/add a note/i), { target: { value: 'Talked to client' } })
    fireEvent.click(screen.getByRole('button', { name: /add note/i }))
    await waitFor(() => expect(createNote).toHaveBeenCalledWith('o1', { parent_type: 'opportunity', parent_id: 'l1', body: 'Talked to client' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/opportunity/ActivityTimeline.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `components/admin/opportunity/ActivityTimeline.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StickyNote, ArrowRightLeft, CheckSquare, Mail, FileText, Sparkles } from 'lucide-react'
import { createNote } from '@/actions/notes'
import { formatRelativeTime } from '@/lib/opportunity-detail'
import type { ActivityEvent } from '@/lib/types'

interface ActivityTimelineProps {
  orgId: string
  leadId: string
  activity: ActivityEvent[]
}

const KIND_ICON = {
  note: StickyNote,
  stage: ArrowRightLeft,
  task: CheckSquare,
  email: Mail,
  form: FileText,
  created: Sparkles,
} as const

export function ActivityTimeline({ orgId, leadId, activity }: ActivityTimelineProps) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAddNote() {
    if (!body.trim()) return
    setBusy(true); setError(null)
    try {
      await createNote(orgId, { parent_type: 'opportunity', parent_id: leadId, body: body.trim() })
      setBody(''); router.refresh()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not add note') }
    finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note…"
            className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleAddNote} disabled={busy || !body.trim()}>Add note</Button>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>

        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ul className="space-y-3">
            {activity.map((e) => {
              const Icon = KIND_ICON[e.kind] ?? Sparkles
              return (
                <li key={e.id} className="flex gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{e.summary}</p>
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(e.created_at)}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/opportunity/ActivityTimeline.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add components/admin/opportunity/ActivityTimeline.tsx __tests__/components/opportunity/ActivityTimeline.test.tsx
git commit -m "feat(crm): activity timeline + add-note composer"
```

---

### Task 7: `AttachmentChips` component

**Files:**
- Create: `components/admin/opportunity/AttachmentChips.tsx`
- Test: `__tests__/components/opportunity/AttachmentChips.test.tsx`

**Interfaces:**
- Consumes: `attachmentChips` from `@/lib/opportunity-detail`; `Proposal, Invoice, Contract, Vendor` from `@/lib/types`.
- Produces: `AttachmentChips(props: { proposals: Proposal[]; invoices: Invoice[]; contracts: Contract[]; vendors: Vendor[] }): JSX.Element`. A compact strip of chips `Label · count (hint)`; a chip with count 0 renders muted.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/opportunity/AttachmentChips.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AttachmentChips } from '@/components/admin/opportunity/AttachmentChips'

describe('AttachmentChips', () => {
  it('renders a chip per attachment kind with counts', () => {
    render(<AttachmentChips
      proposals={[{ status: 'accepted' } as any]}
      invoices={[]}
      contracts={[]}
      vendors={[]}
    />)
    expect(screen.getByText(/Proposals/)).toBeInTheDocument()
    expect(screen.getByText('1 accepted')).toBeInTheDocument()
    expect(screen.getByText(/Invoices/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/opportunity/AttachmentChips.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `components/admin/opportunity/AttachmentChips.tsx`:

```tsx
import { attachmentChips } from '@/lib/opportunity-detail'
import type { Proposal, Invoice, Contract, Vendor } from '@/lib/types'

interface AttachmentChipsProps {
  proposals: Proposal[]
  invoices: Invoice[]
  contracts: Contract[]
  vendors: Vendor[]
}

export function AttachmentChips(props: AttachmentChipsProps) {
  const chips = attachmentChips(props)
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span
          key={c.kind}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
            c.count === 0 ? 'border-border text-muted-foreground' : 'border-border bg-muted/50'
          }`}
        >
          <span className="font-medium">{c.label}</span>
          <span>{c.count}</span>
          {c.hint && <span className="text-muted-foreground">· {c.hint}</span>}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/opportunity/AttachmentChips.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add components/admin/opportunity/AttachmentChips.tsx __tests__/components/opportunity/AttachmentChips.test.tsx
git commit -m "feat(crm): attachment summary chips"
```

---

### Task 8: `OpportunityDetailsForm` (extract the editable lead fields)

**Files:**
- Create: `components/admin/opportunity/OpportunityDetailsForm.tsx`
- Test: `__tests__/components/opportunity/OpportunityDetailsForm.test.tsx`

**Interfaces:**
- Consumes: `updateLead`, `LeadUpdate` from `@/actions/leads`; `LEAD_STAGES`, `LEAD_STAGE_LABELS` from `@/lib/leads`; `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Button`, `Input`, `Label`.
- Produces: `OpportunityDetailsForm(props: { orgId: string; lead: Lead }): JSX.Element`. Same fields/validation/save behavior as the old `LeadDetailClient` body (name required, numeric estimated_value, `opt()` trimming, `updateLead`), collapsed into an editable "Details" card. **No** back link / delete / title (the orchestrator owns those). On save, `router.refresh()` so the banner/health recompute after a stage change.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/opportunity/OpportunityDetailsForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const updateLead = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({ updateLead: (...a: unknown[]) => updateLead(...a) }))

import { OpportunityDetailsForm } from '@/components/admin/opportunity/OpportunityDetailsForm'
import type { Lead } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'Ada', stage: 'inquiry', created_at: '', estimated_value: 1000 }

describe('OpportunityDetailsForm', () => {
  beforeEach(() => { refresh.mockClear(); updateLead.mockClear() })

  it('saves edits', async () => {
    render(<OpportunityDetailsForm orgId="o1" lead={lead} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada L' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(updateLead).toHaveBeenCalledWith('o1', 'l1', expect.objectContaining({ name: 'Ada L' })))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('requires a name', async () => {
    render(<OpportunityDetailsForm orgId="o1" lead={lead} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(updateLead).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/opportunity/OpportunityDetailsForm.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `components/admin/opportunity/OpportunityDetailsForm.tsx` (port the field logic from the old `LeadDetailClient`, minus header/back/delete; add `router.refresh()` on success):

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateLead, type LeadUpdate } from '@/actions/leads'
import { LEAD_STAGES, LEAD_STAGE_LABELS } from '@/lib/leads'
import type { Lead, LeadStage } from '@/lib/types'

interface OpportunityDetailsFormProps {
  orgId: string
  lead: Lead
}

export function OpportunityDetailsForm({ orgId, lead }: OpportunityDetailsFormProps) {
  const router = useRouter()
  const [name, setName] = useState(lead.name)
  const [organization, setOrganization] = useState(lead.organization ?? '')
  const [email, setEmail] = useState(lead.email ?? '')
  const [phone, setPhone] = useState(lead.phone ?? '')
  const [eventType, setEventType] = useState(lead.event_type ?? '')
  const [eventDate, setEventDate] = useState(lead.event_date ?? '')
  const [estimatedValue, setEstimatedValue] = useState(lead.estimated_value != null ? String(lead.estimated_value) : '')
  const [stage, setStage] = useState<LeadStage>(lead.stage)
  const [notes, setNotes] = useState(lead.notes ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const opt = (v: string): string | null => (v.trim() === '' ? null : v.trim())

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); setNotice(null); return }
    setSaving(true); setError(null); setNotice(null)
    try {
      const parsed = estimatedValue.trim() === '' ? null : Number(estimatedValue)
      if (parsed != null && Number.isNaN(parsed)) { setError('Estimated value must be a number.'); return }
      const updates: LeadUpdate = {
        name: name.trim(),
        organization: opt(organization),
        email: opt(email),
        phone: opt(phone),
        event_type: opt(eventType),
        event_date: opt(eventDate),
        estimated_value: parsed,
        stage,
        notes: opt(notes),
      }
      await updateLead(orgId, lead.id, updates)
      setNotice('Saved.')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div aria-live="polite" aria-atomic="true">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="oppName">Name</Label>
            <Input id="oppName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oppOrg">Organization</Label>
            <Input id="oppOrg" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Company" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oppEmail">Email</Label>
            <Input id="oppEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oppPhone">Phone</Label>
            <Input id="oppPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oppEventType">Event type</Label>
            <Input id="oppEventType" value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="e.g. Wedding" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oppEventDate">Event date</Label>
            <Input id="oppEventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oppValue">Estimated value</Label>
            <Input id="oppValue" type="number" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oppStage">Stage</Label>
            <select
              id="oppStage"
              value={stage}
              onChange={(e) => setStage(e.target.value as LeadStage)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {LEAD_STAGES.map((s) => <option key={s} value={s}>{LEAD_STAGE_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="oppNotes">Notes</Label>
          <textarea
            id="oppNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/opportunity/OpportunityDetailsForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add components/admin/opportunity/OpportunityDetailsForm.tsx __tests__/components/opportunity/OpportunityDetailsForm.test.tsx
git commit -m "feat(crm): extract editable opportunity details form"
```

---

### Task 9: `OpportunityDetailClient` orchestrator

**Files:**
- Create: `components/admin/OpportunityDetailClient.tsx`
- Test: `__tests__/components/opportunity/OpportunityDetailClient.test.tsx`

**Interfaces:**
- Consumes: `ContactCard`, `NextActionBanner`, `TasksPanel`, `ActivityTimeline`, `OpportunityDetailsForm` (all above); `deleteLead` from `@/actions/leads`; `LEAD_STAGE_LABELS` from `@/lib/leads`; `Button`; `Link`, `useRouter`.
- Produces: `OpportunityDetailClient(props: { orgId: string; orgSlug: string; lead: Lead; customer: Customer | null; tasks: Task[]; activity: ActivityEvent[] }): JSX.Element`. Owns: back link, title (`lead.name`) + stage label, delete button (`deleteLead` → confirm → `router.push('/{orgSlug}/leads')`), the next-action banner, and a responsive grid: **main** (banner, TasksPanel, ActivityTimeline, OpportunityDetailsForm) + **aside** (ContactCard). On mobile the ContactCard stacks first (order utilities). Holds a `ref` to the TasksPanel title input; the banner's `onAddNextStep` focuses it.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/opportunity/OpportunityDetailClient.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
const deleteLead = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({ deleteLead: (...a: unknown[]) => deleteLead(...a), updateLead: vi.fn() }))
vi.mock('@/actions/tasks', () => ({ createTask: vi.fn(), completeTask: vi.fn(), snoozeTask: vi.fn() }))
vi.mock('@/actions/notes', () => ({ createNote: vi.fn() }))

import { OpportunityDetailClient } from '@/components/admin/OpportunityDetailClient'
import type { Lead } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'Ada Wedding', stage: 'proposal', created_at: '' }

describe('OpportunityDetailClient', () => {
  beforeEach(() => { push.mockClear(); deleteLead.mockClear() })

  it('renders header, banner, tasks and activity', () => {
    render(<OpportunityDetailClient orgId="o1" orgSlug="acme" lead={lead} customer={null} tasks={[]} activity={[]} />)
    expect(screen.getByRole('heading', { name: 'Ada Wedding' })).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    // needs_attention banner CTA present (no tasks, open stage)
    expect(screen.getByRole('button', { name: /add next step/i })).toBeInTheDocument()
  })

  it('deletes after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<OpportunityDetailClient orgId="o1" orgSlug="acme" lead={lead} customer={null} tasks={[]} activity={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    await waitFor(() => expect(deleteLead).toHaveBeenCalledWith('o1', 'l1'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/acme/leads'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/opportunity/OpportunityDetailClient.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `components/admin/OpportunityDetailClient.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deleteLead } from '@/actions/leads'
import { LEAD_STAGE_LABELS } from '@/lib/leads'
import { ContactCard } from '@/components/admin/opportunity/ContactCard'
import { NextActionBanner } from '@/components/admin/opportunity/NextActionBanner'
import { TasksPanel } from '@/components/admin/opportunity/TasksPanel'
import { ActivityTimeline } from '@/components/admin/opportunity/ActivityTimeline'
import { OpportunityDetailsForm } from '@/components/admin/opportunity/OpportunityDetailsForm'
import type { ActivityEvent, Customer, Lead, Task } from '@/lib/types'

interface OpportunityDetailClientProps {
  orgId: string
  orgSlug: string
  lead: Lead
  customer: Customer | null
  tasks: Task[]
  activity: ActivityEvent[]
}

export function OpportunityDetailClient({ orgId, orgSlug, lead, customer, tasks, activity }: OpportunityDetailClientProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const taskInputRef = useRef<HTMLInputElement>(null)

  async function handleDelete() {
    if (!confirm(`Delete "${lead.name}"? This cannot be undone.`)) return
    setDeleting(true); setError(null)
    try {
      await deleteLead(orgId, lead.id)
      router.push(`/${orgSlug}/leads`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link href={`/${orgSlug}/leads`} className="text-sm text-muted-foreground hover:underline">
        ← Back to pipeline
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{lead.name}</h1>
          <p className="text-sm text-muted-foreground">{LEAD_STAGE_LABELS[lead.stage]}</p>
        </div>
        <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <NextActionBanner
        orgId={orgId}
        lead={lead}
        tasks={tasks}
        onAddNextStep={() => taskInputRef.current?.focus()}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Contact card: first on mobile, right column on desktop */}
        <aside className="order-first space-y-4 lg:order-last lg:col-span-1">
          <ContactCard customer={customer} lead={lead} />
        </aside>
        <div className="space-y-4 lg:col-span-2">
          <TasksPanel ref={taskInputRef} orgId={orgId} leadId={lead.id} tasks={tasks} />
          <ActivityTimeline orgId={orgId} leadId={lead.id} activity={activity} />
          <OpportunityDetailsForm orgId={orgId} lead={lead} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/opportunity/OpportunityDetailClient.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add components/admin/OpportunityDetailClient.tsx __tests__/components/opportunity/OpportunityDetailClient.test.tsx
git commit -m "feat(crm): opportunity detail orchestrator (layout + delete)"
```

---

### Task 10: Wire the page + retire `LeadDetailClient`

**Files:**
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`
- Delete: `components/admin/LeadDetailClient.tsx`

**Interfaces:**
- Consumes: `getLead` (`@/actions/leads`), `getCustomer` (`@/actions/customers`), `listTasks` (`@/actions/tasks`), `listActivity` (`@/actions/activity`), the existing `list*` attachment actions, `OpportunityDetailClient`, and the existing `Lead*Client` + `AttachmentChips`.
- Produces: the fully composed Opportunity detail route.

- [ ] **Step 1: Confirm `LeadDetailClient` has no other consumers**

Run: `git grep -n "LeadDetailClient"`
Expected: only the page import + the file itself. (If anything else references it, stop and reassess before deleting.)

- [ ] **Step 2: Rewrite the page**

Replace `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx` with:

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getLead } from '@/actions/leads'
import { getCustomer } from '@/actions/customers'
import { listTasks } from '@/actions/tasks'
import { listActivity } from '@/actions/activity'
import { listProposals } from '@/actions/proposals'
import { listInvoices } from '@/actions/invoices'
import { listContracts } from '@/actions/contracts'
import { listVendors } from '@/actions/vendors'
import { OpportunityDetailClient } from '@/components/admin/OpportunityDetailClient'
import { AttachmentChips } from '@/components/admin/opportunity/AttachmentChips'
import { LeadProposalsClient } from '@/components/admin/LeadProposalsClient'
import { LeadInvoicesClient } from '@/components/admin/LeadInvoicesClient'
import { LeadContractsClient } from '@/components/admin/LeadContractsClient'
import { LeadVendorsClient } from '@/components/admin/LeadVendorsClient'
import { ClientPortalLinkClient } from '@/components/admin/ClientPortalLinkClient'

export default async function LeadDetailPage({ params }: { params: Promise<{ orgSlug: string; leadId: string }> }) {
  const { orgSlug, leadId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const lead = await getLead(orgId, leadId)
  if (!lead) notFound()

  const [customer, tasks, activity, proposals, invoices, contracts, vendors] = await Promise.all([
    lead.customer_id ? getCustomer(orgId, lead.customer_id) : Promise.resolve(null),
    listTasks(orgId, leadId),
    listActivity(orgId, 'opportunity', leadId),
    listProposals(orgId, leadId),
    listInvoices(orgId, leadId),
    listContracts(orgId, leadId),
    listVendors(orgId, leadId),
  ])

  return (
    <>
      <OpportunityDetailClient
        orgId={orgId}
        orgSlug={orgSlug}
        lead={lead}
        customer={customer}
        tasks={tasks}
        activity={activity}
      />

      <div className="mx-auto max-w-5xl space-y-4 px-6 pb-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Attachments</h2>
        <AttachmentChips proposals={proposals} invoices={invoices} contracts={contracts} vendors={vendors} />
      </div>

      <LeadProposalsClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} proposals={proposals} />
      <LeadInvoicesClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} invoices={invoices} />
      <LeadContractsClient orgId={orgId} orgSlug={orgSlug} leadId={leadId} contracts={contracts} />
      <LeadVendorsClient orgId={orgId} leadId={leadId} vendors={vendors} />
      <ClientPortalLinkClient orgId={orgId} leadId={leadId} />
    </>
  )
}
```

> Note: keep the existing `Lead*Client` max-width/padding wrappers as-is. If their `max-w-2xl` looks narrow next to the new `max-w-5xl` header, that is acceptable for V1 (they are the unchanged modules); do not restyle them here.

- [ ] **Step 3: Delete the retired component**

```bash
git rm components/admin/LeadDetailClient.tsx
```

- [ ] **Step 4: Full green gate**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: all suites pass (run `npm install` first if you see ~5 server-only load failures).

- [ ] **Step 5: Browser verification**

Start the app (`npm run dev`) and open an existing lead at `/{orgSlug}/leads/{leadId}`. Confirm:
- Contact card is compact top-right on desktop, full-width on top on mobile (resize).
- Banner reflects state: with no dated task → "Add next step" (focuses the task input); add a dated task → banner shows it with Done + Snooze; Done clears it; Snooze pushes the date +3.
- Adding a note appears in the Activity timeline; completing/adding tasks and stage changes appear too.
- Attachment chips show counts; the existing Proposal/Invoice/Contract/Vendor modules still work below.

- [ ] **Step 6: Commit**

```bash
git add app/(admin)/[orgSlug]/leads/[leadId]/page.tsx
git commit -m "feat(crm): compose opportunity detail page + retire LeadDetailClient"
```

---

## Final whole-branch review

After Task 10, run a whole-branch review (superpowers:requesting-code-review) covering: increment-1 model/actions unchanged except the additive `snoozeTask`; no `main` commits; TDD followed; responsive layout; reuse of the attachment modules; tsc + full vitest green. Address findings, then open a PR against `main` and STOP (do not merge).

---

## Self-Review (author checklist — completed)

**Spec coverage** (design §Screens#2 "Opportunity detail" + prompt BUILD):
- Compact contact card top-right / top-on-mobile → Task 3 (`ContactCard`) + Task 9 grid order utilities. ✔
- Prominent next-action banner (Active/Waiting/Needs-attention) with Done + Snooze → Task 4 (`NextActionBanner`) driven by `computeHealth`/`nextAction`; Done=`completeTask`, Snooze=`snoozeTask` (Task 2), Needs-attention="Add next step" focuses the task input. ✔
- Tasks column (list + add + complete) → Task 5 (`TasksPanel`). ✔
- Activity timeline (`listActivity`) → Task 6 (`ActivityTimeline`), plus note-create composer (allowed mutation). ✔
- Attached Proposal/Invoice/Contract chips at the bottom, reusing existing modules → Task 7 (`AttachmentChips`) + Task 10 renders unchanged `Lead*Client`. ✔
- Mobile-responsive throughout → grid/order utilities + stacking inputs across Tasks 3–9. ✔
- Keep increment-1 actions/model unchanged; only add read/display + task/note create → honored, with the single documented additive `snoozeTask` needed for the explicit "Snooze" requirement. ✔

**Placeholder scan:** every code step contains real code; no TBD/TODO/"handle edge cases". ✔

**Type consistency:** action signatures match the read source — `createTask(orgId, leadId, {title, due_date?})`, `completeTask(orgId, leadId, taskId)`, `snoozeTask(orgId, leadId, taskId, dueDate)`, `createNote(orgId, {parent_type, parent_id, body})`, `listActivity(orgId, 'opportunity', leadId)`, `getCustomer(orgId, customerId)`, `computeHealth(lead, tasks)`, `nextAction(tasks)`. `Task.lead_id`/`due_date`, `Lead.customer_id`/`waiting`, `ActivityEvent.kind` all per `lib/types.ts`. Helper names (`bannerContent`, `attachmentChips`, `dueStatus`, `todayYmd`, `addDays`, `formatRelativeTime`, `initials`) are consistent across producer (Task 1) and consumers (Tasks 3–9). ✔
