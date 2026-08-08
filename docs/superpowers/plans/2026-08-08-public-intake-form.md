# Public Intake Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the pipeline's front door — a public, tokenized inquiry form that creates a Customer + Opportunity at stage `inquiry`, logs a `form` activity event, emails the org owner, and introduces the repo's first rate-limit/bot-protection seam.

**Architecture:** A new `intake_token` on the org doc gates a public page at `/inquire/[token]`. Submission flows through a public server action (`actions/intake-public.ts`) that layers honeypot + time-gate + Firestore-backed rate limiting before calling the existing guard-free cores (`findOrCreateCustomerCore`, new `createLeadCore`). Admin-side, a small card on the pipeline page mints/copies/regenerates the link.

**Tech Stack:** Next.js 16 App Router (server actions), firebase-admin Firestore, Resend, shadcn/ui, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-08-public-intake-form-design.md`

## Global Constraints

- Next 16: `params`/`searchParams` are **Promises** (`await` them); `headers()` from `next/headers` is **async**. This Next version differs from training data — check `node_modules/next/dist/docs/` when unsure.
- `'use server'` modules may export **async functions only** — no type re-exports (breaks `next build`, not `tsc`). Types live in `lib/**` and are imported from there.
- Firestore never receives `undefined` — use the repo's conditional-spread idiom: `...(x?.trim() ? { x: x.trim() } : {})`.
- Timestamps are ISO strings (`new Date().toISOString()`), doc ids are `randomBytes(8).toString('hex')`, tokens are `generateAccessToken()` (48 hex chars) from `lib/tokens.ts`.
- No new dependencies. No zod — validation is hand-rolled with explicit length caps.
- Public actions return hand-curated public-safe DTOs and generic error strings; internals never leak.
- Activity logging and email are best-effort: they must never fail a committed business write.
- firebase-admin is mocked at module level in tests (see `__tests__/lib/crm/leads.test.ts` for the house style).
- Commit after every task. `npm run build` (next build) must pass before the branch is called green.
- Worktree setup (execution time, via superpowers:using-git-worktrees): fresh worktrees need `npm install` and a copied `.env.local` from the primary checkout; if the worktree tool branched from `origin/main`, reset to local `main` first (local-only spec/plan commits are otherwise missing).

---

### Task 1: Rate-limit seam (`lib/rate-limit.ts`)

**Files:**
- Create: `lib/rate-limit.ts`
- Test: `__tests__/lib/rate-limit.test.ts`

**Interfaces:**
- Consumes: `adminDb` from `@/lib/firebase-admin`.
- Produces: `checkRateLimit(key: string, opts: { limit: number; windowMs: number }): Promise<{ allowed: boolean }>` — Task 5 calls this. Fixed-window counter in top-level `rate_limits/{key}` docs `{ count: number; window_start: number }` (epoch ms). Infra error ⇒ `{ allowed: true }`. No rules change needed: `firestore.rules` is default-deny and only the admin SDK touches this collection.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/rate-limit.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { store, runTransaction } = vi.hoisted(() => {
  const store = new Map<string, { count: number; window_start: number }>()
  const runTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      get: async (ref: { key: string }) => {
        const data = store.get(ref.key)
        return { exists: data !== undefined, data: () => data }
      },
      set: (ref: { key: string }, value: { count: number; window_start: number }) => {
        store.set(ref.key, value)
      },
      update: (ref: { key: string }, value: { count: number }) => {
        const cur = store.get(ref.key)
        if (!cur) throw new Error('update on missing doc')
        store.set(ref.key, { ...cur, ...value })
      },
    }
    return fn(tx)
  })
  return { store, runTransaction }
})

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: (key: string) => ({ key }) })),
    runTransaction,
  },
}))

import { checkRateLimit } from '@/lib/rate-limit'

const OPTS = { limit: 3, windowMs: 60_000 }

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-08T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('checkRateLimit', () => {
  it('allows the first call and starts a window', async () => {
    expect(await checkRateLimit('k1', OPTS)).toEqual({ allowed: true })
    expect(store.get('k1')).toEqual({ count: 1, window_start: Date.now() })
  })

  it('increments within the window and denies at the limit', async () => {
    expect((await checkRateLimit('k1', OPTS)).allowed).toBe(true)
    expect((await checkRateLimit('k1', OPTS)).allowed).toBe(true)
    expect((await checkRateLimit('k1', OPTS)).allowed).toBe(true)
    expect((await checkRateLimit('k1', OPTS)).allowed).toBe(false)
    expect(store.get('k1')!.count).toBe(3)
  })

  it('resets the counter when the window has elapsed', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit('k1', OPTS)
    expect((await checkRateLimit('k1', OPTS)).allowed).toBe(false)
    vi.setSystemTime(new Date('2026-08-08T12:01:01Z'))
    expect((await checkRateLimit('k1', OPTS)).allowed).toBe(true)
    expect(store.get('k1')!.count).toBe(1)
  })

  it('keys are independent', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit('k1', OPTS)
    expect((await checkRateLimit('k2', OPTS)).allowed).toBe(true)
  })

  it('allows on transaction failure (availability over strictness)', async () => {
    runTransaction.mockRejectedValueOnce(new Error('firestore down'))
    expect(await checkRateLimit('k1', OPTS)).toEqual({ allowed: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/rate-limit.test.ts`
Expected: FAIL — cannot resolve `@/lib/rate-limit`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/rate-limit.ts
import { adminDb } from '@/lib/firebase-admin'

export interface RateLimitOptions {
  limit: number
  windowMs: number
}

// Top-level collection; only the admin SDK reads or writes it (default-deny rules).
export function rateLimitsRef() {
  return adminDb.collection('rate_limits')
}

/**
 * Fixed-window rate limiter shared by all public endpoints. Counter and window
 * start live in a single doc per key; the read-check-write runs in one
 * transaction so concurrent submissions cannot both pass at the limit.
 *
 * Failure posture: limit exceeded => denied; infrastructure error => allowed.
 * If Firestore is down the whole product is down — a broken limiter must not
 * be the thing that blocks a legitimate submission.
 */
