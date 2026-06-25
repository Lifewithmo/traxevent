# Phase 4f: Network-Branded Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A network (denomination) gets its own branding (display name, logo, colors) and a public **portal** page that lists upcoming events across all its member orgs. The portal is reachable at the canonical path `/portal/[networkSlug]`, and a denomination's **own custom domain** (e.g. `camps.denomination.org`) can be pointed at it — the proxy resolves the host to the right network and renders the branded portal. (Attaching the domain to the Vercel project remains a documented ops step.)

**Architecture:** Add branding + `portal_domain` fields to `Network`. A public portal route renders a branded view of member-org `active` camps (each links to the existing `/{orgSlug}/{campSlug}/register`). The Next 16 `proxy.ts` middleware (already does `*.traxevent.com` org rewrites) gains a branch: a non-platform host (custom domain) hitting `/` rewrites to a paramless `/portal` route that resolves the network by `portal_domain` from the `host` header. Admin branding/domain management mirrors the existing email-domain admin pattern.

**Tech Stack:** Next.js 16 App Router (`proxy.ts` = middleware; `params` is a Promise), Firebase Admin, Vitest. Pure helpers in `lib/`, thin server actions in `actions/`.

**Baseline:** 352 tests passing (run `npm install` first so the `server-only` shim resolves).

**Reserved-slug note:** `/portal` becomes a reserved top-level path (an org with slug `portal` would be shadowed). Acceptable; note in final report.

---

### Task 1: Branding/domain types + pure portal helpers

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/portal.ts`
- Create: `__tests__/lib/portal.test.ts`

- [ ] **Step 1: Write the failing test** — `__tests__/lib/portal.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { buildPortalEvents, portalThemeVars } from '@/lib/portal'
import type { Org, Camp } from '@/lib/types'

const org = (slug: string, name: string): Org =>
  ({ id: slug, name, slug, billing_status: 'active', created_at: '' }) as Org
const camp = (slug: string, name: string, camp_start: string): Camp =>
  ({ id: slug, name, slug, year: 2026, status: 'active', camp_start, camp_end: camp_start } as unknown as Camp)

describe('buildPortalEvents', () => {
  it('flattens orgs→camps into register links, sorted by start date', () => {
    const events = buildPortalEvents([
      { org: org('grace', 'Grace Chapel'), camps: [camp('retreat', 'Youth Retreat', '2026-07-01')] },
      { org: org('fbc', 'First Baptist'), camps: [camp('summer', 'Summer Camp', '2026-06-01')] },
    ])
    expect(events.map((e) => e.campSlug)).toEqual(['summer', 'retreat'])
    expect(events[0]).toMatchObject({
      orgSlug: 'fbc', orgName: 'First Baptist', campSlug: 'summer', campName: 'Summer Camp',
      year: 2026, registerPath: '/fbc/summer/register',
    })
  })

  it('returns an empty list when no orgs have camps', () => {
    expect(buildPortalEvents([{ org: org('x', 'X'), camps: [] }])).toEqual([])
  })
})

