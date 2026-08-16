# Calendar level-up — screen composition

Run of the `screen-composition` method before any JSX. Steps 1–3 are reviewable claims.

## 1. The job (operator's words)

> "See what's coming this week, and catch the thing that's about to go wrong before it does."

Not "render the calendar feed." The operator opens this screen on a Monday to plan the week and
to notice the lapsed insurance doc that will block Saturday's event.

## 2. The decision, and the deciding number

**Decision:** which single item to go touch right now — a blocker to clear, a past-due task, an
unpaid invoice, or an unbooked hold.

**Focal element:** the 7-column week grid. It is the reason the module exists (playbook: "the grid
is the reason the module exists — keep it, wrap it"), so it keeps the width and the visual weight.

**Deciding number:** `Needs attention` — the one figure that sends the operator somewhere else.
Alert tone when > 0. It is the aggregate; the rail is its itemisation; the grid is its position in
time. Aggregate → list → position are three different jobs, so this is not rule-3 triplication.

## 3. Order by decision, not schema

1. Scope — filter tabs (Everything / Pipeline only)
2. Where am I / move — week range, prev/Today/next, week↔agenda, Subscribe
3. **The week in four numbers** — KPI band (replaces today's 12px gray prose)
4. **Time grid (focal)** — Mon–Sun booked events + tentative holds
5. OWED band — tasks, follow-ups, compliance, invoices, drops, by day
6. Legend, then footnote

The needs-attention rail sits right of 3–6, full height, mirroring `today/AgendaRail`.

## 4. Containers

No new `<Card>`. The rail is an `<aside>` with `border-l`. The grid keeps hairline borders. StatTile
brings its own border (kit standard). Nothing else gets a box.

## Rule compliance

| Rule | How |
|---|---|
| 1 — no uniform card stacks | Zero cards added. Band + grid + rail are three different densities. |
| 2 — one focal element | The grid. The band is quieter (20px figures), the rail is 11–13px. |
| 3 — never render a value 3× | **`summaryLabel()` must be DELETED** — "1 event · 165 guests · 1 blocker" is the exact same data the KPI band now carries. Leaving both is a rule-3 defect. |
| 4 — every number carries its "so what" | Each StatTile gets a `note`: Events → "N tentative"; Guests → "across N events"; Due this week → "N overdue"/"all current"; Needs attention → "N blocking"/"nothing blocking". |
| 5 — primary action with its object | Week nav sits with the range label it moves. Subscribe is subordinate (outline). |
| 6 — use the width available | Agenda's `max-w-2xl` is deleted; the freed width goes to the rail. No >200px dead gutter. |
| 7 — grids degrade explicitly | `grid-cols-7` → stacked per-day sections below `md`. Rail → full-width below the grid below `md`. KpiBand already does 4-up → 2-up at 1000px. |

## State adaptivity

| State | Design |
|---|---|
| Empty week | Day-header row still renders (an empty week is meaningful — "you're free"), and one `EmptyState` spans the grid body: "Nothing on the calendar this week" + CTA → `/{orgSlug}/leads` "Open the pipeline" (where dates get set). |
| Empty agenda | `EmptyState`, same title/CTA. Replaces the bare "Nothing scheduled yet." |
| Empty rail | `EmptyState` title only, no CTA — a *good* empty state; a CTA here would manufacture work. Mirrors the `AgendaRail` precedent shipped in PR #91. This is a deliberate, stated deviation from R4. |
| One | A single event in a day cell reads fine; no orphaned headers. |
| Many | A busy day cell grows the row; the rail caps each group at 4 entries with a "+N more" line. |
| Loading / error | N/A — the route is `force-dynamic` server-rendered with no client fetch. |
| Singular/plural | Every count string is pluralised (event/events, blocker/blockers, guest/guests). |

## Tokens

Booked-event identity green moves off `emerald-*` utilities onto the explicit money tokens
`--money-green` / `--money-green-border` (both defined light **and** dark in `app/globals.css`).
Money figures carry `--money-green`. Blockers use `destructive` / `--status-alert-*`. Zero raw hex.
