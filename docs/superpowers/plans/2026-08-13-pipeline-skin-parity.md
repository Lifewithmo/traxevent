# Pipeline & Sidebar Skin Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the visual layer of the design mock — spec `docs/superpowers/specs/2026-08-13-pipeline-skin-parity-design.md`. The spec's §3–§9 are normative (they transcribe the design kit's source); this plan sequences them.

**Architecture:** New `components/layout/NavIcons.tsx` (verbatim icon port) and `components/admin/pipeline/StageChip.tsx` (shared pill + portalled menu); restyled `AdminSidebar` (tokens, icons, collapsible sections, 52px rail); rewritten `PipelineStatsHeader` (client component: borderless KPI band + collapsible chart on a `backlogWindow(-5..+6)`); `PipelineSubNav` gains an actions slot both views portal into; board/list restyled per kit. Server flows (setLeadStage, convert redirect, nudge) unchanged.

**Tech Stack:** Next.js App Router (breaking changes — consult `node_modules/next/dist/docs/` before Next-specific code), TypeScript, Tailwind v4 tokens in `app/globals.css`, Vitest + Testing Library.

## Global Constraints

- Branch green = `npx vitest run` AND `npx next build` both pass. Pre-existing tsc allowlist (never fix): `__tests__/lib/calendar-feed.test.ts`, `__tests__/components/**/BrandingClient*`.
- The spec's §3 style vocabulary and every quoted px/copy value are normative — no paraphrasing, no "close enough" values.
- **localStorage in client components must be read in `useEffect` after mount** (never in a `useState` initializer) — SSR/hydration would mismatch. Defaults: chart collapsed, sidebar expanded.
- Spec §10 deviations are deliberate — implement as specified there, do not "fix back" toward the kit.
- Stage sequences always derive from `OPEN_STAGES` in `@/lib/leads`, never hardcoded arrays.
- Pushing requires `gh auth switch` to Lifewithmo. End state: push + PR, NO merge.

---

### Task 1: Sidebar tokens + NavIcons

**Files:**
- Modify: `app/globals.css` (light `--sidebar*` block ~lines 200-207; dark block gains `--sidebar-muted` too)
- Create: `components/layout/NavIcons.tsx`
- Test: `__tests__/components/layout/NavIcons.test.tsx`

**Interfaces:**
- Produces: `NavIcon({ name }: { name: NavIconName })` and the `NavIconName` union; CSS vars `--sidebar-muted` (both themes) plus updated light sidebar values. Task 2 consumes both.

- [ ] **Step 1: Update tokens in `app/globals.css`**

In the light theme block, replace the sidebar values with (keep any surrounding vars):
```css
  --sidebar: #f2eee8;
  --sidebar-foreground: var(--warm-950);
  --sidebar-muted: var(--warm-600);
  --sidebar-primary: #8f4c23;
  --sidebar-primary-foreground: #fdf6ef;
  --sidebar-accent: #e7e1d8;
  --sidebar-accent-foreground: var(--warm-950);
  --sidebar-border: var(--warm-200);
  --sidebar-ring: #c67a44;
```
(If globals already defines copper tokens — grep `copper` — use `var(--copper-600)`/`var(--copper-400)` for primary/ring instead of the literals.) In the dark block, add `--sidebar-muted:` mapped to the dark theme's muted-foreground value used there. Add `--color-sidebar-muted: var(--sidebar-muted);` beside the other `--color-sidebar-*` Tailwind bridge lines (~line 13-20).

- [ ] **Step 2: Write the failing test**

`__tests__/components/layout/NavIcons.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { NavIcon } from '@/components/layout/NavIcons'

describe('NavIcon', () => {
  it('renders a 16px stroke icon for a known name', () => {
    const { container } = render(<NavIcon name="pipeline" />)
    const svg = container.querySelector('svg')!
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg.getAttribute('stroke-width')).toBe('1.3')
  })
  it('renders nothing for an unknown name', () => {
    // @ts-expect-error — runtime guard for bad names
    const { container } = render(<NavIcon name="nope" />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
```
Run: `npx vitest run __tests__/components/layout/NavIcons.test.tsx` → FAIL (module missing).

