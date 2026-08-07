# Convert to Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A won opportunity becomes a scheduled job in one deliberate action — `Event.lead_id` links the two, Today surfaces won-but-unscheduled work, and the closeout invoice inherits its opportunity instead of prompting for one.

**Architecture:** Seven tasks. Task 1 extracts a guard-free events core (`lib/events.ts`) and adds `Event.lead_id`. Task 2 lifts `/new-event`'s inline event-type resolution into a shared helper. Task 3 builds the conversion core and action. Task 4 is the convert UI on the opportunity detail. Tasks 5–6 add Today's "Won, not scheduled" list (pure aggregator first, then component). Task 7 makes the closeout invoice derive its opportunity.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), React 19, TypeScript, Firestore (`firebase-admin`), Tailwind, shadcn-style primitives in `components/ui/*`, Vitest + jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-07-convert-to-work-design.md`

## Global Constraints

- **This is NOT the Next.js you know.** Read the relevant guide in `node_modules/next/dist/docs/` before any routing/server-action work; heed deprecation notices. (AGENTS.md)
- **`'use server'` modules export async functions ONLY.** Never re-export a type from `actions/*` — it passes `tsc` and breaks `next build` (RSC compiler). See the NOTE comments in `actions/leads.ts`, `actions/today.ts`, `actions/customers.ts`.
- **Cores (`lib/crm/*.ts`, `lib/ops/*.ts`, and the new `lib/events.ts`) carry no `'use server'`, no `import 'server-only'`, and call no `assert*`.**
- **Cores do data; actions log activity.** `lib/activity.ts` carries `import 'server-only'`, so a core must never import `logActivity`. This mirrors `setLeadWaiting`/`clearLeadWaiting` in `actions/leads.ts`: core mutates, action logs. **This is a deliberate refinement of the spec**, which described activity logging inside the convert core.
- **Cores validate their own inputs.** Precedent: `updateLeadCore` validates stage; `instantiateOpsPlanCore` validates guests.
- **`opportunityTitle(lead)` from `lib/leads.ts` is the single canonical way to label an opportunity.** Never inline the `title ?? name` fallback.
- **Health stays derived** — never store an `active`/`waiting`/`needs_attention` flag.
- **Firestore rejects `undefined`.** Build write payloads with conditional spreads (`...(x ? { x } : {})`), never `x: undefined`.
- **Restraint (design principle):** one clear action per view; quiet, dense bordered rows, not card-soup. Mobile-responsive.
- Reads require `assertOrgMember`; writes require `assertOrgAdmin`.
- **Green gate every task:** `npx tsc --noEmit` clean, `npm test` passing, `npm run lint` 0 errors (20 pre-existing warnings expected). Baseline is **153 test files / 1044 tests / 0 failures**; the count only goes up.
- **Run `npm run build` before declaring Tasks 3, 4 and 7 green** — `tsc` alone does not catch the `'use server'` type re-export failure.
- **Worktree:** all work happens in `/Users/rm/vw/traxevent/.claude/worktrees/convert-to-work` on branch `claude/convert-to-work`. Confirm `git rev-parse --abbrev-ref HEAD` before every commit. **Never commit to `main`.**
- **Never run vitest from the primary checkout.** It scans sibling worktrees and produces thousands of false failures. From the worktree, run `npm test`. If you must run from the primary checkout, add `--exclude '**/.claude/**' --exclude '**/.worktrees/**'`.

---

## File Structure

**Created:**
- `lib/events.ts` — guard-free events core: `eventsRef`, `createEventCore`, `listEventsCore`, `listEventsByLeadCore`.
- `lib/crm/convert.ts` — `convertOpportunityToWorkCore` + `ConvertToWorkInput`.
- `components/admin/opportunity/ConvertToWorkCard.tsx` — the convert affordance and its form.
- `components/admin/today/WonUnscheduledList.tsx` — the fourth Today list.
- Tests: `__tests__/lib/events.test.ts`, `__tests__/lib/crm/convert.test.ts`, `__tests__/actions/convert.test.ts`, `__tests__/components/opportunity/ConvertToWorkCard.test.tsx`, `__tests__/components/today/WonUnscheduledList.test.tsx`.

**Modified:**
- `lib/types.ts` — `Event.lead_id?`, `ActivityEvent.kind` gains `'converted'`.
- `actions/events.ts` — `createEvent`/`listEvents` delegate to the core; add `listEventsByLead`.
- `lib/event-types.ts` — add `eventCreateFieldsFromType`.
- `app/(admin)/[orgSlug]/new-event/page.tsx` — use the shared helper.
- `actions/leads.ts` — add `convertOpportunityToWork`.
- `components/admin/OpportunityDetailClient.tsx` — render `ConvertToWorkCard`.
- `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx` — load linked jobs + org event types.
- `lib/today.ts` — `WonUnscheduledItem`, `buildToday` input gains `scheduledLeadIds`.
- `actions/today.ts` — read events once; derive `scheduledLeadIds`.
- `components/admin/today/TodayClient.tsx` — mount the new list.
- `actions/invoices.ts` — `generateCloseoutInvoice` `leadId` becomes optional.
- `app/(admin)/[orgSlug]/[eventSlug]/ops/closeout/page.tsx` — skip `listLeads` when linked.
- `components/admin/ops/CloseoutClient.tsx` — read-only bill-to when linked.
- Tests: `__tests__/actions/today.test.ts`, `__tests__/lib/today.test.ts`, `__tests__/components/today/TodayClient.test.tsx`, `__tests__/actions/closeout-invoice.test.ts`, `__tests__/actions/events.test.ts` (**must pass unchanged** — see Task 1).

**Deleted:** none.

---

### Task 1: Events core + `Event.lead_id`

`actions/events.ts` writes Firestore directly — events have no guard-free core, so nothing else on the server can create or query an event without paying an auth check. Extract one, matching the split already established by `lib/crm/tasks.ts`.

The load-bearing constraint: **`__tests__/actions/events.test.ts` must pass with zero edits.** Its `adminDb` mock chains `collection`/`doc` via `mockReturnThis()` and exposes `id: 'camp-id-123'`, so a faithful extraction keeps working. If you find yourself editing that file, the extraction drifted.

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/events.ts`
- Modify: `actions/events.ts`
- Test: `__tests__/lib/events.test.ts`

**Interfaces:**
- Produces: `eventsRef(orgId: string)`; `CreateEventCoreInput`; `createEventCore(orgId: string, input: CreateEventCoreInput): Promise<Event>`; `listEventsCore(orgId: string): Promise<Event[]>`; `listEventsByLeadCore(orgId: string, leadId: string): Promise<Event[]>`; `listEventsByLead(orgId: string, leadId: string): Promise<Event[]>` (action); `Event.lead_id?: string`.
- Consumes: `buildEventSlug` (`@/lib/slug`), `DEFAULT_EVENT_TYPE_ID` + `Terminology` (`@/lib/event-types`).

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/events.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const setSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const whereGet = vi.hoisted(() => vi.fn())
const collRef = vi.hoisted(() => ({
  doc: vi.fn(() => ({ id: 'evt-1', set: setSpy })),
  where: vi.fn(() => ({ get: whereGet })),
  orderBy: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ docs: [] }) })),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))

import { createEventCore, listEventsByLeadCore } from '@/lib/events'

const base = {
  name: 'Nguyen Wedding',
  year: 2026,
  registration_type: 'individual' as const,
  event_start: '2026-09-12',
  event_end: '2026-09-12',
}

describe('createEventCore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stores lead_id and headcount when supplied', async () => {
    const event = await createEventCore('o1', { ...base, lead_id: 'l1', headcount: 180 })
    expect(event.lead_id).toBe('l1')
    expect(event.headcount).toBe(180)
    expect(event.slug).toBe('nguyen-wedding-2026')
    expect(setSpy).toHaveBeenCalledOnce()
  })

  it('omits lead_id and headcount entirely when absent', async () => {
    const event = await createEventCore('o1', base)
    expect('lead_id' in event).toBe(false)
    expect('headcount' in event).toBe(false)
  })

  it('defaults event_type_id when omitted', async () => {
    const event = await createEventCore('o1', base)
    expect(event.event_type_id).toBe('event')
  })
})

describe('listEventsByLeadCore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('queries by lead_id and sorts newest first in memory', async () => {
    whereGet.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'e-old', created_at: '2026-01-01T00:00:00.000Z' }) },
        { data: () => ({ id: 'e-new', created_at: '2026-05-01T00:00:00.000Z' }) },
      ],
    })
    const events = await listEventsByLeadCore('o1', 'l1')
    expect(collRef.where).toHaveBeenCalledWith('lead_id', '==', 'l1')
    expect(events.map((e) => e.id)).toEqual(['e-new', 'e-old'])
  })

  it('returns an empty array when the opportunity has no jobs', async () => {
    whereGet.mockResolvedValue({ docs: [] })
    expect(await listEventsByLeadCore('o1', 'l1')).toEqual([])
  })
})
```

The in-memory sort is asserted deliberately: the query must **not** chain `.orderBy('created_at')`, which would force a composite index.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/events`
Expected: FAIL — cannot resolve `@/lib/events`.

- [ ] **Step 3: Implement**

In `lib/types.ts`, add to `Event` (directly under `headcount`):

```ts
  lead_id?: string                   // the opportunity this job came from; absent for manual events
```

and widen the activity kind:

```ts
  kind: 'stage' | 'task' | 'note' | 'email' | 'form' | 'created' | 'waiting' | 'converted'
```

Create `lib/events.ts`. The `Event` literal is lifted **verbatim** from `actions/events.ts:29-49`, plus the two new conditional spreads:

```ts
import { adminDb } from '@/lib/firebase-admin'
import { buildEventSlug } from '@/lib/slug'
import { DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import type { Terminology } from '@/lib/event-types'
import type { Event, EventRegistrationType } from '@/lib/types'

export function eventsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('events')
}

export interface CreateEventCoreInput {
  name: string
  year: number
  registration_type: EventRegistrationType
  event_type_id?: string
  event_type_terminology?: Terminology
  event_start: string
  event_end: string
  department_id?: string | null
  headcount?: number
  lead_id?: string
}

/** Guard-free event create. Authorization is the caller's responsibility. */
export async function createEventCore(orgId: string, input: CreateEventCoreInput): Promise<Event> {
  const eventRef = eventsRef(orgId).doc()
  const event: Event = {
    id: eventRef.id,
    name: input.name,
    slug: buildEventSlug(input.name, input.year),
    year: input.year,
    status: 'draft',
    registration_type: input.registration_type,
    event_type_id: input.event_type_id ?? DEFAULT_EVENT_TYPE_ID,
    ...(input.event_type_terminology ? { event_type_terminology: input.event_type_terminology } : {}),
    ...(input.department_id ? { department_id: input.department_id } : {}),
    ...(input.headcount !== undefined ? { headcount: input.headcount } : {}),
    ...(input.lead_id ? { lead_id: input.lead_id } : {}),
    features: {
      accommodations: true,
      teams: true,
      budget: true,
      itinerary: true,
      communicate: true,
    },
    event_start: input.event_start,
    event_end: input.event_end,
    created_at: new Date().toISOString(),
  }
  await eventRef.set(event)
  return event
}

