# Convert to Work — Design

**Date:** 2026-08-07
**Status:** approved in brainstorming; feeds the convert-to-work implementation plan.

## Problem

A won opportunity is a dead end. `Event` carries no link to the opportunity it came from, and nothing creates an event when a deal closes — the only caller of `createEvent` is the manual `/new-event` page. Three consequences:

1. **Won ≠ scheduled.** Marking an opportunity `closed_won` produces no work. The operator re-keys the job into `/new-event` by hand, or forgets.
2. **Closeout re-keys the customer.** `generateCloseoutInvoice(orgId, eventId, leadId)` takes the opportunity as a parameter purely so the UI can prompt for it — a dropdown of *every* lead on the one screen where money lands (`components/admin/ops/CloseoutClient.tsx:184`).
3. **Nothing surfaces the gap.** A won opportunity drops out of Today forever the moment it is won. That is exactly the "rots in a forgotten list" failure the CRM exists to prevent, moved one stage later.

The ops core already anticipates this work. `instantiateOpsPlanCore` documents itself as *"the seam the proposals convert-to-work increment calls after acceptance"* (`lib/ops/event-ops.ts:31`), complete with an idempotency contract.

## Decisions

| Question | Decision |
|---|---|
| Trigger | A deliberate **Convert to work** button on the opportunity, shown only at `closed_won`. Not automatic on proposal acceptance. |
| Scope of the form | **Event fields only**, then hand off to the event's existing `OpsSetup`. The convert form does not collect packages or requirements. |
| Link direction | `Event.lead_id` only. The opportunity finds its job by query. No reverse copy on the `Lead`. |
| Cardinality | Query-based; the schema permits many jobs per opportunity, the UI assumes one. |
| Today | A fourth list, **Won, not scheduled**. Tiles stay at three. |
| Closeout | Derive the opportunity from `event.lead_id` when present; fall back to the existing picker when not. |

### Why the form stops at the Event

`OpsSetup` (`components/admin/ops/OpsSetup.tsx`) already collects packages, guests, service window, site needs and notes, and is tested. Collecting those a second time in a convert form would mean maintaining that form twice.

It would also break day-one orgs: `instantiateOpsPlanCore` throws when `guests <= 0` or a package id is unknown, so a conversion that *demanded* an ops plan could not complete for an org with an empty WorkPackage catalog. Splitting the steps keeps conversion always possible.

### Why the link lives in one direction

The repo already carries one denormalization-drift bug in its backlog — `lead.organization` vs `customer.company`, the "contact-of-record split brain" (`docs/superpowers/plans/2026-08-06-crm-v1-finish-out.md`). Storing `Event.lead_id` **and** `Lead.event_id` would create a second copy that can rot the same way. One direction plus a query cannot drift.

### Why cardinality is query-based rather than 1:1

`OpsPlan` is one document per event, and it derives deadlines from a single `event_start` and shopping lists from a single `guests` count (`lib/ops/event-ops.ts:80`). Any booking with two distinct service dates or two distinct headcounts genuinely needs two Events:

- A wedding weekend — cart at Friday's rehearsal dinner for 40, cart at Saturday's reception for 180. One proposal, one deposit, one invoice; two loads.
- A three-day conference with morning coffee service, 400 attendees on day one and 150 on day three.
- The photo-shoot vertical — engagement shoot in March, wedding day in September, sold as one package.

Forced into a single Event, these produce a shopping list that is wrong for both days and deadlines anchored to the wrong date.

The decision costs nothing today: it means **not writing a uniqueness constraint**, not building a jobs list.

Known tradeoff, deliberately unresolved: `generateCloseoutInvoice` runs per event, so a two-event opportunity would produce two final invoices. Whether that is correct or annoying depends on how a weekend is billed. It is not resolved here because the double-conversion guard below makes a second job unreachable in this increment — the question becomes live only when that guard is relaxed, and should be answered then.

## Data model

Two additive fields. No new collections, no migration, no composite index.

```ts
// lib/types.ts
Event.lead_id?: string        // the opportunity this job came from; absent for manual events
ActivityEvent.kind: 'stage' | 'task' | 'note' | 'email' | 'form' | 'created' | 'waiting' | 'converted'
```

`where('lead_id', '==', x)` is single-field equality, which Firestore indexes automatically. The query deliberately omits `.orderBy('created_at')` — that would force a composite index for no benefit, since an opportunity has one job, occasionally two. Sort in memory.

## Architecture

