# Customer Page Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the customer page's three spec gaps — new-opportunity-from-customer, real last contact, tag editing — plus the pipeline's email-only dedup weakness.

**Architecture:** One new server seam (`CreateLeadInput.customer_id`) feeds both the customer-page dialog and a pipeline typeahead; last contact rides the existing best-effort `last_touch_at` stamp extended to customer docs; tags get the app's first editor with an org-derived suggestion list. Spec: `docs/superpowers/specs/2026-08-08-customer-page-completion-design.md`.

**Tech Stack:** Next.js App Router (READ `node_modules/next/dist/docs/` before writing page/server-action code), Firestore admin SDK, Vitest + Testing Library.

## Global Constraints

- Work in worktree `.claude/worktrees/claude+customer-page`, branch `claude/customer-page`.
- `'use server'` modules: every export must be an async function — NEVER re-export a type from one (breaks `next build`, not caught by tsc). Types live in `lib/`.
- `logActivity` stamps are best-effort telemetry: they must never throw into the caller (`.catch(() => {})`).
- Firestore writes never include `undefined` values — use conditional spreads, matching existing style.
- Run tests per-file during tasks; whole-suite + `npx tsc --noEmit` + `npm run build` only in Task 8.
- Commit after every task with the exact message given.

## File Structure

- `lib/crm/customers.ts` — gains `normalizeTags` (pure) and `getCustomerCore` (guard-free read)
- `lib/activity.ts` — customer-doc `last_touch_at` stamp
- `lib/types.ts` — `Customer.last_touch_at?`
- `lib/crm/customer-rollup.ts` — signature `(customer, leads)`, field `lastContactAt`
- `actions/leads.ts` — `CreateLeadInput.customer_id?`, linked-mode branch
- `actions/customers.ts` — `getCustomer` delegates to core; `updateCustomer` normalizes tags
- `components/admin/pipeline/NewOpportunityForm.tsx` — linked mode + picker slot
- `components/admin/pipeline/CustomerPicker.tsx` — new combobox
- `components/admin/pipeline/PipelineListClient.tsx` + `app/(admin)/[orgSlug]/leads/page.tsx` — pass customers through
- `components/admin/TagEditor.tsx` — new
- `components/admin/CustomerDetailClient.tsx` + `components/admin/ClientsTable.tsx` + both clients pages — wiring + labels

---

### Task 1: Worktree setup + `normalizeTags`

**Files:**
- Modify: `lib/crm/customers.ts`
- Test: `__tests__/lib/crm/customer-tags.test.ts` (create)

**Interfaces:**
- Produces: `normalizeTags(tags: string[]): string[]` — trim, drop empties, dedupe case-insensitively keeping first-seen casing. Used by Task 7.

- [ ] **Step 1: Setup** (fresh worktree needs deps + env):

```bash
cd /Users/rm/vw/traxevent/.claude/worktrees/claude+customer-page
npm install
cp /Users/rm/vw/traxevent/.env.local .env.local
```

- [ ] **Step 2: Write the failing test** — create `__tests__/lib/crm/customer-tags.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeTags } from '@/lib/crm/customers'

describe('normalizeTags', () => {
  it('trims whitespace and drops empty entries', () => {
    expect(normalizeTags(['  vip ', '', '   '])).toEqual(['vip'])
  })
  it('dedupes case-insensitively, keeping first-seen casing', () => {
    expect(normalizeTags(['VIP', 'vip', 'Repeat', 'repeat'])).toEqual(['VIP', 'Repeat'])
  })
  it('returns [] for []', () => {
    expect(normalizeTags([])).toEqual([])
  })
})
```

- [ ] **Step 3: Run to verify failure** — `npx vitest run __tests__/lib/crm/customer-tags.test.ts` → FAIL (`normalizeTags` not exported).

- [ ] **Step 4: Implement** — append to `lib/crm/customers.ts`:

```ts
/** Trim, drop empties, dedupe case-insensitively (first-seen casing wins). */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const t = raw.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}
```

- [ ] **Step 5: Run to verify pass** — same command → PASS.

- [ ] **Step 6: Commit** — `feat(crm): normalizeTags for customer tag editing`

---

### Task 2: `getCustomerCore` + customer `last_touch_at` stamp

**Files:**
- Modify: `lib/crm/customers.ts`, `lib/activity.ts`, `lib/types.ts:431-442` (Customer), `actions/customers.ts:20-24` (getCustomer)
- Test: `__tests__/lib/activity-stamp.test.ts` (create), `__tests__/actions/customers.test.ts` (unchanged — verify still green)

