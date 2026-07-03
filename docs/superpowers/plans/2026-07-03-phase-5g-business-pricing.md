# Phase 5g: Business Pricing Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offer a **Business** plan ($79/month) alongside the existing **Standard** plan ($199/year). An org admin picks a plan at checkout; the chosen plan is recorded on the org and shown on the billing page. Completes the Phase 5 business vertical.

**Architecture:** Extends the existing org-subscription flow (`actions/billing.ts` + `/api/billing/checkout` + `/api/billing/webhook`). Two Stripe prices: `STRIPE_PRICE_ID` (standard, $199/yr) and a new `STRIPE_BUSINESS_PRICE_ID` (business, $79/mo). `createCheckoutSession` takes a `plan` and selects the price; the plan is carried in Stripe metadata; the webhook records `org.plan` on activation. Pure plan metadata (names/labels) lives in `lib/billing-plans.ts` (no env — safe for the client); price-id resolution stays server-side in the action.

**Tech Stack:** Next.js 16 App Router, Firebase Admin, Stripe (lazy proxy), Vitest. Stripe keys are NOT yet on Vercel — all logic is unit-tested with mocked Stripe; live checkout activates once `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, and the new `STRIPE_BUSINESS_PRICE_ID` are set.

**Baseline:** 497 tests passing (run `npm install` first; use `npx vitest run --maxWorkers=2` if the env shows worker-spawn timeouts — those are not assertion failures).

---

### Task 1: BillingPlan type + plan metadata + env

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/billing-plans.ts`
- Modify: `.env.example`
- Create: `__tests__/lib/billing-plans.test.ts`

- [ ] **Step 1: Write the failing test** — `__tests__/lib/billing-plans.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { BILLING_PLANS, BILLING_PLAN_IDS } from '@/lib/billing-plans'

describe('BILLING_PLANS', () => {
  it('has a standard and a business plan with names and price labels', () => {
    expect(BILLING_PLAN_IDS).toEqual(['standard', 'business'])
    expect(BILLING_PLANS.standard).toMatchObject({ id: 'standard', name: 'Standard', priceLabel: '$199/year' })
    expect(BILLING_PLANS.business).toMatchObject({ id: 'business', name: 'Business', priceLabel: '$79/month' })
    for (const id of BILLING_PLAN_IDS) {
      expect(BILLING_PLANS[id].blurb).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/lib/billing-plans.test.ts` → FAIL.

- [ ] **Step 3: Update `lib/types.ts`** — add `BillingPlan` and `plan` on `Org` (after the `billing_status` line):

```typescript
export type BillingPlan = 'standard' | 'business'
```
and inside `interface Org` add:
```typescript
  plan?: BillingPlan
```

- [ ] **Step 4: Create `lib/billing-plans.ts`** (pure — no `process.env`, safe to import client-side)

```typescript
import type { BillingPlan } from '@/lib/types'

export interface BillingPlanInfo {
  id: BillingPlan
  name: string
  priceLabel: string
  blurb: string
}

export const BILLING_PLANS: Record<BillingPlan, BillingPlanInfo> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    priceLabel: '$199/year',
    blurb: 'Unlimited events and registrants — for camps, ministries, and nonprofits.',
  },
  business: {
    id: 'business',
    name: 'Business',
    priceLabel: '$79/month',
    blurb: 'For wedding, floral, and corporate event businesses — leads, proposals, invoices, contracts.',
  },
}

export const BILLING_PLAN_IDS: BillingPlan[] = ['standard', 'business']
```

- [ ] **Step 5: Update `.env.example`** — add after the existing `STRIPE_PRICE_ID` line:
```
# Monthly price for the Business plan ($79/mo); Standard uses STRIPE_PRICE_ID
STRIPE_BUSINESS_PRICE_ID=price_xxx
```

- [ ] **Step 6: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run --maxWorkers=2` all green.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/billing-plans.ts .env.example "__tests__/lib/billing-plans.test.ts"
git commit -m "feat: BillingPlan type + plan metadata + business price env"
```

---

### Task 2: Plan-aware checkout + webhook plan capture

**Files:**
- Modify: `actions/billing.ts` (`createCheckoutSession` gains a `plan` param)
- Modify: `app/api/billing/checkout/route.ts` (pass `plan` through)
- Modify: `app/api/billing/webhook/route.ts` (record `plan` on org activation)
- Create: `__tests__/actions/billing.test.ts`
- Modify: `__tests__/api/billing-webhook.test.ts`

