# Phase 4d: Regional/District Coordinator Role — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a network (denomination) define **regions/districts**, assign member orgs to a region, and grant a **coordinator** a network role scoped to one or more regions — they see an aggregated dashboard/report for only their region's orgs and cannot perform network-admin actions (onboarding, template push, org linking, region management).

**Architecture:** Add a lightweight region model (`networks/{networkId}/regions/{regionId}` + `Org.region_id`). Extend `NetworkRole` to `'admin' | 'coordinator'` and add `NetworkMember.region_ids`. Split the network ABAC into *member* (any role) vs *admin* (role==='admin') guards. A pure helper scopes an org list to the calling member's regions. Read actions (dashboard list + report) switch to the member guard and scope; all mutating/admin actions stay admin-gated.

**Tech Stack:** Next.js 16 App Router, Firebase Admin (Firestore + Auth custom claims), Vitest. Follow the established pure-helper + thin-action + redirect-guard/throw-assert patterns. Single-field `where` queries only (no composite indexes).

**Baseline:** 321 tests passing (run `npm install` first in this worktree — `server-only` shim must resolve).

---

### Task 1: Data model + claims + scope helper

**Files:**
- Modify: `lib/types.ts`
- Modify: `actions/auth.ts:21` (`setNetworkClaims`)
- Create: `lib/network-scope.ts`
- Create: `__tests__/lib/network-scope.test.ts`

- [ ] **Step 1: Write the failing test** — `__tests__/lib/network-scope.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { isCoordinator, scopeOrgsToMember } from '@/lib/network-scope'
import type { NetworkMember, Org } from '@/lib/types'

const admin: NetworkMember = { uid: 'a', role: 'admin', display_name: '', email: '' }
const coord: NetworkMember = { uid: 'c', role: 'coordinator', display_name: '', email: '', region_ids: ['r1', 'r2'] }
const org = (id: string, region_id: string | null): Org =>
  ({ id, name: id, slug: id, billing_status: 'active', region_id, created_at: '' }) as Org

const orgs = [org('o1', 'r1'), org('o2', 'r3'), org('o3', null), org('o4', 'r2')]

describe('isCoordinator', () => {
  it('is true only for the coordinator role', () => {
    expect(isCoordinator(coord)).toBe(true)
    expect(isCoordinator(admin)).toBe(false)
  })
})

describe('scopeOrgsToMember', () => {
  it('returns all orgs for an admin', () => {
    expect(scopeOrgsToMember(admin, orgs).map((o) => o.id)).toEqual(['o1', 'o2', 'o3', 'o4'])
  })

  it('returns only orgs in the coordinator’s regions', () => {
    expect(scopeOrgsToMember(coord, orgs).map((o) => o.id)).toEqual(['o1', 'o4'])
  })

  it('returns no orgs for a coordinator with no regions', () => {
    const empty: NetworkMember = { ...coord, region_ids: [] }
    expect(scopeOrgsToMember(empty, orgs)).toEqual([])
  })

  it('treats a missing region_ids as no regions', () => {
    const noRegions: NetworkMember = { uid: 'c', role: 'coordinator', display_name: '', email: '' }
    expect(scopeOrgsToMember(noRegions, orgs)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/network-scope.test.ts`
Expected: FAIL — cannot resolve `@/lib/network-scope`.

- [ ] **Step 3: Update `lib/types.ts`**

Replace `export type NetworkRole = 'admin'` with:
```typescript
export type NetworkRole = 'admin' | 'coordinator'
```

Add `region_ids` to `NetworkMember` (coordinators only; admins see all orgs):
```typescript
export interface NetworkMember {
  uid: string
  role: NetworkRole
  display_name: string
  email: string
  region_ids?: string[]
}
```

Add a `Region` interface directly after the `Network` interface:
```typescript
export interface Region {
  id: string
  name: string
  created_at: string
}
```

Add `region_id` to `Org` (after the existing `network_id` line):
```typescript
  region_id?: string | null
```

(`AuthClaims.networkRole?: NetworkRole` at `lib/types.ts:109` automatically widens — no change needed.)

- [ ] **Step 4: Create `lib/network-scope.ts`**