**Interfaces:**
- Produces: `getCustomerCore(orgId: string, customerId: string): Promise<Customer | null>` (guard-free; Task 4 consumes). `Customer.last_touch_at?: string` (Task 3 consumes). `logActivity` now stamps `customers/{parent_id}.last_touch_at` for `parent_type === 'customer'`.

- [ ] **Step 1: Write the failing tests** — create `__tests__/lib/activity-stamp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Everything the mock factory touches must be vi.hoisted — a plain module-level
// const is in TDZ when the hoisted factory first runs (the reason every action
// test in this repo uses vi.hoisted for its spies).
const docs = vi.hoisted(() => ({
  activity: { set: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined) },
  leads: { set: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined) },
  customers: { set: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined) },
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        collection: (name: string) => ({ doc: () => docs[name as keyof typeof docs] }),
      }),
    }),
  },
}))

import { logActivity } from '@/lib/activity'

describe('logActivity last_touch_at stamps', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stamps the customer doc for a customer-parented event', async () => {
    await logActivity('o1', { parent_type: 'customer', parent_id: 'c1', kind: 'note', summary: 's' })
    expect(docs.customers.update).toHaveBeenCalledWith({ last_touch_at: expect.any(String) })
    expect(docs.leads.update).not.toHaveBeenCalled()
  })

  it('still stamps the lead doc for an opportunity-parented event', async () => {
    await logActivity('o1', { parent_type: 'opportunity', parent_id: 'l1', kind: 'note', summary: 's' })
    expect(docs.leads.update).toHaveBeenCalledWith({ last_touch_at: expect.any(String) })
    expect(docs.customers.update).not.toHaveBeenCalled()
  })

  it('never throws when the customer stamp fails (best-effort contract)', async () => {
    docs.customers.update.mockRejectedValueOnce(new Error('boom'))
    await expect(
      logActivity('o1', { parent_type: 'customer', parent_id: 'c1', kind: 'note', summary: 's' })
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/lib/activity-stamp.test.ts` → the customer-stamp and never-throws tests FAIL (`customers.update` not called).

- [ ] **Step 3: Implement.**

In `lib/types.ts`, inside `interface Customer` after `notes?: string`:

```ts
  last_touch_at?: string   // ISO; stamped by logActivity, mirrors Lead.last_touch_at
```

In `lib/activity.ts`, after the existing `if (e.parent_type === 'opportunity') {...}` block, add:

```ts
    if (e.parent_type === 'customer') {
      // Same denormalized freshness signal for the client list; best-effort.
      await adminDb.collection('orgs').doc(orgId).collection('customers')
        .doc(e.parent_id).update({ last_touch_at: created_at })
        .catch(() => {})
    }
```

In `lib/crm/customers.ts`, add:

```ts
/** Guard-free customer read. Authorization is the caller's responsibility. */
export async function getCustomerCore(orgId: string, customerId: string): Promise<Customer | null> {
  const snap = await customersRef(orgId).doc(customerId).get()
  return snap.exists ? (snap.data() as Customer) : null
}
```

In `actions/customers.ts`, make `getCustomer` delegate (import `getCustomerCore` alongside the existing `lib/crm/customers` imports):

```ts
export async function getCustomer(orgId: string, customerId: string): Promise<Customer | null> {
  await assertOrgMember(orgId)
  return getCustomerCore(orgId, customerId)
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run __tests__/lib/activity-stamp.test.ts __tests__/actions/customers.test.ts __tests__/actions/activity.test.ts` → PASS.

- [ ] **Step 5: Commit** — `feat(crm): stamp customer last_touch_at on customer-parented activity`

---

### Task 3: `rollupCustomer(customer, leads)` → `lastContactAt`

**Files:**
- Modify: `lib/crm/customer-rollup.ts`, `components/admin/CustomerDetailClient.tsx:156-161` (tile), `components/admin/ClientsTable.tsx:28,44` (column), `app/(admin)/[orgSlug]/clients/page.tsx:26`, `app/(admin)/[orgSlug]/clients/[customerId]/page.tsx:34`
- Test: `__tests__/lib/crm/customer-rollup.test.ts`, `__tests__/components/admin/CustomerDetailClient.test.tsx`, `__tests__/components/admin/ClientsTable.test.tsx`

**Interfaces:**
- Produces: `rollupCustomer(customer: Pick<Customer, 'last_touch_at'>, leads: Lead[]): CustomerRollup`; `CustomerRollup.lastContactAt?: string` replaces `lastActivityAt`. UI label is "Last contact".

