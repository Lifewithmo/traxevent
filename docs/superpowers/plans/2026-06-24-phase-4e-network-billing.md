# Phase 4e: Network-Wide Billing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a network (denomination) pay ONE consolidated per-seat subscription on behalf of all its member orgs. Member orgs covered by an active network subscription become `network_managed` (they no longer pay individually). Network admins get a billing page (subscribe / manage + per-org status & seat count); member-org billing pages show "Covered by your network".

**Architecture:** Reuse the existing org-subscription pattern (Stripe Checkout `mode: 'subscription'` + Customer Portal + the `/api/billing/webhook` endpoint). Add network-level Stripe fields, a new per-seat price (`STRIPE_NETWORK_PRICE_ID`, quantity = member-org count), and a webhook branch keyed on `metadata.networkId` that updates the network doc AND cascades `billing_status` to all member orgs. Pure helpers summarize member billing for the UI.

**Tech Stack:** Next.js 16 App Router, Firebase Admin, Stripe (lazy proxy `lib/stripe.ts`, API `2026-05-27.dahlia`), Vitest. Stripe keys are NOT yet on Vercel — all logic is unit-tested with mocked Stripe; live checkout/webhooks activate once `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_NETWORK_PRICE_ID` are set.

**Baseline:** 339 tests passing (run `npm install` first in this worktree so the `server-only` shim resolves).

---

### Task 1: Types, env, and pure member-billing helpers

**Files:**
- Modify: `lib/types.ts`
- Modify: `.env.example`
- Create: `lib/network-billing.ts`
- Create: `__tests__/lib/network-billing.test.ts`

- [ ] **Step 1: Write the failing test** — `__tests__/lib/network-billing.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { seatCount, summarizeMemberBilling, memberBillingLabel } from '@/lib/network-billing'
import type { Org } from '@/lib/types'

const org = (billing_status: Org['billing_status']): Org =>
  ({ id: 'o', name: 'o', slug: 'o', billing_status, created_at: '' }) as Org

describe('seatCount', () => {
  it('is the number of member orgs', () => {
    expect(seatCount([org('active'), org('trialing')])).toBe(2)
    expect(seatCount([])).toBe(0)
  })
})

describe('summarizeMemberBilling', () => {
  it('counts orgs by billing status', () => {
    const s = summarizeMemberBilling([
      org('active'), org('network_managed'), org('network_managed'), org('trialing'), org('inactive'),
    ])
    expect(s).toEqual({ total: 5, active: 1, trialing: 1, inactive: 1, networkManaged: 2 })
  })

  it('treats an unknown/undefined status as inactive', () => {
    const s = summarizeMemberBilling([org(undefined as unknown as Org['billing_status'])])
    expect(s).toEqual({ total: 1, active: 0, trialing: 0, inactive: 1, networkManaged: 0 })
  })
})

describe('memberBillingLabel', () => {
  it('maps each status to a label', () => {
    expect(memberBillingLabel('active')).toBe('Active')
    expect(memberBillingLabel('trialing')).toBe('Trial')
    expect(memberBillingLabel('network_managed')).toBe('Network-managed')
    expect(memberBillingLabel('inactive')).toBe('Inactive')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/network-billing.test.ts`
Expected: FAIL — cannot resolve `@/lib/network-billing`.

- [ ] **Step 3: Update `lib/types.ts`**

Add `'network_managed'` to the `Org.billing_status` union:
```typescript
  billing_status: 'active' | 'trialing' | 'inactive' | 'network_managed'
```

Add billing fields to the `Network` interface:
```typescript
export interface Network {
  id: string
  name: string
  slug: string
  stripe_customer_id?: string
  billing_status?: 'active' | 'inactive'
  created_at: string
}
```

- [ ] **Step 4: Create `lib/network-billing.ts`**

```typescript
import type { Org } from '@/lib/types'

export interface MemberBillingSummary {
  total: number
  active: number
  trialing: number
  inactive: number
  networkManaged: number
}

// Seats billed for a network subscription = number of member orgs.
export function seatCount(orgs: Org[]): number {
  return orgs.length
}

export function summarizeMemberBilling(orgs: Org[]): MemberBillingSummary {
  const s: MemberBillingSummary = { total: orgs.length, active: 0, trialing: 0, inactive: 0, networkManaged: 0 }
  for (const o of orgs) {
    if (o.billing_status === 'active') s.active++
    else if (o.billing_status === 'trialing') s.trialing++
    else if (o.billing_status === 'network_managed') s.networkManaged++
    else s.inactive++
  }
  return s
}

export function memberBillingLabel(status: Org['billing_status']): string {
  switch (status) {
    case 'active': return 'Active'
    case 'trialing': return 'Trial'
    case 'network_managed': return 'Network-managed'
    default: return 'Inactive'
  }
}
```

