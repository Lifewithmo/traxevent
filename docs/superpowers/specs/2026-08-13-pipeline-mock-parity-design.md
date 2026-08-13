# Pipeline & Sidebar — Design-Mock Parity — Design

**Date:** 2026-08-13
**Status:** Approved (user: "take it all the way to a PR")
**Source of truth:** the design-system project's pipeline mock (screenshot reviewed 2026-08-13); production baseline is PR #77 (KPI header) + PR #63 (pipeline redesign).

## 1. Purpose

Close the visible gap between the design mock and production: sidebar information architecture, one missing KPI, a 12-month revenue chart, stage-column totals in headers, the won/lost summary on both views, and card health copy in the mock's voice. No data-model changes, no migrations, no new pages.

## 2. Out of scope

- Anything requiring vendor price books (increment 3 of the ops-catalog spec) — the Vendors *link* moves, the Vendors *page* is unchanged.
- Proposal-open data for cards in non-proposal stages (page only fetches proposals for `proposal`-stage leads today; unchanged).
- The design tool itself — no Figma export/import; parity is rebuilt in the existing components.

## 3. Sidebar IA (`components/layout/AdminSidebar.tsx`)

Target structure (org mode), matching the mock:

| Section | Links (order) | Gates |
|---|---|---|
| Quick Links | Calendar, Clients, Events, Today, Registrants | `calendar`, `clients`, `events` (exact-match `/{org}`), `leads`, `registrants` |
| Sales | Pipeline (▾ Proposals, Invoices) | unchanged |
| Operations | Vendors, {catalogLabel}, Forms, Compliance | `vendors`, `catalog`, `forms` (new module id), `compliance` |
| Insights | Reports | unchanged |
| Settings | unchanged | unchanged |

- The standalone **Events section is removed**; its links move into Quick Links (mock order: Calendar, Clients, Events, Today; Registrants appended last — the mock omits it because BrewTrax doesn't use it).
- **Vendors moves** from the old Events section into Operations.
- **Forms gets its first org-level sidebar link** (the page `/{org}/forms` has existed without one). A `'forms'` ModuleId is added to `lib/industry-packs.ts`: appended to the union, to `ALL_CURRENT_MODULES`, and to every built-in pack's `modules` list that enumerates modules explicitly — the page is reachable by all orgs today, so no pack loses it.
- The Operations section renders when it has ≥1 link (same pattern as today).

## 4. Pipeline header (`components/admin/pipeline/PipelineStatsHeader.tsx`)

- **KPI row goes from 3 to 4 cards**, mock order: Booked this month · Booked ahead (next 90 days) · **Open pipeline** · Needs action. Open pipeline = count + total `estimated_value` of open-stage opportunities (`{ count, value }`, sub-copy `N opportunities`). Grid `sm:grid-cols-2 lg:grid-cols-4`.
- **Chart**: title becomes **"Revenue by month"**; legend becomes **"rolling 12 months · solid booked · light open"**; the page passes `backlogByMonth(leads, today, 12)` (function already accepts a months param; default stays 6 so other callers are unaffected).

## 5. Board & list (`PipelineBoardView.tsx`, `PipelineListClient.tsx`)

- **Column headers** show `count · $total` right-aligned (replacing the count-only Badge); the duplicate column-footer line is removed.
- **Won/lost summary** ("Won this month: N · $X — moved to Events · Lost: N · $Y · archived") is extracted into a shared `ClosedMonthSummary` component rendered by BOTH board (replacing its inline copy) and list (new — the list currently drops the lost half).
- **Card health emphasis**: on board cards and list rows, the `statusLine` renders in the destructive color when `health === 'needs_attention'`; board cards additionally get a small destructive dot before the title (mock's indicator), keeping the existing left-border accent.

## 6. Health copy (`lib/pipeline-view.ts`)

New statusLine voice, matching the mock:

| Health case | Old | New |
|---|---|---|
| Unopened sent proposal | `proposal sent 9 days ago, unopened` | `Proposal sent 9 days ago — no opens` |
| No next step | `Sep 4 · 60 guests · no task, no touch in 11 days` | `No next step — last touched 11 days ago` |
| Waiting | `Waiting: PO number · follow up 2026-08-09` | `Waiting on them — PO number · follow up 2026-08-09` |
| Active | `Next: Send options · due 2026-08-07` | unchanged |

The dropped date/guests fragment is not lost: board cards already show `event_type · date` as the subtitle, and list rows carry stage/value/countdown badges.

## 7. Ride-along fixes

- `PipelineListClient.tsx` renders `IntakeLinkCard` twice (lines 145 & 147) — remove the duplicate.
- `closedThisMonth` (pipeline-view) re-implements won-this-month math that `wonValueInMonth` (pipeline-stats) already owns — `closedThisMonth` now delegates to it (import direction pipeline-view → pipeline-stats; no cycle).

## 8. Testing

- `pipeline-view.test.ts`: statusLine expectations updated to the new copy; `closedThisMonth` behavior unchanged (same shape, delegation is internal).
- `pipeline-stats.test.ts`: add a 12-month `backlogByMonth` case (length + label wrap across year end).
- `AdminSidebar.test.tsx`: updated for the new sections (Operations contains Vendors/Forms; Events section gone; Quick Links order).
- New light component tests: `PipelineStatsHeader` renders 4 KPIs incl. "Open pipeline"; `PipelineListClient` renders exactly one intake card and the won/lost summary.