- [ ] **Step 1: Update the pure tests** — in `__tests__/lib/crm/customer-rollup.test.ts`, change every `rollupCustomer([...])` call to `rollupCustomer({}, [...])`, rename `lastActivityAt` → `lastContactAt` in assertions, retitle the freshness test, and add two cases:

```ts
  it('prefers a lead last_touch_at over updated_at/created_at', () => {
    const r = rollupCustomer({}, [
      lead({ created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-02-01T00:00:00.000Z', last_touch_at: '2026-04-01T00:00:00.000Z' }),
    ])
    expect(r.lastContactAt).toBe('2026-04-01T00:00:00.000Z')
  })

  it('counts a customer-level touch with no opportunities at all', () => {
    const r = rollupCustomer({ last_touch_at: '2026-05-01T00:00:00.000Z' }, [])
    expect(r.lastContactAt).toBe('2026-05-01T00:00:00.000Z')
  })
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/lib/crm/customer-rollup.test.ts` → FAIL (signature + field name).

- [ ] **Step 3: Implement** — in `lib/crm/customer-rollup.ts`, rename the interface field to `lastContactAt?: string`, import `Customer` from `@/lib/types`, and replace the function:

```ts
/** Repeat-business summary across every opportunity belonging to one customer. */
export function rollupCustomer(customer: Pick<Customer, 'last_touch_at'>, leads: Lead[]): CustomerRollup {
  const isOpen = (s: LeadStage) => (OPEN_STAGES as LeadStage[]).includes(s)
  const value = (l: Lead) => l.estimated_value ?? 0
  const open = leads.filter((l) => isOpen(l.stage))
  const won = leads.filter((l) => l.stage === 'closed_won')
  const touches = [customer.last_touch_at, ...leads.map((l) => l.last_touch_at ?? l.updated_at ?? l.created_at)]
    .filter((t): t is string => Boolean(t))
    .sort()
  return {
    openCount: open.length,
    wonCount: won.length,
    lostCount: leads.filter((l) => l.stage === 'closed_lost').length,
    totalWonValue: won.reduce((n, l) => n + value(l), 0),
    openValue: open.reduce((n, l) => n + value(l), 0),
    lastContactAt: touches[touches.length - 1],
  }
}
```

- [ ] **Step 4: Update the callers.**

`app/(admin)/[orgSlug]/clients/page.tsx` line 26: `rollup: rollupCustomer(customer, byCustomer.get(customer.id) ?? [])`.
`app/(admin)/[orgSlug]/clients/[customerId]/page.tsx` line 34: `rollup={rollupCustomer(customer, opportunities)}`.
`components/admin/CustomerDetailClient.tsx` tile (lines 156-161): label `Last update` → `Last contact`, `rollup.lastActivityAt` → `rollup.lastContactAt` (both occurrences).
`components/admin/ClientsTable.tsx`: header cell `Last update` → `Last contact` (line 28), `rollup.lastActivityAt` → `rollup.lastContactAt` (line 44).

- [ ] **Step 5: Update the component tests** — in `__tests__/components/admin/CustomerDetailClient.test.tsx` and `__tests__/components/admin/ClientsTable.test.tsx`, replace every `lastActivityAt` with `lastContactAt` and every `'Last update'` / `Last update` string with `Last contact` (test titles included).

- [ ] **Step 6: Run to verify pass** — `npx vitest run __tests__/lib/crm/customer-rollup.test.ts __tests__/components/admin/CustomerDetailClient.test.tsx __tests__/components/admin/ClientsTable.test.tsx` → PASS. Then `npx tsc --noEmit` to catch any missed `lastActivityAt` reference; fix any it reports the same way.

- [ ] **Step 7: Commit** — `feat(crm): real last-contact rollup from touch stamps`

---

### Task 4: `createLead` linked mode

**Files:**
- Modify: `actions/leads.ts:16-71`
- Test: `__tests__/actions/leads.test.ts`

**Interfaces:**
- Consumes: `getCustomerCore` (Task 2).
- Produces: `CreateLeadInput` with `name?: string` (required only when unlinked) and `customer_id?: string`; linked mode copies the customer's contact snapshot onto the lead. Tasks 5–6 consume.

- [ ] **Step 1: Write the failing tests** — in `__tests__/actions/leads.test.ts`: add a hoisted mock next to `findOrCreateCustomerCore` (line 9) and extend the module mock (line 48):

