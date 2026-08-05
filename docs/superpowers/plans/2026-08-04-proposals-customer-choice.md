# Proposals — "Let the customer choose" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the proposal from a flat line-item list into a structured, selectable offer — good-better-best packages + required/optional line items with discount/tax/deposit terms — that the customer chooses from on the public page, capturing the choice as a server-recomputed immutable snapshot.

**Architecture:** Additive, back-compatible changes to the existing proposal stack (`lib/types.ts`, `lib/proposals.ts`, `actions/proposals.ts`, `actions/proposals-public.ts`, and the two existing components). New proposal fields are all optional so existing docs stay valid; the accepted total is always recomputed on the server from the proposal's own data. Pure money math lives in `lib/proposals.ts`; the two UI components are evolved, not rewritten. No new routes.

**Tech Stack:** Next.js 16 App Router (server actions; `params` is a Promise), React 19, Firebase Admin (Firestore), Vitest. UI primitives: `@/components/ui/{card,button,input,label,badge}` + native `<input type="checkbox">` / `<textarea>` (consistent with the existing editor).

## Global Constraints

- **This is NOT stock Next.js** — consult `node_modules/next/dist/docs/` before any routing work (none expected in this plan).
- **Work only in** `/Users/rm/vw/traxevent/.claude/worktrees/proposals` on branch `claude/proposals`. Confirm the branch before every commit. **Never commit to `main`.**
- **Do not hard-code `closed_won`.** This branch is off `main`; the won stage is `'booked'`. Accepting a proposal advances the opportunity to `'booked'` (existing behavior).
- New proposal fields are **optional-typed** for back-compat: readers treat a missing `optional` as `false` (required) and never depend on a line item's `id` except to resolve a customer selection.
- Money rounds to cents via the existing `round2` helper; totals are **server-authoritative** — the public accept path recomputes from the stored proposal, never from a client-supplied total.
- Tests mock `@/lib/firebase-admin` / `@/lib/auth/assert` with `vi.hoisted` spies — follow the existing `__tests__/actions/proposals*.test.ts` style. `@/lib/proposals` is a pure module (no `server-only`) and runs un-mocked in tests.
- Green gate each task: `npx tsc --noEmit` clean **and** `npm test` green. If the suite shows `server-only` load failures, run `npm install` first (a node_modules sync quirk in a fresh worktree, not a real failure).
- Activity logging is a **marked hook only**: leave `// TODO(activity): …` at send/accept/decline points; `ActivityEvent` does not exist on `main`, so wire nothing.

---

### Task 1: Proposal types + money helpers

**Files:**
- Modify: `lib/types.ts` (Proposal types block, ~line 391–410)
- Modify: `lib/proposals.ts`
- Test: `__tests__/lib/proposals.test.ts` (extend)

**Interfaces:**
- Consumes: existing `round2`, `lineItemSubtotal`, `proposalTotal` in `lib/proposals.ts`.
- Produces:
  - Types: `ProposalPackage { id: string; name: string; description?: string; includes: string[]; price: number; recommended?: boolean }`; `ProposalLineItem` gains `id?: string`, `optional?: boolean`, `taxable?: boolean`; `ProposalDiscount { type: 'percent'|'fixed'; value: number }`; `ProposalDeposit { type: 'percent'|'fixed'; value: number }`; `ProposalSelection { package_id?: string; optional_item_ids: string[]; selected_total: number; selected_at: string }`; `Proposal` gains `packages?`, `discount?`, `tax_rate?`, `deposit?`, `expires_at?`, `selection?`.
  - Functions: `computeSelectedTotal(proposal, selection): number`, `proposalRange(proposal): { min: number; max: number }`, `discountAmount(subtotal, discount?): number`, `depositAmount(total, deposit?): number`.

- [ ] **Step 1: Write the failing test** — append to `__tests__/lib/proposals.test.ts`:

```typescript
import {
  computeSelectedTotal,
  proposalRange,
  discountAmount,
  depositAmount,
} from '@/lib/proposals'
import type { Proposal } from '@/lib/types'

const req = (id: string, quantity: number, unit_price: number): ProposalLineItem => ({
  id, description: id, quantity, unit_price, optional: false,
})
const opt = (id: string, quantity: number, unit_price: number): ProposalLineItem => ({
  id, description: id, quantity, unit_price, optional: true,
})
const prop = (over: Partial<Proposal>): Proposal => ({
  id: 'p', org_id: 'o', lead_id: 'l', token: 't', status: 'sent',
  line_items: [], created_at: '', ...over,
})

describe('computeSelectedTotal — itemized', () => {
  it('sums required items as the base, ignoring optional ones', () => {
    const p = prop({ line_items: [req('r1', 2, 50), opt('o1', 1, 40)] })
    expect(computeSelectedTotal(p, { optional_item_ids: [] })).toBe(100)
  })
  it('adds only the selected optional items', () => {
    const p = prop({ line_items: [req('r1', 2, 50), opt('o1', 1, 40)] })
    expect(computeSelectedTotal(p, { optional_item_ids: ['o1'] })).toBe(140)
  })
})

describe('computeSelectedTotal — packaged', () => {
  const p = prop({
    packages: [
      { id: 'good', name: 'Good', includes: [], price: 12500 },
      { id: 'best', name: 'Best', includes: [], price: 22400 },
    ],
    line_items: [opt('o1', 1, 1500)],
  })
  it('uses the selected package price as the base plus add-ons', () => {
    expect(computeSelectedTotal(p, { package_id: 'best', optional_item_ids: ['o1'] })).toBe(23900)
    expect(computeSelectedTotal(p, { package_id: 'good', optional_item_ids: [] })).toBe(12500)
  })
  it('treats an unknown package id as a zero base (defensive)', () => {
    expect(computeSelectedTotal(p, { package_id: 'nope', optional_item_ids: [] })).toBe(0)
  })
})

describe('computeSelectedTotal — discount & tax', () => {
  it('applies a percent discount then tax on the discounted subtotal', () => {
    const p = prop({ line_items: [req('r1', 1, 100)], discount: { type: 'percent', value: 10 }, tax_rate: 8.25 })
    expect(computeSelectedTotal(p, { optional_item_ids: [] })).toBe(97.43) // 90 * 1.0825
  })
  it('caps a fixed discount at the subtotal', () => {
    const p = prop({ line_items: [req('r1', 1, 100)], discount: { type: 'fixed', value: 500 } })
    expect(computeSelectedTotal(p, { optional_item_ids: [] })).toBe(0)
  })
})

describe('proposalRange', () => {
  it('packaged: cheapest+none to dearest+all', () => {
    const p = prop({
      packages: [
        { id: 'good', name: 'Good', includes: [], price: 12500 },
        { id: 'best', name: 'Best', includes: [], price: 22400 },
      ],
      line_items: [opt('o1', 1, 1500)],
    })
    expect(proposalRange(p)).toEqual({ min: 12500, max: 23900 })
  })
  it('itemized: required-only to required+all-optional', () => {
    const p = prop({ line_items: [req('r1', 1, 100), opt('o1', 1, 40)] })
    expect(proposalRange(p)).toEqual({ min: 100, max: 140 })
  })
})

describe('discountAmount / depositAmount', () => {
  it('computes and caps discount', () => {
    expect(discountAmount(200, { type: 'percent', value: 10 })).toBe(20)
    expect(discountAmount(80, { type: 'fixed', value: 500 })).toBe(80)
    expect(discountAmount(200, undefined)).toBe(0)
  })
  it('computes and caps deposit', () => {
    expect(depositAmount(1000, { type: 'percent', value: 50 })).toBe(500)
    expect(depositAmount(1000, { type: 'fixed', value: 2000 })).toBe(1000)
    expect(depositAmount(1000, undefined)).toBe(0)
  })
})
```

Also add `ProposalLineItem` to the existing top import line:
`import { PROPOSAL_STATUSES, PROPOSAL_STATUS_LABELS, lineItemSubtotal, proposalTotal } from '@/lib/proposals'` stays; add `import type { ProposalLineItem } from '@/lib/types'` already present — keep it.

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/lib/proposals.test.ts` → FAIL (exports missing).

- [ ] **Step 3: Extend `lib/types.ts`** — replace the current line-item + Proposal block (keep `ProposalStatus` as-is) with:

```typescript
export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'rejected'

export interface ProposalPackage {
  id: string
  name: string                 // builder-named: "Good" / "Better" / "Best"
  description?: string
  includes: string[]           // bullet lines shown to the customer
  price: number                // the tier's all-in price (dollars)
  recommended?: boolean
}

export interface ProposalLineItem {
  id?: string                  // stable id; a selection references it (optional for back-compat)
  description: string
  quantity: number
  unit_price: number           // dollars (may be decimal)
  optional?: boolean           // true = customer-toggleable add-on; missing/false = required base scope
  taxable?: boolean            // default true; stored now, honored in a later increment
}

export interface ProposalDiscount { type: 'percent' | 'fixed'; value: number }
export interface ProposalDeposit { type: 'percent' | 'fixed'; value: number }  // captured now, collected later

export interface ProposalSelection {
  package_id?: string
  optional_item_ids: string[]
  selected_total: number       // recomputed server-side; never trusted from the client
  selected_at: string          // ISO
}