Events have no guard-free core today; `actions/events.ts` writes Firestore directly. Conversion resolves that by extracting one, matching the core/action split already established in `lib/crm/*` and `lib/ops/*` (and the precedent set by `lib/crm/tasks.ts` in the CRM finish-out).

| File | Role |
|---|---|
| `lib/events.ts` *(new)* | `createEventCore(orgId, input): Promise<Event>` — the event literal lifted verbatim out of `createEvent`. `listEventsCore(orgId): Promise<Event[]>` — extracted from the `listEvents` action so `getTodayData` reads events without a second auth check. `listEventsByLeadCore(orgId, leadId): Promise<Event[]>`. |
| `actions/events.ts` | `createEvent` becomes guard-then-delegate. Add `listEventsByLead`. |
| `lib/crm/convert.ts` *(new)* | `convertOpportunityToWorkCore(orgId, leadId, input)` — create event → stamp `lead_id` → log a `converted` activity event. Guard-free, directly unit-testable. |
| `actions/leads.ts` | `convertOpportunityToWork` — one `assertOrgAdmin`, then delegate. Lives here because the actor is the opportunity. |
| `actions/invoices.ts` | `generateCloseoutInvoice` — `leadId` becomes optional. |
| `lib/event-types.ts` | Shared helper resolving `registration_type` + custom terminology from a selected `EventType` (see below). |

Cores carry no `'use server'`, no `import 'server-only'`, and call no `assert*`. Types are never re-exported from a `'use server'` module — that passes `tsc` and breaks `next build`, and this repo has hit it twice.

### The double-conversion guard

The **schema** has no uniqueness constraint; the **action** refuses a second conversion. `convertOpportunityToWork` queries for an existing linked event and throws `'This opportunity is already scheduled'`. That protects against the realistic failure — a double-click or a second browser tab — without a constraint to migrate out later. If the wedding-weekend case arrives, one `if` in an action relaxes.

Guard in behaviour, freedom in the model.

## Surfaces

### A. Convert to work — opportunity detail

`OpportunityDetailClient` gains one row, rendered only when `stage === 'closed_won'`:

- no linked job → **Convert to work**, opening an inline card
- linked job → **View job →**, linking to that event's ops page

`app/(admin)/[orgSlug]/leads/[leadId]/page.tsx` already fans out seven parallel queries; `listEventsByLead` joins the same `Promise.all`.

Form fields:

| Field | Prefill | Notes |
|---|---|---|
| Job name | `opportunityTitle(lead)` | |
| Date | `lead.event_date` | Required — the submit button is disabled without it **and** the action rejects a blank date, per the repo's pattern of not trusting client-side validation alone. Sets `event_start` **and** `event_end`; single-day is the norm for booked-job work, multi-day is editable afterward in event settings. `year` derives from it — no year field. |
| Headcount | — | Optional. Flows to `Event.headcount`. |
| Event type | `DEFAULT_EVENT_TYPE_ID` | Select over `listOrgEventTypes` |

`lead.event_type` is free text ("Wedding", "Corporate gala") and does **not** map to an `EventTypeId`, so it cannot prefill the select.

On success: redirect to `/${orgSlug}/${event.slug}/ops`.

**Guest count is typed once.** `Event.headcount` → the ops page's `eventHeadcount` prop → `OpsSetup`'s `defaultGuests` (`components/admin/ops/OpsPlanClient.tsx:43`). That chain already exists; conversion just fills the front of it.

**Targeted cleanup.** `/new-event` resolves `registration_type` and custom terminology from the selected type inline (`app/(admin)/[orgSlug]/new-event/page.tsx:52-58`). Rather than copy those lines into a second form, lift them into a shared helper in `lib/event-types.ts` and have both callers use it.

### B. Today — "Won, not scheduled"

`getTodayData` adds **one** query (`listEventsCore`) and passes the set of scheduled lead ids into `buildToday`, which stays pure — it receives `scheduledLeadIds: string[]` as input and does no I/O of its own.

New output `wonUnscheduled: WonUnscheduledItem[]`, mirroring the field naming settled in the product-coherence increment:

```ts
interface WonUnscheduledItem {
  leadId: string
  title: string        // via opportunityTitle(lead) — never lead.name directly
  company?: string
  eventDate?: string   // lead.event_date, so a job with a date already past reads urgently
  value?: number
}
```

New `WonUnscheduledList` component with a per-row link to convert.

