# Brand Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multiple vertically-branded storefronts (starting with BrewTrax) served from the one TraxEvent codebase — hostname→brand mapping, brand landing pages, and signup that pre-configures the org's industry pack.

**Architecture:** A static brand registry (`lib/brands.ts`, structurally parallel to `lib/industry-packs.ts`) maps custom domains to brand configs. `proxy.ts` rewrites a brand domain's root path to a brand-scoped marketing route. Brand landing CTAs link to the main-domain signup with `?brand=` carried through signup → onboarding → `createOrg`, which stamps `brand_id` and the brand's `industry_pack_id` onto the new org. Auth stays entirely on the traxevent.com domain family — zero Firebase auth changes.

**Tech Stack:** Next.js 16 App Router (see AGENTS.md warning — check `node_modules/next/dist/docs/` before writing Next-specific code), Firestore via firebase-admin, Vitest + Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-05-multibrand-ops-platform-design.md` §2 (Brand & domain architecture).
- **v1 scope:** brands own *acquisition only*. The logged-in app stays on `traxevent.com` domains. Brand domains serve the landing page; every CTA sends users to the main domain. No Firebase authorized-domain changes, no cross-domain sessions.
- `lib/brands.ts` must stay dependency-free (no firebase imports, no server-only) — it is imported by `proxy.ts` (middleware runtime) and client components.
- This Next.js version has breaking changes vs. training data (AGENTS.md). Read the relevant guide in `node_modules/next/dist/docs/` before writing routing/searchParams code.
- Never re-export a type from a `'use server'` module — it breaks `next build` while tsc passes. Run `npm run build` before calling any task green that touched actions or routes.
- Run all tests from this worktree root only (`npm run test`), never from the primary checkout.
- Existing behavior must not change for the default brand: `traxevent.com`, `www.traxevent.com`, `{org}.traxevent.com`, and `localhost` all behave exactly as today.
- Brand names/copy: BrewTrax is the only non-default brand in v1. Naming rule from spec: native trade word + "trax".

## File Structure

- Create: `lib/brands.ts` — Brand type, registry (traxevent default + brewtrax), hostname lookup, signup-URL helper, brand-param validator. One responsibility: "which brand is this, and what does it say/link to."
- Create: `__tests__/lib/brands.test.ts`
- Modify: `proxy.ts` — brand-domain check ahead of the existing org-subdomain logic.
- Modify: `__tests__/middleware.test.ts` — brand rewrite cases.
- Modify: `lib/types.ts` — `Org.brand_id?: string`.
- Modify: `actions/orgs.ts` — `createOrg` accepts optional `brandId`.
- Create: `__tests__/actions/orgs-create.test.ts` — createOrg brand stamping.
- Create: `app/(marketing)/brand/[brandId]/page.tsx` — brand landing (server component).
- Modify: `app/(auth)/signup/page.tsx`, `app/(auth)/onboarding/page.tsx` — carry `?brand=` through to `createOrg`.
- Modify: `.env.example` — `NEXT_PUBLIC_APP_ORIGIN`.

---

### Task 1: Brand registry (`lib/brands.ts`)

**Files:**
- Create: `lib/brands.ts`
- Test: `__tests__/lib/brands.test.ts`

**Interfaces:**
- Consumes: nothing (dependency-free module).
- Produces (later tasks rely on these exact signatures):
  - `interface Brand { id: string; name: string; domains: string[]; industryPackId: string; theme: { accent: string }; marketing: { headline: string; subhead: string; cta: string } }`
  - `DEFAULT_BRAND_ID = 'traxevent'`
  - `getBrand(id?: string): Brand` (unknown/absent id → default brand)
  - `getAllBrands(): Brand[]`
  - `getBrandByHostname(hostname: string): Brand | null` (null = not a brand domain)
  - `validBrandParam(value: string | null | undefined): string | null` (returns the id only for known non-default brands)
  - `signupUrl(brandId: string): string`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/lib/brands.test.ts
import { describe, it, expect } from 'vitest'
import {
  getBrand,
  getAllBrands,
  getBrandByHostname,
  validBrandParam,
  signupUrl,
  DEFAULT_BRAND_ID,
} from '@/lib/brands'

describe('getBrand', () => {
  it('returns the brand for a known id', () => {
    expect(getBrand('brewtrax').name).toBe('BrewTrax')
  })

  it('falls back to the default brand for unknown or absent ids', () => {
    expect(getBrand('nope').id).toBe(DEFAULT_BRAND_ID)
    expect(getBrand(undefined).id).toBe(DEFAULT_BRAND_ID)
  })
})

describe('getAllBrands', () => {
  it('includes the default and brewtrax brands', () => {
    const ids = getAllBrands().map((b) => b.id)
    expect(ids).toContain('traxevent')
    expect(ids).toContain('brewtrax')
  })

  it('every brand references a known shape', () => {
    for (const b of getAllBrands()) {
      expect(b.industryPackId).toBeTruthy()
      expect(b.marketing.headline).toBeTruthy()
      expect(b.theme.accent).toMatch(/^#/)
    }
  })
})

describe('getBrandByHostname', () => {
  it('matches a brand custom domain', () => {
    expect(getBrandByHostname('brewtrax.com')?.id).toBe('brewtrax')
    expect(getBrandByHostname('www.brewtrax.com')?.id).toBe('brewtrax')
  })

  it('strips the port before matching', () => {
    expect(getBrandByHostname('brewtrax.com:3000')?.id).toBe('brewtrax')
  })

  it('matches the {id}.localhost dev convention', () => {
    expect(getBrandByHostname('brewtrax.localhost:3000')?.id).toBe('brewtrax')
  })

  it('returns null for non-brand hosts (traxevent domains, org subdomains, localhost)', () => {
    expect(getBrandByHostname('traxevent.com')).toBeNull()
    expect(getBrandByHostname('fbc.traxevent.com')).toBeNull()
    expect(getBrandByHostname('localhost:3000')).toBeNull()
  })
})

describe('validBrandParam', () => {
  it('returns the id for a known non-default brand', () => {
    expect(validBrandParam('brewtrax')).toBe('brewtrax')
  })

  it('returns null for unknown, default, empty, or missing values', () => {
    expect(validBrandParam('nope')).toBeNull()
    expect(validBrandParam('traxevent')).toBeNull()
    expect(validBrandParam('')).toBeNull()
    expect(validBrandParam(null)).toBeNull()
    expect(validBrandParam(undefined)).toBeNull()
  })
})

describe('signupUrl', () => {
  it('links to the main-domain signup carrying the brand param', () => {
    expect(signupUrl('brewtrax')).toBe('https://traxevent.com/signup?brand=brewtrax')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/brands.test.ts`