- [ ] **Step 3: Create `components/layout/NavIcons.tsx`**

Port the kit's `NavIcons.jsx` **verbatim path data** (spec §4 lists the 22 names). Shape:
```tsx
// 16px, 1.3 stroke, round caps/joins — the design kit's bespoke nav family
// (ui_kits/admin/NavIcons.jsx). Path data is normative; do not swap for a library.
import type { ReactNode } from 'react'

const P: Record<string, ReactNode> = {
  today: (<><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.4 1.6" /></>),
  calendar: (<><rect x="2" y="3.2" width="12" height="10.8" rx="1.8" /><path d="M2 6.4h12M5.4 1.8v2.6M10.6 1.8v2.6" /></>),
  clients: (<><circle cx="8" cy="5.6" r="2.6" /><path d="M2.8 13.6c0-2.5 2.3-4.2 5.2-4.2s5.2 1.7 5.2 4.2" /></>),
  events: (<><path d="M2.4 13.2V6.4l5.6-3.6 5.6 3.6v6.8" /><path d="M1.4 13.4h13.2" /><path d="M6.4 13.2V9.2h3.2v4" /></>),
  pipeline: (<><rect x="1.8" y="3" width="3.6" height="10" rx="1" /><rect x="6.2" y="3" width="3.6" height="7" rx="1" /><rect x="10.6" y="3" width="3.6" height="4.4" rx="1" /></>),
  proposals: (<><path d="M3.4 1.8h6l3.2 3.2v9.2H3.4z" /><path d="M9.2 1.8V5h3.2" /><path d="M5.6 8.4h4.8M5.6 11h3.2" /></>),
  invoices: (<><path d="M3.4 1.8h9.2v12.4l-2-1.2-2 1.2-2-1.2-2 1.2z" /><path d="M6 5.6h4M6 8.4h4" /></>),
  vendors: (<><path d="M2 5.6h12l-.9 8H2.9z" /><path d="M2.6 5.6 4.4 2.2h7.2l1.8 3.4" /><path d="M6 8.4v2.8M10 8.4v2.8" /></>),
  packages: (<><path d="M8 1.8 14 5v6L8 14.2 2 11V5z" /><path d="M2 5l6 3.2L14 5M8 8.2v6" /></>),
  forms: (<><rect x="2.4" y="2.2" width="11.2" height="11.6" rx="1.8" /><path d="M5.2 6h5.6M5.2 9.2h3.4" /></>),
  compliance: (<><path d="M8 1.8 13.2 4v4.2c0 3-2.2 5-5.2 6-3-1-5.2-3-5.2-6V4z" /><path d="m5.8 8 1.6 1.6 3-3.2" /></>),
  reports: (<><path d="M2.2 13.4h11.6" /><path d="M4.4 13V8.2M8 13V3.6M11.6 13V6.4" /></>),
  settings: (<><circle cx="8" cy="8" r="2.2" /><path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5" /></>),
  members: (<><circle cx="6" cy="5.8" r="2.3" /><path d="M1.8 13.2c0-2.2 1.9-3.6 4.2-3.6s4.2 1.4 4.2 3.6" /><path d="M11 3.8a2.2 2.2 0 0 1 0 4.2M12.2 13.2c0-1.6-.6-2.7-1.6-3.3" /></>),
  permissions: (<><rect x="3" y="7" width="10" height="6.6" rx="1.6" /><path d="M5.4 7V5a2.6 2.6 0 0 1 5.2 0v2" /></>),
  billing: (<><rect x="1.8" y="3.6" width="12.4" height="8.8" rx="1.6" /><path d="M1.8 6.6h12.4M4.4 9.8h2.4" /></>),
  branding: (<><path d="M8 1.8 9.9 5.7l4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" /></>),
  profile: (<><circle cx="8" cy="8" r="6.2" /><path d="M1.8 8h12.4" /><path d="M8 1.8c1.6 1.7 2.5 3.9 2.5 6.2S9.6 12.5 8 14.2C6.4 12.5 5.5 10.3 5.5 8s.9-4.5 2.5-6.2z" /></>),
  email: (<><rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.6" /><path d="m2.4 4.6 5.6 4 5.6-4" /></>),
  types: (<><path d="M2.6 2.6h4.2v4.2H2.6zM9.2 2.6h4.2v4.2H9.2zM2.6 9.2h4.2v4.2H2.6z" /><circle cx="11.3" cy="11.3" r="2.1" /></>),
  departments: (<><rect x="5.4" y="1.8" width="5.2" height="3.6" rx="1" /><path d="M8 5.4v2.4M3.6 13.2v-2.4h8.8v2.4M8 7.8v3" /><rect x="1.8" y="12.4" width="3.6" height="1.8" rx=".8" /><rect x="10.6" y="12.4" width="3.6" height="1.8" rx=".8" /></>),
  signout: (<><path d="M6.2 2.4H3.6a1.4 1.4 0 0 0-1.4 1.4v8.4a1.4 1.4 0 0 0 1.4 1.4h2.6" /><path d="M10 11.2 13.4 8 10 4.8M13.2 8H6" /></>),
}

export type NavIconName = keyof typeof P

export function NavIcon({ name }: { name: NavIconName }) {
  const d = P[name]
  if (!d) return null
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" className="shrink-0">{d}</svg>
  )
}
```

