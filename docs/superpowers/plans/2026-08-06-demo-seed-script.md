# BrewTrax Demo Seed Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command (`npm run seed:demo`) stands up a fully populated BrewTrax demo tenant in Firestore, re-runnable and safe to point at any project.

**Architecture:** Two layers. A pure builder (`scripts/seed/brewtrax-data.ts`) turns a single `today: Date` into a complete typed object graph with logical string keys instead of document ids — no I/O, no clock, no randomness, so it is fully unit-testable. A writer (`scripts/seed-demo.ts`) enforces guards, walks that graph in dependency order, resolves logical keys to real ids as it inserts, and drives invoices through the real `create → issue → recordPayment` transitions so derived state comes from production code.

**Tech Stack:** TypeScript, `tsx`, firebase-admin (Firestore + Auth), Vitest.

**Spec:** [docs/superpowers/specs/2026-08-06-demo-seed-script-design.md](../specs/2026-08-06-demo-seed-script-design.md)

## Global Constraints

- **Org id prefix guard:** every org id the script touches must start with `demo-`. Checked before any read, write, or delete. Default `demo-brewtrax`.
- **Run command:** `tsx --conditions=react-server scripts/seed-demo.ts`. The `--conditions=react-server` flag is mandatory — `lib/firebase-admin` imports `server-only`, which throws under a plain `tsx` run.
- **No emulator exists.** Writes land in the real project named by `FIREBASE_PROJECT_ID`.
- **Pure builder purity:** `scripts/seed/brewtrax-data.ts` and `scripts/seed/args.ts` must not import `@/lib/firebase-admin` (directly or transitively), call `Date.now()`/`new Date()` with no argument, or use `crypto.randomBytes`. Tests import them directly with no Firestore mocking.
- **Demo auth defaults:** email `demo@brewtrax.test`, password `BrewTrax!Demo1`.
- **Money is dollars**, not cents, throughout (matches `Invoice.line_items[].unit_price`, `WorkPackage.price`).
- **Firestore rejects `undefined`.** Every optional field must be spread conditionally (`...(x ? { x } : {})`), matching the existing `lib/**` core helpers.

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/seed/types.ts` (create) | The `BrewtraxSeed` graph interfaces and the logical-key convention. |
| `scripts/seed/dates.ts` (create) | Pure date offset helpers relative to a passed-in `today`. |
| `scripts/seed/brewtrax-data.ts` (create) | `buildBrewtraxSeed(today)` — the entire fixture graph. |
| `scripts/seed/args.ts` (create) | Pure CLI arg parsing + the `demo-` prefix guard. |
| `scripts/seed-demo.ts` (create) | The writer: guards, auth user, reset, ordered insert. |
| `__tests__/scripts/seed-data.test.ts` (create) | Tests for the pure builder. |
| `__tests__/scripts/seed-args.test.ts` (create) | Tests for arg parsing + guard. |
| `package.json` (modify) | Add the `seed:demo` script. |

The builder is split across four small files rather than one because the fixture data itself is long; keeping types, date math, and content separate keeps each file in easy reading range.

---

### Task 1: Seed types, date helpers, and the CRM slice

**Files:**
- Create: `scripts/seed/types.ts`
- Create: `scripts/seed/dates.ts`
- Create: `scripts/seed/brewtrax-data.ts`
- Test: `__tests__/scripts/seed-data.test.ts`

**Interfaces:**
- Consumes: `Org`, `Lead`, `Task`, `LeadStage` from `@/lib/types`; `CreateCustomerInput` from `@/lib/crm/customers`.
- Produces:
  - `daysFrom(today: Date, n: number): string` — ISO date `YYYY-MM-DD`.
  - `isoFrom(today: Date, n: number, hhmm?: string): string` — full ISO datetime.
  - `BrewtraxSeed`, `SeedCustomer`, `SeedLead`, `SeedTask` (Task 2 and 3 extend `BrewtraxSeed` with more fields).
  - `buildBrewtraxSeed(today: Date): BrewtraxSeed`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/scripts/seed-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildBrewtraxSeed } from '@/scripts/seed/brewtrax-data'
import { LEAD_STAGES } from '@/lib/leads'

const TODAY = new Date('2026-08-06T12:00:00.000Z')

describe('buildBrewtraxSeed — CRM slice', () => {
  it('produces an org scoped to the coffee-cart pack and brewtrax brand', () => {
    const seed = buildBrewtraxSeed(TODAY)
    expect(seed.org.industry_pack_id).toBe('coffee-cart')
    expect(seed.org.brand_id).toBe('brewtrax')
    expect(seed.org.plan).toBe('business')
    expect(seed.org.billing_status).toBe('active')
  })

  it('covers every lead stage', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const stages = new Set(seed.leads.map((l) => l.lead.stage))
    for (const stage of LEAD_STAGES) expect(stages).toContain(stage)
  })

  it('gives every lead a customer that exists in the graph', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const customerKeys = new Set(seed.customers.map((c) => c.key))
    for (const lead of seed.leads) expect(customerKeys).toContain(lead.customerKey)
  })

  it('gives every task a lead that exists in the graph', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const leadKeys = new Set(seed.leads.map((l) => l.key))
    for (const task of seed.tasks) expect(leadKeys).toContain(task.leadKey)
  })

  it('uses unique lead keys and unique lead ids', () => {
    const seed = buildBrewtraxSeed(TODAY)
    expect(new Set(seed.leads.map((l) => l.key)).size).toBe(seed.leads.length)
    expect(new Set(seed.leads.map((l) => l.lead.id)).size).toBe(seed.leads.length)
  })

  it('marks at least one lead as waiting so the stalled treatment is visible', () => {
    const seed = buildBrewtraxSeed(TODAY)
    expect(seed.leads.some((l) => l.lead.waiting?.reason)).toBe(true)
  })

  it('has both overdue and upcoming open tasks relative to today', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const open = seed.tasks.filter((t) => !t.task.done && t.task.due_date)
    expect(open.some((t) => t.task.due_date! < '2026-08-06')).toBe(true)
    expect(open.some((t) => t.task.due_date! > '2026-08-06')).toBe(true)
  })

  it('is deterministic — same input, identical output', () => {
    expect(buildBrewtraxSeed(TODAY)).toEqual(buildBrewtraxSeed(TODAY))
  })

  it('shifts with today rather than hardcoding dates', () => {
    const later = buildBrewtraxSeed(new Date('2027-01-15T12:00:00.000Z'))
    const openLater = later.tasks.filter((t) => !t.task.done && t.task.due_date)
    expect(openLater.some((t) => t.task.due_date! > '2027-01-15')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/scripts/seed-data.test.ts --exclude '**/.claude/**'`
Expected: FAIL — cannot resolve `@/scripts/seed/brewtrax-data`.

> The `--exclude '**/.claude/**'` flag is required in this checkout; without it vitest walks agent worktrees under `.claude/`.

- [ ] **Step 3: Write the date helpers**

Create `scripts/seed/dates.ts`:

```ts
/** Pure date math relative to a caller-supplied `today`. No clock reads — the
 *  whole seed graph must be a deterministic function of one Date. */

const DAY_MS = 24 * 60 * 60 * 1000

/** ISO calendar date (`YYYY-MM-DD`) `n` days from `today`. Negative = past. */
export function daysFrom(today: Date, n: number): string {
  return new Date(today.getTime() + n * DAY_MS).toISOString().slice(0, 10)
}

/** Full ISO datetime `n` days from `today`, at `hhmm` UTC (default noon). */
export function isoFrom(today: Date, n: number, hhmm = '12:00'): string {
  return `${daysFrom(today, n)}T${hhmm}:00.000Z`
}
```

- [ ] **Step 4: Write the graph types**

Create `scripts/seed/types.ts`:

```ts
import type { Org, Lead, Task } from '@/lib/types'
import type { CreateCustomerInput } from '@/lib/crm/customers'

/**
 * Records are cross-referenced by LOGICAL KEY (`'cust-harper'`), not document
 * id. Customers and invoices get their real ids from core helpers that mint
 * their own (`findOrCreateCustomerCore`, `createInvoiceCore`), so the pure
 * builder cannot know them. The writer keeps a key -> id map as it inserts.
 *
 * Leads and events are written directly, so they carry stable literal ids —
 * which keeps demo URLs identical across resets.
 */

export interface SeedCustomer {
  key: string
  input: CreateCustomerInput
}

export interface SeedLead {
  key: string
  customerKey: string
  /** `customer_id` is filled by the writer from the key map. */
  lead: Omit<Lead, 'customer_id'>
}

export interface SeedTask {
  leadKey: string
  /** `lead_id` is filled by the writer. */
  task: Omit<Task, 'lead_id'>
}

export interface BrewtraxSeed {
  /** `id` comes from --org-id at write time. */
  org: Omit<Org, 'id'>
  customers: SeedCustomer[]
  leads: SeedLead[]
  tasks: SeedTask[]
}
```

