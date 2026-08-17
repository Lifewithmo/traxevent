# Calendar Scheduling Cockpit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Design source of truth:** [`2026-08-16-calendar-cockpit-design.md`](../specs/2026-08-16-calendar-cockpit-design.md) (the spec) and the published cockpit mockup. Component tasks below give interfaces, test cases, and structure; the spec carries the visual detail — do not re-invent layout, read the spec.

**Goal:** replace the week-grid calendar with a three-pane scheduling cockpit — persistent left rail, view-switching center canvas (Month/Week/Day/Agenda) with a hybrid time-grid + all-day band, and a live-swapping day-detail spine — plus a cash-flow runway to the next booked job.

**Architecture:** a nested App-Router layout (mirrors the Clients cockpit) holding a bounded org feed, a `/calendar/[ymd]` day route for the spine, and new pure derivations for time projection, Booked-$, and the runway. All views render the existing unified `CalendarItem[]`.

**Tech stack:** Next.js 16 App Router (Turbopack), React 19, TypeScript, Tailwind v4, Base UI, `components/ui/` kit, Firestore via server actions (`adminDb`). Tests: vitest 4 + `@testing-library/react` + jsdom, in `__tests__/` mirroring source.

## Global Constraints

- **No Firestore migration.** Every task is a projection of existing fields or a UI addition. `CalendarItem` is an in-memory feed type — extend it freely.
- **`buildCalendarFeed` stays the single feed source** for all views. Add pure filters/derivations alongside it; never fork a parallel fetch path per view.
- **Booked-$ = `Lead.estimated_value` where `stage === 'closed_won'`, bucketed by `Lead.event_date`.** NEVER `Event.payment_amount` (a registration fee, unset for client jobs) or `Event.booth_fee` (an expense). Reuse `lib/pipeline-stats.ts` / `lib/leads.ts` logic.
- **Runway join = `Invoice.lead_id → Event`** (bulk-fetch events, group by `lead_id`), NOT `Lead.event_date` (goes stale on reschedule). `Event.lead_id` is not 1:1 — when multiple events share a lead, pick the **nearest future `event_start`**.
- **Runway is receivables-timing, never a P&L.** UI copy must not imply profit or cost-based runway.
- **Hybrid rendering:** timed items (events with `hours`, drop windows) on the time-grid; everything else (due-that-day kinds, events lacking hours as "time TBD") in the all-day band. Never pin a due-date to a fake hour.
- **Reuse the kit verbatim:** `RelatedRecordCard`/`RelatedRow`, `KpiBand`(+`inset`), `StatTile`, `StatusPill`, `EmptyState`, `TabLinks`, `Menu`, `Sheet`. `components/ui/**` is frozen (consume, never edit; importing exported symbols is allowed).
- **Tokens only** — zero raw Tailwind color literals; the surface must be ready for the Signal palette sweep. **WCAG 2.2 AA** on every status/KPI pairing.
- **Every empty state renders one specific next-action CTA** (no blank pane). **Keyboard + `⌘K`** ship in this increment. **`prefers-reduced-motion`** honored on the pane-swap.
- **Preserve URL params** (`?view`/`?kinds`/`?week`) across every internal nav, including the new `/calendar/[ymd]` route (extend the existing `weekHref()` preservation pattern).
- Run `next build` before calling any branch green (a `'use server'` type re-export breaks the build even when `tsc` passes).

## File Structure

**Data layer (pure + server):**
- Modify `lib/calendar.ts` — extend `CalendarItem` (`start?`/`end?`), project `Event.hours`, emit one item per drop window, add `feedForDay`, thread `bookedValue`.
- Modify `lib/calendar-week.ts` — add `bookedValue` to `weekRollup`.
- Create `lib/calendar-cashflow.ts` — `buildRunway`.
- Modify `actions/calendar.ts` — add `getDayDetail` (day-join fetcher).

**Components (`components/admin/calendar/`):**
- Create `TimeGridDay.tsx` — the hybrid all-day-band + time-grid primitive.
- Create `MonthGrid.tsx`, `DayView.tsx`; extract `WeekGrid.tsx`, `AgendaView.tsx` from `CalendarWeekClient.tsx`.
- Create `CalendarLeftRail.tsx`, `CalendarCanvas.tsx` (view switch + ⌘K), `DaySpine.tsx`, `RunwayStrip.tsx`.
- Relocate `CalendarKpiBand.tsx` (add `bookedValue` tile) into the left rail; retire the standalone `CalendarWeekClient.tsx` once its parts are extracted.

