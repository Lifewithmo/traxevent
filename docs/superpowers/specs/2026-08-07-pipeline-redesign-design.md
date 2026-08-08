# Pipeline & Opportunity Detail Redesign — Design

**Date:** 2026-08-07
**Status:** approved in brainstorming; feeds the pipeline-redesign implementation plan.
**Source:** BrewTrax Ops Wireframes, screens 12a (health-sorted list), 12b (three-column board), 12c (opportunity detail). First increment of the deck; sub-projects 2–8 (requirements 6a, ops stages 8a, closeout 7a, client invoice 10a, day-of 9a, packages 3a/1a/11b, compliance 11a) get their own specs.

## Problem

The pipeline is a five-column board grouped by stage, but stage is the wrong axis for a solo operator: the question is *which deals are owed a move*, and `computeHealth` already answers it — the UI just never asks. The board renders closed stages as columns, health is invisible, and nothing surfaces "quiet for 11 days". The opportunity page has the right panels but the wrong composition: a large always-editable form where the wireframe wants read-only facts, no way to mark a deal waiting or lost from the page, and no last-touch signal.

## Decisions

| Question | Decision |
|---|---|
| Rebuild vs overlay | Rebuild `LeadsBoardClient` (list + board views); recompose — not rewrite — the opportunity page from its existing panels. |
| Default view | The 12a health-grouped list. Board (12b) is a toggle. View choice persists in the URL (`?view=board`). |
| Closed-won handoff | Moving a deal to Closed won immediately opens the convert form, prefilled with event date and guest count. Dismissing it leaves the deal won; Today's "Won, not scheduled" list is the safety net. (User-confirmed.) |
| Lost reason | Mark lost opens a one-tap picker — `over_budget`, `went_elsewhere`, `date_fell_through`, `no_response` — plus optional note. Recorded on the lead and in the activity log. (User-confirmed.) |
| Proposal open tracking | Included. Portal render stamps `first_opened_at`/`last_opened_at` on sent proposals (≥1h throttle between `last_opened_at` writes). (User-confirmed.) |
| Nudge | Sends a templated reminder email via the existing Resend infra with the client-portal link; logs a `nudge` activity; disabled when the lead has no email. |
| Convert card visibility | Supersedes one row of the 2026-08-07 convert-to-work design: the card is **always visible**, disabled with the blocking reason in open stages, instead of hidden. Everything else from that design (deliberate trigger, event-fields-only form, `Event.lead_id`, Today list, closeout derivation) stands. |
| Drag on the board | HTML5 drag between the three open columns; the per-card stage select stays for accessibility. |
| Delete | Demoted to an overflow ("More") menu on the opportunity page; header actions are Mark lost and Move stage. |

## Data model

All new fields optional; no backfill.

```ts
// Lead additions
guest_count?: number        // rows, facts grid; prefills convert headcount
last_touch_at?: string      // ISO; stamped by the activity-log choke point;
                            // read fallback: updated_at ?? created_at
lost?: {
  reason: 'over_budget' | 'went_elsewhere' | 'date_fell_through' | 'no_response'
  note?: string
}
closed_at?: string          // ISO; stamped when stage enters closed_won/closed_lost;
                            // powers "booked this month" and the won/lost strips

// Proposal additions
first_opened_at?: string    // set once, first portal render after send
last_opened_at?: string     // throttled to one write per hour

// ActivityEvent.kind gains 'lost' and 'nudge'
```

`last_touch_at` is written wherever activity events are logged (one choke point in `actions/`), so notes, tasks, stage moves, emails, and nudges all count as touches.

## Pipeline page

Server component loads open leads plus each open lead's tasks (parallel per-lead fetches; solo-operator scale) and sent-proposal open state for proposal-stage leads.

**List view (12a, default).** Header: "N open · $X · N booked this month" + view toggle + New opportunity. Tabs: **Needs a move** (needs-attention leads), **All open**, **Closed** (archive incl. lost reasons, won deals link to their events). All-open groups by health, in order:

- **Needs attention** — red accent. Row sentence: "Sep 4 · 60 guests · no task, no touch in 11 days" or "proposal sent 9 days ago, unopened". Quick actions: **Set next step** (opens the opportunity focused on the task input), **Nudge** (unopened sent proposal).
- **Waiting on them** — "Waiting: <reason> · follow up <date>" + countdown chip ("in 2 days").
- **Moving** — "Next: <task> · due <date>" + countdown chip.

Rows sorted oldest-untouched first within each group. Every row: title, stage chip, value.

**Board view (12b).** Columns = the three `OPEN_STAGES` only. Column footer: "N · $value". Cards: title, one-line subtitle (type · date), one status line (next step / waiting / quiet), value; red left edge when needs-attention. Bottom strip: "Won this month: N · $X — moved to Events · Lost: N · $Y · archived".

## Opportunity page (12c)

Composition changes to `OpportunityDetailClient`; the panels already exist.

- **Header:** back link, title, stage chip beside it; right side **Mark lost** (outline) + **Move stage** (menu of stages); Delete inside a More overflow.
- **Banner:** existing `NextActionBanner` + two additions: "Last touch Xd ago" appended to the needs-attention detail, and a **Mark as waiting** button (small form: reason, follow-up date → existing `markWaiting` action). Waiting state gains a **Resume** action (existing `clearWaiting`).
- **Contact strip:** horizontal under the banner — avatar, name, email · phone, company + "returning client (N past events)" derived from the customer's event count.
- **Facts grid:** read-only Event date / Guest count / Event type / Estimated value; **Edit** toggles the existing details form inline.
- **Attached:** existing chips row, linking to the sections below.
- **Right column:** Tasks, Activity (unchanged panels).
- **Convert card:** visible in all stages; in open stages disabled with an explanatory reason ("Blocked: the contract is unsigned. Signing carries the accepted package and N guests into Events."). The reason is informational — it names what stands between now and a won deal; at Closed won the card is active regardless, exactly as today. Reason precedence: no accepted proposal → unsigned contract → "ready — mark the deal won to convert".

## Flows

- **Move stage → Closed won:** stage saves, convert form opens prefilled (name, event date, guest count → headcount). Dismiss keeps the won stage.
- **Mark lost:** reason picker + optional note → `stage: closed_lost`, `lost` saved, activity "Lost — over budget · <note>". Board/list archive shows the reason.
- **Nudge:** POSTs a reminder email (subject/body template with portal link), logs `nudge` activity, stamps `last_touch_at`.
- **Portal open:** the public portal action stamps open state on sent proposals it renders; operator preview does not (portal token path only).

## Testing

Pure display/logic helpers in `lib/` with vitest: health grouping + ordering, row status sentences, last-touch fallback, open-throttle rule, lost-reason labels, convert blocking-reason precedence. Server actions covered by the emulator-backed integration pattern where it exists. `next build` green before merge (including the `'use server'` type re-export gotcha).

## Out of scope

Deck sub-projects 2–8; drag-and-drop touch polish; lost-reason reporting rollups; client-side approval of overages (10a); any change to proposals/invoices themselves.
