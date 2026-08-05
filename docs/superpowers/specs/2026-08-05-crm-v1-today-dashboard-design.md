# CRM V1 — Today Dashboard (Increment 3) Design

**Date:** 2026-08-05
**Status:** approved in brainstorming; feeds the increment-3 implementation plan.
**Builds on:** increment 1 (model + `computeHealth`/`nextAction`) and increment 2 (Opportunity detail), both merged to `main`.

## Vision

The **Today** screen is the discipline surface for the CRM's organizing rule:

> Every open opportunity must have exactly one of: a scheduled next action, a clear waiting status, or a closed outcome. The system surfaces anything that has none.

Enforcement is **surfaced, not blocking** — Today nags; it never puts a modal in the operator's way. It is the one screen a solo operator opens each morning to see what needs doing and what has gone quiet.

## Placement

- New route `app/(admin)/[orgSlug]/today/page.tsx`.
- New **"Today"** sidebar item, gated by the existing `leads` module, placed above **Pipeline** in `components/layout/AdminSidebar.tsx`.
- The org root `/[orgSlug]` (the events landing page) and all other screens are unchanged. Today is a CRM screen, not the platform home.

## Scope

**In scope:** the in-app Today dashboard and the `waiting` workflow (mark waiting / clear waiting / push follow-up), which increment 2 deliberately deferred.

**Out of scope (deferred to a later increment):** the design's email notifications ("task due today / overdue → reminder"). Those require a scheduled/cron send path and are independent of this screen. Today surfaces the same information in-app now; email delivery comes later.

## Data model changes (small, mostly additive)

1. **`waiting` mutations** — two new **additive** exports in `actions/leads.ts`. Existing `updateLead`/`setLeadStage`/`deleteLead` are unchanged.
   - `setLeadWaiting(orgId, leadId, input: { reason: string; follow_up_date?: string }): Promise<void>` — org-admin gated; writes `lead.waiting = { reason, follow_up_date? }` and `updated_at`; best-effort logs an activity (kind `'waiting'`, summary `Waiting: <reason>`).
   - `clearLeadWaiting(orgId, leadId): Promise<void>` — org-admin gated; deletes `lead.waiting` (via `FieldValue.delete()`) and sets `updated_at`; best-effort logs an activity (kind `'waiting'`, summary `Resumed — cleared waiting`).
2. **`ActivityEvent` kind** — add `'waiting'` to the `ActivityEvent['kind']` union in `lib/types.ts` (additive union member; no existing value removed). The increment-2 `ActivityTimeline` icon map already falls back to a default icon for unknown kinds, so it degrades gracefully; we also add a `Clock` icon entry for `'waiting'`.

No change to `Task` (no `org_id` added). No change to the `LeadWaiting` shape. Quiet duration is derived from `lead.updated_at` (which `setLeadWaiting` refreshes, so the quiet clock effectively starts when waiting is set); an exact "waiting-since" timestamp is a later refinement, not V1.

## The aggregation core (pure, testable)

The brain of this increment is a **pure function**, mirroring increment 2's split of pure `lib/*` helpers behind a thin server action.

### `lib/today.ts`

```
buildToday(input: {
  leads: Lead[]
  tasksByLeadId: Record<string, Task[]>   // tasks only fetched for open leads
  today: string                            // YYYY-MM-DD (local)
}): TodayData
```

Types produced:

```
interface TodayTiles { tasksDue: number; needsAttention: number; openPipelineValue: number }

interface NeedsAttentionItem { leadId: string; name: string; company?: string; stage: LeadStage }

interface DueTaskItem {
  task: Task
  leadId: string
  leadName: string           // opportunity/customer context for the row
  company?: string
  status: 'overdue' | 'today'
}

interface WaitingItem {
  leadId: string
  name: string
  company?: string
  reason: string
  followUpDate?: string
  followUpDue: boolean       // followUpDate present and <= today
  quietDays: number          // days since lead.updated_at (>= 0)
}

interface TodayData {
  tiles: TodayTiles
  needsAttention: NeedsAttentionItem[]
  dueTasks: DueTaskItem[]
  waiting: WaitingItem[]
}
```

Logic (all derived; reuses `computeHealth(lead, tasks)` and `nextAction` from `lib/opportunity-health`, and `OPEN_STAGES`/`CLOSED_STAGES` from `lib/leads`):

- **Open leads** = stage in `OPEN_STAGES`. Closed leads are excluded from every list and from tasks fetching.
- **needsAttention** — open leads whose `computeHealth` is `needs_attention`. Sorted by `updated_at` ascending (stalest first).
- **dueTasks** — task-centric: every incomplete task across open leads with `due_date` present and `due_date <= today`, tagged with its lead's name/company, `status` = `overdue` (`< today`) or `today` (`== today`). Sorted by `due_date` ascending, then `created_at`. (A waiting lead that also has a due task legitimately appears in both `waiting` and `dueTasks` — a due task is a due task.)
- **waiting** — open leads whose `computeHealth` is `waiting` (i.e. `lead.waiting` is set). Each carries `reason`, `followUpDate`, `followUpDue` (`followUpDate <= today`), and `quietDays` (`max(0, today − updated_at in days)`). Sorted: `followUpDue` first, then longest-quiet first.
- **tiles** — `tasksDue = dueTasks.length`; `needsAttention = needsAttention.length`; `openPipelineValue = Σ estimated_value over open leads`.