```ts
const getCustomerCore = vi.hoisted(() => vi.fn())
```

```ts
vi.mock('@/lib/crm/customers', () => ({ findOrCreateCustomerCore, getCustomerCore }))
```

Append a describe block:

```ts
describe('createLead linked mode (customer_id)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('copies the customer contact snapshot and skips find-or-create', async () => {
    getCustomerCore.mockResolvedValue({
      id: 'c9', name: 'Dana Kim', company: 'Riverside', email: 'dana@riv.co', phone: '555-1234', created_at: 'x',
    })
    const lead = await createLead('o1', { customer_id: 'c9', title: 'Fall gala' })
    expect(getCustomerCore).toHaveBeenCalledWith('o1', 'c9')
    expect(findOrCreateCustomerCore).not.toHaveBeenCalled()
    expect(leadDocSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: 'c9', name: 'Dana Kim', email: 'dana@riv.co', phone: '555-1234', organization: 'Riverside', title: 'Fall gala',
    }))
    expect(lead.customer_id).toBe('c9')
  })

  it('omits contact fields the customer does not have', async () => {
    getCustomerCore.mockResolvedValue({ id: 'c9', name: 'Walk-in', created_at: 'x' })
    await createLead('o1', { customer_id: 'c9' })
    const written = leadDocSetSpy.mock.calls[0][0]
    expect(written).not.toHaveProperty('email')
    expect(written).not.toHaveProperty('phone')
    expect(written).not.toHaveProperty('organization')
  })

  it('throws Customer not found for an unknown id and writes nothing', async () => {
    getCustomerCore.mockResolvedValue(null)
    await expect(createLead('o1', { customer_id: 'nope' })).rejects.toThrow('Customer not found')
    expect(leadDocSetSpy).not.toHaveBeenCalled()
  })

  it('still requires a name when no customer_id is given', async () => {
    await expect(createLead('o1', {})).rejects.toThrow('Name is required')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/actions/leads.test.ts` → new block FAILS (`customer_id` not in `CreateLeadInput` / name required).

- [ ] **Step 3: Implement** — in `actions/leads.ts`: import `getCustomerCore` alongside `findOrCreateCustomerCore`; change `CreateLeadInput`'s first lines to:

```ts
export interface CreateLeadInput {
  name?: string          // required unless customer_id is present
  customer_id?: string   // link to an existing customer; contact snapshot is copied from it
```

Replace the body of `createLead` from the name check through the `...(input.organization...)` spread with:

```ts
  const stage = input.stage ?? 'inquiry'
  if (!LEAD_STAGES.includes(stage)) throw new Error('Invalid stage')

  let customer: Customer   // add Customer to the type import on line 10
  if (input.customer_id) {
    const found = await getCustomerCore(orgId, input.customer_id)
    if (!found) throw new Error('Customer not found')
    customer = found
  } else {
    if (!input.name?.trim()) throw new Error('Name is required')
    customer = (await findOrCreateCustomerCore(orgId, {
      name: input.name.trim(),
      ...(input.organization?.trim() ? { company: input.organization.trim() } : {}),
      ...(input.email?.trim() ? { email: input.email.trim() } : {}),
      ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    })).customer
  }

  // Linked mode snapshots contact fields from the customer record; unlinked keeps the typed values.
  const contact = input.customer_id
    ? {
        name: customer.name,
        ...(customer.email ? { email: customer.email } : {}),
        ...(customer.phone ? { phone: customer.phone } : {}),
        ...(customer.company ? { organization: customer.company } : {}),
      }
    : {
        name: input.name!.trim(),
        ...(input.email?.trim() ? { email: input.email.trim() } : {}),
        ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
        ...(input.organization?.trim() ? { organization: input.organization.trim() } : {}),
      }

  const id = randomBytes(8).toString('hex')
  const lead: Lead = {
    id,
    ...contact,
    stage,
    created_at: new Date().toISOString(),
    customer_id: customer.id,
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.event_type?.trim() ? { event_type: input.event_type.trim() } : {}),
    ...(input.event_date?.trim() ? { event_date: input.event_date.trim() } : {}),
    ...(input.estimated_value != null ? { estimated_value: input.estimated_value } : {}),
    ...(input.guest_count != null ? { guest_count: input.guest_count } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await leadsRef(orgId).doc(id).set(lead)
  return lead
```

(The `assertOrgAdmin` line above this stays.)