/** Guard-free event list, newest first. */
export async function listEventsCore(orgId: string): Promise<Event[]> {
  const snap = await eventsRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Event)
}

/**
 * Every job created from one opportunity, newest first. Deliberately does NOT
 * chain .orderBy() — a composite index for an equality query returning one or
 * two docs is not worth carrying. Sorted in memory instead.
 */
export async function listEventsByLeadCore(orgId: string, leadId: string): Promise<Event[]> {
  const snap = await eventsRef(orgId).where('lead_id', '==', leadId).get()
  return snap.docs
    .map((d) => d.data() as Event)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}
```

In `actions/events.ts`:
- Add `import { createEventCore, listEventsCore, listEventsByLeadCore, type CreateEventCoreInput } from '@/lib/events'`.
- Replace `createEvent`'s body (keeping its exact existing signature) with:

```ts
export async function createEvent(
  orgId: string,
  input: {
    name: string
    year: number
    registration_type: EventRegistrationType
    event_type_id?: string
    event_type_terminology?: Terminology
    event_start: string
    event_end: string
    department_id?: string | null
  }
): Promise<Event> {
  await assertOrgAdmin(orgId)
  return createEventCore(orgId, input)
}
```

- Replace `listEvents`'s body with `await assertOrgMember(orgId); return listEventsCore(orgId)`.
- Add:

```ts
export async function listEventsByLead(orgId: string, leadId: string): Promise<Event[]> {
  await assertOrgMember(orgId)
  return listEventsByLeadCore(orgId, leadId)
}
```

**Lint trap:** once those two bodies are gone, `actions/events.ts` may no longer use `buildEventSlug`, `DEFAULT_EVENT_TYPE_ID`, or `randomBytes`. Remove any import that is now unused — ESLint fails the build on unused imports. Do **not** remove `adminDb` or `FieldValue` without checking: `updateEvent` and `duplicateEvent` still use them.

`CreateEventCoreInput` is imported as a type and **not** re-exported — `actions/events.ts` is a `'use server'` module.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/events` → PASS.
Run: `npm test -- actions/events actions/duplicate-event` → PASS **with no edits to those files**. If they fail, the extraction drifted from the original literal; fix `lib/events.ts`, not the tests.
Then `npm test`, `npx tsc --noEmit`, `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/events.ts actions/events.ts __tests__/lib/events.test.ts
git commit -m "feat(events): guard-free events core and Event.lead_id"
```

---

### Task 2: Shared event-type field resolution

`/new-event` resolves `registration_type` and custom terminology from the selected `EventType` inline (`app/(admin)/[orgSlug]/new-event/page.tsx:52-58`). The convert form needs the same three lines. Lift them into `lib/event-types.ts` now, so there is one implementation before there are two callers.

**Files:**
- Modify: `lib/event-types.ts`
- Modify: `app/(admin)/[orgSlug]/new-event/page.tsx`
- Test: `__tests__/lib/event-types.test.ts`