export interface Proposal {
  id: string
  org_id: string               // denormalized for collectionGroup token lookups
  lead_id: string              // the opportunity id
  token: string                // unguessable public link token
  title?: string
  status: ProposalStatus
  line_items: ProposalLineItem[]
  packages?: ProposalPackage[] // if present (max 3), the customer must pick exactly one
  discount?: ProposalDiscount
  tax_rate?: number            // percent, e.g. 8.25
  deposit?: ProposalDeposit
  expires_at?: string          // ISO; display-only this increment
  notes?: string
  selection?: ProposalSelection
  client_response_at?: string  // set when the client accepts/rejects
  created_at: string
  updated_at?: string
}
```

- [ ] **Step 4: Extend `lib/proposals.ts`** — after the existing `proposalTotal`, add (and widen the type import):

```typescript
import type { Proposal, ProposalLineItem, ProposalStatus, ProposalDiscount, ProposalDeposit, ProposalSelection } from '@/lib/types'

// Base for an itemized proposal = sum of REQUIRED items (optional !== true).
function requiredItemsSubtotal(items: ProposalLineItem[]): number {
  return round2(items.filter((i) => i.optional !== true).reduce((s, i) => s + lineItemSubtotal(i), 0))
}

export function discountAmount(subtotal: number, discount?: ProposalDiscount): number {
  if (!discount || !(discount.value > 0)) return 0
  const raw = discount.type === 'percent' ? (subtotal * discount.value) / 100 : discount.value
  return round2(Math.min(raw, subtotal))
}

export function depositAmount(total: number, deposit?: ProposalDeposit): number {
  if (!deposit || !(deposit.value > 0)) return 0
  const raw = deposit.type === 'percent' ? (total * deposit.value) / 100 : deposit.value
  return round2(Math.min(raw, total))
}

type Priceable = Pick<Proposal, 'packages' | 'line_items' | 'discount' | 'tax_rate'>
type Choice = Pick<ProposalSelection, 'package_id' | 'optional_item_ids'>

// The authoritative total for a given customer selection.
export function computeSelectedTotal(proposal: Priceable, selection: Choice): number {
  const items = proposal.line_items ?? []
  const packages = proposal.packages ?? []
  const base = packages.length > 0
    ? (packages.find((p) => p.id === selection.package_id)?.price ?? 0)
    : requiredItemsSubtotal(items)
  const chosen = new Set(selection.optional_item_ids ?? [])
  const addons = round2(
    items
      .filter((i) => i.optional === true && i.id !== undefined && chosen.has(i.id))
      .reduce((s, i) => s + lineItemSubtotal(i), 0),
  )
  const subtotal = round2(base + addons)
  const discountA = discountAmount(subtotal, proposal.discount)
  const taxable = round2(subtotal - discountA)
  const taxA = round2((taxable * (proposal.tax_rate ?? 0)) / 100)
  return round2(subtotal - discountA + taxA)
}

export function proposalRange(proposal: Priceable): { min: number; max: number } {
  const items = proposal.line_items ?? []
  const packages = proposal.packages ?? []
  const optionalIds = items.filter((i) => i.optional === true && i.id !== undefined).map((i) => i.id!) as string[]
  const byPrice = [...packages].sort((a, b) => a.price - b.price)
  const cheapest = byPrice[0]?.id
  const dearest = byPrice[byPrice.length - 1]?.id
  const min = computeSelectedTotal(proposal, { package_id: cheapest, optional_item_ids: [] })
  const max = computeSelectedTotal(proposal, { package_id: dearest, optional_item_ids: optionalIds })
  return { min, max }
}
```

- [ ] **Step 5: Run tests** — `npx vitest run __tests__/lib/proposals.test.ts` → PASS; `npx tsc --noEmit` clean; `npm test` all green (existing proposal tests unaffected — legacy `{description,quantity,unit_price}` items still typecheck).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/proposals.ts __tests__/lib/proposals.test.ts
git commit -m "feat(proposals): selection model types + server money helpers"
```

---

### Task 2: Admin actions carry the new fields

**Files:**
- Modify: `actions/proposals.ts` (`CreateProposalInput`, `ProposalUpdate`, `createProposal`, `updateProposal`)
- Test: `__tests__/actions/proposals.test.ts` (extend)

**Interfaces:**
- Consumes: types from Task 1.
- Produces: `CreateProposalInput` and `ProposalUpdate` gain optional `packages`, `discount`, `tax_rate`, `deposit`, `expires_at` (both already carry `line_items`); `updateProposal` spreads them through unchanged; `createProposal` includes `packages` when provided.

