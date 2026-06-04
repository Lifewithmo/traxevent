# Phase 1b: Stripe Billing + Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Stripe Billing ($199/yr subscription) and Stripe Connect Standard (1% platform fee on event payments) so orgs can pay for TraxEvent and accept registration payments from registrants.

**Architecture:** Three payment flows sharing one Stripe server client (`lib/stripe.ts`): (1) org pays TraxEvent $199/yr via Stripe Billing Checkout — webhook receives `checkout.session.completed` and sets `org.billing_status = 'active'`; (2) org connects their own Stripe account via Connect Standard OAuth — stored as `org.stripe_account_id`; (3) registrant pays for an event via Stripe Payment Element — PaymentIntent created on the connected account with 1% `application_fee_amount` automatically splitting fees to TraxEvent. All Stripe secret key operations are server-side only.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest + React Testing Library, Firebase Admin SDK (Firestore), Stripe Node SDK (`stripe`), `@stripe/stripe-js`, `@stripe/react-stripe-js`

**Prerequisite:** Phase 1a PR merged to main before branching. This plan reads `Camp` fields added in Phase 1a (`event_type_id`, `registration_open`, etc.) and relies on the Phase 1a `updateCamp` server action.

---

## Environment Variables Required

Add to `.env.local` (local dev) and Vercel project settings (production):

```
STRIPE_SECRET_KEY=sk_test_...                  # TraxEvent platform secret key (never expose client-side)
STRIPE_WEBHOOK_SECRET=whsec_...                # Billing webhook signing secret
STRIPE_PAYMENT_WEBHOOK_SECRET=whsec_...        # Registration payment webhook signing secret
STRIPE_PRICE_ID=price_...                      # $199/yr recurring price ID (create in Stripe Dashboard)
STRIPE_CLIENT_ID=ca_...                        # Connect application client ID (from Stripe Connect settings)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... # Client-side publishable key
NEXT_PUBLIC_BASE_URL=http://localhost:3000     # Full base URL, no trailing slash
```

Create all price IDs and webhook endpoints in the Stripe Dashboard before testing end-to-end.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/stripe.ts` | Create | Server-side Stripe client singleton |
| `lib/types.ts` | Modify | Add `stripe_customer_id?`, `stripe_account_id?` to Org; `payment_amount?` to Camp |
| `actions/billing.ts` | Create | `createCheckoutSession()`, `createBillingPortalSession()` |
| `actions/camps.ts` | Modify | Add `payment_amount` to `updateCamp` Pick allowlist |
| `app/api/billing/checkout/route.ts` | Create | POST → create Stripe Checkout session, return redirect URL |
| `app/api/billing/portal/route.ts` | Create | POST → create Stripe Customer Portal session, return redirect URL |
| `app/api/billing/webhook/route.ts` | Create | POST → handle subscription lifecycle events |
| `app/api/connect/oauth/route.ts` | Create | GET → redirect to Stripe Connect OAuth URL |
| `app/api/connect/callback/route.ts` | Create | GET → exchange OAuth code, store `stripe_account_id` |
| `app/api/payments/intent/route.ts` | Create | POST → create PaymentIntent on connected account with 1% fee |
| `app/api/payments/webhook/route.ts` | Create | POST → confirm payment, mark Family as paid |
| `app/(admin)/[orgSlug]/billing/page.tsx` | Create | Subscription status + Connect Stripe section |
| `components/layout/AdminSidebar.tsx` | Modify | Add "Billing" link to org-level bottom nav |
| `app/(admin)/[orgSlug]/[campSlug]/settings/page.tsx` | Modify | Add "Registration fee" field |
| `components/registration/steps/PaymentStep.tsx` | Create | Stripe Payment Element for registration checkout |
| `components/registration/RegistrationForm.tsx` | Modify | Add payment step when `camp.payment_amount > 0` |
| `__tests__/api/billing-webhook.test.ts` | Create | Billing webhook event handler tests |
| `__tests__/api/connect-callback.test.ts` | Create | Connect OAuth callback tests |
| `__tests__/api/payments-intent.test.ts` | Create | PaymentIntent creation tests |
| `__tests__/api/payments-webhook.test.ts` | Create | Payment webhook handler tests |

---

## Task 1: Install Stripe + scaffold shared infrastructure

**Files:**
- Create: `lib/stripe.ts`
- Modify: `lib/types.ts`
- Modify: `actions/camps.ts`

- [ ] **Step 1: Install packages**

```bash
npm install stripe @stripe/stripe-js @stripe/react-stripe-js
```

Expected: `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js` added to `package.json`.

- [ ] **Step 2: Find the installed Stripe API version**

```bash
node -e "const s = require('./node_modules/stripe'); console.log(s.LATEST_API_VERSION ?? 'check manually')"
```

Note the version string (e.g. `'2025-05-28.basil'`) — use it in the next step.

- [ ] **Step 3: Create `lib/stripe.ts`**

```typescript
// lib/stripe.ts
import Stripe from 'stripe'