**Interfaces:**
- Produces: `eventCreateFieldsFromType(type: EventType): { event_type_id: string; registration_type: RegistrationUnit; event_type_terminology?: Terminology }`.

**Type note:** `RegistrationUnit` (`lib/event-types.ts`) and `EventRegistrationType` (`lib/types.ts`) are two names for the same union, `'family' | 'individual' | 'child'`. They are structurally identical, so the helper's output assigns cleanly to `CreateEventCoreInput` and `ConvertToWorkInput` without a cast. Do **not** "fix" this by unifying them — that is unrelated refactoring across two modules this increment otherwise leaves alone.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/lib/event-types.test.ts`:

```ts
import { eventCreateFieldsFromType, getEventType } from '@/lib/event-types'
import type { EventType } from '@/lib/event-types'

describe('eventCreateFieldsFromType', () => {
  it('carries id and registration unit from a built-in type', () => {
    expect(eventCreateFieldsFromType(getEventType('coffee-service'))).toEqual({
      event_type_id: 'coffee-service',
      registration_type: 'individual',
    })
  })

  it('omits terminology for a built-in type', () => {
    expect('event_type_terminology' in eventCreateFieldsFromType(getEventType('catering'))).toBe(false)
  })

  it('snapshots terminology for a custom type', () => {
    const custom = { ...getEventType('event'), id: 'org-custom', is_custom: true } as EventType
    const fields = eventCreateFieldsFromType(custom)
    expect(fields.event_type_id).toBe('org-custom')
    expect(fields.event_type_terminology).toEqual(custom.terminology)
  })
})
```

The terminology snapshot matters: a custom type lives in Firestore and can be renamed later, so the event stores its own copy. Built-ins resolve by id at render time and must **not** carry a copy.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- event-types`
Expected: FAIL — `eventCreateFieldsFromType` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/event-types.ts`:

```ts
export interface EventCreateFields {
  event_type_id: string
  registration_type: RegistrationUnit
  event_type_terminology?: Terminology
}

/**
 * The event fields a selected EventType determines. Custom (org-defined) types
 * snapshot their terminology onto the event because the type can be renamed
 * later; built-ins resolve by id and carry no copy.
 */
export function eventCreateFieldsFromType(type: EventType): EventCreateFields {
  return {
    event_type_id: type.id,
    registration_type: type.registrationUnit,
    ...(type.is_custom ? { event_type_terminology: type.terminology } : {}),
  }
}
```

In `app/(admin)/[orgSlug]/new-event/page.tsx`, replace the inline resolution inside `handleSubmit`:

```tsx
      const selectedType = eventTypes.find((t) => t.id === eventTypeId)
      if (!selectedType) throw new Error('Select an event type')
      const event = await createEvent(orgId, {
        name,
        year,
        ...eventCreateFieldsFromType(selectedType),
        event_start: eventStart,
        event_end: eventEnd,
      })
```

and add `eventCreateFieldsFromType` to the existing `@/lib/event-types` import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- event-types` → PASS. Then `npm test`, `npx tsc --noEmit`, `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add lib/event-types.ts "app/(admin)/[orgSlug]/new-event/page.tsx" __tests__/lib/event-types.test.ts
git commit -m "refactor(events): share event-type field resolution between create paths"
```

---

### Task 3: Conversion core and action

The core creates the job and enforces the one-job guard; the action authorizes and logs. Splitting it this way keeps `lib/activity.ts`'s `import 'server-only'` out of the core and matches `setLeadWaiting`.

**Files:**
- Create: `lib/crm/convert.ts`
- Modify: `actions/leads.ts`
- Test: `__tests__/lib/crm/convert.test.ts`, `__tests__/actions/convert.test.ts`

**Interfaces:**
- Consumes: `createEventCore`, `listEventsByLeadCore` (`@/lib/events`); `leadsRef` (`@/lib/crm/leads`); `opportunityTitle` (`@/lib/leads`); `logActivity` (`@/lib/activity`); `assertOrgAdmin`.
- Produces: `ConvertToWorkInput { name: string; date: string; event_type_id: string; registration_type: EventRegistrationType; event_type_terminology?: Terminology; headcount?: number }`; `convertOpportunityToWorkCore(orgId: string, leadId: string, input: ConvertToWorkInput): Promise<Event>`; `convertOpportunityToWork(orgId: string, leadId: string, input: ConvertToWorkInput): Promise<Event>` (action).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/crm/convert.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createEventCore = vi.hoisted(() => vi.fn())
const listEventsByLeadCore = vi.hoisted(() => vi.fn())
const leadGet = vi.hoisted(() => vi.fn())

vi.mock('@/lib/events', () => ({ createEventCore, listEventsByLeadCore }))
vi.mock('@/lib/crm/leads', async (orig) => ({
  ...(await orig<typeof import('@/lib/crm/leads')>()),
  leadsRef: () => ({ doc: () => ({ get: leadGet }) }),
}))

import { convertOpportunityToWorkCore } from '@/lib/crm/convert'

const input = {
  name: 'Nguyen Wedding',
  date: '2026-09-12',
  event_type_id: 'coffee-service',
  registration_type: 'individual' as const,
}

const wonLead = { exists: true, data: () => ({ id: 'l1', name: 'Dana Kim', stage: 'closed_won', created_at: 'x' }) }

describe('convertOpportunityToWorkCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    leadGet.mockResolvedValue(wonLead)
    listEventsByLeadCore.mockResolvedValue([])
    createEventCore.mockResolvedValue({ id: 'e1', slug: 'nguyen-wedding-2026' })
  })

  it('creates an event carrying the lead id, with the date on both ends', async () => {
    const event = await convertOpportunityToWorkCore('o1', 'l1', { ...input, headcount: 180 })
    expect(createEventCore).toHaveBeenCalledWith('o1', {
      name: 'Nguyen Wedding',
      year: 2026,
      registration_type: 'individual',
      event_type_id: 'coffee-service',
      event_start: '2026-09-12',
      event_end: '2026-09-12',
      headcount: 180,
      lead_id: 'l1',
    })
    expect(event.id).toBe('e1')
  })

  it('derives the year from the date', async () => {
    await convertOpportunityToWorkCore('o1', 'l1', { ...input, date: '2027-01-04' })
    expect(createEventCore.mock.calls[0][1].year).toBe(2027)
  })

  it('passes custom terminology through when present', async () => {
    const terminology = { registrantSingular: 'Client' } as never
    await convertOpportunityToWorkCore('o1', 'l1', { ...input, event_type_terminology: terminology })
    expect(createEventCore.mock.calls[0][1].event_type_terminology).toBe(terminology)
  })

  it('omits headcount when absent rather than writing undefined', async () => {
    await convertOpportunityToWorkCore('o1', 'l1', input)
    expect('headcount' in createEventCore.mock.calls[0][1]).toBe(false)
  })

  it('refuses a second conversion', async () => {
    listEventsByLeadCore.mockResolvedValue([{ id: 'e-existing' }])
    await expect(convertOpportunityToWorkCore('o1', 'l1', input)).rejects.toThrow('This opportunity is already scheduled')
    expect(createEventCore).not.toHaveBeenCalled()
  })

  it('refuses an opportunity that is not won', async () => {
    leadGet.mockResolvedValue({ exists: true, data: () => ({ id: 'l1', name: 'Dana Kim', stage: 'proposal', created_at: 'x' }) })
    await expect(convertOpportunityToWorkCore('o1', 'l1', input)).rejects.toThrow('Only a won opportunity can be scheduled')
  })

  it('refuses a missing opportunity', async () => {
    leadGet.mockResolvedValue({ exists: false })
    await expect(convertOpportunityToWorkCore('o1', 'l1', input)).rejects.toThrow('Opportunity not found')
  })

  it('requires a name', async () => {
    await expect(convertOpportunityToWorkCore('o1', 'l1', { ...input, name: '  ' })).rejects.toThrow('A job name is required')
  })

  it('requires a date', async () => {
    await expect(convertOpportunityToWorkCore('o1', 'l1', { ...input, date: '' })).rejects.toThrow('A job date is required')
  })
})
```