**Routing (`app/(admin)/[orgSlug]/calendar/`):**
- Convert `page.tsx` → `layout.tsx` (bounded feed + left rail) + a thin `page.tsx` (redirect to today's view).
- Create `[ymd]/page.tsx` (day spine).

**Booking form:**
- Modify the client-job create action/form and event settings page to expose an optional start/end time writing `Event.hours`.

---

### Task 1: Time projection + drop-window emission on `CalendarItem`

**Files:**
- Modify: `lib/calendar.ts`
- Test: `__tests__/lib/calendar.test.ts`

**Interfaces:**
- Produces: `CalendarItem` gains `start?: string; end?: string` (`'HH:mm'`). `buildCalendarFeed` projects `Event.hours` onto `event` items and emits **one item per `DropPickupWindow`** (with `start`/`end`) instead of one per distinct day.

- [ ] **Step 1: Write failing tests**

```ts
import { buildCalendarFeed } from '@/lib/calendar'
test('projects Event.hours onto event items', () => {
  const items = buildCalendarFeed('org', { events: [
    { id: 'e1', title: 'Wedding', event_start: '2026-08-22', kind: 'client_job', hours: { start: '16:00', end: '21:00' } } as any,
  ], leads: [], tasksByLeadId: {}, complianceDocs: [], invoices: [], drops: [] })
  const ev = items.find(i => i.id.includes('e1'))!
  expect(ev.start).toBe('16:00'); expect(ev.end).toBe('21:00')
})
test('event without hours has no time (falls to all-day)', () => {
  const items = buildCalendarFeed('org', { events: [
    { id: 'e2', title: 'Job', event_start: '2026-08-22', kind: 'client_job' } as any,
  ], leads: [], tasksByLeadId: {}, complianceDocs: [], invoices: [], drops: [] })
  const ev = items.find(i => i.id.includes('e2'))!
  expect(ev.start).toBeUndefined(); expect(ev.end).toBeUndefined()
})
test('emits one item per drop pickup window, carrying its times', () => {
  const items = buildCalendarFeed('org', { events: [], leads: [], tasksByLeadId: {}, complianceDocs: [], invoices: [], drops: [
    { id: 'd1', title: 'Drop', windows: [
      { date: '2026-08-18', start: '16:00', end: '18:00' },
      { date: '2026-08-18', start: '19:00', end: '20:00' },
    ] } as any,
  ] })
  const dropItems = items.filter(i => i.kind === 'drop')
  expect(dropItems).toHaveLength(2)
  expect(dropItems.map(i => i.start).sort()).toEqual(['16:00', '19:00'])
})
test('date-only kinds carry no time', () => {
  const items = buildCalendarFeed('org', { events: [], leads: [], tasksByLeadId: {}, complianceDocs: [],
    invoices: [{ id: 'i1', lead_id: 'l1', lifecycle: 'sent', due_date: '2026-08-20', /* +balance */ } as any], drops: [] })
  const inv = items.find(i => i.kind === 'invoice_due')
  expect(inv?.start).toBeUndefined()
})
```

- [ ] **Step 2: Run — expect FAIL** (`start`/`end` undefined; drop count 1). `npx vitest run __tests__/lib/calendar.test.ts`
- [ ] **Step 3: Implement.** Add `start?`/`end?` to the `CalendarItem` interface. In the event loop, add `...(e.hours ? { start: e.hours.start, end: e.hours.end } : {})`. Replace the drop loop's day-dedup (lib/calendar.ts ~193-206) with a per-window `flatMap` emitting `{ ..., date: w.date.slice(0,10), start: w.start, end: w.end }`. Confirm `DropPickupWindow` shape via `lib/storefront/drops.ts` / `lib/types.ts:801`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(calendar): project event/drop times onto the feed`

---

### Task 2: `feedForDay` pure filter

**Files:** Modify `lib/calendar.ts`; Test `__tests__/lib/calendar.test.ts`

**Interfaces:** Produces `feedForDay(items: CalendarItem[], ymd: string): CalendarItem[]` (items whose `date` equals `ymd`; multi-day events where `event_start <= ymd <= event_end` also included). Consumes: nothing new. `feedInRange` already exists — reuse for the layout window.

- [ ] **Step 1: Failing test** — `feedForDay(items, '2026-08-22')` returns only that day's items; a multi-day event spanning the 22nd is included.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** the pure filter beside `feedInRange`.
- [ ] **Step 4: Run — PASS.**  **Step 5: Commit** — `feat(calendar): feedForDay filter`

---

### Task 3: Booked-$ projection (`bookedValue`)

**Files:** Modify `lib/calendar.ts`, `lib/calendar-week.ts`; Test `__tests__/lib/calendar-week.test.ts`

**Interfaces:** Produces: `WeekRollup` gains `bookedValue: number`. Consumes: `Lead.estimated_value`, `Lead.stage`, `Lead.event_date`; mirror `lib/leads.ts` `bookedValue`.

- [ ] **Step 1: Failing tests**

```ts
import { weekRollup } from '@/lib/calendar-week'
test('bookedValue sums closed_won estimated_value in the week, by event_date', () => {
  const leads = [
    { id: 'a', stage: 'closed_won', estimated_value: 8000, event_date: '2026-08-22' },
    { id: 'b', stage: 'closed_won', estimated_value: 4400, event_date: '2026-08-19' },
    { id: 'c', stage: 'proposal', estimated_value: 9999, event_date: '2026-08-20' },
  ] as any
  const r = weekRollup(/* week items derived incl leads */ leadsToWeekItems(leads), new Date('2026-08-18'))
  expect(r.bookedValue).toBe(12400)
})
test('ignores Event.payment_amount and booth_fee entirely', () => {
  // an event carrying payment_amount/booth_fee contributes 0 to bookedValue
})
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — thread `estimated_value` for `stage==='closed_won'` leads onto their `lead` feed items (or compute in `weekRollup` from the lead source), sum into `bookedValue`. Confirm exact stage/field names against `lib/pipeline-stats.ts` `wonValueInMonth`.
- [ ] **Step 4: PASS.**  **Step 5: Commit** — `feat(calendar): booked-value rollup from closed-won leads`

---

### Task 4: `lib/calendar-cashflow.ts` — `buildRunway` (category-defining)

**Files:** Create `lib/calendar-cashflow.ts`; Test `__tests__/lib/calendar-cashflow.test.ts`

**Interfaces:**
- Produces:
```ts
export interface RunwayJob { eventId: string; title: string; date: string; inflowBefore: number; dueAfter: number }
export function buildRunway(items: CalendarItem[], events: Event[], today: Date): RunwayJob[]
```
Ordered upcoming booked events (future `event_start`, ascending). `inflowBefore` = sum of `invoice_due` item `amount`s whose invoice's lead resolves (via `lead_id → Event`, nearest-future) to this event AND whose due date ≤ the event date. `dueAfter` = the remainder due after. Receivables timing only — no cost/P&L field.

- [ ] **Step 1: Failing tests**

```ts
test('inflow counted only before the booked job date', () => { /* invoice due 8/20 counts for a job on 8/22; due 8/25 does not */ })
test('multi-event lead resolves to the nearest future event', () => {
  // lead L has events 8/22 and 9/30; an invoice on L due 8/20 attaches to the 8/22 job, not 9/30
})
test('never emits a cost/profit field', () => {
  const r = buildRunway(items, events, today)
  expect(Object.keys(r[0])).toEqual(['eventId','title','date','inflowBefore','dueAfter'])
})
```

- [ ] **Step 2: FAIL.**  **Step 3: Implement** the join (bulk-group events by `lead_id`; nearest-future resolver) + the before/after split. Pure, no fetch.
- [ ] **Step 4: PASS.**  **Step 5: Commit** — `feat(calendar): cash-flow runway to next booked job`

---

### Task 5: `getDayDetail` day-join fetcher

**Files:** Modify `actions/calendar.ts`; Test `__tests__/actions/calendar.test.ts` (mock `adminDb` core reads as elsewhere)

**Interfaces:** Produces `getDayDetail(orgSlug, ymd): Promise<{ events; tasks; blockers; related: Record<eventId,{ job; proposals; invoices }> }>`. Resolves each day event's `lead_id` → proposals + invoices via `listAllInvoicesCore` / proposals-by-lead (Promise.all fan-out, mirroring `lib/calendar-feed.ts`). Multi-event lead: attribute by nearest event (same resolver as Task 4).

- [ ] Steps: failing test (a day with one event returns its linked proposal + invoice rows) → implement fan-out join → PASS → commit `feat(calendar): day-detail join fetcher`.

---

### Task 6: Extract `WeekGrid` + `AgendaView` (refactor, no behavior change)

**Files:** Create `components/admin/calendar/WeekGrid.tsx`, `AgendaView.tsx`; Modify `CalendarWeekClient.tsx`; Test existing `__tests__/components/admin/calendar/CalendarWeekClient.test.tsx` must stay green.

**Interfaces:** Produces `WeekGrid({ items, weekStart, selected })` and `AgendaView({ items })` over `CalendarItem[]`. Pure presentational; no data changes.

- [ ] Extract with tests staying green (characterization refactor). Commit `refactor(calendar): split week/agenda into standalone views`.

---

### Task 7: `TimeGridDay` — hybrid all-day band + time-grid primitive

**Files:** Create `components/admin/calendar/TimeGridDay.tsx`; Test `__tests__/components/admin/calendar/TimeGridDay.test.tsx`

**Interfaces:** Consumes `CalendarItem[]` for one day. Renders an **all-day band** (due-that-day kinds + events lacking `start` shown as "time TBD") and a **time-grid body** (items with `start`/`end` positioned by time, height ∝ duration; drop windows included).

- [ ] **Step 1: Failing tests**
```ts
test('an event with hours renders in the time grid, positioned by start', () => {/* getByText('Wedding') has style top matching 16:00 */})
test('an event without hours renders in the all-day band as "time TBD"', () => {/* getByText(/time tbd/i) */})
test('invoice_due / compliance / task render in the all-day band, never the grid', () => {})
test('a drop window renders on the grid at its start', () => {})
```
- [ ] Implement (position math: `top = (startHour - dayStart) * PX_PER_HOUR`, `height = duration * PX_PER_HOUR`; tokens only). PASS. Commit `feat(calendar): hybrid time-grid + all-day band`.

---

### Task 8: `MonthGrid` — density dots + count

**Files:** Create `components/admin/calendar/MonthGrid.tsx`; Test alongside.

**Interfaces:** `MonthGrid({ items, month, selected })` — each day shows up to N kind-colored dots + an overflow count (decision #2). Empty month → `EmptyState` CTA.

- [ ] Failing test (a day with 3 events shows 3 dots; a day with 6 shows dots + "+N") → implement → PASS → commit `feat(calendar): month view with density dots`.

---

### Task 9: `DayView` — single-day hybrid grid

**Files:** Create `components/admin/calendar/DayView.tsx` (composes `TimeGridDay`); Test alongside.

- [ ] Failing test → implement (reuse Task 7 primitive full-width) → PASS → commit `feat(calendar): day view`.

---

### Task 10: Nested layout + bounded feed + redirect page

**Files:** Create `app/(admin)/[orgSlug]/calendar/layout.tsx`; rewrite `page.tsx` (redirect to today's Week view, preserving params); Test `__tests__/…/calendar-layout` + a param-preservation unit test for the href helper.

**Interfaces:** `layout.tsx` fetches `assembleCalendarFeed` **bounded via `feedInRange`** to the visible window, renders `<CalendarLeftRail>` + `{children}`. Produces a `calendarHref({ view, kinds, week, ymd })` helper that preserves all params (extends `weekHref()`).

- [ ] **Constraint check:** confirm the layout does not re-fetch the whole unbounded feed on day-nav (bound it). Failing test for `calendarHref` param preservation → implement layout + redirect + helper → PASS → `next build` → commit `feat(calendar): nested cockpit layout + bounded feed`.

---

### Task 11: `CalendarLeftRail` (mini-month + filters + KPIs + runway)

**Files:** Create `CalendarLeftRail.tsx`, `RunwayStrip.tsx`; move `CalendarKpiBand` in (add the `bookedValue` StatTile, `KpiBand inset`); Test alongside.

**Interfaces:** Consumes the feed + `buildRunway` output. `RunwayStrip` renders receivables-timing rows (decision #1) — copy must not imply profit.

- [ ] Failing tests (KPI band shows Booked-$ from `bookedValue`; runway strip lists upcoming jobs with `inflowBefore`, labeled receivables-timing; empty runway → EmptyState "Open pipeline") → implement → PASS → commit `feat(calendar): left rail with runway strip`.

---

### Task 12: Day-detail spine route + `DaySpine`

**Files:** Create `app/(admin)/[orgSlug]/calendar/[ymd]/page.tsx`, `components/admin/calendar/DaySpine.tsx`; Test alongside.

**Interfaces:** `[ymd]/page.tsx` calls `getDayDetail`; `DaySpine` renders the event card, prep tasks, **folded-in blockers/attention** (decision #3 — no separate rail), `RelatedRecordCard`s (job/proposals/invoices), and the day's runway line. Deep-linkable; live-swaps on selection.

- [ ] Failing tests (spine for a day renders its event + linked proposal/invoice RelatedRows with amounts; blockers shown inline; empty day → EmptyState "Book a job") → implement → PASS → `next build` → commit `feat(calendar): live day-detail spine`.

---

### Task 13: `CalendarCanvas` — view switching + ⌘K + keyboard

**Files:** Create `CalendarCanvas.tsx`; Test alongside.

**Interfaces:** `TabLinks` Month/Week/Day/Agenda (param-preserving); a `⌘K` command bar (Base UI) for jump-to-date + create; keyboard: view keys, day nav, `⌘K` open. `≤7±2` palette results (Miller); nav round-trips optimistic/<400ms; `prefers-reduced-motion` on swap.

- [ ] Failing tests (tab switch preserves `?kinds`; `⌘K` opens and filters; arrow keys move day; reduced-motion disables transition) → implement → PASS → commit `feat(calendar): view switch, command bar, keyboard`.

---

### Task 14: Client-job booking time input (writes `Event.hours`)

**Files:** Modify the client-job create action/form (`actions/events.ts` input + the `/new-event` form) and the event settings page to expose an optional start/end time for `client_job` (currently market-day-only); Test `__tests__/actions/events` + the settings component test.

**Interfaces:** Adds optional `hours?: EventHours` to the client-job create input and settings edit; writes the **existing** `Event.hours` field. No schema change. Optional (blank → all-day "time TBD").

- [ ] **Step 1: Failing tests** — creating a client job with `hours` persists them; without `hours` still succeeds; the settings page renders a time input for `client_job` (not only `market_day`).
- [ ] Implement (thread `hours` through `createEvent` input → `createEventCore`; add the time input to the client-job form + settings gate) → PASS → `next build` → commit `feat(events): optional start/end time on client-job bookings`.

---

### Task 15: Hard gates + polish pass

**Files:** across the calendar module; Test where assertable.

- [ ] WCAG AA: every status/KPI/kind color pairing ≥ 4.5:1 (body) / 3:1 (UI) against tokens; day-cell targets ≥24px. Dark mode renders (module tokens; note the shell `bg-gray-50` blocker is out of scope). `prefers-reduced-motion` verified. Every empty state has a single CTA. **Bulk multi-select on the Agenda list** (select → bulk reschedule/tag). Tests for the assertable ones (empty-state CTAs present; bulk selection toggles). Commit `feat(calendar): accessibility, reduced-motion, bulk actions`.

---

### Task 16: Integration + walkthrough checklist

**Files:** none (verification task).

- [ ] Full suite + `next build` green. Retire `CalendarWeekClient.tsx` if fully superseded. Produce the authenticated-walkthrough checklist (ISO 9241-210 gate): time-grid populated for a market-day org; client jobs in the all-day band pre-time-input then on the grid after; day-spine live-swap + deep link; runway math; `⌘K`; param preservation across day/view nav; dark mode; reduced motion. Commit `chore(calendar): integration + walkthrough checklist`.

---

## Self-Review

- **Spec coverage:** frame (T6–T13), category-defining runway (T4, T11, T12), Booked-$ correct source (T3), hybrid time-grid (T7, T9), booking-time input (T14), routing/param preservation (T10, T13), hard gates (T15). ✅ All §-referenced spec items map to a task.
- **Verified-feasibility fidelity:** Booked-$ excludes `payment_amount`/`booth_fee` (T3 constraint + test); runway joins `Invoice.lead_id→Event` nearest-future (T4 test); drive-time/offline correctly absent (phase-2 per spec §9). ✅
- **Type consistency:** `CalendarItem.start/end` (T1) consumed by `TimeGridDay` (T7); `RunwayJob` (T4) consumed by `RunwayStrip` (T11) + `DaySpine` (T12); `getDayDetail` shape (T5) consumed by T12. ✅
- **No migration:** every task is projection or UI. ✅

## Execution Handoff

**Plan complete and saved.** Two options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration (superpowers:subagent-driven-development).
2. **Inline** — batch execution with checkpoints (superpowers:executing-plans).
