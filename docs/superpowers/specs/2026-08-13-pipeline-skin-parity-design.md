# Pipeline & Sidebar Skin Parity (Mock Parity v2) — Design

**Date:** 2026-08-13
**Status:** Approved (user: "all 7, to a PR")
**Source of truth:** the design project's kit source — `ui_kits/admin/PipelineScreen.jsx`, `Sidebar.jsx`, `NavIcons.jsx`, and `tokens/colors.css` in Claude Design project `7a2ee3f8-128e-44a2-9747-51c7e9973d1b` (fetched 2026-08-13). PR #80 delivered structural parity; this increment delivers the visual layer.

## 1. Purpose

Make the pipeline page and sidebar *look* like the mock, using the mock's own source as the normative styling reference: exact typography treatments, layout geometry, interaction affordances, and copy. Where the mock's behavior conflicts with production data integrity (lost-reason capture), adapt with the smallest deviation and record it here.

## 2. Out of scope

- Richer Menu Packages / Vendors screens from the kit (`MenuPackagesScreen.jsx`, `VendorsScreen.jsx` — recipe cost/margin, price books): those are ops-catalog increments 2–3.
- The AI "Add to catalog" door (kit has it unwired too).
- Any non-pipeline screen restyling beyond the shared sidebar.

## 3. Normative style vocabulary (from the kit)

- **Mono-caps label**: `font-family: var(--font-mono); font-size 11px; weight 600; uppercase; letter-spacing .04em; color color-mix(in oklab, var(--muted-foreground) 70%, var(--foreground))`. Used for KPI labels, the chart header, and board column headers.
- **Hairline**: `1px solid var(--border)`.
- **Tabular numerals** (`font-variant-numeric: tabular-nums`) on every money/count value.

## 4. Sidebar (`components/layout/AdminSidebar.tsx` + new `components/layout/NavIcons.tsx`)