export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions
): Promise<{ allowed: boolean }> {
  try {
    return await adminDb.runTransaction(async (tx) => {
      const ref = rateLimitsRef().doc(key)
      const snap = await tx.get(ref)
      const now = Date.now()
      const data = snap.exists
        ? (snap.data() as { count: number; window_start: number })
        : undefined
      if (!data || now - data.window_start >= opts.windowMs) {
        tx.set(ref, { count: 1, window_start: now })
        return { allowed: true }
      }
      if (data.count >= opts.limit) return { allowed: false }
      tx.update(ref, { count: data.count + 1 })
      return { allowed: true }
    })
  } catch (err) {
    console.error('checkRateLimit failed', err)
    return { allowed: true }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/rate-limit.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/rate-limit.ts __tests__/lib/rate-limit.test.ts
git commit -m "feat(rate-limit): Firestore fixed-window limiter — first public abuse-protection seam"
```

---

### Task 2: Extract `createLeadCore` (behavior-preserving)

**Files:**
- Modify: `lib/crm/leads.ts` (add `CreateLeadCoreInput`, `createLeadCore`; add `randomBytes` import)
- Modify: `actions/leads.ts:41-71` (`createLead` delegates to the core)
- Test: `__tests__/lib/crm/leads.test.ts` (extend), existing `__tests__/actions/leads.test.ts` must stay green

**Interfaces:**
- Consumes: `leadsRef`, `LEAD_STAGES`, `Lead`/`LeadStage` types.
- Produces: `createLeadCore(orgId: string, input: CreateLeadCoreInput): Promise<Lead>` where `CreateLeadCoreInput = { name: string; stage: LeadStage; customer_id: string; title?; email?; phone?; organization?; event_type?; event_date?; estimated_value?: number; guest_count?: number; notes? }`. Guard-free: no auth, no activity logging, no customer dedup — callers do all three. Task 5 calls this with `stage: 'inquiry'`.
- Note: the in-flight `claude/customer-page` branch also edits `createLead`. This extraction keeps `createLead`'s observable behavior identical; whichever branch lands second reconciles mechanically.

- [ ] **Step 1: Extend the core test file with failing tests**

In `__tests__/lib/crm/leads.test.ts`, the hoisted `leadDoc` mock has only `update`; add `set`:

```ts
const leadDoc = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
}))
```

Add to the imports from `@/lib/crm/leads`: `createLeadCore`. Append:

```ts
describe('createLeadCore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes a lead with id, trimmed fields, stage, customer_id, created_at', async () => {
    const lead = await createLeadCore('o1', {
      name: '  Ada  ', stage: 'inquiry', customer_id: 'c1',
      email: 'ada@example.com', event_type: ' Wedding ',
    })
    expect(lead.name).toBe('Ada')
    expect(lead.stage).toBe('inquiry')
    expect(lead.customer_id).toBe('c1')
    expect(lead.event_type).toBe('Wedding')
    expect(lead.id).toMatch(/^[0-9a-f]{16}$/)
    expect(lead.created_at).toEqual(expect.any(String))
    expect(leadDoc.set).toHaveBeenCalledWith(lead)
  })

  it('omits blank optional fields entirely', async () => {
    const lead = await createLeadCore('o1', {
      name: 'Ada', stage: 'inquiry', customer_id: 'c1', phone: '   ', notes: '',
    })
    expect('phone' in lead).toBe(false)
    expect('notes' in lead).toBe(false)
  })

  it('rejects a blank name and an invalid stage', async () => {
    await expect(
      createLeadCore('o1', { name: '  ', stage: 'inquiry', customer_id: 'c1' })
    ).rejects.toThrow('Name is required')
    await expect(
      createLeadCore('o1', { name: 'A', stage: 'bogus' as never, customer_id: 'c1' })
    ).rejects.toThrow('Invalid stage')
    expect(leadDoc.set).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run __tests__/lib/crm/leads.test.ts`
Expected: FAIL — `createLeadCore` is not exported.

- [ ] **Step 3: Implement the core**

In `lib/crm/leads.ts`, add `import { randomBytes } from 'crypto'` after the existing imports, then append:

```ts
export interface CreateLeadCoreInput {
  name: string
  stage: LeadStage
  customer_id: string
  title?: string
  email?: string
  phone?: string
  organization?: string
  event_type?: string
  event_date?: string
  estimated_value?: number
  guest_count?: number
  notes?: string
}

/** Guard-free lead create. Validates name/stage; performs no auth, no customer
 *  dedup, and logs no activity — those are the caller's responsibility. */
export async function createLeadCore(orgId: string, input: CreateLeadCoreInput): Promise<Lead> {
  if (!input.name?.trim()) throw new Error('Name is required')
  if (!LEAD_STAGES.includes(input.stage)) throw new Error('Invalid stage')
  const id = randomBytes(8).toString('hex')
  const lead: Lead = {
    id,
    name: input.name.trim(),
    stage: input.stage,
    created_at: new Date().toISOString(),
    customer_id: input.customer_id,
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.organization?.trim() ? { organization: input.organization.trim() } : {}),
    ...(input.event_type?.trim() ? { event_type: input.event_type.trim() } : {}),
    ...(input.event_date?.trim() ? { event_date: input.event_date.trim() } : {}),
    ...(input.estimated_value != null ? { estimated_value: input.estimated_value } : {}),
    ...(input.guest_count != null ? { guest_count: input.guest_count } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await leadsRef(orgId).doc(id).set(lead)
  return lead
}
```

- [ ] **Step 4: Delegate from the action**

In `actions/leads.ts`, replace the body of `createLead` (lines 41–71) with:

```ts
export async function createLead(orgId: string, input: CreateLeadInput): Promise<Lead> {
  await assertOrgAdmin(orgId)
  if (!input.name?.trim()) throw new Error('Name is required')
  const stage = input.stage ?? 'inquiry'
  if (!LEAD_STAGES.includes(stage)) throw new Error('Invalid stage')
  const { customer } = await findOrCreateCustomerCore(orgId, {
    name: input.name.trim(),
    ...(input.organization?.trim() ? { company: input.organization.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
  })
  return createLeadCore(orgId, {
    name: input.name,
    stage,
    customer_id: customer.id,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.organization !== undefined ? { organization: input.organization } : {}),
    ...(input.event_type !== undefined ? { event_type: input.event_type } : {}),
    ...(input.event_date !== undefined ? { event_date: input.event_date } : {}),
    ...(input.estimated_value != null ? { estimated_value: input.estimated_value } : {}),
    ...(input.guest_count != null ? { guest_count: input.guest_count } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  })
}
```

Update the import from `@/lib/crm/leads` to include `createLeadCore`. The `randomBytes` import in `actions/leads.ts` becomes unused if nothing else uses it — check with `grep -n "randomBytes" actions/leads.ts` and remove the import if this was the only use.

- [ ] **Step 5: Run core + action + component tests**

Run: `npx vitest run __tests__/lib/crm/leads.test.ts __tests__/actions/leads.test.ts __tests__/components/pipeline-list.test.tsx`
Expected: PASS — the action's observable behavior is unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/crm/leads.ts actions/leads.ts __tests__/lib/crm/leads.test.ts
git commit -m "refactor(crm): extract guard-free createLeadCore for public intake"
```

---

### Task 3: `escapeHtml` + owner notification email

**Files:**
- Modify: `lib/email.ts` (add `escapeHtml`, `sendIntakeNotification`)
- Test: `__tests__/lib/email.test.ts` (extend — keep its existing `@/lib/resend` mock)

**Interfaces:**
- Consumes: `getResend`, `buildFromAddress` from `@/lib/resend`.
- Produces:
  - `escapeHtml(value: string): string`
  - `sendIntakeNotification(params: IntakeNotificationParams): Promise<void>` with `IntakeNotificationParams = { to: string; orgName: string; leadName: string; email: string; phone?: string; eventType?: string; eventDate?: string; guestCount?: number; message?: string; opportunityUrl: string }`. Task 5 calls it inside try/catch (best-effort). Every attacker-supplied value is escaped; `opportunityUrl` is server-constructed and trusted.

- [ ] **Step 1: Add failing tests to `__tests__/lib/email.test.ts`**

Add `sendIntakeNotification, escapeHtml` to the existing import from `@/lib/email`, and append:

```ts
describe('escapeHtml', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<img src=x onerror="alert('&')">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;&amp;&#39;)&quot;&gt;'
    )
  })
  it('passes plain text through', () => {
    expect(escapeHtml('Ada Lovelace')).toBe('Ada Lovelace')
  })
})

describe('sendIntakeNotification', () => {
  beforeEach(() => vi.clearAllMocks())

  const base = {
    to: 'owner@example.com',
    orgName: 'Brew Cart Co',
    leadName: 'Ada Lovelace',
    email: 'ada@example.com',
    opportunityUrl: 'https://traxevent.com/brewcart/leads/abc123',
  }

  it('sends to the owner with org display name and the opportunity link', async () => {
    await sendIntakeNotification(base)
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.to).toBe('owner@example.com')
    expect(call.from).toBe('"Brew Cart Co" <noreply@traxevent.com>')
    expect(call.subject).toBe('New inquiry — Ada Lovelace')
    expect(call.html).toContain('https://traxevent.com/brewcart/leads/abc123')
    expect(call.html).toContain('ada@example.com')
  })

  it('escapes attacker-supplied values in the HTML body', async () => {
    await sendIntakeNotification({
      ...base,
      leadName: '<script>alert(1)</script>',
      message: '<b>bold</b> & "quoted"',
    })
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.html).not.toContain('<script>')
    expect(call.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(call.html).toContain('&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;')
  })

  it('omits rows for absent optional fields', async () => {
    await sendIntakeNotification(base)
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.html).not.toContain('Phone')
    expect(call.html).not.toContain('Message')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/lib/email.test.ts`
Expected: FAIL — `escapeHtml`/`sendIntakeNotification` not exported.

- [ ] **Step 3: Implement in `lib/email.ts`**

Append:

```ts
// Minimal HTML entity escaping for user-supplied strings interpolated into
// email bodies. The intake form is the first place attacker-controlled text
// flows into these templates — escape everything that isn't server-built.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface IntakeNotificationParams {
  to: string
  orgName: string
  leadName: string
  email: string
  phone?: string
  eventType?: string
  eventDate?: string
  guestCount?: number
  message?: string
  opportunityUrl: string
}

// Best-effort owner notification for a public intake submission. Callers wrap
// this in try/catch — a send failure must never fail the committed lead write.
export async function sendIntakeNotification(params: IntakeNotificationParams): Promise<void> {
  const from = buildFromAddress({ displayName: params.orgName })
  const rows: Array<[string, string]> = [
    ['Name', params.leadName],
    ['Email', params.email],
    ...(params.phone ? ([['Phone', params.phone]] as Array<[string, string]>) : []),
    ...(params.eventType ? ([['Event type', params.eventType]] as Array<[string, string]>) : []),
    ...(params.eventDate ? ([['Event date', params.eventDate]] as Array<[string, string]>) : []),
    ...(params.guestCount != null
      ? ([['Guest count', String(params.guestCount)]] as Array<[string, string]>)
      : []),
    ...(params.message ? ([['Message', params.message]] as Array<[string, string]>) : []),
  ]
  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 12px 6px 0;color:#64748B;font-size:14px;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>
          <td style="padding:6px 0;color:#1a1a1a;font-size:14px">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('')

  await getResend().emails.send({
    from,
    to: params.to,
    subject: `New inquiry — ${params.leadName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#7C3AED;margin-bottom:8px">New inquiry</h1>
        <p style="color:#4C1D95;font-size:16px;margin-bottom:16px">
          Someone just reached out through your intake form.
        </p>
        <table style="border-collapse:collapse;margin-bottom:24px">${rowsHtml}</table>
        <a href="${params.opportunityUrl}"
           style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600">
          Open in pipeline
        </a>
      </div>
    `,
  })
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run __tests__/lib/email.test.ts`
Expected: PASS (existing + 5 new tests).

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts __tests__/lib/email.test.ts
git commit -m "feat(email): intake owner notification with HTML escaping"
```

---

### Task 4: Intake token management (`actions/intake.ts`)

**Files:**
- Modify: `lib/types.ts:9-26` (add `intake_token?: string` to `Org`)
- Create: `actions/intake.ts`
- Test: `__tests__/actions/intake.test.ts`

**Interfaces:**
- Consumes: `assertOrgAdmin` from `@/lib/auth/assert`, `generateAccessToken` from `@/lib/tokens`, `adminDb`.
- Produces (admin-only, called by Task 7's card):
  - `ensureIntakeToken(orgId: string): Promise<string>` — returns existing token or mints + persists one.
  - `regenerateIntakeToken(orgId: string): Promise<string>` — always mints, persists, returns; old token stops resolving.

- [ ] **Step 1: Add the Org field**

In `lib/types.ts`, inside `interface Org` after `branding?: OrgBranding`:

```ts
  intake_token?: string              // public intake form access token; minted lazily (actions/intake.ts)
```

- [ ] **Step 2: Write the failing test**

```ts
// __tests__/actions/intake.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { assertOrgAdminSpy, orgGetSpy, orgUpdateSpy } = vi.hoisted(() => ({
  assertOrgAdminSpy: vi.fn().mockResolvedValue(undefined),
  orgGetSpy: vi.fn(),
  orgUpdateSpy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: assertOrgAdminSpy,
  assertOrgMember: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: orgGetSpy, update: orgUpdateSpy })),
    })),
  },
}))