- [ ] **Step 5: Write the CRM fixture**

Create `scripts/seed/brewtrax-data.ts`:

```ts
import type { BrewtraxSeed } from '@/scripts/seed/types'
import { daysFrom, isoFrom } from '@/scripts/seed/dates'

/**
 * The BrewTrax demo tenant as a pure function of `today`. Every date is an
 * offset, so the demo reads as a currently-running business whenever it runs.
 */
export function buildBrewtraxSeed(today: Date): BrewtraxSeed {
  const org: BrewtraxSeed['org'] = {
    name: 'BrewTrax Mobile Bar',
    slug: 'brewtrax-demo',
    billing_status: 'active',
    plan: 'business',
    industry_pack_id: 'coffee-cart',
    brand_id: 'brewtrax',
    tips_enabled: true,
    created_at: isoFrom(today, -420),
  }

  const customers: BrewtraxSeed['customers'] = [
    { key: 'cust-harper', input: { name: 'Dana Harper', email: 'dana.harper@example.com', phone: '208-555-0134', company: 'Harper & Vance Weddings' } },
    { key: 'cust-oakline', input: { name: 'Marcus Oakline', email: 'marcus@oaklinetech.example.com', phone: '208-555-0177', company: 'Oakline Technologies' } },
    { key: 'cust-riverbend', input: { name: 'Priya Raman', email: 'priya@riverbendhoa.example.com', phone: '208-555-0192', company: 'Riverbend HOA' } },
    { key: 'cust-summit', input: { name: 'Jordan Ellis', email: 'jordan.ellis@summitcreative.example.com', phone: '208-555-0148', company: 'Summit Creative Co.' } },
    { key: 'cust-larkin', input: { name: 'Sam Larkin', email: 'sam.larkin@example.com', phone: '208-555-0119' } },
    { key: 'cust-benoit', input: { name: 'Camille Benoit', email: 'camille.benoit@example.com', phone: '208-555-0163' } },
    { key: 'cust-northgate', input: { name: 'Tess Alvarado', email: 'tess@northgateschool.example.com', phone: '208-555-0155', company: 'Northgate School District' } },
    { key: 'cust-piney', input: { name: 'Rowan Fitch', email: 'rowan@pineyfork.example.com', phone: '208-555-0128', company: 'Piney Fork Brewing' } },
  ]

  const leads: BrewtraxSeed['leads'] = [
    {
      key: 'lead-harper-wedding', customerKey: 'cust-harper',
      lead: {
        id: 'demo-lead-01', name: 'Dana Harper', title: 'Harper wedding — espresso bar',
        email: 'dana.harper@example.com', phone: '208-555-0134', organization: 'Harper & Vance Weddings',
        event_type: 'Wedding', event_date: daysFrom(today, 14), estimated_value: 2400,
        stage: 'closed_won', created_at: isoFrom(today, -52),
        notes: 'Booked. 120 guests, outdoor ceremony, wants the copper cart.',
      },
    },
    {
      key: 'lead-oakline-offsite', customerKey: 'cust-oakline',
      lead: {
        id: 'demo-lead-02', name: 'Marcus Oakline', title: 'Oakline Q3 offsite — cold brew',
        email: 'marcus@oaklinetech.example.com', phone: '208-555-0177', organization: 'Oakline Technologies',
        event_type: 'Corporate offsite', event_date: daysFrom(today, 7), estimated_value: 1850,
        stage: 'closed_won', created_at: isoFrom(today, -38),
        notes: 'Repeat client, third booking this year. Invoice net 15.',
      },
    },
    {
      key: 'lead-riverbend-block', customerKey: 'cust-riverbend',
      lead: {
        id: 'demo-lead-03', name: 'Priya Raman', title: 'Riverbend block party',
        email: 'priya@riverbendhoa.example.com', phone: '208-555-0192', organization: 'Riverbend HOA',
        event_type: 'Community event', event_date: daysFrom(today, 28), estimated_value: 1600,
        stage: 'closed_won', created_at: isoFrom(today, -25),
        notes: 'HOA board approved. Needs a certificate of insurance on file.',
      },
    },
    {
      key: 'lead-summit-launch', customerKey: 'cust-summit',
      lead: {
        id: 'demo-lead-04', name: 'Jordan Ellis', title: 'Summit product launch',
        email: 'jordan.ellis@summitcreative.example.com', phone: '208-555-0148', organization: 'Summit Creative Co.',
        event_type: 'Corporate', event_date: daysFrom(today, 45), estimated_value: 3200,
        stage: 'proposal', created_at: isoFrom(today, -11),
        notes: 'Sent the three-tier proposal. Deciding between Better and Best.',
      },
    },
    {
      key: 'lead-larkin-anniversary', customerKey: 'cust-larkin',
      lead: {
        id: 'demo-lead-05', name: 'Sam Larkin', title: 'Larkin 40th anniversary',
        email: 'sam.larkin@example.com', phone: '208-555-0119',
        event_type: 'Private party', event_date: daysFrom(today, 60), estimated_value: 1100,
        stage: 'proposal', created_at: isoFrom(today, -9),
        waiting: { reason: 'Waiting on final guest count from the venue', follow_up_date: daysFrom(today, 3) },
        notes: 'Venue caps at 80 but they think 60.',
      },
    },
    {
      key: 'lead-benoit-shower', customerKey: 'cust-benoit',
      lead: {
        id: 'demo-lead-06', name: 'Camille Benoit', title: 'Benoit baby shower',
        email: 'camille.benoit@example.com', phone: '208-555-0163',
        event_type: 'Private party', event_date: daysFrom(today, 33), estimated_value: 750,
        stage: 'consultation', created_at: isoFrom(today, -6),
        notes: 'Discovery call done. Wants a decaf-forward menu.',
      },
    },
    {
      key: 'lead-northgate-staff', customerKey: 'cust-northgate',
      lead: {
        id: 'demo-lead-07', name: 'Tess Alvarado', title: 'Northgate staff appreciation day',
        email: 'tess@northgateschool.example.com', phone: '208-555-0155', organization: 'Northgate School District',
        event_type: 'Corporate', event_date: daysFrom(today, 71), estimated_value: 2100,
        stage: 'consultation', created_at: isoFrom(today, -4),
        notes: 'Purchase order process — needs a W-9 before booking.',
      },
    },
    {
      key: 'lead-piney-collab', customerKey: 'cust-piney',
      lead: {
        id: 'demo-lead-08', name: 'Rowan Fitch', title: 'Piney Fork taproom collab',
        email: 'rowan@pineyfork.example.com', phone: '208-555-0128', organization: 'Piney Fork Brewing',
        event_type: 'Collaboration', event_date: daysFrom(today, 90), estimated_value: 900,
        stage: 'inquiry', created_at: isoFrom(today, -2),
        notes: 'Inbound from the website. Monthly coffee-and-beer pop-up idea.',
      },
    },
    {
      key: 'lead-inquiry-market', customerKey: 'cust-larkin',
      lead: {
        id: 'demo-lead-09', name: 'Sam Larkin', title: 'Saturday farmers market stall',
        email: 'sam.larkin@example.com',
        event_type: 'Recurring', event_date: daysFrom(today, 21), estimated_value: 400,
        stage: 'inquiry', created_at: isoFrom(today, -1),
        notes: 'Asked about a standing weekly slot.',
      },
    },
    {
      key: 'lead-vance-gala', customerKey: 'cust-harper',
      lead: {
        id: 'demo-lead-10', name: 'Dana Harper', title: 'Vance charity gala',
        email: 'dana.harper@example.com', organization: 'Harper & Vance Weddings',
        event_type: 'Gala', event_date: daysFrom(today, -30), estimated_value: 2800,
        stage: 'closed_lost', created_at: isoFrom(today, -75),
        notes: 'Lost on price — went with an in-house caterer.',
      },
    },
  ]

  const tasks: BrewtraxSeed['tasks'] = [
    { leadKey: 'lead-summit-launch', task: { id: 'demo-task-01', title: 'Follow up on proposal tiers', due_date: daysFrom(today, -2), done: false, created_at: isoFrom(today, -9) } },
    { leadKey: 'lead-larkin-anniversary', task: { id: 'demo-task-02', title: 'Chase final guest count', due_date: daysFrom(today, 3), done: false, created_at: isoFrom(today, -8) } },
    { leadKey: 'lead-northgate-staff', task: { id: 'demo-task-03', title: 'Send W-9 to district office', due_date: daysFrom(today, 5), done: false, created_at: isoFrom(today, -3) } },
    { leadKey: 'lead-riverbend-block', task: { id: 'demo-task-04', title: 'Upload certificate of insurance', due_date: daysFrom(today, -5), done: false, created_at: isoFrom(today, -20) } },
    { leadKey: 'lead-benoit-shower', task: { id: 'demo-task-05', title: 'Draft decaf-forward menu', due_date: daysFrom(today, 9), done: false, created_at: isoFrom(today, -5) } },
    { leadKey: 'lead-harper-wedding', task: { id: 'demo-task-06', title: 'Confirm ceremony start time with venue', due_date: daysFrom(today, -12), done: true, done_at: isoFrom(today, -13), created_at: isoFrom(today, -30) } },
    { leadKey: 'lead-oakline-offsite', task: { id: 'demo-task-07', title: 'Send updated cold brew menu', due_date: daysFrom(today, -18), done: true, done_at: isoFrom(today, -19), created_at: isoFrom(today, -34) } },
  ]

  return { org, customers, leads, tasks }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run __tests__/scripts/seed-data.test.ts --exclude '**/.claude/**'`