```typescript
import type { NetworkMember, Org } from '@/lib/types'

// A coordinator is a network member scoped to specific regions; an admin sees everything.
export function isCoordinator(member: NetworkMember): boolean {
  return member.role === 'coordinator'
}

// Restrict an org list to what the calling network member may see.
// Admins (and platform admins, who are passed a synthetic 'admin' member) see all orgs.
// Coordinators see only orgs whose region_id is in their region_ids.
export function scopeOrgsToMember(member: NetworkMember, orgs: Org[]): Org[] {
  if (!isCoordinator(member)) return orgs
  const regions = new Set(member.region_ids ?? [])
  return orgs.filter((o) => o.region_id != null && regions.has(o.region_id))
}
```

- [ ] **Step 5: Update `setNetworkClaims` in `actions/auth.ts`**

```typescript
import type { NetworkRole, OrgRole } from '@/lib/types'
```
```typescript
export async function setNetworkClaims(
  uid: string,
  networkId: string,
  networkSlug: string,
  role: NetworkRole = 'admin'
): Promise<void> {
  await mergeCustomUserClaims(uid, { networkId, networkSlug, networkRole: role })
}
```
(Existing `createNetwork` call `setNetworkClaims(uid, ref.id, slug)` still works — defaults to `'admin'`.)

- [ ] **Step 6: Run tests**

Run: `npx vitest run __tests__/lib/network-scope.test.ts` → PASS (6).
Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → 327 (321 + 6).

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/network-scope.ts actions/auth.ts "__tests__/lib/network-scope.test.ts"
git commit -m "feat: region model + coordinator role types + org-scoping helper"
```

---

### Task 2: Split network guards — member (any role) vs admin (role==='admin')

**Files:**
- Modify: `lib/auth/guards.ts` (`requireNetworkAdmin` + add `requireNetworkMember`)
- Modify: `lib/auth/assert.ts` (`assertNetworkAdmin` + add `assertNetworkMember`)
- Modify: `__tests__/lib/auth-assert.test.ts`

**Context:** Today every network member has `role: 'admin'`, so enforcing `role === 'admin'` in the admin guards does not break existing members. `platform_admin` continues to bypass. The synthetic member returned for platform admins keeps `role: 'admin'`.

- [ ] **Step 1: Write the failing tests** — add to `__tests__/lib/auth-assert.test.ts`

First confirm the existing mock shape for `getCurrentUser` and the `networks/{id}/members/{uid}` doc lookup (the file already mocks `@/lib/auth/session` and `@/lib/firebase-admin`). Add a `describe('network role guards')` block covering:

```typescript
// assertNetworkMember: a coordinator member is allowed and returned.
it('assertNetworkMember returns a coordinator member', async () => {
  // getCurrentUser -> { uid: 'c', networkId: 'net-1', role: 'staff' }
  // members.doc('c').get() -> exists, data() = { uid:'c', role:'coordinator', region_ids:['r1'] }
  const m = await assertNetworkMember('net-1')
  expect(m.role).toBe('coordinator')
})

// assertNetworkAdmin: a coordinator is rejected.
it('assertNetworkAdmin rejects a coordinator', async () => {
  // same coordinator member doc
  await expect(assertNetworkAdmin('net-1')).rejects.toThrow('Forbidden')
})

// assertNetworkAdmin: an admin member is allowed.
it('assertNetworkAdmin returns an admin member', async () => {
  // members.doc('a').get() -> exists, data() = { uid:'a', role:'admin' }
  const m = await assertNetworkAdmin('net-1')
  expect(m.role).toBe('admin')
})

// assertNetworkMember: a user outside the network is forbidden.
it('assertNetworkMember forbids a non-member', async () => {
  // getCurrentUser -> { uid:'x', networkId: 'other' }
  await expect(assertNetworkMember('net-1')).rejects.toThrow('Forbidden')
})
```

Wire these using the file's existing hoisted-spy pattern (configure the `getCurrentUser` mock return and the members-doc `.get()` return per test). Match the established style in that file exactly; import `assertNetworkMember` alongside the existing imports.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/auth-assert.test.ts`
Expected: FAIL — `assertNetworkMember` is not exported; `assertNetworkAdmin` does not yet reject coordinators.

- [ ] **Step 3: Update `lib/auth/assert.ts`**

Rename the current `assertNetworkAdmin` body into a shared member fetch, then enforce role. Replace the existing `assertNetworkAdmin` function with:

```typescript
// Network-scoped: caller must be a member of networkId (any role). Returns the member.
export async function assertNetworkMember(networkId: string): Promise<NetworkMember> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  if (user.role === 'platform_admin') {
    const snap = await adminDb.collection('networks').doc(networkId).collection('members').doc(user.uid).get()
    return (snap.exists ? snap.data() : { uid: user.uid, role: 'admin', display_name: '', email: '' }) as NetworkMember
  }
  if (user.networkId !== networkId) throw new Error('Forbidden')
  const snap = await adminDb.collection('networks').doc(networkId).collection('members').doc(user.uid).get()
  if (!snap.exists) throw new Error('Forbidden')
  return snap.data() as NetworkMember
}

// Network-scoped: caller must be an ADMIN of networkId. Returns the member.
export async function assertNetworkAdmin(networkId: string): Promise<NetworkMember> {
  const member = await assertNetworkMember(networkId)
  if (member.role !== 'admin') throw new Error('Forbidden')
  return member
}
```

- [ ] **Step 4: Update `lib/auth/guards.ts`**

Refactor `requireNetworkAdmin` to delegate to a new `requireNetworkMember`, then enforce admin. Replace the existing `requireNetworkAdmin` with:

```typescript
// Require a logged-in member of the network (any role). Redirects/notFound like the org guard.
export async function requireNetworkMember(networkSlug: string): Promise<{ network: Network; networkId: string; member: NetworkMember }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const snap = await adminDb.collection('networks').where('slug', '==', networkSlug).limit(1).get()
  if (snap.empty) notFound()
  const network = snap.docs[0].data() as Network
  const networkId = snap.docs[0].id
  if (user.role !== 'platform_admin' && user.networkId !== networkId) notFound()
  const memberSnap = await adminDb.collection('networks').doc(networkId).collection('members').doc(user.uid).get()
  if (!memberSnap.exists && user.role !== 'platform_admin') notFound()
  const member = (memberSnap.exists
    ? (memberSnap.data() as NetworkMember)
    : { uid: user.uid, role: 'admin', display_name: '', email: '' }) as NetworkMember
  return { network, networkId, member }
}

// Require a logged-in ADMIN of the network. notFound() for coordinators / non-admins.
export async function requireNetworkAdmin(networkSlug: string): Promise<{ network: Network; networkId: string; member: NetworkMember }> {
  const result = await requireNetworkMember(networkSlug)
  if (result.member.role !== 'admin') notFound()
  return result
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run __tests__/lib/auth-assert.test.ts` → PASS.
Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all green (327 + the new assert tests).

- [ ] **Step 6: Commit**

```bash
git add lib/auth/assert.ts lib/auth/guards.ts "__tests__/lib/auth-assert.test.ts"
git commit -m "feat: split network guards into member (any role) vs admin (role==='admin')"
```

**REVIEW GATE:** security review after this task (authz boundary change).

---

### Task 3: Region + coordinator actions; scope dashboard list + report to member

**Files:**
- Modify: `actions/networks.ts`
- Modify: `actions/reports.ts:171` (`getNetworkReportData`)
- Modify: `__tests__/actions/networks.test.ts`

- [ ] **Step 1: Write the failing tests** — add to `__tests__/actions/networks.test.ts`

Extend the firebase-admin mock so `adminDb.collection('networks').doc(id).collection('regions')` supports `.doc()` (auto-id, `.set`), `.get()` (list), and so the `members` collection supports `.doc(uid).set()`. Add `vi.mock('@/lib/auth/assert')` entries for `assertNetworkMember` (return a configurable member). Mock `@/actions/auth` `setNetworkClaims`. Mock `adminAuth.getUserByEmail` via the existing `@/lib/firebase-admin` mock (add `adminAuth: { getUserByEmail: vi.fn() }` if not present). Cover:

- **createRegion**: calls `assertNetworkAdmin('net-1')`, writes a region doc under `networks/net-1/regions/{id}` with `{ id, name, created_at }`, returns the region.
- **assignOrgToRegion**: calls `assertNetworkAdmin`; for an org whose `network_id === 'net-1'` it updates `orgs/{orgId}` with `{ region_id: 'r1' }`; for an org whose `network_id` is a different network it throws `'Organization is not in this network'` and does NOT update.
- **assignOrgToRegion(null)**: clears region (`region_id: null`).
- **assignCoordinator**: calls `assertNetworkAdmin`; `getUserByEmail('coord@x.org')` resolves `{ uid: 'u9' }`; writes member doc `networks/net-1/members/u9` = `{ uid:'u9', role:'coordinator', email:'coord@x.org', display_name:'', region_ids:['r1','r2'] }`; calls `setNetworkClaims('u9','net-1', <slug>, 'coordinator')`. When `getUserByEmail` rejects/throws, the action throws `'No user found with that email'` and writes nothing.
- **listNetworkOrgs scoping**: with `assertNetworkMember` returning a coordinator `{ role:'coordinator', region_ids:['r1'] }` and the orgs query returning orgs in r1, r2, and null, the result contains only the r1 org.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/actions/networks.test.ts`
Expected: FAIL — `createRegion`/`assignOrgToRegion`/`assignCoordinator` not exported; `listNetworkOrgs` not yet scoped.

- [ ] **Step 3: Edit `actions/networks.ts`**

Update imports:
```typescript
import { setNetworkClaims } from '@/actions/auth'
import { assertNetworkAdmin, assertNetworkMember, assertOrgAdmin } from '@/lib/auth/assert'
import { scopeOrgsToMember } from '@/lib/network-scope'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import type { Network, Org, OrgInvitation, OrgRole, Region } from '@/lib/types'
```
(Confirm `firebase-admin` exports `adminAuth` — it does, used elsewhere. Keep existing `slugify`, `buildInviteToken`, `OnboardRow` imports.)

Change `listNetworkOrgs` to member-scoped:
```typescript
export async function listNetworkOrgs(networkId: string): Promise<Org[]> {
  const member = await assertNetworkMember(networkId)
  const snap = await adminDb.collection('orgs').where('network_id', '==', networkId).get()
  return scopeOrgsToMember(member, snap.docs.map((d) => d.data() as Org))
}
```

Append region + coordinator actions:
```typescript
// --- Regions / coordinators (Phase 4d) ---

export async function listRegions(networkId: string): Promise<Region[]> {
  await assertNetworkMember(networkId)
  const snap = await adminDb.collection('networks').doc(networkId).collection('regions').get()
  return snap.docs.map((d) => d.data() as Region)
}

export async function createRegion(networkId: string, name: string): Promise<Region> {
  await assertNetworkAdmin(networkId)
  const ref = adminDb.collection('networks').doc(networkId).collection('regions').doc()
  const region: Region = { id: ref.id, name: name.trim(), created_at: new Date().toISOString() }
  await ref.set(region)
  return region
}

// Assign (or clear, with regionId=null) an org's region. The org must already belong to this network.
export async function assignOrgToRegion(networkId: string, orgId: string, regionId: string | null): Promise<void> {
  await assertNetworkAdmin(networkId)
  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  if (!orgSnap.exists || (orgSnap.data() as Org).network_id !== networkId) {
    throw new Error('Organization is not in this network')
  }
  await adminDb.collection('orgs').doc(orgId).update({ region_id: regionId, updated_at: new Date().toISOString() })
}

export async function listNetworkMembers(networkId: string): Promise<NetworkMember[]> {
  await assertNetworkAdmin(networkId)
  const snap = await adminDb.collection('networks').doc(networkId).collection('members').get()
  return snap.docs.map((d) => d.data() as NetworkMember)
}

// Grant an EXISTING user the coordinator role for the given regions.
export async function assignCoordinator(networkId: string, email: string, regionIds: string[]): Promise<void> {
  await assertNetworkAdmin(networkId)
  const netSnap = await adminDb.collection('networks').doc(networkId).get()
  if (!netSnap.exists) throw new Error('Network not found')
  const networkSlug = (netSnap.data() as Network).slug
  let uid: string
  try {
    const u = await adminAuth.getUserByEmail(email.trim())
    uid = u.uid
  } catch {
    throw new Error('No user found with that email')
  }
  const member: NetworkMember = {
    uid,
    role: 'coordinator',
    display_name: '',
    email: email.trim(),
    region_ids: regionIds,
  }
  await adminDb.collection('networks').doc(networkId).collection('members').doc(uid).set(member)
  await setNetworkClaims(uid, networkId, networkSlug, 'coordinator')
}
```
Add `NetworkMember` to the `@/lib/types` import.

- [ ] **Step 4: Edit `actions/reports.ts` `getNetworkReportData`**

Change the gate + scope the orgs (single edit at the top of the function):
```typescript
import { assertNetworkMember } from '@/lib/auth/assert'
import { scopeOrgsToMember } from '@/lib/network-scope'
```
```typescript
export async function getNetworkReportData(networkId: string): Promise<NetworkReport> {
  const member = await assertNetworkMember(networkId)
  const orgsSnap = await adminDb.collection('orgs').where('network_id', '==', networkId).get()
  const orgs = scopeOrgsToMember(member, orgsSnap.docs.map((d) => ({ ...(d.data() as Org), id: d.id })))
  // ...rest unchanged (Promise.all over orgs, aggregateNetworkReport)
}
```
(Keep the existing `assertNetworkAdmin` import only if still used elsewhere in the file; otherwise replace it. Verify with tsc/grep.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run __tests__/actions/networks.test.ts` → PASS.
Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all green.

