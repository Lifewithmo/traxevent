# Phase 6a: Industry Packs (Feature-Flag / Module Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each org an "industry pack" that declares which admin modules are active, so the same engine can present a coffee-cart, caterer, or florist workspace instead of only the church/camp one.

**Architecture:** A pure config layer (`lib/industry-packs.ts`) defines packs — each a named bundle of a `ModuleId[]` plus catalog/payment metadata, referencing an existing event type for terminology. An org stores an optional `industry_pack_id`; the admin org-layout resolves the pack's enabled modules and passes them to `AdminSidebar`, which gates each workspace nav link. Absent a pack, the org falls back to `general` (every module on), so existing orgs are unchanged.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), TypeScript, Firestore (`firebase-admin`), Vitest + Testing Library.

## Global Constraints

- **This is NOT stock Next.js** — read the relevant guide in `node_modules/next/dist/docs/` before touching routing/layout code (per `AGENTS.md`).
- `lib/industry-packs.ts` must be **pure and synchronous** (no `firebase-admin`, no `server-only`) so it is importable from both server and client components — mirror `lib/event-types.ts`.
- Backwards compatibility is mandatory: an org with **no** `industry_pack_id` must see the exact nav it sees today. The `general` pack encodes today's full module set.
- Server actions live in `actions/*.ts` with `'use server'` and guard every mutation with `assertOrgAdmin` from `@/lib/auth/assert`.
- Tests mock `@/lib/firebase-admin` and `@/lib/auth/assert` with `vi.hoisted` spies — follow the pattern in `__tests__/actions/event-types.test.ts`.
- Run the full suite with `npm test` (Vitest, `passWithNoTests` is on). Typecheck with `npx tsc --noEmit`.
- **Out of scope for 6a** (do not build here): the "choose your industry" signup UI, an industry settings page, and the new domain modules themselves (catalog, inventory, deliverables, routing, POS). 6a only declares module ids and gates existing nav. Those `ModuleId`s are defined now for forward-compatibility but have no nav yet.

---

### Task 1: Industry-pack config layer

**Files:**
- Create: `lib/industry-packs.ts`
- Test: `__tests__/lib/industry-packs.test.ts`

**Interfaces:**
- Consumes: `EventTypeId` from `@/lib/event-types` (referenced by `eventTypeId`).
- Produces:
  - `type ModuleId = 'leads' | 'clients' | 'proposals' | 'contracts' | 'invoices' | 'events' | 'registrants' | 'vendors' | 'calendar' | 'reports' | 'catalog' | 'inventory' | 'deliverables' | 'routing' | 'pos'`
  - `interface IndustryPack { id: string; name: string; description: string; eventTypeId: EventTypeId | string; modules: ModuleId[]; catalogKind: 'menu' | 'services' | 'rental-stock' | null; publicMode: boolean }`
  - `const DEFAULT_INDUSTRY_PACK_ID = 'general'`
  - `function getIndustryPack(id?: string): IndustryPack` — falls back to `general` for unknown/undefined.
  - `function getAllIndustryPacks(): IndustryPack[]`
  - `function isModuleEnabled(pack: IndustryPack, moduleId: ModuleId): boolean`
  - `function resolveEnabledModules(industryPackId?: string): ModuleId[]`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/industry-packs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  getIndustryPack,
  getAllIndustryPacks,
  isModuleEnabled,
  resolveEnabledModules,
  DEFAULT_INDUSTRY_PACK_ID,
} from '@/lib/industry-packs'

const ALL_MODULES = [
  'leads', 'clients', 'proposals', 'contracts', 'invoices',
  'events', 'registrants', 'vendors', 'calendar', 'reports',
] as const