- [ ] **Step 4: Run to verify pass** — `npx vitest run __tests__/actions/leads.test.ts` → PASS (whole file: existing unlinked tests must stay green).

- [ ] **Step 5: Commit** — `feat(crm): createLead linked mode — customer_id skips find-or-create`

---

### Task 5: `NewOpportunityForm` linked mode + customer-page entry

**Files:**
- Modify: `components/admin/pipeline/NewOpportunityForm.tsx`, `components/admin/CustomerDetailClient.tsx`
- Test: `__tests__/components/admin/pipeline/new-opportunity-form-linked.test.tsx` (create), `__tests__/components/admin/CustomerDetailClient.test.tsx` (append)

**Interfaces:**
- Consumes: `createLead` linked mode (Task 4).
- Produces: `NewOpportunityFormProps` gains `customer?: Customer` (linked mode: contact inputs hidden, submits `customer_id`). Customer page gains a `New opportunity` button toggling the form.

- [ ] **Step 1: Write the failing tests** — create `__tests__/components/admin/pipeline/new-opportunity-form-linked.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NewOpportunityForm } from '@/components/admin/pipeline/NewOpportunityForm'
import { createLead } from '@/actions/leads'
import type { Customer } from '@/lib/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
// 'use server' module backed by firebase-admin — mocked like CustomerDetailClient.test.tsx does.
vi.mock('@/actions/leads', () => ({ createLead: vi.fn().mockResolvedValue({ id: 'l1' }) }))

const customer: Customer = {
  id: 'c1', name: 'Dana Kim', company: 'Riverside', email: 'dana@riv.co', created_at: '2026-01-01T00:00:00.000Z',
}

describe('NewOpportunityForm linked mode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('hides contact inputs and shows who it is for', () => {
    render(<NewOpportunityForm orgId="o1" open onClose={() => {}} customer={customer} />)
    expect(screen.getByText(/for dana kim/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Organization')).not.toBeInTheDocument()
  })

  it('submits customer_id without contact fields and can save with no name typed', async () => {
    render(<NewOpportunityForm orgId="o1" open onClose={() => {}} customer={customer} />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Fall gala' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(createLead).toHaveBeenCalledWith('o1', expect.objectContaining({
      customer_id: 'c1', title: 'Fall gala',
    })))
    const input = vi.mocked(createLead).mock.calls[0][1]
    expect(input).not.toHaveProperty('name')
    expect(input).not.toHaveProperty('email')
  })

  it('still requires a name in standalone mode', () => {
    render(<NewOpportunityForm orgId="o1" open onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
```

Append to `__tests__/components/admin/CustomerDetailClient.test.tsx` (top of file: extend the actions mock list with `vi.mock('@/actions/leads', () => ({ createLead: vi.fn().mockResolvedValue({ id: 'l9' }) }))`):

```tsx
  it('opens a linked new-opportunity form from the header button', () => {
    render(<CustomerDetailClient {...props} />)
    expect(screen.queryByText(/for dana kim/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New opportunity' }))
    expect(screen.getByText(/for dana kim/i)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/components/admin/pipeline/new-opportunity-form-linked.test.tsx __tests__/components/admin/CustomerDetailClient.test.tsx` → FAIL (no `customer` prop / no button).

- [ ] **Step 3: Implement.**

`NewOpportunityForm.tsx`: add to props `customer?: Customer` (import the type). Inside the component:

```ts
const linked = customer ?? null
```

- In `handleCreate`, replace the name guard with `if (!linked && !name.trim()) { setError('Name is required.'); return }`, and build the input as:

```ts
      await createLead(orgId, {
        ...(linked
          ? { customer_id: linked.id }
          : {
              name: name.trim(),
              organization: organization.trim() || undefined,
              email: email.trim() || undefined,
              phone: phone.trim() || undefined,
            }),
        title: title.trim() || undefined,
        event_type: eventType.trim() || undefined,
        event_date: eventDate.trim() || undefined,
        notes: notes.trim() || undefined,
        ...(parsedValue != null && !Number.isNaN(parsedValue) ? { estimated_value: parsedValue } : {}),
        ...(parsedGuests != null && !Number.isNaN(parsedGuests) ? { guest_count: parsedGuests } : {}),
      })
```

- In the JSX, wrap the four contact field divs (Name, Organization, Email, Phone) in `{!linked && (<>...</>)}` and, when linked, render above Title:

```tsx
        {linked && (
          <p className="text-sm text-muted-foreground">
            For {linked.name}{linked.company ? ` · ${linked.company}` : ''}
          </p>
        )}
```

