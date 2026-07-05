# Business-First Navigation + Org-Wide Roll-Up Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the camp-first admin sidebar with a **business-first, categorized, workflow-ordered** navigation, and add the six org-wide roll-up pages it references. Also fixes the doubled-sidebar bug on camp routes.

**Sidebar IA (workspace view, top→bottom):**
- **SALES** — Pipeline (`/leads`) · Clients (`/clients`) · Proposals (`/proposals`) · Contracts (`/contracts`) · Invoices (`/invoices`)
- **EVENTS** — Events (`/` org home) · Registrants (`/registrants`) · Vendors (`/vendors`) · Calendar (`/calendar`)
- **INSIGHTS** — Reports (`/reports`)
- **SETTINGS** (collapsible) — Members · Permissions · Billing (`/billing`) · Email domain · Event types · Departments
- account / Sign out (bottom)

Inside an event, the sidebar becomes the **contextual event nav** (Dashboard/Registrants/Assignments/… by event type) with a **← Events** back link — no stacked org nav (this is the doubling fix).

**Architecture:** New org-wide list actions read the existing flat subcollections (`orgs/{orgId}/{proposals|contracts|invoices|vendors}`) with no lead filter; pages join lead names in memory. Calendar merges camps (`camp_start`) + leads (`event_date`) via a pure helper. `assertOrgMember` gates all reads. New page slugs are added to the sidebar's camp-route detector so the org sidebar hides correctly on camp routes.

**Tech Stack:** Next.js 16 App Router (`params` is a Promise), Firebase Admin, Vitest. UI: `@/components/ui/{card,button,badge,table,input,label}` + `Link`.

**Baseline:** 503 tests passing (`npm install` first; use `npx vitest run --maxWorkers=2` — env shows harmless worker-spawn timeouts, not failures).

---

### Task 1: Org-wide list actions + calendar helper

**Files:**
- Modify: `actions/proposals.ts`, `actions/contracts.ts`, `actions/invoices.ts`, `actions/vendors.ts`
- Create: `lib/calendar.ts`, `actions/calendar.ts`
- Create/Modify tests: `__tests__/actions/{proposals,contracts,invoices,vendors}.test.ts`, `__tests__/lib/calendar.test.ts`, `__tests__/actions/calendar.test.ts`

- [ ] **Step 1: Add `listAll*` to each action file.** Each mirrors the existing `list*` but drops the `lead_id` filter:

```typescript
// actions/proposals.ts
export async function listAllProposals(orgId: string): Promise<Proposal[]> {
  await assertOrgMember(orgId)
  const snap = await proposalsRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Proposal)
}
```
Do the analogous `listAllContracts` (contracts.ts), `listAllInvoices` (invoices.ts), `listAllVendors` (vendors.ts — order by `created_at` `asc` to match `listVendors`). Use each file's existing `*Ref(orgId)` helper.

- [ ] **Step 2: Create `lib/calendar.ts`** (pure)

```typescript
import type { Camp, Lead } from '@/lib/types'

export interface CalendarItem {
  id: string
  title: string
  date: string          // ISO date (YYYY-MM-DD or full ISO)
  kind: 'event' | 'lead'
  href: string
}

// Merge camps (by camp_start) and leads (by event_date) into one date-sorted agenda.
// Items without a date are omitted. `orgSlug` builds the links.
export function buildCalendar(orgSlug: string, camps: Camp[], leads: Lead[]): CalendarItem[] {
  const items: CalendarItem[] = []
  for (const c of camps) {
    if (c.camp_start) {
      items.push({ id: c.id, title: c.name, date: c.camp_start, kind: 'event', href: `/${orgSlug}/${c.slug}/dashboard` })
    }
  }
  for (const l of leads) {
    if (l.event_date) {
      items.push({ id: l.id, title: l.name, date: l.event_date, kind: 'lead', href: `/${orgSlug}/leads/${l.id}` })
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date))
}
```

- [ ] **Step 3: Create `actions/calendar.ts`**