Expected: PASS — 9 tests.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/seed/types.ts scripts/seed/dates.ts scripts/seed/brewtrax-data.ts __tests__/scripts/seed-data.test.ts
git commit -m "feat(seed): pure BrewTrax fixture builder — org, customers, leads, tasks"
```

---

### Task 2: Events, itinerary, and proposals in the fixture

**Files:**
- Modify: `scripts/seed/types.ts`
- Modify: `scripts/seed/brewtrax-data.ts`
- Test: `__tests__/scripts/seed-data.test.ts`

**Interfaces:**
- Consumes: `daysFrom`, `isoFrom`, `BrewtraxSeed` from Task 1; `Event`, `ItineraryItem`, `Proposal` from `@/lib/types`; `computeSelectedTotal` from `@/lib/proposals` (tax-aware; `proposalTotal` is a raw line-item sum that ignores tax and discount).
- Produces: `SeedEvent`, `SeedProposal`; `BrewtraxSeed` gains `events: SeedEvent[]` and `proposals: SeedProposal[]`.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/scripts/seed-data.test.ts`:

```ts
import { computeSelectedTotal } from '@/lib/proposals'

describe('buildBrewtraxSeed — events and proposals', () => {
  it('has three active upcoming jobs and two archived past jobs', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const upcoming = seed.events.filter((e) => e.event.event_start > '2026-08-06')
    const past = seed.events.filter((e) => e.event.event_start < '2026-08-06')
    expect(upcoming).toHaveLength(3)
    expect(past).toHaveLength(2)
    expect(upcoming.every((e) => e.event.status === 'active')).toBe(true)
    expect(past.every((e) => e.event.status === 'archived')).toBe(true)
  })

  it('gives every upcoming job a headcount and at least one key contact', () => {
    const seed = buildBrewtraxSeed(TODAY)
    for (const e of seed.events.filter((e) => e.event.event_start > '2026-08-06')) {
      expect(e.event.headcount).toBeGreaterThan(0)
      expect(e.event.key_contacts?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('scopes every itinerary item to a day within its own event', () => {
    const seed = buildBrewtraxSeed(TODAY)
    for (const e of seed.events) {
      for (const item of e.itinerary) {
        expect(item.day >= e.event.event_start.slice(0, 10)).toBe(true)
        expect(item.day <= e.event.event_end.slice(0, 10)).toBe(true)
      }
    }
  })

  it('covers draft, sent, and accepted proposal statuses', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const statuses = new Set(seed.proposals.map((p) => p.proposal.status))
    expect(statuses).toContain('draft')
    expect(statuses).toContain('sent')
    expect(statuses).toContain('accepted')
  })

  it('points every proposal at a lead in the graph', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const leadKeys = new Set(seed.leads.map((l) => l.key))
    for (const p of seed.proposals) expect(leadKeys).toContain(p.leadKey)
  })

  it('gives the sent proposal an expiry in the near future', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const sent = seed.proposals.find((p) => p.proposal.status === 'sent')
    expect(sent?.proposal.expires_at).toBeDefined()
    expect(sent!.proposal.expires_at! > TODAY.toISOString()).toBe(true)
  })

  it('gives the accepted proposal a deposit and a selection whose total is the real computed total', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const accepted = seed.proposals.find((p) => p.proposal.status === 'accepted')!
    expect(accepted.proposal.deposit).toBeDefined()
    expect(accepted.proposal.selection).toBeDefined()
    expect(accepted.proposal.selection!.selected_total)
      .toBe(computeSelectedTotal(accepted.proposal, { optional_item_ids: [] }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/scripts/seed-data.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `seed.events` is undefined.

- [ ] **Step 3: Extend the graph types**

In `scripts/seed/types.ts`, add the imports and interfaces, and extend `BrewtraxSeed`:

```ts
import type { Org, Lead, Task, Event, ItineraryItem, Proposal } from '@/lib/types'

export interface SeedEvent {
  key: string
  event: Event
  itinerary: ItineraryItem[]
}

export interface SeedProposal {
  leadKey: string
  /** `org_id`, `lead_id`, and `token` are filled by the writer. */
  proposal: Omit<Proposal, 'org_id' | 'lead_id' | 'token'>
}

