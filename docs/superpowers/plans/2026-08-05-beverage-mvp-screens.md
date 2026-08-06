# Beverage MVP Screens (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The four beverage-MVP screen groups from spec §4 — catalog (packages/resources/checklists), the event Ops tab, a thin compliance tracker, and the closeout flow with "generate final invoice" — on top of the merged ops core.

**Architecture:** Server pages guard (`requireOrgMember` / `requireEventPage(…, 'ops')`) and fetch via existing server actions or lib cores, then hand everything to `'use client'` components under `components/admin/ops/` that call server actions directly (the `ItineraryClient` pattern). New backend surface is limited to: compliance cores/actions (the one spec §4 item the ops core didn't build), a photo-evidence upload action backed by admin-SDK Storage, and one closeout→invoice action in `actions/invoices.ts`.

**Tech Stack:** Next.js 16 App Router, existing `components/ui/*` primitives, firebase-admin (Firestore + Storage), Vitest + @testing-library/react (jsdom).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-05-multibrand-ops-platform-design.md` §4. Contract sheet: `docs/superpowers/plans/2026-08-05-ops-core-phase3-handoff.md` — read both before starting.
- Depth ceiling is beverage-solo: NO POS/Square, NO staffing/scheduling, NO purchasing aggregation, NO routing/dispatch, NO warehouse inventory/reservations, NO SOP versioning, NO department views, NO escalation workflows, NO jurisdiction-aware compliance. Labor lines render as read-only stubs.
- NEVER re-export a type from a `'use server'` module (tsc passes, `next build` breaks — see AGENTS.md). Declare action input types locally in the action file or import types from `lib/*`.
- Run `npm install` then all tests from THIS worktree root only (`npm run test`), never from the primary checkout. Run `npm run build` before calling any task green that touched `actions/` or added routes.
- Money is dollars (floats). Display rounding is `formatMoney` (Task 2): `$` + `toFixed(2)`. Never display raw floats for margin/cost numbers (handoff: "Money floats: specify display rounding").
- Timestamps are ISO strings via `new Date().toISOString()`; dates are `YYYY-MM-DD`.
- Core/action split: cores in `lib/ops/*` do no auth; `'use server'` actions guard (`assertOrgMember` reads, `assertOrgAdmin` catalog writes, `assertEventPage(orgId, eventId, 'ops')` event ops) then delegate.
- Firestore rejects `undefined`: build write payloads conditionally (see `lib/ops/resources.ts` `createResourceCore`/`updateResourceCore` idioms).
- Universal nouns in code (`WorkPackage`, `OpsResource`); vertical labels only in UI copy, resolved from the industry pack (`catalogLabel`, Task 1). No generic noun renders untranslated in a coffee-cart workspace.
- `instantiateOpsPlan` throws `'Ops plan already exists for this event'` — always check `getOpsPlan` first; the UI must NOT offer changing `package_ids` after instantiation (known core gap, deliberately unbuilt).
- Surface `needs_review` prominently; `acknowledgeReview` clears it. Surface `'Package no longer exists: <id>'` as an actionable error, never a blank crash.
- `updateOpsRequirementsCore` has no `null` channel — the UI sends `''` to clear `notes` (conscious workaround; clearing to absent stays deferred).
- Client components MAY import from `lib/ops/derive.ts` (pure, zero Firestore imports) — e.g. `DEADLINE_TEMPLATES` for the general-pack-fallback notice. They may NOT import any `lib/ops/*` module that touches `adminDb`.

## File Structure

Routes (server components, all `export const dynamic = 'force-dynamic'`):

- Create: `app/(admin)/[orgSlug]/packages/page.tsx` — catalog (org-level).
- Create: `app/(admin)/[orgSlug]/compliance/page.tsx` — compliance tracker (org-level).
- Create: `app/(admin)/[orgSlug]/[eventSlug]/ops/page.tsx` — the event Ops tab.
- Create: `app/(admin)/[orgSlug]/[eventSlug]/ops/print/page.tsx` — print view for shopping + packing lists.
- Create: `app/(admin)/[orgSlug]/[eventSlug]/ops/closeout/page.tsx` — closeout flow.

Client components, one responsibility each, all under `components/admin/ops/`:

- `CatalogClient.tsx` (tab shell) + `ResourcesTab.tsx` + `PackagesTab.tsx` + `ChecklistTemplatesTab.tsx`
- `OpsPlanClient.tsx` (holds plan state, composes cards) + `OpsSetup.tsx` (instantiate wizard) + `ReadinessHeader.tsx` + `RequirementsCard.tsx` + `DeadlinesCard.tsx` + `ListsCard.tsx` + `ChecklistsCard.tsx` + `IssuesCard.tsx`
- `CloseoutClient.tsx`, `ComplianceClient.tsx`, `PrintButton.tsx`

Lib / actions:

- Modify: `lib/industry-packs.ts` — `'compliance'` ModuleId, coffee-cart gets it, `catalogLabel()`.
- Modify: `components/layout/AdminSidebar.tsx` — Operations org-nav section, `Event Ops` event-nav item.
- Modify: `app/(admin)/[orgSlug]/layout.tsx` — pass `catalogLabel`.
- Modify: `lib/utils.ts` — `formatMoney`.
- Create: `lib/ops/readiness.ts` — pure readiness math (countdown, % complete, overdue).
- Modify: `lib/types.ts` — `ComplianceDoc`.
- Create: `lib/ops/compliance.ts` + `actions/compliance.ts`.
- Modify: `lib/firebase-admin.ts` — export `adminBucket`.
- Create: `actions/ops-evidence.ts` — `uploadEvidencePhoto`.
- Modify: `next.config.ts` — `serverActions.bodySizeLimit: '10mb'`.
- Modify: `actions/invoices.ts` — `generateCloseoutInvoice`.

Tests mirror source: `__tests__/lib/ops/*.test.ts`, `__tests__/actions/*.test.ts`, `__tests__/components/admin/ops/*.test.tsx` (RTL, `vi.mock` the actions modules — see `__tests__/components/AdminSidebar.test.tsx` for the style).

Permissions note (no task needed): `'ops'` is already in `EVENT_PAGES`, and both permission matrices (`components/members/PermissionMatrix.tsx`, `DepartmentPermissionMatrix.tsx`) iterate `EVENT_PAGES` — the ops grant is exposed automatically. Staff have no grant by default (deny-by-default); owners/admins pass automatically.

---

### Task 1: Nav & module wiring

**Files:**
- Modify: `lib/industry-packs.ts`
- Modify: `components/layout/AdminSidebar.tsx`
- Modify: `app/(admin)/[orgSlug]/layout.tsx`
- Test: `__tests__/components/AdminSidebar.test.tsx` (extend), `__tests__/lib/industry-packs.test.ts` (extend if it exists, else create)

**Interfaces:**
- Consumes: `IndustryPack.catalogKind`, `resolveEnabledModules`, existing `AdminSidebar` props.
- Produces: `ModuleId` gains `'compliance'`; `catalogLabel(pack: IndustryPack): string`; `AdminSidebar` gains optional prop `catalogLabel?: string`; org nav renders an "Operations" section with `/packages` + `/compliance` links; event nav renders `Event Ops` → `/{orgSlug}/{eventSlug}/ops`.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/components/AdminSidebar.test.tsx`:

```tsx
describe('Operations nav (phase 3)', () => {
  it('shows catalog + compliance links when modules enabled', () => {
    render(
      <AdminSidebar
        orgSlug="acme"
        enabledModules={['catalog', 'compliance']}
        catalogLabel="Menu Packages"
      />
    )
    expect(screen.getByText('Menu Packages')).toHaveAttribute('href', '/acme/packages')
    expect(screen.getByText('Compliance')).toHaveAttribute('href', '/acme/compliance')
  })

  it('hides the Operations section when neither module is enabled', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads']} />)
    expect(screen.queryByText('Operations')).not.toBeInTheDocument()
  })

  it('falls back to the universal catalog label', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['catalog']} />)
    expect(screen.getByText('Packages')).toHaveAttribute('href', '/acme/packages')
  })

  it('shows Event Ops in the event nav when the ops page is allowed', () => {
    render(<AdminSidebar orgSlug="acme" eventSlug="gala" allowedEventPages={['ops']} />)
    expect(screen.getByText('Event Ops')).toHaveAttribute('href', '/acme/gala/ops')
  })

  it('hides Event Ops when the member lacks the ops grant', () => {
    render(<AdminSidebar orgSlug="acme" eventSlug="gala" allowedEventPages={['itinerary']} />)
    expect(screen.queryByText('Event Ops')).not.toBeInTheDocument()
  })
})
```

Create (or append to) `__tests__/lib/industry-packs.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getIndustryPack, catalogLabel, resolveEnabledModules } from '@/lib/industry-packs'

describe('catalogLabel', () => {
  it('maps catalogKind to a vertical label', () => {
    expect(catalogLabel(getIndustryPack('coffee-cart'))).toBe('Menu Packages')
    expect(catalogLabel(getIndustryPack('florist'))).toBe('Service Packages')
    expect(catalogLabel(getIndustryPack('general'))).toBe('Packages')
  })
})

describe('compliance module', () => {
  it('is enabled for coffee-cart and not for general', () => {
    expect(resolveEnabledModules('coffee-cart')).toContain('compliance')
    expect(resolveEnabledModules('general')).not.toContain('compliance')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/components/AdminSidebar.test.tsx __tests__/lib/industry-packs.test.ts`
Expected: FAIL — `catalogLabel` is not exported; nav links not found.

- [ ] **Step 3: Implement**

`lib/industry-packs.ts` — add `'compliance'` to the `ModuleId` union (in the forward-declared row), add `'compliance'` to the `coffee-cart` pack's `modules` array only, and append:

```ts
/** Vertical-skinned label for the catalog module (spec §4: "no shared noun renders untranslated"). */
export function catalogLabel(pack: IndustryPack): string {
  switch (pack.catalogKind) {
    case 'menu': return 'Menu Packages'
    case 'services': return 'Service Packages'
    case 'rental-stock': return 'Rental Packages'
    default: return 'Packages'
  }
}
```

`components/layout/AdminSidebar.tsx`:

1. Add `catalogLabel?: string` to `AdminSidebarProps` and destructure it.
2. Add `'packages', 'compliance'` to `ORG_PAGE_SLUGS`.
3. In `getEventNav`, insert `{ key: 'ops', label: 'Event Ops' }` immediately after the `dashboard` entry. (`'ops'` is in `EVENT_PAGES`, so the existing `allowedEventPages` filter gates it — no filter changes needed.)
4. After `eventLinks`, build:

```ts
const opsLinks = [
  ...(has('catalog') ? [{ label: catalogLabel ?? 'Packages', slug: 'packages' }] : []),
  ...(has('compliance') ? [{ label: 'Compliance', slug: 'compliance' }] : []),
]
```

5. Render between the Events and Insights sections:

```tsx
{opsLinks.length > 0 && (
  <Section label="Operations">
    {opsLinks.map((l) => (
      <Link key={l.slug} href={`/${orgSlug}/${l.slug}`} className={navClass(`/${orgSlug}/${l.slug}`)}>
        {l.label}
      </Link>
    ))}
  </Section>
)}
```

`app/(admin)/[orgSlug]/layout.tsx` — import `getIndustryPack, catalogLabel` from `@/lib/industry-packs` and pass `catalogLabel={catalogLabel(getIndustryPack(org.industry_pack_id))}` to `<AdminSidebar>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/components/AdminSidebar.test.tsx __tests__/lib/industry-packs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/industry-packs.ts components/layout/AdminSidebar.tsx "app/(admin)/[orgSlug]/layout.tsx" __tests__/components/AdminSidebar.test.tsx __tests__/lib/industry-packs.test.ts
git commit -m "feat(ops): catalog/compliance/ops navigation with pack-skinned labels"
```

---

### Task 2: Shared display helpers — `formatMoney` + readiness math

**Files:**
- Modify: `lib/utils.ts`
- Create: `lib/ops/readiness.ts`
- Test: `__tests__/lib/ops/readiness.test.ts`

**Interfaces:**
- Consumes: `OpsPlan` from `@/lib/types`.
- Produces: `formatMoney(n: number): string` (lib/utils); `computeReadiness(plan: OpsPlan, eventStart: string, today?: Date): Readiness` where `Readiness = { days_until: number; done: number; total: number; pct: number; overdue: number }`. Pure module — client-importable.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/lib/ops/readiness.test.ts
import { describe, it, expect } from 'vitest'
import { computeReadiness } from '@/lib/ops/readiness'
import { formatMoney } from '@/lib/utils'
import type { OpsPlan } from '@/lib/types'

function plan(overrides: Partial<OpsPlan> = {}): OpsPlan {
  return {
    package_ids: ['p1'],
    requirements: { guests: 50 },
    deadlines: [
      { id: 'd1', label: 'Order beans', due: '2026-09-01', done: true },
      { id: 'd2', label: 'Permit check', due: '2026-08-01', done: false },
    ],
    shopping_list: [{ resource_id: 'r1', name: 'Beans', qty: 38, checked: false }],
    packing_list: [{ resource_id: 'r2', name: 'Machine', qty: 1, checked: true }],
    checklists: [{
      id: 'c1', name: 'Prep', phase: 'prep',
      steps: [
        { text: 'a', evidence: 'none', done: true },
        { text: 'b', evidence: 'none', done: false },
      ],
    }],
    needs_review: false,
    change_log: [],
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('computeReadiness', () => {
  const today = new Date('2026-08-10T12:00:00Z')

  it('counts done/total across deadlines, lists, and checklist steps', () => {
    const r = computeReadiness(plan(), '2026-09-10', today)
    expect(r.total).toBe(6)
    expect(r.done).toBe(3)
    expect(r.pct).toBe(50)
  })

  it('flags undone deadlines with a due date before today as overdue', () => {
    const r = computeReadiness(plan(), '2026-09-10', today)
    expect(r.overdue).toBe(1) // d2 due 2026-08-01, not done
  })

  it('computes days until the event start date', () => {
    const r = computeReadiness(plan(), '2026-08-20', today)
    expect(r.days_until).toBe(10)
  })

  it('is 100% when there is nothing to track', () => {
    const r = computeReadiness(plan({ deadlines: [], shopping_list: [], packing_list: [], checklists: [] }), '2026-08-20', today)
    expect(r.pct).toBe(100)
  })
})

describe('formatMoney', () => {
  it('renders dollars with two decimals', () => {
    expect(formatMoney(1234.5)).toBe('$1234.50')
    expect(formatMoney(0.125 * 3)).toBe('$0.38')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/ops/readiness.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Append to `lib/utils.ts`:

```ts
/** Display rounding for all ops money (margins, costs). Storage stays float dollars. */
export function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`
}
```

Create `lib/ops/readiness.ts`:

```ts
// Pure readiness math for the Ops tab header. No Firestore imports — safe in client components.
import type { OpsPlan } from '@/lib/types'

export interface Readiness {
  days_until: number   // whole days until event start; negative = event has passed
  done: number
  total: number
  pct: number          // 0–100, rounded; 100 when nothing is trackable
  overdue: number      // undone deadlines with due < today
}

const MS_PER_DAY = 86_400_000

export function computeReadiness(plan: OpsPlan, eventStart: string, today: Date = new Date()): Readiness {
  const startDay = eventStart.slice(0, 10)
  const todayDay = today.toISOString().slice(0, 10)
  const days_until = Math.round(
    (new Date(`${startDay}T00:00:00Z`).getTime() - new Date(`${todayDay}T00:00:00Z`).getTime()) / MS_PER_DAY
  )

  const flags = [
    ...plan.deadlines.map((d) => d.done),
    ...plan.shopping_list.map((i) => i.checked),
    ...plan.packing_list.map((i) => i.checked),
    ...plan.checklists.flatMap((c) => c.steps.map((s) => s.done)),
  ]
  const done = flags.filter(Boolean).length
  const total = flags.length

  return {
    days_until,
    done,
    total,
    pct: total === 0 ? 100 : Math.round((done / total) * 100),
    overdue: plan.deadlines.filter((d) => !d.done && d.due < todayDay).length,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/ops/readiness.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/ops/readiness.ts __tests__/lib/ops/readiness.test.ts
git commit -m "feat(ops): formatMoney display helper and pure readiness math"
```

---

### Task 3: Catalog route + `CatalogClient` shell + Resources tab

**Files:**
- Create: `app/(admin)/[orgSlug]/packages/page.tsx`
- Create: `components/admin/ops/CatalogClient.tsx`
- Create: `components/admin/ops/ResourcesTab.tsx`
- Test: `__tests__/components/admin/ops/ResourcesTab.test.tsx`

**Interfaces:**
- Consumes: `requireOrgMember` (lib/auth/guards), `listResources/createResource/updateResource/deleteResource` (actions/resources — `CreateResourceInput`/`ResourceUpdate` types come from `@/lib/ops/resources`), `listWorkPackages` (actions/work-packages), `getTemplatesForOrg` + `listChecklistTemplatesCore` (lib/ops/checklist-templates — server page only), `catalogLabel`/`getIndustryPack` (Task 1), `formatMoney` (Task 2).
- Produces: `CatalogClient({ orgId, isAdmin, title, resources, packages, templates, ownTemplateIds }: { orgId: string; isAdmin: boolean; title: string; resources: OpsResource[]; packages: WorkPackage[]; templates: ChecklistTemplate[]; ownTemplateIds: string[] })`; `ResourcesTab({ orgId, isAdmin, resources, packages }: { orgId: string; isAdmin: boolean; resources: OpsResource[]; packages: WorkPackage[] })`. Tasks 4–5 plug `PackagesTab` / `ChecklistTemplatesTab` into the shell.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/admin/ops/ResourcesTab.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/resources', () => ({
  createResource: vi.fn().mockResolvedValue({
    id: 'r-new', name: 'Oat milk', kind: 'consumable', unit: 'oz', unit_cost: 0.05,
    created_at: '2026-08-05T00:00:00.000Z',
  }),
  updateResource: vi.fn().mockResolvedValue(undefined),
  deleteResource: vi.fn().mockResolvedValue(undefined),
}))

import { createResource, deleteResource } from '@/actions/resources'
import { ResourcesTab } from '@/components/admin/ops/ResourcesTab'
import type { OpsResource, WorkPackage } from '@/lib/types'

