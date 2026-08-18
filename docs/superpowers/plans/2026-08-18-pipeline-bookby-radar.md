# Pipeline: Book-By Capacity Radar (increment 1) — Implementation Plan

> **For agentic workers:** implement task-by-task; each ends with an independently testable deliverable.

**Goal:** Make the Pipeline rank by the **event deadline**, not touch-staleness, and flag **same-day booking conflicts** — the category-defining move from the design-ambition panel. An unbooked wedding 8 days out must outrank a stale inquiry 9 months out; two open deals for the same Saturday (which a solo operator can't both serve) must be flagged.

**Architecture:** All in-memory — the list server component already loads every lead (open + won) with `event_date`. One new org scalar (`prep_lead_days`, default 14). No new queries.

**Tech Stack:** Next.js 16 App Router (RSC), Firestore, React 19, vitest.

## Global Constraints
- **Zero new queries.** The list (`app/(admin)/[orgSlug]/leads/page.tsx:29`) already `listLeads(orgId)` — all open + closed_won leads with `event_date` are in memory. Do NOT reach for `listCalendarRange` (it's N+1 from the list).
- **Capacity = 1 for v1** — any two leads (OPEN_STAGES ∪ closed_won) sharing an `event_date` is a conflict. Correct for the solo-operator anchor customer; a per-org `daily_event_capacity` upgrade is deferred.
- **`prep_lead_days` default = 14** — a single tunable constant; no settings UI in v1 (field exists for future tuning).
- **`event_date` is OPTIONAL** (`lib/types.ts:439`). Leads with no date must NOT crash or sort wrong — they go to a "no date" tail, never into the conflict map.
- `next build` must pass. Pure logic must be unit-tested with real assertions (no tautologies).

---

### Task 1: Book-by ranking + conflict computation (pure/data)

**Files:**
- Modify: `lib/types.ts` — add `prep_lead_days?: number` to `interface Org` (~lib/types.ts:9-31).
- Modify: `lib/pipeline-view.ts` — `PipelineRow` + `buildPipelineRows` (:8-14, :38-86).
- Modify: `app/(admin)/[orgSlug]/leads/page.tsx` — read the org scalar (org doc already loaded ~:25-27) + build the conflict set, thread both into `buildPipelineRows`.
- Test: `__tests__/lib/pipeline-view.test.ts` (extend or create).

**Interfaces — Produces:**
- `const DEFAULT_PREP_LEAD_DAYS = 14` (exported from pipeline-view or a constants module).
- `PipelineRow` gains: `eventDate?: string`, `bookByDate?: string`, `daysToBookBy?: number`, `conflict?: boolean`.
- `buildPipelineRows(..., opts: { prepLeadDays: number; conflictDates: Set<string> })` — computes `bookByDate = addDaysYmd(eventDate, -prepLeadDays)` (helper exists: `lib/pipeline-stats.ts:21`), `daysToBookBy = daysBetween(today, bookByDate)`, and `conflict = eventDate != null && conflictDates.has(eventDate)`.
- **Sort change** (`:80-84`): within each health group, order by **conflict first**, then **book-by ascending** (soonest deadline first), then **no-date rows last** (null tail). Touch-staleness (`byOldestTouch`) becomes the final tiebreaker only.
- In `page.tsx`: `prepLeadDays = org.prep_lead_days ?? DEFAULT_PREP_LEAD_DAYS`; `conflictDates` = set of `event_date`s shared by ≥2 leads whose stage ∈ `OPEN_STAGES ∪ {closed_won}` (in-memory `reduce` over the already-loaded `leads`).

**Steps:**
- [ ] Write failing tests: an open opp with event in 8 days ranks above one with event 9 months out (both same health group); a no-date opp sorts to the tail; two leads on the same `event_date` are both `conflict: true` and sort first; different dates → no conflict; book-by = event − 14; a closed_won on a date makes an open opp that day a conflict.
- [ ] Implement the org field, the row datums, the conflict set (page), and the comparator.
- [ ] `next build` + tests green; commit.

---

### Task 2: Book-by urgency chip + conflict badge + double-booked-won warn (UI)

**Files:**
- Modify: `components/admin/pipeline/PipelineListClient.tsx` — the row render (~:118) + `handleStageChange` (~:72-85).

**Interfaces — Consumes:** the `PipelineRow` datums from Task 1 (`eventDate`, `bookByDate`, `daysToBookBy`, `conflict`).
**Behavior:**
- **Urgency chip** on each open row: show the event date + book-by, e.g. `Event Aug 22 · book by Aug 8 · 5d left`; escalate to the alert tone when `daysToBookBy <= 7` (and past-due when `< 0`). This is the row's dominant time cue; the existing task-countdown becomes secondary metadata.
- **Conflict badge** on rows with `conflict === true`: an alert-tone badge, e.g. `Date conflict — Sat Aug 22`.
- **Double-booked-won warn**: in `handleStageChange`, before calling `setLeadStage(..., 'closed_won')` (~:77), if the lead's `event_date` matches another `closed_won` lead already in `closed`/`groups` props, `window.confirm('Another job is already booked for <date>. Book this one too?')` — proceed only on confirm; otherwise abort (no stage change).

**Steps:**
- [ ] Render the urgency chip + conflict badge from the row datums; verify no-date rows render gracefully (no chip, or a quiet "no date").
- [ ] Add the same-day won-confirm guard using props already present (no new data).
- [ ] `next build`; commit. (UI — covered by the live walkthrough.)

## Self-Review
- Covers the increment-1 scope: book-by ranking + chip (Task 1+2) and same-day conflict radar + won-warn (Task 1+2). ✅
- Deferred (NOT here): date-bucket list backbone, serviceable-ceiling forecast + capacity>1, deadline-aware `computeHealth`, per-event-type lead times, server-side hard block.
- Type consistency: `PipelineRow` fields named once in Task 1 and consumed verbatim in Task 2.
