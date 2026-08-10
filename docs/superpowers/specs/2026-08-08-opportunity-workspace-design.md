# Opportunity Workspace — Design

**Date:** 2026-08-08
**Status:** approved in brainstorming; feeds the opportunity-workspace implementation plan.
**Source:** "Wireframe screens request" design handoff (README + `BrewTrax Ops Wireframes.dc.html`), screens 12c (opportunity detail), 13a–b (empty-state density), 14a (attachment pills), 18a–d (dates window). First of three increments from the handoff; increment 2 (pipeline sub-nav, #16a) and increment 3 (org calendar week view #15a + ICS sync #15b) get their own specs.

## Problem

The opportunity page has the right panels in the wrong shape. The right column holds Tasks and Activity while the record (contact, facts, convert) fills the left — but below the grid, `page.tsx` stacks the attachment chips *and* four full document lists that repeat what the chips already say, so an empty record still runs ~1500px deep. The admin shell is a dark sidebar in an app whose pages are light. And nothing on the page answers the quoting operator's real question — *"can I take that date?"* — which only other bookings can answer.

## Decisions

| Question | Decision |
|---|---|
| Scope | The four handoff changes only. Sub-nav (#16a), week view (#15a), ICS (#15b) are increments 2–3. |
| Base | Branch `claude/opportunity-workspace` off main (PR #63 merged first). |
| Sidebar | Re-skin only — the README's six class replacements plus the optional active-item left border and settings-hover fix. No structural change. |
| Column roles | Left = the record (contact strip → facts grid → pill row → convert card). Right = the working column (DatesPanel → activity). `TasksPanel` moves into the pill row as the default pane. The 3/2 `grid-cols-5` split and `max-w-6xl` already landed in PR #63. |
| Pill row | One "Tasks & documents" row under the facts grid: Tasks, Proposals, Invoices, Contracts, Vendors. Selecting a pill expands exactly one pane beneath the row; Tasks is the default; zero-count pills stay. The four `Lead*Client` components become panes — moved, not rewritten — and leave the page body. |
| DatesPanel day click | **Pins** the window on that day (click again or Esc unpins) so the list can be scrolled. Clicking never writes `event_date`; changing the date stays an explicit facts-grid edit. (User-confirmed.) |
| Cross-lead task data | Per-open-lead parallel fetches, as the pipeline page already does. Never a bare `collectionGroup('tasks')` — it spans orgs (tenancy leak) and tasks carry no org field. |
| Carried fix | `useDismissable` captures the trigger element explicitly at open time (PR #63's parked finding: `MarkWaitingForm`'s `autoFocus` input beats the hook's `document.activeElement` capture, breaking focus-return). `MarkWaitingForm` gets its own dismissal test. |

## 1. Sidebar → light shell

`components/layout/AdminSidebar.tsx`, color classes only, per the README's find/replace table (rows 4–5 apply in both `navClass()` and `exactNavClass()`); active item also gets `border-l-2 border-gray-900`; settings toggle hover `text-gray-300` → `text-gray-700`. `__tests__/components/AdminSidebar.test.tsx` assertions that pin the dark classes update to the light ones.

## 2. Opportunity page composition

`OpportunityDetailClient` keeps its header, banner, and 3/2 grid; the columns change to:

- **Left (span 3):** `ContactCard` strip → `FactsGrid` → **pill row** (§3) → `ConvertToWorkCard`.
- **Right (span 2):** **`DatesPanel`** (§4) → `ActivityTimeline`.

`TasksPanel` leaves the right column; the `?focus=task` deep link now also selects the Tasks pill before focusing the input.

**Empty-state density (13a/13b).** A section with nothing in it renders one line of text with an inline action — not a bordered card around a sentence. Composers open on demand: the activity note textarea and the task-input row render as an "Add a note…" / "Add a task…" affordance that expands on click (auto-focused), collapsing again on blur when empty. Applies to `ActivityTimeline`, `TasksPanel`, and the pill panes' empty states.

## 3. Tasks & documents pill row

`attachmentChips()` (`lib/opportunity-detail.ts`) gains a leading `tasks` entry: count = open (not-done) tasks; hint = `N overdue` when any open task's `due_date` is past, else `next due <date>` for the soonest dated open task, else none. `AttachmentChip.kind` gains `'task'`, and the chip model gains `danger?: boolean` — true for `N overdue`, `unsigned`, and `unpaid`, replacing today's undifferentiated muted hint.

`AttachmentChips.tsx` becomes the toggle row: each pill a `button` with `aria-pressed`, label `{name} {count} · {hint}`, danger hints in the destructive color, section label "Tasks & documents". The selected pill's pane renders beneath the row: `TasksPanel`, `LeadProposalsClient`, `LeadInvoicesClient`, `LeadContractsClient`, `LeadVendorsClient` — removed from `page.tsx`'s body and passed through unchanged. Selection is client state (Tasks default); only one pane open at a time.

## 4. DatesPanel

`components/admin/opportunity/DatesPanel.tsx` + pure helpers in `lib/date-window.ts`.

**Structure, top to bottom:** header ("Dates" + relative distance to the event — "28 days out" / "today" / "3 days ago"); ten-day strip (caret, range label "AUG 9 – 18", `←` `→` sliding ±10 days); month grid (collapsed by default, unfolds *beneath* the strip so nothing above moves, ten window days shaded, Monday-first, own `←` `→` paging by month); list of what's in the window, one line per item.

**Window math:** center = `lead.event_date`, else today. Ten days = 5 before, center, 4 after.

**Day cells:** weekday initial, day number, stacked bars — booked event = solid dark full-height; tentative/unconverted opportunity date = dashed outline full-height; task due = short grey bar. Event day gets a filled number chip; hovered day an outlined one. Every chip and bar is `box-sizing: border-box`, and unemphasized chips carry `border: 1px solid transparent` — without this the bordered variants lay out 2px larger, dropping the emphasized column and making tentative bars read heavier than booked ones (a real, fixed wireframe defect).

**Hover (month grid):** re-centers the strip on the hovered day (same 5/4 rule), header becomes "previewing {date}" in the destructive color, range label likewise; leaving the grid restores the event-centered window. `hoverDate` is local state only — hovering never writes.

**Pin (click):** clicking a day pins the window there (hover no longer overrides; list is scrollable); clicking the pinned day again, or Esc, unpins. Pinning never writes.

**Data:** `CalendarItem.kind` grows to `'event' | 'lead' | 'task'` (`buildCalendar()` signature unchanged; increments 2–3 add `'followup' | 'compliance' | 'invoice'`). New `actions/calendar.ts` server action `listCalendarRange(orgId, fromYmd, toYmd)` → `CalendarItem[]`: org member gate; events by `event_start` in range; unconverted-lead `event_date`s in range (skipping leads already scheduled, as `buildCalendar` does); open tasks with `due_date` in range via per-open-lead parallel fetches, each item linking to its lead. The page server-loads the default window's items; the panel calls the action when the strip slides, the month opens or pages, or a hover/pin window escapes the already-fetched range — fetched ranges are cached in component state so hover previews inside the cache never refetch.

## Testing

Pure vitest coverage in `lib/`: window math (center rules, ±10 slide, range label), month-grid math (Monday-first weeks, shading membership), relative-distance label, day bucketing by kind, the tasks chip entry (overdue/next-due/none hints, danger flag), `listCalendarRange` assembly rules (scheduled-lead skip). Component tests: pill row toggling (default Tasks, one-pane-at-a-time, `aria-pressed`, danger hint), DatesPanel hover preview + pin/unpin + Esc, `MarkWaitingForm` dismissal with focus-return. Sidebar test updates. `next build` green before merge; emulator walkthrough for the visual flows.

## Out of scope

Increments 2–3 (pipeline sub-nav, org week view, ICS sync); OAuth two-way calendar sync; compliance-per-event (#11a); any write from the DatesPanel; touch/drag polish on the month grid.