- Save button disabled: `disabled={saving || (!linked && !name.trim())}`.

`CustomerDetailClient.tsx`: import `NewOpportunityForm` and add `const [creating, setCreating] = useState(false)`. In the header action row (next to Email/Call), add:

```tsx
          <Button size="sm" onClick={() => setCreating(true)}>New opportunity</Button>
```

Directly under the header block, render:

```tsx
      <NewOpportunityForm orgId={orgId} open={creating} onClose={() => setCreating(false)} customer={customer} />
```

- [ ] **Step 4: Run to verify pass** — same command → PASS (plus `npx vitest run __tests__/components/pipeline-list.test.tsx` to confirm standalone use is untouched).

- [ ] **Step 5: Commit** — `feat(crm): new opportunity from the customer page — linked form mode`

---

### Task 6: `CustomerPicker` in the pipeline form

**Files:**
- Create: `components/admin/pipeline/CustomerPicker.tsx`
- Modify: `components/admin/pipeline/NewOpportunityForm.tsx`, `components/admin/pipeline/PipelineListClient.tsx` (props + passthrough), `app/(admin)/[orgSlug]/leads/page.tsx:41-47`
- Test: `__tests__/components/admin/pipeline/customer-picker.test.tsx` (create)

**Interfaces:**
- Consumes: `listCustomers` (existing action), linked-mode internals from Task 5.
- Produces: `CustomerPicker({ customers, value, onChange })`; `NewOpportunityFormProps.customers?: Customer[]`; `PipelineListClient` props gain `customers?: Customer[]`.

- [ ] **Step 1: Write the failing test** — create `__tests__/components/admin/pipeline/customer-picker.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CustomerPicker } from '@/components/admin/pipeline/CustomerPicker'
import type { Customer } from '@/lib/types'

const customers: Customer[] = [
  { id: 'c1', name: 'Dana Kim', company: 'Riverside', email: 'dana@riv.co', created_at: 'x' },
  { id: 'c2', name: 'Sam Ortiz', created_at: 'x' },
]

describe('CustomerPicker', () => {
  it('filters by name, company, or email as you type', () => {
    render(<CustomerPicker customers={customers} value={null} onChange={() => {}} />)
    fireEvent.change(screen.getByLabelText(/link to existing customer/i), { target: { value: 'riv' } })
    expect(screen.getByRole('button', { name: /dana kim/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sam ortiz/i })).not.toBeInTheDocument()
  })

  it('reports the picked customer and clears', () => {
    const onChange = vi.fn()
    const { rerender } = render(<CustomerPicker customers={customers} value={null} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/link to existing customer/i), { target: { value: 'sam' } })
    fireEvent.click(screen.getByRole('button', { name: /sam ortiz/i }))
    expect(onChange).toHaveBeenCalledWith(customers[1])
    rerender(<CustomerPicker customers={customers} value={customers[1]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/components/admin/pipeline/customer-picker.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement** — create `components/admin/pipeline/CustomerPicker.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Customer } from '@/lib/types'

interface CustomerPickerProps {
  customers: Customer[]
  value: Customer | null
  onChange: (customer: Customer | null) => void
}