- [ ] **Step 1: Write the failing tests**

`__tests__/actions/billing.test.ts` (new) — hoisted spies; mock `@/lib/stripe` (`checkout.sessions.create` → returns `{ url: 'https://cs' }`), `@/actions/orgs` (`getOrg` → `{ id:'org-1', slug:'o' }`), `@/lib/auth/assert` (`assertOrgAdmin` → resolve). Set `process.env.STRIPE_PRICE_ID='price_std'`, `process.env.STRIPE_BUSINESS_PRICE_ID='price_biz'`, `process.env.NEXT_PUBLIC_BASE_URL='http://localhost'`. Cover **createCheckoutSession**:
- default (no plan) → `line_items[0].price === 'price_std'`, `metadata.plan === 'standard'`, `subscription_data.metadata.plan === 'standard'` (and `metadata.orgId === 'org-1'`), returns the url.
- `plan: 'business'` → `line_items[0].price === 'price_biz'`, `metadata.plan === 'business'`.
- an invalid plan (e.g. `'gold'` cast) → throws `'Invalid plan'` (no Stripe call).
- when the selected plan's price env is unset → throws `'Plan price is not configured'`.

Extend `__tests__/api/billing-webhook.test.ts` — add a case: `checkout.session.completed` with `metadata: { orgId: 'org-1', plan: 'business' }` and a customer → `orgUpdateSpy` called with an object including `plan: 'business'` (alongside `billing_status: 'active'`, `stripe_customer_id`). Keep existing cases green (a completed session with NO `plan` must still work — `plan` simply absent from the update).

- [ ] **Step 2: Run to verify they fail** — FAIL.

- [ ] **Step 3: Edit `actions/billing.ts`**

Add imports + a price resolver, and thread `plan` through:
```typescript
import { BILLING_PLAN_IDS } from '@/lib/billing-plans'
import type { BillingPlan } from '@/lib/types'

function planPriceId(plan: BillingPlan): string {
  const id = plan === 'business' ? process.env.STRIPE_BUSINESS_PRICE_ID : process.env.STRIPE_PRICE_ID
  if (!id) throw new Error('Plan price is not configured')
  return id
}

export async function createCheckoutSession(orgId: string, orgSlug: string, plan: BillingPlan = 'standard'): Promise<string> {
  await assertOrgAdmin(orgId)
  if (!BILLING_PLAN_IDS.includes(plan)) throw new Error('Invalid plan')
  const org = await getOrg(orgId)
  if (!org) throw new Error('Organization not found')

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: planPriceId(plan), quantity: 1 }],
    metadata: { orgId, plan },
    subscription_data: {
      metadata: { orgId, plan },
    },
    ...(org.stripe_customer_id ? { customer: org.stripe_customer_id } : {}),
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${orgSlug}/billing?success=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${orgSlug}/billing`,
  })

  if (!session.url) throw new Error('Stripe did not return a session URL')
  return session.url
}
```
(Validate `plan` BEFORE the Stripe call so the invalid-plan test asserts no session created. Place the `BILLING_PLAN_IDS` check first — note it runs after `assertOrgAdmin`, which is fine.)

- [ ] **Step 4: Edit `app/api/billing/checkout/route.ts`**

Read `plan` from the body and pass it (default undefined → action defaults to standard):
```typescript
  const { orgId, orgSlug, plan } = await req.json()
  ...
  const url = await createCheckoutSession(orgId, orgSlug, plan)
```
(Type `plan` loosely as it comes from JSON; the action validates it.)

- [ ] **Step 5: Edit `app/api/billing/webhook/route.ts`** — in the `checkout.session.completed` ORG branch (the one that reads `session.metadata?.orgId`), also read `plan` and include it in the update when present:
```typescript
      const orgId = session.metadata?.orgId
      if (!orgId) break
      const plan = session.metadata?.plan
      await orgRef(orgId).update({
        billing_status: 'active',
        stripe_customer_id: customerId,
        ...(plan ? { plan } : {}),
      })
      break