const beans: OpsResource = {
  id: 'r1', name: 'Espresso beans', kind: 'consumable', unit: 'oz', unit_cost: 0.55,
  created_at: '2026-08-01T00:00:00.000Z',
}
const machine: OpsResource = {
  id: 'r2', name: 'Espresso Machine 02', kind: 'serialized',
  created_at: '2026-08-01T00:00:00.000Z',
}
const pkg: WorkPackage = {
  id: 'p1', name: 'Espresso Bar', price: 900,
  lines: [{ kind: 'consumable', resource_id: 'r1', qty_per_guest: 0.75 }],
  created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('ResourcesTab', () => {
  it('lists resources with kind, unit and cost', () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[beans, machine]} packages={[pkg]} />)
    expect(screen.getByText('Espresso beans')).toBeInTheDocument()
    expect(screen.getByText('$0.55')).toBeInTheDocument()
    expect(screen.getByText('serialized')).toBeInTheDocument()
  })

  it('creates a resource from the add form', async () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[]} packages={[]} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Oat milk' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'oz' } })
    fireEvent.change(screen.getByLabelText('Unit cost ($)'), { target: { value: '0.05' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add resource' }))
    await waitFor(() => expect(createResource).toHaveBeenCalledWith('o1', {
      name: 'Oat milk', kind: 'consumable', unit: 'oz', unit_cost: 0.05,
    }))
    expect(await screen.findByText('Oat milk')).toBeInTheDocument()
  })

  it('blocks deleting a resource referenced by a package', () => {
    render(<ResourcesTab orgId="o1" isAdmin resources={[beans]} packages={[pkg]} />)
    const btn = screen.getByRole('button', { name: 'Delete Espresso beans' })
    expect(btn).toBeDisabled()
    expect(deleteResource).not.toHaveBeenCalled()
  })

  it('hides write controls for non-admins', () => {
    render(<ResourcesTab orgId="o1" isAdmin={false} resources={[beans]} packages={[]} />)
    expect(screen.queryByRole('button', { name: 'Add resource' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/admin/ops/ResourcesTab.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the page, shell, and tab**

`app/(admin)/[orgSlug]/packages/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { requireOrgMember } from '@/lib/auth/guards'
import { listResources } from '@/actions/resources'
import { listWorkPackages } from '@/actions/work-packages'
import { getTemplatesForOrg, listChecklistTemplatesCore } from '@/lib/ops/checklist-templates'
import { getIndustryPack, catalogLabel } from '@/lib/industry-packs'
import { CatalogClient } from '@/components/admin/ops/CatalogClient'

export default async function PackagesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, orgId, member } = await requireOrgMember(orgSlug)
  const [resources, packages, templates, own] = await Promise.all([
    listResources(orgId),
    listWorkPackages(orgId),
    getTemplatesForOrg(orgId, org.industry_pack_id),
    listChecklistTemplatesCore(orgId),
  ])
  return (
    <CatalogClient
      orgId={orgId}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
      title={catalogLabel(getIndustryPack(org.industry_pack_id))}
      resources={resources}
      packages={packages}
      templates={templates}
      ownTemplateIds={own.map((t) => t.id)}
    />
  )
}
```

(`getTemplatesForOrg`/`listChecklistTemplatesCore` are guard-free cores — safe here because `requireOrgMember` already gated the page; precedent: `event-types/page.tsx` hits `adminDb` directly.)

`components/admin/ops/CatalogClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { ResourcesTab } from '@/components/admin/ops/ResourcesTab'
import { PackagesTab } from '@/components/admin/ops/PackagesTab'
import { ChecklistTemplatesTab } from '@/components/admin/ops/ChecklistTemplatesTab'
import type { OpsResource, WorkPackage, ChecklistTemplate } from '@/lib/types'

type Tab = 'packages' | 'resources' | 'checklists'

interface CatalogClientProps {
  orgId: string
  isAdmin: boolean
  title: string
  resources: OpsResource[]
  packages: WorkPackage[]
  templates: ChecklistTemplate[]
  ownTemplateIds: string[]
}

export function CatalogClient({ orgId, isAdmin, title, resources, packages, templates, ownTemplateIds }: CatalogClientProps) {
  const [tab, setTab] = useState<Tab>('packages')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'packages', label: title },
    { id: 'resources', label: 'Ingredients & Equipment' },
    { id: 'checklists', label: 'Checklists' },
  ]
  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <div className="flex gap-1 border-b mb-6" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'packages' && (
        <PackagesTab orgId={orgId} isAdmin={isAdmin} packages={packages} resources={resources} templates={templates} />
      )}
      {tab === 'resources' && (
        <ResourcesTab orgId={orgId} isAdmin={isAdmin} resources={resources} packages={packages} />
      )}
      {tab === 'checklists' && (
        <ChecklistTemplatesTab orgId={orgId} isAdmin={isAdmin} templates={templates} ownTemplateIds={ownTemplateIds} />
      )}
    </div>
  )
}
```

Until Tasks 4–5 land, create placeholder `PackagesTab.tsx` / `ChecklistTemplatesTab.tsx` files exporting the real prop signatures with a `<p>` body (`Coming in this plan's Task 4/5`) so this task builds — Tasks 4–5 replace the bodies.

`components/admin/ops/ResourcesTab.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createResource, updateResource, deleteResource } from '@/actions/resources'
import { formatMoney } from '@/lib/utils'
import type { OpsResource, WorkPackage, ResourceKind } from '@/lib/types'

interface ResourcesTabProps {
  orgId: string
  isAdmin: boolean
  resources: OpsResource[]
  packages: WorkPackage[]
}

const KINDS: ResourceKind[] = ['consumable', 'reusable', 'serialized']

export function ResourcesTab({ orgId, isAdmin, resources: initial, packages }: ResourcesTabProps) {
  const [resources, setResources] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ResourceKind>('consumable')
  const [unit, setUnit] = useState('')
  const [unitCost, setUnitCost] = useState('')

  // A resource referenced by any package line must not be deletable (handoff:
  // deleting in-use catalog entries breaks re-derive and closeout).
  const inUse = new Set(
    packages.flatMap((p) => p.lines.flatMap((l) => (l.kind === 'labor' ? [] : [l.resource_id])))
  )

  async function handleAdd() {
    if (!name.trim()) return
    setSaving(true); setError(null)
    try {
      const created = await createResource(orgId, {
        name: name.trim(),
        kind,
        ...(unit.trim() ? { unit: unit.trim() } : {}),
        ...(unitCost !== '' ? { unit_cost: Number(unitCost) } : {}),
      })
      setResources((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setName(''); setUnit(''); setUnitCost('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  async function handleCostChange(r: OpsResource, value: string) {
    const unit_cost = value === '' ? null : Number(value)
    try {
      await updateResource(orgId, r.id, { unit_cost })
      setResources((prev) => prev.map((x) => (x.id === r.id ? { ...x, unit_cost: unit_cost ?? undefined } : x)))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  async function handleDelete(r: OpsResource) {
    if (!confirm(`Delete ${r.name}?`)) return
    setSaving(true); setError(null)
    try {
      await deleteResource(orgId, r.id)
      setResources((prev) => prev.filter((x) => x.id !== r.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2">Name</th><th>Kind</th><th>Unit</th><th>Unit cost</th><th />
          </tr>
        </thead>
        <tbody>
          {resources.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="py-2 font-medium">{r.name}</td>
              <td><Badge variant="secondary">{r.kind}</Badge></td>
              <td>{r.unit ?? '—'}</td>
              <td>
                {isAdmin ? (
                  <Input
                    aria-label={`Unit cost for ${r.name}`}
                    type="number" step="0.01" className="w-24"
                    defaultValue={r.unit_cost ?? ''}
                    onBlur={(e) => handleCostChange(r, e.target.value)}
                  />
                ) : r.unit_cost !== undefined ? formatMoney(r.unit_cost) : '—'}
                {!isAdmin ? null : r.unit_cost !== undefined && <span className="sr-only">{formatMoney(r.unit_cost)}</span>}
              </td>
              <td className="text-right">
                {isAdmin && (
                  <Button
                    variant="ghost" size="sm"
                    aria-label={`Delete ${r.name}`}
                    disabled={saving || inUse.has(r.id)}
                    title={inUse.has(r.id) ? 'In use by a package — remove it from the package first' : undefined}
                    onClick={() => handleDelete(r)}
                  >
                    Delete
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {resources.length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-gray-500">No resources yet. Add beans, milk, cups, machines…</td></tr>
          )}
        </tbody>
      </table>

      {isAdmin && (
        <div className="flex items-end gap-3 flex-wrap border-t pt-4">
          <div>
            <Label htmlFor="res-name">Name</Label>
            <Input id="res-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="res-kind">Kind</Label>
            <select
              id="res-kind" value={kind}
              onChange={(e) => setKind(e.target.value as ResourceKind)}
              className="block h-9 rounded-md border border-gray-300 px-2 text-sm"
            >
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="res-unit">Unit</Label>
            <Input id="res-unit" placeholder="oz, each, gal" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="res-cost">Unit cost ($)</Label>
            <Input id="res-cost" type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </div>
          <Button onClick={handleAdd} disabled={saving || !name.trim()}>Add resource</Button>
        </div>
      )}
    </div>
  )
}
```

Note for the test expecting `$0.55`: render read-only cost (`formatMoney`) when `isAdmin` is false OR alongside the input — the test renders `isAdmin` and asserts the text; keep a visible `<span>{formatMoney(r.unit_cost)}</span>` next to the input instead of the `sr-only` hack if the assertion needs it. Match the test, not the sketch.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/admin/ops/ResourcesTab.test.tsx`
Expected: PASS

- [ ] **Step 5: Build and commit**

Run: `npm run build` — expected clean (new route compiles).

```bash
git add "app/(admin)/[orgSlug]/packages" components/admin/ops __tests__/components/admin/ops/ResourcesTab.test.tsx
git commit -m "feat(ops): catalog route with tab shell and resources tab"
```

---

### Task 4: Packages tab (package builder)

**Files:**
- Modify: `components/admin/ops/PackagesTab.tsx` (replace Task 3 placeholder)
- Test: `__tests__/components/admin/ops/PackagesTab.test.tsx`

**Interfaces:**
- Consumes: `listWorkPackages/createWorkPackage/updateWorkPackage/deleteWorkPackage` (actions/work-packages; input types `CreateWorkPackageInput`/`WorkPackageUpdate` from `@/lib/ops/work-packages`), `WorkPackageLine` union from `@/lib/types`, `formatMoney`.
- Produces: `PackagesTab({ orgId, isAdmin, packages, resources, templates }: { orgId: string; isAdmin: boolean; packages: WorkPackage[]; resources: OpsResource[]; templates: ChecklistTemplate[] })`.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/admin/ops/PackagesTab.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/work-packages', () => ({
  createWorkPackage: vi.fn().mockImplementation(async (_orgId: string, input: object) => ({
    id: 'p-new', created_at: '2026-08-05T00:00:00.000Z', ...input,
  })),
  updateWorkPackage: vi.fn().mockResolvedValue(undefined),
  deleteWorkPackage: vi.fn().mockResolvedValue(undefined),
}))

import { createWorkPackage, deleteWorkPackage } from '@/actions/work-packages'
import { PackagesTab } from '@/components/admin/ops/PackagesTab'
import type { OpsResource, WorkPackage, ChecklistTemplate } from '@/lib/types'

const beans: OpsResource = {
  id: 'r1', name: 'Espresso beans', kind: 'consumable', unit: 'oz', unit_cost: 0.55,
  created_at: '2026-08-01T00:00:00.000Z',
}
const machine: OpsResource = {
  id: 'r2', name: 'Espresso Machine 02', kind: 'serialized',
  created_at: '2026-08-01T00:00:00.000Z',
}
const prepTemplate: ChecklistTemplate = {
  id: 'bi-cc-prep', name: 'Prep', phase: 'prep',
  steps: [{ text: 'Dial in grinder', evidence: 'none' }],
  created_at: '2026-08-01T00:00:00.000Z',
}
const espressoBar: WorkPackage = {
  id: 'p1', name: 'Espresso Bar', price: 900, max_guests: 100,
  lines: [
    { kind: 'consumable', resource_id: 'r1', qty_per_guest: 0.75 },
    { kind: 'equipment', resource_id: 'r2', qty: 1 },
    { kind: 'labor', role: 'barista', count: 2 },
  ],
  created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('PackagesTab', () => {
  it('lists packages with price and line summary', () => {
    render(<PackagesTab orgId="o1" isAdmin packages={[espressoBar]} resources={[beans, machine]} templates={[prepTemplate]} />)
    expect(screen.getByText('Espresso Bar')).toBeInTheDocument()
    expect(screen.getByText('$900.00')).toBeInTheDocument()
    expect(screen.getByText(/0\.75 oz × guests/)).toBeInTheDocument()
    expect(screen.getByText(/barista × 2/)).toBeInTheDocument()
  })

  it('creates a package with a consumable line and an attached checklist', async () => {
    render(<PackagesTab orgId="o1" isAdmin packages={[]} resources={[beans, machine]} templates={[prepTemplate]} />)
    fireEvent.click(screen.getByRole('button', { name: 'New package' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Cold Brew Cart' } })
    fireEvent.change(screen.getByLabelText('Price ($)'), { target: { value: '600' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add consumable' }))
    fireEvent.change(screen.getByLabelText('Consumable 1 resource'), { target: { value: 'r1' } })
    fireEvent.change(screen.getByLabelText('Consumable 1 qty per guest'), { target: { value: '0.5' } })
    fireEvent.click(screen.getByLabelText('Attach Prep'))
    fireEvent.click(screen.getByRole('button', { name: 'Save package' }))
    await waitFor(() => expect(createWorkPackage).toHaveBeenCalledWith('o1', {
      name: 'Cold Brew Cart',
      price: 600,
      lines: [{ kind: 'consumable', resource_id: 'r1', qty_per_guest: 0.5 }],
      checklist_template_ids: ['bi-cc-prep'],
    }))
  })

  it('warns before deleting a package', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<PackagesTab orgId="o1" isAdmin packages={[espressoBar]} resources={[beans, machine]} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Espresso Bar' }))
    expect(confirmSpy.mock.calls[0][0]).toMatch(/events already set up with it will fail/i)
    expect(deleteWorkPackage).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('hides write controls for non-admins', () => {
    render(<PackagesTab orgId="o1" isAdmin={false} packages={[espressoBar]} resources={[]} templates={[]} />)
    expect(screen.queryByRole('button', { name: 'New package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Espresso Bar' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/admin/ops/PackagesTab.test.tsx`
Expected: FAIL — placeholder has no behavior.

- [ ] **Step 3: Implement `PackagesTab`**

Replace the placeholder. Structure (full file):

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createWorkPackage, updateWorkPackage, deleteWorkPackage } from '@/actions/work-packages'
import { formatMoney } from '@/lib/utils'
import type { OpsResource, WorkPackage, WorkPackageLine, ChecklistTemplate } from '@/lib/types'

interface PackagesTabProps {
  orgId: string
  isAdmin: boolean
  packages: WorkPackage[]
  resources: OpsResource[]
  templates: ChecklistTemplate[]
}

interface Draft {
  id?: string            // set when editing an existing package
  name: string
  description: string
  scope: string
  price: string
  max_guests: string
  setup_minutes: string
  teardown_minutes: string
  lines: WorkPackageLine[]
  checklist_template_ids: string[]
}

const EMPTY_DRAFT: Draft = {
  name: '', description: '', scope: '', price: '', max_guests: '',
  setup_minutes: '', teardown_minutes: '', lines: [], checklist_template_ids: [],
}

function lineSummary(line: WorkPackageLine, resourceById: Map<string, OpsResource>): string {
  if (line.kind === 'labor') return `${line.role} × ${line.count}`
  const r = resourceById.get(line.resource_id)
  const name = r?.name ?? line.resource_id
  if (line.kind === 'consumable') {
    const unit = r?.unit ? `${r.unit} ` : ''
    const base = line.base_qty ? ` + ${line.base_qty} base` : ''
    return `${name}: ${line.qty_per_guest} ${unit}× guests${base}`
  }
  return `${name} × ${line.qty}`
}

export function PackagesTab({ orgId, isAdmin, packages: initial, resources, templates }: PackagesTabProps) {
  const [packages, setPackages] = useState(initial)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resourceById = new Map(resources.map((r) => [r.id, r]))
  const consumables = resources.filter((r) => r.kind === 'consumable')
  const equipment = resources.filter((r) => r.kind !== 'consumable')

  function setLine(i: number, line: WorkPackageLine) {
    setDraft((d) => d && { ...d, lines: d.lines.map((l, idx) => (idx === i ? line : l)) })
  }

  function toInput(d: Draft) {
    return {
      name: d.name.trim(),
      price: Number(d.price || 0),
      lines: d.lines,
      ...(d.description.trim() ? { description: d.description.trim() } : {}),
      ...(d.scope.trim() ? { scope: d.scope.trim() } : {}),
      ...(d.max_guests !== '' ? { max_guests: Number(d.max_guests) } : {}),
      ...(d.setup_minutes !== '' ? { setup_minutes: Number(d.setup_minutes) } : {}),
      ...(d.teardown_minutes !== '' ? { teardown_minutes: Number(d.teardown_minutes) } : {}),
      ...(d.checklist_template_ids.length > 0 ? { checklist_template_ids: d.checklist_template_ids } : {}),
    }
  }

  async function handleSave() {
    if (!draft || !draft.name.trim()) return
    setSaving(true); setError(null)
    try {
      if (draft.id) {
        await updateWorkPackage(orgId, draft.id, toInput(draft))
        setPackages((prev) => prev.map((p) => (p.id === draft.id ? { ...p, ...toInput(draft) } : p)))
      } else {
        const created = await createWorkPackage(orgId, toInput(draft))
        setPackages((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setDraft(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: WorkPackage) {
    // The catalog has no reverse index of ops plans, so deletion cannot be
    // hard-blocked when in use (handoff known gap). Warn loudly instead:
    // re-derive and closeout throw 'Package no longer exists' after this.
    if (!confirm(
      `Delete "${p.name}"?\n\nAny events already set up with it will fail to re-derive lists or compute closeout ("Package no longer exists"). Only delete packages no upcoming event uses.`
    )) return
    setSaving(true); setError(null)
    try {
      await deleteWorkPackage(orgId, p.id)
      setPackages((prev) => prev.filter((x) => x.id !== p.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  function edit(p: WorkPackage) {
    setDraft({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      scope: p.scope ?? '',
      price: String(p.price),
      max_guests: p.max_guests !== undefined ? String(p.max_guests) : '',
      setup_minutes: p.setup_minutes !== undefined ? String(p.setup_minutes) : '',
      teardown_minutes: p.teardown_minutes !== undefined ? String(p.teardown_minutes) : '',
      lines: p.lines,
      checklist_template_ids: p.checklist_template_ids ?? [],
    })
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {packages.map((p) => (
        <Card key={p.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{p.name}</CardTitle>
            <div className="flex items-center gap-3">
              <span className="font-semibold">{formatMoney(p.price)}</span>
              {p.max_guests !== undefined && <span className="text-sm text-gray-500">up to {p.max_guests} guests</span>}
              {isAdmin && (
                <>
                  <Button variant="outline" size="sm" onClick={() => edit(p)}>Edit</Button>
                  <Button variant="ghost" size="sm" aria-label={`Delete ${p.name}`} disabled={saving} onClick={() => handleDelete(p)}>
                    Delete
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {p.description && <p className="text-sm text-gray-600 mb-2">{p.description}</p>}
            <ul className="text-sm text-gray-700 list-disc pl-5">
              {p.lines.map((l, i) => <li key={i}>{lineSummary(l, resourceById)}{l.kind === 'labor' && ' (staffing later — recorded only)'}</li>)}
            </ul>
            {(p.checklist_template_ids?.length ?? 0) > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Checklists: {p.checklist_template_ids!.map((id) => templates.find((t) => t.id === id)?.name ?? id).join(', ')}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
      {packages.length === 0 && !draft && (
        <p className="py-6 text-center text-gray-500">No packages yet. Build your first offering — e.g. “Espresso Bar — up to 100 guests”.</p>
      )}

      {isAdmin && !draft && (
        <Button onClick={() => setDraft(EMPTY_DRAFT)}>New package</Button>
      )}

      {isAdmin && draft && (
        <Card>
          <CardHeader><CardTitle className="text-base">{draft.id ? 'Edit package' : 'New package'}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pkg-name">Name</Label>
                <Input id="pkg-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pkg-price">Price ($)</Label>
                <Input id="pkg-price" type="number" step="0.01" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pkg-guests">Max guests</Label>
                <Input id="pkg-guests" type="number" value={draft.max_guests} onChange={(e) => setDraft({ ...draft, max_guests: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pkg-desc">Description</Label>
                <Input id="pkg-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pkg-scope">Customer-facing scope</Label>
                <Input id="pkg-scope" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })} />
              </div>
              <div className="flex gap-3">
                <div>
                  <Label htmlFor="pkg-setup">Setup (min)</Label>
                  <Input id="pkg-setup" type="number" value={draft.setup_minutes} onChange={(e) => setDraft({ ...draft, setup_minutes: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pkg-teardown">Teardown (min)</Label>
                  <Input id="pkg-teardown" type="number" value={draft.teardown_minutes} onChange={(e) => setDraft({ ...draft, teardown_minutes: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Lines</p>
              {draft.lines.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  {line.kind === 'consumable' && (
                    <>
                      <select
                        aria-label={`Consumable ${i + 1} resource`}
                        value={line.resource_id}
                        onChange={(e) => setLine(i, { ...line, resource_id: e.target.value })}
                        className="h-9 rounded-md border border-gray-300 px-2 text-sm"
                      >
                        <option value="">Pick a consumable…</option>
                        {consumables.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <Input
                        aria-label={`Consumable ${i + 1} qty per guest`}
                        type="number" step="0.01" className="w-24" placeholder="per guest"
                        value={line.qty_per_guest || ''}
                        onChange={(e) => setLine(i, { ...line, qty_per_guest: Number(e.target.value) })}
                      />
                      <span className="text-sm text-gray-500">× guests</span>
                      <Input
                        aria-label={`Consumable ${i + 1} base qty`}
                        type="number" step="0.01" className="w-20" placeholder="base"
                        value={line.base_qty ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          const { base_qty: _drop, ...rest } = line
                          setLine(i, v === '' ? rest : { ...rest, base_qty: Number(v) })
                        }}
                      />
                    </>
                  )}
                  {line.kind === 'equipment' && (
                    <>
                      <select
                        aria-label={`Equipment ${i + 1} resource`}
                        value={line.resource_id}
                        onChange={(e) => setLine(i, { ...line, resource_id: e.target.value })}
                        className="h-9 rounded-md border border-gray-300 px-2 text-sm"
                      >
                        <option value="">Pick equipment…</option>
                        {equipment.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <Input
                        aria-label={`Equipment ${i + 1} qty`}
                        type="number" className="w-20"
                        value={line.qty || ''}
                        onChange={(e) => setLine(i, { ...line, qty: Number(e.target.value) })}
                      />
                    </>
                  )}
                  {line.kind === 'labor' && (
                    <>
                      <Input
                        aria-label={`Labor ${i + 1} role`}
                        placeholder="barista" className="w-40"
                        value={line.role}
                        onChange={(e) => setLine(i, { ...line, role: e.target.value })}
                      />
                      <Input
                        aria-label={`Labor ${i + 1} count`}
                        type="number" className="w-20"
                        value={line.count || ''}
                        onChange={(e) => setLine(i, { ...line, count: Number(e.target.value) })}
                      />
                      <span className="text-xs text-gray-500">recorded only — staffing is a later phase</span>
                    </>
                  )}
                  <Button variant="ghost" size="sm" aria-label={`Remove line ${i + 1}`}
                    onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, idx) => idx !== i) })}>
                    ✕
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" size="sm"
                  onClick={() => setDraft({ ...draft, lines: [...draft.lines, { kind: 'consumable', resource_id: '', qty_per_guest: 0 }] })}>
                  Add consumable
                </Button>
                <Button variant="outline" size="sm"
                  onClick={() => setDraft({ ...draft, lines: [...draft.lines, { kind: 'equipment', resource_id: '', qty: 1 }] })}>
                  Add equipment
                </Button>
                <Button variant="outline" size="sm"
                  onClick={() => setDraft({ ...draft, lines: [...draft.lines, { kind: 'labor', role: '', count: 1 }] })}>
                  Add labor
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Attached checklists</p>
              <p className="text-xs text-gray-500">None selected = every template for your industry runs on events with this package.</p>
              {templates.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Attach ${t.name}`}
                    checked={draft.checklist_template_ids.includes(t.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        checklist_template_ids: e.target.checked
                          ? [...draft.checklist_template_ids, t.id]
                          : draft.checklist_template_ids.filter((id) => id !== t.id),
                      })
                    }
                  />
                  {t.name} <span className="text-gray-400">({t.phase})</span>
                </label>
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving || !draft.name.trim()}>Save package</Button>
              <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/admin/ops/PackagesTab.test.tsx`
Expected: PASS. If the line-summary assertions fail on exact text, fix the component copy (test is the contract).

- [ ] **Step 5: Commit**

```bash
git add components/admin/ops/PackagesTab.tsx __tests__/components/admin/ops/PackagesTab.test.tsx
git commit -m "feat(ops): package builder tab with line editor and checklist attach"
```

---

### Task 5: Checklist templates tab

**Files:**
- Modify: `components/admin/ops/ChecklistTemplatesTab.tsx` (replace Task 3 placeholder)
- Test: `__tests__/components/admin/ops/ChecklistTemplatesTab.test.tsx`

**Interfaces:**
- Consumes: `createChecklistTemplate/deleteChecklistTemplate` (actions/work-packages; `CreateChecklistTemplateInput` type from `@/lib/ops/checklist-templates` — type-only import is fine, the module never reaches the client bundle's runtime… it DOES import adminDb, so import the type with `import type { … }` which erases at compile time).
- Produces: `ChecklistTemplatesTab({ orgId, isAdmin, templates, ownTemplateIds }: { orgId: string; isAdmin: boolean; templates: ChecklistTemplate[]; ownTemplateIds: string[] })`.
- Scope decision: org templates are ADDITIVE ONLY. `createChecklistTemplateCore` auto-generates ids, so the same-id built-in override path in `getTemplatesForOrg` has no UI yet — built-ins render read-only with a "Built-in" badge; a custom template can be created and deleted. Do not build an override flow.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/admin/ops/ChecklistTemplatesTab.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/work-packages', () => ({
  createChecklistTemplate: vi.fn().mockImplementation(async (_orgId: string, input: object) => ({
    id: 'ct-new', created_at: '2026-08-05T00:00:00.000Z', ...input,
  })),
  deleteChecklistTemplate: vi.fn().mockResolvedValue(undefined),
}))

import { createChecklistTemplate, deleteChecklistTemplate } from '@/actions/work-packages'
import { ChecklistTemplatesTab } from '@/components/admin/ops/ChecklistTemplatesTab'
import type { ChecklistTemplate } from '@/lib/types'

const builtIn: ChecklistTemplate = {
  id: 'bi-cc-prep', name: 'Prep', phase: 'prep',
  steps: [{ text: 'Dial in grinder', evidence: 'none' }],
  created_at: '2026-08-05T00:00:00.000Z',
}
const custom: ChecklistTemplate = {
  id: 'ct-1', name: 'Van check', phase: 'load-out',
  steps: [{ text: 'Fuel', evidence: 'none' }, { text: 'Water tank photo', evidence: 'photo' }],
  created_at: '2026-08-05T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('ChecklistTemplatesTab', () => {
  it('badges built-in vs custom templates', () => {
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[builtIn, custom]} ownTemplateIds={['ct-1']} />)
    expect(screen.getByText('Built-in')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('only offers delete on custom templates', () => {
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[builtIn, custom]} ownTemplateIds={['ct-1']} />)
    expect(screen.queryByRole('button', { name: 'Delete Prep' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Van check' })).toBeInTheDocument()
  })

  it('creates a template with steps and evidence types', async () => {
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[]} ownTemplateIds={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'New checklist' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Generator check' } })
    fireEvent.change(screen.getByLabelText('Phase'), { target: { value: 'setup' } })
    fireEvent.change(screen.getByLabelText('Step 1 text'), { target: { value: 'Record fuel level' } })
    fireEvent.change(screen.getByLabelText('Step 1 evidence'), { target: { value: 'number' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save checklist' }))
    await waitFor(() => expect(createChecklistTemplate).toHaveBeenCalledWith('o1', {
      name: 'Generator check', phase: 'setup',
      steps: [{ text: 'Record fuel level', evidence: 'number' }],
    }))
  })

  it('deletes a custom template after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[custom]} ownTemplateIds={['ct-1']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Van check' }))
    await waitFor(() => expect(deleteChecklistTemplate).toHaveBeenCalledWith('o1', 'ct-1'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/admin/ops/ChecklistTemplatesTab.test.tsx`
Expected: FAIL — placeholder has no behavior.

- [ ] **Step 3: Implement `ChecklistTemplatesTab`**

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createChecklistTemplate, deleteChecklistTemplate } from '@/actions/work-packages'
import type { ChecklistTemplate, ChecklistPhase, ChecklistTemplateStep, EvidenceType } from '@/lib/types'

interface ChecklistTemplatesTabProps {
  orgId: string
  isAdmin: boolean
  templates: ChecklistTemplate[]
  ownTemplateIds: string[]
}

const PHASES: ChecklistPhase[] = ['prep', 'load-out', 'setup', 'service-close', 'closeout']
const EVIDENCE: EvidenceType[] = ['none', 'photo', 'number']

export function ChecklistTemplatesTab({ orgId, isAdmin, templates: initial, ownTemplateIds: initialOwn }: ChecklistTemplatesTabProps) {
  const [templates, setTemplates] = useState(initial)
  const [ownIds, setOwnIds] = useState(new Set(initialOwn))
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<ChecklistPhase>('prep')
  const [steps, setSteps] = useState<ChecklistTemplateStep[]>([{ text: '', evidence: 'none' }])

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      const created = await createChecklistTemplate(orgId, {
        name: name.trim(), phase,
        steps: steps.filter((s) => s.text.trim()).map((s) => ({ text: s.text.trim(), evidence: s.evidence })),
      })
      setTemplates((prev) => [...prev, created])
      setOwnIds((prev) => new Set([...prev, created.id]))
      setCreating(false); setName(''); setPhase('prep'); setSteps([{ text: '', evidence: 'none' }])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(t: ChecklistTemplate) {
    if (!confirm(`Delete "${t.name}"? Packages that attach it will simply stop including it on new events.`)) return
    setSaving(true); setError(null)
    try {
      await deleteChecklistTemplate(orgId, t.id)
      setTemplates((prev) => prev.filter((x) => x.id !== t.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {PHASES.map((ph) => {
        const inPhase = templates.filter((t) => t.phase === ph)
        if (inPhase.length === 0) return null
        return (
          <div key={ph}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{ph}</h3>
            {inPhase.map((t) => (
              <Card key={t.id} className="mb-2">
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <CardTitle className="text-sm">{t.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{ownIds.has(t.id) ? 'Custom' : 'Built-in'}</Badge>
                    {isAdmin && ownIds.has(t.id) && (
                      <Button variant="ghost" size="sm" aria-label={`Delete ${t.name}`} disabled={saving} onClick={() => handleDelete(t)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="py-0 pb-3">
                  <ol className="text-sm text-gray-700 list-decimal pl-5">
                    {t.steps.map((s, i) => (
                      <li key={i}>{s.text}{s.evidence !== 'none' && <span className="text-xs text-gray-400"> — {s.evidence} evidence</span>}</li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      })}
      {templates.length === 0 && !creating && (
        <p className="py-6 text-center text-gray-500">No checklists yet.</p>
      )}

      {isAdmin && !creating && <Button onClick={() => setCreating(true)}>New checklist</Button>}

      {isAdmin && creating && (
        <Card>
          <CardHeader><CardTitle className="text-base">New checklist</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3">
              <div>
                <Label htmlFor="ct-name">Name</Label>
                <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ct-phase">Phase</Label>
                <select id="ct-phase" value={phase} onChange={(e) => setPhase(e.target.value as ChecklistPhase)}
                  className="block h-9 rounded-md border border-gray-300 px-2 text-sm">
                  {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  aria-label={`Step ${i + 1} text`} className="flex-1"
                  value={s.text}
                  onChange={(e) => setSteps((prev) => prev.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)))}
                />
                <select
                  aria-label={`Step ${i + 1} evidence`} value={s.evidence}
                  onChange={(e) => setSteps((prev) => prev.map((x, idx) => (idx === i ? { ...x, evidence: e.target.value as EvidenceType } : x)))}
                  className="h-9 rounded-md border border-gray-300 px-2 text-sm"
                >
                  {EVIDENCE.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                </select>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSteps((prev) => [...prev, { text: '', evidence: 'none' }])}>
                Add step
              </Button>
              <Button onClick={handleSave} disabled={saving || !name.trim() || !steps.some((s) => s.text.trim())}>Save checklist</Button>
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/admin/ops/ChecklistTemplatesTab.test.tsx`
Expected: PASS

- [ ] **Step 5: Build and commit**

Run: `npm run build` — the `import type { CreateChecklistTemplateInput }` erasure claim must be verified here; if the build complains about `lib/ops/checklist-templates` in a client bundle, declare the input inline in the component instead.

```bash
git add components/admin/ops/ChecklistTemplatesTab.tsx __tests__/components/admin/ops/ChecklistTemplatesTab.test.tsx
git commit -m "feat(ops): checklist templates tab (built-ins read-only, custom additive)"
```

---

### Task 6: Ops route + `OpsPlanClient` shell + instantiate wizard

**Files:**
- Create: `app/(admin)/[orgSlug]/[eventSlug]/ops/page.tsx`
- Create: `components/admin/ops/OpsPlanClient.tsx`
- Create: `components/admin/ops/OpsSetup.tsx`
- Test: `__tests__/components/admin/ops/OpsSetup.test.tsx`

**Interfaces:**
- Consumes: `requireEventPage(orgSlug, eventSlug, 'ops')`; `getOpsPlan`, `instantiateOpsPlan`, `listIssues` (actions/event-ops); `listWorkPackages` (actions/work-packages); `adminDb` (org doc for `industry_pack_id`); compliance warnings arrive in Task 12 (prop defaults to `[]` until then).
- Produces:
  - `OpsPlanClient(props: OpsPlanClientProps)` with
    ```ts
    interface OpsPlanClientProps {
      orgId: string; eventId: string; orgSlug: string; eventSlug: string
      isAdmin: boolean
      plan: OpsPlan | null
      issues: OpsIssue[]
      packages: WorkPackage[]              // full org catalog (names for the wizard + requirements card)
      eventName: string
      eventStart: string                    // ISO
      eventHeadcount?: number               // Event.headcount — pre-fills the wizard's guest count
      industryPackId?: string
      complianceWarnings: { name: string; expires_on: string }[]
    }
    ```
    It holds `const [plan, setPlan] = useState(initialPlan)` and passes `plan` + `onPlanChange(next: OpsPlan)` down — children NEVER hold their own copy of plan slices (avoids stale-props-in-useState).
  - `OpsSetup({ orgId, eventId, packages, eventStart, industryPackId, defaultGuests, onCreated }: { orgId: string; eventId: string; packages: WorkPackage[]; eventStart: string; industryPackId?: string; defaultGuests?: number; onCreated: (plan: OpsPlan) => void })`
- Tasks 7–10 fill in the cards; this task renders the shell with plan-or-setup switching plus placeholder card files (same convention as Task 3: real signatures, stub bodies).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/admin/ops/OpsSetup.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/event-ops', () => ({
  instantiateOpsPlan: vi.fn().mockResolvedValue({ package_ids: ['p1'], needs_review: false }),
}))

import { instantiateOpsPlan } from '@/actions/event-ops'
import { OpsSetup } from '@/components/admin/ops/OpsSetup'
import type { WorkPackage } from '@/lib/types'

const pkg: WorkPackage = {
  id: 'p1', name: 'Espresso Bar', price: 900, lines: [],
  created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('OpsSetup', () => {
  it('instantiates with selected packages, guests, and site needs', async () => {
    const onCreated = vi.fn()
    render(
      <OpsSetup orgId="o1" eventId="e1" packages={[pkg]} eventStart="2026-09-10T00:00:00.000Z"
        industryPackId="coffee-cart" defaultGuests={80} onCreated={onCreated} />
    )
    fireEvent.click(screen.getByLabelText('Espresso Bar'))
    fireEvent.click(screen.getByLabelText('power'))
    fireEvent.click(screen.getByRole('button', { name: 'Set up ops plan' }))
    await waitFor(() => expect(instantiateOpsPlan).toHaveBeenCalledWith('o1', 'e1', {
      package_ids: ['p1'],
      requirements: { guests: 80, site_needs: ['power'] },
      event_start: '2026-09-10T00:00:00.000Z',
      industry_pack_id: 'coffee-cart',
    }))
    expect(onCreated).toHaveBeenCalled()
  })

  it('requires at least one package and a positive guest count', () => {
    render(<OpsSetup orgId="o1" eventId="e1" packages={[pkg]} eventStart="2026-09-10" onCreated={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Set up ops plan' })).toBeDisabled()
  })

  it('surfaces the already-exists error actionably', async () => {
    vi.mocked(instantiateOpsPlan).mockRejectedValueOnce(new Error('Ops plan already exists for this event'))
    render(<OpsSetup orgId="o1" eventId="e1" packages={[pkg]} eventStart="2026-09-10" defaultGuests={10} onCreated={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Espresso Bar'))
    fireEvent.click(screen.getByRole('button', { name: 'Set up ops plan' }))
    expect(await screen.findByText(/already exists.*reload/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/admin/ops/OpsSetup.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement page, shell, and wizard**

`app/(admin)/[orgSlug]/[eventSlug]/ops/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { adminDb } from '@/lib/firebase-admin'
import { getOpsPlan, listIssues } from '@/actions/event-ops'
import { listWorkPackages } from '@/actions/work-packages'
import { OpsPlanClient } from '@/components/admin/ops/OpsPlanClient'
import type { Org } from '@/lib/types'

export default async function OpsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event, member } = await requireEventPage(orgSlug, eventSlug, 'ops')
  const org = (await adminDb.collection('orgs').doc(orgId).get()).data() as Org
  const [plan, issues, packages] = await Promise.all([
    getOpsPlan(orgId, eventId),
    listIssues(orgId, eventId),
    listWorkPackages(orgId),
  ])
  return (
    <OpsPlanClient
      orgId={orgId}
      eventId={eventId}
      orgSlug={orgSlug}
      eventSlug={eventSlug}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
      plan={plan}
      issues={issues}
      packages={packages}
      eventName={event.name}
      eventStart={event.event_start}
      eventHeadcount={event.headcount}
      industryPackId={org.industry_pack_id}
      complianceWarnings={[]}
    />
  )
}
```

(`complianceWarnings` is wired for real in Task 12.)

`components/admin/ops/OpsPlanClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { OpsSetup } from '@/components/admin/ops/OpsSetup'
import { ReadinessHeader } from '@/components/admin/ops/ReadinessHeader'
import { RequirementsCard } from '@/components/admin/ops/RequirementsCard'
import { DeadlinesCard } from '@/components/admin/ops/DeadlinesCard'
import { ListsCard } from '@/components/admin/ops/ListsCard'
import { ChecklistsCard } from '@/components/admin/ops/ChecklistsCard'
import { IssuesCard } from '@/components/admin/ops/IssuesCard'
import type { OpsPlan, OpsIssue, WorkPackage } from '@/lib/types'

export interface OpsPlanClientProps {
  orgId: string
  eventId: string
  orgSlug: string
  eventSlug: string
  isAdmin: boolean
  plan: OpsPlan | null
  issues: OpsIssue[]
  packages: WorkPackage[]
  eventName: string
  eventStart: string
  eventHeadcount?: number
  industryPackId?: string
  complianceWarnings: { name: string; expires_on: string }[]
}

export function OpsPlanClient(props: OpsPlanClientProps) {
  const [plan, setPlan] = useState<OpsPlan | null>(props.plan)

  if (!plan) {
    return (
      <div className="p-6 max-w-3xl">
        <h1 className="text-2xl font-bold mb-1">Event Ops — {props.eventName}</h1>
        {props.isAdmin ? (
          <OpsSetup
            orgId={props.orgId}
            eventId={props.eventId}
            packages={props.packages}
            eventStart={props.eventStart}
            industryPackId={props.industryPackId}
            defaultGuests={props.eventHeadcount}
            onCreated={setPlan}
          />
        ) : (
          <p className="mt-4 text-gray-600">
            This event isn&apos;t set up for ops yet. An admin creates the ops plan by picking packages and a guest count.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <ReadinessHeader
        plan={plan}
        eventName={props.eventName}
        eventStart={props.eventStart}
        orgId={props.orgId}
        eventId={props.eventId}
        orgSlug={props.orgSlug}
        eventSlug={props.eventSlug}
        complianceWarnings={props.complianceWarnings}
        onPlanChange={setPlan}
      />
      <RequirementsCard
        orgId={props.orgId} eventId={props.eventId}
        plan={plan} packages={props.packages} onPlanChange={setPlan}
      />
      <DeadlinesCard orgId={props.orgId} eventId={props.eventId} plan={plan} industryPackId={props.industryPackId} onPlanChange={setPlan} />
      <ListsCard orgId={props.orgId} eventId={props.eventId} plan={plan} orgSlug={props.orgSlug} eventSlug={props.eventSlug} onPlanChange={setPlan} />
      <ChecklistsCard orgId={props.orgId} eventId={props.eventId} plan={plan} onPlanChange={setPlan} />
      <IssuesCard orgId={props.orgId} eventId={props.eventId} issues={props.issues} />
    </div>
  )
}
```

Create placeholder files for `ReadinessHeader.tsx`, `RequirementsCard.tsx`, `DeadlinesCard.tsx`, `ListsCard.tsx`, `ChecklistsCard.tsx`, `IssuesCard.tsx` exporting the exact prop signatures used above with stub bodies (Tasks 7–10 replace them). Shared card prop shape (declare in each file):

```ts
interface PlanCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  onPlanChange: (next: OpsPlan) => void
}
```

`components/admin/ops/OpsSetup.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { instantiateOpsPlan } from '@/actions/event-ops'
import { formatMoney } from '@/lib/utils'
import type { OpsPlan, WorkPackage } from '@/lib/types'

const SITE_NEEDS = ['power', 'water', 'ice', 'parking'] as const

interface OpsSetupProps {
  orgId: string
  eventId: string
  packages: WorkPackage[]
  eventStart: string
  industryPackId?: string
  defaultGuests?: number
  onCreated: (plan: OpsPlan) => void
}

export function OpsSetup({ orgId, eventId, packages, eventStart, industryPackId, defaultGuests, onCreated }: OpsSetupProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [guests, setGuests] = useState(defaultGuests ? String(defaultGuests) : '')
  const [serviceStart, setServiceStart] = useState('')
  const [serviceEnd, setServiceEnd] = useState('')
  const [siteNeeds, setSiteNeeds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setSaving(true); setError(null)
    try {
      const plan = await instantiateOpsPlan(orgId, eventId, {
        package_ids: selected,
        requirements: {
          guests: Number(guests),
          ...(serviceStart ? { service_start: serviceStart } : {}),
          ...(serviceEnd ? { service_end: serviceEnd } : {}),
          ...(siteNeeds.length > 0 ? { site_needs: siteNeeds } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        event_start: eventStart,
        ...(industryPackId ? { industry_pack_id: industryPackId } : {}),
      })
      onCreated(plan)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set up'
      setError(msg.includes('already exists') ? 'An ops plan already exists for this event — reload the page to see it.' : msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Set up this event&apos;s ops plan</CardTitle>
        <p className="text-sm text-gray-500">
          Packages and guest count drive the shopping list, packing list, deadlines, and checklists.
          Packages can&apos;t be changed after setup yet — pick carefully.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Packages</p>
          {packages.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={p.name}
                checked={selected.includes(p.id)}
                onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id))}
              />
              {p.name} <span className="text-gray-500">{formatMoney(p.price)}</span>
              {p.max_guests !== undefined && <span className="text-gray-400 text-xs">up to {p.max_guests}</span>}
            </label>
          ))}
          {packages.length === 0 && (
            <p className="text-sm text-gray-500">No packages in your catalog yet — create one under Menu Packages first.</p>
          )}
        </div>
        <div className="flex gap-3 flex-wrap">
          <div>
            <Label htmlFor="ops-guests">Guests</Label>
            <Input id="ops-guests" type="number" className="w-28" value={guests} onChange={(e) => setGuests(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ops-svc-start">Service start</Label>
            <Input id="ops-svc-start" type="datetime-local" value={serviceStart} onChange={(e) => setServiceStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ops-svc-end">Service end</Label>
            <Input id="ops-svc-end" type="datetime-local" value={serviceEnd} onChange={(e) => setServiceEnd(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Site needs</p>
          <div className="flex gap-4">
            {SITE_NEEDS.map((n) => (
              <label key={n} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  aria-label={n}
                  checked={siteNeeds.includes(n)}
                  onChange={(e) => setSiteNeeds((prev) => e.target.checked ? [...prev, n] : prev.filter((x) => x !== n))}
                />
                {n}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="ops-notes">Notes</Label>
          <Input id="ops-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={handleCreate} disabled={saving || selected.length === 0 || !guests || Number(guests) <= 0}>
          Set up ops plan
        </Button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/admin/ops/OpsSetup.test.tsx`
Expected: PASS

- [ ] **Step 5: Build and commit**

Run: `npm run build`

```bash
git add "app/(admin)/[orgSlug]/[eventSlug]/ops" components/admin/ops __tests__/components/admin/ops/OpsSetup.test.tsx
git commit -m "feat(ops): event ops route with plan shell and instantiate wizard"
```

---

### Task 7: Readiness header + requirements card + change log

**Files:**
- Modify: `components/admin/ops/ReadinessHeader.tsx`, `components/admin/ops/RequirementsCard.tsx` (replace placeholders)
- Test: `__tests__/components/admin/ops/ReadinessHeader.test.tsx`, `__tests__/components/admin/ops/RequirementsCard.test.tsx`

**Interfaces:**
- Consumes: `computeReadiness` (Task 2), `acknowledgeReview`, `updateOpsRequirements`, `getOpsPlan` (actions/event-ops).
- Produces:
  - `ReadinessHeader({ plan, eventName, eventStart, orgId, eventId, orgSlug, eventSlug, complianceWarnings, onPlanChange })` — countdown, `pct` progress bar, overdue count, `needs_review` banner with an Acknowledge button, compliance warning chips, and a link to `/{orgSlug}/{eventSlug}/ops/closeout`.
  - `RequirementsCard({ orgId, eventId, plan, packages, onPlanChange })` — read view + edit form; saving calls `updateOpsRequirements` with ONLY changed fields, then re-fetches via `getOpsPlan` and calls `onPlanChange(fresh)` (guest changes re-derive the shopping list server-side, so a re-fetch is mandatory — never patch locally). Change log renders in a `<details>` block.

- [ ] **Step 1: Write the failing tests**

```tsx
// __tests__/components/admin/ops/ReadinessHeader.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/event-ops', () => ({
  acknowledgeReview: vi.fn().mockResolvedValue(undefined),
}))

import { acknowledgeReview } from '@/actions/event-ops'
import { ReadinessHeader } from '@/components/admin/ops/ReadinessHeader'
import type { OpsPlan } from '@/lib/types'

function plan(overrides: Partial<OpsPlan> = {}): OpsPlan {
  return {
    package_ids: ['p1'], requirements: { guests: 50 },
    deadlines: [{ id: 'd1', label: 'Order beans', due: '2000-01-01', done: false }],
    shopping_list: [], packing_list: [], checklists: [],
    needs_review: false, change_log: [], created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const base = {
  eventName: 'Nguyen Wedding', eventStart: '2999-09-10T00:00:00.000Z',
  orgId: 'o1', eventId: 'e1', orgSlug: 'acme', eventSlug: 'nguyen',
  complianceWarnings: [], onPlanChange: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

describe('ReadinessHeader', () => {
  it('shows countdown, completion, and overdue flags', () => {
    render(<ReadinessHeader {...base} plan={plan()} />)
    expect(screen.getByText(/days until event/i)).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText(/1 overdue/i)).toBeInTheDocument()
  })

  it('shows the needs-review banner and clears it on acknowledge', async () => {
    const onPlanChange = vi.fn()
    render(<ReadinessHeader {...base} onPlanChange={onPlanChange} plan={plan({ needs_review: true })} />)
    expect(screen.getByText(/requirements changed/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    await waitFor(() => expect(acknowledgeReview).toHaveBeenCalledWith('o1', 'e1'))
    expect(onPlanChange).toHaveBeenCalledWith(expect.objectContaining({ needs_review: false }))
  })

  it('lists compliance documents expiring before the event', () => {
    render(<ReadinessHeader {...base} plan={plan()}
      complianceWarnings={[{ name: 'Health permit', expires_on: '2026-09-01' }]} />)
    expect(screen.getByText(/Health permit/)).toBeInTheDocument()
    expect(screen.getByText(/expires 2026-09-01/i)).toBeInTheDocument()
  })
})
```

```tsx
// __tests__/components/admin/ops/RequirementsCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const freshPlan = {
  package_ids: ['p1'], requirements: { guests: 120, notes: 'gate code 4411' },
  deadlines: [], shopping_list: [], packing_list: [], checklists: [],
  needs_review: true,
  change_log: [{ at: '2026-08-05T10:00:00.000Z', by: 'u1', field: 'guests', from: '80', to: '120' }],
  created_at: '2026-08-01T00:00:00.000Z',
}

vi.mock('@/actions/event-ops', () => ({
  updateOpsRequirements: vi.fn().mockResolvedValue(undefined),
  getOpsPlan: vi.fn().mockImplementation(async () => freshPlan),
}))

import { updateOpsRequirements, getOpsPlan } from '@/actions/event-ops'
import { RequirementsCard } from '@/components/admin/ops/RequirementsCard'
import type { OpsPlan, WorkPackage } from '@/lib/types'

const pkg: WorkPackage = { id: 'p1', name: 'Espresso Bar', price: 900, lines: [], created_at: '2026-08-01T00:00:00.000Z' }
const plan: OpsPlan = {
  package_ids: ['p1'], requirements: { guests: 80, site_needs: ['power'] },
  deadlines: [], shopping_list: [], packing_list: [], checklists: [],
  needs_review: false,
  change_log: [{ at: '2026-08-04T10:00:00.000Z', by: 'u1', field: 'guests', from: '50', to: '80' }],
  created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('RequirementsCard', () => {
  it('shows requirements and package names', () => {
    render(<RequirementsCard orgId="o1" eventId="e1" plan={plan} packages={[pkg]} onPlanChange={vi.fn()} />)
    expect(screen.getByText('80')).toBeInTheDocument()
    expect(screen.getByText('Espresso Bar')).toBeInTheDocument()
    expect(screen.getByText('power')).toBeInTheDocument()
  })

  it('saves only changed fields and refreshes the plan', async () => {
    const onPlanChange = vi.fn()
    render(<RequirementsCard orgId="o1" eventId="e1" plan={plan} packages={[pkg]} onPlanChange={onPlanChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Guests'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateOpsRequirements).toHaveBeenCalledWith('o1', 'e1', { guests: 120 }))
    await waitFor(() => expect(getOpsPlan).toHaveBeenCalledWith('o1', 'e1'))
    expect(onPlanChange).toHaveBeenCalledWith(freshPlan)
  })

  it('renders the change log', () => {
    render(<RequirementsCard orgId="o1" eventId="e1" plan={plan} packages={[pkg]} onPlanChange={vi.fn()} />)
    fireEvent.click(screen.getByText(/change log/i))
    expect(screen.getByText(/guests: 50 → 80/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/components/admin/ops/ReadinessHeader.test.tsx __tests__/components/admin/ops/RequirementsCard.test.tsx`
Expected: FAIL — placeholders have no behavior.

- [ ] **Step 3: Implement both components**

`ReadinessHeader.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { acknowledgeReview } from '@/actions/event-ops'
import { computeReadiness } from '@/lib/ops/readiness'
import type { OpsPlan } from '@/lib/types'

interface ReadinessHeaderProps {
  plan: OpsPlan
  eventName: string
  eventStart: string
  orgId: string
  eventId: string
  orgSlug: string
  eventSlug: string
  complianceWarnings: { name: string; expires_on: string }[]
  onPlanChange: (next: OpsPlan) => void
}

export function ReadinessHeader({ plan, eventName, eventStart, orgId, eventId, orgSlug, eventSlug, complianceWarnings, onPlanChange }: ReadinessHeaderProps) {
  const [saving, setSaving] = useState(false)
  const r = computeReadiness(plan, eventStart)

  async function handleAcknowledge() {
    setSaving(true)
    try {
      await acknowledgeReview(orgId, eventId)
      onPlanChange({ ...plan, needs_review: false })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Event Ops — {eventName}</h1>
          <p className="text-sm text-gray-500">
            {r.days_until >= 0 ? `${r.days_until} days until event` : `event was ${-r.days_until} days ago`}
            {r.overdue > 0 && <span className="ml-2 font-medium text-red-600">{r.overdue} overdue</span>}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-2xl font-bold">{r.pct}%</span>
            <p className="text-xs text-gray-500">{r.done}/{r.total} done</p>
          </div>
          <Link href={`/${orgSlug}/${eventSlug}/ops/closeout`} className="text-sm underline text-gray-700">
            Closeout
          </Link>
        </div>
      </div>
      <div className="h-2 rounded bg-gray-200 overflow-hidden">
        <div className="h-full bg-gray-900 transition-all" style={{ width: `${r.pct}%` }} />
      </div>

      {plan.needs_review && (
        <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900 font-medium">
            Requirements changed — shopping quantities were re-derived. Review the lists below.
          </p>
          <Button size="sm" variant="outline" disabled={saving} onClick={handleAcknowledge}>Acknowledge</Button>
        </div>
      )}

      {complianceWarnings.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-900">Compliance documents expire before this event:</p>
          <ul className="text-sm text-red-800 list-disc pl-5">
            {complianceWarnings.map((w) => (
              <li key={w.name}>{w.name} — expires {w.expires_on}</li>
            ))}
          </ul>
          <Link href={`/${orgSlug}/compliance`} className="text-xs underline text-red-900">Open compliance tracker</Link>
        </div>
      )}
    </div>
  )
}
```

`RequirementsCard.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { updateOpsRequirements, getOpsPlan } from '@/actions/event-ops'
import type { OpsPlan, OpsRequirements, WorkPackage } from '@/lib/types'

const SITE_NEEDS = ['power', 'water', 'ice', 'parking'] as const

interface RequirementsCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  packages: WorkPackage[]
  onPlanChange: (next: OpsPlan) => void
}

export function RequirementsCard({ orgId, eventId, plan, packages, onPlanChange }: RequirementsCardProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const req = plan.requirements
  const [guests, setGuests] = useState(String(req.guests))
  const [serviceStart, setServiceStart] = useState(req.service_start ?? '')
  const [serviceEnd, setServiceEnd] = useState(req.service_end ?? '')
  const [siteNeeds, setSiteNeeds] = useState<string[]>(req.site_needs ?? [])
  const [notes, setNotes] = useState(req.notes ?? '')

  const planPackages = plan.package_ids.map((id) => packages.find((p) => p.id === id)?.name ?? `${id} (deleted)`)

  function changedFields(): Partial<OpsRequirements> {
    const updates: Partial<OpsRequirements> = {}
    if (Number(guests) !== req.guests) updates.guests = Number(guests)
    if (serviceStart !== (req.service_start ?? '')) updates.service_start = serviceStart
    if (serviceEnd !== (req.service_end ?? '')) updates.service_end = serviceEnd
    if (JSON.stringify(siteNeeds) !== JSON.stringify(req.site_needs ?? [])) updates.site_needs = siteNeeds
    // No null channel in the core: '' is the documented clear-notes workaround.
    if (notes !== (req.notes ?? '')) updates.notes = notes
    return updates
  }

  async function handleSave() {
    const updates = changedFields()
    if (Object.keys(updates).length === 0) { setEditing(false); return }
    setSaving(true); setError(null)
    try {
      await updateOpsRequirements(orgId, eventId, updates)
      // Guest changes re-derive the shopping list server-side — always re-fetch.
      const fresh = await getOpsPlan(orgId, eventId)
      if (fresh) onPlanChange(fresh)
      setEditing(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Requirements</CardTitle>
        {!editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!editing ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-gray-500">Packages</dt>
            <dd>{planPackages.map((n) => <span key={n} className="mr-1">{n}</span>)}</dd>
            <dt className="text-gray-500">Guests</dt>
            <dd className="font-medium">{req.guests}</dd>
            <dt className="text-gray-500">Service window</dt>
            <dd>{req.service_start ? `${req.service_start} → ${req.service_end ?? '?'}` : '—'}</dd>
            <dt className="text-gray-500">Site needs</dt>
            <dd>{(req.site_needs ?? []).length > 0 ? req.site_needs!.map((n) => <Badge key={n} variant="secondary" className="mr-1">{n}</Badge>) : '—'}</dd>
            <dt className="text-gray-500">Notes</dt>
            <dd>{req.notes || '—'}</dd>
          </dl>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              <div>
                <Label htmlFor="req-guests">Guests</Label>
                <Input id="req-guests" type="number" className="w-28" value={guests} onChange={(e) => setGuests(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="req-start">Service start</Label>
                <Input id="req-start" type="datetime-local" value={serviceStart} onChange={(e) => setServiceStart(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="req-end">Service end</Label>
                <Input id="req-end" type="datetime-local" value={serviceEnd} onChange={(e) => setServiceEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-4">
              {SITE_NEEDS.map((n) => (
                <label key={n} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" aria-label={n} checked={siteNeeds.includes(n)}
                    onChange={(e) => setSiteNeeds((prev) => e.target.checked ? [...prev, n] : prev.filter((x) => x !== n))} />
                  {n}
                </label>
              ))}
            </div>
            <div>
              <Label htmlFor="req-notes">Notes</Label>
              <Input id="req-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <p className="text-xs text-gray-500">Changing guests re-derives the shopping list (checked items carry over) and flags the plan for review.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving || !guests || Number(guests) <= 0}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <details>
          <summary className="text-sm text-gray-500 cursor-pointer">Change log ({plan.change_log.length})</summary>
          <ul className="mt-2 text-xs text-gray-600 space-y-1">
            {plan.change_log.slice().reverse().map((c, i) => (
              <li key={i}>
                {c.at.slice(0, 16).replace('T', ' ')} — {c.field}: {c.from ?? '—'} → {c.to ?? '—'} ({c.by})
              </li>
            ))}
            {plan.change_log.length === 0 && <li>No changes yet.</li>}
          </ul>
        </details>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/components/admin/ops/ReadinessHeader.test.tsx __tests__/components/admin/ops/RequirementsCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/admin/ops/ReadinessHeader.tsx components/admin/ops/RequirementsCard.tsx __tests__/components/admin/ops/ReadinessHeader.test.tsx __tests__/components/admin/ops/RequirementsCard.test.tsx
git commit -m "feat(ops): readiness header with needs-review banner and requirements card"
```

---

### Task 8: Deadlines + shopping/packing lists + print view

**Files:**
- Modify: `components/admin/ops/DeadlinesCard.tsx`, `components/admin/ops/ListsCard.tsx` (replace placeholders)
- Create: `app/(admin)/[orgSlug]/[eventSlug]/ops/print/page.tsx`, `components/admin/ops/PrintButton.tsx`
- Test: `__tests__/components/admin/ops/DeadlinesCard.test.tsx`, `__tests__/components/admin/ops/ListsCard.test.tsx`

**Interfaces:**
- Consumes: `toggleDeadline`, `toggleListItem` (actions/event-ops); `DEADLINE_TEMPLATES` (lib/ops/derive — pure, client-safe); `getOpsPlan` action for the print page.
- Produces: `DeadlinesCard({ orgId, eventId, plan, industryPackId, onPlanChange })`; `ListsCard({ orgId, eventId, plan, orgSlug, eventSlug, onPlanChange })`; `PrintButton()` (client, `window.print()`); print route at `/{orgSlug}/{eventSlug}/ops/print`.

- [ ] **Step 1: Write the failing tests**

```tsx
// __tests__/components/admin/ops/DeadlinesCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/event-ops', () => ({
  toggleDeadline: vi.fn().mockResolvedValue(undefined),
}))

import { toggleDeadline } from '@/actions/event-ops'
import { DeadlinesCard } from '@/components/admin/ops/DeadlinesCard'
import type { OpsPlan } from '@/lib/types'

const plan: OpsPlan = {
  package_ids: [], requirements: { guests: 10 },
  deadlines: [
    { id: 'd1', label: 'Order consumables', due: '2000-01-01', done: false },
    { id: 'd2', label: 'Final payment', due: '2999-01-01', done: true },
  ],
  shopping_list: [], packing_list: [], checklists: [],
  needs_review: false, change_log: [], created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('DeadlinesCard', () => {
  it('renders deadlines and highlights overdue', () => {
    render(<DeadlinesCard orgId="o1" eventId="e1" plan={plan} industryPackId="coffee-cart" onPlanChange={vi.fn()} />)
    expect(screen.getByText('Order consumables')).toBeInTheDocument()
    expect(screen.getByText(/overdue/i)).toBeInTheDocument()
  })

  it('toggles a deadline and reports the new plan upward', async () => {
    const onPlanChange = vi.fn()
    render(<DeadlinesCard orgId="o1" eventId="e1" plan={plan} industryPackId="coffee-cart" onPlanChange={onPlanChange} />)
    fireEvent.click(screen.getByLabelText('Order consumables'))
    await waitFor(() => expect(toggleDeadline).toHaveBeenCalledWith('o1', 'e1', 'd1', true))
    expect(onPlanChange).toHaveBeenCalledWith(expect.objectContaining({
      deadlines: expect.arrayContaining([expect.objectContaining({ id: 'd1', done: true })]),
    }))
  })

  it('notes the general-template fallback for packs without their own deadlines', () => {
    render(<DeadlinesCard orgId="o1" eventId="e1" plan={plan} industryPackId="florist" onPlanChange={vi.fn()} />)
    expect(screen.getByText(/general deadline defaults/i)).toBeInTheDocument()
  })
})
```

```tsx
// __tests__/components/admin/ops/ListsCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/event-ops', () => ({
  toggleListItem: vi.fn().mockResolvedValue(undefined),
}))

import { toggleListItem } from '@/actions/event-ops'
import { ListsCard } from '@/components/admin/ops/ListsCard'
import type { OpsPlan } from '@/lib/types'

const plan: OpsPlan = {
  package_ids: [], requirements: { guests: 50 },
  deadlines: [],
  shopping_list: [{ resource_id: 'r1', name: 'Espresso beans', qty: 37.5, unit: 'oz', checked: false }],
  packing_list: [{ resource_id: 'r2', name: 'Espresso Machine 02', qty: 1, checked: true }],
  checklists: [],
  needs_review: false, change_log: [], created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('ListsCard', () => {
  it('renders shopping and packing items with quantities', () => {
    render(<ListsCard orgId="o1" eventId="e1" plan={plan} orgSlug="acme" eventSlug="gala" onPlanChange={vi.fn()} />)
    expect(screen.getByText('Espresso beans')).toBeInTheDocument()
    expect(screen.getByText('37.5 oz')).toBeInTheDocument()
    expect(screen.getByText('Espresso Machine 02')).toBeInTheDocument()
  })

  it('toggles a shopping item', async () => {
    const onPlanChange = vi.fn()
    render(<ListsCard orgId="o1" eventId="e1" plan={plan} orgSlug="acme" eventSlug="gala" onPlanChange={onPlanChange} />)
    fireEvent.click(screen.getByLabelText('Espresso beans'))
    await waitFor(() => expect(toggleListItem).toHaveBeenCalledWith('o1', 'e1', 'shopping_list', 'r1', true))
    expect(onPlanChange).toHaveBeenCalled()
  })

  it('links to the print view', () => {
    render(<ListsCard orgId="o1" eventId="e1" plan={plan} orgSlug="acme" eventSlug="gala" onPlanChange={vi.fn()} />)
    expect(screen.getByText('Print lists')).toHaveAttribute('href', '/acme/gala/ops/print')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/components/admin/ops/DeadlinesCard.test.tsx __tests__/components/admin/ops/ListsCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`DeadlinesCard.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toggleDeadline } from '@/actions/event-ops'
import { DEADLINE_TEMPLATES } from '@/lib/ops/derive'
import type { OpsPlan } from '@/lib/types'

interface DeadlinesCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  industryPackId?: string
  onPlanChange: (next: OpsPlan) => void
}

export function DeadlinesCard({ orgId, eventId, plan, industryPackId, onPlanChange }: DeadlinesCardProps) {
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const packId = plan.industry_pack_id ?? industryPackId
  const usesGeneralFallback = packId !== undefined && packId !== 'general' && DEADLINE_TEMPLATES[packId] === undefined

  async function handleToggle(id: string, done: boolean) {
    setError(null)
    try {
      await toggleDeadline(orgId, eventId, id, done)
      onPlanChange({ ...plan, deadlines: plan.deadlines.map((d) => (d.id === id ? { ...d, done } : d)) })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Deadlines</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {usesGeneralFallback && (
          <p className="text-xs text-gray-500">
            Your industry has no deadline template yet — these are the general deadline defaults.
          </p>
        )}
        {plan.deadlines.slice().sort((a, b) => a.due.localeCompare(b.due)).map((d) => {
          const overdue = !d.done && d.due < today
          return (
            <label key={d.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" aria-label={d.label} checked={d.done} onChange={(e) => handleToggle(d.id, e.target.checked)} />
              <span className={d.done ? 'line-through text-gray-400' : ''}>{d.label}</span>
              <span className={`ml-auto text-xs ${overdue ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
                {d.due}{overdue && ' — overdue'}
              </span>
            </label>
          )
        })}
        {plan.deadlines.length === 0 && <p className="text-sm text-gray-500">No deadlines.</p>}
      </CardContent>
    </Card>
  )
}
```

`ListsCard.tsx` (one card, two columns; each item is a labeled checkbox calling `toggleListItem` with the list name, then `onPlanChange` with the item patched):

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toggleListItem } from '@/actions/event-ops'
import type { OpsPlan, OpsListItem } from '@/lib/types'

interface ListsCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  orgSlug: string
  eventSlug: string
  onPlanChange: (next: OpsPlan) => void
}

function qtyLabel(i: OpsListItem): string {
  return i.unit ? `${i.qty} ${i.unit}` : `× ${i.qty}`
}

export function ListsCard({ orgId, eventId, plan, orgSlug, eventSlug, onPlanChange }: ListsCardProps) {
  const [error, setError] = useState<string | null>(null)

  async function handleToggle(list: 'shopping_list' | 'packing_list', item: OpsListItem, checked: boolean) {
    setError(null)
    try {
      await toggleListItem(orgId, eventId, list, item.resource_id, checked)
      onPlanChange({
        ...plan,
        [list]: plan[list].map((x) => (x.resource_id === item.resource_id ? { ...x, checked } : x)),
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  function renderList(title: string, list: 'shopping_list' | 'packing_list') {
    const items = plan[list]
    return (
      <div>
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        <div className="space-y-1">
          {items.map((i) => (
            <label key={i.resource_id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" aria-label={i.name} checked={i.checked}
                onChange={(e) => handleToggle(list, i, e.target.checked)} />
              <span className={i.checked ? 'line-through text-gray-400' : ''}>{i.name}</span>
              <span className="ml-auto text-xs text-gray-500">{qtyLabel(i)}</span>
            </label>
          ))}
          {items.length === 0 && <p className="text-sm text-gray-500">Empty.</p>}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Shopping &amp; packing</CardTitle>
        <Link href={`/${orgSlug}/${eventSlug}/ops/print`} className="text-sm underline text-gray-700">Print lists</Link>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {renderList('Shopping list', 'shopping_list')}
          {renderList('Packing list', 'packing_list')}
        </div>
      </CardContent>
    </Card>
  )
}
```

`components/admin/ops/PrintButton.tsx`:

```tsx
'use client'

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="print:hidden rounded-md border px-3 py-1.5 text-sm">
      Print
    </button>
  )
}
```

`app/(admin)/[orgSlug]/[eventSlug]/ops/print/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { getOpsPlan } from '@/actions/event-ops'
import { PrintButton } from '@/components/admin/ops/PrintButton'
import type { OpsListItem } from '@/lib/types'

function List({ title, items }: { title: string; items: OpsListItem[] }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold mb-2">{title}</h2>
      <ul className="text-sm space-y-1">
        {items.map((i) => (
          <li key={i.resource_id}>
            {i.checked ? '☑' : '☐'} {i.name} — {i.unit ? `${i.qty} ${i.unit}` : `× ${i.qty}`}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default async function OpsPrintPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event } = await requireEventPage(orgSlug, eventSlug, 'ops')
  const plan = await getOpsPlan(orgId, eventId)
  if (!plan) return <div className="p-8">No ops plan for this event.</div>
  return (
    <div className="p-8 bg-white min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">{event.name} — {plan.requirements.guests} guests</h1>
        <PrintButton />
      </div>
      <List title="Shopping list" items={plan.shopping_list} />
      <List title="Packing list" items={plan.packing_list} />
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/components/admin/ops/DeadlinesCard.test.tsx __tests__/components/admin/ops/ListsCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Build and commit**

Run: `npm run build`

```bash
git add components/admin/ops/DeadlinesCard.tsx components/admin/ops/ListsCard.tsx components/admin/ops/PrintButton.tsx "app/(admin)/[orgSlug]/[eventSlug]/ops/print" __tests__/components/admin/ops/DeadlinesCard.test.tsx __tests__/components/admin/ops/ListsCard.test.tsx
git commit -m "feat(ops): deadlines and shopping/packing lists with print view"
```

---

### Task 9: Photo evidence upload + runnable checklists

**Files:**
- Modify: `lib/firebase-admin.ts` (add `adminBucket`)
- Create: `actions/ops-evidence.ts`
- Modify: `next.config.ts` (serverActions bodySizeLimit)
- Modify: `components/admin/ops/ChecklistsCard.tsx` (replace placeholder)
- Test: `__tests__/actions/ops-evidence.test.ts`, `__tests__/components/admin/ops/ChecklistsCard.test.tsx`

**Interfaces:**
- Consumes: `completeChecklistStep` (actions/event-ops), `assertEventPage` (lib/auth/assert), `getStorage` (firebase-admin/storage).
- Produces: `adminBucket` export from `lib/firebase-admin.ts`; `uploadEvidencePhoto(orgId: string, eventId: string, formData: FormData): Promise<{ url: string }>` (`formData` field name: `file`); `ChecklistsCard({ orgId, eventId, plan, onPlanChange })`.
- Storage decision (handoff: "photo evidence needs a storage story"): admin-SDK upload to `ops-evidence/{orgId}/{eventId}/{timestamp}-{sanitized name}`, then `makePublic()` and store the stable public URL in `evidence_value`. Public-by-obscure-URL is a conscious MVP tradeoff (signed URLs expire ≤7 days and would rot in the plan doc); revisit before verticals with sensitive evidence. Client SDK upload is not an option — the app has no client Firebase Auth session, and `firestore.rules`/storage rules stay untouched.

- [ ] **Step 1: Write the failing action test**

```ts
// __tests__/actions/ops-evidence.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const saveSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const makePublicSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const publicUrlSpy = vi.hoisted(() => vi.fn().mockReturnValue('https://storage.googleapis.com/b/ops-evidence/x.jpg'))
const fileSpy = vi.hoisted(() => vi.fn().mockReturnValue({ save: saveSpy, makePublic: makePublicSpy, publicUrl: publicUrlSpy }))

vi.mock('@/lib/firebase-admin', () => ({
  adminBucket: { file: fileSpy },
}))
vi.mock('@/lib/auth/assert', () => ({
  assertEventPage: vi.fn().mockResolvedValue({ uid: 'u1', role: 'staff', event_access: {} }),
}))

import { assertEventPage } from '@/lib/auth/assert'
import { uploadEvidencePhoto } from '@/actions/ops-evidence'

function photoForm(name = 'espresso.jpg', type = 'image/jpeg', bytes = 1024): FormData {
  const fd = new FormData()
  fd.append('file', new File([new Uint8Array(bytes)], name, { type }))
  return fd
}

beforeEach(() => vi.clearAllMocks())

describe('uploadEvidencePhoto', () => {
  it('gates on the ops event page', async () => {
    await uploadEvidencePhoto('o1', 'e1', photoForm())
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
  })

  it('stores under ops-evidence/{org}/{event} and returns a public url', async () => {
    const { url } = await uploadEvidencePhoto('o1', 'e1', photoForm())
    expect(fileSpy.mock.calls[0][0]).toMatch(/^ops-evidence\/o1\/e1\/\d+-espresso\.jpg$/)
    expect(makePublicSpy).toHaveBeenCalled()
    expect(url).toBe('https://storage.googleapis.com/b/ops-evidence/x.jpg')
  })

  it('rejects non-images and oversized files', async () => {
    await expect(uploadEvidencePhoto('o1', 'e1', photoForm('a.pdf', 'application/pdf'))).rejects.toThrow('Only image uploads are allowed')
    await expect(uploadEvidencePhoto('o1', 'e1', photoForm('big.jpg', 'image/jpeg', 9 * 1024 * 1024))).rejects.toThrow('Photo must be under 8MB')
  })

  it('rejects a missing file', async () => {
    await expect(uploadEvidencePhoto('o1', 'e1', new FormData())).rejects.toThrow('No file provided')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/actions/ops-evidence.test.ts`
Expected: FAIL — `adminBucket` / module missing.

- [ ] **Step 3: Implement the backend**

`lib/firebase-admin.ts` — add:

```ts
import { getStorage } from 'firebase-admin/storage'
```

and after the `adminDb` export:

```ts
// Default GCS bucket for ops evidence photos. Reuses the client-side bucket
// env when a server-specific one isn't set.
export const adminBucket = getStorage(adminApp).bucket(
  process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
)
```

`actions/ops-evidence.ts`:

```ts
'use server'

import { assertEventPage } from '@/lib/auth/assert'
import { adminBucket } from '@/lib/firebase-admin'

const MAX_BYTES = 8 * 1024 * 1024

/**
 * Upload a checklist evidence photo; returns a stable public URL for
 * OpsChecklistStep.evidence_value. Public-by-obscure-URL is the documented
 * MVP tradeoff (see phase-3 plan Task 9).
 */
export async function uploadEvidencePhoto(
  orgId: string,
  eventId: string,
  formData: FormData,
): Promise<{ url: string }> {
  await assertEventPage(orgId, eventId, 'ops')

  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('No file provided')
  if (!file.type.startsWith('image/')) throw new Error('Only image uploads are allowed')
  if (file.size > MAX_BYTES) throw new Error('Photo must be under 8MB')

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `ops-evidence/${orgId}/${eventId}/${Date.now()}-${safeName}`
  const blob = adminBucket.file(path)
  await blob.save(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    resumable: false,
  })
  await blob.makePublic()
  return { url: blob.publicUrl() }
}
```

`next.config.ts` — phone photos exceed the 1MB server-action default:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
```

- [ ] **Step 4: Run action test to verify it passes**

Run: `npx vitest run __tests__/actions/ops-evidence.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing ChecklistsCard test**

```tsx
// __tests__/components/admin/ops/ChecklistsCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/event-ops', () => ({
  completeChecklistStep: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/actions/ops-evidence', () => ({
  uploadEvidencePhoto: vi.fn().mockResolvedValue({ url: 'https://cdn.example/x.jpg' }),
}))

import { completeChecklistStep } from '@/actions/event-ops'
import { uploadEvidencePhoto } from '@/actions/ops-evidence'
import { ChecklistsCard } from '@/components/admin/ops/ChecklistsCard'
import type { OpsPlan } from '@/lib/types'

const plan: OpsPlan = {
  package_ids: [], requirements: { guests: 10 },
  deadlines: [], shopping_list: [], packing_list: [],
  checklists: [
    {
      id: 'c1', name: 'Setup', phase: 'setup',
      steps: [
        { text: 'Level the cart', evidence: 'none', done: false },
        { text: 'Record water pressure', evidence: 'number', done: false },
        { text: 'Photo of finished bar', evidence: 'photo', done: false },
      ],
    },
  ],
  needs_review: false, change_log: [], created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('ChecklistsCard', () => {
  it('completes a plain step on toggle', async () => {
    const onPlanChange = vi.fn()
    render(<ChecklistsCard orgId="o1" eventId="e1" plan={plan} onPlanChange={onPlanChange} />)
    fireEvent.click(screen.getByLabelText('Level the cart'))
    await waitFor(() => expect(completeChecklistStep).toHaveBeenCalledWith('o1', 'e1', 'c1', 0, { done: true }))
    expect(onPlanChange).toHaveBeenCalled()
  })

  it('requires a number before completing a number-evidence step', async () => {
    render(<ChecklistsCard orgId="o1" eventId="e1" plan={plan} onPlanChange={vi.fn()} />)
    const doneBtn = screen.getByRole('button', { name: 'Done: Record water pressure' })
    expect(doneBtn).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Value for Record water pressure'), { target: { value: '42' } })
    fireEvent.click(doneBtn)
    await waitFor(() => expect(completeChecklistStep).toHaveBeenCalledWith('o1', 'e1', 'c1', 1, { done: true, evidence_value: '42' }))
  })

  it('uploads the photo then completes the photo-evidence step with its url', async () => {
    render(<ChecklistsCard orgId="o1" eventId="e1" plan={plan} onPlanChange={vi.fn()} />)
    const input = screen.getByLabelText('Photo for Photo of finished bar')
    fireEvent.change(input, { target: { files: [new File(['x'], 'bar.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(uploadEvidencePhoto).toHaveBeenCalled())
    await waitFor(() => expect(completeChecklistStep).toHaveBeenCalledWith('o1', 'e1', 'c1', 2, {
      done: true, evidence_value: 'https://cdn.example/x.jpg',
    }))
  })

  it('can un-complete a step', async () => {
    const done = { ...plan, checklists: [{ ...plan.checklists[0], steps: [{ text: 'Level the cart', evidence: 'none' as const, done: true }] }] }
    render(<ChecklistsCard orgId="o1" eventId="e1" plan={done} onPlanChange={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Level the cart'))
    await waitFor(() => expect(completeChecklistStep).toHaveBeenCalledWith('o1', 'e1', 'c1', 0, { done: false }))
  })
})
```

Run: `npx vitest run __tests__/components/admin/ops/ChecklistsCard.test.tsx` — expected FAIL.

- [ ] **Step 6: Implement `ChecklistsCard`**

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { completeChecklistStep } from '@/actions/event-ops'
import { uploadEvidencePhoto } from '@/actions/ops-evidence'
import type { OpsPlan, ChecklistPhase } from '@/lib/types'

const PHASE_ORDER: ChecklistPhase[] = ['prep', 'load-out', 'setup', 'service-close', 'closeout']

interface ChecklistsCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  onPlanChange: (next: OpsPlan) => void
}

export function ChecklistsCard({ orgId, eventId, plan, onPlanChange }: ChecklistsCardProps) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)          // `${checklistId}:${stepIndex}`
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({})

  const ordered = plan.checklists.slice().sort(
    (a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase)
  )

  function patch(checklistId: string, stepIndex: number, done: boolean, evidence_value?: string) {
    onPlanChange({
      ...plan,
      checklists: plan.checklists.map((c) =>
        c.id !== checklistId ? c : {
          ...c,
          steps: c.steps.map((s, i) => (i === stepIndex ? { ...s, done, ...(evidence_value !== undefined ? { evidence_value } : {}) } : s)),
        }
      ),
    })
  }

  async function complete(checklistId: string, stepIndex: number, input: { done: boolean; evidence_value?: string }) {
    const key = `${checklistId}:${stepIndex}`
    setBusy(key); setError(null)
    try {
      await completeChecklistStep(orgId, eventId, checklistId, stepIndex, input)
      patch(checklistId, stepIndex, input.done, input.evidence_value)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBusy(null)
    }
  }

  async function handlePhoto(checklistId: string, stepIndex: number, file: File | undefined) {
    if (!file) return
    const key = `${checklistId}:${stepIndex}`
    setBusy(key); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { url } = await uploadEvidencePhoto(orgId, eventId, fd)
      await completeChecklistStep(orgId, eventId, checklistId, stepIndex, { done: true, evidence_value: url })
      patch(checklistId, stepIndex, true, url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Checklists</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {ordered.map((c) => (
          <div key={c.id}>
            <h3 className="text-sm font-semibold">{c.name} <span className="text-xs font-normal text-gray-400">({c.phase})</span></h3>
            <div className="mt-1 space-y-2">
              {c.steps.map((s, i) => {
                const key = `${c.id}:${i}`
                return (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    {s.evidence === 'none' ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" aria-label={s.text} checked={s.done} disabled={busy === key}
                          onChange={(e) => complete(c.id, i, { done: e.target.checked })} />
                        <span className={s.done ? 'line-through text-gray-400' : ''}>{s.text}</span>
                      </label>
                    ) : (
                      <span className={`text-sm ${s.done ? 'line-through text-gray-400' : ''}`}>{s.text}</span>
                    )}
                    {s.evidence === 'number' && !s.done && (
                      <>
                        <Input
                          aria-label={`Value for ${s.text}`}
                          type="number" className="w-24 h-8"
                          value={numberDrafts[key] ?? ''}
                          onChange={(e) => setNumberDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                        <Button size="sm" variant="outline"
                          aria-label={`Done: ${s.text}`}
                          disabled={busy === key || !(numberDrafts[key] ?? '').trim()}
                          onClick={() => complete(c.id, i, { done: true, evidence_value: numberDrafts[key].trim() })}>
                          Done
                        </Button>
                      </>
                    )}
                    {s.evidence === 'photo' && !s.done && (
                      <label className="text-sm text-gray-600 cursor-pointer underline">
                        {busy === key ? 'Uploading…' : 'Take / choose photo'}
                        <input
                          type="file" accept="image/*" capture="environment" className="sr-only"
                          aria-label={`Photo for ${s.text}`}
                          onChange={(e) => handlePhoto(c.id, i, e.target.files?.[0])}
                        />
                      </label>
                    )}
                    {s.done && s.evidence !== 'none' && (
                      <span className="text-xs text-gray-500">
                        {s.evidence === 'photo' && s.evidence_value
                          ? <a href={s.evidence_value} target="_blank" rel="noreferrer" className="underline">view photo</a>
                          : s.evidence_value}
                        <button className="ml-2 underline" onClick={() => complete(c.id, i, { done: false })}>undo</button>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {ordered.length === 0 && <p className="text-sm text-gray-500">No checklists on this plan.</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 7: Run tests, build, commit**

Run: `npx vitest run __tests__/components/admin/ops/ChecklistsCard.test.tsx __tests__/actions/ops-evidence.test.ts` — expected PASS.
Run: `npm run build` — expected clean (next.config change + new action).

```bash
git add lib/firebase-admin.ts actions/ops-evidence.ts next.config.ts components/admin/ops/ChecklistsCard.tsx __tests__/actions/ops-evidence.test.ts __tests__/components/admin/ops/ChecklistsCard.test.tsx
git commit -m "feat(ops): runnable checklists with photo/number evidence via admin storage"
```

---

### Task 10: Issues card

**Files:**
- Modify: `components/admin/ops/IssuesCard.tsx` (replace placeholder)
- Test: `__tests__/components/admin/ops/IssuesCard.test.tsx`

**Interfaces:**
- Consumes: `createIssue`, `resolveIssue` (actions/event-ops); `IssueSeverity`, `OpsIssue` types.
- Produces: `IssuesCard({ orgId, eventId, issues }: { orgId: string; eventId: string; issues: OpsIssue[] })` — self-contained state (issues aren't part of the plan doc).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/admin/ops/IssuesCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/event-ops', () => ({
  createIssue: vi.fn().mockImplementation(async (_o: string, _e: string, input: object) => ({
    id: 'i-new', status: 'open', created_by: 'u1', created_at: '2026-08-05T00:00:00.000Z', ...input,
  })),
  resolveIssue: vi.fn().mockResolvedValue(undefined),
}))

import { createIssue, resolveIssue } from '@/actions/event-ops'
import { IssuesCard } from '@/components/admin/ops/IssuesCard'
import type { OpsIssue } from '@/lib/types'

const open: OpsIssue = {
  id: 'i1', type: 'equipment', severity: 'high', note: 'Grinder burrs cracked',
  status: 'open', created_by: 'u1', created_at: '2026-08-05T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('IssuesCard', () => {
  it('lists open issues with severity', () => {
    render(<IssuesCard orgId="o1" eventId="e1" issues={[open]} />)
    expect(screen.getByText('Grinder burrs cracked')).toBeInTheDocument()
    expect(screen.getByText('high')).toBeInTheDocument()
  })

  it('creates an issue', async () => {
    render(<IssuesCard orgId="o1" eventId="e1" issues={[]} />)
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'supply' } })
    fireEvent.change(screen.getByLabelText('Severity'), { target: { value: 'medium' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Out of oat milk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log issue' }))
    await waitFor(() => expect(createIssue).toHaveBeenCalledWith('o1', 'e1', {
      type: 'supply', severity: 'medium', note: 'Out of oat milk',
    }))
    expect(await screen.findByText('Out of oat milk')).toBeInTheDocument()
  })

  it('resolves an issue with a resolution note', async () => {
    render(<IssuesCard orgId="o1" eventId="e1" issues={[open]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    fireEvent.change(screen.getByLabelText('Resolution'), { target: { value: 'Swapped to backup grinder' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }))
    await waitFor(() => expect(resolveIssue).toHaveBeenCalledWith('o1', 'e1', 'i1', 'Swapped to backup grinder'))
    expect(screen.getByText(/resolved/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/admin/ops/IssuesCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `IssuesCard`**

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createIssue, resolveIssue } from '@/actions/event-ops'
import type { OpsIssue, IssueSeverity } from '@/lib/types'

const TYPES = ['equipment', 'supply', 'venue', 'staff', 'other']
const SEVERITIES: IssueSeverity[] = ['low', 'medium', 'high']

interface IssuesCardProps {
  orgId: string
  eventId: string
  issues: OpsIssue[]
}

export function IssuesCard({ orgId, eventId, issues: initial }: IssuesCardProps) {
  const [issues, setIssues] = useState(initial)
  const [type, setType] = useState('equipment')
  const [severity, setSeverity] = useState<IssueSeverity>('low')
  const [note, setNote] = useState('')
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolution, setResolution] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!note.trim()) return
    setSaving(true); setError(null)
    try {
      const created = await createIssue(orgId, eventId, { type, severity, note: note.trim() })
      setIssues((prev) => [created, ...prev])
      setNote('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to log issue')
    } finally {
      setSaving(false)
    }
  }

  async function handleResolve(id: string) {
    setSaving(true); setError(null)
    try {
      await resolveIssue(orgId, eventId, id, resolution.trim() || undefined)
      setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'resolved', resolution: resolution.trim() || undefined } : i)))
      setResolvingId(null); setResolution('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resolve')
    } finally {
      setSaving(false)
    }
  }

  const sevVariant = (s: IssueSeverity) => (s === 'high' ? 'destructive' : 'secondary')

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Issues</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {issues.map((i) => (
          <div key={i.id} className="rounded-md border px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={sevVariant(i.severity)}>{i.severity}</Badge>
              <span className="text-xs text-gray-500">{i.type}</span>
              {i.status === 'resolved' && <Badge variant="secondary">resolved</Badge>}
              {i.status === 'open' && resolvingId !== i.id && (
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setResolvingId(i.id)}>Resolve</Button>
              )}
            </div>
            <p className={`mt-1 ${i.status === 'resolved' ? 'text-gray-400' : ''}`}>{i.note}</p>
            {i.resolution && <p className="text-xs text-gray-500">↳ {i.resolution}</p>}
            {resolvingId === i.id && (
              <div className="mt-2 flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor={`res-${i.id}`}>Resolution</Label>
                  <Input id={`res-${i.id}`} value={resolution} onChange={(e) => setResolution(e.target.value)} />
                </div>
                <Button size="sm" disabled={saving} onClick={() => handleResolve(i.id)}>Mark resolved</Button>
              </div>
            )}
          </div>
        ))}
        {issues.length === 0 && <p className="text-sm text-gray-500">No issues logged.</p>}

        <div className="flex items-end gap-2 border-t pt-3 flex-wrap">
          <div>
            <Label htmlFor="iss-type">Type</Label>
            <select id="iss-type" value={type} onChange={(e) => setType(e.target.value)}
              className="block h-9 rounded-md border border-gray-300 px-2 text-sm">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="iss-sev">Severity</Label>
            <select id="iss-sev" value={severity} onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
              className="block h-9 rounded-md border border-gray-300 px-2 text-sm">
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <Label htmlFor="iss-note">Note</Label>
            <Input id="iss-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button onClick={handleCreate} disabled={saving || !note.trim()}>Log issue</Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/admin/ops/IssuesCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/admin/ops/IssuesCard.tsx __tests__/components/admin/ops/IssuesCard.test.tsx
git commit -m "feat(ops): issue capture and resolution on the ops tab"
```

---

### Task 11: Compliance backend (types, cores, actions)

**Files:**
- Modify: `lib/types.ts` (append after the ops section)
- Create: `lib/ops/compliance.ts`
- Create: `actions/compliance.ts`
- Test: `__tests__/lib/ops/compliance.test.ts`, `__tests__/actions/compliance.test.ts`

**Interfaces:**
- Consumes: `adminDb`, `FieldValue` (update idiom from `lib/ops/resources.ts`), `assertOrgMember`/`assertOrgAdmin`.
- Produces:
  - Type `ComplianceDoc { id: string; name: string; expires_on?: string; link_url?: string; notes?: string; created_at: string; updated_at?: string }` (thin per spec §4.3 — a named document with an expiry; no jurisdiction engine, no file storage: `link_url` points at wherever the document lives).
  - Cores: `complianceDocsRef(orgId)`; `listComplianceDocsCore(orgId): Promise<ComplianceDoc[]>` (ordered by name); `createComplianceDocCore(orgId, input: CreateComplianceDocInput): Promise<ComplianceDoc>`; `updateComplianceDocCore(orgId, docId, updates: ComplianceDocUpdate): Promise<void>` (null deletes field); `deleteComplianceDocCore(orgId, docId): Promise<void>`; pure `expiringDocs(docs: ComplianceDoc[], byDate: string): ComplianceDoc[]`.
  - Actions: `listComplianceDocs` (member), `createComplianceDoc`/`updateComplianceDoc`/`deleteComplianceDoc` (admin).
  - Firestore: `orgs/{orgId}/compliance_docs/{docId}`.

- [ ] **Step 1: Write the failing core test**

```ts
// __tests__/lib/ops/compliance.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const docSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const docUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const docDeleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
const collRef = vi.hoisted(() => ({
  doc: vi.fn((id?: string) => ({ id: id ?? 'cd-new', set: docSetSpy, update: docUpdateSpy, delete: docDeleteSpy })),
  orderBy: vi.fn().mockReturnValue({ get: listGetSpy }),
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))

import { createComplianceDocCore, updateComplianceDocCore, expiringDocs } from '@/lib/ops/compliance'
import type { ComplianceDoc } from '@/lib/types'

beforeEach(() => vi.clearAllMocks())

describe('createComplianceDocCore', () => {
  it('requires a name', async () => {
    await expect(createComplianceDocCore('o1', { name: '  ' })).rejects.toThrow('Name is required')
  })

  it('writes only provided fields', async () => {
    const doc = await createComplianceDocCore('o1', { name: 'Health permit', expires_on: '2026-12-01' })
    expect(doc.id).toBe('cd-new')
    expect(docSetSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'Health permit', expires_on: '2026-12-01' }))
    expect(docSetSpy.mock.calls[0][0]).not.toHaveProperty('notes')
    expect(docSetSpy.mock.calls[0][0]).not.toHaveProperty('link_url')
  })
})

describe('updateComplianceDocCore', () => {
  it('deletes fields set to null and skips undefined', async () => {
    await updateComplianceDocCore('o1', 'cd1', { expires_on: null, name: undefined, notes: 'renewed' })
    const payload = docUpdateSpy.mock.calls[0][0]
    expect(payload.notes).toBe('renewed')
    expect(payload).not.toHaveProperty('name')
    // null → FieldValue.delete() sentinel (not literal null, not dropped) —
    // same assertion idiom as __tests__/lib/ops/resources.test.ts
    expect(payload.expires_on).toBeDefined()
    expect(payload.expires_on).not.toBeNull()
  })
})

describe('expiringDocs', () => {
  const docs: ComplianceDoc[] = [
    { id: '1', name: 'Permit', expires_on: '2026-09-01', created_at: 'x' },
    { id: '2', name: 'Insurance', expires_on: '2027-01-01', created_at: 'x' },
    { id: '3', name: 'No expiry', created_at: 'x' },
  ]
  it('returns docs expiring on or before the date, ignoring no-expiry docs', () => {
    expect(expiringDocs(docs, '2026-09-10').map((d) => d.name)).toEqual(['Permit'])
    expect(expiringDocs(docs, '2027-06-01').map((d) => d.name)).toEqual(['Permit', 'Insurance'])
  })
})
```

- [ ] **Step 2: Write the failing action test**

```ts
// __tests__/actions/compliance.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ uid: 'u1', role: 'staff', event_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ uid: 'a1', role: 'admin', event_access: {} }),
}))
vi.mock('@/lib/ops/compliance', () => ({
  listComplianceDocsCore: vi.fn().mockResolvedValue([]),
  createComplianceDocCore: vi.fn().mockResolvedValue({}),
  updateComplianceDocCore: vi.fn().mockResolvedValue(undefined),
  deleteComplianceDocCore: vi.fn().mockResolvedValue(undefined),
}))

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { listComplianceDocs, createComplianceDoc, updateComplianceDoc, deleteComplianceDoc } from '@/actions/compliance'

beforeEach(() => vi.clearAllMocks())

describe('compliance actions', () => {
  it('reads gate on org membership', async () => {
    await listComplianceDocs('o1')
    expect(assertOrgMember).toHaveBeenCalledWith('o1')
  })

  it('writes gate on org admin', async () => {
    await createComplianceDoc('o1', { name: 'Permit' })
    await updateComplianceDoc('o1', 'cd1', { notes: 'x' })
    await deleteComplianceDoc('o1', 'cd1')
    expect(assertOrgAdmin).toHaveBeenCalledTimes(3)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/ops/compliance.test.ts __tests__/actions/compliance.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

Append to `lib/types.ts` after the ops section:

```ts
// ── Compliance tracker (spec 2026-08-05 §4.3 — thin, org-configurable) ──

export interface ComplianceDoc {
  id: string
  name: string          // 'Health permit', 'Liability insurance'
  expires_on?: string   // ISO date (YYYY-MM-DD); absent = no expiry
  link_url?: string     // where the document lives (drive, city portal…)
  notes?: string
  created_at: string
  updated_at?: string
}
```

Create `lib/ops/compliance.ts` (mirror `lib/ops/resources.ts` exactly):

```ts
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { ComplianceDoc } from '@/lib/types'

export interface CreateComplianceDocInput {
  name: string
  expires_on?: string
  link_url?: string
  notes?: string
}

export interface ComplianceDocUpdate {
  name?: string
  expires_on?: string | null
  link_url?: string | null
  notes?: string | null
}

export function complianceDocsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('compliance_docs')
}

export async function listComplianceDocsCore(orgId: string): Promise<ComplianceDoc[]> {
  const snap = await complianceDocsRef(orgId).orderBy('name').get()
  return snap.docs.map((d) => d.data() as ComplianceDoc)
}

/** Guard-free create. Validates name; performs no auth. */
export async function createComplianceDocCore(orgId: string, input: CreateComplianceDocInput): Promise<ComplianceDoc> {
  if (!input.name?.trim()) throw new Error('Name is required')
  const ref = complianceDocsRef(orgId).doc()
  const doc: ComplianceDoc = {
    id: ref.id,
    name: input.name.trim(),
    ...(input.expires_on !== undefined ? { expires_on: input.expires_on } : {}),
    ...(input.link_url !== undefined ? { link_url: input.link_url } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    created_at: new Date().toISOString(),
  }
  await ref.set(doc)
  return doc
}

/** Guard-free update. undefined = untouched; null = delete the field. */
export async function updateComplianceDocCore(orgId: string, docId: string, updates: ComplianceDocUpdate): Promise<void> {
  if (updates.name !== undefined && !updates.name.trim()) throw new Error('Name is required')
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  await complianceDocsRef(orgId).doc(docId).update({ ...cleaned, updated_at: new Date().toISOString() })
}

export async function deleteComplianceDocCore(orgId: string, docId: string): Promise<void> {
  await complianceDocsRef(orgId).doc(docId).delete()
}

/** Pure. Docs whose expiry falls on or before `byDate` (YYYY-MM-DD). No-expiry docs never match. */
export function expiringDocs(docs: ComplianceDoc[], byDate: string): ComplianceDoc[] {
  return docs.filter((d) => d.expires_on !== undefined && d.expires_on <= byDate)
}
```

Create `actions/compliance.ts`:

```ts
'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import {
  listComplianceDocsCore, createComplianceDocCore, updateComplianceDocCore, deleteComplianceDocCore,
  type CreateComplianceDocInput, type ComplianceDocUpdate,
} from '@/lib/ops/compliance'
import type { ComplianceDoc } from '@/lib/types'

export async function listComplianceDocs(orgId: string): Promise<ComplianceDoc[]> {
  await assertOrgMember(orgId)
  return listComplianceDocsCore(orgId)
}

export async function createComplianceDoc(orgId: string, input: CreateComplianceDocInput): Promise<ComplianceDoc> {
  await assertOrgAdmin(orgId)
  return createComplianceDocCore(orgId, input)
}

export async function updateComplianceDoc(orgId: string, docId: string, updates: ComplianceDocUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  return updateComplianceDocCore(orgId, docId, updates)
}

export async function deleteComplianceDoc(orgId: string, docId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  return deleteComplianceDocCore(orgId, docId)
}
```

- [ ] **Step 5: Run tests to verify they pass, then build and commit**

Run: `npx vitest run __tests__/lib/ops/compliance.test.ts __tests__/actions/compliance.test.ts` — expected PASS.
Run: `npm run build` — new `'use server'` module must compile.

```bash
git add lib/types.ts lib/ops/compliance.ts actions/compliance.ts __tests__/lib/ops/compliance.test.ts __tests__/actions/compliance.test.ts
git commit -m "feat(ops): compliance document model, cores, and actions"
```

---

### Task 12: Compliance screen + expiry warnings on the Ops tab

**Files:**
- Create: `app/(admin)/[orgSlug]/compliance/page.tsx`
- Create: `components/admin/ops/ComplianceClient.tsx`
- Modify: `app/(admin)/[orgSlug]/[eventSlug]/ops/page.tsx` (wire real `complianceWarnings`)
- Test: `__tests__/components/admin/ops/ComplianceClient.test.tsx`

**Interfaces:**
- Consumes: Task 11 actions + `expiringDocs`/`listComplianceDocsCore` cores; `requireOrgMember`.
- Produces: `ComplianceClient({ orgId, isAdmin, docs }: { orgId: string; isAdmin: boolean; docs: ComplianceDoc[] })`; the Ops page passes `complianceWarnings = expiringDocs(docs, event.event_start.slice(0, 10)).map((d) => ({ name: d.name, expires_on: d.expires_on! }))`.
- Status rule (single source in the component): `expired` if `expires_on < today`; `expiring soon` if within 30 days; otherwise `valid`; no-expiry docs show `—`.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/admin/ops/ComplianceClient.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/compliance', () => ({
  createComplianceDoc: vi.fn().mockImplementation(async (_o: string, input: object) => ({
    id: 'cd-new', created_at: '2026-08-05T00:00:00.000Z', ...input,
  })),
  updateComplianceDoc: vi.fn().mockResolvedValue(undefined),
  deleteComplianceDoc: vi.fn().mockResolvedValue(undefined),
}))

import { createComplianceDoc, deleteComplianceDoc } from '@/actions/compliance'
import { ComplianceClient } from '@/components/admin/ops/ComplianceClient'
import type { ComplianceDoc } from '@/lib/types'

const expired: ComplianceDoc = { id: '1', name: 'Health permit', expires_on: '2000-01-01', created_at: 'x' }
const valid: ComplianceDoc = { id: '2', name: 'Liability insurance', expires_on: '2999-01-01', created_at: 'x' }
const noExpiry: ComplianceDoc = { id: '3', name: 'Food handler card', created_at: 'x' }

beforeEach(() => vi.clearAllMocks())

describe('ComplianceClient', () => {
  it('badges expired / valid / no-expiry docs', () => {
    render(<ComplianceClient orgId="o1" isAdmin docs={[expired, valid, noExpiry]} />)
    expect(screen.getByText('expired')).toBeInTheDocument()
    expect(screen.getByText('valid')).toBeInTheDocument()
    expect(screen.getByText('Food handler card')).toBeInTheDocument()
  })

  it('creates a document', async () => {
    render(<ComplianceClient orgId="o1" isAdmin docs={[]} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fire cert' } })
    fireEvent.change(screen.getByLabelText('Expires on'), { target: { value: '2026-12-31' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add document' }))
    await waitFor(() => expect(createComplianceDoc).toHaveBeenCalledWith('o1', {
      name: 'Fire cert', expires_on: '2026-12-31',
    }))
    expect(await screen.findByText('Fire cert')).toBeInTheDocument()
  })

  it('deletes after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ComplianceClient orgId="o1" isAdmin docs={[valid]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Liability insurance' }))
    await waitFor(() => expect(deleteComplianceDoc).toHaveBeenCalledWith('o1', '2'))
  })

  it('hides write controls for non-admins', () => {
    render(<ComplianceClient orgId="o1" isAdmin={false} docs={[valid]} />)
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/admin/ops/ComplianceClient.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`app/(admin)/[orgSlug]/compliance/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { requireOrgMember } from '@/lib/auth/guards'
import { listComplianceDocs } from '@/actions/compliance'
import { ComplianceClient } from '@/components/admin/ops/ComplianceClient'

export default async function CompliancePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { orgId, member } = await requireOrgMember(orgSlug)
  const docs = await listComplianceDocs(orgId)
  return (
    <ComplianceClient
      orgId={orgId}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
      docs={docs}
    />
  )
}
```

`components/admin/ops/ComplianceClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createComplianceDoc, updateComplianceDoc, deleteComplianceDoc } from '@/actions/compliance'
import type { ComplianceDoc } from '@/lib/types'

interface ComplianceClientProps {
  orgId: string
  isAdmin: boolean
  docs: ComplianceDoc[]
}

const THIRTY_DAYS = 30 * 86_400_000

function status(d: ComplianceDoc, today: string): { label: string; variant: 'destructive' | 'secondary' } | null {
  if (d.expires_on === undefined) return null
  if (d.expires_on < today) return { label: 'expired', variant: 'destructive' }
  const soonCutoff = new Date(new Date(`${today}T00:00:00Z`).getTime() + THIRTY_DAYS).toISOString().slice(0, 10)
  if (d.expires_on <= soonCutoff) return { label: 'expiring soon', variant: 'destructive' }
  return { label: 'valid', variant: 'secondary' }
}

export function ComplianceClient({ orgId, isAdmin, docs: initial }: ComplianceClientProps) {
  const [docs, setDocs] = useState(initial)
  const [name, setName] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  async function handleAdd() {
    if (!name.trim()) return
    setSaving(true); setError(null)
    try {
      const created = await createComplianceDoc(orgId, {
        name: name.trim(),
        ...(expiresOn ? { expires_on: expiresOn } : {}),
        ...(linkUrl.trim() ? { link_url: linkUrl.trim() } : {}),
      })
      setDocs((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setName(''); setExpiresOn(''); setLinkUrl('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  async function handleExpiryChange(d: ComplianceDoc, value: string) {
    try {
      await updateComplianceDoc(orgId, d.id, { expires_on: value || null })
      setDocs((prev) => prev.map((x) => (x.id === d.id ? { ...x, expires_on: value || undefined } : x)))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  async function handleDelete(d: ComplianceDoc) {
    if (!confirm(`Delete ${d.name}?`)) return
    setSaving(true); setError(null)
    try {
      await deleteComplianceDoc(orgId, d.id)
      setDocs((prev) => prev.filter((x) => x.id !== d.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Compliance</h1>
      <p className="text-sm text-gray-500 mb-4">Permits, insurance, certifications. Documents expiring before an event warn on that event&apos;s ops screen.</p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2">Document</th><th>Expires</th><th>Status</th><th />
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const s = status(d, today)
            return (
              <tr key={d.id} className="border-b last:border-0">
                <td className="py-2 font-medium">
                  {d.link_url ? <a href={d.link_url} target="_blank" rel="noreferrer" className="underline">{d.name}</a> : d.name}
                </td>
                <td>
                  {isAdmin ? (
                    <Input aria-label={`Expiry for ${d.name}`} type="date" className="w-40"
                      defaultValue={d.expires_on ?? ''} onBlur={(e) => handleExpiryChange(d, e.target.value)} />
                  ) : (d.expires_on ?? '—')}
                </td>
                <td>{s ? <Badge variant={s.variant}>{s.label}</Badge> : '—'}</td>
                <td className="text-right">
                  {isAdmin && (
                    <Button variant="ghost" size="sm" aria-label={`Delete ${d.name}`} disabled={saving} onClick={() => handleDelete(d)}>
                      Delete
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
          {docs.length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-gray-500">No documents tracked yet.</td></tr>
          )}
        </tbody>
      </table>

      {isAdmin && (
        <div className="flex items-end gap-3 flex-wrap border-t pt-4 mt-4">
          <div>
            <Label htmlFor="cd-name">Name</Label>
            <Input id="cd-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cd-expiry">Expires on</Label>
            <Input id="cd-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cd-link">Link (optional)</Label>
            <Input id="cd-link" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          </div>
          <Button onClick={handleAdd} disabled={saving || !name.trim()}>Add document</Button>
        </div>
      )}
    </div>
  )
}
```

Wire warnings into `app/(admin)/[orgSlug]/[eventSlug]/ops/page.tsx` — add imports and replace `complianceWarnings={[]}`:

```tsx
import { listComplianceDocsCore, expiringDocs } from '@/lib/ops/compliance'
```

```tsx
  const [plan, issues, packages, complianceDocs] = await Promise.all([
    getOpsPlan(orgId, eventId),
    listIssues(orgId, eventId),
    listWorkPackages(orgId),
    listComplianceDocsCore(orgId),
  ])
  const complianceWarnings = expiringDocs(complianceDocs, event.event_start.slice(0, 10))
    .map((d) => ({ name: d.name, expires_on: d.expires_on! }))
```

…and pass `complianceWarnings={complianceWarnings}`.

- [ ] **Step 4: Run tests, build, commit**

Run: `npx vitest run __tests__/components/admin/ops/ComplianceClient.test.tsx` — expected PASS.
Run: `npm run build`.

```bash
git add "app/(admin)/[orgSlug]/compliance" "app/(admin)/[orgSlug]/[eventSlug]/ops/page.tsx" components/admin/ops/ComplianceClient.tsx __tests__/components/admin/ops/ComplianceClient.test.tsx
git commit -m "feat(ops): compliance tracker screen with expiry warnings on the ops tab"
```

---

### Task 13: Closeout screen

**Files:**
- Create: `app/(admin)/[orgSlug]/[eventSlug]/ops/closeout/page.tsx`
- Create: `components/admin/ops/CloseoutClient.tsx`
- Test: `__tests__/components/admin/ops/CloseoutClient.test.tsx`

**Interfaces:**
- Consumes: `getCloseout`, `saveActuals`, `getCloseoutSummary`, `completeCloseout` (actions/event-ops); `formatMoney`; Task 14 adds the invoice section to this component.
- Produces: `CloseoutClient(props: CloseoutClientProps)` with

  ```ts
  interface CloseoutClientProps {
    orgId: string
    eventId: string
    orgSlug: string
    isAdmin: boolean
    eventName: string
    plan: OpsPlan
    closeout: OpsCloseout | null
    summary: CloseoutSummary | null   // null when the server-side summary call failed
    summaryError: string | null       // e.g. 'Package no longer exists: p9'
    leads: Lead[]                     // for Task 14's invoice section; pass [] until then
  }
  ```
- Flow: guided actuals (consumable rows pre-filled from the shopping list quantities, hours, sales, waste notes) → Save actuals → summary table (planned vs actual cost, revenue, margins — all `formatMoney`) → Complete closeout (admin-only; core rejects until actuals are recorded; the event is not "complete" until this is done — spec §3.5).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/admin/ops/CloseoutClient.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const summary = {
  planned_consumable_cost: 20.625, actual_consumable_cost: 24.75,
  revenue: 1050, planned_margin: 1029.375, actual_margin: 1025.25,
}

vi.mock('@/actions/event-ops', () => ({
  saveActuals: vi.fn().mockResolvedValue(undefined),
  getCloseoutSummary: vi.fn().mockResolvedValue({
    planned_consumable_cost: 20.625, actual_consumable_cost: 24.75,
    revenue: 1050, planned_margin: 1029.375, actual_margin: 1025.25,
  }),
  completeCloseout: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/actions/invoices', () => ({
  generateCloseoutInvoice: vi.fn().mockResolvedValue({ id: 'inv1' }),
}))

import { saveActuals, completeCloseout } from '@/actions/event-ops'
import { CloseoutClient } from '@/components/admin/ops/CloseoutClient'
import type { OpsPlan } from '@/lib/types'

const plan: OpsPlan = {
  package_ids: ['p1'], requirements: { guests: 50 },
  deadlines: [],
  shopping_list: [{ resource_id: 'r1', name: 'Espresso beans', qty: 37.5, unit: 'oz', checked: true }],
  packing_list: [], checklists: [],
  needs_review: false, change_log: [], created_at: '2026-08-01T00:00:00.000Z',
}

const base = {
  orgId: 'o1', eventId: 'e1', orgSlug: 'acme', isAdmin: true, eventName: 'Nguyen Wedding',
  plan, closeout: null, summary, summaryError: null, leads: [],
}

beforeEach(() => vi.clearAllMocks())

describe('CloseoutClient', () => {
  it('pre-fills consumable actuals from the shopping list and saves them', async () => {
    render(<CloseoutClient {...base} />)
    const qty = screen.getByLabelText('Actual Espresso beans used')
    expect(qty).toHaveValue(37.5)
    fireEvent.change(qty, { target: { value: '41' } })
    fireEvent.change(screen.getByLabelText('Hours worked'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Tips & on-site sales ($)'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save actuals' }))
    await waitFor(() => expect(saveActuals).toHaveBeenCalledWith('o1', 'e1', {
      consumables: [{ resource_id: 'r1', qty_used: 41 }],
      hours_worked: 6,
      sales: 150,
    }))
  })

  it('renders the margin summary with display rounding', () => {
    render(<CloseoutClient {...base} />)
    expect(screen.getByText('$20.63')).toBeInTheDocument()   // planned cost
    expect(screen.getByText('$1025.25')).toBeInTheDocument() // actual margin
  })

  it('surfaces a summary error actionably', () => {
    render(<CloseoutClient {...base} summary={null} summaryError="Package no longer exists: p9" />)
    expect(screen.getByText(/package no longer exists/i)).toBeInTheDocument()
    expect(screen.getByText(/restore it in the catalog/i)).toBeInTheDocument()
  })

  it('completes closeout as admin once actuals exist', async () => {
    render(<CloseoutClient {...base} closeout={{ actuals: { hours_worked: 6 }, completed: false, created_at: 'x' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Complete closeout' }))
    await waitFor(() => expect(completeCloseout).toHaveBeenCalledWith('o1', 'e1'))
    expect(screen.getByText(/closeout complete/i)).toBeInTheDocument()
  })

  it('hides Complete closeout from non-admins', () => {
    render(<CloseoutClient {...base} isAdmin={false} closeout={{ actuals: { hours_worked: 6 }, completed: false, created_at: 'x' }} />)
    expect(screen.queryByRole('button', { name: 'Complete closeout' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/admin/ops/CloseoutClient.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`app/(admin)/[orgSlug]/[eventSlug]/ops/closeout/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireEventPage } from '@/lib/auth/guards'
import { getOpsPlan, getCloseout, getCloseoutSummary } from '@/actions/event-ops'
import { CloseoutClient } from '@/components/admin/ops/CloseoutClient'
import type { CloseoutSummary } from '@/lib/types'

export default async function CloseoutPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event, member } = await requireEventPage(orgSlug, eventSlug, 'ops')
  const plan = await getOpsPlan(orgId, eventId)
  if (!plan) redirect(`/${orgSlug}/${eventSlug}/ops`)

  const closeout = await getCloseout(orgId, eventId)
  let summary: CloseoutSummary | null = null
  let summaryError: string | null = null
  try {
    summary = await getCloseoutSummary(orgId, eventId)
  } catch (err: unknown) {
    summaryError = err instanceof Error ? err.message : 'Failed to compute summary'
  }

  return (
    <CloseoutClient
      orgId={orgId}
      eventId={eventId}
      orgSlug={orgSlug}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
      eventName={event.name}
      plan={plan}
      closeout={closeout}
      summary={summary}
      summaryError={summaryError}
      leads={[]}
    />
  )
}
```

(`leads` gets real data in Task 14.)

`components/admin/ops/CloseoutClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveActuals, getCloseoutSummary, completeCloseout } from '@/actions/event-ops'
import { formatMoney } from '@/lib/utils'
import type { OpsPlan, OpsCloseout, CloseoutSummary, Lead } from '@/lib/types'

export interface CloseoutClientProps {
  orgId: string
  eventId: string
  orgSlug: string
  isAdmin: boolean
  eventName: string
  plan: OpsPlan
  closeout: OpsCloseout | null
  summary: CloseoutSummary | null
  summaryError: string | null
  leads: Lead[]
}

export function CloseoutClient(props: CloseoutClientProps) {
  const { orgId, eventId, plan } = props
  const saved = props.closeout?.actuals
  const savedQty = new Map((saved?.consumables ?? []).map((c) => [c.resource_id, c.qty_used]))

  const [qtyUsed, setQtyUsed] = useState<Record<string, string>>(
    Object.fromEntries(plan.shopping_list.map((i) => [i.resource_id, String(savedQty.get(i.resource_id) ?? i.qty)]))
  )
  const [hours, setHours] = useState(saved?.hours_worked !== undefined ? String(saved.hours_worked) : '')
  const [sales, setSales] = useState(saved?.sales !== undefined ? String(saved.sales) : '')
  const [waste, setWaste] = useState(saved?.waste_notes ?? '')
  const [summary, setSummary] = useState(props.summary)
  const [completed, setCompleted] = useState(props.closeout?.completed ?? false)
  const [hasActuals, setHasActuals] = useState(
    !!saved && ((saved.consumables?.length ?? 0) > 0 || saved.hours_worked !== undefined || saved.sales !== undefined || saved.waste_notes !== undefined)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSaveActuals() {
    setSaving(true); setError(null)
    try {
      await saveActuals(orgId, eventId, {
        consumables: plan.shopping_list
          .filter((i) => qtyUsed[i.resource_id] !== '')
          .map((i) => ({ resource_id: i.resource_id, qty_used: Number(qtyUsed[i.resource_id]) })),
        ...(hours !== '' ? { hours_worked: Number(hours) } : {}),
        ...(sales !== '' ? { sales: Number(sales) } : {}),
        ...(waste.trim() ? { waste_notes: waste.trim() } : {}),
      })
      setHasActuals(true)
      setSummary(await getCloseoutSummary(orgId, eventId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleComplete() {
    setSaving(true); setError(null)
    try {
      await completeCloseout(orgId, eventId)
      setCompleted(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to complete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Closeout — {props.eventName}</h1>
        {completed && <p className="text-sm font-medium text-green-700 mt-1">Closeout complete.</p>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Record actuals</CardTitle>
          <p className="text-sm text-gray-500">Pre-filled with planned quantities — adjust to what you actually used.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {plan.shopping_list.map((i) => (
            <div key={i.resource_id} className="flex items-center gap-2">
              <span className="text-sm w-56">{i.name}</span>
              <Input
                aria-label={`Actual ${i.name} used`}
                type="number" step="0.01" className="w-28"
                value={qtyUsed[i.resource_id] ?? ''}
                onChange={(e) => setQtyUsed((prev) => ({ ...prev, [i.resource_id]: e.target.value }))}
              />
              <span className="text-xs text-gray-500">{i.unit ?? ''} (planned {i.qty})</span>
            </div>
          ))}
          <div className="flex gap-3 flex-wrap">
            <div>
              <Label htmlFor="co-hours">Hours worked</Label>
              <Input id="co-hours" type="number" step="0.25" className="w-28" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-sales">Tips &amp; on-site sales ($)</Label>
              <Input id="co-sales" type="number" step="0.01" className="w-36" value={sales} onChange={(e) => setSales(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="co-waste">Waste notes</Label>
            <Input id="co-waste" value={waste} onChange={(e) => setWaste(e.target.value)} />
          </div>
          <Button onClick={handleSaveActuals} disabled={saving}>Save actuals</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2 · Margin vs plan</CardTitle></CardHeader>
        <CardContent>
          {props.summaryError && !summary ? (
            <div className="text-sm text-red-700">
              <p className="font-medium">{props.summaryError}</p>
              <p className="mt-1">
                A package on this plan was deleted from the catalog. Restore it in the catalog (same name and lines)
                or contact support — the summary can&apos;t be computed without it.
              </p>
            </div>
          ) : summary ? (
            <table className="text-sm w-full max-w-md">
              <tbody>
                <tr><td className="py-1 text-gray-500">Revenue (packages + sales)</td><td className="text-right font-medium">{formatMoney(summary.revenue)}</td></tr>
                <tr><td className="py-1 text-gray-500">Planned consumable cost</td><td className="text-right">{formatMoney(summary.planned_consumable_cost)}</td></tr>
                <tr><td className="py-1 text-gray-500">Actual consumable cost</td><td className="text-right">{formatMoney(summary.actual_consumable_cost)}</td></tr>
                <tr className="border-t"><td className="py-1 text-gray-500">Planned margin</td><td className="text-right">{formatMoney(summary.planned_margin)}</td></tr>
                <tr><td className="py-1 font-medium">Actual margin</td><td className="text-right font-bold">{formatMoney(summary.actual_margin)}</td></tr>
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-500">Save actuals to see the margin summary.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3 · Complete</CardTitle>
          <p className="text-sm text-gray-500">The event isn&apos;t complete until closeout is done.</p>
        </CardHeader>
        <CardContent>
          {props.isAdmin && !completed && (
            <Button onClick={handleComplete} disabled={saving || !hasActuals}>Complete closeout</Button>
          )}
          {!props.isAdmin && !completed && <p className="text-sm text-gray-500">An admin completes the closeout.</p>}
          {completed && <p className="text-sm text-green-700">Done. Generate the final invoice below.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
```

(Task 14 appends the invoice card after "3 · Complete".)

- [ ] **Step 4: Run test, build, commit**

Run: `npx vitest run __tests__/components/admin/ops/CloseoutClient.test.tsx` — expected PASS.
Run: `npm run build`.

```bash
git add "app/(admin)/[orgSlug]/[eventSlug]/ops/closeout" components/admin/ops/CloseoutClient.tsx __tests__/components/admin/ops/CloseoutClient.test.tsx
git commit -m "feat(ops): guided closeout screen with actuals and margin-vs-plan"
```

---

### Task 14: Generate final invoice from closeout

**Files:**
- Modify: `actions/invoices.ts`
- Modify: `app/(admin)/[orgSlug]/[eventSlug]/ops/closeout/page.tsx` (load leads)
- Modify: `components/admin/ops/CloseoutClient.tsx` (invoice section)
- Test: `__tests__/actions/closeout-invoice.test.ts`, extend `__tests__/components/admin/ops/CloseoutClient.test.tsx`

**Interfaces:**
- Consumes: `createInvoiceCore` (lib/crm/invoices), `getCloseoutCore` (lib/ops/closeout), `getOpsPlanCore` (lib/ops/event-ops), `getWorkPackagesByIdsCore` (lib/ops/work-packages), `getLead` (actions/leads), `adminDb`, `listLeads` (actions/leads) for the picker.
- Produces: `generateCloseoutInvoice(orgId: string, eventId: string, leadId: string): Promise<Invoice>` in `actions/invoices.ts` — admin-gated; requires completed closeout; line items are one row per plan package (`description: package.name, quantity: 1, unit_price: package.price`), `type: 'final'`, `title: 'Final invoice — {event.name}'`. Margin/cost numbers NEVER appear on the invoice (customer-facing).
- Event↔lead linkage does not exist yet (that's the proposals convert-to-work seam), so the UI offers a lead picker over `listLeads`. When convert-to-work lands, it can pre-select.

- [ ] **Step 1: Write the failing action test**

```ts
// __tests__/actions/closeout-invoice.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ uid: 'u1', role: 'staff', event_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ uid: 'a1', role: 'admin', event_access: {} }),
}))
vi.mock('@/lib/ops/closeout', () => ({
  getCloseoutCore: vi.fn().mockResolvedValue({ actuals: { hours_worked: 6 }, completed: true, created_at: 'x' }),
}))
vi.mock('@/lib/ops/event-ops', () => ({
  getOpsPlanCore: vi.fn().mockResolvedValue({ package_ids: ['p1', 'p2'], requirements: { guests: 50 } }),
}))
vi.mock('@/lib/ops/work-packages', () => ({
  getWorkPackagesByIdsCore: vi.fn().mockResolvedValue([
    { id: 'p1', name: 'Espresso Bar', price: 900, lines: [] },
    { id: 'p2', name: 'Cold Brew Add-on', price: 150, lines: [] },
  ]),
}))
vi.mock('@/lib/crm/invoices', () => ({
  invoicesRef: vi.fn(),
  listInvoicesCore: vi.fn(),
  createInvoiceCore: vi.fn().mockResolvedValue({ id: 'inv1' }),
  generateFromProposalCore: vi.fn(),
  recordPaymentCore: vi.fn(),
  issueInvoiceCore: vi.fn(),
}))
vi.mock('@/actions/leads', () => ({
  getLead: vi.fn().mockResolvedValue({ id: 'l1', name: 'Dana', customer_id: 'cust1' }),
}))
vi.mock('@/actions/proposals', () => ({ getProposal: vi.fn() }))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ name: 'Nguyen Wedding' }) }) }),
        }),
      }),
    }),
  },
}))

import { assertOrgAdmin } from '@/lib/auth/assert'
import { getCloseoutCore } from '@/lib/ops/closeout'
import { createInvoiceCore } from '@/lib/crm/invoices'
import { generateCloseoutInvoice } from '@/actions/invoices'

beforeEach(() => vi.clearAllMocks())

describe('generateCloseoutInvoice', () => {
  it('creates a final invoice with one line per package', async () => {
    const inv = await generateCloseoutInvoice('o1', 'e1', 'l1')
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(createInvoiceCore).toHaveBeenCalledWith('o1', 'l1', {
      type: 'final',
      title: 'Final invoice — Nguyen Wedding',
      line_items: [
        { description: 'Espresso Bar', quantity: 1, unit_price: 900 },
        { description: 'Cold Brew Add-on', quantity: 1, unit_price: 150 },
      ],
      customer_id: 'cust1',
    })
    expect(inv).toEqual({ id: 'inv1' })
  })

  it('refuses when closeout is not complete', async () => {
    vi.mocked(getCloseoutCore).mockResolvedValueOnce({ actuals: {}, completed: false, created_at: 'x' })
    await expect(generateCloseoutInvoice('o1', 'e1', 'l1')).rejects.toThrow('Complete closeout before generating the final invoice')
  })
})
```

Note: `__tests__/actions/invoices.test.ts` already mocks this action module's deps — putting this in its own file avoids fighting its existing mock graph; copy any additional module mocks the import chain demands from there.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/actions/closeout-invoice.test.ts`
Expected: FAIL — `generateCloseoutInvoice` not exported.

- [ ] **Step 3: Implement the action**

In `actions/invoices.ts` add imports:

```ts
import { adminDb } from '@/lib/firebase-admin'
import { getCloseoutCore } from '@/lib/ops/closeout'
import { getOpsPlanCore } from '@/lib/ops/event-ops'
import { getWorkPackagesByIdsCore } from '@/lib/ops/work-packages'
import type { Event } from '@/lib/types'
```

and the action (after `generateFromProposal`):

```ts
/**
 * Closeout → invoicing seam (spec §4.4). Bills the plan's packages at catalog
 * price. Margin/cost numbers are internal and never appear on the invoice.
 * Event↔lead linkage doesn't exist yet, so the caller picks the lead.
 */
export async function generateCloseoutInvoice(orgId: string, eventId: string, leadId: string): Promise<Invoice> {
  await assertOrgAdmin(orgId)

  const closeout = await getCloseoutCore(orgId, eventId)
  if (!closeout?.completed) throw new Error('Complete closeout before generating the final invoice')

  const plan = await getOpsPlanCore(orgId, eventId)
  if (!plan) throw new Error('No ops plan for this event')

  const packages = await getWorkPackagesByIdsCore(orgId, plan.package_ids)
  const found = new Set(packages.map((p) => p.id))
  for (const id of plan.package_ids) {
    if (!found.has(id)) throw new Error(`Package no longer exists: ${id}`)
  }

  const eventSnap = await adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId).get()
  if (!eventSnap.exists) throw new Error('Event not found')
  const event = eventSnap.data() as Event

  const lead = await getLead(orgId, leadId)
  return createInvoiceCore(orgId, leadId, {
    type: 'final',
    title: `Final invoice — ${event.name}`,
    line_items: packages.map((p) => ({ description: p.name, quantity: 1, unit_price: p.price })),
    customer_id: lead?.customer_id,
  })
}
```

- [ ] **Step 4: Run action test to verify it passes**

Run: `npx vitest run __tests__/actions/closeout-invoice.test.ts __tests__/actions/invoices.test.ts`
Expected: both PASS (the second confirms no mock-graph regression).

- [ ] **Step 5: Wire the UI**

`ops/closeout/page.tsx` — add `import { listLeads } from '@/actions/leads'`, load `const leads = await listLeads(orgId)` alongside the other fetches, pass `leads={leads}`.

`CloseoutClient.tsx` — add to imports: `useRouter` from `next/navigation`, `generateCloseoutInvoice` from `@/actions/invoices`. Add state `const [leadId, setLeadId] = useState('')` and `const router = useRouter()`, plus:

```tsx
async function handleGenerateInvoice() {
  setSaving(true); setError(null)
  try {
    await generateCloseoutInvoice(orgId, eventId, leadId)
    router.push(`/${props.orgSlug}/leads/${leadId}/invoices`)
  } catch (err: unknown) {
    setError(err instanceof Error ? err.message : 'Failed to generate invoice')
    setSaving(false)
  }
}
```

Append a fourth card (renders only when `completed && props.isAdmin`):

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">4 · Generate final invoice</CardTitle>
    <p className="text-sm text-gray-500">One line per package at catalog price, as a draft in the invoicing module. Margin numbers stay internal.</p>
  </CardHeader>
  <CardContent className="flex items-end gap-2">
    <div>
      <Label htmlFor="co-lead">Bill to</Label>
      <select id="co-lead" value={leadId} onChange={(e) => setLeadId(e.target.value)}
        className="block h-9 rounded-md border border-gray-300 px-2 text-sm min-w-48">
        <option value="">Pick a client…</option>
        {props.leads.map((l) => <option key={l.id} value={l.id}>{l.name}{l.organization ? ` — ${l.organization}` : ''}</option>)}
      </select>
    </div>
    <Button onClick={handleGenerateInvoice} disabled={saving || !leadId}>Generate final invoice</Button>
  </CardContent>
</Card>
```

Extend `__tests__/components/admin/ops/CloseoutClient.test.tsx`:

```tsx
  it('generates the final invoice for the picked lead and navigates to it', async () => {
    const { generateCloseoutInvoice } = await import('@/actions/invoices')
    render(<CloseoutClient {...base}
      closeout={{ actuals: { hours_worked: 6 }, completed: true, created_at: 'x' }}
      leads={[{ id: 'l1', name: 'Dana', stage: 'won', created_at: 'x' }]} />)
    fireEvent.change(screen.getByLabelText('Bill to'), { target: { value: 'l1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate final invoice' }))
    await waitFor(() => expect(generateCloseoutInvoice).toHaveBeenCalledWith('o1', 'e1', 'l1'))
  })
```

(Mock `next/navigation`'s `useRouter` at the top of that test file: `vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))`.)

- [ ] **Step 6: Run all touched tests, build, commit**

Run: `npx vitest run __tests__/actions/closeout-invoice.test.ts __tests__/components/admin/ops/CloseoutClient.test.tsx`
Expected: PASS.
Run: `npm run build` — REQUIRED: `actions/invoices.ts` is `'use server'`; confirm no type re-export snuck in.

```bash
git add actions/invoices.ts "app/(admin)/[orgSlug]/[eventSlug]/ops/closeout/page.tsx" components/admin/ops/CloseoutClient.tsx __tests__/actions/closeout-invoice.test.ts __tests__/components/admin/ops/CloseoutClient.test.tsx
git commit -m "feat(ops): generate final invoice from completed closeout"
```

---

### Task 15: Full verification pass

**Files:** none new — verification only.

- [ ] **Step 1: Full test suite from the worktree root**

Run: `npm run test`
Expected: all green (baseline suites plus every test added by Tasks 1–14). Any pre-existing failure unrelated to this plan: STOP and report, don't paper over.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: clean. This is the gate that catches `'use server'` type re-exports and client-bundle leaks of admin-SDK modules (`lib/ops/checklist-templates` via the catalog page, `lib/ops/compliance` via the ops page — both must only be imported by server components; the client imports only `lib/ops/derive` and `lib/ops/readiness`).

- [ ] **Step 3: Manual spec walk (spec §8 success criterion)**

With `npm run dev` and a coffee-cart org, walk the chain end-to-end: create resources → build a package with a per-guest consumable line and attached checklist → event → Event Ops tab → set up plan (packages + guests) → verify shopping list quantities, deadlines, checklists → change guests, verify needs-review banner + re-derived quantities + change log entry → acknowledge → complete a photo-evidence step (real upload) → log and resolve an issue → add a compliance doc expiring before the event, verify the ops-tab warning → closeout: actuals → margin table → complete → generate final invoice → confirm the draft invoice under the lead.

- [ ] **Step 4: Commit any fixes and push**

```bash
git push -u origin claude/beverage-mvp-screens-plan-dbab6c
```

---

## Deferred-items ledger (carried forward, deliberate)

- change_log is unbounded (1MB plan-doc budget) — cap before events accumulate hundreds of edits. Not addressed here.
- No re-instantiate / change-packages path post-instantiation; wizard copy warns. Requires design (handoff known gap).
- `notes` clears to `''`, not absent (no null channel in `updateOpsRequirementsCore`).
- Package deletion can't be hard-blocked when in use (no reverse index); strong warning copy instead. A `collectionGroup('ops')` + `array-contains` index is the future fix.
- Evidence photos are public-by-obscure-URL (`makePublic`). Revisit before verticals with sensitive evidence.
- Built-in checklist override (same-id org copy) has merge support in `getTemplatesForOrg` but no UI (`createChecklistTemplateCore` auto-generates ids).
- Event↔lead linkage for the final invoice is a manual picker until proposals convert-to-work lands.
- Spec §4.1's "packages flow into the existing proposal flow" (package-derived proposal line items, and convert-to-work calling `instantiateOpsPlanCore` with the accepted packages) belongs to the proposals workstream (`claude/proposals` worktree, convert-to-work increment) — deliberately NOT in this plan. Until it lands, the ops wizard's manual package pick is the entry path.