Create `__tests__/actions/convert.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const convertOpportunityToWorkCore = vi.hoisted(() => vi.fn())
const logActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/crm/convert', () => ({ convertOpportunityToWorkCore }))
vi.mock('@/lib/activity', () => ({ logActivity }))
vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue(undefined),
  assertOrgAdmin: vi.fn().mockResolvedValue(undefined),
}))

import { assertOrgAdmin } from '@/lib/auth/assert'
import { convertOpportunityToWork } from '@/actions/leads'

const input = {
  name: 'Nguyen Wedding',
  date: '2026-09-12',
  event_type_id: 'coffee-service',
  registration_type: 'individual' as const,
}

describe('convertOpportunityToWork', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convertOpportunityToWorkCore.mockResolvedValue({ id: 'e1', name: 'Nguyen Wedding', slug: 'nguyen-wedding-2026' })
  })

  it('authorizes as admin, delegates, and returns the event', async () => {
    const event = await convertOpportunityToWork('o1', 'l1', input)
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(convertOpportunityToWorkCore).toHaveBeenCalledWith('o1', 'l1', input)
    expect(event.slug).toBe('nguyen-wedding-2026')
  })

  it('logs a converted activity event naming the job', async () => {
    await convertOpportunityToWork('o1', 'l1', input)
    expect(logActivity).toHaveBeenCalledWith('o1', {
      parent_type: 'opportunity',
      parent_id: 'l1',
      kind: 'converted',
      summary: 'Scheduled as Nguyen Wedding',
    })
  })

  it('does not log when the core rejects', async () => {
    convertOpportunityToWorkCore.mockRejectedValue(new Error('This opportunity is already scheduled'))
    await expect(convertOpportunityToWork('o1', 'l1', input)).rejects.toThrow('This opportunity is already scheduled')
    expect(logActivity).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- convert`
Expected: FAIL — cannot resolve `@/lib/crm/convert`; `convertOpportunityToWork` is not exported from `@/actions/leads`.

- [ ] **Step 3: Implement**

Create `lib/crm/convert.ts`:

```ts
import { createEventCore, listEventsByLeadCore } from '@/lib/events'
import { leadsRef } from '@/lib/crm/leads'
import type { Event, EventRegistrationType, Lead } from '@/lib/types'
import type { Terminology } from '@/lib/event-types'

export interface ConvertToWorkInput {
  name: string
  date: string                        // YYYY-MM-DD; sets event_start AND event_end
  event_type_id: string
  registration_type: EventRegistrationType
  event_type_terminology?: Terminology
  headcount?: number
}

/**
 * Turn a won opportunity into a scheduled job.
 *
 * The one-job rule is enforced HERE, not in the schema: Event.lead_id has no
 * uniqueness constraint, so a booking that genuinely needs two dated events
 * (a rehearsal dinner and a reception) only needs this guard relaxed — no data
 * migration. See docs/superpowers/specs/2026-08-07-convert-to-work-design.md.
 *
 * Logs no activity: lib/activity.ts is server-only and cores must stay
 * importable by scripts. The calling action logs.
 */
export async function convertOpportunityToWorkCore(
  orgId: string,
  leadId: string,
  input: ConvertToWorkInput
): Promise<Event> {
  if (!input.name?.trim()) throw new Error('A job name is required')
  if (!input.date?.trim()) throw new Error('A job date is required')

  const snap = await leadsRef(orgId).doc(leadId).get()
  if (!snap.exists) throw new Error('Opportunity not found')
  const lead = snap.data() as Lead
  if (lead.stage !== 'closed_won') throw new Error('Only a won opportunity can be scheduled')

  const existing = await listEventsByLeadCore(orgId, leadId)
  if (existing.length > 0) throw new Error('This opportunity is already scheduled')

  const date = input.date.trim()
  return createEventCore(orgId, {
    name: input.name.trim(),
    year: Number(date.slice(0, 4)),
    registration_type: input.registration_type,
    event_type_id: input.event_type_id,
    ...(input.event_type_terminology ? { event_type_terminology: input.event_type_terminology } : {}),
    event_start: date,
    event_end: date,
    ...(input.headcount !== undefined ? { headcount: input.headcount } : {}),
    lead_id: leadId,
  })
}
```

In `actions/leads.ts`, add the import `import { convertOpportunityToWorkCore, type ConvertToWorkInput } from '@/lib/crm/convert'` and `import type { Event } from '@/lib/types'` (extend the existing type import), then append:

```ts
export async function convertOpportunityToWork(
  orgId: string,
  leadId: string,
  input: ConvertToWorkInput
): Promise<Event> {
  await assertOrgAdmin(orgId)
  const event = await convertOpportunityToWorkCore(orgId, leadId, input)
  await logActivity(orgId, {
    parent_type: 'opportunity',
    parent_id: leadId,
    kind: 'converted',
    summary: `Scheduled as ${event.name}`,
  })
  return event
}
```

`ConvertToWorkInput` is imported as a type and **not** re-exported — `actions/leads.ts` is a `'use server'` module. Client components import it from `@/lib/crm/convert`.