// apiVersion: use the value from Step 2 — the installed SDK pins a specific version
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil', // replace with output of Step 2
})
```

- [ ] **Step 4: Update `lib/types.ts` — add Stripe fields**

Add `stripe_customer_id` and `stripe_account_id` to `Org` (after `billing_status`):

```typescript
export interface Org {
  id: string
  name: string
  slug: string
  billing_status: 'active' | 'trialing' | 'inactive'
  stripe_customer_id?: string   // set after first successful subscription checkout
  stripe_account_id?: string    // set after Stripe Connect OAuth
  created_at: string
}
```

Add `payment_amount` to `Camp` (alongside the Phase 1a fields `event_type_id`, `capacity`, etc.):

```typescript
export interface Camp {
  // ... existing Phase 1a fields ...
  payment_amount?: number  // registration fee in dollars (e.g. 150 = $150.00); omit or 0 for free events
}
```

- [ ] **Step 5: Update `actions/camps.ts` — add `payment_amount` to `updateCamp` allowlist**

In `updateCamp`, extend the `Partial<Pick<Camp, ...>>` type to include `'payment_amount'`:

```typescript
export async function updateCamp(
  orgId: string,
  campId: string,
  updates: Partial<Pick<Camp,
    | 'name'
    | 'status'
    | 'event_type_id'
    | 'registration_type'
    | 'camp_start'
    | 'camp_end'
    | 'registration_open'
    | 'registration_close'
    | 'capacity'
    | 'payment_amount'   // ← add this
  >>
): Promise<void> {
  // body unchanged
}
```

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Run tests**

```bash
npx vitest run
```

Expected: all existing tests pass — the type additions are backward-compatible.

- [ ] **Step 8: Commit**

```bash
git add lib/stripe.ts lib/types.ts actions/camps.ts package.json package-lock.json
git commit -m "feat: install Stripe SDK, scaffold shared types (stripe_customer_id, stripe_account_id, payment_amount)"
```

---

## Task 2: Platform subscription — checkout + webhook

**Files:**
- Create: `actions/billing.ts`
- Create: `app/api/billing/checkout/route.ts`
- Create: `app/api/billing/portal/route.ts`
- Create: `app/api/billing/webhook/route.ts`
- Create: `__tests__/api/billing-webhook.test.ts`

- [ ] **Step 1: Write failing billing webhook tests**

```typescript
// __tests__/api/billing-webhook.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted spies — must precede vi.mock() factories
const orgUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const constructEventSpy = vi.hoisted(() => vi.fn())
const getHeadersSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        update: orgUpdateSpy,
      }),
    }),
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: constructEventSpy,
    },
  },
}))

vi.mock('next/headers', () => ({
  headers: getHeadersSpy,
}))

import { POST } from '@/app/api/billing/webhook/route'