Expected: FAIL — cannot resolve `@/lib/brands`.

- [ ] **Step 3: Write the implementation**

Note: the default brand deliberately has an empty `domains` list — the traxevent domains are handled by the existing proxy logic, and `getBrandByHostname` must return null for them so default behavior is untouched.

```ts
// lib/brands.ts
// Brand registry: maps acquisition domains to vertically-branded storefronts.
// Parallel in spirit to lib/industry-packs.ts — a static registry with lookups.
// MUST stay dependency-free: imported by proxy.ts (middleware) and client components.

export interface Brand {
  id: string                  // 'brewtrax'
  name: string                // 'BrewTrax'
  domains: string[]           // acquisition domains; default brand leaves this empty
  industryPackId: string      // pre-selected pack for signups through this brand
  theme: { accent: string }   // minimal v1 theming — accent color for the landing page
  marketing: {
    headline: string
    subhead: string
    cta: string
  }
}

export const DEFAULT_BRAND_ID = 'traxevent'

// Main-domain origin for auth flows. Brand domains only serve marketing;
// every CTA sends users here (spec §2: brands own acquisition, app stays home).
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://traxevent.com'

const BUILT_IN_BRANDS: Brand[] = [
  {
    id: DEFAULT_BRAND_ID,
    name: 'TraxEvent',
    domains: [], // traxevent.com is handled by the existing proxy org-subdomain logic
    industryPackId: 'general',
    theme: { accent: '#111827' },
    marketing: {
      headline: 'TraxEvent',
      subhead: 'Registration and management for the events you run.',
      cta: 'Get started',
    },
  },
  {
    id: 'brewtrax',
    name: 'BrewTrax',
    domains: ['brewtrax.com', 'www.brewtrax.com'],
    industryPackId: 'coffee-cart',
    theme: { accent: '#78350f' },
    marketing: {
      headline: 'Run your coffee cart like a pro.',
      subhead:
        'Booking, menus, shopping lists, and event-day checklists for mobile beverage businesses.',
      cta: 'Start free',
    },
  },
]

const BRAND_MAP = new Map<string, Brand>(BUILT_IN_BRANDS.map((b) => [b.id, b]))

export function getBrand(id?: string): Brand {
  return (id ? BRAND_MAP.get(id) : undefined) ?? BRAND_MAP.get(DEFAULT_BRAND_ID)!
}

export function getAllBrands(): Brand[] {
  return [...BUILT_IN_BRANDS]
}

export function getBrandByHostname(hostname: string): Brand | null {
  const host = hostname.split(':')[0]
  for (const brand of BUILT_IN_BRANDS) {
    if (brand.domains.includes(host)) return brand
    // Dev convention: brewtrax.localhost maps to the brewtrax brand.
    if (host === `${brand.id}.localhost`) return brand
  }
  return null
}

/** Validate a ?brand= query value. Only known, non-default brands count. */
export function validBrandParam(value: string | null | undefined): string | null {
  if (!value || value === DEFAULT_BRAND_ID) return null
  return BRAND_MAP.has(value) ? value : null
}

export function signupUrl(brandId: string): string {
  return `${APP_ORIGIN}/signup?brand=${brandId}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/brands.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Add `NEXT_PUBLIC_APP_ORIGIN` to `.env.example`**