describe('portalThemeVars', () => {
  it('maps brand colors to CSS custom properties', () => {
    expect(portalThemeVars({ primary_color: '#123456', accent_color: '#abcdef' }))
      .toEqual({ '--portal-primary': '#123456', '--portal-accent': '#abcdef' })
  })

  it('omits unset colors', () => {
    expect(portalThemeVars({})).toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/portal.test.ts`
Expected: FAIL — cannot resolve `@/lib/portal`.

- [ ] **Step 3: Update `lib/types.ts`** — add branding + domain fields to `Network`:

```typescript
export interface Network {
  id: string
  name: string
  slug: string
  stripe_customer_id?: string
  billing_status?: 'active' | 'inactive'
  display_name?: string
  logo_url?: string
  primary_color?: string
  accent_color?: string
  portal_domain?: string | null
  created_at: string
}
```

- [ ] **Step 4: Create `lib/portal.ts`**

```typescript
import type { Org, Camp } from '@/lib/types'

export interface PortalEvent {
  orgSlug: string
  orgName: string
  campSlug: string
  campName: string
  year: number
  camp_start: string
  camp_end: string
  registerPath: string
}

export interface OrgCamps {
  org: Org
  camps: Camp[]
}

// Flatten member-org → camps into a single list of register links, sorted by start date.
export function buildPortalEvents(perOrg: OrgCamps[]): PortalEvent[] {
  const events: PortalEvent[] = []
  for (const { org, camps } of perOrg) {
    for (const camp of camps) {
      events.push({
        orgSlug: org.slug,
        orgName: org.name,
        campSlug: camp.slug,
        campName: camp.name,
        year: camp.year,
        camp_start: camp.camp_start,
        camp_end: camp.camp_end,
        registerPath: `/${org.slug}/${camp.slug}/register`,
      })
    }
  }
  return events.sort((a, b) => a.camp_start.localeCompare(b.camp_start))
}

// CSS custom properties for a network's brand colors (spread into a style={} prop).
export function portalThemeVars(network: { primary_color?: string; accent_color?: string }): Record<string, string> {
  const vars: Record<string, string> = {}
  if (network.primary_color) vars['--portal-primary'] = network.primary_color
  if (network.accent_color) vars['--portal-accent'] = network.accent_color
  return vars
}
```

- [ ] **Step 5: Run tests** — `npx vitest run __tests__/lib/portal.test.ts` → PASS; `npx tsc --noEmit` → clean; `npx vitest run` → all green.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/portal.ts "__tests__/lib/portal.test.ts"
git commit -m "feat: network branding/portal_domain types + portal event/theme helpers"
```

---

### Task 2: Branding + custom-domain admin actions

**Files:**
- Create: `actions/network-portal.ts`
- Create: `__tests__/actions/network-portal.test.ts`

- [ ] **Step 1: Write the failing tests** — `__tests__/actions/network-portal.test.ts`

Hoisted spies. Mock `@/lib/auth/assert` (`assertNetworkAdmin` → resolve) and `@/lib/firebase-admin` `adminDb` so:
- `collection('networks').doc(id).update()` → `networkUpdateSpy`
- `collection('networks').where('portal_domain','==',v).limit(1).get()` → configurable `{ empty, docs:[{ id }] }`

Cover (this task = the THREE admin mutations only):
- **updateNetworkBranding**: calls `assertNetworkAdmin('net-1')`; `update()` called with the provided fields (`display_name`, `logo_url`, `primary_color`, `accent_color`). Invalid color (not `#rrggbb`) → throws `'Colors must be hex like #2563EB'`, no update. Invalid `logo_url` (not http/https) → throws `'Logo URL must start with http:// or https://'`, no update.
- **setNetworkPortalDomain**: normalizes to trimmed lowercase; rejects an invalid domain (`'not a domain'`) with `'Enter a valid domain (e.g. camps.yourdomain.org)'`; when the `portal_domain` query returns a doc owned by a DIFFERENT network → throws `'That domain is already in use'` (no update); when empty (or owned by the same network id) → `update({ portal_domain: <normalized> })`.
- **removeNetworkPortalDomain**: `assertNetworkAdmin` then `update({ portal_domain: null })`.

- [ ] **Step 2: Run to verify it fails** — `npx vitest run __tests__/actions/network-portal.test.ts` → FAIL (module/exports missing).

- [ ] **Step 3: Create `actions/network-portal.ts`** (admin mutations portion)

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertNetworkAdmin } from '@/lib/auth/assert'

const HEX = /^#[0-9a-fA-F]{6}$/

export interface NetworkBranding {
  display_name?: string
  logo_url?: string
  primary_color?: string
  accent_color?: string
}

export async function updateNetworkBranding(networkId: string, branding: NetworkBranding): Promise<void> {
  await assertNetworkAdmin(networkId)
  for (const c of [branding.primary_color, branding.accent_color]) {
    if (c && !HEX.test(c)) throw new Error('Colors must be hex like #2563EB')
  }
  if (branding.logo_url && !/^https?:\/\//.test(branding.logo_url)) {
    throw new Error('Logo URL must start with http:// or https://')
  }
  const update: Record<string, unknown> = {}
  if (branding.display_name !== undefined) update.display_name = branding.display_name.trim()
  if (branding.logo_url !== undefined) update.logo_url = branding.logo_url.trim()
  if (branding.primary_color !== undefined) update.primary_color = branding.primary_color
  if (branding.accent_color !== undefined) update.accent_color = branding.accent_color
  await adminDb.collection('networks').doc(networkId).update(update)
}

export async function setNetworkPortalDomain(networkId: string, domain: string): Promise<void> {
  await assertNetworkAdmin(networkId)
  const normalized = domain.trim().toLowerCase()
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) {
    throw new Error('Enter a valid domain (e.g. camps.yourdomain.org)')
  }
  const existing = await adminDb.collection('networks').where('portal_domain', '==', normalized).limit(1).get()
  if (!existing.empty && existing.docs[0].id !== networkId) {
    throw new Error('That domain is already in use')
  }
  await adminDb.collection('networks').doc(networkId).update({ portal_domain: normalized })
}

export async function removeNetworkPortalDomain(networkId: string): Promise<void> {
  await assertNetworkAdmin(networkId)
  await adminDb.collection('networks').doc(networkId).update({ portal_domain: null })
}
```

- [ ] **Step 4: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 5: Commit**

```bash
git add actions/network-portal.ts "__tests__/actions/network-portal.test.ts"
git commit -m "feat: network branding + custom portal-domain admin actions (validated, unique)"
```

**REVIEW GATE:** security review after Task 4 covers the public data + host routing together.

---

### Task 3: Public portal data action + portal pages

**Files:**
- Modify: `actions/network-portal.ts` (append public read functions)
- Create: `app/(public)/portal/[networkSlug]/page.tsx`
- Create: `app/(public)/portal/page.tsx` (host-resolved)
- Create: `components/portal/NetworkPortalView.tsx`
- Modify: `__tests__/actions/network-portal.test.ts` (append public-data tests)

- [ ] **Step 1: Write the failing tests** — append to `__tests__/actions/network-portal.test.ts`

Extend the firebase-admin mock so:
- `collection('networks').where('slug','==',v).limit(1).get()` → configurable network result.
- `collection('networks').where('portal_domain','==',v).limit(1).get()` → reuse from Task 2.
- `collection('orgs').where('network_id','==',id).get()` → org docs.
- `collection('orgs').doc(orgId).collection('camps').where('status','==','active').get()` → camp docs.

Cover:
- **getNetworkPortalBySlug**: unknown slug (empty) → returns `null`. Known slug → returns `{ network, events }` where `events` are built from the member orgs' `active` camps (assert the camps query used `where('status','==','active')`, and the result includes a `registerPath`).
- **getNetworkPortalByDomain**: looks up by `portal_domain` (lowercased host); unknown → `null`; known → `{ network, events }`.

- [ ] **Step 2: Run to verify it fails** — FAIL (exports missing).

- [ ] **Step 3: Append to `actions/network-portal.ts`**

```typescript
import type { Network, Org, Camp } from '@/lib/types'
import { buildPortalEvents, type PortalEvent } from '@/lib/portal'

export interface NetworkPortal {
  network: Network
  events: PortalEvent[]
}

async function loadPortal(network: Network | null): Promise<NetworkPortal | null> {
  if (!network) return null
  const orgsSnap = await adminDb.collection('orgs').where('network_id', '==', network.id).get()
  const orgs = orgsSnap.docs.map((d) => ({ ...(d.data() as Org), id: d.id }))
  const perOrg = await Promise.all(
    orgs.map(async (org) => {
      const campsSnap = await adminDb
        .collection('orgs').doc(org.id).collection('camps')
        .where('status', '==', 'active').get()
      return { org, camps: campsSnap.docs.map((d) => d.data() as Camp) }
    })
  )
  return { network, events: buildPortalEvents(perOrg) }
}

// PUBLIC (no auth): only exposes a network's public-facing name/branding + active camps.
export async function getNetworkPortalBySlug(networkSlug: string): Promise<NetworkPortal | null> {
  const snap = await adminDb.collection('networks').where('slug', '==', networkSlug).limit(1).get()
  return loadPortal(snap.empty ? null : ({ ...(snap.docs[0].data() as Network), id: snap.docs[0].id }))
}

export async function getNetworkPortalByDomain(host: string): Promise<NetworkPortal | null> {
  const normalized = host.trim().toLowerCase()
  const snap = await adminDb.collection('networks').where('portal_domain', '==', normalized).limit(1).get()
  return loadPortal(snap.empty ? null : ({ ...(snap.docs[0].data() as Network), id: snap.docs[0].id }))
}
```
(Keep the existing `import { adminDb }` / `assertNetworkAdmin` imports; merge the type imports.)

- [ ] **Step 4: Create `components/portal/NetworkPortalView.tsx`** (plain presentational component, no `'use client'`)

Props: `{ portal: NetworkPortal }`. Render a branded landing:
- A header bar styled with `style={portalThemeVars(portal.network)}` (spread CSS vars). Use `portal.network.logo_url` (render an `<img>` if present, `alt` = display name) and the heading `portal.network.display_name || portal.network.name`. Apply the primary color via inline style referencing `var(--portal-primary)` (e.g. header background or heading color) with a sensible fallback.
- Sub-line: "Upcoming events across our member organizations".
- If `portal.events.length === 0`: a friendly "No upcoming events right now." message.
- Else a list/grid of events: each shows `campName`, `orgName`, the date range (`camp_start`–`camp_end`), and a "Register" link (`<a href={e.registerPath}>`), accented with `var(--portal-accent)`. Keep markup clean and self-contained (this renders on a bare public route, not inside the app shell). Import `portalThemeVars` from `@/lib/portal` and the `NetworkPortal` type from `@/actions/network-portal`.

- [ ] **Step 5: Create `app/(public)/portal/[networkSlug]/page.tsx`**

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getNetworkPortalBySlug } from '@/actions/network-portal'
import { NetworkPortalView } from '@/components/portal/NetworkPortalView'

export default async function NetworkPortalPage({ params }: { params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const portal = await getNetworkPortalBySlug(networkSlug)
  if (!portal) notFound()
  return <NetworkPortalView portal={portal} />
}
```

- [ ] **Step 6: Create `app/(public)/portal/page.tsx`** (host-resolved — the proxy rewrites a custom domain's `/` here)

```tsx
export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getNetworkPortalByDomain } from '@/actions/network-portal'
import { NetworkPortalView } from '@/components/portal/NetworkPortalView'

export default async function PortalByDomainPage() {
  const host = (await headers()).get('host') ?? ''
  const portal = await getNetworkPortalByDomain(host)
  if (!portal) notFound()
  return <NetworkPortalView portal={portal} />
}
```

- [ ] **Step 7: Run tests** — targeted PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 8: Commit**

```bash
git add actions/network-portal.ts "app/(public)/portal/[networkSlug]/page.tsx" "app/(public)/portal/page.tsx" components/portal/NetworkPortalView.tsx "__tests__/actions/network-portal.test.ts"
git commit -m "feat: public network portal — branded landing listing member-org active events (by slug + by host)"
```

---

### Task 4: Proxy — custom-domain → portal routing

**Files:**
- Modify: `proxy.ts`
- Modify: `__tests__/middleware.test.ts`

**SECURITY-RELEVANT:** host handling / rewrite target.

- [ ] **Step 1: Write the failing tests** — extend `__tests__/middleware.test.ts`

The file currently tests `extractOrgSlug`. Add tests for a new exported pure helper `isPlatformHost(host)` and for `proxy()` custom-domain behavior. For `proxy()`, construct a minimal `NextRequest` (the file/Next provides `NextRequest`; mirror any existing pattern — if `proxy()` isn't currently unit-tested, build a request with a `host` header and a `nextUrl`). Cover:
- `isPlatformHost('traxevent.com')`, `'fbc.traxevent.com'`, `'localhost:3000'`, `'foo.vercel.app'` → all `true`; `'camps.denomination.org'` → `false`.
- `proxy()` with host `fbc.traxevent.com`, path `/summer/register` → rewrites to `/fbc/summer/register` (existing behavior unchanged).
- `proxy()` with a custom host `camps.denomination.org`, path `/` → rewrites pathname to `/portal`.
- `proxy()` with a custom host, path `/fbc/summer/register` → passes through (NextResponse.next, no rewrite) so registration links still resolve.

If unit-testing `proxy()` directly proves awkward with NextRequest construction, at minimum thoroughly test `isPlatformHost` + a small pure `portalRewritePath(host, pathname)` helper (returns the rewrite target or null) and have `proxy()` delegate to it. Prefer extracting `portalRewritePath` so the routing decision is pure and fully tested.

- [ ] **Step 2: Run to verify it fails** — FAIL (exports/behavior missing).

- [ ] **Step 3: Edit `proxy.ts`**

Add a pure classifier and routing decision, and wire `proxy()` to use them. Keep `extractOrgSlug` and the org rewrite exactly as-is.

```typescript
export function isPlatformHost(host: string): boolean {
  const h = host.split(':')[0]
  return h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`) || h === 'localhost' || h.endsWith('.vercel.app')
}

// For a custom (non-platform) host, only the root path maps to the host-resolved portal;
// all other paths pass through so org/registrant routes keep working on the custom domain.
export function portalRewritePath(host: string, pathname: string): string | null {
  if (isPlatformHost(host)) return null
  return pathname === '/' ? '/portal' : null
}
```

In `proxy()`, after the existing org-slug branch (which returns on rewrite), add before the final `return NextResponse.next()`:
```typescript
  const portalPath = portalRewritePath(hostname, request.nextUrl.pathname)
  if (portalPath) {
    const url = request.nextUrl.clone()
    url.pathname = portalPath
    return NextResponse.rewrite(url)
  }
```

- [ ] **Step 4: Run tests** — `npx vitest run __tests__/middleware.test.ts` → PASS; `npx tsc --noEmit` clean; `npx vitest run` all green.

- [ ] **Step 5: Commit**

```bash
git add proxy.ts "__tests__/middleware.test.ts"
git commit -m "feat: proxy routes custom portal domains to the host-resolved network portal"
```

**REVIEW GATE:** security review after this task — covers public data exposure (Task 3) + host-based rewrite (Task 4): no auth bypass via host spoofing, no SSRF/open-redirect via portal_domain or logo_url, custom-domain requests can't reach authenticated app surfaces unexpectedly.

---

### Task 5: Admin Portal & Branding page + nav

**Files:**
- Create: `app/(network)/network/[networkSlug]/portal/page.tsx`
- Create: `components/network/NetworkPortalAdminClient.tsx`
- Modify: `app/(network)/network/[networkSlug]/layout.tsx`

No new vitest tests required; `npx tsc --noEmit`, `npx vitest run`, `npx next build` must pass.

- [ ] **Step 1: Admin page** — `app/(network)/network/[networkSlug]/portal/page.tsx`

```tsx
export const dynamic = 'force-dynamic'

import { requireNetworkAdmin } from '@/lib/auth/guards'
import { NetworkPortalAdminClient } from '@/components/network/NetworkPortalAdminClient'

export default async function NetworkPortalAdminPage({ params }: { params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const { network } = await requireNetworkAdmin(networkSlug)
  return <NetworkPortalAdminClient network={network} />
}
```

- [ ] **Step 2: Admin client** — `components/network/NetworkPortalAdminClient.tsx`

`'use client'`, props `{ network: Network }`. Mirror `EmailDomainClient.tsx` / `LinkOrgForm.tsx` styling (Cards, Input, Label, Button, Badge, `busy`/`error`/`notice` state, `useRouter().refresh()`). Two Cards:
  1. **Branding** — inputs for display name, logo URL, primary color (`<input type="color">` or text `#hex`), accent color. "Save branding" → `await updateNetworkBranding(network.id, {...})`. Show a small live swatch preview using the entered colors. A link "View your portal →" to `/portal/${network.slug}` (open in new tab).
  2. **Custom domain** — current `network.portal_domain` (if any) with a "Remove" button → `removeNetworkPortalDomain(network.id)`; an input + "Save domain" → `setNetworkPortalDomain(network.id, domain)`. Below it, setup instructions: "Point a CNAME record for this domain to `cname.vercel-dns.com`, then ask your TraxEvent contact to attach it. Until attached, your portal is available at `/portal/${network.slug}`." Surface action errors in the `error` region.

  Import actions from `@/actions/network-portal`, `Network` from `@/lib/types`, UI from `@/components/ui/{card,button,input,label,badge}`.

- [ ] **Step 3: Nav link** — `app/(network)/network/[networkSlug]/layout.tsx`, after the "Billing" admin-only link:
```tsx
          {isAdmin && <a href={`/network/${networkSlug}/portal`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Portal & branding</a>}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all green (unchanged count).
Run: `npx next build` (copy env first: `cp /Users/rm/vw/traxevent/.env.local .env.local`, build, then `rm -f .env.local`) → succeeds; routes `/portal`, `/portal/[networkSlug]`, `/network/[networkSlug]/portal` all appear; NO collisions.

- [ ] **Step 5: Commit** (do NOT add `.env.local`)

```bash
git add "app/(network)/network/[networkSlug]/portal/page.tsx" components/network/NetworkPortalAdminClient.tsx "app/(network)/network/[networkSlug]/layout.tsx"
git commit -m "feat: network Portal & Branding admin page + nav"
```

---

### Task 6: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run` → all green; record final count.
- [ ] **Step 3:** `npx next build` (with `.env.local`) → succeeds; confirm new routes + no collisions.
- [ ] **Step 4:** Commit this plan file (`docs: phase 4f ...`).
- [ ] **Step 5:** Hand back for branch finish (push + PR + squash-merge as `Lifewithmo`, verify prod deploy). Surface carryover: a denomination's own domain must be **added to the Vercel project** (and DNS CNAME'd to `cname.vercel-dns.com`) before it serves the portal live; the canonical `/portal/[networkSlug]` path works immediately.

---

## Self-Review

**Spec coverage:** Roadmap "Network-branded portal (denomination's own domain)" + user's chosen full-vertical scope: branding fields (Task 1), public branded portal listing member-org events (Task 3), proxy custom-domain routing (Task 4), admin branding/domain management (Task 5). The `/portal/[networkSlug]` canonical path and host-resolved `/portal` both render the same branded view. Covered.

**Placeholder scan:** Pure helpers, actions, pages, and proxy code are verbatim. The two UI components (`NetworkPortalView`, `NetworkPortalAdminClient`) are specified behaviorally with exact prop types, action names, and reference files — acceptable for mechanical UI matching existing components.

**Type consistency:** `Network` branding/`portal_domain` fields (Task 1) are read by the portal data action (Task 3) and admin actions (Task 2/5). `buildPortalEvents`/`portalThemeVars` signatures match across Task 1 (def), Task 3 (action + view). `NetworkPortal`/`PortalEvent` types flow from `actions/network-portal.ts` → page → `NetworkPortalView`. `isPlatformHost`/`portalRewritePath` are pure and fully unit-tested before wiring into `proxy()`.

**Security note:** Public read actions (`getNetworkPortalBySlug`/`ByDomain`) expose only public-facing data — network display name/logo/colors and `active` camps (name/slug/dates) that are already publicly registerable. The host→network lookup is by exact `portal_domain` match (lowercased); a spoofed `host` header that matches no network → `notFound()`, never an authenticated surface. `portal_domain` and `logo_url` are validated on write (domain regex; `logo_url` must be http(s)); `logo_url` is only rendered as an `<img src>` (no server-side fetch → no SSRF). Custom-domain requests only rewrite the root path to `/portal`; all other paths pass through to existing (path-scoped) routes, so the proxy change cannot expose new authenticated functionality.
