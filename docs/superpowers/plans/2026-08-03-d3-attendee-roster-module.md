# D3 — Demote the Attendee-Roster Cluster to an Optional Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the individually-tracked-attendee cluster (family/member roster, attendee assignments, individual check-in, and self-registration) behind an optional `attendee-roster` module that is ON for existing orgs but OFF for booked-job verticals, and give the booked-job path an Event `headcount` + `key_contacts` instead.

**Architecture:** Reuse the Phase 6a module system (`lib/industry-packs.ts` `ModuleId` + `resolveEnabledModules`). Add an `attendee-roster` module, include it in the backwards-compatible `general` pack (so existing orgs are unchanged), gate the roster's per-event nav items and its routes on it, and add two optional Event fields for the no-roster path. Pure gating + additive fields — no existing behavior changes for orgs that have the module (i.e. everyone today).

**Tech Stack:** Next.js 16 App Router (RSC + client components), TypeScript, Firestore (`firebase-admin`), Vitest + Testing Library.

## Global Constraints

- **This is NOT stock Next.js** — consult `node_modules/next/dist/docs/` before adding route guards/layouts (`AGENTS.md`).
- **Backwards compatibility is mandatory.** The `general` pack MUST include `attendee-roster`, and an org with no `industry_pack_id` resolves to `general`. So every existing org keeps the full roster, unchanged. Booked-job packs (`coffee-cart`, `caterer`, `florist`, `photographer`) MUST NOT include it.
- **Gated set (the roster) — decided scope:** per-event nav items `families`, `assignments`, `checkin`; the public self-registration routes `app/(public)/[orgSlug]/[eventSlug]/register/**`; and the registrant portal `app/(registrant)/**`. **NOT gated (kept core):** `people` (staff/volunteers = staffing), `forms` (kept as questionnaires), `itinerary`, `communicate`, `reports`, `dashboard`, `settings`, `calendar`, `teams`, `budget`.
- **Code is kept, only gated.** Do not delete the roster actions/components; they must still work when the module is on.
- Green gate: after each task, `npx tsc --noEmit` clean AND `npm test` passes (441 tests; no new failures). node_modules is synced in this worktree.
- Work only in `/Users/rm/vw/traxevent/.claude/worktrees/d3-attendee-roster` on branch `claude/d3-attendee-roster`. Before every commit, confirm `git rev-parse --abbrev-ref HEAD` prints `claude/d3-attendee-roster`; if not, STOP.

---

### Task 1: Add the `attendee-roster` module + Event `headcount`/`key_contacts`