### `actions/today.ts`

```
getTodayData(orgId: string): Promise<TodayData>
```

`assertOrgMember(orgId)` → `listLeads(orgId)` (1 read) → for open leads only, `Promise.all(listTasks(orgId, leadId))` → assemble `tasksByLeadId` → `buildToday({ leads, tasksByLeadId, today: todayYmd() })`. N+1 over open leads is acceptable at solo-operator scale; a `collectionGroup` optimization (which would require `org_id` on `Task`) is explicitly deferred.

## UI

Server page `app/(admin)/[orgSlug]/today/page.tsx` (`force-dynamic`): resolve org, `getTodayData`, render `TodayClient`.

Client components under `components/admin/today/`:

- **`TodayTiles`** — three metric tiles (tasks due, needs attention, open pipeline value). Presentational; money formatted like the existing modules (`$X.XX`).
- **`NeedsAttentionList`** — one dense bordered row per orphan: name + company, link to `/[orgSlug]/leads/[leadId]`, and two inline quick actions:
  - **Add next step** → inline title (+ optional date) → `createTask` → `router.refresh()`.
  - **Mark waiting** → inline reason (+ optional follow-up date) → `setLeadWaiting` → `router.refresh()`.
- **`DueTasksList`** — one row per due task: task title, a customer/opportunity tag (links to the opportunity), an `overdue`/`today` badge, and **Done** (`completeTask`) / **Snooze** (`snoozeTask`, +3 days via the increment-2 `addDays` helper).
- **`WaitingList`** — one row per waiting deal: name/company, reason, quiet duration. Rows with `followUpDue` are visually highlighted and offer **Follow up now** (`createTask`) / **Still waiting** (`setLeadWaiting` with a pushed date) / **Resume** (`clearLeadWaiting`). Non-due rows offer **Resume** only.
- **`TodayClient`** — orchestrator: tiles across the top, then the three lists (Needs attention → Due today/overdue → Waiting on). Each list shows a quiet empty state ("Nothing needs attention", etc.). Mobile-responsive single-column stacking. All mutations refresh via `router.refresh()`.

Restraint: dense bordered rows, one clear action per row, quiet empty states — no card-soup.

## Mutations used (all through server actions)

- `createTask` (existing) — Add next step, Follow up now.
- `completeTask` (existing) — Done on a due task.
- `snoozeTask` (existing, from increment 2) — Snooze a due task.
- `setLeadWaiting` (new) — Mark waiting; Still waiting (push the follow-up date).
- `clearLeadWaiting` (new) — Resume.

No new mutation touches proposals/invoices/contracts/vendors. The only shared-model change is the additive `'waiting'` activity kind.

## Error handling

- Reads gate on `assertOrgMember`; mutations on `assertOrgAdmin` (consistent with existing actions).
- Client rows do optimistic-free mutation: disable the control while pending, surface an inline `role="alert"` error on failure, `router.refresh()` on success.
- Activity logging is best-effort (reuses the existing `logActivity`, which swallows its own write failures).

## Testing

- **`lib/today.ts`** — thorough unit tests: health bucketing into the three lists, due filtering (overdue vs today vs future-excluded), tile math (counts + open pipeline sum excludes closed), `followUpDue`, `quietDays`, and the sort orders. This is the core and gets the most coverage.
- **`actions/today.ts`**, **`setLeadWaiting`**, **`clearLeadWaiting`** — action tests with mocked `firebase-admin`/auth/activity (following the existing `__tests__/actions/*.test.ts` pattern).
- **Each component** — RTL tests (mock `next/navigation` and the actions), asserting real behavior (correct action args, refresh called, empty states, follow-up-due highlighting).

Green gate per task: `npx tsc --noEmit` clean AND `npm test` passing. Built via `writing-plans` → `subagent-driven-development` (fresh subagent per task + reviews + final whole-branch review) in this worktree (`claude/crm-v3-today-dashboard`).

## Non-goals / principles

- **Derived, not stored:** the three lists and tiles are computed each render from leads + tasks + `waiting`; no stored "needs attention" flag.
- **Reuse:** consume increment-1/2 primitives (`computeHealth`, `nextAction`, `createTask`, `completeTask`, `snoozeTask`, `addDays`, `dueStatus`, `todayYmd`); do not duplicate them.
- **Restraint:** one clear action per row; quiet surfaces; surfaced-not-blocking.
- **Isolation:** additive actions + one additive activity-kind; no changes to other modules' code.