describe('industry packs', () => {
  it('has a general pack that enables every currently-shipped module', () => {
    const general = getIndustryPack('general')
    expect(general.id).toBe('general')
    for (const m of ALL_MODULES) {
      expect(general.modules).toContain(m)
    }
  })

  it('falls back to general for an unknown id', () => {
    expect(getIndustryPack('does-not-exist').id).toBe(DEFAULT_INDUSTRY_PACK_ID)
  })

  it('falls back to general for undefined', () => {
    expect(getIndustryPack(undefined).id).toBe('general')
  })

  it('coffee-cart enables the sales spine + calendar + catalog, and hides registrants', () => {
    const cart = getIndustryPack('coffee-cart')
    expect(cart.modules).toContain('invoices')
    expect(cart.modules).toContain('catalog')
    expect(cart.modules).not.toContain('registrants')
  })

  it('isModuleEnabled reflects pack membership', () => {
    const cart = getIndustryPack('coffee-cart')
    expect(isModuleEnabled(cart, 'invoices')).toBe(true)
    expect(isModuleEnabled(cart, 'registrants')).toBe(false)
  })

  it('resolveEnabledModules(undefined) returns the full general set', () => {
    expect(resolveEnabledModules(undefined)).toEqual(getIndustryPack('general').modules)
  })

  it('every pack references a non-empty event type id and a module list', () => {
    for (const pack of getAllIndustryPacks()) {
      expect(pack.eventTypeId).toBeTruthy()
      expect(pack.modules.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- industry-packs`
Expected: FAIL — cannot resolve `@/lib/industry-packs`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/industry-packs.ts`:

```typescript
import type { EventTypeId } from '@/lib/event-types'

export type ModuleId =
  | 'leads' | 'clients' | 'proposals' | 'contracts' | 'invoices'
  | 'events' | 'registrants' | 'vendors' | 'calendar' | 'reports'
  // Forward-declared for later phases; no nav renders these yet.
  | 'catalog' | 'inventory' | 'deliverables' | 'routing' | 'pos'

export interface IndustryPack {
  id: string
  name: string
  description: string
  eventTypeId: EventTypeId | string   // terminology comes from the event type
  modules: ModuleId[]                  // which admin modules are active
  catalogKind: 'menu' | 'services' | 'rental-stock' | null
  publicMode: boolean                  // food-truck public-sale / POS mode
}

export const DEFAULT_INDUSTRY_PACK_ID = 'general'

// Everything currently shipped in the workspace nav — the backwards-compatible default.
const ALL_CURRENT_MODULES: ModuleId[] = [
  'leads', 'clients', 'proposals', 'contracts', 'invoices',
  'events', 'registrants', 'vendors', 'calendar', 'reports',
]

const BUILT_IN_PACKS: IndustryPack[] = [
  {
    id: 'general',
    name: 'General',
    description: 'Every module enabled — the default for existing orgs.',
    eventTypeId: 'summer-camp',
    modules: [...ALL_CURRENT_MODULES],
    catalogKind: null,
    publicMode: false,
  },
  {
    id: 'coffee-cart',
    name: 'Coffee Cart',
    description: 'Mobile beverage vendor booking private events.',
    eventTypeId: 'gala',
    modules: ['leads', 'clients', 'proposals', 'contracts', 'invoices', 'calendar', 'reports', 'catalog', 'inventory'],
    catalogKind: 'menu',
    publicMode: false,
  },
  {
    id: 'caterer',
    name: 'Caterer',
    description: 'Event catering: menu, headcount, staffing, delivery.',
    eventTypeId: 'gala',
    modules: ['leads', 'clients', 'proposals', 'contracts', 'invoices', 'calendar', 'reports', 'catalog', 'inventory', 'deliverables', 'routing'],
    catalogKind: 'menu',
    publicMode: false,
  },
  {
    id: 'florist',
    name: 'Event Florist',
    description: 'Wedding & event floral design and installation.',
    eventTypeId: 'gala',
    modules: ['leads', 'clients', 'proposals', 'contracts', 'invoices', 'calendar', 'reports', 'inventory', 'deliverables', 'routing'],
    catalogKind: 'services',
    publicMode: false,
  },
  {
    id: 'photographer',
    name: 'Photographer',
    description: 'Event & portrait photography with questionnaires and galleries.',
    eventTypeId: 'gala',
    modules: ['leads', 'clients', 'proposals', 'contracts', 'invoices', 'calendar', 'reports', 'deliverables'],
    catalogKind: 'services',
    publicMode: false,
  },
]

const PACK_MAP = new Map<string, IndustryPack>(BUILT_IN_PACKS.map((p) => [p.id, p]))

export function getIndustryPack(id?: string): IndustryPack {
  return (id ? PACK_MAP.get(id) : undefined) ?? PACK_MAP.get(DEFAULT_INDUSTRY_PACK_ID)!
}

export function getAllIndustryPacks(): IndustryPack[] {
  return [...BUILT_IN_PACKS]
}

export function isModuleEnabled(pack: IndustryPack, moduleId: ModuleId): boolean {
  return pack.modules.includes(moduleId)
}

export function resolveEnabledModules(industryPackId?: string): ModuleId[] {
  return getIndustryPack(industryPackId).modules
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- industry-packs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/industry-packs.ts __tests__/lib/industry-packs.test.ts
git commit -m "feat: industry-pack config layer with module resolution"
```

---

### Task 2: `setOrgIndustry` server action + Org type field

**Files:**
- Modify: `lib/types.ts` (add field to `Org`, near `plan?` at `lib/types.ts:13`)
- Modify: `actions/orgs.ts` (add import + new action at end of file)
- Test: `__tests__/actions/orgs-industry.test.ts`

**Interfaces:**
- Consumes: `getAllIndustryPacks` from `@/lib/industry-packs` (Task 1); `assertOrgAdmin` from `@/lib/auth/assert`.
- Produces: `async function setOrgIndustry(orgId: string, industryPackId: string): Promise<void>` — validates the pack id, then writes `{ industry_pack_id }` onto the org doc. Throws `Error('Unknown industry pack')` for an unrecognized id.

- [ ] **Step 1: Write the failing test**

Create `__tests__/actions/orgs-industry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const orgDocSpy = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue(orgDocSpy),
    }),
  },
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
}))

// orgs.ts imports setOrgClaims from '@/actions/auth'; stub it so the module graph
// does not pull real auth/firebase during import.
vi.mock('@/actions/auth', () => ({ setOrgClaims: vi.fn().mockResolvedValue(undefined) }))

import { setOrgIndustry } from '@/actions/orgs'

describe('setOrgIndustry', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes a valid pack id onto the org doc', async () => {
    await setOrgIndustry('org-1', 'coffee-cart')
    expect(orgDocSpy.update).toHaveBeenCalledWith({ industry_pack_id: 'coffee-cart' })
  })

  it('rejects an unknown pack id and does not write', async () => {
    await expect(setOrgIndustry('org-1', 'nope')).rejects.toThrow('Unknown industry pack')
    expect(orgDocSpy.update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- orgs-industry`
Expected: FAIL — `setOrgIndustry` is not exported from `@/actions/orgs`.

- [ ] **Step 3: Write minimal implementation**

In `lib/types.ts`, add one field to the `Org` interface (place it right after the `plan?: BillingPlan` line at `lib/types.ts:13`):

```typescript
  industry_pack_id?: string          // selected industry pack; absent = 'general'
```

In `actions/orgs.ts`, add the assert import beneath the existing imports (after line 6):

```typescript
import { assertOrgAdmin } from '@/lib/auth/assert'
import { getAllIndustryPacks } from '@/lib/industry-packs'
```

Then append the action at the end of `actions/orgs.ts`:

```typescript
export async function setOrgIndustry(orgId: string, industryPackId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const known = getAllIndustryPacks().some((p) => p.id === industryPackId)
  if (!known) throw new Error('Unknown industry pack')
  await adminDb.collection('orgs').doc(orgId).update({ industry_pack_id: industryPackId })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- orgs-industry`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts actions/orgs.ts __tests__/actions/orgs-industry.test.ts
git commit -m "feat: setOrgIndustry action + Org.industry_pack_id field"
```

---

### Task 3: Gate the workspace nav on enabled modules

**Files:**
- Modify: `components/layout/AdminSidebar.tsx`
- Test: `__tests__/components/AdminSidebar.test.tsx`

**Interfaces:**
- Consumes: `ModuleId` from `@/lib/industry-packs` (Task 1).
- Produces: `AdminSidebarProps` gains `enabledModules?: ModuleId[]`. When omitted, every link renders (today's behavior). When provided, a workspace link renders only if its module is in the list; a section header renders only if at least one of its links is visible. The Settings block always renders.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/AdminSidebar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/auth/establish-session', () => ({ endSession: vi.fn() }))

import { AdminSidebar } from '@/components/layout/AdminSidebar'

describe('AdminSidebar workspace nav gating', () => {
  it('shows every workspace link when enabledModules is omitted', () => {
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByText('Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Registrants')).toBeInTheDocument()
    expect(screen.getByText('Vendors')).toBeInTheDocument()
  })

  it('hides links whose module is not enabled', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads', 'invoices', 'calendar']} />)
    expect(screen.getByText('Pipeline')).toBeInTheDocument()   // leads
    expect(screen.getByText('Invoices')).toBeInTheDocument()   // invoices
    expect(screen.queryByText('Registrants')).not.toBeInTheDocument()
    expect(screen.queryByText('Vendors')).not.toBeInTheDocument()
  })

  it('hides a section header when none of its links are enabled', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads']} />)
    // Insights holds only Reports; with reports disabled the header is gone.
    expect(screen.queryByText('Insights')).not.toBeInTheDocument()
  })

  it('always shows the Settings block regardless of modules', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads']} />)
    expect(screen.getByText('Members')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AdminSidebar`
Expected: FAIL — `enabledModules` is not honored (Registrants/Vendors still render; the prop is unknown to the component).

- [ ] **Step 3: Write minimal implementation**

In `components/layout/AdminSidebar.tsx`:

1. Add the import at the top (after the `event-types` import on line 6):

```tsx
import type { ModuleId } from '@/lib/industry-packs'
```

2. Extend the props interface (`AdminSidebarProps`, lines 11-16) with the new optional field:

```tsx
  enabledModules?: ModuleId[]
```

3. Inside the component body, after `const t = terminology ?? DEFAULT_TERMINOLOGY` (line 72), add the gate helper and the data-driven workspace nav model:

```tsx
  const has = (m: ModuleId) => !enabledModules || enabledModules.includes(m)

  const salesLinks = [
    { module: 'leads' as ModuleId, label: 'Pipeline', slug: 'leads' },
    { module: 'clients' as ModuleId, label: 'Clients', slug: 'clients' },
    { module: 'proposals' as ModuleId, label: 'Proposals', slug: 'proposals' },
    { module: 'contracts' as ModuleId, label: 'Contracts', slug: 'contracts' },
    { module: 'invoices' as ModuleId, label: 'Invoices', slug: 'invoices' },
  ].filter((l) => has(l.module))

  const eventLinks = [
    { module: 'registrants' as ModuleId, label: 'Registrants', slug: 'registrants' },
    { module: 'vendors' as ModuleId, label: 'Vendors', slug: 'vendors' },
    { module: 'calendar' as ModuleId, label: 'Calendar', slug: 'calendar' },
  ].filter((l) => has(l.module))
```

4. Replace the hard-coded workspace `<nav>` (the `else` branch, lines 133-207) so each section renders from the arrays and only when it has visible links. Keep the `Events` root link gated on the `events` module, and leave the Settings block exactly as-is (always rendered):

```tsx
        <nav className="flex-1" aria-label="Workspace navigation">
          {salesLinks.length > 0 && (
            <Section label="Sales">
              {salesLinks.map((l) => (
                <Link key={l.slug} href={`/${orgSlug}/${l.slug}`} className={navClass(`/${orgSlug}/${l.slug}`)}>
                  {l.label}
                </Link>
              ))}
            </Section>
          )}

          {(has('events') || eventLinks.length > 0) && (
            <Section label="Events">
              {has('events') && (
                <Link href={`/${orgSlug}`} className={exactNavClass(`/${orgSlug}`)}>
                  Events
                </Link>
              )}
              {eventLinks.map((l) => (
                <Link key={l.slug} href={`/${orgSlug}/${l.slug}`} className={navClass(`/${orgSlug}/${l.slug}`)}>
                  {l.label}
                </Link>
              ))}
            </Section>
          )}

          {has('reports') && (
            <Section label="Insights">
              <Link href={`/${orgSlug}/reports`} className={navClass(`/${orgSlug}/reports`)}>
                Reports
              </Link>
            </Section>
          )}

          <div className="px-2 py-3">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300"
              aria-expanded={settingsOpen}
            >
              <span>Settings</span>
              <span>{settingsOpen ? '−' : '+'}</span>
            </button>
            {settingsOpen && (
              <div className="space-y-0.5">
                <Link href={`/${orgSlug}/members`} className={navClass(`/${orgSlug}/members`)}>Members</Link>
                <Link href={`/${orgSlug}/permissions`} className={navClass(`/${orgSlug}/permissions`)}>Permissions</Link>
                <Link href={`/${orgSlug}/billing`} className={navClass(`/${orgSlug}/billing`)}>Billing</Link>
                <Link href={`/${orgSlug}/email-domain`} className={navClass(`/${orgSlug}/email-domain`)}>Email domain</Link>
                <Link href={`/${orgSlug}/event-types`} className={navClass(`/${orgSlug}/event-types`)}>Event types</Link>
                <Link href={`/${orgSlug}/departments`} className={navClass(`/${orgSlug}/departments`)}>Departments</Link>
              </div>
            )}
          </div>
        </nav>
```

5. Add `enabledModules` to the destructured props in the function signature (line 54):

```tsx
export function AdminSidebar({ orgSlug, campSlug, terminology, allowedCampPages, enabledModules }: AdminSidebarProps) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- AdminSidebar`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/layout/AdminSidebar.tsx __tests__/components/AdminSidebar.test.tsx
git commit -m "feat: gate admin workspace nav on enabled modules"
```

---

### Task 4: Wire the org layout to resolve and pass modules

**Files:**
- Modify: `app/(admin)/[orgSlug]/layout.tsx`

**Interfaces:**
- Consumes: `org` from `requireOrgMember` (already returns `{ org, orgId, member }`, see `lib/auth/guards.ts:11`); `resolveEnabledModules` from `@/lib/industry-packs` (Task 1); the `enabledModules` prop on `AdminSidebar` (Task 3).
- Produces: no new exports — this is the integration point that makes the whole chain live.

- [ ] **Step 1: Update the layout**

Replace the body of `app/(admin)/[orgSlug]/layout.tsx` so it destructures the org and passes its resolved modules:

```tsx
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { requireOrgMember } from '@/lib/auth/guards'
import { resolveEnabledModules } from '@/lib/industry-packs'

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  // Gate the entire admin surface: must be a logged-in member of this org.
  // redirect('/login') if unauthenticated; notFound() if not a member of this org.
  const { org } = await requireOrgMember(orgSlug)
  const enabledModules = resolveEnabledModules(org.industry_pack_id)
  return (
    <div className="flex min-h-screen">
      <AdminSidebar orgSlug={orgSlug} enabledModules={enabledModules} />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck the wiring**

Run: `npx tsc --noEmit`
Expected: PASS with no errors (this proves `org.industry_pack_id`, `resolveEnabledModules`, and the `enabledModules` prop all line up across Tasks 1–3).

- [ ] **Step 3: Run the full suite for regressions**

Run: `npm test`
Expected: PASS — no existing test breaks (orgs with no pack resolve to `general`, so nav is unchanged).

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/[orgSlug]/layout.tsx"
git commit -m "feat: resolve org industry pack and pass enabled modules to sidebar"
```

---

## Self-Review

**Spec coverage** (against the build-sequence step 1 "realize the feature-flag layer" + the module × industry matrix in the gap artifact):
- Module ids for existing nav + forward-declared future modules → Task 1 ✅
- Per-industry module sets (general, coffee-cart, caterer, florist, photographer) → Task 1 ✅
- Backwards-compatible default (`general` = all modules; undefined pack resolves to it) → Task 1 + Task 4 ✅
- Org stores the chosen pack → Task 2 ✅
- A guarded way to set it → Task 2 (`setOrgIndustry`) ✅
- Nav reflects the pack → Tasks 3 + 4 ✅
- Deferred deliberately (documented in Global Constraints): "choose your industry" onboarding UI, industry settings page, and the catalog/inventory/deliverables/routing/pos modules themselves. These are Phase 6b+.

**Placeholder scan:** no TBD/TODO; every code and test step contains real content. ✅

**Type consistency:** `ModuleId` and `IndustryPack` defined in Task 1 are the exact names consumed in Tasks 2–4; `setOrgIndustry(orgId, industryPackId): Promise<void>` matches its test; `enabledModules?: ModuleId[]` prop name is identical in Task 3's component, its test, and Task 4's layout; `resolveEnabledModules` / `getAllIndustryPacks` / `getIndustryPack` names are stable across tasks. ✅

**Note for the implementer:** `__tests__/lib/` and `__tests__/components/` may not exist yet — the Create steps establish them; no config change is needed (Vitest globs `__tests__/**`).

## Immediate follow-ups (Phase 6b, separate plan)

1. **Industry settings page** — a `/[orgSlug]/settings/industry` form calling `setOrgIndustry`, so the action is user-reachable.
2. **"Choose your industry" onboarding step** — set `industry_pack_id` during signup (`app/(auth)/onboarding`).
3. **First new module: Catalog/menu** — the highest-leverage module shared by coffee-cart, caterer, and food-truck packs.