In `components/admin/opportunity/ActivityTimeline.tsx`, add `CalendarCheck` to the `lucide-react` import and `converted: CalendarCheck,` to the `KIND_ICON` map, matching how `waiting: Clock` was added.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- convert` → PASS. Then `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add lib/crm/convert.ts actions/leads.ts components/admin/opportunity/ActivityTimeline.tsx __tests__/lib/crm/convert.test.ts __tests__/actions/convert.test.ts
git commit -m "feat(crm): convert a won opportunity into a scheduled job"
```

---

### Task 4: Convert to work UI

**Files:**
- Create: `components/admin/opportunity/ConvertToWorkCard.tsx`
- Modify: `components/admin/OpportunityDetailClient.tsx`
- Modify: `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`
- Test: `__tests__/components/opportunity/ConvertToWorkCard.test.tsx`

**Interfaces:**
- Consumes: `convertOpportunityToWork` (`@/actions/leads`); `ConvertToWorkInput` (`@/lib/crm/convert`); `eventCreateFieldsFromType` (`@/lib/event-types`); `opportunityTitle` (`@/lib/leads`).
- Produces: `ConvertToWorkCard({ orgId, orgSlug, lead, job, eventTypes })` where `job: Event | null` and `eventTypes: EventType[]`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/opportunity/ConvertToWorkCard.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const convertOpportunityToWork = vi.hoisted(() => vi.fn())
vi.mock('@/actions/leads', () => ({ convertOpportunityToWork }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { ConvertToWorkCard } from '@/components/admin/opportunity/ConvertToWorkCard'
import { getEventType } from '@/lib/event-types'
import type { Event, Lead } from '@/lib/types'

const eventTypes = [getEventType('event'), getEventType('coffee-service')]
const won = { id: 'l1', name: 'Dana Kim', title: 'Nguyen Wedding', stage: 'closed_won', event_date: '2026-09-12', created_at: 'x' } as Lead
const props = { orgId: 'o1', orgSlug: 'acme', lead: won, job: null, eventTypes }

describe('ConvertToWorkCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convertOpportunityToWork.mockResolvedValue({ id: 'e1', slug: 'nguyen-wedding-2026' } as Event)
  })

  it('renders nothing for an opportunity that is not won', () => {
    const { container } = render(<ConvertToWorkCard {...props} lead={{ ...won, stage: 'proposal' } as Lead} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('links to the job instead of offering conversion when one exists', () => {
    const job = { id: 'e1', slug: 'nguyen-wedding-2026', name: 'Nguyen Wedding' } as Event
    render(<ConvertToWorkCard {...props} job={job} />)
    expect(screen.getByRole('link', { name: /view job/i })).toHaveAttribute('href', '/acme/nguyen-wedding-2026/ops')
    expect(screen.queryByRole('button', { name: /convert to work/i })).not.toBeInTheDocument()
  })

  it('prefills the form from the opportunity', () => {
    render(<ConvertToWorkCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /convert to work/i }))
    expect(screen.getByLabelText('Job name')).toHaveValue('Nguyen Wedding')
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-12')
  })

  it('leaves the date empty and blocks submit when the opportunity has none', () => {
    const dateless = { ...won, event_date: undefined } as Lead
    render(<ConvertToWorkCard {...props} lead={dateless} />)
    fireEvent.click(screen.getByRole('button', { name: /convert to work/i }))
    expect(screen.getByLabelText('Date')).toHaveValue('')
    expect(screen.getByRole('button', { name: /^schedule job$/i })).toBeDisabled()
  })

  it('submits the resolved event-type fields and the headcount', async () => {
    render(<ConvertToWorkCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /convert to work/i }))
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'coffee-service' } })
    fireEvent.change(screen.getByLabelText('Headcount'), { target: { value: '180' } })
    fireEvent.click(screen.getByRole('button', { name: /^schedule job$/i }))
    await waitFor(() => expect(convertOpportunityToWork).toHaveBeenCalledWith('o1', 'l1', {
      name: 'Nguyen Wedding',
      date: '2026-09-12',
      event_type_id: 'coffee-service',
      registration_type: 'individual',
      headcount: 180,
    }))
  })

  it('surfaces a rejected conversion', async () => {
    convertOpportunityToWork.mockRejectedValue(new Error('This opportunity is already scheduled'))
    render(<ConvertToWorkCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /convert to work/i }))
    fireEvent.click(screen.getByRole('button', { name: /^schedule job$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This opportunity is already scheduled')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ConvertToWorkCard`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `components/admin/opportunity/ConvertToWorkCard.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { convertOpportunityToWork } from '@/actions/leads'
import { eventCreateFieldsFromType, DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import type { EventType } from '@/lib/event-types'
import { opportunityTitle } from '@/lib/leads'
import type { Event, Lead } from '@/lib/types'

interface ConvertToWorkCardProps {
  orgId: string
  orgSlug: string
  lead: Lead
  job: Event | null
  eventTypes: EventType[]
}

export function ConvertToWorkCard({ orgId, orgSlug, lead, job, eventTypes }: ConvertToWorkCardProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(opportunityTitle(lead))
  const [date, setDate] = useState(lead.event_date ?? '')
  const [eventTypeId, setEventTypeId] = useState<string>(DEFAULT_EVENT_TYPE_ID)
  const [headcount, setHeadcount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Conversion is the booking's consequence; nothing to offer before it.
  if (lead.stage !== 'closed_won') return null

  if (job) {
    return (
      <div className="rounded-md border border-border px-3 py-2 text-sm">
        Scheduled as <span className="font-medium">{job.name}</span>.{' '}
        <Link href={`/${orgSlug}/${job.slug}/ops`} className="underline">View job →</Link>
      </div>
    )
  }

  async function handleConvert() {
    const type = eventTypes.find((t) => t.id === eventTypeId)
    if (!type) { setError('Select an event type'); return }
    setSaving(true); setError(null)
    try {
      const event = await convertOpportunityToWork(orgId, lead.id, {
        name: name.trim(),
        date,
        ...eventCreateFieldsFromType(type),
        ...(headcount.trim() ? { headcount: Number(headcount) } : {}),
      })
      router.push(`/${orgSlug}/${event.slug}/ops`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to schedule')
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
        <p className="text-sm">This opportunity is won but not scheduled.</p>
        <Button size="sm" onClick={() => setOpen(true)}>Convert to work</Button>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Schedule this job</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="cw-name">Job name</Label>
            <Input id="cw-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cw-date">Date</Label>
            <Input id="cw-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cw-type">Event type</Label>
            <select
              id="cw-type"
              value={eventTypeId}
              onChange={(e) => setEventTypeId(e.target.value)}
              className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cw-headcount">Headcount</Label>
            <Input id="cw-headcount" type="number" value={headcount} onChange={(e) => setHeadcount(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Next you&apos;ll pick packages and requirements on the job&apos;s ops page.</p>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={handleConvert} disabled={saving || !name.trim() || !date}>
            {saving ? 'Scheduling…' : 'Schedule job'}
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

In `components/admin/OpportunityDetailClient.tsx`:
- Add `job: Event | null` and `eventTypes: EventType[]` to `OpportunityDetailClientProps`, extend the destructure, and extend the type imports (`Event` from `@/lib/types`, `EventType` from `@/lib/event-types`).
- Render directly **below** `<NextActionBanner …/>` and above the grid:

```tsx
      <ConvertToWorkCard orgId={orgId} orgSlug={orgSlug} lead={lead} job={job} eventTypes={eventTypes} />
```

In `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`:
- Import `listEventsByLead` from `@/actions/events` and `listOrgEventTypes` from `@/actions/event-types`.
- Add both to the existing `Promise.all`, keeping the destructure order aligned:

```tsx
  const [customer, tasks, activity, proposals, invoices, contracts, vendors, jobs, eventTypes] = await Promise.all([
    lead.customer_id ? getCustomer(orgId, lead.customer_id) : Promise.resolve(null),
    listTasks(orgId, leadId),
    listActivity(orgId, 'opportunity', leadId),
    listProposals(orgId, leadId),
    listInvoices(orgId, leadId),
    listContracts(orgId, leadId),
    listVendors(orgId, leadId),
    listEventsByLead(orgId, leadId),
    listOrgEventTypes(orgId),
  ])