- [ ] **Step 1: Write the failing test** — append to `__tests__/actions/proposals.test.ts` inside the `describe('proposals actions', …)` block:

```typescript
it('updateProposal passes through packages/discount/tax_rate/deposit/expires_at', async () => {
  await updateProposal('org-1', 'p1', {
    packages: [{ id: 'good', name: 'Good', includes: ['A'], price: 12500 }],
    line_items: [{ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true }],
    discount: { type: 'percent', value: 10 },
    tax_rate: 8.25,
    deposit: { type: 'percent', value: 50 },
    expires_at: '2026-09-01',
  })
  const written = proposalDocUpdateSpy.mock.calls[0][0]
  expect(written.packages).toEqual([{ id: 'good', name: 'Good', includes: ['A'], price: 12500 }])
  expect(written.discount).toEqual({ type: 'percent', value: 10 })
  expect(written.tax_rate).toBe(8.25)
  expect(written.deposit).toEqual({ type: 'percent', value: 50 })
  expect(written.expires_at).toBe('2026-09-01')
  expect(written.updated_at).toEqual(expect.any(String))
})

it('createProposal includes packages when provided', async () => {
  await createProposal('org-1', 'lead-1', {
    packages: [{ id: 'good', name: 'Good', includes: [], price: 100 }],
  })
  const written = proposalDocSetSpy.mock.calls[0][0]
  expect(written.packages).toEqual([{ id: 'good', name: 'Good', includes: [], price: 100 }])
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/actions/proposals.test.ts` → FAIL (fields dropped / not on the input type).

- [ ] **Step 3: Implement** — in `actions/proposals.ts`:

Widen the type import:
```typescript
import type { Proposal, ProposalLineItem, ProposalStatus, ProposalPackage, ProposalDiscount, ProposalDeposit } from '@/lib/types'
```

Extend `CreateProposalInput`:
```typescript
export interface CreateProposalInput {
  title?: string
  line_items?: ProposalLineItem[]
  notes?: string
  packages?: ProposalPackage[]
  discount?: ProposalDiscount
  tax_rate?: number
  deposit?: ProposalDeposit
  expires_at?: string
}
```

In `createProposal`, add packages when present (mirroring the existing conditional-spread style), immediately after the `line_items` line:
```typescript
    ...(input.packages ? { packages: input.packages } : {}),
    ...(input.discount ? { discount: input.discount } : {}),
    ...(typeof input.tax_rate === 'number' ? { tax_rate: input.tax_rate } : {}),
    ...(input.deposit ? { deposit: input.deposit } : {}),
    ...(input.expires_at ? { expires_at: input.expires_at } : {}),
```

Extend `ProposalUpdate` and let the existing `update({ ...updates, updated_at })` carry them:
```typescript
export interface ProposalUpdate {
  title?: string
  notes?: string
  line_items?: ProposalLineItem[]
  status?: ProposalStatus
  packages?: ProposalPackage[]
  discount?: ProposalDiscount
  tax_rate?: number
  deposit?: ProposalDeposit
  expires_at?: string
}
```

(The `updateProposal` body already spreads `updates`; no change needed there beyond the type.)

- [ ] **Step 4: Run tests** — `npx vitest run __tests__/actions/proposals.test.ts` → PASS; `npx tsc --noEmit` clean; `npm test` green.

- [ ] **Step 5: Commit**

```bash
git add actions/proposals.ts __tests__/actions/proposals.test.ts
git commit -m "feat(proposals): admin actions carry packages/discount/tax/deposit/expiry"
```

---

### Task 3: Public projection + selection-aware accept

**Files:**
- Modify: `actions/proposals-public.ts`
- Test: `__tests__/actions/proposals-public.test.ts` (extend)

**SECURITY-RELEVANT:** unauthenticated; token is the sole authorization; drafts stay hidden; a customer selection may only reference the proposal's own ids; the accepted total is recomputed server-side; the advanced lead is resolved only from the doc's own path.

**Interfaces:**
- Consumes: `computeSelectedTotal` (Task 1); `Proposal`, `ProposalPackage`, `ProposalDiscount`, `ProposalDeposit`, `ProposalSelection`, `ProposalLineItem`, `ProposalStatus` types.
- Produces: `PublicProposal` grows with `packages?`, `discount?`, `tax_rate?`, `deposit?`, `expires_at?`, `selection?`; `respondToProposal(token, response, selection?)` where `selection?: { package_id?: string; optional_item_ids?: string[] }`.

- [ ] **Step 1: Write the failing tests** — append to `__tests__/actions/proposals-public.test.ts`:

```typescript
describe('getPublicProposal — selection fields', () => {
  it('projects packages/discount/tax_rate/deposit/expires_at/selection when present, still stripping internal', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', token: 'secret',
      title: 'Landscape', status: 'sent',
      line_items: [{ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true }],
      packages: [{ id: 'good', name: 'Good', includes: ['Install'], price: 12500 }],
      discount: { type: 'percent', value: 10 }, tax_rate: 8.25, deposit: { type: 'percent', value: 50 },
      expires_at: '2026-09-01', created_at: '2026-05-01T00:00:00.000Z',
    })
    const r = await getPublicProposal('tok')
    expect(r?.packages).toEqual([{ id: 'good', name: 'Good', includes: ['Install'], price: 12500 }])
    expect(r?.discount).toEqual({ type: 'percent', value: 10 })
    expect(r?.tax_rate).toBe(8.25)
    expect(r?.deposit).toEqual({ type: 'percent', value: 50 })
    expect(r?.expires_at).toBe('2026-09-01')
    expect('token' in (r as object)).toBe(false)
    expect('org_id' in (r as object)).toBe(false)
    expect('lead_id' in (r as object)).toBe(false)
    expect('id' in (r as object)).toBe(false)
  })
})

describe('respondToProposal — selection', () => {
  function sentPackaged() {
    return {
      id: 'p1', lead_id: 'lead-1', status: 'sent',
      packages: [
        { id: 'good', name: 'Good', includes: [], price: 12500 },
        { id: 'best', name: 'Best', includes: [], price: 22400 },
      ],
      line_items: [{ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true }],
    }
  }

  it('stores a server-recomputed selection snapshot on accept', async () => {
    mockSnapshot(sentPackaged())
    await respondToProposal('tok', 'accepted', { package_id: 'best', optional_item_ids: ['o1'] })
    const arg = proposalUpdateSpy.mock.calls[0][0]
    expect(arg.status).toBe('accepted')
    expect(arg.selection.package_id).toBe('best')
    expect(arg.selection.optional_item_ids).toEqual(['o1'])
    expect(arg.selection.selected_total).toBe(23900) // recomputed, not client-supplied
    expect(arg.selection.selected_at).toBeTruthy()
    expect(leadUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'booked' }))
  })

  it('requires a package when the proposal is packaged', async () => {
    mockSnapshot(sentPackaged())
    await expect(respondToProposal('tok', 'accepted', { optional_item_ids: [] }))
      .rejects.toThrow('Please select an option before accepting')
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  it('rejects a package id not on the proposal', async () => {
    mockSnapshot(sentPackaged())
    await expect(respondToProposal('tok', 'accepted', { package_id: 'phantom', optional_item_ids: [] }))
      .rejects.toThrow('Invalid selection')
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
  })

  it('rejects an optional_item_id that is not an optional item on the proposal', async () => {
    mockSnapshot(sentPackaged())
    await expect(respondToProposal('tok', 'accepted', { package_id: 'good', optional_item_ids: ['not-real'] }))
      .rejects.toThrow('Invalid selection')
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
  })

  it('still accepts a legacy itemized proposal with no selection (advances to booked)', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent' })
    await respondToProposal('tok', 'accepted')
    expect(proposalUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }))
    expect(leadUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'booked' }))
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/actions/proposals-public.test.ts` → FAIL.

- [ ] **Step 3: Implement `actions/proposals-public.ts`** — update imports, the DTO, projection, and the response action:

```typescript
import { adminDb } from '@/lib/firebase-admin'
import { computeSelectedTotal } from '@/lib/proposals'
import type {
  Proposal, ProposalStatus, ProposalLineItem, ProposalPackage,
  ProposalDiscount, ProposalDeposit, ProposalSelection,
} from '@/lib/types'

export interface PublicProposal {
  title?: string
  status: ProposalStatus
  line_items: ProposalLineItem[]
  packages?: ProposalPackage[]
  discount?: ProposalDiscount
  tax_rate?: number
  deposit?: ProposalDeposit
  expires_at?: string
  notes?: string
  selection?: ProposalSelection
  client_response_at?: string
  created_at: string
}
```

In `getPublicProposal`, keep the existing base object, then add the new fields conditionally (only when present), mirroring the existing `title`/`notes` pattern:

```typescript
  const publicProposal: PublicProposal = {
    status: proposal.status,
    line_items: proposal.line_items,
    created_at: proposal.created_at,
  }
  if (proposal.title !== undefined) publicProposal.title = proposal.title
  if (proposal.notes !== undefined) publicProposal.notes = proposal.notes
  if (proposal.packages !== undefined) publicProposal.packages = proposal.packages
  if (proposal.discount !== undefined) publicProposal.discount = proposal.discount
  if (proposal.tax_rate !== undefined) publicProposal.tax_rate = proposal.tax_rate
  if (proposal.deposit !== undefined) publicProposal.deposit = proposal.deposit
  if (proposal.expires_at !== undefined) publicProposal.expires_at = proposal.expires_at
  if (proposal.selection !== undefined) publicProposal.selection = proposal.selection
  if (proposal.client_response_at !== undefined) {
    publicProposal.client_response_at = proposal.client_response_at
  }
  return publicProposal
```

Replace `respondToProposal` with the selection-aware version:

```typescript
// PUBLIC. Client accepts or rejects. Accepting captures the selection snapshot
// (server-recomputed total) and advances the opportunity to 'booked'.
export async function respondToProposal(
  token: string,
  response: 'accepted' | 'rejected',
  selection?: { package_id?: string; optional_item_ids?: string[] },
): Promise<void> {
  if (response !== 'accepted' && response !== 'rejected') throw new Error('Invalid response')
  const doc = await findProposalByToken(token)
  if (!doc) throw new Error('Proposal not found')
  const proposal = doc.data() as Proposal
  if (proposal.status !== 'sent') throw new Error('This proposal is no longer awaiting a response')

  const now = new Date().toISOString()

  if (response === 'rejected') {
    await doc.ref.update({ status: 'rejected', client_response_at: now, updated_at: now })
    // TODO(activity): logActivity(orgId, { kind: 'proposal', summary: 'Proposal declined' })
    return
  }

  // accepted — validate the selection against THIS proposal, then snapshot it.
  const packages = proposal.packages ?? []
  const items = proposal.line_items ?? []
  const packageId = selection?.package_id
  if (packages.length > 0) {
    if (!packageId) throw new Error('Please select an option before accepting')
    if (!packages.some((p) => p.id === packageId)) throw new Error('Invalid selection')
  }
  const optionalIds = selection?.optional_item_ids ?? []
  const validOptionalIds = new Set(
    items.filter((i) => i.optional === true && i.id !== undefined).map((i) => i.id as string),
  )
  for (const id of optionalIds) {
    if (!validOptionalIds.has(id)) throw new Error('Invalid selection')
  }

  const snapshot: ProposalSelection = {
    ...(packages.length > 0 && packageId ? { package_id: packageId } : {}),
    optional_item_ids: optionalIds,
    selected_total: computeSelectedTotal(proposal, { package_id: packageId, optional_item_ids: optionalIds }),
    selected_at: now,
  }
  await doc.ref.update({ status: 'accepted', selection: snapshot, client_response_at: now, updated_at: now })

  const orgRef = doc.ref.parent.parent
  if (orgRef) {
    await orgRef.collection('leads').doc(proposal.lead_id).update({ stage: 'booked', updated_at: now })
  }
  // TODO(activity): logActivity(orgId, { kind: 'proposal', summary: 'Proposal accepted' })
}
```

- [ ] **Step 4: Run tests** — `npx vitest run __tests__/actions/proposals-public.test.ts` → PASS (existing projection/exact-key and accept/reject tests stay green: no new field is present on their docs, and accept uses `objectContaining`). `npx tsc --noEmit` clean; `npm test` green.

- [ ] **Step 5: Commit**

```bash
git add actions/proposals-public.ts __tests__/actions/proposals-public.test.ts
git commit -m "feat(proposals): public selection capture — validated, server-recomputed snapshot"
```

**REVIEW GATE:** security review after this task — token-only auth, no draft exposure, selection ids validated against the proposal's own arrays, server-authoritative total, no cross-tenant writes, idempotent double-accept.

---

### Task 4: Admin builder — packages, optional items, pricing terms

**Files:**
- Modify: `components/admin/ProposalEditorClient.tsx`