- [ ] **Step 5: Update `.env.example`** — add after the existing `STRIPE_PRICE_ID` line:
```
# Per-seat price for network-wide (denomination) subscriptions; quantity = member-org count
STRIPE_NETWORK_PRICE_ID=price_xxx
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run __tests__/lib/network-billing.test.ts` → PASS.
Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all green.

NOTE: adding `'network_managed'` widens `Org.billing_status`. The org billing page (`app/(admin)/[orgSlug]/billing/page.tsx`) has exhaustive ternaries over the union — they still compile (the new value falls into the `: 'destructive'`/`: 'Inactive'` else branch) and are explicitly handled in Task 4. Confirm `npx tsc --noEmit` stays clean.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/network-billing.ts .env.example "__tests__/lib/network-billing.test.ts"
git commit -m "feat: network billing types + per-seat env + member-billing summary helpers"
```

---

### Task 2: Network billing server actions

**Files:**
- Create: `actions/network-billing.ts`
- Create: `__tests__/actions/network-billing.test.ts`

- [ ] **Step 1: Write the failing test** — `__tests__/actions/network-billing.test.ts`

Use hoisted spies. Mock `@/lib/stripe` (`{ stripe: { checkout: { sessions: { create } }, billingPortal: { sessions: { create } } } }`), `@/lib/auth/assert` (`assertNetworkAdmin` → resolve), and `@/lib/firebase-admin` `adminDb` so that:
- `adminDb.collection('networks').doc(id).get()` → returns a configurable network doc.
- `adminDb.collection('orgs').where('network_id','==',id).get()` → returns `{ size: N, docs: [...] }`.

Cover:
- **createNetworkCheckoutSession**: calls `assertNetworkAdmin('net-1')`; counts member orgs (mock size = 3); calls `stripe.checkout.sessions.create` with `mode:'subscription'`, `line_items:[{ price: <STRIPE_NETWORK_PRICE_ID>, quantity: 3 }]`, `metadata:{ networkId:'net-1' }`, `subscription_data.metadata.networkId='net-1'`; reuses `customer` when the network has `stripe_customer_id`; returns `session.url`. (Set `process.env.STRIPE_NETWORK_PRICE_ID='price_net'` and `process.env.NEXT_PUBLIC_BASE_URL='http://localhost'` in the test.)
- **createNetworkCheckoutSession with 0 member orgs** → quantity is `1` (Stripe requires ≥1).
- **createNetworkCheckoutSession** throws `'Stripe did not return a session URL'` when create resolves without `url`.
- **createNetworkBillingPortalSession**: throws `'No Stripe customer found — subscribe first'` when the network has no `stripe_customer_id`; otherwise calls `stripe.billingPortal.sessions.create` with `customer` and returns the url.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/actions/network-billing.test.ts`
Expected: FAIL — module/exports don't exist.

- [ ] **Step 3: Create `actions/network-billing.ts`**

```typescript
'use server'

import { stripe } from '@/lib/stripe'
import { adminDb } from '@/lib/firebase-admin'
import { assertNetworkAdmin } from '@/lib/auth/assert'
import type { Network } from '@/lib/types'

async function getNetwork(networkId: string): Promise<Network | null> {
  const snap = await adminDb.collection('networks').doc(networkId).get()
  return snap.exists ? (snap.data() as Network) : null
}

// Consolidated per-seat subscription for a whole network. quantity = member-org count.
export async function createNetworkCheckoutSession(networkId: string, networkSlug: string): Promise<string> {
  await assertNetworkAdmin(networkId)
  const network = await getNetwork(networkId)
  if (!network) throw new Error('Network not found')

  const orgsSnap = await adminDb.collection('orgs').where('network_id', '==', networkId).get()
  const quantity = Math.max(1, orgsSnap.size)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: process.env.STRIPE_NETWORK_PRICE_ID!, quantity }],
    metadata: { networkId },
    subscription_data: { metadata: { networkId } },
    ...(network.stripe_customer_id ? { customer: network.stripe_customer_id } : {}),
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/network/${networkSlug}/billing?success=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/network/${networkSlug}/billing`,
  })

  if (!session.url) throw new Error('Stripe did not return a session URL')
  return session.url
}