```

- Pass `job={jobs[0] ?? null}` and `eventTypes={eventTypes}` to `<OpportunityDetailClient …/>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ConvertToWorkCard` → PASS. Then `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add components/admin/opportunity/ConvertToWorkCard.tsx components/admin/OpportunityDetailClient.tsx "app/(admin)/[orgSlug]/leads/[leadId]/page.tsx" __tests__/components/opportunity/ConvertToWorkCard.test.tsx
git commit -m "feat(crm): Convert to work on the opportunity detail"
```

---

### Task 5: `buildToday` surfaces won, unscheduled work

`scheduledLeadIds` is a **required** input, not an optional one. Defaulting it to `[]` would mean "nothing is scheduled," so every won opportunity would be reported as unscheduled — a silent false positive on the CRM's home screen. A required field turns that into a compile error at each of the 11 existing `buildToday` call sites instead.

**Files:**
- Modify: `lib/today.ts`
- Modify: `actions/today.ts`
- Test: `__tests__/lib/today.test.ts`, `__tests__/actions/today.test.ts`

**Interfaces:**
- Produces: `WonUnscheduledItem { leadId: string; title: string; company?: string; eventDate?: string; value?: number }`; `TodayData.wonUnscheduled: WonUnscheduledItem[]`; `buildToday` input gains `scheduledLeadIds: string[]`.
- Consumes: `listEventsCore` (`@/lib/events`).

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/lib/today.test.ts`:

```ts
it('lists won opportunities that have no job, soonest date first', () => {
  const leads = [
    { id: 'w1', name: 'Dana Kim', title: 'Autumn gala', stage: 'closed_won', event_date: '2026-11-01', estimated_value: 900, created_at: '2026-08-01T00:00:00.000Z' },
    { id: 'w2', name: 'Sam Lee', stage: 'closed_won', event_date: '2026-09-12', created_at: '2026-08-01T00:00:00.000Z' },
    { id: 'w3', name: 'Ari Vance', stage: 'closed_won', created_at: '2026-08-01T00:00:00.000Z' },
  ] as Lead[]
  const out = buildToday({ leads, tasksByLeadId: {}, today: '2026-08-06', scheduledLeadIds: [] })
  expect(out.wonUnscheduled.map((w) => w.leadId)).toEqual(['w2', 'w1', 'w3'])
  expect(out.wonUnscheduled[1]).toEqual({ leadId: 'w1', title: 'Autumn gala', company: undefined, eventDate: '2026-11-01', value: 900 })
})

it('excludes a won opportunity that already has a job', () => {
  const leads = [
    { id: 'w1', name: 'Dana Kim', stage: 'closed_won', created_at: '2026-08-01T00:00:00.000Z' },
    { id: 'w2', name: 'Sam Lee', stage: 'closed_won', created_at: '2026-08-01T00:00:00.000Z' },
  ] as Lead[]
  const out = buildToday({ leads, tasksByLeadId: {}, today: '2026-08-06', scheduledLeadIds: ['w1'] })
  expect(out.wonUnscheduled.map((w) => w.leadId)).toEqual(['w2'])
})

it('never lists a lost or open opportunity as won-unscheduled', () => {
  const leads = [
    { id: 'l1', name: 'Lost', stage: 'closed_lost', created_at: '2026-08-01T00:00:00.000Z' },
    { id: 'o1', name: 'Open', stage: 'proposal', created_at: '2026-08-01T00:00:00.000Z' },
  ] as Lead[]
  const out = buildToday({ leads, tasksByLeadId: {}, today: '2026-08-06', scheduledLeadIds: [] })
  expect(out.wonUnscheduled).toEqual([])
})
```

Add to `__tests__/actions/today.test.ts`, alongside the existing core mocks:

```ts
const listEventsCore = vi.hoisted(() => vi.fn())
vi.mock('@/lib/events', () => ({ listEventsCore, eventsRef: vi.fn(), createEventCore: vi.fn(), listEventsByLeadCore: vi.fn() }))
```

```ts
it('treats a won lead with a linked event as scheduled, reading events once', async () => {
  listLeadsCore.mockResolvedValue([
    { id: 'w1', name: 'A', stage: 'closed_won', created_at: '2026-08-01T00:00:00.000Z' },
    { id: 'w2', name: 'B', stage: 'closed_won', created_at: '2026-08-01T00:00:00.000Z' },
  ])
  listTasksCore.mockResolvedValue([])
  listEventsCore.mockResolvedValue([{ id: 'e1', lead_id: 'w1' }, { id: 'e2' }])
  const data = await getTodayData('o1')
  expect(listEventsCore).toHaveBeenCalledTimes(1)
  expect(data.wonUnscheduled.map((w) => w.leadId)).toEqual(['w2'])
})
```

`{ id: 'e2' }` — an event with no `lead_id` — pins that manually-created events never mask an opportunity.