- [ ] **Step 4:** Run the test → PASS. **Step 5: Commit** `feat(design): sidebar tokens v2 + bespoke nav icon family`

---

### Task 2: AdminSidebar restyle

**Files:**
- Modify: `components/layout/AdminSidebar.tsx`
- Test: `__tests__/components/layout/AdminSidebar.test.tsx`

**Interfaces:**
- Consumes: `NavIcon`/`NavIconName` (Task 1), sidebar tokens.
- Produces: same props, same hrefs/gating as PR #80 — only presentation changes. Collapsible sections: Sales Pipeline & Operations (default open), Settings (open when a settings route is active). Collapsed rail persisted in `localStorage['tx-sidebar-collapsed']` (read in `useEffect`).

- [ ] **Step 1: Update/extend tests first.** Read the existing test file; keep every IA/gating assertion. Add:
```tsx
it('renders an icon with every workspace nav item', () => { /* render default sidebar; for ['Calendar','Clients','Events','Today','Pipeline','Reports'] assert the link/label's element contains an svg */ })
it('collapses the Operations section', () => { /* click the 'Operations' section button; assert Vendors/Forms links disappear; click again → reappear */ })
it('collapses to an icon rail and persists', () => { /* click 'Collapse navigation'; assert links render icon-only (e.g. getByLabelText('Pipeline') is an anchor with no visible text node) and localStorage['tx-sidebar-collapsed'] === '1' */ })
```
Run → new tests FAIL.