export function CustomerPicker({ customers, value, onChange }: CustomerPickerProps) {
  const [query, setQuery] = useState('')

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
        <span>
          Linked to <span className="font-medium">{value.name}</span>
          {value.company ? ` · ${value.company}` : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Clear</Button>
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const matches = q
    ? customers.filter((c) =>
        [c.name, c.company, c.email].some((f) => f?.toLowerCase().includes(q))
      ).slice(0, 8)
    : []

  return (
    <div className="space-y-1">
      <Label htmlFor="customerPicker">Link to existing customer (optional)</Label>
      <Input
        id="customerPicker"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search clients by name, company, or email"
      />
      {matches.length > 0 && (
        <ul className="rounded-md border border-border divide-y">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => { onChange(c); setQuery('') }}
              >
                {c.name}
                {c.company ? ` · ${c.company}` : ''}
                {c.email ? ` · ${c.email}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

`NewOpportunityForm.tsx`: add prop `customers?: Customer[]`, state `const [picked, setPicked] = useState<Customer | null>(null)`, and change the linked derivation to `const linked = customer ?? picked`. When standalone with customers available, render above the contact fields:

```tsx
        {!customer && customers && customers.length > 0 && (
          <CustomerPicker customers={customers} value={picked} onChange={setPicked} />
        )}
```

Reset `picked` in `resetForm()` (`setPicked(null)` — only when `!customer`; unconditional is also fine since linked mode ignores it). The "For {name}" line from Task 5 now also appears when `picked` is set (it keys off `linked`), which is the desired collapsed-contact display.

`PipelineListClient.tsx`: add `customers?: Customer[]` to its props interface (import the type) and pass `customers={customers}` to `<NewOpportunityForm ...>` (line 139).

`app/(admin)/[orgSlug]/leads/page.tsx`: import `listCustomers` from `@/actions/customers`, load `const customers = await listCustomers(orgId)` alongside `listLeads` in a `Promise.all`, and pass `customers={customers}` to `<PipelineListClient ...>` only (the board view has no create form).

- [ ] **Step 4: Run to verify pass** — `npx vitest run __tests__/components/admin/pipeline/customer-picker.test.tsx __tests__/components/admin/pipeline/new-opportunity-form-linked.test.tsx __tests__/components/pipeline-list.test.tsx` → PASS.

- [ ] **Step 5: Commit** — `feat(crm): customer typeahead in the pipeline new-opportunity form`

---

### Task 7: `TagEditor` + server-side tag normalization

**Files:**
- Create: `components/admin/TagEditor.tsx`
- Modify: `actions/customers.ts:45-57` (normalize tags), `components/admin/CustomerDetailClient.tsx:86-90` (replace badge row), `app/(admin)/[orgSlug]/clients/[customerId]/page.tsx` (suggestions)
- Test: `__tests__/components/admin/TagEditor.test.tsx` (create), `__tests__/actions/customers.test.ts` (append)

**Interfaces:**
- Consumes: `normalizeTags` (Task 1), `updateCustomer` (existing — `CustomerUpdate.tags?: string[] | null` already exists).
- Produces: `TagEditor({ tags, suggestions, onSave })` where `onSave(next: string[]): Promise<void>`; `CustomerDetailClient` props gain `orgTags: string[]`.

- [ ] **Step 1: Write the failing tests.**

Create `__tests__/components/admin/TagEditor.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TagEditor } from '@/components/admin/TagEditor'

describe('TagEditor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds a typed tag on Enter', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TagEditor tags={['vip']} suggestions={[]} onSave={onSave} />)
    const input = screen.getByLabelText('Add tag')
    fireEvent.change(input, { target: { value: 'repeat' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(['vip', 'repeat']))
  })

  it('removes a tag via its remove button', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TagEditor tags={['vip', 'repeat']} suggestions={[]} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove vip' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(['repeat']))
  })

  it('suggests existing org tags matching the input, excluding ones already applied', () => {
    render(<TagEditor tags={['vip']} suggestions={['vip', 'venue-partner', 'repeat']} onSave={vi.fn()} />)
    const input = screen.getByLabelText('Add tag')
    fireEvent.change(input, { target: { value: 've' } })
    expect(screen.getByRole('button', { name: 'venue-partner' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'vip' })).not.toBeInTheDocument()
  })

  it('adds a suggestion on click', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TagEditor tags={[]} suggestions={['repeat']} onSave={onSave} />)
    fireEvent.change(screen.getByLabelText('Add tag'), { target: { value: 'rep' } })
    fireEvent.click(screen.getByRole('button', { name: 'repeat' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(['repeat']))
  })
})
```

Append to `__tests__/actions/customers.test.ts`:

```ts
describe('updateCustomer tag normalization', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normalizes tags before writing', async () => {
    await updateCustomer('o1', 'c1', { tags: ['  VIP ', 'vip', '', 'repeat'] })
    expect(custDoc.update).toHaveBeenCalledWith(expect.objectContaining({ tags: ['VIP', 'repeat'] }))
  })

  it('clears tags with a delete sentinel on null', async () => {
    await updateCustomer('o1', 'c1', { tags: null })
    const written = custDoc.update.mock.calls[0][0]
    expect(written.tags).toBeInstanceOf(Object) // FieldValue.delete() sentinel
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/components/admin/TagEditor.test.tsx __tests__/actions/customers.test.ts` → FAIL (module not found / raw tags written).

- [ ] **Step 3: Implement.**

`actions/customers.ts`: import `normalizeTags` from `@/lib/crm/customers`; in `updateCustomer`, after the cleaning loop add:

```ts
  if (Array.isArray(updates.tags)) cleaned.tags = normalizeTags(updates.tags)
```

Create `components/admin/TagEditor.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TagEditorProps {
  tags: string[]
  suggestions: string[]
  onSave: (next: string[]) => Promise<void>
}

export function TagEditor({ tags, suggestions, onSave }: TagEditorProps) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(next: string[]) {
    setBusy(true); setError(null)
    try { await onSave(next) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not save tags') }
    finally { setBusy(false) }
  }

  async function add(tag: string) {
    const t = tag.trim()
    if (!t || tags.some((x) => x.toLowerCase() === t.toLowerCase())) { setDraft(''); return }
    setDraft('')
    await save([...tags, t])
  }

  const q = draft.trim().toLowerCase()
  const matches = q
    ? suggestions.filter(
        (s) => s.toLowerCase().includes(q) && !tags.some((t) => t.toLowerCase() === s.toLowerCase())
      ).slice(0, 6)
    : []

  return (
    <div className="mt-2 space-y-1">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1">
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              className="hover:text-destructive"
              disabled={busy}
              onClick={() => save(tags.filter((x) => x !== t))}
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
      <div className="max-w-56 space-y-1">
        <Label htmlFor="addTag" className="sr-only">Add tag</Label>
        <Input
          id="addTag"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(draft) } }}
          placeholder="Add tag…"
          className="h-7 text-sm"
        />
        {matches.length > 0 && (
          <ul className="rounded-md border border-border divide-y">
            {matches.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className="w-full px-2 py-1 text-left text-sm hover:bg-muted"
                  onClick={() => void add(s)}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

`CustomerDetailClient.tsx`: add `orgTags: string[]` to props; replace the read-only badge row (the `{tags.length > 0 && ...}` block, lines 86-90) with:

```tsx
          <TagEditor
            tags={tags}
            suggestions={orgTags}
            onSave={async (next) => {
              await updateCustomer(orgId, customer.id, { tags: next })
              router.refresh()
            }}
          />
```

(`const tags = customer.tags ?? []` already exists; `updateCustomer` is already imported.)

`app/(admin)/[orgSlug]/clients/[customerId]/page.tsx`: import `listCustomers` from `@/actions/customers`, `listLeads` from `@/actions/leads`, and `normalizeTags` from `@/lib/crm/customers`. Replace the existing `Promise.all` destructure with:

```ts
  const [opportunities, notes, allCustomers, allLeads] = await Promise.all([
    listCustomerOpportunities(orgId, customerId),
    listNotes(orgId, 'customer', customerId),
    listCustomers(orgId),
    listLeads(orgId),
  ])
  const orgTags = normalizeTags([
    ...allCustomers.flatMap((c) => c.tags ?? []),
    ...allLeads.flatMap((l) => l.tags ?? []),
  ])
```

Pass `orgTags={orgTags}` to `CustomerDetailClient`.

- [ ] **Step 4: Update the existing component test's props** — `__tests__/components/admin/CustomerDetailClient.test.tsx` `props` object gains `orgTags: []` (tsc will flag it otherwise). The "shows the customer identity and tags" test still passes: the badge text renders inside `TagEditor`.

- [ ] **Step 5: Run to verify pass** — `npx vitest run __tests__/components/admin/TagEditor.test.tsx __tests__/actions/customers.test.ts __tests__/components/admin/CustomerDetailClient.test.tsx` → PASS.

- [ ] **Step 6: Commit** — `feat(crm): tag editor with org-derived autocomplete on the customer page`

---

### Task 8: Whole-branch gates + PR

**Files:** none new.

- [ ] **Step 1: Type check** — `npx tsc --noEmit` → clean.
- [ ] **Step 2: Full suite** — `npx vitest run --exclude '**/.claude/**'` → all green.
- [ ] **Step 3: Build** — `npm run build` → succeeds (catches any `'use server'` type re-export; see Global Constraints).
- [ ] **Step 4: Fix anything the gates surface**, amend or add commits per fix.
- [ ] **Step 5: Push + PR** (the default `gh` account 403s on this repo):

```bash
gh auth switch --user Lifewithmo
git push -u origin claude/customer-page
gh pr create --title "feat(crm): customer page completion — linked opportunities, last contact, tags" --body "Closes the customer-page gaps vs the CRM V1 spec: new-opportunity-from-customer (linked createLead mode + pipeline typeahead), real last-contact via customer/lead touch stamps, tag editor with org-derived autocomplete. Spec: docs/superpowers/specs/2026-08-08-customer-page-completion-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 6: Report** — summarize gate output + PR link; note that a manual browser walk (customer page → new opportunity → pipeline picker → tags) has not been run unless it was.