export async function createNetworkBillingPortalSession(networkId: string, networkSlug: string): Promise<string> {
  await assertNetworkAdmin(networkId)
  const network = await getNetwork(networkId)
  if (!network?.stripe_customer_id) throw new Error('No Stripe customer found — subscribe first')

  const session = await stripe.billingPortal.sessions.create({
    customer: network.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/network/${networkSlug}/billing`,
  })

  return session.url
}
```

NOTE (seat-sync follow-up — surface in the final report, do NOT build): quantity is set once at checkout time. Onboarding/removing orgs later does not auto-adjust the subscription quantity. A future task can update the Stripe subscription item quantity when member-org count changes.

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/actions/network-billing.test.ts` → PASS.
Run: `npx tsc --noEmit` → clean. Run: `npx vitest run` → all green.

- [ ] **Step 5: Commit**

```bash
git add actions/network-billing.ts "__tests__/actions/network-billing.test.ts"
git commit -m "feat: network checkout + billing-portal actions (per-seat subscription)"
```

---

### Task 3: Webhook — network branch + cascade member-org billing

**Files:**
- Modify: `app/api/billing/webhook/route.ts`
- Modify: `__tests__/api/billing-webhook.test.ts`

**SECURITY-RELEVANT:** signature verification must stay first; the cascade writes to many org docs.

**Context:** The webhook already verifies the signature via `stripe.webhooks.constructEvent(...)` and switches on event type. We add a `metadata.networkId` branch BEFORE the existing `orgId` branch in each handled case. Network events update `networks/{networkId}` and cascade `billing_status` to every member org (`orgs.where('network_id','==',networkId)`).

- [ ] **Step 1: Write the failing tests** — extend `__tests__/api/billing-webhook.test.ts`

The existing firebase-admin mock routes every `collection().doc().update()` to `orgUpdateSpy`. Replace it with a collection-aware mock:
- `collection('networks').doc(id).update()` → `networkUpdateSpy`
- `collection('orgs').doc(id).update()` → `orgUpdateSpy` (preserve existing org tests)
- `collection('orgs').where('network_id','==',id).get()` → resolves `{ docs: [{ ref: { update: memberUpdateSpy } }, { ref: { update: memberUpdateSpy } }] }` (configurable; default 2 member docs)

Keep all existing org-path tests green. Add:
- `checkout.session.completed` with `metadata.networkId:'net-1'` + `customer:'cus_net'` → `networkUpdateSpy` called with `{ billing_status:'active', stripe_customer_id:'cus_net' }` AND `memberUpdateSpy` called (per member) with `{ billing_status:'network_managed' }`; `orgUpdateSpy` NOT called.
- `customer.subscription.deleted` with `metadata.networkId:'net-1'` → `networkUpdateSpy` `{ billing_status:'inactive' }` and members → `{ billing_status:'inactive' }`.
- `customer.subscription.updated` with `metadata.networkId:'net-1'`, `status:'active'` → network `{ billing_status:'active' }`, members → `{ billing_status:'network_managed' }`.
- `customer.subscription.updated` with `metadata.networkId:'net-1'`, `status:'past_due'` → network `{ billing_status:'inactive' }`, members → `{ billing_status:'inactive' }`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/api/billing-webhook.test.ts`
Expected: FAIL — network branch not implemented; the org tests may also need the new mock shape.

- [ ] **Step 3: Edit `app/api/billing/webhook/route.ts`**

After the `constructEvent` block and the existing `orgRef` helper, add:
```typescript
  const networkRef = (networkId: string) => adminDb.collection('networks').doc(networkId)

  // Cascade a billing_status to every member org of a network.
  async function cascadeMemberOrgBilling(networkId: string, status: 'network_managed' | 'inactive') {
    const snap = await adminDb.collection('orgs').where('network_id', '==', networkId).get()
    await Promise.all(snap.docs.map((d) => d.ref.update({ billing_status: status })))
  }
```

Update each case to branch on `networkId` first:
```typescript
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const customerId = typeof session.customer === 'string'
        ? session.customer
        : (session.customer as Stripe.Customer | null)?.id
      if (!customerId) break
      const networkId = session.metadata?.networkId
      if (networkId) {
        await networkRef(networkId).update({ billing_status: 'active', stripe_customer_id: customerId })
        await cascadeMemberOrgBilling(networkId, 'network_managed')
        break
      }
      const orgId = session.metadata?.orgId
      if (!orgId) break
      await orgRef(orgId).update({ billing_status: 'active', stripe_customer_id: customerId })
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const networkId = sub.metadata?.networkId
      if (networkId) {
        await networkRef(networkId).update({ billing_status: 'inactive' })
        await cascadeMemberOrgBilling(networkId, 'inactive')
        break
      }
      const orgId = sub.metadata?.orgId
      if (!orgId) break
      await orgRef(orgId).update({ billing_status: 'inactive' })
      break
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const active = sub.status === 'active'
      const networkId = sub.metadata?.networkId
      if (networkId) {
        await networkRef(networkId).update({ billing_status: active ? 'active' : 'inactive' })
        await cascadeMemberOrgBilling(networkId, active ? 'network_managed' : 'inactive')
        break
      }
      const orgId = sub.metadata?.orgId
      if (!orgId) break
      await orgRef(orgId).update({ billing_status: active ? 'active' : 'inactive' })
      break
    }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/api/billing-webhook.test.ts` → PASS (existing + new).
Run: `npx tsc --noEmit` → clean. Run: `npx vitest run` → all green.

- [ ] **Step 5: Commit**

```bash
git add "app/api/billing/webhook/route.ts" "__tests__/api/billing-webhook.test.ts"
git commit -m "feat: network billing webhook branch — activate network sub + cascade member orgs to network_managed"
```

**REVIEW GATE:** security review after this task (webhook signature integrity preserved; cascade scope; no cross-network writes).

---

### Task 4: UI — network billing page, API routes, member-org "covered" state, nav

**Files:**
- Create: `app/api/billing/network-checkout/route.ts`
- Create: `app/api/billing/network-portal/route.ts`
- Create: `app/(network)/network/[networkSlug]/billing/page.tsx`
- Create: `components/network/NetworkBillingClient.tsx`
- Modify: `app/(admin)/[orgSlug]/billing/page.tsx`
- Modify: `app/(network)/network/[networkSlug]/layout.tsx`

No new vitest tests required; `npx tsc --noEmit`, `npx vitest run`, and `npx next build` must pass.

- [ ] **Step 1: API routes** — mirror the existing `app/api/billing/checkout/route.ts` exactly.

`app/api/billing/network-checkout/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createNetworkCheckoutSession } from '@/actions/network-billing'

export async function POST(req: NextRequest) {
  const { networkId, networkSlug } = await req.json()
  if (!networkId || !networkSlug) {
    return NextResponse.json({ error: 'Missing networkId or networkSlug' }, { status: 400 })
  }
  try {
    const url = await createNetworkCheckoutSession(networkId, networkSlug)
    return NextResponse.json({ url })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create checkout' }, { status: 500 })
  }
}
```
`app/api/billing/network-portal/route.ts`: identical shape calling `createNetworkBillingPortalSession`, error message `'Failed to open portal'`.

- [ ] **Step 2: Network billing page** — `app/(network)/network/[networkSlug]/billing/page.tsx`

```tsx
export const dynamic = 'force-dynamic'

import { requireNetworkAdmin } from '@/lib/auth/guards'
import { listNetworkOrgs } from '@/actions/networks'
import { NetworkBillingClient } from '@/components/network/NetworkBillingClient'

export default async function NetworkBillingPage({ params }: { params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const { network, networkId } = await requireNetworkAdmin(networkSlug)
  const orgs = await listNetworkOrgs(networkId)
  return <NetworkBillingClient network={network} networkId={networkId} orgs={orgs} />
}
```

- [ ] **Step 3: Network billing client** — `components/network/NetworkBillingClient.tsx`

`'use client'`, props `{ network: Network; networkId: string; orgs: Org[] }`. Pattern after the org billing page's fetch→redirect handlers and `NetworkDashboardClient` styling. Include:
  - A "TraxEvent network subscription" Card: status Badge from `network.billing_status` (`active` → "Active"/default, else "Inactive"/secondary); line `${seatCount(orgs)} member orgs × seat`; a **Subscribe** button (shown when `network.billing_status !== 'active'`) → `POST /api/billing/network-checkout` with `{ networkId, networkSlug: network.slug }` then `router.push(data.url)`; a **Manage subscription** button (shown when `network.stripe_customer_id`) → `POST /api/billing/network-portal`. Per-page `loading`/`error` state.
  - A "Member org billing" Card: table of `orgs` (name + a Badge with `memberBillingLabel(o.billing_status)`), plus a one-line summary from `summarizeMemberBilling(orgs)` (e.g. "2 network-managed · 1 active · 1 trialing · 0 inactive").
  - Read `useSearchParams().get('success') === '1'` → show "Network subscription activated" notice (wrap in `<Suspense>` like the org billing page, OR keep the page server-fetched and read success via a prop — simplest: mirror the org billing page's `<Suspense>` + `useSearchParams` structure inside the client component).

  Import `seatCount, summarizeMemberBilling, memberBillingLabel` from `@/lib/network-billing`; `Network, Org` from `@/lib/types`; UI from `@/components/ui/{card,button,badge}`.

- [ ] **Step 4: Member-org billing page "covered" state** — `app/(admin)/[orgSlug]/billing/page.tsx`

Handle `'network_managed'` in the status ternaries and gate the Subscribe button:
- `statusVariant`: `org.billing_status === 'active' ? 'default' : org.billing_status === 'trialing' || org.billing_status === 'network_managed' ? 'secondary' : 'destructive'`
- `statusLabel`: add `org.billing_status === 'network_managed' ? 'Network-managed'` branch.
- When `org.billing_status === 'network_managed'`, render a line "Covered by your network — billing is managed centrally." and do NOT render the Subscribe button. Change the subscribe condition to `org.billing_status !== 'active' && org.billing_status !== 'network_managed'`.

- [ ] **Step 5: Network nav link** — `app/(network)/network/[networkSlug]/layout.tsx`

Add an admin-only Billing link after "Onboard orgs":
```tsx
          {isAdmin && <a href={`/network/${networkSlug}/billing`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Billing</a>}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all green (unchanged count from Task 3).
Run: `npx next build` (copy env first: `cp /Users/rm/vw/traxevent/.env.local .env.local`, build, then `rm -f .env.local`) → succeeds; `/network/[networkSlug]/billing`, `/api/billing/network-checkout`, `/api/billing/network-portal` all appear; no route collisions.

- [ ] **Step 7: Commit** (do NOT add `.env.local`)

```bash
git add "app/api/billing/network-checkout/route.ts" "app/api/billing/network-portal/route.ts" "app/(network)/network/[networkSlug]/billing/page.tsx" components/network/NetworkBillingClient.tsx "app/(admin)/[orgSlug]/billing/page.tsx" "app/(network)/network/[networkSlug]/layout.tsx"
git commit -m "feat: network billing page + member-org network-managed state + nav"
```

---

### Task 5: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run` → all green; record final count.
- [ ] **Step 3:** `npx next build` (with `.env.local`) → succeeds; confirm new routes + no collisions.
- [ ] **Step 4:** Commit this plan file (`docs: phase 4e ...`).
- [ ] **Step 5:** Hand back for branch finish (push + PR + squash-merge as `Lifewithmo`, verify prod deploy). Surface the carryover: **Vercel needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the new `STRIPE_NETWORK_PRICE_ID`** for network billing to run live, and the seat-quantity-sync follow-up.

---

## Self-Review

**Spec coverage:** Roadmap "Network-wide pricing and billing management" + the user's chosen model (network pays one consolidated per-seat sub; member orgs become network-managed): network checkout/portal actions (Task 2), per-seat quantity = org count (Task 2), webhook activation + member cascade (Task 3), network billing UI + member "covered" state (Task 4), env var (Task 1). Covered.

**Placeholder scan:** Helper, actions, and webhook code are verbatim. The two client components are specified behaviorally with exact prop types, action/route names, and the reference files to match (`app/(admin)/[orgSlug]/billing/page.tsx`, `NetworkDashboardClient.tsx`) — acceptable for mechanical UI matching existing components.

**Type consistency:** `Org.billing_status` union (`+'network_managed'`), `Network.{stripe_customer_id,billing_status}`, and helper signatures (`seatCount`, `summarizeMemberBilling`→`MemberBillingSummary`, `memberBillingLabel`) are consistent across Tasks 1, 3, 4. Action signatures `createNetworkCheckoutSession(networkId, networkSlug)` / `createNetworkBillingPortalSession(networkId, networkSlug)` match their API-route callers in Task 4. Webhook reads `metadata.networkId` set by the actions' `metadata`/`subscription_data.metadata` in Task 2.

**Security note:** Signature verification (`constructEvent`) stays the first gate in the webhook (unchanged). The cascade query is strictly `network_id == networkId`, so a network event only ever writes orgs of that network — no cross-tenant writes. Both network actions are `assertNetworkAdmin`-gated. Member orgs cannot self-escape `network_managed` (only the webhook sets it, driven by Stripe events for the network's own subscription).