- [ ] **Step 2: Implement.** Follow spec §4 exactly. Structure notes:
- Map each link to its icon: calendar→calendar, clients→clients, events→events, today→today, registrants→clients, pipeline→pipeline, proposals→proposals, invoices→invoices, vendors→vendors, packages→packages, forms→forms, compliance→compliance, reports→reports; settings children: members, permissions, billing, branding, profile, email, types, departments; sign out→signout.
- `NavItem` and `Section` become local subcomponents implementing spec §4's NavItem/Section styles with Tailwind + sidebar tokens (e.g. `text-[color:var(--sidebar-muted)]`, `border-l-2`, `bg-[color:var(--sidebar-accent)]`). Keep `navClass`/`exactNavClass` semantics (active = pathname prefix / exact) inside the new components.
- Sales Pipeline section replaces the current Pipeline-with-▸ pattern: the SECTION header collapses; Pipeline, Proposals, Invoices all render indented when open (drop `pipelineOpen`/`PIPELINE_CHILD_SLUGS` disclosure but KEEP the active-state logic for settings and quick links).
- Collapsed rail per spec §4: `useState(false)` + `useEffect` localStorage read; width classes `w-[52px]` vs `w-56`, `transition-[width] duration-160`; PanelIcon collapse button in the header (inline SVG from spec source); icon-only items 32px, `title` + `aria-label`; event-context branch (`eventSlug`) untouched.
- [ ] **Step 3:** `npx vitest run __tests__/components/layout/AdminSidebar.test.tsx` → PASS; `npx tsc --noEmit` → no new errors.
- [ ] **Step 4: Commit** `feat(nav): kit-styled sidebar — icons, collapsible sections, icon rail`

---

### Task 3: coffee-cart gains vendors + events

**Files:**
- Modify: `lib/industry-packs.ts` (coffee-cart pack `modules` array)
- Test: `__tests__/lib/industry-packs.test.ts`

- [ ] **Step 1:** Add a failing assertion: the coffee-cart pack's modules include `'vendors'` and `'events'`. Run → FAIL.
- [ ] **Step 2:** Append `'vendors', 'events'` to the coffee-cart pack's `modules` list (only that pack).
- [ ] **Step 3:** Suite green: `npx vitest run __tests__/lib/industry-packs.test.ts __tests__/lib/module-guard.test.ts __tests__/components/layout/AdminSidebar.test.tsx`.
- [ ] **Step 4: Commit** `feat(packs): coffee-cart enables vendors + events modules`

---

### Task 4: backlogWindow + KPI band + collapsible chart

**Files:**
- Modify: `lib/pipeline-stats.ts` (add `backlogWindow`), `components/admin/pipeline/PipelineStatsHeader.tsx` (rewrite, becomes `'use client'`), `app/(admin)/[orgSlug]/leads/page.tsx` (stats wiring)
- Test: `__tests__/lib/pipeline-stats.test.ts`, `__tests__/components/admin/pipeline/PipelineStatsHeader.test.tsx`

**Interfaces:**
- Produces: `backlogWindow(leads: Lead[], today: string, back = 5, ahead = 6): BacklogMonth[]`; `PipelineHeaderStats` unchanged except `backlog` now comes from `backlogWindow` and it gains `todayYm: string` (current `YYYY-MM`, for bolding + the "ahead" sum). Page passes `backlog: backlogWindow(leads, today)` and `todayYm: ym`.

- [ ] **Step 1: Lib test first** (`pipeline-stats.test.ts`):
```ts
it('backlogWindow spans -5..+6 around the current month', () => {
  const rows = backlogWindow([], '2026-08-13')
  expect(rows).toHaveLength(12)
  expect(rows[0].ym).toBe('2026-03')
  expect(rows[5].ym).toBe('2026-08')
  expect(rows[11].ym).toBe('2027-02')
})
```
Implement `backlogWindow` in `lib/pipeline-stats.ts` reusing the exact per-month logic of `backlogByMonth` with `start = addMonths(today.slice(0,7), -back)` and `length back + ahead + 1` (refactor the shared month-row builder out; `backlogByMonth` keeps its signature). Run → PASS.