- [ ] **Step 6: Commit**

```bash
git add actions/networks.ts actions/reports.ts "__tests__/actions/networks.test.ts"
git commit -m "feat: region + coordinator actions; scope network org list & report to caller's regions"
```

**REVIEW GATE:** security review after this task (coordinator assignment + tenant scoping).

---

### Task 4: UI — scoped dashboard, regions admin page, role-aware nav

**Files:**
- Modify: `app/(network)/network/[networkSlug]/layout.tsx`
- Modify: `app/(network)/network/[networkSlug]/page.tsx`
- Modify: `components/network/NetworkDashboardClient.tsx`
- Create: `app/(network)/network/[networkSlug]/regions/page.tsx`
- Create: `components/network/RegionsClient.tsx`

No new vitest tests required; `npx tsc --noEmit`, `npx vitest run`, and `npx next build` must all pass.

- [ ] **Step 1: Role-aware layout nav** — `layout.tsx`

Switch the guard to `requireNetworkMember` and render admin-only links conditionally:
```tsx
import { requireNetworkMember } from '@/lib/auth/guards'

export default async function NetworkLayout({ children, params }: { children: React.ReactNode; params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const { member } = await requireNetworkMember(networkSlug)
  const isAdmin = member.role === 'admin'
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 bg-gray-900 text-gray-100 min-h-screen flex flex-col flex-shrink-0">
        <div className="px-4 py-5 border-b border-gray-700 font-bold text-white text-lg">TraxEvent Network</div>
        <nav className="flex-1 px-2 py-4 space-y-0.5 text-sm">
          <a href={`/network/${networkSlug}`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Dashboard</a>
          {isAdmin && <a href={`/network/${networkSlug}/templates`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Shared templates</a>}
          {isAdmin && <a href={`/network/${networkSlug}/regions`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Regions</a>}
          {isAdmin && <a href={`/network/${networkSlug}/onboard`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Onboard orgs</a>}
        </nav>
      </aside>
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
```
(The `requireNetworkAdmin` guard on the templates/regions/onboard pages still hard-blocks coordinators server-side even if they craft the URL — the nav hiding is cosmetic.)

- [ ] **Step 2: Dashboard page passes role** — `page.tsx`

```tsx
import { requireNetworkMember } from '@/lib/auth/guards'
...
  const { network, networkId, member } = await requireNetworkMember(networkSlug)
  const [orgs, report] = await Promise.all([listNetworkOrgs(networkId), getNetworkReportData(networkId)])
  return <NetworkDashboardClient network={network} networkId={networkId} orgs={orgs} report={report} role={member.role} />
```

- [ ] **Step 3: Dashboard client hides admin-only controls** — `NetworkDashboardClient.tsx`

Add `role: NetworkRole` to props (import `NetworkRole` from `@/lib/types`). When `role !== 'admin'`, show a "Region coordinator" badge under the title and do NOT render `<LinkOrgForm>`:
```tsx
import type { Network, NetworkRole, Org } from '@/lib/types'
...
interface NetworkDashboardClientProps {
  network: Network
  networkId: string
  orgs: Org[]
  report: NetworkReport
  role: NetworkRole
}
...
        <p className="text-sm text-muted-foreground">Network dashboard</p>
        {role === 'coordinator' && <span className="inline-block mt-1 text-xs rounded bg-blue-100 text-blue-800 px-2 py-0.5">Region coordinator</span>}
```
And wrap the `<LinkOrgForm networkId={networkId} />` so it only renders when `role === 'admin'`.

- [ ] **Step 4: Regions admin page** — `app/(network)/network/[networkSlug]/regions/page.tsx`