export interface BrewtraxSeed {
  org: Omit<Org, 'id'>
  customers: SeedCustomer[]
  leads: SeedLead[]
  tasks: SeedTask[]
  events: SeedEvent[]
  proposals: SeedProposal[]
}
```

- [ ] **Step 4: Add events and proposals to the fixture**

In `scripts/seed/brewtrax-data.ts`, add `import { computeSelectedTotal } from '@/lib/proposals'`, then build these before the `return` and add them to it.

`Event.slug` is normally produced by `buildEventSlug(name, year)`; the literals below are exactly what it returns for these names, and Task 6 asserts that at write time.

```ts
  /** Calendar year of the date `n` days out — an event near a year boundary
   *  must carry its own year, not today's, or its slug misreports it. */
  const yearOf = (n: number) => Number(daysFrom(today, n).slice(0, 4))

  const summitLines = [
    { id: 'li-1', description: 'Espresso bar service — 4 hours', quantity: 1, unit_price: 1450, taxable: true },
    { id: 'li-2', description: 'Second barista', quantity: 1, unit_price: 450, taxable: true },
    { id: 'li-3', description: 'Branded cup sleeves (250)', quantity: 1, unit_price: 180, optional: true, taxable: true },
  ]
  const oaklineLines = [
    { id: 'li-1', description: 'Cold brew bar — 3 hours', quantity: 1, unit_price: 1200, taxable: true },
    { id: 'li-2', description: 'Nitro tap add-on', quantity: 1, unit_price: 350, taxable: true },
  ]
  const larkinLines = [
    { id: 'li-1', description: 'Drip coffee service — 2 hours', quantity: 1, unit_price: 650, taxable: true },
    { id: 'li-2', description: 'Pastry pairing', quantity: 60, unit_price: 4.5, optional: true, taxable: true },
  ]

  const events: BrewtraxSeed['events'] = [
    {
      key: 'event-oakline', event: {
        id: 'demo-event-01', name: 'Oakline Q3 Offsite', slug: `oakline-q3-offsite-${yearOf(7)}`,
        year: yearOf(7), status: 'active', registration_type: 'individual', event_type_id: 'event',
        features: { accommodations: false, teams: false, budget: true, itinerary: true, communicate: true },
        event_start: isoFrom(today, 7, '15:00'), event_end: isoFrom(today, 7, '19:00'),
        headcount: 85, created_at: isoFrom(today, -38),
        key_contacts: [
          { name: 'Marcus Oakline', role: 'Client', phone: '208-555-0177', email: 'marcus@oaklinetech.example.com' },
          { name: 'Riley Chen', role: 'Venue coordinator', phone: '208-555-0181' },
        ],
      },
      itinerary: [
        { id: 'demo-itin-01', day: daysFrom(today, 7), start_time: '13:30', end_time: '15:00', title: 'Load in and cart setup', location: 'Oakline HQ — north lot', sort_order: 1, created_at: isoFrom(today, -20) },
        { id: 'demo-itin-02', day: daysFrom(today, 7), start_time: '15:00', end_time: '19:00', title: 'Cold brew service', location: 'Courtyard', sort_order: 2, created_at: isoFrom(today, -20) },
        { id: 'demo-itin-03', day: daysFrom(today, 7), start_time: '19:00', end_time: '20:00', title: 'Teardown', sort_order: 3, created_at: isoFrom(today, -20) },
      ],
    },
    {
      key: 'event-harper', event: {
        id: 'demo-event-02', name: 'Harper Wedding', slug: `harper-wedding-${yearOf(14)}`,
        year: yearOf(14), status: 'active', registration_type: 'individual', event_type_id: 'event',
        features: { accommodations: false, teams: false, budget: true, itinerary: true, communicate: true },
        event_start: isoFrom(today, 14, '16:00'), event_end: isoFrom(today, 14, '22:00'),
        headcount: 120, created_at: isoFrom(today, -52),
        key_contacts: [
          { name: 'Dana Harper', role: 'Planner', phone: '208-555-0134', email: 'dana.harper@example.com' },
          { name: 'Alex Vance', role: 'Day-of coordinator', phone: '208-555-0139' },
        ],
      },
      itinerary: [
        { id: 'demo-itin-04', day: daysFrom(today, 14), start_time: '14:00', end_time: '16:00', title: 'Setup — copper cart, ceremony lawn', location: 'Wildrose Barn', sort_order: 1, created_at: isoFrom(today, -25) },
        { id: 'demo-itin-05', day: daysFrom(today, 14), start_time: '18:00', end_time: '22:00', title: 'Espresso bar — reception', location: 'Wildrose Barn', sort_order: 2, created_at: isoFrom(today, -25) },
      ],
    },
    {
      key: 'event-riverbend', event: {
        id: 'demo-event-03', name: 'Riverbend Block Party', slug: `riverbend-block-party-${yearOf(28)}`,
        year: yearOf(28), status: 'active', registration_type: 'individual', event_type_id: 'event',
        features: { accommodations: false, teams: false, budget: true, itinerary: true, communicate: true },
        event_start: isoFrom(today, 28, '10:00'), event_end: isoFrom(today, 28, '14:00'),
        headcount: 200, created_at: isoFrom(today, -25),
        key_contacts: [{ name: 'Priya Raman', role: 'HOA board', phone: '208-555-0192', email: 'priya@riverbendhoa.example.com' }],
      },
      itinerary: [
        { id: 'demo-itin-06', day: daysFrom(today, 28), start_time: '08:30', end_time: '10:00', title: 'Setup on Riverbend Ct', sort_order: 1, created_at: isoFrom(today, -10) },
        { id: 'demo-itin-07', day: daysFrom(today, 28), start_time: '10:00', end_time: '14:00', title: 'Drip + iced service', sort_order: 2, created_at: isoFrom(today, -10) },
      ],
    },
    {
      key: 'event-summerfest', event: {
        id: 'demo-event-04', name: 'Meridian Summerfest', slug: `meridian-summerfest-${yearOf(-21)}`,
        year: yearOf(-21), status: 'archived', registration_type: 'individual', event_type_id: 'event',
        features: { accommodations: false, teams: false, budget: true, itinerary: true, communicate: true },
        event_start: isoFrom(today, -21, '11:00'), event_end: isoFrom(today, -21, '17:00'),
        headcount: 300, created_at: isoFrom(today, -90),
        key_contacts: [{ name: 'Nina Torres', role: 'Festival ops', phone: '208-555-0201' }],
      },
      itinerary: [
        { id: 'demo-itin-08', day: daysFrom(today, -21), start_time: '09:00', end_time: '11:00', title: 'Setup — vendor row', sort_order: 1, created_at: isoFrom(today, -60) },
      ],
    },
    {
      key: 'event-vance-retreat', event: {
        id: 'demo-event-05', name: 'Vance Corporate Retreat', slug: `vance-corporate-retreat-${yearOf(-56)}`,
        year: yearOf(-56), status: 'archived', registration_type: 'individual', event_type_id: 'event',
        features: { accommodations: false, teams: false, budget: true, itinerary: true, communicate: true },
        event_start: isoFrom(today, -56, '08:00'), event_end: isoFrom(today, -56, '12:00'),
        headcount: 45, created_at: isoFrom(today, -110),
        key_contacts: [{ name: 'Alex Vance', role: 'Client', phone: '208-555-0139' }],
      },
      itinerary: [
        { id: 'demo-itin-09', day: daysFrom(today, -56), start_time: '07:00', end_time: '08:00', title: 'Morning setup', sort_order: 1, created_at: isoFrom(today, -80) },
      ],
    },
  ]

  const proposals: BrewtraxSeed['proposals'] = [
    {
      leadKey: 'lead-summit-launch',
      proposal: {
        id: 'demo-prop-01', title: 'Summit Creative — product launch coffee service',
        status: 'sent', line_items: summitLines, tax_rate: 6,
        deposit: { type: 'percent', value: 25 }, deposit_gate: 'after_accept',
        deposit_terms: '25% deposit holds the date; balance due on completion.',
        expires_at: isoFrom(today, 6, '23:59'),
        created_at: isoFrom(today, -8), updated_at: isoFrom(today, -8),
        notes: 'Tiered options discussed on the discovery call.',
        blocks: [
          { id: 'blk-1', type: 'heading', text: 'What we bring', level: 2 },
          { id: 'blk-2', type: 'paragraph', text: 'A full mobile espresso bar, two baristas, and everything needed to serve 150 drinks in four hours.' },
          { id: 'blk-3', type: 'list', items: ['Copper mobile cart', 'Single-origin espresso + two milk options', 'Compostable cups and lids', 'Setup and teardown included'] },
        ],
        events: [{ kind: 'sent', at: isoFrom(today, -8) }, { kind: 'viewed', at: isoFrom(today, -7) }],
      },
    },
    {
      leadKey: 'lead-oakline-offsite',
      proposal: {
        id: 'demo-prop-02', title: 'Oakline Q3 offsite — cold brew bar',
        status: 'accepted', line_items: oaklineLines, tax_rate: 6,
        deposit: { type: 'percent', value: 50 }, deposit_gate: 'after_accept',
        deposit_terms: '50% deposit due at booking.',
        payment_status: 'deposit_paid',
        selection: { optional_item_ids: [], selected_total: computeSelectedTotal({ line_items: oaklineLines, tax_rate: 6 }, { optional_item_ids: [] }), selected_at: isoFrom(today, -30) },
        client_response_at: isoFrom(today, -30),
        created_at: isoFrom(today, -35), updated_at: isoFrom(today, -30),
        events: [
          { kind: 'sent', at: isoFrom(today, -35) },
          { kind: 'viewed', at: isoFrom(today, -34) },
          { kind: 'accepted', at: isoFrom(today, -30) },
        ],
      },
    },
    {
      leadKey: 'lead-larkin-anniversary',
      proposal: {
        id: 'demo-prop-03', title: 'Larkin 40th anniversary — coffee service',
        status: 'draft', line_items: larkinLines,
        created_at: isoFrom(today, -1),
        notes: 'Hold until the guest count lands.',
      },
    },
  ]
```

Add `events` and `proposals` to the returned object:

```ts
  return { org, customers, leads, tasks, events, proposals }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run __tests__/scripts/seed-data.test.ts --exclude '**/.claude/**'`
Expected: PASS — 16 tests.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/seed/types.ts scripts/seed/brewtrax-data.ts __tests__/scripts/seed-data.test.ts
git commit -m "feat(seed): add events, itinerary, and proposals to the BrewTrax fixture"
```

---

### Task 3: Invoices and ops in the fixture

**Files:**
- Modify: `scripts/seed/types.ts`
- Modify: `scripts/seed/brewtrax-data.ts`
- Test: `__tests__/scripts/seed-data.test.ts`

**Interfaces:**
- Consumes: `CreateInvoiceCoreInput`, `RecordPaymentCoreInput` from `@/lib/crm/invoices`; `CreateResourceInput` from `@/lib/ops/resources`; `CreateWorkPackageInput` from `@/lib/ops/work-packages`; `CreateComplianceDocInput` from `@/lib/ops/compliance`; `CreateIssueInput` from `@/lib/ops/issues`; `OpsRequirements` from `@/lib/types`.
- Produces: `SeedInvoice`, `SeedOps`; `BrewtraxSeed` gains `invoices: SeedInvoice[]` and `ops: SeedOps`.

Work-package lines reference resources by **logical key**, not id — `createResourceCore` mints ids. `SeedWorkPackage.lines` therefore uses a `resourceKey` variant that the writer rewrites into a real `WorkPackageLine` before calling `createWorkPackageCore`.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/scripts/seed-data.test.ts`:

```ts
import { invoiceBalance } from '@/lib/invoices'
import { deriveAging } from '@/lib/invoice-status'

