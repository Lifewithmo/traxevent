# Calendar level-up — screen composition

Run of the `screen-composition` method before any JSX. Steps 1–3 are reviewable claims.

## 1. The job (operator's words)

> "See what's coming this week, and catch the thing that's about to go wrong before it does."

Not "render the calendar feed." The operator opens this screen on a Monday to plan the week and
to notice the lapsed insurance doc that will block Saturday's event.

## 2. The decision, and the deciding number

**Decision:** which single item to go touch right now — a blocker to clear, a past-due task, an
unpaid invoice, or an unbooked hold.

**Scope discipline:** the first three tiles and the Owed-band blocker count are **week-scoped**; the
"Needs attention" tile and the rail are **feed-scoped** (30-day horizon plus anything past due).
These must never be mixed inside one element, and every feed-scoped figure names its horizon —
otherwise paging to a week beyond 30 days renders "0 · nothing blocking" as if it described the week
on screen. Two review findings on this branch were exactly that bug.

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
| 7 — grids degrade explicitly | `grid-cols-7` → stacked per-day sections below `lg`. The rail splits at `xl`, not `md`: with a 224px sidebar, a 288px rail beside a 7-column grid leaves 36–55px columns between 768px and ~1150px, which is a grid nobody can read. KpiBand already does 4-up → 2-up at 1000px. |

## State adaptivity

| State | Design |
|---|---|
| Empty week | Day-header row still renders (an empty week is meaningful — "you're free"), and one `EmptyState` spans the grid body: "Nothing on the calendar this week" + CTA → `/{orgSlug}/leads` "Open the pipeline" (where dates get set). |
| Empty agenda | `EmptyState`, same title/CTA. Replaces the bare "Nothing scheduled yet." |
| Empty rail | `EmptyState` title only, no CTA — a *good* empty state; a CTA here would manufacture work. Mirrors the `AgendaRail` precedent shipped in PR #91. This is a deliberate, stated deviation from R4. |
| Agenda view | Gets **no** KPI band and no week stepping. The agenda lists the whole feed by month, so week-scoped figures would describe something the reader is not looking at, and week stepping moved nothing on screen. The feed-scoped rail stays. |
| `?kinds=pipeline` | Gets its **own** band — Holds / Tasks due / Undated / Needs attention — because events and invoices are filtered out of the feed entirely; the default band would report "nothing booked · nothing due" for a week that has both. The legend drops the swatches that mode cannot produce. |
| Today on mobile | Today's cell is never dropped from the stack even when empty, and its stacked label carries the `bg-foreground` marker that the desktop-only header row owns. "You are here" is the point of the screen. |
| One | A single event in a day cell reads fine; no orphaned headers. |
| Many | A busy day cell grows the row; the rail caps each group at 4 entries with a "+N more" line. |
| Loading / error | N/A — the route is `force-dynamic` server-rendered with no client fetch. |
| Singular/plural | Every count string is pluralised (event/events, blocker/blockers, guest/guests). |

## Tokens

Booked-event identity green moves off `emerald-*` utilities onto the explicit money tokens
`--money-green` / `--money-green-border` (both defined light **and** dark in `app/globals.css`).
Money figures carry `--money-green`. Blockers use `destructive` / `--status-alert-*`. Zero raw hex.

Money is formatted by the new shared `lib/money.ts` — `toLocaleString()` alone renders `1567.5` as
`$1,567.5`, which was tolerable in 11px prose and wrong once promoted to a 20px `StatTile` figure.

## Known follow-ups (deliberately out of scope here)

- **Booked $** is not derivable: `CalendarItem` carries no event value. A real Booked-$ tile needs
  data-layer work, not presentation work.
- **Today's KPI band is flush** to the viewport edge while its header is `px-5`. `KpiBand` now has an
  opt-in `inset` variant (Calendar uses it); Today and Clients should adopt it so all three bands
  match. Not done here — it would change another module's rendering.
- **Today still spends `emerald-*`** for booked green while Calendar now uses `--money-green`. One
  constant, but it belongs to Today's file.
- **`--link` resolves to `--copper-600`, which has no dark override.** Latent, shared by the shipped
  kit (`related-record-card`, `ClientWorkingRail`), and the right place to fix it is the Signal
  palette sweep.
- **`SubscribePanel`'s native checkboxes** render OS-blue; there is no kit Checkbox yet.