No new vitest (consistent with the repo's UI convention); `npx tsc --noEmit` + `npx next build` are the gate (Task 6).

**Interfaces:**
- Consumes: `updateProposal` (Task 2); `computeSelectedTotal`, `proposalRange`, `lineItemSubtotal`, `depositAmount` from `@/lib/proposals`; `Proposal`, `ProposalPackage`, `ProposalLineItem`, `ProposalDiscount`, `ProposalDeposit` types.

- [ ] **Step 1: Add local state + id helpers.** Alongside the existing `title`/`notes`/`lineItems`/`status` state, add:
  - `const [mode, setMode] = useState<'itemized' | 'packaged'>(proposal.packages?.length ? 'packaged' : 'itemized')`
  - `const [packages, setPackages] = useState<ProposalPackage[]>(proposal.packages ?? [])`
  - `const [discount, setDiscount] = useState<ProposalDiscount | undefined>(proposal.discount)`
  - `const [taxRate, setTaxRate] = useState<string>(proposal.tax_rate != null ? String(proposal.tax_rate) : '')`
  - `const [deposit, setDeposit] = useState<ProposalDeposit | undefined>(proposal.deposit)`
  - `const [expiresAt, setExpiresAt] = useState(proposal.expires_at ?? '')`
  - **Backfill line-item ids on load** so selections can reference them: initialize `lineItems` state by mapping `proposal.line_items ?? []` through `(i) => ({ ...i, id: i.id ?? crypto.randomUUID(), optional: i.optional ?? false })`.

- [ ] **Step 2: Mode toggle + packages editor.** Above the line-items card, render a two-button segmented control (`Button` variant switch) binding `mode`. When `mode === 'packaged'`, render a "Packages" `Card`:
  - Map `packages` to rows: `Input` for `name`, a `<textarea>` for `includes` (one bullet per line; store as `value.split('\n').map(s=>s.trim()).filter(Boolean)`), `Input type="number"` for `price`, a native `<input type="checkbox">` for `recommended`, and a "Remove" `Button`.
  - "Add tier" `Button` appends `{ id: crypto.randomUUID(), name: '', includes: [], price: 0 }` — **disabled when `packages.length >= 3`** (enforce the cap).
  - `updatePackage(i, patch)` / `removePackage(i)` mirror the existing `updateRow`/`removeRow` helpers.

- [ ] **Step 3: Optional toggle on line items.** In the existing line-items row, add a native `<input type="checkbox">` labeled "Optional" bound to `item.optional`, via `updateRow(i, { optional: e.target.checked })`. In `addRow`, append `{ id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, optional: mode === 'packaged' }` (rows default to add-ons in packaged mode).

- [ ] **Step 4: Pricing-terms card.** A "Pricing" `Card` with: a discount type `<select>` (none/percent/fixed) + value `Input`; a tax-rate `Input`; a deposit type `<select>` + value `Input`; and an expiration `Input type="date"` bound to `expiresAt` (display-only). Represent "none" by setting `discount`/`deposit` to `undefined`.

- [ ] **Step 5: Preview strip.** Build a `previewProposal = { packages: mode === 'packaged' ? packages : undefined, line_items: lineItems, discount, tax_rate: taxRate.trim() === '' ? undefined : Number(taxRate) }`. Show `proposalRange(previewProposal)` as `min === max ? money(min) : \`${money(min)}–${money(max)}\``, plus, when `deposit` set, `Deposit: {money(depositAmount(range.max, deposit))}` as a hint.

- [ ] **Step 6: Save payload.** In `handleSave`, after cleaning blank line items, call:

```typescript
await updateProposal(orgId, proposal.id, {
  title: title.trim() || undefined,
  notes: notes.trim() || undefined,
  line_items: cleaned,
  packages: mode === 'packaged' ? packages.filter((p) => p.name.trim() !== '' || p.price > 0) : [],
  discount,
  tax_rate: taxRate.trim() === '' ? undefined : Number(taxRate),
  deposit,
  expires_at: expiresAt || undefined,
})
```

(When switching back to itemized, packages save as `[]` so the proposal is no longer packaged.)

- [ ] **Step 7: Verify** — `npx tsc --noEmit` clean; `npx vitest run` green (unchanged). Visual/build check happens in Task 6.

- [ ] **Step 8: Commit**

```bash
git add components/admin/ProposalEditorClient.tsx
git commit -m "feat(proposals): builder — packages, optional items, discount/tax/deposit, preview range"
```

---

### Task 5: Public selection page — pick, toggle, live total, accept

**Files:**
- Modify: `components/proposals/ProposalResponseClient.tsx`

No new vitest; `tsc` + `next build` gate (Task 6).

**Interfaces:**
- Consumes: `PublicProposal` + `respondToProposal(token, response, selection?)` (Task 3); `computeSelectedTotal`, `lineItemSubtotal`, `depositAmount` from `@/lib/proposals`.

- [ ] **Step 1: Selection state.** Add:
  - `const packaged = (proposal.packages?.length ?? 0) > 0`
  - `const [packageId, setPackageId] = useState<string | undefined>(proposal.packages?.find((p) => p.recommended)?.id)`
  - `const [optionalIds, setOptionalIds] = useState<string[]>([])`
  - Derive `const optionalItems = proposal.line_items.filter((i) => i.optional === true && i.id)` and `const requiredItems = proposal.line_items.filter((i) => i.optional !== true)`.

- [ ] **Step 2: Packages UI (when `packaged`).** Render `proposal.packages!` as selectable cards: name, `money(price)`, `includes` bullets, a "Recommended" badge when `recommended`. Clicking a card sets `packageId` (single-select; highlight the selected card border). On mobile they stack (single column).

- [ ] **Step 3: Required scope + optional add-ons.** Show `requiredItems` as a read-only list (description × qty, `money(lineItemSubtotal(item))`). Render `optionalItems` as labeled `<input type="checkbox">` rows (description, `money(lineItemSubtotal(item))`) toggling membership in `optionalIds`.

- [ ] **Step 4: Sticky running total.** Compute `const total = computeSelectedTotal(proposal, { package_id: packageId, optional_item_ids: optionalIds })` on each render. Render a sticky footer/section showing `money(total)`, and when `proposal.deposit`, a line `Deposit due on acceptance: {money(depositAmount(total, proposal.deposit))}`. Show `expires_at` as informational text if present.

- [ ] **Step 5: Accept with selection.** Change `respond('accepted')` to pass the selection:

```typescript
async function respond(response: Outcome) {
  if (response === 'accepted' && packaged && !packageId) {
    setError('Please choose an option before accepting.')
    return
  }
  setSubmitting(true); setError(null)
  try {
    await respondToProposal(
      token,
      response,
      response === 'accepted' ? { package_id: packageId, optional_item_ids: optionalIds } : undefined,
    )
    setResult(response)
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
  } finally {
    setSubmitting(false)
  }
}
```

Keep the existing accepted/rejected thank-you states. When `proposal.status` is already `accepted` and `proposal.selection` exists, show the locked `money(proposal.selection.selected_total)` instead of the interactive total.

- [ ] **Step 6: Verify** — `npx tsc --noEmit` clean; `npx vitest run` green.

- [ ] **Step 7: Commit**

```bash
git add components/proposals/ProposalResponseClient.tsx
git commit -m "feat(proposals): public page — package select, optional add-ons, live total, deposit"
```

---

### Task 6: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run` → all green; record the final count.
- [ ] **Step 3:** `npx next build` (copy env if the project uses one: `cp /Users/rm/vw/traxevent/.env.local .env.local` if present, build, then `rm -f .env.local`) → succeeds; the existing routes `/[orgSlug]/leads/[leadId]/proposals/[proposalId]` and `/proposals/[token]` still compile; no route collisions (no routes added).
- [ ] **Step 4:** Manual smoke (optional, `npm run dev`): build a packaged proposal with one optional add-on, send it, open the public link, select a tier + toggle the add-on, watch the total, accept — confirm the lead advances to Booked and the editor shows the accepted total.
- [ ] **Step 5:** Commit this plan file (`docs: proposals customer-choice plan`).
- [ ] **Step 6:** Hand back for branch finish (push + PR from `claude/proposals`; do not merge to `main` without review).

---

## Self-Review

**Spec coverage** (against `2026-08-04-proposals-customer-choice-design.md`):
- Selection data model (packages, optional items, discount/tax/deposit, selection snapshot) → Task 1 ✅
- Money math (`computeSelectedTotal`, `proposalRange`, discount→tax order, deposit) → Task 1 ✅
- Admin actions carry the new fields → Task 2 ✅
- Public projection growth (customer-facing fields in, internal stripped) → Task 3 ✅
- Selection-aware accept: validated ids, server-recomputed total, snapshot, advance to `booked` → Task 3 ✅
- Admin builder (mode toggle, ≤3 packages, optional toggle, pricing terms, preview range, id backfill) → Task 4 ✅
- Public page (tier cards, optional checkboxes, sticky live total, deposit line, require tier when packaged) → Task 5 ✅
- Back-compat (optional-typed fields, tolerant reads, id backfill on save) → Tasks 1/3/4 ✅
- CRM seating (`booked`, no `closed_won`; activity as a TODO hook) → Global Constraints + Task 3 ✅
- Out of scope (sign/pay, convert-to-work, governance, per-item tax, customer quantities, content blocks) → not planned ✅

**Placeholder scan:** every code step carries real code; UI tasks (4/5) give concrete state shapes, the exact save/accept payloads, and the id-backfill rule rather than "add a form."

**Type consistency:** `computeSelectedTotal(proposal, selection)` / `proposalRange(proposal)` / `discountAmount` / `depositAmount` signatures match across Task 1 (def), Task 3 (server accept), and Tasks 4–5 (UI). `ProposalSelection` shape (`package_id?`, `optional_item_ids`, `selected_total`, `selected_at`) is identical in the type (Task 1), the stored snapshot (Task 3), and the public read (Task 3). `respondToProposal(token, response, selection?)` matches its caller in Task 5. Accepting advances to `'booked'` everywhere (never `closed_won`).