describe('POST /api/billing/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getHeadersSpy.mockResolvedValue({
      get: (key: string) => (key === 'stripe-signature' ? 'test-sig' : null),
    })
  })

  it('returns 400 when stripe-signature header is missing', async () => {
    getHeadersSpy.mockResolvedValue({ get: () => null })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when webhook signature is invalid', async () => {
    constructEventSpy.mockImplementation(() => { throw new Error('Bad sig') })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('sets billing_status active and stores stripe_customer_id on checkout.session.completed', async () => {
    constructEventSpy.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { orgId: 'org-1' },
          customer: 'cus_abc123',
        },
      },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"checkout.session.completed"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(orgUpdateSpy).toHaveBeenCalledWith({
      billing_status: 'active',
      stripe_customer_id: 'cus_abc123',
    })
  })

  it('sets billing_status inactive on customer.subscription.deleted', async () => {
    constructEventSpy.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: { metadata: { orgId: 'org-1' } },
      },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"customer.subscription.deleted"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(orgUpdateSpy).toHaveBeenCalledWith({ billing_status: 'inactive' })
  })

  it('sets billing_status inactive when subscription status is past_due', async () => {
    constructEventSpy.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: { metadata: { orgId: 'org-1' }, status: 'past_due' },
      },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"customer.subscription.updated"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(orgUpdateSpy).toHaveBeenCalledWith({ billing_status: 'inactive' })
  })

  it('sets billing_status active when subscription status is active', async () => {
    constructEventSpy.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: { metadata: { orgId: 'org-1' }, status: 'active' },
      },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"customer.subscription.updated"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(orgUpdateSpy).toHaveBeenCalledWith({ billing_status: 'active' })
  })

  it('returns 200 without calling update for unrecognized event types', async () => {
    constructEventSpy.mockReturnValue({
      type: 'payment_intent.created',
      data: { object: { metadata: { orgId: 'org-1' } } },
    })
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{"type":"payment_intent.created"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(orgUpdateSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run __tests__/api/billing-webhook.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/billing/webhook/route'`

- [ ] **Step 3: Create `actions/billing.ts`**

```typescript
// actions/billing.ts
'use server'

import { stripe } from '@/lib/stripe'
import { getOrg } from '@/actions/orgs'

export async function createCheckoutSession(orgId: string, orgSlug: string): Promise<string> {
  const org = await getOrg(orgId)
  if (!org) throw new Error('Organization not found')

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    metadata: { orgId },
    subscription_data: {
      metadata: { orgId }, // propagated to subscription so sub lifecycle events have orgId
    },
    ...(org.stripe_customer_id ? { customer: org.stripe_customer_id } : {}),
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${orgSlug}/billing?success=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${orgSlug}/billing`,
  })

  return session.url!
}

export async function createBillingPortalSession(orgId: string, orgSlug: string): Promise<string> {
  const org = await getOrg(orgId)
  if (!org?.stripe_customer_id) throw new Error('No Stripe customer found — subscribe first')

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${orgSlug}/billing`,
  })

  return session.url
}
```

- [ ] **Step 4: Create `app/api/billing/checkout/route.ts`**

```typescript
// app/api/billing/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createCheckoutSession } from '@/actions/billing'

export async function POST(req: NextRequest) {
  const { orgId, orgSlug } = await req.json()
  if (!orgId || !orgSlug) {
    return NextResponse.json({ error: 'Missing orgId or orgSlug' }, { status: 400 })
  }
  try {
    const url = await createCheckoutSession(orgId, orgSlug)
    return NextResponse.json({ url })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create checkout' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 5: Create `app/api/billing/portal/route.ts`**

```typescript
// app/api/billing/portal/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createBillingPortalSession } from '@/actions/billing'

export async function POST(req: NextRequest) {
  const { orgId, orgSlug } = await req.json()
  if (!orgId || !orgSlug) {
    return NextResponse.json({ error: 'Missing orgId or orgSlug' }, { status: 400 })
  }
  try {
    const url = await createBillingPortalSession(orgId, orgSlug)
    return NextResponse.json({ url })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to open portal' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 6: Create `app/api/billing/webhook/route.ts`**

```typescript
// app/api/billing/webhook/route.ts
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { headers } from 'next/headers'
import { adminDb } from '@/lib/firebase-admin'

export async function POST(req: Request) {
  const body = await req.text()
  const headersList = await headers()
  const sig = headersList.get('stripe-signature')

  if (!sig) return new Response('Missing stripe-signature header', { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  const orgRef = (orgId: string) => adminDb.collection('orgs').doc(orgId)

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId = session.metadata?.orgId
      if (!orgId) break
      await orgRef(orgId).update({
        billing_status: 'active',
        stripe_customer_id: session.customer as string,
      })
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.orgId
      if (!orgId) break
      await orgRef(orgId).update({ billing_status: 'inactive' })
      break
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.orgId
      if (!orgId) break
      await orgRef(orgId).update({
        billing_status: sub.status === 'active' ? 'active' : 'inactive',
      })
      break
    }
  }

  return new Response('ok')
}
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
npx vitest run __tests__/api/billing-webhook.test.ts
```

Expected: PASS — 6 tests

- [ ] **Step 8: Run full test suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add actions/billing.ts \
  "app/api/billing/checkout/route.ts" \
  "app/api/billing/portal/route.ts" \
  "app/api/billing/webhook/route.ts" \
  "__tests__/api/billing-webhook.test.ts"
git commit -m "feat: Stripe Billing checkout + webhook — subscription events update org billing_status"
```

---

## Task 3: Billing page + sidebar link

**Files:**
- Create: `app/(admin)/[orgSlug]/billing/page.tsx`
- Modify: `components/layout/AdminSidebar.tsx`

No unit tests needed — client component calling fetch routes already tested in Task 2.

- [ ] **Step 1: Create `app/(admin)/[orgSlug]/billing/page.tsx`**

```tsx
// app/(admin)/[orgSlug]/billing/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { getOrgBySlug } from '@/actions/orgs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Org } from '@/lib/types'

export default function BillingPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [org, setOrg] = useState<Org | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const justSubscribed = searchParams.get('success') === '1'
  const justConnected = searchParams.get('connected') === '1'

  useEffect(() => {
    getOrgBySlug(orgSlug).then(setOrg)
  }, [orgSlug])

  async function handleSubscribe() {
    if (!org) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org.id, orgSlug: org.slug }),
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

  async function handleManage() {
    if (!org) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org.id, orgSlug: org.slug }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(data.url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to open portal')
    } finally {
      setLoading(false)
    }
  }

  if (!org) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  const statusVariant: 'default' | 'secondary' | 'destructive' =
    org.billing_status === 'active' ? 'default'
    : org.billing_status === 'trialing' ? 'secondary'
    : 'destructive'

  const statusLabel =
    org.billing_status === 'active' ? 'Active'
    : org.billing_status === 'trialing' ? 'Trial'
    : 'Inactive'

  return (
    <div className="p-6 max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Billing</h1>

      {justSubscribed && (
        <div aria-live="polite">
          <p className="text-sm text-accent">Subscription activated — welcome to TraxEvent!</p>
        </div>
      )}

      {justConnected && (
        <div aria-live="polite">
          <p className="text-sm text-accent">Stripe account connected. You can now collect registration payments.</p>
        </div>
      )}

      {/* TraxEvent subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">TraxEvent subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">$199 / year — unlimited events, unlimited registrants</p>
          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {org.billing_status !== 'active' && (
              <Button onClick={handleSubscribe} disabled={loading}>
                {loading ? 'Redirecting…' : 'Subscribe — $199/year'}
              </Button>
            )}
            {org.stripe_customer_id && (
              <Button variant="outline" onClick={handleManage} disabled={loading}>
                {loading ? 'Opening…' : 'Manage subscription'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stripe Connect — registration payments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registration payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {org.stripe_account_id ? (
            <>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Stripe account</span>
                <Badge variant="default">Connected</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Registration payments go directly to your Stripe account. TraxEvent collects a 1% platform fee automatically.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Connect your Stripe account to collect registration payments. Money goes directly to you — TraxEvent takes 1% automatically.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  window.location.href = `/api/connect/oauth?orgId=${org.id}&orgSlug=${org.slug}`
                }}
              >
                Connect Stripe account
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Add "Billing" link to `components/layout/AdminSidebar.tsx`**

In the bottom `<div>` section (where the "Members" link lives), add a Billing link after Members:

```tsx
// In the bottom <div className="px-2 py-4 border-t border-gray-700 space-y-0.5">
<Link href={`/${orgSlug}/billing`} className={navClass(`/${orgSlug}/billing`)}>
  Billing
</Link>
```

The full bottom section becomes:
```tsx
<div className="px-2 py-4 border-t border-gray-700 space-y-0.5">
  <Link href={`/${orgSlug}/members`} className={navClass(`/${orgSlug}/members`)}>
    Members
  </Link>
  <Link href={`/${orgSlug}/billing`} className={navClass(`/${orgSlug}/billing`)}>
    Billing
  </Link>
</div>
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/[orgSlug]/billing/page.tsx" components/layout/AdminSidebar.tsx
git commit -m "feat: billing page (subscribe + manage) and sidebar Billing link"
```

---

## Task 4: Stripe Connect Standard

**Files:**
- Create: `app/api/connect/oauth/route.ts`
- Create: `app/api/connect/callback/route.ts`
- Create: `__tests__/api/connect-callback.test.ts`

- [ ] **Step 1: Write failing connect callback tests**

```typescript
// __tests__/api/connect-callback.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const orgUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const oauthTokenSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        update: orgUpdateSpy,
      }),
    }),
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    oauth: {
      token: oauthTokenSpy,
    },
  },
}))

import { GET } from '@/app/api/connect/callback/route'

describe('GET /api/connect/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000'
  })

  it('exchanges code and stores stripe_account_id, then redirects to billing page', async () => {
    oauthTokenSpy.mockResolvedValue({ stripe_user_id: 'acct_123xyz' })
    const state = encodeURIComponent(JSON.stringify({ orgId: 'org-1', orgSlug: 'acme' }))
    const req = new Request(`http://localhost/api/connect/callback?code=auth_code_abc&state=${state}`)
    const res = await GET(req)
    expect(oauthTokenSpy).toHaveBeenCalledWith({
      grant_type: 'authorization_code',
      code: 'auth_code_abc',
    })
    expect(orgUpdateSpy).toHaveBeenCalledWith({ stripe_account_id: 'acct_123xyz' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost:3000/acme/billing?connected=1')
  })

  it('returns 400 when code is missing', async () => {
    const state = encodeURIComponent(JSON.stringify({ orgId: 'org-1', orgSlug: 'acme' }))
    const req = new Request(`http://localhost/api/connect/callback?state=${state}`)
    const res = await GET(req)
    expect(res.status).toBe(400)
    expect(oauthTokenSpy).not.toHaveBeenCalled()
  })

  it('returns 400 when state is missing', async () => {
    const req = new Request('http://localhost/api/connect/callback?code=auth_code_abc')
    const res = await GET(req)
    expect(res.status).toBe(400)
    expect(oauthTokenSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run __tests__/api/connect-callback.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/connect/callback/route'`

- [ ] **Step 3: Create `app/api/connect/oauth/route.ts`**

```typescript
// app/api/connect/oauth/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId')
  const orgSlug = req.nextUrl.searchParams.get('orgSlug')
  if (!orgId || !orgSlug) {
    return NextResponse.json({ error: 'Missing orgId or orgSlug' }, { status: 400 })
  }

  const state = JSON.stringify({ orgId, orgSlug })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.STRIPE_CLIENT_ID!,
    scope: 'read_write',
    state,
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/connect/callback`,
  })

  return NextResponse.redirect(
    `https://connect.stripe.com/oauth/authorize?${params.toString()}`
  )
}
```

- [ ] **Step 4: Create `app/api/connect/callback/route.ts`**

```typescript
// app/api/connect/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { adminDb } from '@/lib/firebase-admin'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const stateRaw = req.nextUrl.searchParams.get('state')

  if (!code) return new Response('Missing code', { status: 400 })
  if (!stateRaw) return new Response('Missing state', { status: 400 })

  let orgId: string
  let orgSlug: string
  try {
    const state = JSON.parse(stateRaw) as { orgId: string; orgSlug: string }
    orgId = state.orgId
    orgSlug = state.orgSlug
  } catch {
    return new Response('Invalid state parameter', { status: 400 })
  }

  const response = await stripe.oauth.token({
    grant_type: 'authorization_code',
    code,
  })

  await adminDb.collection('orgs').doc(orgId).update({
    stripe_account_id: response.stripe_user_id,
  })

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_BASE_URL}/${orgSlug}/billing?connected=1`
  )
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run __tests__/api/connect-callback.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add \
  "app/api/connect/oauth/route.ts" \
  "app/api/connect/callback/route.ts" \
  "__tests__/api/connect-callback.test.ts"
git commit -m "feat: Stripe Connect Standard OAuth flow — org connects Stripe account for registration payments"
```

---

## Task 5: Registration payment collection

**Files:**
- Modify: `app/(admin)/[orgSlug]/[campSlug]/settings/page.tsx`
- Create: `app/api/payments/intent/route.ts`
- Create: `app/api/payments/webhook/route.ts`
- Create: `components/registration/steps/PaymentStep.tsx`
- Modify: `components/registration/RegistrationForm.tsx`
- Create: `__tests__/api/payments-intent.test.ts`
- Create: `__tests__/api/payments-webhook.test.ts`

The registration payment flow:
1. Admin sets `payment_amount` on an event via the event settings page
2. Registrant reaches the payment step (shown when `camp.payment_amount > 0`)
3. Frontend calls `POST /api/payments/intent` → server creates PaymentIntent on the org's connected account with 1% `application_fee_amount`
4. Frontend mounts Stripe Payment Element with the `clientSecret`
5. Registrant submits card details → Stripe charges the card
6. `payment_intent.succeeded` webhook fires → server marks the Family as `payment_status: 'paid'`

- [ ] **Step 1: Write failing payment intent tests**

```typescript
// __tests__/api/payments-intent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createPaymentIntentSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn((col: string) => ({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            empty: false,
            docs: [{
              data: () => ({
                id: 'org-1',
                slug: 'acme',
                stripe_account_id: 'acct_abc',
              }),
            }],
          }),
        }),
      }),
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                empty: false,
                docs: [{
                  data: () => ({
                    id: 'camp-1',
                    slug: 'summer-2026',
                    payment_amount: 150,
                  }),
                }],
              }),
            }),
          }),
        }),
      }),
    })),
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: {
      create: createPaymentIntentSpy,
    },
  },
}))

import { POST } from '@/app/api/payments/intent/route'

describe('POST /api/payments/intent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createPaymentIntentSpy.mockResolvedValue({
      client_secret: 'pi_test_secret_abc',
      id: 'pi_123',
    })
  })

  it('creates PaymentIntent with correct amount in cents and 1% application fee', async () => {
    const req = new Request('http://localhost/api/payments/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgSlug: 'acme', campSlug: 'summer-2026' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(createPaymentIntentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 15000,              // $150 × 100
        currency: 'usd',
        application_fee_amount: 150, // 1% of 15000
      }),
      { stripeAccount: 'acct_abc' }
    )
    const body = await res.json()
    expect(body.clientSecret).toBe('pi_test_secret_abc')
    expect(body.stripeAccountId).toBe('acct_abc')
  })
})
```

- [ ] **Step 2: Write failing payment webhook tests**

```typescript
// __tests__/api/payments-webhook.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const familyUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const constructEventSpy = vi.hoisted(() => vi.fn())
const getHeadersSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            empty: false,
            docs: [{
              ref: { update: familyUpdateSpy },
              data: () => ({ id: 'fam-1', payment_status: 'unpaid' }),
            }],
          }),
        }),
      }),
    }),
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: constructEventSpy,
    },
  },
}))

vi.mock('next/headers', () => ({
  headers: getHeadersSpy,
}))

import { POST } from '@/app/api/payments/webhook/route'

describe('POST /api/payments/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getHeadersSpy.mockResolvedValue({
      get: (key: string) => (key === 'stripe-signature' ? 'test-sig' : null),
    })
  })

  it('returns 400 on invalid signature', async () => {
    constructEventSpy.mockImplementation(() => { throw new Error('Bad sig') })
    const req = new Request('http://localhost/api/payments/webhook', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('marks family as paid on payment_intent.succeeded', async () => {
    constructEventSpy.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          amount: 15000,
          metadata: { familyId: 'fam-1' },
        },
      },
    })
    const req = new Request('http://localhost/api/payments/webhook', {
      method: 'POST',
      body: '{"type":"payment_intent.succeeded"}',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(familyUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: 'paid',
        amount_paid: 150, // 15000 cents → $150
      })
    )
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx vitest run __tests__/api/payments-intent.test.ts __tests__/api/payments-webhook.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 4: Create `app/api/payments/intent/route.ts`**

```typescript
// app/api/payments/intent/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { adminDb } from '@/lib/firebase-admin'
import type { Org, Camp } from '@/lib/types'

export async function POST(req: NextRequest) {
  const { orgSlug, campSlug } = await req.json()
  if (!orgSlug || !campSlug) {
    return NextResponse.json({ error: 'Missing orgSlug or campSlug' }, { status: 400 })
  }

  // Look up org by slug
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) return NextResponse.json({ error: 'Org not found' }, { status: 404 })
  const org = orgSnap.docs[0].data() as Org

  if (!org.stripe_account_id) {
    return NextResponse.json({ error: 'This organization has not connected a Stripe account' }, { status: 400 })
  }

  // Look up camp by slug
  const campSnap = await adminDb
    .collection('orgs').doc(org.id)
    .collection('camps').where('slug', '==', campSlug).limit(1)
    .get()
  if (campSnap.empty) return NextResponse.json({ error: 'Camp not found' }, { status: 404 })
  const camp = campSnap.docs[0].data() as Camp

  if (!camp.payment_amount || camp.payment_amount <= 0) {
    return NextResponse.json({ error: 'This event has no payment amount configured' }, { status: 400 })
  }

  const amountCents = Math.round(camp.payment_amount * 100)
  const applicationFeeCents = Math.round(amountCents * 0.01) // 1% platform fee

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: 'usd',
      application_fee_amount: applicationFeeCents,
      automatic_payment_methods: { enabled: true },
    },
    { stripeAccount: org.stripe_account_id }
  )

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    stripeAccountId: org.stripe_account_id,
  })
}
```

- [ ] **Step 5: Create `app/api/payments/webhook/route.ts`**

```typescript
// app/api/payments/webhook/route.ts
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { headers } from 'next/headers'
import { adminDb } from '@/lib/firebase-admin'

export async function POST(req: Request) {
  const body = await req.text()
  const headersList = await headers()
  const sig = headersList.get('stripe-signature')

  if (!sig) return new Response('Missing stripe-signature header', { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_PAYMENT_WEBHOOK_SECRET!)
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent
    const familyId = pi.metadata?.familyId
    if (!familyId) return new Response('ok') // no metadata, ignore

    // Look up the family record across all orgs/camps
    const snap = await adminDb
      .collectionGroup('families')
      .where('id', '==', familyId)
      .limit(1)
      .get()

    if (!snap.empty) {
      await snap.docs[0].ref.update({
        payment_status: 'paid',
        amount_paid: pi.amount / 100, // cents → dollars
        updated_at: new Date().toISOString(),
      })
    }
  }

  return new Response('ok')
}
```

- [ ] **Step 6: Run payment API tests to confirm they pass**

```bash
npx vitest run __tests__/api/payments-intent.test.ts __tests__/api/payments-webhook.test.ts
```

Expected: PASS — 2 intent tests + 2 webhook tests

- [ ] **Step 7: Add "Registration fee" field to the event settings page**

In `app/(admin)/[orgSlug]/[campSlug]/settings/page.tsx`:

Add `payment_amount` state alongside the existing form fields:
```tsx
const [paymentAmount, setPaymentAmount] = useState<string>('')
```

In the `useEffect` load function, initialize it:
```tsx
setPaymentAmount(c.payment_amount != null ? String(c.payment_amount) : '')
```

In `handleSave`, include it in the `updateCamp` call:
```tsx
payment_amount: paymentAmount ? Number(paymentAmount) : undefined,
```

Add the form field before the submit button:
```tsx
<div className="space-y-1">
  <Label htmlFor="paymentAmount">Registration fee (optional)</Label>
  <Input
    id="paymentAmount"
    type="number"
    min={0}
    step="0.01"
    value={paymentAmount}
    onChange={(e) => { setPaymentAmount(e.target.value); setSaved(false) }}
    placeholder="0 for free events"
  />
  <p className="text-xs text-muted-foreground">
    In dollars. Leave blank or 0 for free events. TraxEvent collects 1% of paid registrations automatically.
  </p>
</div>
```

- [ ] **Step 8: Create `components/registration/steps/PaymentStep.tsx`**

```tsx
// components/registration/steps/PaymentStep.tsx
'use client'

import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'

interface PaymentStepProps {
  orgSlug: string
  campSlug: string
  paymentAmount: number
  onSuccess: () => void
  onBack: () => void
}

function CheckoutForm({ onSuccess, onBack }: { onSuccess: () => void; onBack: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    const result = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })
    if (result.error) {
      setError(result.error.message ?? 'Payment failed')
      setSubmitting(false)
    } else {
      onSuccess()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button type="submit" disabled={submitting || !stripe}>
          {submitting ? 'Processing…' : 'Pay and complete registration'}
        </Button>
      </div>
    </form>
  )
}

export function PaymentStep({ orgSlug, campSlug, paymentAmount, onSuccess, onBack }: PaymentStepProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/payments/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgSlug, campSlug }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setLoadError(data.error)
        } else {
          setClientSecret(data.clientSecret)
          setStripeAccountId(data.stripeAccountId)
        }
      })
      .catch(() => setLoadError('Failed to initialize payment'))
  }, [orgSlug, campSlug])

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" onClick={onBack}>Back</Button>
      </div>
    )
  }

  if (!clientSecret || !stripeAccountId) {
    return <p className="text-sm text-muted-foreground">Loading payment form…</p>
  }

  const stripePromise = loadStripe(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
    { stripeAccount: stripeAccountId }
  )

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">Registration fee</p>
        <p className="text-2xl font-bold">${paymentAmount.toFixed(2)}</p>
      </div>
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <CheckoutForm onSuccess={onSuccess} onBack={onBack} />
      </Elements>
    </div>
  )
}
```

- [ ] **Step 9: Update `components/registration/RegistrationForm.tsx`**

Add the payment step when `camp.payment_amount > 0`. The current STEPS array is `['Contact Information', 'Family Members', 'Review']`.

Replace the entire file:

```tsx
// components/registration/RegistrationForm.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ContactStep } from './steps/ContactStep'
import { FamilyMembersStep } from './steps/FamilyMembersStep'
import { ReviewStep } from './steps/ReviewStep'
import { PaymentStep } from './steps/PaymentStep'
import { createRegistration } from '@/actions/registrations'
import type { Camp, Family, FamilyMember, Org } from '@/lib/types'

type ContactData = Pick<Family, 'first_name' | 'last_name' | 'email' | 'phone' | 'address' | 'emergency_contact'>
type MemberInput = Omit<FamilyMember, 'id' | 'family_id'>

interface RegistrationFormProps {
  camp: Camp
  org: Org
}

export function RegistrationForm({ camp, org }: RegistrationFormProps) {
  const router = useRouter()
  const hasFee = (camp.payment_amount ?? 0) > 0

  const STEPS = hasFee
    ? ['Contact Information', 'Family Members', 'Review', 'Payment'] as const
    : ['Contact Information', 'Family Members', 'Review'] as const

  const [step, setStep] = useState(0)
  const [contact, setContact] = useState<Partial<ContactData>>({})
  const [members, setMembers] = useState<MemberInput[]>([])
  const [registrationCreated, setRegistrationCreated] = useState(false)

  async function handleReviewSubmit() {
    const result = await createRegistration({
      orgId: org.id,
      campId: camp.id,
      orgSlug: org.slug,
      campSlug: camp.slug,
      campName: camp.name,
      orgName: org.name,
      family: contact as ContactData,
      members,
    })
    setRegistrationCreated(true)
    if (!hasFee) {
      router.push(
        `/${org.slug}/${camp.slug}/register/confirmation?email=${encodeURIComponent((contact as ContactData).email)}`
      )
    } else {
      setStep(3) // go to payment step
    }
    return result
  }

  function handlePaymentSuccess() {
    router.push(
      `/${org.slug}/${camp.slug}/register/confirmation?email=${encodeURIComponent((contact as ContactData).email)}`
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF5FF] py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <p className="text-xs font-semibold text-[#7C3AED] uppercase tracking-wide mb-1">
            {org.name}
          </p>
          <h1 className="text-2xl font-bold text-[#4C1D95]">{camp.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Step {step + 1} of {STEPS.length}
          </p>
          <div className="mt-3 h-1.5 bg-[#DDD6FE] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#7C3AED] rounded-full transition-all"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#DDD6FE] p-6">
          {step === 0 && (
            <ContactStep
              initial={contact}
              onNext={(data) => { setContact(data); setStep(1) }}
            />
          )}
          {step === 1 && (
            <FamilyMembersStep
              initial={members}
              onNext={(m) => { setMembers(m); setStep(2) }}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <ReviewStep
              contact={contact as ContactData}
              members={members}
              campName={camp.name}
              onSubmit={handleReviewSubmit}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && hasFee && (
            <PaymentStep
              orgSlug={org.slug}
              campSlug={camp.slug}
              paymentAmount={camp.payment_amount!}
              onSuccess={handlePaymentSuccess}
              onBack={() => setStep(2)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
```

**Important:** The registration record is created *before* payment (at the Review step). This ensures the family exists in Firestore before the payment webhook arrives. The payment webhook uses `familyId` in `PaymentIntent.metadata` to update the record — you'll need to pass `familyId` to the PaymentIntent. Update `app/api/payments/intent/route.ts` to accept `familyId` in the request body and set it in `PaymentIntent.metadata`:

```typescript
// In POST handler, update the request destructure:
const { orgSlug, campSlug, familyId } = await req.json()

// Pass familyId in metadata:
const paymentIntent = await stripe.paymentIntents.create(
  {
    amount: amountCents,
    currency: 'usd',
    application_fee_amount: applicationFeeCents,
    automatic_payment_methods: { enabled: true },
    metadata: { familyId: familyId ?? '' },
  },
  { stripeAccount: org.stripe_account_id }
)
```

And update `PaymentStep.tsx` to accept and forward `familyId`:

```tsx
// Add to PaymentStepProps:
familyId?: string

// Pass it in the fetch body:
body: JSON.stringify({ orgSlug, campSlug, familyId }),
```

And update `RegistrationForm.tsx` to capture the `familyId` from `createRegistration` and pass it to `PaymentStep`:

```tsx
const [familyId, setFamilyId] = useState<string | undefined>()

// In handleReviewSubmit:
const result = await createRegistration(...)
setFamilyId(result.familyId)
setRegistrationCreated(true)

// In PaymentStep render:
<PaymentStep
  orgSlug={org.slug}
  campSlug={camp.slug}
  paymentAmount={camp.payment_amount!}
  familyId={familyId}
  onSuccess={handlePaymentSuccess}
  onBack={() => setStep(2)}
/>
```

- [ ] **Step 10: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 11: Run full test suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add \
  "app/(admin)/[orgSlug]/[campSlug]/settings/page.tsx" \
  "app/api/payments/intent/route.ts" \
  "app/api/payments/webhook/route.ts" \
  "components/registration/steps/PaymentStep.tsx" \
  "components/registration/RegistrationForm.tsx" \
  "__tests__/api/payments-intent.test.ts" \
  "__tests__/api/payments-webhook.test.ts"
git commit -m "feat: Stripe Payment Element on registration form — 1% platform fee split via Connect"
```

---

## Self-Review Checklist

After all tasks, run:

```bash
npx vitest run
npx tsc --noEmit
```

Both must be clean before marking this plan complete.

**Spec coverage check:**
- [x] $199/year subscription via Stripe Billing — Task 2
- [x] Stripe checkout → active subscription — Task 2 (checkout route + webhook)
- [x] Subscription management (cancel/renew via Customer Portal) — Task 2 (portal route) + Task 3 (billing page)
- [x] Billing portal for orgs (self-serve) — Task 3
- [x] Stripe Connect Standard onboarding — Task 4
- [x] Money flows directly to org — Task 5 (PaymentIntent on connected account)
- [x] 1% platform fee split automatically — Task 5 (`application_fee_amount`)
- [x] Payment collection on registration forms — Task 5 (PaymentStep + RegistrationForm)
- [x] `billing_status` lifecycle (`trialing` → `active` → `inactive`) — Task 2 webhook

**Not in scope for Phase 1b (deferred):**
- Billing middleware gate (block `inactive` orgs from admin) — low risk in Phase 1, add in a future hardening pass
- Disconnect Stripe account — deferred, orgs can reconnect any time
- Trial expiry date display — Stripe manages trial end via subscription status
- Refunds — handled in Stripe Dashboard by org admins