This is cheap: `getTodayData` already loads *all* leads and filters to open ones, so including won ones costs nothing, and scheduled-ness is one query rather than one per lead. It does not worsen the existing 1+N task reads (backlog item 11).

Tiles stay at three. The CRM V1 spec named those three, and a fourth metric on a screen whose entire premise is restraint costs more than it tells you — the list is the signal.

### C. Closeout

`generateCloseoutInvoice(orgId, eventId, leadId?)`:

- `leadId` omitted → derive from `event.lead_id`
- neither available → throw `'No opportunity linked to this event'`

The closeout page skips the `listLeads` read entirely when the event is linked, so the common path gets cheaper. `CloseoutClient` renders read-only "Billing to: {opportunity title}" when linked, the existing picker when not.

A linked event whose opportunity was since deleted falls back to the picker with a visible note, rather than dead-ending the one screen where money lands.

## Scenario walkthrough

The manual QA list, and the source for the plan's test cases.

### Conversion

| # | Scenario | Expected |
|---|---|---|
| 1 | Won opportunity with `event_date` | Convert → event created → redirect to ops → guests prefilled from headcount |
| 2 | Won opportunity with no `event_date` | Date field empty and required; submit blocked until filled |
| 3 | Opportunity in an open stage | No convert affordance at all |
| 4 | Already-converted opportunity | "View job →" instead of the button |
| 5 | Double-submit (double-click, second tab) | Second attempt rejected: *This opportunity is already scheduled* |
| 6 | Org with an empty WorkPackage catalog | Conversion **succeeds**; ops page shows its existing "No packages in your catalog yet" copy |
| 7 | Custom org-defined event type | Terminology carried onto the event, identical to `/new-event` |
| 8 | After converting | `converted` entry visible in the opportunity's activity timeline |

### Today

| # | Scenario | Expected |
|---|---|---|
| 9 | Won, no job | Appears in "Won, not scheduled" |
| 10 | Won, has job | Absent from that list |
| 11 | `closed_lost` | Never appears |
| 12 | Open stages | The three existing lists behave exactly as before |
| 13 | Nothing won-unscheduled | Empty state, no orphan heading |

### Closeout

| # | Scenario | Expected |
|---|---|---|
| 14 | Linked event | Read-only "Billing to:"; invoice lands on the right opportunity; no picker; no `listLeads` read |
| 15 | Unlinked event from `/new-event` | Picker unchanged |
| 16 | Linked event, opportunity since deleted | Falls back to the picker with a visible note |
| 17 | Closeout not completed | Still blocked by the existing error |

### Regression

| # | Scenario | Expected |
|---|---|---|
| 18 | `/new-event` | Still creates events with no `lead_id`; `actions/events` tests pass **unchanged** |
| 19 | Manual OpsSetup on an unlinked event | Unaffected |

Scenario 18 is load-bearing: unchanged event tests are the proof that lifting `createEventCore` out was faithful rather than a rewrite.

## Error handling

`logActivity` already swallows its own failures by design (`lib/activity.ts:30`), so a logging problem can never fail a conversion that already wrote an event.

The action's own failures — already-scheduled, missing date, unknown event type — surface as thrown errors rendered through the form's existing `role="alert"` pattern.

## Testing

- Unit tests for `lib/crm/convert.ts` and the `buildToday` extension — both pure or guard-free, `vi.hoisted` mock style per `__tests__/lib/crm/customers.test.ts`.
- Component tests for the convert card, `WonUnscheduledList`, and both `CloseoutClient` branches.
- `actions/events.ts`'s existing tests must pass **unchanged**.
- Green gate per task: `npx tsc --noEmit`, `npm test`, `npm run lint`, and `npm run build` before the final task — `tsc` alone does not catch the `'use server'` type re-export failure.
- Baseline at spec time: **153 test files / 1044 tests / 0 failures**. The count only goes up.
- Run vitest from the worktree only, never the primary checkout, and exclude `**/.claude/**` and `**/.worktrees/**` — nested worktrees otherwise produce thousands of false failures.

## Out of scope

- **The public intake form** — the pipeline's other missing end. Separate spec, next increment.
- **A jobs list / "Add another job" UI.** The model permits multiple jobs; the UI does not create them yet.
- **Billing a multi-event opportunity as one invoice.** Revisit if and when a second job per opportunity is actually created.
- **Backfilling `lead_id` onto existing events.** Pre-launch; there is nothing to backfill.
- **Automatic conversion on proposal acceptance.** Explicitly rejected — see Decisions.