- [ ] **Step 2: Component tests.** Rewrite `PipelineStatsHeader.test.tsx`: keep the 4-KPI assertions (labels + values + yoy) but note the needs-action note copy is now `'stale or unopened'`; add:
```tsx
it('starts with the chart collapsed showing the summary, expands to the legend', () => {
  render(<PipelineStatsHeader stats={stats} />)
  expect(screen.getByText(/booked · .* ahead/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Revenue by month/i }))
  expect(screen.getByText('rolling 12 months · solid booked · light open')).toBeInTheDocument()
  expect(localStorage.getItem('tx-backlog-open')).toBe('1')
})
```
(Give the toggle `aria-label="Revenue by month"` or accessible text so the name query works; build the fixture's `backlog` with 12 rows and `todayYm` matching one of them.) Run → FAIL.

- [ ] **Step 3: Rewrite the component** per spec §6: `'use client'`; KPI band markup (band grid, 4 mono-caps KPIs with hairline dividers, responsive at 1180/1000px via Tailwind arbitrary breakpoints e.g. `max-[1180px]:grid-cols-1`), `Backlog` subcomponent (collapse state via `useState(false)` + `useEffect` localStorage; header button with rotating ▾; open = 56px bars + labels, collapsed = `` `${money(totalBooked)} booked · ${money(ahead)} ahead` `` where `ahead = Σ (booked+open) for m.ym >= todayYm`; empty-month 2px baseline; current-month bold label). KPI values/notes per spec §6 exactly (`'stale or unopened'`, destructive rules). Update the page: `backlog: backlogWindow(leads, today), todayYm: ym`. Run tests → PASS; tsc no new errors.
- [ ] **Step 4: Commit** `feat(pipeline): kit KPI band + collapsible rolling-window revenue chart`

---

### Task 5: StageChip

**Files:**
- Create: `components/admin/pipeline/StageChip.tsx`
- Test: `__tests__/components/admin/pipeline/StageChip.test.tsx`

**Interfaces:**
- Produces:
```ts
export function StageChip(props: {
  stage: LeadStage
  ariaContext: string                    // e.g. opportunity title, for the aria-label
  onStage: (stage: LeadStage) => void    // open stages + closed_won
  onMarkLost: () => void                 // navigation is the CALLER's job (spec §10.1)
}): JSX.Element
```
Menu items derive from `[...OPEN_STAGES, 'closed_won']` + `LEAD_STAGE_LABELS`; current stage bolded; Mark lost styled destructive after a hairline. Pill: 26px height, radius-full, `{label} ▾`. Portalled to `document.body`, fixed position from the trigger rect, flips up when `window.innerHeight - rect.bottom < 180`, closes on outside click and capture-phase scroll.

- [ ] **Step 1: Test first**:
```tsx
it('opens the menu and reports a stage selection', () => {
  const onStage = vi.fn()
  render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={onStage} onMarkLost={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Consultation' }))
  expect(onStage).toHaveBeenCalledWith('consultation')
})
it('offers Mark lost as a distinct destructive action', () => {
  const onMarkLost = vi.fn()
  render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={onMarkLost} />)
  fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Mark lost' }))
  expect(onMarkLost).toHaveBeenCalled()
})
```
Run → FAIL. **Step 2:** Implement per the kit's `StageChip` (spec §7), adapted: `'use client'`, `createPortal(…, document.body)`, menu `role="menu"`/`role="menuitem"`, aria-label `` `Stage: ${label}. Change stage for ${ariaContext}.` ``. **Step 3:** PASS + commit `feat(pipeline): StageChip pill with portalled stage menu`

---

### Task 6: SubNav actions slot + board restyle

**Files:**
- Modify: `components/admin/pipeline/PipelineSubNav.tsx` (actions slot), `components/admin/pipeline/PipelineBoardView.tsx` (rewrite per spec §7)
- Test: extend `__tests__/components/admin/pipeline/` (new `PipelineBoardView.test.tsx`)

**Interfaces:**
- Consumes: `StageChip` (Task 5).
- Produces: `PipelineSubNav` renders `<div id="tx-pipeline-actions" className="ml-auto flex items-center gap-2" />` inside its existing row (read the file; place it right-aligned after the tabs). Board portals into it after mount: Board→List toggle link, `Intake link` outline button, `New opportunity` button — which means `IntakeLinkCard` + `NewOpportunityForm` (and `customers` prop) move INTO the board view's props/render too; the page already passes `customers` to the list — pass it to `PipelineBoardView` as well.

- [ ] **Step 1: Tests first** (`PipelineBoardView.test.tsx`; mock `next/navigation`, `@/actions/leads` `setLeadStage`, and the intake/new-opportunity action modules exactly as `PipelineListClient.test.tsx` does):
```tsx
it('moves a card stage with arrow keys', async () => { /* render one inquiry-stage row; focus the card (getByRole('article') or aria-label); fireEvent.keyDown ArrowRight; expect setLeadStage called with next OPEN_STAGE */ })
it('renders uppercase column headers with count and value', () => { /* assert a column header shows the stage label and `1 · $1,200` */ })
it('routes Mark lost to the opportunity page', () => { /* open chip menu, click Mark lost, expect router.push toward `/demo/leads/l1?focus=lost` */ })
```
Run → FAIL.
- [ ] **Step 2: Implement** spec §7 in `PipelineBoardView.tsx`: grid columns, mono-caps headers + `count · $` over hairline, scrollable card wells with drag-over `bg-muted` highlight, kit LeadCard (dot/title/subtitle/statusLine/chip+value, `tabIndex={0}`, ArrowLeft/Right via a sequence derived from `[...OPEN_STAGES, 'closed_won']`), StageChip wired to the existing `handleStageChange` (closed_won keeps the convert redirect) and `onMarkLost={() => router.push(`/${orgSlug}/leads/${lead.id}?focus=lost`)}`; delete the full-width select; summary above top hairline; portal the three actions into `#tx-pipeline-actions` (`useEffect` + `createPortal`; the view-toggle link keeps today's `?view=` navigation). Add the slot div to `PipelineSubNav`.
- [ ] **Step 3:** Board + subnav + list suites green; tsc no new errors. **Step 4: Commit** `feat(pipeline): kit board — mono column headers, stage chips, keyboard moves, subnav actions`

---

### Task 7: List restyle

**Files:**
- Modify: `components/admin/pipeline/PipelineListClient.tsx`
- Test: `__tests__/components/admin/pipeline/PipelineListClient.test.tsx`

**Interfaces:** consumes StageChip; keeps Nudge/Set-next-step (spec §10.2) and adds the advance button ("Move to {LEAD_STAGE_LABELS[next]}", outline sm, next = following entry of `[...OPEN_STAGES, 'closed_won']`; hidden on the last open stage only if next would be closed_won? No — kit shows "Move to Closed Won"; render it).

- [ ] **Step 1: Tests first:** extend the existing file — flat-row assertions (row has `border-l-2` destructive for needs-attention), advance button label for an inquiry-stage row = `Move to Consultation` and clicking calls `setLeadStage` (mock `@/actions/leads`), StageChip present per row. Keep the intake/summary/tone tests passing. Run → FAIL.
- [ ] **Step 2: Implement** spec §8: replace Card rows with flat rows (12px padding, 60%-mix bottom hairline, 2px left accent), title 14/500, right cluster = StageChip · value · countdown badge · quick actions · advance button; move its header actions (view toggle, Intake, New opportunity) into the `#tx-pipeline-actions` portal exactly as the board does, removing the H1 block. Section headings per spec.
- [ ] **Step 3:** Suite green; tsc clean of new errors. **Step 4: Commit** `feat(pipeline): kit list — flat rows, stage chips, advance action`

---

### Task 8: Full verification

- [ ] `npx vitest run` all green; `npx tsc --noEmit` = allowlist only; `npx next build` succeeds.
- [ ] `git status` clean (or commit stragglers).
- [ ] Browser smoke pass against the emulator org (controller does this): sidebar icons/collapse, chart collapse/expand, chip menu, keyboard move, both views' actions present.