**Also add `scheduledLeadIds: []` to the other 10 existing `buildToday(...)` calls** in `__tests__/lib/today.test.ts`, and `listEventsCore.mockResolvedValue([])` to the existing `getTodayData` tests. `tsc` will point at every site; do not add `as any` to silence one.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- today`
Expected: FAIL — `wonUnscheduled` does not exist on `TodayData`; `scheduledLeadIds` is not a known input property.

- [ ] **Step 3: Implement**

In `lib/today.ts`:

```ts
export interface WonUnscheduledItem {
  leadId: string
  title: string
  company?: string
  eventDate?: string
  value?: number
}
```

Add `wonUnscheduled: WonUnscheduledItem[]` to `TodayData`. Change the `buildToday` signature to:

```ts
export function buildToday(input: {
  leads: Lead[]
  tasksByLeadId: Record<string, Task[]>
  today: string
  scheduledLeadIds: string[]
}): TodayData {
  const { leads, tasksByLeadId, today, scheduledLeadIds } = input
```

After the existing `openLeads` line, add:

```ts
  const scheduled = new Set(scheduledLeadIds)
```

After the `for (const lead of openLeads)` loop and before the sorts, add:

```ts
  // A won deal that never became work is the same orphan the open-stage
  // lists exist to catch, one stage later.
  const wonUnscheduled: WonUnscheduledItem[] = leads
    .filter((l) => l.stage === 'closed_won' && !scheduled.has(l.id))
    .map((l) => ({
      leadId: l.id,
      title: opportunityTitle(l),
      company: l.organization,
      eventDate: l.event_date,
      value: l.estimated_value,
    }))
```

Sort it alongside the others — dated first, soonest first, undated last:

```ts
  wonUnscheduled.sort((a, b) => {
    if (!a.eventDate) return b.eventDate ? 1 : 0
    if (!b.eventDate) return -1
    return a.eventDate.localeCompare(b.eventDate)
  })
```

Add `wonUnscheduled` to the returned object. **Leave `tiles` at three fields** — the spec keeps the tile row unchanged.

In `actions/today.ts`, read leads and events together and derive the id set:

```ts
import { listEventsCore } from '@/lib/events'
```

```ts
export async function getTodayData(orgId: string): Promise<TodayData> {
  await assertOrgMember(orgId)
  const [leads, events] = await Promise.all([listLeadsCore(orgId), listEventsCore(orgId)])
  const scheduledLeadIds = events.map((e) => e.lead_id).filter((id): id is string => !!id)
  const openLeads = leads.filter((l) => (OPEN_STAGES as LeadStage[]).includes(l.stage))
  const taskLists = await Promise.all(openLeads.map((l) => listTasksCore(orgId, l.id)))
  const tasksByLeadId: Record<string, Task[]> = {}
  openLeads.forEach((l, i) => { tasksByLeadId[l.id] = taskLists[i] })
  return buildToday({ leads, tasksByLeadId, today: todayYmd(), scheduledLeadIds })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- today` → PASS. Then `npm test`, `npx tsc --noEmit`, `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add lib/today.ts actions/today.ts __tests__/lib/today.test.ts __tests__/actions/today.test.ts
git commit -m "feat(crm): Today surfaces won opportunities with no scheduled job"
```

---

### Task 6: The "Won, not scheduled" list

**Files:**
- Create: `components/admin/today/WonUnscheduledList.tsx`
- Modify: `components/admin/today/TodayClient.tsx`
- Test: `__tests__/components/today/WonUnscheduledList.test.tsx`, `__tests__/components/today/TodayClient.test.tsx`

**Interfaces:**
- Consumes: `WonUnscheduledItem` (`@/lib/today`).
- Produces: `WonUnscheduledList({ orgSlug, items })`.

Note this list takes **no `orgId`** — unlike the other three it performs no mutation, only navigation, so it needs nothing to call an action with.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/today/WonUnscheduledList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { WonUnscheduledList } from '@/components/admin/today/WonUnscheduledList'
import type { WonUnscheduledItem } from '@/lib/today'

const item: WonUnscheduledItem = {
  leadId: 'l1',
  title: 'Nguyen Wedding',
  company: 'Riverside',
  eventDate: '2026-09-12',
  value: 1500,
}

describe('WonUnscheduledList', () => {
  it('links each row to its opportunity', () => {
    render(<WonUnscheduledList orgSlug="acme" items={[item]} />)
    expect(screen.getByRole('link', { name: /nguyen wedding/i })).toHaveAttribute('href', '/acme/leads/l1')
  })

  it('shows the job date and value', () => {
    render(<WonUnscheduledList orgSlug="acme" items={[item]} />)
    expect(screen.getByText(/2026-09-12/)).toBeInTheDocument()
    expect(screen.getByText(/\$1,500/)).toBeInTheDocument()
  })

  it('reads "No date set" when the opportunity has none', () => {
    render(<WonUnscheduledList orgSlug="acme" items={[{ ...item, eventDate: undefined }]} />)
    expect(screen.getByText(/no date set/i)).toBeInTheDocument()
  })

  it('renders an empty state', () => {
    render(<WonUnscheduledList orgSlug="acme" items={[]} />)
    expect(screen.getByText(/every won deal is scheduled/i)).toBeInTheDocument()
  })
})
```

Add to `__tests__/components/today/TodayClient.test.tsx` — extend the existing `data` fixture with `wonUnscheduled: []` (tsc will require it), then:

```tsx
it('mounts the won-unscheduled list', () => {
  render(<TodayClient orgId="o1" orgSlug="acme" data={data} />)
  expect(screen.getByText('Won, not scheduled')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- WonUnscheduledList TodayClient`
Expected: FAIL — module does not exist; heading absent.

- [ ] **Step 3: Implement**

Create `components/admin/today/WonUnscheduledList.tsx`, matching `WaitingList`'s dense bordered-row structure:

```tsx
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { WonUnscheduledItem } from '@/lib/today'

interface WonUnscheduledListProps {
  orgSlug: string
  items: WonUnscheduledItem[]
}

export function WonUnscheduledList({ orgSlug, items }: WonUnscheduledListProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Won, not scheduled</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every won deal is scheduled.</p>
        ) : (
          items.map((item) => (
            <div key={item.leadId} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <Link href={`/${orgSlug}/leads/${item.leadId}`} className="min-w-0 flex-1 hover:underline">
                <span className="text-sm font-medium">{item.title}</span>
                {item.company && <span className="ml-2 text-xs text-muted-foreground">{item.company}</span>}
                <p className="text-xs text-muted-foreground">
                  {item.eventDate ?? 'No date set'}
                  {item.value !== undefined && ` · $${item.value.toLocaleString()}`}
                </p>
              </Link>
              <Button size="sm" asChild>
                <Link href={`/${orgSlug}/leads/${item.leadId}`}>Convert to work</Link>
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
```

No `'use client'` directive: this component has no state, no handlers, and no action imports.

`$${item.value.toLocaleString()}` matches the money convention used by `TodayTiles` and `CustomerDetailClient` — do not switch to `formatMoney` here.

In `components/admin/today/TodayClient.tsx`, import the component and mount it **below** `WaitingList` — the three discipline lists come first; this one is the newly-won tail:

```tsx
      <WonUnscheduledList orgSlug={orgSlug} items={data.wonUnscheduled} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- today` → PASS. Then `npm test`, `npx tsc --noEmit`, `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add components/admin/today/WonUnscheduledList.tsx components/admin/today/TodayClient.tsx __tests__/components/today
git commit -m "feat(crm): Won, not scheduled list on Today"
```

---

### Task 7: Closeout invoice inherits its opportunity

`generateCloseoutInvoice` takes `leadId` only so the UI can prompt for it — a dropdown of every lead on the screen where money lands. Make it derive from `event.lead_id`, keeping the picker for events that were never converted.

**Files:**
- Modify: `actions/invoices.ts`
- Modify: `app/(admin)/[orgSlug]/[eventSlug]/ops/closeout/page.tsx`
- Modify: `components/admin/ops/CloseoutClient.tsx`
- Test: `__tests__/actions/closeout-invoice.test.ts`

**Interfaces:**
- Produces: `generateCloseoutInvoice(orgId: string, eventId: string, leadId?: string): Promise<Invoice>`; `CloseoutClientProps` gains `linkedLead: { id: string; title: string } | null`.
- Consumes: `opportunityTitle` (`@/lib/leads`); `getLead` (`@/actions/leads`).

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/actions/closeout-invoice.test.ts`. The existing `adminDb` mock returns `{ name: 'Nguyen Wedding' }` for the event doc; make it configurable so a test can add `lead_id`:

```ts
const eventData = vi.hoisted(() => ({ current: { name: 'Nguyen Wedding' } as Record<string, unknown> }))
```

and replace the event-doc `get` in the existing `@/lib/firebase-admin` mock with:

```ts
          doc: () => ({ get: vi.fn().mockResolvedValue({ exists: true, data: () => eventData.current }) }),
```

Then add, resetting `eventData.current` in a `beforeEach`:

```ts
it('derives the opportunity from the event when no leadId is passed', async () => {
  eventData.current = { name: 'Nguyen Wedding', lead_id: 'l-linked' }
  await generateCloseoutInvoice('o1', 'e1')
  expect(getLead).toHaveBeenCalledWith('o1', 'l-linked')
  expect(createInvoiceCore).toHaveBeenCalledWith('o1', 'l-linked', expect.objectContaining({ type: 'final' }))
})

it('prefers an explicitly passed leadId over the linked one', async () => {
  eventData.current = { name: 'Nguyen Wedding', lead_id: 'l-linked' }
  await generateCloseoutInvoice('o1', 'e1', 'l-chosen')
  expect(createInvoiceCore).toHaveBeenCalledWith('o1', 'l-chosen', expect.objectContaining({ type: 'final' }))
})

it('refuses when the event has no link and no leadId is passed', async () => {
  eventData.current = { name: 'Nguyen Wedding' }
  await expect(generateCloseoutInvoice('o1', 'e1')).rejects.toThrow('No opportunity linked to this event')
})
```

The second case is what keeps scenario 16 working — a linked event whose opportunity was deleted falls back to the picker, and the picker's choice must win.

Add to `__tests__/components/ops/CloseoutClient.test.tsx` if it exists, or create it with the fixture style of the surrounding ops component tests:

```tsx
it('shows the linked opportunity instead of a picker', () => {
  render(<CloseoutClient {...props} linkedLead={{ id: 'l1', title: 'Nguyen Wedding' }} leads={[]} />)
  expect(screen.getByText('Nguyen Wedding')).toBeInTheDocument()
  expect(screen.queryByLabelText('Bill to')).not.toBeInTheDocument()
})

it('warns when the link is broken and falls back to the picker', () => {
  render(<CloseoutClient {...props} linkedLead={null} linkBroken leads={[lead]} />)
  expect(screen.getByRole('status')).toHaveTextContent(/no longer exists/i)
  expect(screen.getByLabelText('Bill to')).toBeInTheDocument()
})
```

These require `props.closeout.completed` and `props.isAdmin` to be true — the bill-to block only renders inside `{completed && props.isAdmin && (…)}`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- closeout-invoice`
Expected: FAIL — `generateCloseoutInvoice` requires three arguments.

- [ ] **Step 3: Implement**

In `actions/invoices.ts`, change the signature and resolve the id after the event is loaded (the existing `getLead` call and everything below it stays as it is, but keyed on the resolved id):

```ts
export async function generateCloseoutInvoice(orgId: string, eventId: string, leadId?: string): Promise<Invoice> {
```

After `const event = eventSnap.data() as Event`, insert:

```ts
  // A converted job knows its own opportunity. leadId is still accepted so a
  // manually-created event — or a linked one whose opportunity was deleted —
  // can be billed through the picker.
  const resolvedLeadId = leadId ?? event.lead_id
  if (!resolvedLeadId) throw new Error('No opportunity linked to this event')
```

then replace the two remaining uses of `leadId` with `resolvedLeadId`:

```ts
  const lead = await getLead(orgId, resolvedLeadId)
  if (!lead) throw new Error('Lead not found')
  return createInvoiceCore(orgId, resolvedLeadId, {
```

In `app/(admin)/[orgSlug]/[eventSlug]/ops/closeout/page.tsx`, replace the unconditional `const leads = await listLeads(orgId)` with a linked-first branch:

```tsx
  // A linked job needs no picker, and no read to populate one. A link whose
  // opportunity was since deleted falls back to the picker rather than
  // dead-ending the one screen where money lands.
  const linkedLead = event.lead_id ? await getLead(orgId, event.lead_id) : null
  const linkBroken = !!event.lead_id && !linkedLead
  const leads = linkedLead ? [] : await listLeads(orgId)
```

and pass all three down:

```tsx
      leads={leads}
      linkedLead={linkedLead ? { id: linkedLead.id, title: opportunityTitle(linkedLead) } : null}
      linkBroken={linkBroken}
```

Add `getLead` to the existing `@/actions/leads` import and import `opportunityTitle` from `@/lib/leads`.

In `components/admin/ops/CloseoutClient.tsx`:
- Add `linkedLead: { id: string; title: string } | null` and `linkBroken?: boolean` to `CloseoutClientProps`.
- Replace `const [leadId, setLeadId] = useState('')` with `const [leadId, setLeadId] = useState(props.linkedLead?.id ?? '')`.
- Replace the `<div>` holding the `Bill to` select with a branch:

```tsx
            {props.linkedLead ? (
              <p className="text-sm">
                Bill to <span className="font-medium">{props.linkedLead.title}</span>
              </p>
            ) : (
              <div>
                {props.linkBroken && (
                  <p role="status" className="mb-1 text-sm text-amber-700">
                    The opportunity this job came from no longer exists — pick who to bill.
                  </p>
                )}
                <Label htmlFor="co-lead">Bill to</Label>
                <select id="co-lead" value={leadId} onChange={(e) => setLeadId(e.target.value)}
                  className="block h-9 rounded-md border border-gray-300 px-2 text-sm min-w-48">
                  <option value="">Pick a client…</option>
                  {props.leads.map((l) => <option key={l.id} value={l.id}>{l.name}{l.organization ? ` — ${l.organization}` : ''}</option>)}
                </select>
              </div>
            )}
```

`role="status"` rather than a bare `<p>`: this text appears only in a failure state the operator did not cause, so it must reach assistive tech. (The CRM backlog already carries one silent-notice a11y gap; do not add a second.)

`handleGenerateInvoice` needs no change — `leadId` is already seeded from the link, so the existing `disabled={saving || !leadId}` and the `router.push` to `/${orgSlug}/leads/${leadId}/invoices` both keep working.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- closeout-invoice` → PASS. Then `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add actions/invoices.ts "app/(admin)/[orgSlug]/[eventSlug]/ops/closeout/page.tsx" components/admin/ops/CloseoutClient.tsx __tests__/actions/closeout-invoice.test.ts
git commit -m "fix(ops): closeout invoice inherits the event's linked opportunity"
```

---

## Manual walkthrough before merge

The spec's scenario matrix (`docs/superpowers/specs/2026-08-07-convert-to-work-design.md`, "Scenario walkthrough") is the acceptance list. Scenarios 1–5, 8–13 and 14–17 are covered by the automated tests above. Walk these four by hand, because no test exercises them end to end:

- **Scenario 6** — an org with an empty WorkPackage catalog: convert a won opportunity and confirm it succeeds and lands on the ops page showing "No packages in your catalog yet," rather than failing.
- **Scenario 7** — create a custom event type, convert using it, and confirm the event carries the terminology snapshot.
- **Scenario 18** — `/new-event` still creates an event with no `lead_id`, and that event still bills through the closeout picker.
- **Scenario 19** — manual `OpsSetup` on an unlinked event is unchanged.

## Out of scope

Do **not** pick these up here — see the spec's "Out of scope":

- The public intake form (separate spec, next increment).
- A jobs list or "Add another job" UI.
- Billing a multi-event opportunity as a single invoice.
- Backfilling `lead_id` onto existing events (pre-launch; nothing to backfill).
- Automatic conversion on proposal acceptance.
- Any item from the CRM V1 follow-up backlog in `docs/superpowers/plans/2026-08-06-crm-v1-finish-out.md`.