describe('buildBrewtraxSeed — invoices', () => {
  it('points every invoice at a lead and a customer in the graph', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const leadKeys = new Set(seed.leads.map((l) => l.key))
    const customerKeys = new Set(seed.customers.map((c) => c.key))
    for (const inv of seed.invoices) {
      expect(leadKeys).toContain(inv.leadKey)
      expect(customerKeys).toContain(inv.customerKey)
    }
  })

  it('covers the aging buckets the demo is meant to show', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const buckets = new Set(
      seed.invoices
        .filter((inv) => inv.issue)
        .map((inv) => {
          const balance = invoiceBalance({
            line_items: inv.input.line_items ?? [],
            payments: inv.payments.map((p) => ({ amount: p.amount, recorded_at: TODAY.toISOString() })),
          })
          return deriveAging({ dueDate: inv.input.due_date, balance, lifecycle: 'issued' }, TODAY)
        }),
    )
    expect(buckets).toContain('current')   // paid in full
    expect(buckets).toContain('due_soon')
    expect(buckets).toContain('d31_60')
  })

  it('has exactly one draft, one fully paid, and one partially paid invoice', () => {
    const seed = buildBrewtraxSeed(TODAY)
    expect(seed.invoices.filter((i) => !i.issue)).toHaveLength(1)

    const paidStates = seed.invoices.filter((i) => i.issue).map((inv) => {
      const due = (inv.input.line_items ?? []).reduce((s, li) => s + li.quantity * li.unit_price, 0)
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
      return paid === 0 ? 'unpaid' : paid >= due ? 'paid' : 'partial'
    })
    expect(paidStates.filter((s) => s === 'paid')).toHaveLength(1)
    expect(paidStates.filter((s) => s === 'partial')).toHaveLength(1)
  })

  it('never records a payment larger than the invoice total', () => {
    const seed = buildBrewtraxSeed(TODAY)
    for (const inv of seed.invoices) {
      const due = (inv.input.line_items ?? []).reduce((s, li) => s + li.quantity * li.unit_price, 0)
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
      expect(paid).toBeLessThanOrEqual(due)
    }
  })
})