```
(Leave the network branch and the subscription.updated/deleted cases unchanged.)

- [ ] **Step 6: Run tests** — both files PASS; `npx tsc --noEmit` clean; `npx vitest run --maxWorkers=2` all green.

- [ ] **Step 7: Commit**

```bash
git add actions/billing.ts "app/api/billing/checkout/route.ts" "app/api/billing/webhook/route.ts" "__tests__/actions/billing.test.ts" "__tests__/api/billing-webhook.test.ts"
git commit -m "feat: plan-aware org checkout (standard/business) + webhook plan capture"
```

---

### Task 3: Plan chooser on the billing page

**Files:**
- Modify: `app/(admin)/[orgSlug]/billing/page.tsx`

No new vitest tests; `npx tsc --noEmit`, `npx vitest run`, and `npx next build` must pass.

- [ ] **Step 1: Thread a plan through `handleSubscribe`**

Change the handler to accept a plan and send it:
```tsx
import { BILLING_PLANS, BILLING_PLAN_IDS } from '@/lib/billing-plans'
import type { BillingPlan } from '@/lib/types'
...
  async function handleSubscribe(plan: BillingPlan) {
    if (!org) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org.id, orgSlug: org.slug, plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(data.url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout')
    } finally {
      setLoading(false)
    }
  }
```

- [ ] **Step 2: Replace the single subscribe button with a plan chooser**

In the subscription Card, replace the static "$199 / year" line + single Subscribe button:
- When `org.billing_status === 'active'`: show the current plan — `Current plan: {BILLING_PLANS[org.plan ?? 'standard'].name} — {BILLING_PLANS[org.plan ?? 'standard'].priceLabel}`.
- When `org.billing_status !== 'active' && org.billing_status !== 'network_managed'`: render both plans from `BILLING_PLAN_IDS` as two option cards (each: `BILLING_PLANS[id].name`, `priceLabel`, `blurb`, and a "Choose {name}" button → `handleSubscribe(id)`, disabled while `loading`).
- Keep the `network_managed` "Covered by your network" line as-is, and keep the "Manage subscription" button (shown when `org.stripe_customer_id`).
- Keep the existing `error` aria-live region and the `Status` badge row.

- [ ] **Step 3: Verify**

- `npx tsc --noEmit` clean.
- `npx vitest run --maxWorkers=2` all green (unchanged count from Task 2).
- `npx next build` (copy env: `cp /Users/rm/vw/traxevent/.env.local .env.local`, build, then `rm -f .env.local`) → succeeds; `/[orgSlug]/billing` builds; no collisions.

- [ ] **Step 4: Commit** (do NOT add `.env.local`)

```bash
git add "app/(admin)/[orgSlug]/billing/page.tsx"
git commit -m "feat: billing page plan chooser (Standard vs Business) + current-plan display"
```

---

### Task 4: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run --maxWorkers=2` → all green; record final count.
- [ ] **Step 3:** `npx next build` (with `.env.local`) → succeeds; no collisions.
- [ ] **Step 4:** Commit this plan file (`docs: phase 5g ...`).
- [ ] **Step 5:** Hand back for branch finish (push + PR + squash-merge as `Lifewithmo`, verify prod deploy). Surface carryover: **Vercel needs the new `STRIPE_BUSINESS_PRICE_ID`** (plus the existing Stripe env vars) for the Business plan to be purchasable live.

---

## Self-Review

**Spec coverage:** Roadmap "Business pricing tier ($79/month, replaces $199/year for business orgs)": a Business plan offered alongside Standard, chosen at checkout, recorded on the org, shown on billing (Task 1/2/3). Covered. Completes Phase 5.

**Placeholder scan:** Types, plan metadata, action, route, and webhook edits are verbatim. The billing-page chooser is specified behaviorally against the existing page structure — acceptable for mechanical UI.

**Type consistency:** `BillingPlan` (Task 1) used by `lib/billing-plans.ts`, `actions/billing.ts`, and the billing page. `BILLING_PLANS`/`BILLING_PLAN_IDS` signatures match across def + callers. `createCheckoutSession(orgId, orgSlug, plan?)` matches the checkout route caller and the billing-page fetch body. `Org.plan` is written by the webhook and read by the billing page.

**Security note:** No new auth surface. `createCheckoutSession` stays `assertOrgAdmin`-gated and now validates `plan` against `BILLING_PLAN_IDS` before any Stripe call; price ids are resolved server-side from env (never client input). The webhook keeps signature verification first and only adds a `plan` field (from the Stripe-signed metadata) to the org's own doc — no new write surface, no cross-tenant effect. `lib/billing-plans.ts` is pure (no secrets) so it's safe on the client.