Append to `.env.example`:

```
# Main-domain origin used by brand landing CTAs (defaults to https://traxevent.com)
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
```

- [ ] **Step 6: Commit**

```bash
git add lib/brands.ts __tests__/lib/brands.test.ts .env.example
git commit -m "feat(brands): brand registry with hostname lookup and signup URL helper"
```

---

### Task 2: Proxy brand-domain routing

**Files:**
- Modify: `proxy.ts`
- Test: `__tests__/middleware.test.ts` (extend)

**Interfaces:**
- Consumes: `getBrandByHostname(hostname)` from Task 1.
- Produces: on a brand domain, `GET /` rewrites to `/brand/{brandId}` (the route Task 4 creates). All other paths on brand domains, and all traxevent/org-subdomain/localhost traffic, behave exactly as before.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/middleware.test.ts` (existing imports already pull `proxy` and `NextRequest`):

```ts
describe('proxy — brand domains', () => {
  it('rewrites the brand domain root to the brand landing route', () => {
    const request = new NextRequest('https://brewtrax.com/', {
      headers: { host: 'brewtrax.com' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toContain('/brand/brewtrax')
  })

  it('leaves non-root paths on brand domains untouched', () => {
    const request = new NextRequest('https://brewtrax.com/signup', {
      headers: { host: 'brewtrax.com' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('does not treat traxevent org subdomains as brands', () => {
    const request = new NextRequest('https://fbc.traxevent.com/summer/register', {
      headers: { host: 'fbc.traxevent.com' },
    })
    const res = proxy(request)
    expect(res.headers.get('x-middleware-rewrite')).toContain('/fbc/summer/register')
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run __tests__/middleware.test.ts`
Expected: first new test FAILS (no rewrite header); the two guard tests pass already. Confirm the pre-existing tests still pass.

- [ ] **Step 3: Implement the brand check in `proxy.ts`**

Add the import and the brand block at the top of `proxy()` (before the org-slug logic):

```ts
import { getBrandByHostname } from '@/lib/brands'
```

```ts
export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''

  // Brand acquisition domains (brewtrax.com, …): serve the brand landing at /.
  // Everything else on a brand domain falls through to normal routes.
  const brand = getBrandByHostname(hostname)
  if (brand) {
    if (request.nextUrl.pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = `/brand/${brand.id}`
      return NextResponse.rewrite(url)
    }
    return NextResponse.next()
  }

  const orgSlug = extractOrgSlug(hostname)
  // …existing logic unchanged…
```

- [ ] **Step 4: Run the middleware tests**

Run: `npx vitest run __tests__/middleware.test.ts`
Expected: PASS (old + new).

- [ ] **Step 5: Commit**

```bash
git add proxy.ts __tests__/middleware.test.ts
git commit -m "feat(brands): route brand acquisition domains to brand landing pages"
```

---

### Task 3: `Org.brand_id` + brand-aware `createOrg`

**Files:**
- Modify: `lib/types.ts` (the `Org` interface)
- Modify: `actions/orgs.ts` (`createOrg`)
- Test: `__tests__/actions/orgs-create.test.ts` (new)

**Interfaces:**
- Consumes: `getBrand`, `validBrandParam` from Task 1.
- Produces: `createOrg(uid, orgName, displayName, email, brandId?: string): Promise<Org>` — when `brandId` is a known non-default brand, the org doc is created with `brand_id` set and `industry_pack_id` set to that brand's `industryPackId`. Otherwise the doc is identical to today (neither field present).

- [ ] **Step 1: Add the field to `lib/types.ts`**

In the `Org` interface, directly under `industry_pack_id`:

```ts
  brand_id?: string                  // acquisition brand the org signed up through; absent = 'traxevent'
```

- [ ] **Step 2: Write the failing test**

```ts
// __tests__/actions/orgs-create.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const setMock = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { setCustomUserClaims: vi.fn().mockResolvedValue(undefined) },
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn(function (this: unknown) {
      return { id: 'org123', set: setMock, collection: vi.fn().mockReturnThis() }
    }),
  },
}))

vi.mock('@/actions/auth', () => ({
  setOrgClaims: vi.fn().mockResolvedValue(undefined),
}))

import { createOrg } from '@/actions/orgs'

beforeEach(() => setMock.mockClear())

describe('createOrg brand stamping', () => {
  it('stamps brand_id and the brand industry pack for a known brand', async () => {
    const org = await createOrg('uid1', 'Bean Scene', 'Ryan', 'r@x.com', 'brewtrax')
    expect(org.brand_id).toBe('brewtrax')
    expect(org.industry_pack_id).toBe('coffee-cart')
  })

  it('creates an identical-to-today org when no brand is given', async () => {
    const org = await createOrg('uid1', 'Bean Scene', 'Ryan', 'r@x.com')
    expect(org).not.toHaveProperty('brand_id')
    expect(org).not.toHaveProperty('industry_pack_id')
  })

  it('ignores unknown brand ids', async () => {
    const org = await createOrg('uid1', 'Bean Scene', 'Ryan', 'r@x.com', 'evilcorp')
    expect(org).not.toHaveProperty('brand_id')
    expect(org).not.toHaveProperty('industry_pack_id')
  })
})
```

Note for the implementer: `actions/orgs.ts` calls `adminDb.collection('orgs').doc()` for the org ref and then chained member-doc writes. If the mock shape above fights the actual call chain, mirror the mock style used in `__tests__/actions/orgs-industry.test.ts` — the assertion that matters is the **returned Org object's fields**, which reflect exactly what was written to `orgRef.set(org)`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run __tests__/actions/orgs-create.test.ts`
Expected: FAIL — createOrg has no 5th parameter; `brand_id` undefined.

- [ ] **Step 4: Implement in `actions/orgs.ts`**

Add imports:

```ts
import { getBrand, validBrandParam } from '@/lib/brands'
```

Change `createOrg`:

```ts
export async function createOrg(
  uid: string,
  orgName: string,
  displayName: string,
  email: string,
  brandId?: string
): Promise<Org> {
  const slug = slugify(orgName)
  const orgRef = adminDb.collection('orgs').doc()
  const orgId = orgRef.id

  const org: Org = {
    id: orgId,
    name: orgName,
    slug,
    billing_status: 'trialing',
    created_at: new Date().toISOString(),
  }

  // Acquisition brand (spec §2): a signup through brewtrax.com lands in an org
  // pre-configured with that brand's industry pack. Firestore rejects undefined,
  // so fields are only added when a valid brand is present.
  const validBrand = validBrandParam(brandId)
  if (validBrand) {
    org.brand_id = validBrand
    org.industry_pack_id = getBrand(validBrand).industryPackId
  }

  await orgRef.set(org)
  // …rest unchanged (member doc, setOrgClaims, return org)…
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run __tests__/actions/orgs-create.test.ts __tests__/actions/orgs.test.ts __tests__/actions/orgs-industry.test.ts`
Expected: PASS (new file and both pre-existing org test files).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts actions/orgs.ts __tests__/actions/orgs-create.test.ts
git commit -m "feat(brands): stamp brand_id and industry pack onto orgs created through a brand"
```

---

### Task 4: Brand landing page

**Files:**
- Create: `app/(marketing)/brand/[brandId]/page.tsx`

**Interfaces:**
- Consumes: `getBrand`, `getBrandByHostname` (indirectly via proxy rewrite), `signupUrl`, `DEFAULT_BRAND_ID` from Task 1.
- Produces: `GET /brand/brewtrax` renders the BrewTrax landing; unknown or default brand ids 404. This is the rewrite target from Task 2.

- [ ] **Step 1: Check the Next.js docs for params handling**

Per AGENTS.md, confirm the current dynamic-route `params` contract in `node_modules/next/dist/docs/` (App Router pages receive `params` as a **Promise** in this version — verify before writing).

- [ ] **Step 2: Implement the page**

```tsx
// app/(marketing)/brand/[brandId]/page.tsx
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getBrand, signupUrl, DEFAULT_BRAND_ID } from '@/lib/brands'

export default async function BrandLandingPage({
  params,
}: {
  params: Promise<{ brandId: string }>
}) {
  const { brandId } = await params
  const brand = getBrand(brandId)
  // Unknown ids fall back to the default brand; treat both as not-a-brand-page.
  if (brand.id === DEFAULT_BRAND_ID || brand.id !== brandId) notFound()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <span
        className="text-sm font-semibold uppercase tracking-widest mb-3"
        style={{ color: brand.theme.accent }}
      >
        {brand.name}
      </span>
      <h1 className="text-5xl font-bold text-gray-900 mb-4 text-center max-w-2xl">
        {brand.marketing.headline}
      </h1>
      <p className="text-xl text-gray-500 mb-8 text-center max-w-md">
        {brand.marketing.subhead}
      </p>
      <a href={signupUrl(brand.id)}>
        <Button size="lg" style={{ backgroundColor: brand.theme.accent }}>
          {brand.marketing.cta}
        </Button>
      </a>
    </main>
  )
}
```

Styling notes: mirrors the existing `app/(marketing)/page.tsx` layout idiom (centered flex column, same type scale). Plain `<a>` (not `next/link`) because `signupUrl` is an absolute cross-origin URL in production.

- [ ] **Step 3: Verify with the dev server**

Run: `npm run dev`, then open `http://brewtrax.localhost:3000/`.
Expected: BrewTrax landing renders (headline, subhead, CTA). Also check `http://localhost:3000/brand/nope` → 404, and `http://localhost:3000/` → unchanged TraxEvent marketing page.

- [ ] **Step 4: Run build to catch route-level type errors**

Run: `npm run build`
Expected: clean build, `/brand/[brandId]` listed in the route summary.

- [ ] **Step 5: Commit**

```bash
git add "app/(marketing)/brand"
git commit -m "feat(brands): brand landing page rendered from the registry"
```

---

### Task 5: Carry `?brand=` through signup → onboarding → createOrg

**Files:**
- Modify: `app/(auth)/signup/page.tsx`
- Modify: `app/(auth)/onboarding/page.tsx`

**Interfaces:**
- Consumes: `validBrandParam` (Task 1), `createOrg(uid, orgName, displayName, email, brandId?)` (Task 3).
- Produces: a user who lands on `/signup?brand=brewtrax` ends up with an org whose `brand_id`/`industry_pack_id` are stamped. Invalid/absent params degrade silently to today's flow.

- [ ] **Step 1: Check the Next.js docs for client-page searchParams handling**

Per AGENTS.md, confirm in `node_modules/next/dist/docs/` how a `'use client'` page should read query params in this version (`useSearchParams` + Suspense boundary vs. the `searchParams` Promise prop unwrapped with `React.use()`). Use whichever the shipped docs prescribe; the code below assumes the `searchParams` prop pattern — adapt if the docs differ.

- [ ] **Step 2: Thread the param through `app/(auth)/signup/page.tsx`**

Changes (client component, existing structure retained):

```tsx
import { use } from 'react'
import { validBrandParam, getBrand } from '@/lib/brands'

export default function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>
}) {
  const { brand: brandParam } = use(searchParams)
  const brandId = validBrandParam(brandParam)
  const brand = brandId ? getBrand(brandId) : null
  // …existing state/hooks unchanged…
```

On successful signup, preserve the param:

```tsx
      router.push(brandId ? `/onboarding?brand=${brandId}` : '/onboarding')
```

And brand the card title so the BrewTrax funnel doesn't feel like a bait-and-switch:

```tsx
        <CardTitle>
          {brand ? `Create your ${brand.name} account` : 'Create your TraxEvent account'}
        </CardTitle>
```

- [ ] **Step 3: Thread the param through `app/(auth)/onboarding/page.tsx`**

Same pattern:

```tsx
import { use } from 'react'
import { validBrandParam } from '@/lib/brands'

export default function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>
}) {
  const { brand: brandParam } = use(searchParams)
  const brandId = validBrandParam(brandParam)
  // …existing state/hooks unchanged…
```

And pass it to `createOrg`:

```tsx
      const org = await createOrg(
        user.uid,
        orgName,
        user.displayName ?? '',
        user.email ?? '',
        brandId ?? undefined
      )
```

- [ ] **Step 4: Verify the full funnel in the dev server**

Run: `npm run dev`, open `http://brewtrax.localhost:3000/` → click CTA (dev `NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000` makes this land on `http://localhost:3000/signup?brand=brewtrax`) → sign up with a throwaway email → onboarding (URL still carries `?brand=brewtrax`) → create org.
Expected: signup card says "Create your BrewTrax account"; after onboarding, the org's Firestore doc has `brand_id: 'brewtrax'` and `industry_pack_id: 'coffee-cart'`, and the admin nav shows the coffee-cart module set (no Events/Registrants modules).
Also verify the control path: `http://localhost:3000/signup` (no param) behaves exactly as today.

- [ ] **Step 5: Run the full suite and build**

Run: `npm run test && npm run build`
Expected: all tests pass; clean build. (`use server` re-export rule: `actions/orgs.ts` was touched in Task 3 — the build run here is the backstop.)

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/signup/page.tsx" "app/(auth)/onboarding/page.tsx"
git commit -m "feat(brands): carry brand through signup and onboarding into org creation"
```

---

### Task 6: Final verification & ops notes

**Files:**
- Modify: `docs/ROADMAP.md` (one-line status note, if the file tracks phases)

**Interfaces:**
- Consumes: everything above.
- Produces: a green branch ready for review/merge, plus the manual ops checklist.

- [ ] **Step 1: Full suite + build from this worktree root**

Run: `npm run test && npm run build`
Expected: 100% pass, clean build. If anything fails, fix before proceeding — no partial green.

- [ ] **Step 2: Regression sweep of default-brand behavior**

With `npm run dev`:
- `http://localhost:3000/` → TraxEvent marketing page unchanged
- `http://localhost:3000/login` → login works
- an existing org subdomain path (e.g. `http://localhost:3000/{some-org-slug}`) → admin loads unchanged

- [ ] **Step 3: Record the production ops checklist**

These are manual/dashboard steps, not code — add to the PR description:

1. `vercel domains add brewtrax.com` (+ `www.brewtrax.com`) on the existing project — **no new Vercel project**.
2. Set `NEXT_PUBLIC_APP_ORIGIN=https://traxevent.com` in Vercel production env.
3. DNS for brewtrax.com → Vercel per the domains dashboard.
4. No Firebase changes (auth never runs on brand domains in v1).

- [ ] **Step 4: Commit any remaining changes and hand off**

```bash
git add -A && git commit -m "chore(brands): final verification notes for brand layer"
```

Then follow `superpowers:finishing-a-development-branch` for merge/PR.