```tsx
export const dynamic = 'force-dynamic'

import { requireNetworkAdmin } from '@/lib/auth/guards'
import { listRegions, listNetworkOrgs, listNetworkMembers } from '@/actions/networks'
import { RegionsClient } from '@/components/network/RegionsClient'

export default async function RegionsPage({ params }: { params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const { networkId } = await requireNetworkAdmin(networkSlug)
  const [regions, orgs, members] = await Promise.all([
    listRegions(networkId),
    listNetworkOrgs(networkId),
    listNetworkMembers(networkId),
  ])
  return <RegionsClient networkId={networkId} regions={regions} orgs={orgs} members={members} />
}
```

- [ ] **Step 5: Regions client** — `components/network/RegionsClient.tsx`

`'use client'` component, props `{ networkId, regions: Region[], orgs: Org[], members: NetworkMember[] }`. Three Cards (use `@/components/ui/card`, `button`, `input`, `label`, `useRouter().refresh()` after each action, local `loading`/`error` state per the `LinkOrgForm.tsx` pattern):
  1. **Create region** — text input + button → `await createRegion(networkId, name)`.
  2. **Assign orgs to regions** — table of `orgs`; each row a `<select>` of regions (plus an "Unassigned" → null option) bound to `o.region_id`; on change → `await assignOrgToRegion(networkId, o.id, value || null)`.
  3. **Coordinators** — list existing members where `role === 'coordinator'` (show email + their region count). A form: email input + a multi-checkbox list of regions → `await assignCoordinator(networkId, email, selectedRegionIds)`.
  Import the actions from `@/actions/networks` and the types from `@/lib/types`. Keep styling consistent with `NetworkTemplatesClient.tsx` / `BulkOnboardClient.tsx`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all green (unchanged count from Task 3).
Run: `npx next build` → succeeds; `/network/[networkSlug]/regions` appears as a dynamic route, no collisions. (If the worktree lacks `.env.local`, copy it from the main repo for the build, then delete it — page-data collection needs Firebase creds.)

- [ ] **Step 7: Commit**

```bash
git add "app/(network)/network/[networkSlug]/layout.tsx" "app/(network)/network/[networkSlug]/page.tsx" components/network/NetworkDashboardClient.tsx "app/(network)/network/[networkSlug]/regions/page.tsx" components/network/RegionsClient.tsx
git commit -m "feat: region-scoped network dashboard + regions admin page + role-aware nav"
```

---

### Task 5: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run` → all green; record final count.
- [ ] **Step 3:** `npx next build` (with `.env.local`) → succeeds; confirm `/network/[networkSlug]/regions` route and no collisions.
- [ ] **Step 4:** Commit this plan file (`docs: phase 4d ...`).
- [ ] **Step 5:** Hand back for branch finish (push + PR + squash-merge as `Lifewithmo`, verify prod deploy).

---

## Self-Review

**Spec coverage:** Roadmap line "District/regional coordinator role" → regions (Task 1/3), coordinator role + scoped claims (Task 1/3), scoped read access (Task 2/3), admin-only mutations + UI gating (Task 2/4), management UI (Task 4). Covered.

**Placeholder scan:** All steps contain concrete code or exact commands. The two UI client components (RegionsClient styling, test-mock wiring) are described behaviorally with exact action signatures and prop types rather than full JSX — acceptable for a mechanical UI build matching existing components, but the implementer must match the cited reference files.

**Type consistency:** `NetworkRole = 'admin' | 'coordinator'`, `NetworkMember.region_ids?: string[]`, `Region { id, name, created_at }`, `Org.region_id?: string | null` used consistently across tasks. `scopeOrgsToMember(member, orgs)` / `isCoordinator(member)` signatures match between Task 1 (definition), Task 3 (actions), and tests. `setNetworkClaims(uid, networkId, slug, role?)` 4-arg signature matches its Task 3 call. Guard names `requireNetworkMember`/`assertNetworkMember` consistent across Tasks 2–4.

**Security note:** The critical change is Task 2's authz split. Existing network members all have `role: 'admin'` (set by `createNetwork`), so admin-gated actions are unaffected. Coordinators reach only `listNetworkOrgs`/`getNetworkReportData`/`listRegions` (member-gated) and are filtered to their regions; every mutation stays `assertNetworkAdmin`-gated and every admin page uses `requireNetworkAdmin` (server-side notFound for coordinators).