```typescript
'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listCamps } from '@/actions/camps'
import { listLeads } from '@/actions/leads'
import { buildCalendar, type CalendarItem } from '@/lib/calendar'

export async function getOrgCalendar(orgId: string, orgSlug: string): Promise<CalendarItem[]> {
  await assertOrgMember(orgId)
  const [camps, leads] = await Promise.all([listCamps(orgId), listLeads(orgId)])
  return buildCalendar(orgSlug, camps, leads)
}
```
(Note: `listCamps`/`listLeads` already call `assertOrgMember`; the extra assert here is cheap and keeps the action self-guarding.)

- [ ] **Step 4: Tests (TDD — write first, watch fail, implement, pass).**
- For each `listAll*`: extend the existing action test file — mock the collection so `.orderBy('created_at', <dir>).get()` returns 2 docs across different leads; assert all are returned (no lead filter applied). (Reuse the file's existing firebase-admin mock; you may need to make `.orderBy` reachable without a preceding `.where` — add that to the mock.)
- `__tests__/lib/calendar.test.ts`: `buildCalendar` merges + sorts by date, omits items with no date, sets `kind` + `href` correctly.
- `__tests__/actions/calendar.test.ts`: mock `@/actions/camps` `listCamps` + `@/actions/leads` `listLeads` + `assertOrgMember`; assert `getOrgCalendar` returns the merged sorted list.

- [ ] **Step 5:** `npx tsc --noEmit` clean; `npx vitest run --maxWorkers=2` all green.

- [ ] **Step 6: Commit**

```bash
git add actions/proposals.ts actions/contracts.ts actions/invoices.ts actions/vendors.ts lib/calendar.ts actions/calendar.ts "__tests__"
git commit -m "feat: org-wide list actions (proposals/contracts/invoices/vendors) + calendar helper"
```

---

### Task 2: Business-first categorized sidebar (+ doubling fix)

**Files:**
- Rewrite: `components/layout/AdminSidebar.tsx`

No new vitest tests (client component); `npx tsc --noEmit` + `npx vitest run` must stay green, `next build` verified in Task 5.

- [ ] **Step 1: Rewrite `AdminSidebar`.** Keep the props (`orgSlug`, `campSlug?`, `terminology?`, `allowedCampPages?`), `getCampNav`, `DEFAULT_TERMINOLOGY`, `handleSignOut`, and `navClass` exactly as they are today. Change the render + add the camp-route guard.

Add the org-page slug set (used to detect camp routes) — include ALL current + new org pages:
```typescript
const ORG_PAGE_SLUGS = new Set([
  'members', 'forms', 'permissions', 'billing', 'email-domain', 'event-types',
  'departments', 'reports', 'registrants', 'leads', 'clients', 'proposals',
  'contracts', 'invoices', 'vendors', 'calendar', 'new-camp',
])
```

At the top of the component body (after hooks), hide the org-layout instance on camp routes:
```typescript
// Rendered by BOTH the org layout (no campSlug) and the camp layout (with campSlug).
// On a camp route the camp layout renders the contextual event sidebar, so the
// org-layout instance hides itself to avoid a doubled sidebar.
if (!campSlug) {
  const seg = pathname.split('/').filter(Boolean)
  if (seg.length >= 2 && !ORG_PAGE_SLUGS.has(seg[1])) return null
}
```

**Render — two modes:**

*Header* (always): the `TraxEvent` link to `/${orgSlug}` (keep existing markup).

*If `campSlug` (event context):* a **← Events** back link (`href={`/${orgSlug}`}`, styled muted) at the top of the nav, then the existing `visibleCampNav` list (unchanged). Do NOT render the workspace/org groups here.

*Else (workspace):* render categorized groups. Add a small local helper to render a group with an uppercase label + its links:
```tsx
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2 py-3">
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}
```
Groups + items (each a `<Link className={navClass(href)}>`), in this order:
- **SALES**: Pipeline → `/${orgSlug}/leads`, Clients → `/${orgSlug}/clients`, Proposals → `/${orgSlug}/proposals`, Contracts → `/${orgSlug}/contracts`, Invoices → `/${orgSlug}/invoices`
- **EVENTS**: Events → `/${orgSlug}`, Registrants → `/${orgSlug}/registrants`, Vendors → `/${orgSlug}/vendors`, Calendar → `/${orgSlug}/calendar`
- **INSIGHTS**: Reports → `/${orgSlug}/reports`
- **SETTINGS** (collapsible): a button toggling `useState(false)` `settingsOpen`; when open show Members → `/members`, Permissions → `/permissions`, Billing → `/billing`, Email domain → `/email-domain`, Event types → `/event-types`, Departments → `/departments`. (Auto-open if the current path is one of those settings routes so the active item is visible.)

*Footer* (always, `mt-auto` at the bottom): the **Sign out** button (keep existing `handleSignOut`).

Keep the `<aside className="w-56 bg-gray-900 text-gray-100 min-h-screen flex flex-col flex-shrink-0">` shell. Note the "Events" link (`/${orgSlug}`) needs an exact-match active state so it isn't always active — use `pathname === `/${orgSlug}`` for that one item rather than the `startsWith` in `navClass` (add a small `exactNavClass` or inline check).

- [ ] **Step 2:** `npx tsc --noEmit` clean; `npx vitest run --maxWorkers=2` all green (existing tests unaffected).

- [ ] **Step 3: Commit**

```bash
git add components/layout/AdminSidebar.tsx
git commit -m "feat: business-first categorized sidebar (SALES/EVENTS/INSIGHTS/SETTINGS) + camp-route doubling fix"
```

---

### Task 3: Roll-up pages — Clients, Proposals, Invoices

**Files (create each):**
- `app/(admin)/[orgSlug]/clients/page.tsx` + `components/admin/ClientsTable.tsx`
- `app/(admin)/[orgSlug]/proposals/page.tsx` + `components/admin/AllProposalsTable.tsx`
- `app/(admin)/[orgSlug]/invoices/page.tsx` + `components/admin/AllInvoicesTable.tsx`

Server-page pattern for all (mirror `registrants/page.tsx`): resolve `orgId` from slug via `adminDb.collection('orgs').where('slug','==',orgSlug).limit(1)`, `notFound()` if empty, fetch data, render the client table. `export const dynamic = 'force-dynamic'`.

- [ ] **Step 1: Clients** — page fetches `listLeads(orgId)`; render `<ClientsTable orgSlug={orgSlug} leads={leads} />`. Table columns: Name, Organization, Stage (`LEAD_STAGE_LABELS` badge), Email, Est. value (`$${(v??0).toLocaleString()}`). Each row links to `/${orgSlug}/leads/${lead.id}`. Header "Clients" + count. Empty state. Use `@/components/ui/{card,badge}` + `Link`; a plain `<table>` styled like `NetworkDashboardClient`'s table is fine. (Can be a server component — no handlers — but `'use client'` is fine too; prefer plain/server.)

- [ ] **Step 2: Proposals** — page fetches `listAllProposals(orgId)` + `listLeads(orgId)`; build a `Map<lead_id, lead.name>`; render `<AllProposalsTable orgSlug rows={...} />` where each row = proposal + `clientName`. Columns: Title (`title||'Untitled'`), Client (name), Status (`PROPOSAL_STATUS_LABELS` badge), Total (`proposalTotal(p.line_items)` → `$${n.toFixed(2)}`). Row links to `/${orgSlug}/leads/${p.lead_id}/proposals/${p.id}`. Import helpers from `@/lib/proposals`.

- [ ] **Step 3: Invoices** — page fetches `listAllInvoices(orgId)` + `listLeads(orgId)`; join client names. Columns: Number/Title, Client, Status (`INVOICE_STATUS_LABELS`), Total (`invoiceTotal`), Balance (`invoiceBalance`). Row links to `/${orgSlug}/leads/${i.lead_id}/invoices/${i.id}`. Import from `@/lib/invoices`.

- [ ] **Step 4:** `npx tsc --noEmit` clean; `npx vitest run --maxWorkers=2` green.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/[orgSlug]/clients" "app/(admin)/[orgSlug]/proposals" "app/(admin)/[orgSlug]/invoices" components/admin/ClientsTable.tsx components/admin/AllProposalsTable.tsx components/admin/AllInvoicesTable.tsx
git commit -m "feat: org-wide Clients, Proposals, Invoices roll-up pages"
```

---

### Task 4: Roll-up pages — Contracts, Vendors, Calendar

**Files (create each):**
- `app/(admin)/[orgSlug]/contracts/page.tsx` + `components/admin/AllContractsTable.tsx`
- `app/(admin)/[orgSlug]/vendors/page.tsx` + `components/admin/AllVendorsTable.tsx`
- `app/(admin)/[orgSlug]/calendar/page.tsx` + `components/admin/CalendarView.tsx`

- [ ] **Step 1: Contracts** — `listAllContracts(orgId)` + `listLeads` join. Columns: Title (`title||'Contract'`), Client, Status (`CONTRACT_STATUS_LABELS`), Signed (`signed_by` + date when signed). Row → `/${orgSlug}/leads/${c.lead_id}/contracts/${c.id}`. Import from `@/lib/contracts`.

- [ ] **Step 2: Vendors** — `listAllVendors(orgId)` + `listLeads` join (client per `vendor.lead_id`). Columns: Name, Service, Client/Event, Cost (`$${(cost??0).toFixed(2)}`), Status (`VENDOR_STATUS_LABELS` badge). Row → `/${orgSlug}/leads/${v.lead_id}` (vendors are edited inline on the lead). Import from `@/lib/vendors`.

- [ ] **Step 3: Calendar** — page calls `getOrgCalendar(orgId, orgSlug)` → `CalendarItem[]`; render `<CalendarView items={items} />`. Present as a chronological **agenda list grouped by month** ("July 2026", then each item: date, title, a small badge for `kind` = "Event" vs "Lead"), each row an `<a href={item.href}>`. Only upcoming/there's no filtering required for v1 — show all sorted ascending. Empty state "Nothing scheduled yet." Note in a code comment that a month-grid view is a future enhancement.

- [ ] **Step 4:** `npx tsc --noEmit` clean; `npx vitest run --maxWorkers=2` green.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/[orgSlug]/contracts" "app/(admin)/[orgSlug]/vendors" "app/(admin)/[orgSlug]/calendar" components/admin/AllContractsTable.tsx components/admin/AllVendorsTable.tsx components/admin/CalendarView.tsx
git commit -m "feat: org-wide Contracts, Vendors, Calendar roll-up pages"
```

---

### Task 5: Final verification

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npx vitest run --maxWorkers=2` → all green; record final count.
- [ ] **Step 3:** `npx next build` (copy env: `cp /Users/rm/vw/traxevent/.env.local .env.local`, build, then `rm -f .env.local`) → succeeds. Confirm the 6 new routes appear: `/[orgSlug]/{clients,proposals,contracts,invoices,vendors,calendar}` and **NO route collisions** (the new static segments must not clash with `[orgSlug]/[campSlug]`).
- [ ] **Step 4:** Commit this plan file (`docs: business-nav plan`).
- [ ] **Step 5:** Hand back for branch finish (push + PR + squash-merge as `Lifewithmo`). After merge, the main dev server should be restarted to show the new nav.

---

## Self-Review

**Spec coverage:** Business-first categorized sidebar in workflow order (Task 2), with the six roll-up pages it links to (Tasks 3–4) backed by org-wide list actions (Task 1), and the doubled-sidebar bug fixed via the camp-route guard (Task 2). Everything stays visible (option 2) but reorganized into SALES/EVENTS/INSIGHTS/SETTINGS.

**Placeholder scan:** Actions + calendar helper are verbatim. Sidebar render + roll-up pages/tables are specified behaviorally against established analogues (`registrants/page.tsx`, `NetworkDashboardClient` table, the per-lead client components) — acceptable for mechanical UI.

**Type consistency:** `listAll{Proposals,Contracts,Invoices,Vendors}(orgId)` return the existing entity arrays; totals reuse `proposalTotal`/`invoiceTotal`/`invoiceBalance`; labels reuse the existing `*_STATUS_LABELS`. `CalendarItem`/`buildCalendar(orgSlug, camps, leads)` consistent between `lib/calendar.ts`, `actions/calendar.ts`, and `CalendarView`. New slugs added to `ORG_PAGE_SLUGS` match the new page routes.

**Security note:** All new actions are `assertOrgMember`-gated and path-isolated to `orgs/{orgId}/…`; they only aggregate data the caller can already see per-lead. No public/token surface, no new cross-tenant queries (plain per-org collection reads). Client-name joins use the caller's own org leads. Purely internal admin read pages.