describe('buildBrewtraxSeed — ops', () => {
  it('covers all three resource kinds', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const kinds = new Set(seed.ops.resources.map((r) => r.input.kind))
    expect(kinds).toContain('consumable')
    expect(kinds).toContain('reusable')
    expect(kinds).toContain('serialized')
  })

  it('references only resource keys that exist', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const resourceKeys = new Set(seed.ops.resources.map((r) => r.key))
    for (const pkg of seed.ops.workPackages) {
      for (const line of pkg.lines) {
        if (line.kind === 'labor') continue
        expect(resourceKeys).toContain(line.resourceKey)
      }
    }
  })

  it('attaches the ops plan to an upcoming event with a positive guest count', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const event = seed.events.find((e) => e.key === seed.ops.plan.eventKey)
    expect(event).toBeDefined()
    expect(event!.event.event_start > TODAY.toISOString()).toBe(true)
    expect(seed.ops.plan.requirements.guests).toBeGreaterThan(0)
  })

  it('references only work package keys that exist', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const pkgKeys = new Set(seed.ops.workPackages.map((p) => p.key))
    for (const key of seed.ops.plan.packageKeys) expect(pkgKeys).toContain(key)
  })

  it('has one open and one resolved issue', () => {
    const seed = buildBrewtraxSeed(TODAY)
    expect(seed.ops.issues.filter((i) => !i.resolution)).toHaveLength(1)
    expect(seed.ops.issues.filter((i) => i.resolution)).toHaveLength(1)
  })

  it('has a compliance doc expiring within 60 days', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const soon = new Date(TODAY.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    expect(seed.ops.complianceDocs.some((d) => d.expires_on && d.expires_on <= soon)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/scripts/seed-data.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `seed.invoices` is undefined.

- [ ] **Step 3: Extend the graph types**

Add to `scripts/seed/types.ts`:

```ts
import type { OpsRequirements, ResourceKind } from '@/lib/types'
import type { CreateInvoiceCoreInput, RecordPaymentCoreInput } from '@/lib/crm/invoices'
import type { CreateComplianceDocInput } from '@/lib/ops/compliance'
import type { IssueSeverity } from '@/lib/types'

export interface SeedInvoice {
  key: string
  leadKey: string
  customerKey: string
  input: CreateInvoiceCoreInput
  /** Present = issue it after create. Absent = leave it in draft. */
  issue?: { issuedAt: string }
  payments: RecordPaymentCoreInput[]
}

/** Work package lines reference resources by logical key; the writer swaps in real ids. */
export type SeedWorkPackageLine =
  | { kind: 'consumable'; resourceKey: string; qty_per_guest: number; base_qty?: number }
  | { kind: 'equipment'; resourceKey: string; qty: number }
  | { kind: 'labor'; role: string; count: number }

export interface SeedWorkPackage {
  key: string
  name: string
  description?: string
  scope?: string
  price: number
  max_guests?: number
  lines: SeedWorkPackageLine[]
  setup_minutes?: number
  teardown_minutes?: number
}

export interface SeedResource {
  key: string
  input: { name: string; kind: ResourceKind; unit?: string; unit_cost?: number; notes?: string }
}

export interface SeedIssue {
  type: string
  severity: IssueSeverity
  note: string
  /** Present = resolve it after create. */
  resolution?: string
}

export interface SeedOps {
  resources: SeedResource[]
  workPackages: SeedWorkPackage[]
  plan: {
    eventKey: string
    packageKeys: string[]
    requirements: OpsRequirements
    /** How many checklist steps to mark done, and how many deadlines, so
     *  readiness reads as in-progress rather than 0% or 100%. */
    completeStepCount: number
    completeDeadlineCount: number
  }
  issues: SeedIssue[]
  complianceDocs: CreateComplianceDocInput[]
}

export interface BrewtraxSeed {
  org: Omit<Org, 'id'>
  customers: SeedCustomer[]
  leads: SeedLead[]
  tasks: SeedTask[]
  events: SeedEvent[]
  proposals: SeedProposal[]
  invoices: SeedInvoice[]
  ops: SeedOps
}
```

- [ ] **Step 4: Add invoices and ops to the fixture**

In `scripts/seed/brewtrax-data.ts`, build these before the `return`:

```ts
  const invoices: BrewtraxSeed['invoices'] = [
    {
      key: 'inv-summerfest-paid', leadKey: 'lead-vance-gala', customerKey: 'cust-harper',
      input: {
        title: 'Meridian Summerfest — vendor day', type: 'final', due_date: daysFrom(today, -14),
        line_items: [{ description: 'Full-day drip and iced service', quantity: 1, unit_price: 1800 }],
      },
      issue: { issuedAt: isoFrom(today, -28) },
      payments: [{ amount: 1800, method: 'card', note: 'Paid in full on site' }],
    },
    {
      key: 'inv-oakline-deposit', leadKey: 'lead-oakline-offsite', customerKey: 'cust-oakline',
      input: {
        title: 'Oakline Q3 offsite — deposit', type: 'deposit', due_date: daysFrom(today, -40),
        line_items: [{ description: 'Cold brew bar — 50% deposit', quantity: 1, unit_price: 775 }],
      },
      issue: { issuedAt: isoFrom(today, -45) },
      payments: [{ amount: 400, method: 'ach', note: 'Partial — remainder promised by end of month' }],
    },
    {
      key: 'inv-harper-deposit', leadKey: 'lead-harper-wedding', customerKey: 'cust-harper',
      input: {
        title: 'Harper wedding — deposit', type: 'deposit', due_date: daysFrom(today, 2),
        line_items: [{ description: 'Espresso bar deposit', quantity: 1, unit_price: 1200 }],
      },
      issue: { issuedAt: isoFrom(today, -5) },
      payments: [],
    },
    {
      key: 'inv-riverbend-quick', leadKey: 'lead-riverbend-block', customerKey: 'cust-riverbend',
      input: {
        title: 'Riverbend block party — balance', type: 'quick', due_date: daysFrom(today, 12),
        line_items: [{ description: 'Community event service — 4 hours', quantity: 1, unit_price: 1600 }],
      },
      issue: { issuedAt: isoFrom(today, -3) },
      payments: [],
    },
    {
      key: 'inv-larkin-draft', leadKey: 'lead-larkin-anniversary', customerKey: 'cust-larkin',
      input: {
        title: 'Larkin anniversary — draft', type: 'quick',
        line_items: [{ description: 'Drip coffee service — 2 hours', quantity: 1, unit_price: 650 }],
      },
      payments: [],
    },
  ]

  const ops: BrewtraxSeed['ops'] = {
    resources: [
      { key: 'res-beans', input: { name: 'Single-origin espresso beans', kind: 'consumable', unit: 'lb', unit_cost: 14.5 } },
      { key: 'res-cups', input: { name: '12oz compostable cups', kind: 'consumable', unit: 'each', unit_cost: 0.18 } },
      { key: 'res-milk', input: { name: 'Whole milk', kind: 'consumable', unit: 'gal', unit_cost: 4.25 } },
      { key: 'res-cart', input: { name: 'Copper mobile cart', kind: 'reusable', notes: 'Primary cart — fits through a 36" doorway' } },
      { key: 'res-grinder', input: { name: 'Mahlkonig E65S grinder', kind: 'serialized', notes: 'Serial MK-2291' } },
      { key: 'res-espresso-machine', input: { name: 'La Marzocco Linea Mini', kind: 'serialized', notes: 'Serial LM-88413' } },
    ],
    workPackages: [
      {
        key: 'pkg-espresso-bar', name: 'Espresso Bar — 4 hour', price: 1450, max_guests: 150,
        scope: 'Two baristas, full espresso menu, cups and compostable lids included.',
        setup_minutes: 90, teardown_minutes: 45,
        lines: [
          { kind: 'consumable', resourceKey: 'res-beans', qty_per_guest: 0.02, base_qty: 1 },
          { kind: 'consumable', resourceKey: 'res-cups', qty_per_guest: 1.3 },
          { kind: 'consumable', resourceKey: 'res-milk', qty_per_guest: 0.05 },
          { kind: 'equipment', resourceKey: 'res-cart', qty: 1 },
          { kind: 'equipment', resourceKey: 'res-espresso-machine', qty: 1 },
          { kind: 'equipment', resourceKey: 'res-grinder', qty: 1 },
          { kind: 'labor', role: 'Barista', count: 2 },
        ],
      },
      {
        key: 'pkg-cold-brew', name: 'Cold Brew Bar — 3 hour', price: 1200, max_guests: 120,
        scope: 'Self-serve cold brew on tap with one barista attending.',
        setup_minutes: 60, teardown_minutes: 30,
        lines: [
          { kind: 'consumable', resourceKey: 'res-cups', qty_per_guest: 1.1 },
          { kind: 'equipment', resourceKey: 'res-cart', qty: 1 },
          { kind: 'labor', role: 'Barista', count: 1 },
        ],
      },
    ],
    plan: {
      eventKey: 'event-oakline',
      packageKeys: ['pkg-cold-brew'],
      requirements: {
        guests: 85,
        service_start: isoFrom(today, 7, '15:00'),
        service_end: isoFrom(today, 7, '19:00'),
        site_needs: ['power', 'ice', 'parking'],
        notes: 'Load in through the north lot; badge required at the gate.',
      },
      completeStepCount: 3,
      completeDeadlineCount: 1,
    },
    issues: [
      { type: 'equipment', severity: 'medium', note: 'Grinder burrs are due for replacement — grind is running coarse.' },
      { type: 'logistics', severity: 'low', note: 'Load-in gate was locked on arrival.', resolution: 'Venue now sends a gate code with the confirmation email.' },
    ],
    complianceDocs: [
      { name: 'General liability certificate', expires_on: daysFrom(today, 24), notes: 'Renew with the broker — Riverbend HOA needs a copy.' },
      { name: 'Food handler permit — Ada County', expires_on: daysFrom(today, 210) },
      { name: 'Mobile vendor license', expires_on: daysFrom(today, 145) },
    ],
  }
```

Update the return:

```ts
  return { org, customers, leads, tasks, events, proposals, invoices, ops }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run __tests__/scripts/seed-data.test.ts --exclude '**/.claude/**'`
Expected: PASS — 26 tests.

If the aging test fails, adjust `due_date` offsets — `deriveAging` buckets from `daysOverdue`: `< -3` is `current`, `-3..-1` is `due_soon`, `0` is `due_today`, `1..30` is `d1_30`, `31..60` is `d31_60`.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/seed/types.ts scripts/seed/brewtrax-data.ts __tests__/scripts/seed-data.test.ts
git commit -m "feat(seed): add invoices and ops fixtures to the BrewTrax seed graph"
```

---

### Task 4: CLI argument parsing and the demo-prefix guard

**Files:**
- Create: `scripts/seed/args.ts`
- Test: `__tests__/scripts/seed-args.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_ORG_ID = 'demo-brewtrax'`, `DEFAULT_EMAIL = 'demo@brewtrax.test'`, `DEFAULT_PASSWORD = 'BrewTrax!Demo1'`
  - `interface SeedArgs { orgId: string; email: string; password: string; reset: boolean }`
  - `parseSeedArgs(argv: string[]): SeedArgs` — throws on an org id without the `demo-` prefix and on unknown flags.

This is the safety boundary, so it is a standalone pure module with its own tests. Nothing else in the script may derive an org id.

- [ ] **Step 1: Write the failing test**

Create `__tests__/scripts/seed-args.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseSeedArgs, DEFAULT_ORG_ID, DEFAULT_EMAIL, DEFAULT_PASSWORD } from '@/scripts/seed/args'

describe('parseSeedArgs', () => {
  it('defaults to the demo org, demo login, and no reset', () => {
    expect(parseSeedArgs([])).toEqual({
      orgId: DEFAULT_ORG_ID, email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD, reset: false,
    })
  })

  it('accepts --reset', () => {
    expect(parseSeedArgs(['--reset']).reset).toBe(true)
  })

  it('accepts an overriding org id that keeps the demo- prefix', () => {
    expect(parseSeedArgs(['--org-id=demo-brewtrax-staging']).orgId).toBe('demo-brewtrax-staging')
  })

  it('accepts --email and --password overrides', () => {
    const args = parseSeedArgs(['--email=me@example.com', '--password=hunter2'])
    expect(args.email).toBe('me@example.com')
    expect(args.password).toBe('hunter2')
  })

  it('rejects an org id without the demo- prefix', () => {
    expect(() => parseSeedArgs(['--org-id=acme-corp'])).toThrow(/must start with "demo-"/)
  })

  it('rejects an org id that only contains demo- later in the string', () => {
    expect(() => parseSeedArgs(['--org-id=prod-demo-brewtrax'])).toThrow(/must start with "demo-"/)
  })

  it('rejects a bare demo- prefix with nothing after it', () => {
    expect(() => parseSeedArgs(['--org-id=demo-'])).toThrow(/must start with "demo-"/)
  })

  it('rejects an empty org id', () => {
    expect(() => parseSeedArgs(['--org-id='])).toThrow(/must start with "demo-"/)
  })

  it('rejects unknown flags rather than ignoring them', () => {
    expect(() => parseSeedArgs(['--force'])).toThrow(/Unknown flag: --force/)
  })

  it('rejects an empty password', () => {
    expect(() => parseSeedArgs(['--password='])).toThrow(/Password cannot be empty/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/scripts/seed-args.test.ts --exclude '**/.claude/**'`
Expected: FAIL — cannot resolve `@/scripts/seed/args`.

- [ ] **Step 3: Write the implementation**

Create `scripts/seed/args.ts`:

```ts
/**
 * Pure CLI parsing for the demo seeder. This module is the safety boundary:
 * the `demo-` prefix check is what makes the reset path structurally unable
 * to target a real tenant, so every org id must come from here.
 */

export const DEFAULT_ORG_ID = 'demo-brewtrax'
export const DEFAULT_EMAIL = 'demo@brewtrax.test'
export const DEFAULT_PASSWORD = 'BrewTrax!Demo1'

const DEMO_PREFIX = 'demo-'

export interface SeedArgs {
  orgId: string
  email: string
  password: string
  reset: boolean
}

/** Throws unless `orgId` starts with `demo-` and has something after it. */
export function assertDemoOrgId(orgId: string): void {
  if (!orgId.startsWith(DEMO_PREFIX) || orgId.length <= DEMO_PREFIX.length) {
    throw new Error(
      `Refusing to touch org "${orgId}": the seeder only operates on ids that must start with "demo-". ` +
        `This guard is what keeps --reset from deleting a real tenant.`,
    )
  }
}

export function parseSeedArgs(argv: string[]): SeedArgs {
  let orgId = DEFAULT_ORG_ID
  let email = DEFAULT_EMAIL
  let password = DEFAULT_PASSWORD
  let reset = false

  for (const arg of argv) {
    if (arg === '--reset') { reset = true; continue }
    if (arg.startsWith('--org-id=')) { orgId = arg.slice('--org-id='.length); continue }
    if (arg.startsWith('--email=')) { email = arg.slice('--email='.length); continue }
    if (arg.startsWith('--password=')) { password = arg.slice('--password='.length); continue }
    throw new Error(`Unknown flag: ${arg}`)
  }

  assertDemoOrgId(orgId)
  if (!email.trim()) throw new Error('Email cannot be empty')
  if (!password) throw new Error('Password cannot be empty')

  return { orgId, email, password, reset }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/scripts/seed-args.test.ts --exclude '**/.claude/**'`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed/args.ts __tests__/scripts/seed-args.test.ts
git commit -m "feat(seed): CLI arg parsing with the demo- org id guard"
```

---

### Task 5: The writer — guards, auth user, reset, and the CRM slice

**Files:**
- Create: `scripts/seed-demo.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `parseSeedArgs`, `assertDemoOrgId` (Task 4); `buildBrewtraxSeed` (Tasks 1–3); `adminDb`, `adminAuth` from `@/lib/firebase-admin`; `findOrCreateCustomerCore` from `@/lib/crm/customers`; `leadsRef` from `@/lib/crm/leads`; `tasksRef` from `@/lib/crm/tasks`.
- Produces: an executable script; Task 6 extends its `main()` with events, proposals, invoices, and ops.

There are no unit tests for the writer — its logic is guard-checking and sequencing against a live Firestore, which a mock would assert tautologically. It is verified by running it (Task 6, Step 5).

- [ ] **Step 1: Add the npm script**

In `package.json`, add to `"scripts"` after `crm:backfill-email-lower`:

```json
    "seed:demo": "tsx --conditions=react-server scripts/seed-demo.ts"
```

- [ ] **Step 2: Write the writer's guards, reset, and CRM slice**

Create `scripts/seed-demo.ts`:

```ts
import { adminDb, adminAuth } from '@/lib/firebase-admin'
import { findOrCreateCustomerCore } from '@/lib/crm/customers'
import { leadsRef } from '@/lib/crm/leads'
import { tasksRef } from '@/lib/crm/tasks'
import { parseSeedArgs, assertDemoOrgId, type SeedArgs } from '@/scripts/seed/args'
import { buildBrewtraxSeed } from '@/scripts/seed/brewtrax-data'
import type { Org, OrgMember, Lead, Task } from '@/lib/types'

// Run via `npm run seed:demo` — it sets --conditions=react-server so 'server-only'
// (imported transitively via lib/firebase-admin) resolves to its no-throw module under tsx.

function orgRef(orgId: string) {
  assertDemoOrgId(orgId)
  return adminDb.collection('orgs').doc(orgId)
}

/**
 * Delete the demo org and everything beneath it. `assertDemoOrgId` runs again
 * here rather than trusting the caller — this is the only destructive path in
 * the script, so the guard sits directly on it.
 */
async function resetOrg(orgId: string): Promise<void> {
  assertDemoOrgId(orgId)
  const ref = orgRef(orgId)
  if (!(await ref.get()).exists) {
    console.log(`  no existing org "${orgId}" — nothing to reset`)
    return
  }
  await adminDb.recursiveDelete(ref)
  console.log(`  deleted org "${orgId}" and all subcollections`)
}

/** Look up the demo auth user by email, creating it only if absent. */
async function resolveDemoUser(args: SeedArgs): Promise<string> {
  try {
    const existing = await adminAuth.getUserByEmail(args.email)
    console.log(`  reusing auth user ${args.email} (${existing.uid})`)
    return existing.uid
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code !== 'auth/user-not-found') throw err
    const created = await adminAuth.createUser({
      email: args.email,
      password: args.password,
      displayName: 'BrewTrax Demo',
      emailVerified: true,
    })
    console.log(`  created auth user ${args.email} (${created.uid})`)
    return created.uid
  }
}

async function main(): Promise<void> {
  const args = parseSeedArgs(process.argv.slice(2))

  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not set — refusing to run')

  console.log(`\nSeeding BrewTrax demo data`)
  console.log(`  project: ${projectId}`)
  console.log(`  org:     ${args.orgId}`)
  console.log(`  reset:   ${args.reset}\n`)

  const ref = orgRef(args.orgId)
  if (args.reset) {
    await resetOrg(args.orgId)
  } else if ((await ref.get()).exists) {
    throw new Error(`Org "${args.orgId}" already exists. Re-run with --reset to replace it.`)
  }

  const uid = await resolveDemoUser(args)
  const seed = buildBrewtraxSeed(new Date())

  // Org + owner membership.
  const org: Org = { ...seed.org, id: args.orgId }
  await ref.set(org)
  const member: OrgMember = {
    uid, role: 'owner', display_name: 'BrewTrax Demo', email: args.email, event_access: {},
  }
  await ref.collection('members').doc(uid).set(member)
  console.log(`  org + owner member written`)

  // Customers — findOrCreateCustomerCore mints its own ids, so map key -> id.
  const customerIds = new Map<string, string>()
  for (const c of seed.customers) {
    const { customer } = await findOrCreateCustomerCore(args.orgId, c.input)
    customerIds.set(c.key, customer.id)
  }
  console.log(`  ${customerIds.size} customers`)

  // Leads carry literal ids, so demo URLs stay stable across resets.
  for (const l of seed.leads) {
    const customerId = customerIds.get(l.customerKey)
    if (!customerId) throw new Error(`Lead ${l.key} references unknown customer ${l.customerKey}`)
    const lead: Lead = { ...l.lead, customer_id: customerId }
    await leadsRef(args.orgId).doc(lead.id).set(lead)
  }
  console.log(`  ${seed.leads.length} leads`)

  const leadIds = new Map(seed.leads.map((l) => [l.key, l.lead.id]))

  for (const t of seed.tasks) {
    const leadId = leadIds.get(t.leadKey)
    if (!leadId) throw new Error(`Task ${t.task.id} references unknown lead ${t.leadKey}`)
    const task: Task = { ...t.task, lead_id: leadId }
    await tasksRef(args.orgId, leadId).doc(task.id).set(task)
  }
  console.log(`  ${seed.tasks.length} tasks`)

  console.log(`\nDone.`)
  console.log(`  login: ${args.email} / ${args.password}`)
  console.log(`  org:   /${seed.org.slug}\n`)
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
```

- [ ] **Step 3: Verify the guard rejects a non-demo org id**

Run: `npm run seed:demo -- --org-id=acme-corp`
Expected: exits non-zero with `Refusing to touch org "acme-corp"`. Nothing is written.

- [ ] **Step 4: Run the CRM slice against the real project**

Run: `npm run seed:demo -- --reset`
Expected: prints the project id, creates the auth user, writes org + members + customers + leads + tasks, and prints the login. Confirm in the Firebase console that `orgs/demo-brewtrax` exists with 8 customers and 10 leads.

- [ ] **Step 5: Verify re-run refuses without --reset**

Run: `npm run seed:demo`
Expected: exits non-zero with `Org "demo-brewtrax" already exists. Re-run with --reset to replace it.`

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-demo.ts package.json
git commit -m "feat(seed): demo seed writer — guards, auth user, reset, CRM slice"
```

---

### Task 6: The writer — events, proposals, invoices, and ops

**Files:**
- Modify: `scripts/seed-demo.ts`

**Interfaces:**
- Consumes: everything from Task 5, plus `generateAccessToken` from `@/lib/tokens`; `buildEventSlug` from `@/lib/slug`; `createInvoiceCore`, `issueInvoiceCore`, `recordPaymentCore` from `@/lib/crm/invoices`; `createResourceCore` from `@/lib/ops/resources`; `createWorkPackageCore` from `@/lib/ops/work-packages`; `instantiateOpsPlanCore`, `getOpsPlanCore`, `completeChecklistStepCore`, `toggleDeadlineCore` from `@/lib/ops/event-ops`; `createIssueCore`, `resolveIssueCore` from `@/lib/ops/issues`; `createComplianceDocCore` from `@/lib/ops/compliance`.

- [ ] **Step 1: Add the events and proposals writes**

In `scripts/seed-demo.ts`, extend the imports:

```ts
import { generateAccessToken } from '@/lib/tokens'
import { buildEventSlug } from '@/lib/slug'
import type { Org, OrgMember, Lead, Task, Event, ItineraryItem, Proposal } from '@/lib/types'
```

Insert after the tasks loop, before the closing `console.log`:

```ts
  // Events + itinerary. The fixture's literal slug must match what the app
  // would generate, or demo URLs diverge from real ones.
  for (const e of seed.events) {
    const expected = buildEventSlug(e.event.name, e.event.year)
    if (e.event.slug !== expected) {
      throw new Error(`Event ${e.key} slug "${e.event.slug}" does not match buildEventSlug: "${expected}"`)
    }
    const eventDoc: Event = e.event
    const eventRef = ref.collection('events').doc(eventDoc.id)
    await eventRef.set(eventDoc)
    for (const item of e.itinerary) {
      const itineraryItem: ItineraryItem = item
      await eventRef.collection('itinerary').doc(itineraryItem.id).set(itineraryItem)
    }
  }
  console.log(`  ${seed.events.length} events`)

  const eventIds = new Map(seed.events.map((e) => [e.key, e.event.id]))

  // Proposals. Written directly (no guard-free core exists); token minted here.
  for (const p of seed.proposals) {
    const leadId = leadIds.get(p.leadKey)
    if (!leadId) throw new Error(`Proposal ${p.proposal.id} references unknown lead ${p.leadKey}`)
    const proposal: Proposal = {
      ...p.proposal,
      org_id: args.orgId,
      lead_id: leadId,
      token: generateAccessToken(),
    }
    await ref.collection('proposals').doc(proposal.id).set(proposal)
  }
  console.log(`  ${seed.proposals.length} proposals`)
```

- [ ] **Step 2: Add the invoice writes**

Extend the imports:

```ts
import { createInvoiceCore, issueInvoiceCore, recordPaymentCore } from '@/lib/crm/invoices'
```

Insert after the proposals loop:

```ts
  // Invoices go through the real transitions — create, issue, then pay — so
  // lifecycle, number, balance, and aging come out of production code rather
  // than being guessed at in the fixture.
  for (const inv of seed.invoices) {
    const leadId = leadIds.get(inv.leadKey)
    if (!leadId) throw new Error(`Invoice ${inv.key} references unknown lead ${inv.leadKey}`)
    const customerId = customerIds.get(inv.customerKey)
    if (!customerId) throw new Error(`Invoice ${inv.key} references unknown customer ${inv.customerKey}`)

    const created = await createInvoiceCore(args.orgId, leadId, { ...inv.input, customer_id: customerId })
    if (inv.issue) await issueInvoiceCore(args.orgId, created.id, { issuedAt: inv.issue.issuedAt })
    for (const payment of inv.payments) {
      await recordPaymentCore(args.orgId, created.id, payment)
    }
  }
  console.log(`  ${seed.invoices.length} invoices`)
```

- [ ] **Step 3: Add the ops writes**

Extend the imports:

```ts
import { createResourceCore } from '@/lib/ops/resources'
import { createWorkPackageCore } from '@/lib/ops/work-packages'
import { instantiateOpsPlanCore, completeChecklistStepCore, toggleDeadlineCore } from '@/lib/ops/event-ops'
import { createIssueCore, resolveIssueCore } from '@/lib/ops/issues'
import { createComplianceDocCore } from '@/lib/ops/compliance'
import type { WorkPackageLine } from '@/lib/types'
```

Insert after the invoices loop:

```ts
  // Ops: resources first (work package lines reference their ids), then
  // packages, then the plan derived from them.
  const resourceIds = new Map<string, string>()
  for (const r of seed.ops.resources) {
    const resource = await createResourceCore(args.orgId, r.input)
    resourceIds.set(r.key, resource.id)
  }

  const packageIds = new Map<string, string>()
  for (const p of seed.ops.workPackages) {
    const lines: WorkPackageLine[] = p.lines.map((line) => {
      if (line.kind === 'labor') return { kind: 'labor', role: line.role, count: line.count }
      const resourceId = resourceIds.get(line.resourceKey)
      if (!resourceId) throw new Error(`Work package ${p.key} references unknown resource ${line.resourceKey}`)
      return line.kind === 'consumable'
        ? { kind: 'consumable', resource_id: resourceId, qty_per_guest: line.qty_per_guest, ...(line.base_qty !== undefined ? { base_qty: line.base_qty } : {}) }
        : { kind: 'equipment', resource_id: resourceId, qty: line.qty }
    })
    // Third arg is the validation allow-list: createWorkPackageCore rejects a
    // line pointing at a resource id outside this set.
    const pkg = await createWorkPackageCore(args.orgId, {
      name: p.name, price: p.price, lines,
      ...(p.description ? { description: p.description } : {}),
      ...(p.scope ? { scope: p.scope } : {}),
      ...(p.max_guests !== undefined ? { max_guests: p.max_guests } : {}),
      ...(p.setup_minutes !== undefined ? { setup_minutes: p.setup_minutes } : {}),
      ...(p.teardown_minutes !== undefined ? { teardown_minutes: p.teardown_minutes } : {}),
    }, new Set(resourceIds.values()))
    packageIds.set(p.key, pkg.id)
  }
  console.log(`  ${resourceIds.size} resources, ${packageIds.size} work packages`)

  const planEventId = eventIds.get(seed.ops.plan.eventKey)
  if (!planEventId) throw new Error(`Ops plan references unknown event ${seed.ops.plan.eventKey}`)
  const planPackageIds = seed.ops.plan.packageKeys.map((key) => {
    const id = packageIds.get(key)
    if (!id) throw new Error(`Ops plan references unknown work package ${key}`)
    return id
  })

  const plan = await instantiateOpsPlanCore(args.orgId, planEventId, {
    package_ids: planPackageIds,
    requirements: seed.ops.plan.requirements,
    event_start: seed.events.find((e) => e.key === seed.ops.plan.eventKey)!.event.event_start,
    industry_pack_id: seed.org.industry_pack_id,
    actor_uid: uid,
  })

  // Partially complete the plan so readiness reads as in-progress, not 0% or 100%.
  let stepsRemaining = seed.ops.plan.completeStepCount
  for (const checklist of plan.checklists) {
    for (let i = 0; i < checklist.steps.length && stepsRemaining > 0; i++) {
      await completeChecklistStepCore(args.orgId, planEventId, checklist.id, i, { done: true, actor_uid: uid })
      stepsRemaining--
    }
    if (stepsRemaining === 0) break
  }
  for (const deadline of plan.deadlines.slice(0, seed.ops.plan.completeDeadlineCount)) {
    await toggleDeadlineCore(args.orgId, planEventId, deadline.id, true)
  }
  console.log(`  ops plan on event ${planEventId}`)

  for (const issue of seed.ops.issues) {
    const created = await createIssueCore(args.orgId, planEventId, {
      type: issue.type, severity: issue.severity, note: issue.note, created_by: uid,
    })
    if (issue.resolution) {
      await resolveIssueCore(args.orgId, planEventId, created.id, issue.resolution)
    }
  }

  for (const doc of seed.ops.complianceDocs) {
    await createComplianceDocCore(args.orgId, doc)
  }
  console.log(`  ${seed.ops.issues.length} issues, ${seed.ops.complianceDocs.length} compliance docs`)
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

If `plan.checklists` comes back empty, the `coffee-cart` pack's built-in templates were not resolved — check `getTemplatesForOrg(orgId, 'coffee-cart')` and whether the selected work package's `checklist_template_ids` narrows the set to nothing. The fixture deliberately sets no `checklist_template_ids`, which makes `instantiateOpsPlanCore` fall back to the full template set.

- [ ] **Step 5: Run the full seed and verify in the app**

Run: `npm run seed:demo -- --reset`
Expected: every section prints its count, ending with the login line.

Then start the dev server and log in as `demo@brewtrax.test` / `BrewTrax!Demo1`. Confirm:
- Pipeline shows leads in all five stages, one flagged as waiting.
- AR/invoices show a paid, a partial, an overdue, and a draft invoice with real numbers.
- Calendar shows three upcoming jobs and two past.
- The Oakline event's ops tab shows a readiness percentage strictly between 0 and 100.
- Compliance shows the liability certificate as expiring soon.

- [ ] **Step 6: Verify a second reset is clean**

Run: `npm run seed:demo -- --reset`
Expected: same counts as the first run — not doubled. Confirms `recursiveDelete` clears everything and the auth user is reused rather than recreated.

- [ ] **Step 7: Run the full test suite and lint**

Run: `npx vitest run --exclude '**/.claude/**'`
Expected: PASS, no regressions.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 8: Verify the production build still passes**

Run: `npm run build`
Expected: success. This catches the `'use server'` type-re-export class of failure that `tsc` alone misses — the seed adds files under `scripts/`, but run it before calling the branch green.

- [ ] **Step 9: Commit**

```bash
git add scripts/seed-demo.ts
git commit -m "feat(seed): write events, proposals, invoices, and ops in the demo seeder"
```

---

## Self-Review Notes

**Spec coverage:**
- Entry point / npm script → Task 5 Step 1.
- `demo-` prefix guard, project print, exists-check, reset-on-absent → Task 4 (pure guard) + Task 5 Steps 2–5.
- Pure builder with `today` argument → Tasks 1–3.
- Write-path table (which core for which record) → Task 5 Step 2, Task 6 Steps 1–3.
- Invoices through real transitions → Task 6 Step 2.
- Direct writes for leads/events/proposals → Task 5 Step 2, Task 6 Step 1.
- Demo auth user, reused across resets, printed at the end → Task 5 Step 2.
- All seeded content sections → Tasks 1–3.
- Test list (stage coverage, aging coverage, referential integrity, totals, date relativity) → Tasks 1–3.
- Verification steps → Task 6 Steps 5–6.

**Known gap accepted from the spec:** the spec's test list mentions recomputing proposal totals with `lib/proposals` helpers; this plan covers that for the accepted proposal's `selected_total` (Task 2) but does not recompute invoice line totals against a fixture-declared expected value, since the fixture declares line items rather than totals — `invoiceBalance` in Task 3 is the equivalent check.