**Files:**
- Modify: `lib/industry-packs.ts` (add `'attendee-roster'` to `ModuleId`; add it to the `general` pack's `modules`; leave booked-job packs without it)
- Modify: `lib/types.ts` (add `headcount?` and `key_contacts?` to `Event`; add `EventKeyContact` interface)
- Test: `__tests__/lib/industry-packs.test.ts` (extend)

**Interfaces:**
- Consumes: the Phase 6a `ModuleId`/`IndustryPack`/`resolveEnabledModules` (existing).
- Produces:
  - `ModuleId` now includes `'attendee-roster'`.
  - `interface EventKeyContact { name: string; role: string; phone?: string; email?: string }`
  - `Event.headcount?: number`, `Event.key_contacts?: EventKeyContact[]`.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/lib/industry-packs.test.ts`:

```typescript
it('general pack includes attendee-roster (existing orgs keep the roster)', () => {
  expect(getIndustryPack('general').modules).toContain('attendee-roster')
})

it('booked-job packs exclude attendee-roster (headcount path instead)', () => {
  for (const id of ['coffee-cart', 'caterer', 'florist', 'photographer']) {
    expect(getIndustryPack(id).modules).not.toContain('attendee-roster')
  }
})

it('resolveEnabledModules(undefined) includes attendee-roster (default = general)', () => {
  expect(resolveEnabledModules(undefined)).toContain('attendee-roster')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- industry-packs`
Expected: FAIL — `attendee-roster` not in the type/packs yet.

- [ ] **Step 3: Implement**

In `lib/industry-packs.ts`: add `| 'attendee-roster'` to the `ModuleId` union, and add `'attendee-roster'` to the `general` pack's `modules` array (do NOT add it to coffee-cart/caterer/florist/photographer).

In `lib/types.ts`, add near the other Event fields (after `capacity?` at `lib/types.ts:78`):

```typescript
  headcount?: number                 // booked-job path: expected guest count (no per-person roster)
  key_contacts?: EventKeyContact[]   // booked-job path: a few contacts instead of an attendee roster
```

And add the interface (near `Event`):

```typescript
export interface EventKeyContact {
  name: string
  role: string
  phone?: string
  email?: string
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- industry-packs`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit` (clean), then `npm test` (441+ pass, no new failures).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(d3): add attendee-roster module + Event headcount/key_contacts"
```

---

### Task 2: Gate the per-event roster nav on the module

**Files:**
- Modify: `components/layout/AdminSidebar.tsx` (thread `enabledModules` into the per-event nav; hide `families`/`assignments`/`checkin` when `attendee-roster` is off)
- Modify: `app/(admin)/[orgSlug]/[eventSlug]/layout.tsx` (pass `enabledModules` to the event sidebar — resolve via `resolveEnabledModules(org.industry_pack_id)`, mirroring `app/(admin)/[orgSlug]/layout.tsx:16`)
- Test: `__tests__/components/AdminSidebar.test.tsx` (extend)

**Interfaces:**
- Consumes: `ModuleId`/`resolveEnabledModules` (Task 1), the existing `enabledModules?: ModuleId[]` prop on `AdminSidebar`.
- Produces: the event nav hides `families`/`assignments`/`checkin` when `enabledModules` is provided and lacks `attendee-roster`; unchanged when `enabledModules` is undefined (backwards compat) or includes it.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/components/AdminSidebar.test.tsx` (event-nav variant — pass `eventSlug` so the per-event nav renders):

```tsx
it('hides roster event-nav items when attendee-roster module is off', () => {
  render(<AdminSidebar orgSlug="acme" eventSlug="e1" enabledModules={['events','reports','forms']} />)
  expect(screen.queryByText('Families')).not.toBeInTheDocument()
  expect(screen.queryByText('Check-in')).not.toBeInTheDocument()
  expect(screen.getByText('Dashboard')).toBeInTheDocument() // non-roster stays
})

it('shows roster event-nav items when attendee-roster is enabled', () => {
  render(<AdminSidebar orgSlug="acme" eventSlug="e1" enabledModules={['events','attendee-roster']} />)
  expect(screen.getByText('Check-in')).toBeInTheDocument()
})
```
(NOTE: the `Families` label is `terminology.registrantPlural`; with the default terminology it renders "Families". If the default differs, assert on the actual default plural — read `lib/event-types.ts` `DEFAULT_EVENT_TYPE_ID` terminology to confirm the label before finalizing the assertion.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AdminSidebar`
Expected: FAIL — roster items still render.

- [ ] **Step 3: Implement**

In `components/layout/AdminSidebar.tsx`, in the event-nav branch (where `getEventNav` is filtered by `allowedEventPages`), add a module gate: define `const ROSTER_KEYS = new Set(['families','assignments','checkin'])`, and in the visible-nav filter also require `!ROSTER_KEYS.has(n.key) || has('attendee-roster')` (reuse the existing `has` helper). Keep the existing `allowedEventPages` permission filter — a roster item shows only if BOTH permitted AND the module is on.

In `app/(admin)/[orgSlug]/[eventSlug]/layout.tsx`, resolve the org (it already loads the event/org) and pass `enabledModules={resolveEnabledModules(org.industry_pack_id)}` to the `AdminSidebar` it renders. If that layout does not currently have the `org`, load it via the existing org guard/`getOrgBySlug` used elsewhere in the admin tree.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- AdminSidebar`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit` (clean), then `npm test` (no new failures).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(d3): gate families/assignments/checkin event-nav on attendee-roster module"
```

---

### Task 3: Guard the self-registration + registrant-portal routes

**Files:**
- Create: `lib/auth/module-guard.ts` (a small server helper `assertOrgModule(orgSlug, moduleId)` → resolves the org's pack, `notFound()` if the module is off)
- Modify: `app/(public)/[orgSlug]/[eventSlug]/register/page.tsx` (and the `register` subroutes' shared entry) — call the guard server-side
- Create/Modify: a server guard for the registrant portal (`app/(registrant)/**`) — since `app/(registrant)/layout.tsx` is a client component, add the check where the org is known (the `[orgSlug]` event routes), not the client root layout
- Test: `__tests__/lib/module-guard.test.ts`

**Interfaces:**
- Consumes: `resolveEnabledModules` + `getOrgBySlug` (existing).
- Produces: `async function assertOrgModule(orgSlug: string, moduleId: ModuleId): Promise<void>` — throws `notFound()` (Next.js) when the org's resolved modules lack `moduleId`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/module-guard.test.ts` (mock `@/actions/orgs` `getOrgBySlug` and `next/navigation` `notFound`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
const notFoundSpy = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound: notFoundSpy }))
const getOrgSpy = vi.hoisted(() => vi.fn())
vi.mock('@/actions/orgs', () => ({ getOrgBySlug: getOrgSpy }))
import { assertOrgModule } from '@/lib/auth/module-guard'

describe('assertOrgModule', () => {
  beforeEach(() => vi.clearAllMocks())
  it('passes when the org has the module (general pack / no pack)', async () => {
    getOrgSpy.mockResolvedValue({ id: 'o1', industry_pack_id: undefined })
    await assertOrgModule('acme', 'attendee-roster')
    expect(notFoundSpy).not.toHaveBeenCalled()
  })
  it('calls notFound when the org lacks the module (coffee-cart)', async () => {
    getOrgSpy.mockResolvedValue({ id: 'o1', industry_pack_id: 'coffee-cart' })
    await expect(assertOrgModule('acme', 'attendee-roster')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFoundSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- module-guard`
Expected: FAIL — module not resolvable.

- [ ] **Step 3: Implement the guard**

Create `lib/auth/module-guard.ts`:

```typescript
import 'server-only'
import { notFound } from 'next/navigation'
import { getOrgBySlug } from '@/actions/orgs'
import { resolveEnabledModules, type ModuleId } from '@/lib/industry-packs'

export async function assertOrgModule(orgSlug: string, moduleId: ModuleId): Promise<void> {
  const org = await getOrgBySlug(orgSlug)
  const modules = resolveEnabledModules(org?.industry_pack_id)
  if (!modules.includes(moduleId)) notFound()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- module-guard`
Expected: PASS.

- [ ] **Step 5: Wire the guard into the routes**

In the public register route `app/(public)/[orgSlug]/[eventSlug]/register/page.tsx` (a server component), near the top after resolving `params`, `await assertOrgModule(orgSlug, 'attendee-roster')`. Do the same at the entry of the registrant event routes under `app/(registrant)/[orgSlug]/[eventSlug]/` that are server components; for any that are client components, add a thin server `layout.tsx` in that segment that calls the guard and renders `{children}`. (Do NOT convert the existing client `app/(registrant)/layout.tsx` — add the guard at the `[orgSlug]`-scoped level where the org slug is a route param.)

- [ ] **Step 6: Typecheck + full suite**

Run: `npx tsc --noEmit` (clean), then `npm test` (no new failures).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(d3): guard self-registration + registrant portal on attendee-roster module"
```

---

### Task 4: Headcount + key-contacts UI on the event

**Files:**
- Modify: `app/(admin)/[orgSlug]/[eventSlug]/settings/page.tsx` (add headcount + key-contacts editing when the roster module is OFF)
- Modify: `actions/events.ts` (`updateEvent` accepts `headcount`/`key_contacts`)
- Modify: `app/(admin)/[orgSlug]/[eventSlug]/dashboard/page.tsx` (show headcount when roster off)
- Test: `__tests__/actions/events.test.ts` (extend — `updateEvent` persists the new fields)

**Interfaces:**
- Consumes: `Event.headcount`/`key_contacts` (Task 1), `assertOrgModule`/`resolveEnabledModules` to decide when to show the UI.
- Produces: `updateEvent` persists `headcount` and `key_contacts`.

- [ ] **Step 1: Write the failing test**

Extend `__tests__/actions/events.test.ts`:

```typescript
it('updateEvent persists headcount and key_contacts', async () => {
  await updateEvent('org-1', 'evt-1', { headcount: 120, key_contacts: [{ name: 'Sam', role: 'Coordinator' }] })
  expect(eventDocSpy.update).toHaveBeenCalledWith(
    expect.objectContaining({ headcount: 120, key_contacts: [{ name: 'Sam', role: 'Coordinator' }] })
  )
})
```
(Match the existing mock spy name in that test file for the event doc; read it first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- events`
Expected: FAIL — `updateEvent` drops the new fields (if it whitelists inputs) or the type rejects them.

- [ ] **Step 3: Implement**

In `actions/events.ts`, ensure `updateEvent`'s input type and write include `headcount?: number` and `key_contacts?: EventKeyContact[]` (follow the existing update-payload pattern; if it spreads a typed `Partial<Event>`, just confirm the fields flow through).

In `app/(admin)/[orgSlug]/[eventSlug]/settings/page.tsx`: when `!enabledModules.includes('attendee-roster')` (resolve via the org's pack), render a Headcount number input and a simple Key Contacts editor (name + role rows) that submit through `updateEvent`. When the roster IS on, this section is hidden (the roster is the source of counts).

In the dashboard page, when the roster is off, show the `headcount` figure instead of a registrant count.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- events`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit` (clean), then `npm test` (no new failures).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(d3): headcount + key-contacts UI on events when roster module is off"
```

---

### Task 5: Backwards-compat verification + roster-off smoke

**Files:** none new — this task is the acceptance gate.

- [ ] **Step 1: Confirm default/general orgs are unchanged**

Run: `npx tsc --noEmit` (clean) and the full suite `npm test` (441+ pass, no new failures). Because `general` includes `attendee-roster` and no-pack resolves to `general`, every existing test (which uses orgs without a pack) must see the roster exactly as before — a green suite is the backwards-compat proof.

- [ ] **Step 2: Verify the gate points all reference the same module id**

Run: `grep -rn "attendee-roster" --include=*.ts --include=*.tsx . | grep -v node_modules`
Confirm the literal `'attendee-roster'` is identical across `lib/industry-packs.ts`, `AdminSidebar.tsx`, `module-guard.ts`, and the route/UI call sites (no typo'd variant). All should be the exact string.

- [ ] **Step 3: Confirm the guarded routes call the guard**

Run: `grep -rn "assertOrgModule" app --include=*.tsx | grep -v node_modules`
Expected: the public register route and the registrant `[orgSlug]` event segment both call `assertOrgModule(orgSlug, 'attendee-roster')`.

- [ ] **Step 4: Commit (if any doc/notes)**

No code change expected. If Steps 1-3 surfaced a gap, it belongs to the owning earlier task — fix there, not here. Otherwise record completion in the report only.

---

## Self-Review

**Spec coverage** (against D3 in the neutralization design):
- New optional module gating the roster cluster, OFF for booked-job packs → Task 1 + gates in Tasks 2-3 ✅
- Backwards-compatible (general pack includes it; existing orgs unchanged) → Task 1 + Task 5 ✅
- New Event `headcount` + key contacts → Task 1 (types) + Task 4 (UI/persistence) ✅
- Roster code KEPT, only gated → Tasks 2-3 gate, nothing deleted ✅
- Staffing (`people`) + forms-as-questionnaires KEPT core → Global Constraints (not in gated set) ✅

**Placeholder scan:** each task has concrete files, real test code, and tsc/suite gates. The one soft spot is Task 3's registrant-portal wiring (client vs server layout) — the plan specifies adding the guard at the `[orgSlug]`-scoped server level, not the client root; the implementer confirms the exact segment.

**Type consistency:** `attendee-roster` is the single module id used across Tasks 1-5 (Task 5 Step 2 verifies no typo'd variant). `EventKeyContact` is defined in Task 1 and consumed in Task 4. `assertOrgModule(orgSlug, moduleId)` signature is stable across Task 3's definition and its call sites.

**Assumptions the reviewer/user may adjust:** the exact gated nav set (`families`/`assignments`/`checkin`) and that `forms`/`people` stay core. These are documented in Global Constraints; if the intended roster boundary differs, it's a one-line change to `ROSTER_KEYS` and the gated set.