import { ensureIntakeToken, regenerateIntakeToken } from '@/actions/intake'

beforeEach(() => vi.clearAllMocks())

describe('ensureIntakeToken', () => {
  it('requires org admin', async () => {
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', name: 'Org' }) })
    await ensureIntakeToken('o1')
    expect(assertOrgAdminSpy).toHaveBeenCalledWith('o1')
  })

  it('returns the existing token without writing', async () => {
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ intake_token: 'tok_existing' }) })
    expect(await ensureIntakeToken('o1')).toBe('tok_existing')
    expect(orgUpdateSpy).not.toHaveBeenCalled()
  })

  it('mints and persists a 48-hex token when absent', async () => {
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ name: 'Org' }) })
    const token = await ensureIntakeToken('o1')
    expect(token).toMatch(/^[0-9a-f]{48}$/)
    expect(orgUpdateSpy).toHaveBeenCalledWith({ intake_token: token })
  })

  it('throws when the org does not exist', async () => {
    orgGetSpy.mockResolvedValue({ exists: false })
    await expect(ensureIntakeToken('o1')).rejects.toThrow('Org not found')
  })
})

describe('regenerateIntakeToken', () => {
  it('requires admin and always writes a fresh token', async () => {
    const token = await regenerateIntakeToken('o1')
    expect(assertOrgAdminSpy).toHaveBeenCalledWith('o1')
    expect(token).toMatch(/^[0-9a-f]{48}$/)
    expect(orgUpdateSpy).toHaveBeenCalledWith({ intake_token: token })
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run __tests__/actions/intake.test.ts`
Expected: FAIL — cannot resolve `@/actions/intake`.

- [ ] **Step 4: Implement `actions/intake.ts`**

```ts
'use server'

import { assertOrgAdmin } from '@/lib/auth/assert'
import { adminDb } from '@/lib/firebase-admin'
import { generateAccessToken } from '@/lib/tokens'
import type { Org } from '@/lib/types'

// Admin-side management of the org's public intake link. The public read/write
// path lives in actions/intake-public.ts.

export async function ensureIntakeToken(orgId: string): Promise<string> {
  await assertOrgAdmin(orgId)
  const ref = adminDb.collection('orgs').doc(orgId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Org not found')
  const org = snap.data() as Org
  if (org.intake_token) return org.intake_token
  const token = generateAccessToken()
  await ref.update({ intake_token: token })
  return token
}

export async function regenerateIntakeToken(orgId: string): Promise<string> {
  await assertOrgAdmin(orgId)
  const token = generateAccessToken()
  await adminDb.collection('orgs').doc(orgId).update({ intake_token: token })
  return token
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run __tests__/actions/intake.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts actions/intake.ts __tests__/actions/intake.test.ts
git commit -m "feat(intake): org intake_token with ensure/regenerate admin actions"
```

---

### Task 5: Public submission action (`actions/intake-public.ts`)

**Files:**
- Create: `actions/intake-public.ts`
- Test: `__tests__/actions/intake-public.test.ts`

**Interfaces:**
- Consumes: `checkRateLimit` (Task 1), `createLeadCore` (Task 2), `sendIntakeNotification` (Task 3), `findOrCreateCustomerCore`, `logActivity`, `adminDb`, `headers` from `next/headers` (async in Next 16).
- Produces (public; intake token = authorization; Task 6 calls both):
  - `getIntakeFormInfo(token: string): Promise<{ org_name: string } | null>`
  - `submitIntake(token: string, input: IntakeSubmission, elapsedMs: number): Promise<{ ok: true }>` where `IntakeSubmission = { name: string; email: string; phone?; event_type?; event_date?; guest_count?: number; message?; website? }` (`website` is the honeypot).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/actions/intake-public.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  orgsWhereGetSpy, membersGetSpy, checkRateLimitSpy,
  findOrCreateSpy, createLeadCoreSpy, logActivitySpy, sendIntakeSpy,
} = vi.hoisted(() => ({
  orgsWhereGetSpy: vi.fn(),
  membersGetSpy: vi.fn(),
  checkRateLimitSpy: vi.fn().mockResolvedValue({ allowed: true }),
  findOrCreateSpy: vi.fn().mockResolvedValue({
    customer: { id: 'cust-1', name: 'Ada', created_at: 'x' }, created: true,
  }),
  createLeadCoreSpy: vi.fn().mockResolvedValue({
    id: 'lead-1', name: 'Ada', stage: 'inquiry', customer_id: 'cust-1', created_at: 'x',
  }),
  logActivitySpy: vi.fn().mockResolvedValue(undefined),
  sendIntakeSpy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(() => ({ get: orgsWhereGetSpy })) })),
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => ({ get: membersGetSpy })) })),
        })),
      })),
    })),
  },
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitSpy }))
vi.mock('@/lib/crm/customers', () => ({ findOrCreateCustomerCore: findOrCreateSpy }))
vi.mock('@/lib/crm/leads', () => ({ createLeadCore: createLeadCoreSpy }))
vi.mock('@/lib/activity', () => ({ logActivity: logActivitySpy }))
vi.mock('@/lib/email', () => ({ sendIntakeNotification: sendIntakeSpy }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map([['x-forwarded-for', '203.0.113.7, 10.0.0.1']])),
}))

import { getIntakeFormInfo, submitIntake } from '@/actions/intake-public'

function mockOrg(data: Record<string, unknown> | null) {
  if (data === null) {
    orgsWhereGetSpy.mockResolvedValue({ empty: true, docs: [] })
    return
  }
  orgsWhereGetSpy.mockResolvedValue({
    empty: false,
    docs: [{ id: 'org-1', data: () => data }],
  })
}

const ORG = { id: 'org-1', name: 'Brew Cart Co', slug: 'brewcart', intake_token: 'tok_intake' }

function submission(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ada Lovelace',
    email: 'Ada@Example.com',
    phone: '555-1234',
    event_type: 'Wedding',
    event_date: '2026-10-10',
    guest_count: 120,
    message: 'Looking forward to it',
    website: '',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimitSpy.mockResolvedValue({ allowed: true })
  findOrCreateSpy.mockResolvedValue({
    customer: { id: 'cust-1', name: 'Ada', created_at: 'x' }, created: true,
  })
  createLeadCoreSpy.mockResolvedValue({
    id: 'lead-1', name: 'Ada', stage: 'inquiry', customer_id: 'cust-1', created_at: 'x',
  })
  membersGetSpy.mockResolvedValue({
    empty: false,
    docs: [{ data: () => ({ uid: 'u1', role: 'owner', email: 'owner@example.com' }) }],
  })
})

describe('getIntakeFormInfo', () => {
  it('returns null for an unknown token', async () => {
    mockOrg(null)
    expect(await getIntakeFormInfo('nope')).toBeNull()
  })

  it('returns only the org display name', async () => {
    mockOrg({ ...ORG, branding: { display_name: 'Brew Cart ☕' }, stripe_customer_id: 'cus_secret' })
    expect(await getIntakeFormInfo('tok_intake')).toEqual({ org_name: 'Brew Cart ☕' })
  })

  it('falls back to org name without branding', async () => {
    mockOrg(ORG)
    expect(await getIntakeFormInfo('tok_intake')).toEqual({ org_name: 'Brew Cart Co' })
  })
})

describe('submitIntake', () => {
  it('rejects an unknown token with a generic error', async () => {
    mockOrg(null)
    await expect(submitIntake('nope', submission(), 5000)).rejects.toThrow(
      'This form is no longer available.'
    )
    expect(createLeadCoreSpy).not.toHaveBeenCalled()
  })

  it('honeypot filled: fake success, zero writes', async () => {
    mockOrg(ORG)
    expect(await submitIntake('tok_intake', submission({ website: 'http://spam' }), 5000)).toEqual({ ok: true })
    expect(findOrCreateSpy).not.toHaveBeenCalled()
    expect(createLeadCoreSpy).not.toHaveBeenCalled()
    expect(checkRateLimitSpy).not.toHaveBeenCalled()
  })

  it('too-fast submission: fake success, zero writes', async () => {
    mockOrg(ORG)
    expect(await submitIntake('tok_intake', submission(), 900)).toEqual({ ok: true })
    expect(createLeadCoreSpy).not.toHaveBeenCalled()
  })

  it('denies when a rate limit is exceeded', async () => {
    mockOrg(ORG)
    checkRateLimitSpy.mockResolvedValueOnce({ allowed: false })
    await expect(submitIntake('tok_intake', submission(), 5000)).rejects.toThrow(
      'Too many requests — please try again later.'
    )
    expect(createLeadCoreSpy).not.toHaveBeenCalled()
  })

  it('checks a hashed-ip key and an org key', async () => {
    mockOrg(ORG)
    await submitIntake('tok_intake', submission(), 5000)
    const keys = checkRateLimitSpy.mock.calls.map((c) => c[0] as string)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatch(/^intake:ip:[0-9a-f]{64}$/)
    expect(keys[0]).not.toContain('203.0.113.7')
    expect(keys[1]).toBe('intake:org:org-1')
  })

  it('rejects missing name, invalid email, and over-cap fields', async () => {
    mockOrg(ORG)
    await expect(submitIntake('tok_intake', submission({ name: '  ' }), 5000)).rejects.toThrow(
      'Please enter your name.'
    )
    await expect(submitIntake('tok_intake', submission({ email: 'not-an-email' }), 5000)).rejects.toThrow(
      'Please enter a valid email address.'
    )
    await expect(
      submitIntake('tok_intake', submission({ message: 'x'.repeat(2001) }), 5000)
    ).rejects.toThrow('Please keep your message under 2000 characters.')
    await expect(
      submitIntake('tok_intake', submission({ event_date: '10/10/2026' }), 5000)
    ).rejects.toThrow('Please pick a valid event date.')
    await expect(
      submitIntake('tok_intake', submission({ guest_count: 3.5 }), 5000)
    ).rejects.toThrow('Please enter a valid guest count.')
    expect(createLeadCoreSpy).not.toHaveBeenCalled()
  })

  it('creates customer then lead at inquiry with the message as notes', async () => {
    mockOrg(ORG)
    await submitIntake('tok_intake', submission(), 5000)
    expect(findOrCreateSpy).toHaveBeenCalledWith('org-1', {
      name: 'Ada Lovelace', email: 'Ada@Example.com', phone: '555-1234',
    })
    expect(createLeadCoreSpy).toHaveBeenCalledWith('org-1', {
      name: 'Ada Lovelace', stage: 'inquiry', customer_id: 'cust-1',
      email: 'Ada@Example.com', phone: '555-1234', event_type: 'Wedding',
      event_date: '2026-10-10', guest_count: 120, notes: 'Looking forward to it',
    })
  })

  it('logs a form activity event on the new opportunity', async () => {
    mockOrg(ORG)
    await submitIntake('tok_intake', submission(), 5000)
    expect(logActivitySpy).toHaveBeenCalledWith('org-1', {
      parent_type: 'opportunity', parent_id: 'lead-1', kind: 'form',
      summary: 'New inquiry from intake form',
    })
  })

  it('emails the owner with a link to the opportunity', async () => {
    mockOrg(ORG)
    await submitIntake('tok_intake', submission(), 5000)
    expect(sendIntakeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        orgName: 'Brew Cart Co',
        leadName: 'Ada Lovelace',
        opportunityUrl: expect.stringContaining('/brewcart/leads/lead-1'),
      })
    )
  })

  it('email failure does not fail the submission', async () => {
    mockOrg(ORG)
    sendIntakeSpy.mockRejectedValueOnce(new Error('resend down'))
    expect(await submitIntake('tok_intake', submission(), 5000)).toEqual({ ok: true })
  })

  it('missing owner member: no email, still succeeds', async () => {
    mockOrg(ORG)
    membersGetSpy.mockResolvedValue({ empty: true, docs: [] })
    expect(await submitIntake('tok_intake', submission(), 5000)).toEqual({ ok: true })
    expect(sendIntakeSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/actions/intake-public.test.ts`
Expected: FAIL — cannot resolve `@/actions/intake-public`.

- [ ] **Step 3: Implement `actions/intake-public.ts`**

```ts
'use server'

import { headers } from 'next/headers'
import { createHash } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { findOrCreateCustomerCore } from '@/lib/crm/customers'
import { createLeadCore } from '@/lib/crm/leads'
import { logActivity } from '@/lib/activity'
import { sendIntakeNotification } from '@/lib/email'
import type { Org } from '@/lib/types'

// NOTE: this is a 'use server' module — every export must be an async function.

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://traxevent.com'

const MSG_UNAVAILABLE = 'This form is no longer available.'
const MSG_RATE_LIMITED = 'Too many requests — please try again later.'

export interface IntakeSubmission {
  name: string
  email: string
  phone?: string
  event_type?: string
  event_date?: string
  guest_count?: number
  message?: string
  website?: string // honeypot — humans never see or fill this field
}

async function findOrgByIntakeToken(
  token: string
): Promise<{ orgId: string; org: Org } | null> {
  if (!token || token.length > 100) return null
  const snap = await adminDb
    .collection('orgs')
    .where('intake_token', '==', token)
    .limit(1)
    .get()
  if (snap.empty) return null
  return { orgId: snap.docs[0].id, org: snap.docs[0].data() as Org }
}

// PUBLIC (intake_token = authorization). Returns only what the form page renders.
export async function getIntakeFormInfo(token: string): Promise<{ org_name: string } | null> {
  const found = await findOrgByIntakeToken(token)
  if (!found) return null
  return { org_name: found.org.branding?.display_name?.trim() || found.org.name }
}

// PUBLIC (intake_token = authorization). Layered abuse protection, then
// customer dedup + lead create via the guard-free cores.
export async function submitIntake(
  token: string,
  input: IntakeSubmission,
  elapsedMs: number
): Promise<{ ok: true }> {
  const found = await findOrgByIntakeToken(token)
  if (!found) throw new Error(MSG_UNAVAILABLE)
  const { orgId, org } = found

  // Bot layers: indistinguishable fake success, zero writes. `!(x >= 3000)`
  // also catches NaN/undefined from a tampered client.
  if (input.website?.trim() || !(elapsedMs >= 3000)) return { ok: true }

  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim()
  const ipHash = createHash('sha256').update(ip || 'unknown').digest('hex')
  const [byIp, byOrg] = await Promise.all([
    checkRateLimit(`intake:ip:${ipHash}`, { limit: 5, windowMs: 60 * 60 * 1000 }),
    checkRateLimit(`intake:org:${orgId}`, { limit: 30, windowMs: 60 * 60 * 1000 }),
  ])
  if (!byIp.allowed || !byOrg.allowed) throw new Error(MSG_RATE_LIMITED)

  const name = (input.name ?? '').trim()
  const email = (input.email ?? '').trim()
  const phone = (input.phone ?? '').trim()
  const eventType = (input.event_type ?? '').trim()
  const eventDate = (input.event_date ?? '').trim()
  const message = (input.message ?? '').trim()
  const guestCount = input.guest_count

  if (!name || name.length > 200) throw new Error('Please enter your name.')
  if (!email || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please enter a valid email address.')
  }
  if (phone.length > 200 || eventType.length > 200) {
    throw new Error('That submission looks too long.')
  }
  if (message.length > 2000) throw new Error('Please keep your message under 2000 characters.')
  if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    throw new Error('Please pick a valid event date.')
  }
  if (
    guestCount != null &&
    (!Number.isInteger(guestCount) || guestCount < 0 || guestCount > 100000)
  ) {
    throw new Error('Please enter a valid guest count.')
  }

  const { customer } = await findOrCreateCustomerCore(orgId, {
    name,
    email,
    ...(phone ? { phone } : {}),
  })
  const lead = await createLeadCore(orgId, {
    name,
    stage: 'inquiry',
    customer_id: customer.id,
    email,
    ...(phone ? { phone } : {}),
    ...(eventType ? { event_type: eventType } : {}),
    ...(eventDate ? { event_date: eventDate } : {}),
    ...(guestCount != null ? { guest_count: guestCount } : {}),
    ...(message ? { notes: message } : {}),
  })

  // Best-effort from here down — the business write has committed.
  await logActivity(orgId, {
    parent_type: 'opportunity',
    parent_id: lead.id,
    kind: 'form',
    summary: 'New inquiry from intake form',
  })

  try {
    const ownerSnap = await adminDb
      .collection('orgs')
      .doc(orgId)
      .collection('members')
      .where('role', '==', 'owner')
      .limit(1)
      .get()
    const ownerEmail = ownerSnap.empty
      ? undefined
      : (ownerSnap.docs[0].data() as { email?: string }).email
    if (ownerEmail) {
      await sendIntakeNotification({
        to: ownerEmail,
        orgName: org.name,
        leadName: name,
        email,
        ...(phone ? { phone } : {}),
        ...(eventType ? { eventType } : {}),
        ...(eventDate ? { eventDate } : {}),
        ...(guestCount != null ? { guestCount } : {}),
        ...(message ? { message } : {}),
        opportunityUrl: `${APP_ORIGIN}/${org.slug}/leads/${lead.id}`,
      })
    }
  } catch (err) {
    console.error('sendIntakeNotification failed', err)
  }

  return { ok: true }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run __tests__/actions/intake-public.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add actions/intake-public.ts __tests__/actions/intake-public.test.ts
git commit -m "feat(intake): public submission action — honeypot, time gate, rate limits, owner email"
```

---

### Task 6: Public form page + `IntakeForm` component

**Files:**
- Create: `app/(public)/inquire/[token]/page.tsx`
- Create: `components/public/IntakeForm.tsx`
- Test: `__tests__/components/public/IntakeForm.test.tsx`

**Interfaces:**
- Consumes: `getIntakeFormInfo` and `submitIntake` (Task 5), shadcn `Button`/`Input`/`Label`/`Card`.
- Produces: the public page. No other task depends on these files.

- [ ] **Step 1: Write the failing component test**

```tsx
// __tests__/components/public/IntakeForm.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const submitIntakeSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }))
vi.mock('@/actions/intake-public', () => ({ submitIntake: submitIntakeSpy }))

import { IntakeForm } from '@/components/public/IntakeForm'

beforeEach(() => vi.clearAllMocks())

function fillRequired() {
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
}

describe('IntakeForm', () => {
  it('submits the payload with token, honeypot, and elapsed time', async () => {
    render(<IntakeForm token="tok_1" orgName="Brew Cart Co" />)
    fillRequired()
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'Wedding' } })
    fireEvent.change(screen.getByLabelText('Guest count'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }))
    await waitFor(() => expect(submitIntakeSpy).toHaveBeenCalledTimes(1))
    const [token, payload, elapsed] = submitIntakeSpy.mock.calls[0]
    expect(token).toBe('tok_1')
    expect(payload).toEqual(
      expect.objectContaining({
        name: 'Ada', email: 'ada@example.com', event_type: 'Wedding',
        guest_count: 120, website: '',
      })
    )
    expect(typeof elapsed).toBe('number')
  })

  it('shows the thank-you panel after success', async () => {
    render(<IntakeForm token="tok_1" orgName="Brew Cart Co" />)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }))
    expect(await screen.findByText(/Brew Cart Co will get back to you/)).toBeInTheDocument()
  })

  it('renders the action error in the aria-live region', async () => {
    submitIntakeSpy.mockRejectedValueOnce(new Error('Too many requests — please try again later.'))
    render(<IntakeForm token="tok_1" orgName="Brew Cart Co" />)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }))
    expect(
      await screen.findByText('Too many requests — please try again later.')
    ).toBeInTheDocument()
  })

  it('keeps the submit button disabled until name and email are filled', () => {
    render(<IntakeForm token="tok_1" orgName="Brew Cart Co" />)
    expect(screen.getByRole('button', { name: 'Send inquiry' })).toBeDisabled()
    fillRequired()
    expect(screen.getByRole('button', { name: 'Send inquiry' })).toBeEnabled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/components/public/IntakeForm.test.tsx`
Expected: FAIL — cannot resolve `@/components/public/IntakeForm`.

- [ ] **Step 3: Implement the component**

```tsx
// components/public/IntakeForm.tsx
'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { submitIntake } from '@/actions/intake-public'

interface IntakeFormProps {
  token: string
  orgName: string
}

export function IntakeForm({ token, orgName }: IntakeFormProps) {
  const [mountedAt] = useState(() => Date.now())
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [eventType, setEventType] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [guestCount, setGuestCount] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot

  async function handleSubmit() {
    if (!name.trim() || !email.trim()) return
    setSending(true)
    setError(null)
    try {
      const parsedGuests = guestCount.trim() === '' ? undefined : Number(guestCount)
      await submitIntake(
        token,
        {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          event_type: eventType.trim() || undefined,
          event_date: eventDate.trim() || undefined,
          message: message.trim() || undefined,
          website,
          ...(parsedGuests != null && !Number.isNaN(parsedGuests)
            ? { guest_count: parsedGuests }
            : {}),
        },
        Date.now() - mountedAt
      )
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-2">
          <p className="text-lg font-medium">Thanks — your inquiry is in.</p>
          <p className="text-sm text-muted-foreground">{orgName} will get back to you soon.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div aria-live="polite" aria-atomic="true">
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakeName">Your name</Label>
          <Input id="intakeName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakeEmail">Email</Label>
          <Input id="intakeEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakePhone">Phone</Label>
          <Input id="intakePhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakeEventType">Event type</Label>
          <Input id="intakeEventType" value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="e.g. Wedding" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakeEventDate">Event date</Label>
          <Input id="intakeEventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakeGuestCount">Guest count</Label>
          <Input id="intakeGuestCount" type="number" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakeMessage">Message</Label>
          <textarea
            id="intakeMessage"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us about your event"
            className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div aria-hidden="true" className="sr-only">
          <label htmlFor="intakeWebsite">Website</label>
          <input
            id="intakeWebsite"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={sending || !name.trim() || !email.trim()}
        >
          {sending ? 'Sending…' : 'Send inquiry'}
        </Button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Implement the page**

```tsx
// app/(public)/inquire/[token]/page.tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getIntakeFormInfo } from '@/actions/intake-public'
import { IntakeForm } from '@/components/public/IntakeForm'

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const info = await getIntakeFormInfo(token)
  if (!info) notFound()
  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold">{info.org_name}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Tell us about your event and we&apos;ll get back to you.
      </p>
      <IntakeForm token={token} orgName={info.org_name} />
    </div>
  )
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run __tests__/components/public/IntakeForm.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add "app/(public)/inquire" components/public/IntakeForm.tsx __tests__/components/public/IntakeForm.test.tsx
git commit -m "feat(intake): public /inquire/[token] page and form"
```

---

### Task 7: Intake link card on the pipeline page

**Files:**
- Create: `components/admin/pipeline/IntakeLinkCard.tsx`
- Modify: `components/admin/pipeline/PipelineListClient.tsx:125-139` (header button + card mount)
- Test: `__tests__/components/IntakeLinkCard.test.tsx`; existing `__tests__/components/pipeline-list.test.tsx` must stay green

**Interfaces:**
- Consumes: `ensureIntakeToken`, `regenerateIntakeToken` (Task 4).
- Produces: `IntakeLinkCard({ orgId, open, onClose })` client component, same toggle pattern as `NewOpportunityForm`. Link base is `process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://traxevent.com'` — never `window.location.origin` (on an org subdomain the proxy would rewrite `/inquire/...` into the org's route space and break the link).
- Placement: list view only — it is the pipeline's default view and carries the entry point; the board view header stays untouched in this increment.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/IntakeLinkCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const { ensureSpy, regenSpy } = vi.hoisted(() => ({
  ensureSpy: vi.fn().mockResolvedValue('tok_aaa'),
  regenSpy: vi.fn().mockResolvedValue('tok_bbb'),
}))
vi.mock('@/actions/intake', () => ({
  ensureIntakeToken: ensureSpy,
  regenerateIntakeToken: regenSpy,
}))

import { IntakeLinkCard } from '@/components/admin/pipeline/IntakeLinkCard'

beforeEach(() => vi.clearAllMocks())

describe('IntakeLinkCard', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<IntakeLinkCard orgId="o1" open={false} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
    expect(ensureSpy).not.toHaveBeenCalled()
  })

  it('mints (or fetches) the token on open and shows the URL', async () => {
    render(<IntakeLinkCard orgId="o1" open onClose={() => {}} />)
    expect(await screen.findByText(/\/inquire\/tok_aaa/)).toBeInTheDocument()
    expect(ensureSpy).toHaveBeenCalledWith('o1')
  })

  it('regenerate requires a confirm, then swaps the URL', async () => {
    render(<IntakeLinkCard orgId="o1" open onClose={() => {}} />)
    await screen.findByText(/tok_aaa/)
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    expect(regenSpy).not.toHaveBeenCalled()
    expect(screen.getByText(/current link will stop working/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, regenerate' }))
    expect(await screen.findByText(/\/inquire\/tok_bbb/)).toBeInTheDocument()
    expect(regenSpy).toHaveBeenCalledWith('o1')
  })

  it('copies the URL to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<IntakeLinkCard orgId="o1" open onClose={() => {}} />)
    await screen.findByText(/tok_aaa/)
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/inquire/tok_aaa'))
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/components/IntakeLinkCard.test.tsx`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement the card**

```tsx
// components/admin/pipeline/IntakeLinkCard.tsx
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ensureIntakeToken, regenerateIntakeToken } from '@/actions/intake'

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://traxevent.com'

interface IntakeLinkCardProps {
  orgId: string
  open: boolean
  onClose: () => void
}

export function IntakeLinkCard({ orgId, open, onClose }: IntakeLinkCardProps) {
  const [token, setToken] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || token) return
    ensureIntakeToken(orgId)
      .then(setToken)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load the intake link')
      )
  }, [open, token, orgId])

  if (!open) return null
  const url = token ? `${APP_ORIGIN}/inquire/${token}` : null

  async function handleRegenerate() {
    setBusy(true)
    setError(null)
    try {
      setToken(await regenerateIntakeToken(orgId))
      setConfirming(false)
      setCopied(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Intake link</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div aria-live="polite" aria-atomic="true">
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <p className="text-sm text-muted-foreground">
          Share this link anywhere — your website, social bio, or a QR code. Inquiries land in
          your pipeline and you&apos;ll get an email.
        </p>
        {url ? (
          <p className="break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs">{url}</p>
        ) : (
          !error && <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {confirming ? (
          <div className="space-y-2">
            <p className="text-sm">The current link will stop working. Anyone holding it gets a 404.</p>
            <div className="flex gap-2">
              <Button variant="destructive" onClick={handleRegenerate} disabled={busy}>
                {busy ? 'Regenerating…' : 'Yes, regenerate'}
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!url}
              onClick={async () => {
                if (!url) return
                await navigator.clipboard.writeText(url)
                setCopied(true)
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button variant="outline" disabled={!url} onClick={() => url && window.open(url, '_blank')}>
              Open
            </Button>
            <Button variant="outline" disabled={!token} onClick={() => setConfirming(true)}>
              Regenerate
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

(`variant="destructive"` is a real variant — verified in `components/ui/button.tsx`.)

- [ ] **Step 4: Wire into `PipelineListClient`**

In `components/admin/pipeline/PipelineListClient.tsx`:
1. Import: `import { IntakeLinkCard } from './IntakeLinkCard'`
2. Add state next to the existing `creating` state: `const [intakeOpen, setIntakeOpen] = useState(false)`
3. In the header actions div (currently lines 125–132), before the New opportunity button:

```tsx
<Button variant="outline" onClick={() => setIntakeOpen((v) => !v)}>Intake link</Button>
```

4. Next to the `NewOpportunityForm` mount (line 139):

```tsx
<IntakeLinkCard orgId={orgId} open={intakeOpen} onClose={() => setIntakeOpen(false)} />
```

- [ ] **Step 5: Run new + existing pipeline tests**

Run: `npx vitest run __tests__/components/IntakeLinkCard.test.tsx __tests__/components/pipeline-list.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/admin/pipeline/IntakeLinkCard.tsx components/admin/pipeline/PipelineListClient.tsx __tests__/components/IntakeLinkCard.test.tsx
git commit -m "feat(intake): pipeline intake-link card — copy, open, regenerate"
```

---

### Task 8: Full verification + roadmap

**Files:**
- Modify: `docs/ROADMAP.md` (move intake from Backlog to Shipped; note the new rate-limit seam)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run --exclude '**/.claude/**'`
Expected: all green. (The exclude keeps worktree copies under `.claude/` out of the run when executing from the primary checkout.)

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: success. This is the gate that catches `'use server'` export violations that `tsc` misses.

- [ ] **Step 3: Update the roadmap**

In `docs/ROADMAP.md`: remove the **Public intake form** entry from "Backlog (no plan written yet)", add to "Shipped (high level)":

```markdown
- **Public intake form** — tokenized `/inquire/[token]` front door: creates
  customer + opportunity at `inquiry`, logs a `form` activity event, emails the
  owner. First abuse-protection seam: honeypot + time gate + Firestore-backed
  rate limiting (`lib/rate-limit.ts`) — registration should adopt it next.
```

Also update the "Last updated" date at the top.

- [ ] **Step 4: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: roadmap — public intake form shipped"
```

---

## Manual verification (post-implementation, needs a dev server)

Not automatable in this plan; walk once before merging:
1. Pipeline → Intake link → Copy; open the URL in a private window.
2. Submit a real inquiry → appears in the inquiry column; timeline shows the form event; owner email arrives (requires `RESEND_API_KEY`).
3. Submit again 5× quickly from the same IP → generic rate-limit error.
4. Regenerate the link → old URL 404s, new URL works.