- **Icons**: port the kit's `NavIcons.jsx` verbatim to a typed React component — 16px viewBox, `stroke=currentColor`, strokeWidth 1.3, round caps/joins. Icon names used: calendar, clients, events, today, pipeline, proposals, invoices, vendors, packages, forms, compliance, reports, settings, members, permissions, billing, branding, profile, email, types, departments, signout. (Do NOT substitute lucide — the kit is a bespoke family.)
- **NavItem**: icon + label row, `gap 10px, padding 8px 12px` (indent: `8px 12px 8px 26px`), radius 6, 14px/500, `border-left 2px` accent (`--sidebar-primary` when active, transparent otherwise), active bg `--sidebar-accent`, active text `--sidebar-accent-foreground`, idle text `--sidebar-muted`.
- **Sections**: label style 10px/600 uppercase ls .05em `--sidebar-muted`. **Sales Pipeline**, **Operations**, and **Settings** are collapsible: the label row is a button with a `▾` that rotates -90° when closed (150ms). Sales Pipeline and Operations default open; Settings defaults open only when a settings route is active (current behavior). Children of collapsible sections render with `indent`.
- **Structure** (unchanged from PR #80's IA): Quick Links (Calendar, Clients, Events, Today, Registrants — Registrants gets the `members` icon style family; use `clients` icon), Sales Pipeline (Pipeline, Proposals, Invoices — all three indented, all visible when open), Operations (Vendors, {catalogLabel}, Forms, Compliance), Insights (Reports), Settings (existing eight, each with its kit icon).
- **Collapsed rail**: a header collapse button (the kit's `PanelIcon` two-pane glyph) toggles a 52px icon-only rail, persisted in `localStorage['tx-sidebar-collapsed']`, width transition 160ms. Collapsed sections render as icon stacks separated by top hairlines; each icon is a 32px square centered, `title`/`aria-label` = its label; Settings collapses to a single `settings` icon linking to `/members`; Sign out becomes an icon button. The event-context sidebar (eventSlug mode) is untouched.
- **Tokens**: update `app/globals.css`'s light sidebar block to the design project's current values: `--sidebar: #f2eee8`, `--sidebar-accent: #e7e1d8`, `--sidebar-primary: <copper-600>` (use the existing copper token if globals defines one; else literal `#8f4c23`), `--sidebar-primary-foreground: #fdf6ef`, and add `--sidebar-muted: var(--warm-600)` (+ dark-mode `--sidebar-muted` mapped to the dark block's muted foreground). Sidebar styling switches from gray-* utility classes to the sidebar tokens.

## 5. Page header (PipelineSubNav + both views)

- `PipelineSubNav` renders an actions slot `<div id="tx-pipeline-actions">` right-aligned on the tab row.
- Board and list clients portal their actions into it after mount (kit pattern): the view-toggle link ("List view"/"Board view"), the **Intake link** outline button, and **New opportunity** — so BOTH views get all three (board currently lacks Intake/New entirely).
- The standalone "Pipeline" H1 + subtitle block is removed from both views; `NewOpportunityForm` and `IntakeLinkCard` render where they do today, triggered from the portalled buttons.

## 6. KPI band + chart (`PipelineStatsHeader.tsx`, becomes a client component)

Replace the card grid with the kit's band:

- Band: hairline top + bottom, `padding 16px 0`, two-column grid `minmax(0,1fr) / minmax(280px,420px)` (KPIs left, chart right), collapsing to one column ≤1180px; KPI grid 4 columns with hairline left dividers (`padding-left 20px`, first column none), 2-column at ≤1000px.
- KPI: mono-caps label; value 22px/600, ls -.02em, tabular; note 12px muted. Needs-action value renders destructive when > 0; a "down N%" YoY note renders destructive. Note copy per kit: `'stale or unopened'` / `'all caught up'` (this supersedes PR #80's "stale or no opens — see below").
- Chart ("Backlog"): collapsible header button — rotating `▾` + mono-caps "Revenue by month"; right-aligned meta shows, when open, `rolling 12 months · solid booked · light open`, and when collapsed, `$<total booked> booked · $<ahead> ahead` (ahead = booked+open for months ≥ current). State persisted in `localStorage['tx-backlog-open']`, default collapsed. Bars: height 56, gap 4, open segment `color-mix(in oklab, var(--primary) 22%, transparent)` with 2px top radius, booked segment `var(--primary)`; empty months render a 2px `var(--border)` baseline. Month labels 10px, current month bold + foreground.
- **Window**: rolling **-5 back through +6 ahead** of the current month (12 months spanning past and future — replaces PR #80's forward-only 12). New pure helper in `lib/pipeline-stats.ts`: `backlogWindow(leads, today, back = 5, ahead = 6): BacklogMonth[]` (same per-month booked/open math as `backlogByMonth`, which remains for any other callers).

## 7. Board (`PipelineBoardView.tsx`)

- Columns: CSS grid `repeat(n, minmax(0,1fr))`, gap 16; header row = mono-caps stage label + `count · $value` (11px tabular muted) over a hairline; card area scrolls (`max-height calc(100vh - 320px)`, `overscroll-contain`); drag-over highlights the column bg `var(--muted)` (120ms).
- Card: `border 1px var(--border)`, radius 6, `padding 10px 12px`, `cursor grab`; title row 13px/600 ls -.005em with a 5px destructive dot when needs-attention, single-line ellipsis; subtitle + statusLine 12px (statusLine destructive when needs-attention), ellipsized; footer row = **StageChip** left, value right (12px/600 tabular).
- **StageChip** (new shared `components/admin/pipeline/StageChip.tsx`): a 26px pill button `{label} ▾`, menu portalled to `document.body` (fixed-position, flip-up near viewport bottom, closes on outside click/scroll), items = open stages + Closed Won (current stage bolded), then a hairline-separated destructive **Mark lost** item. Selecting a stage calls the existing `setLeadStage` flow; **Mark lost navigates to the opportunity page** (`/{org}/leads/{id}?focus=lost`) instead of setting the stage directly — ADAPTATION: production requires a lost reason, captured there; the kit's direct set would bypass it.
- Cards are focusable; **ArrowLeft/ArrowRight move the stage** along inquiry → consultation → proposal → closed_won (kit behavior), with the card's aria-label announcing it.
- The full-width `<select>` is removed. Won/lost summary sits above a top hairline (12px muted), as in the kit.

## 8. List (`PipelineListClient.tsx`)

- Rows go flat: no Card — `padding 12px`, bottom hairline `color-mix(in oklab, var(--border) 60%, transparent)`, left `2px` accent (destructive when needs-attention, transparent otherwise). Title 14px/500; statusLine 12px (destructive tone rule as board).
- Right side per row: **StageChip**, value (14px/500 tabular), then actions. ADAPTATION: production keeps its quick actions (`Set next step` link, `Nudge` button) — they carry real behavior the kit's generic "Move to {next}" button lacks; add the kit's **advance button** ("Move to {next stage label}", outline sm) after them for open stages below closed_won.
- Section headings: 14px/600, "Needs attention" in destructive (existing), "Waiting on them", "Moving".

## 9. Module gating

`coffee-cart` pack gains `'vendors'` and `'events'` modules so BrewTrax's sidebar shows Vendors (Operations) and Events (Quick Links) as the mock does. No other pack changes.

## 10. Recorded deviations from the kit

1. **Mark lost** routes to the opportunity page for reason capture (kit sets stage directly).
2. **List quick actions kept** (Nudge / Set next step) alongside the kit's advance button.
3. Kit's `AdvanceAction` order (inquiry→consultation→proposal) maps to production's `OPEN_STAGES` source of truth — derive the sequence from `OPEN_STAGES`, never hardcode.
4. Board drag/drop and `setLeadStage` server flow, closed_won → convert redirect, all remain production's (kit is local-state only).

## 11. Testing

- `NavIcons`: renders a known icon, returns null for unknown.
- `AdminSidebar`: icons present (svg per item), section collapse toggles children, collapsed rail persists and renders icon-only, existing IA/gating tests keep passing (update render queries as needed).
- `PipelineStatsHeader`: 4 KPIs, collapsed chart summary vs open legend, localStorage persistence, `backlogWindow` unit tests (length 12, -5 start, +6 end, empty months present).
- `StageChip`: opens menu, selects stage (callback), Mark lost triggers the navigate callback.
- Board/list: stage-move keyboard test (ArrowRight advances), destructive tone assertions anchored to text, advance button label derived from `OPEN_STAGES`.
- Full `vitest` + `next build` green (pre-existing tsc allowlist: calendar-feed, BrandingClient*).
