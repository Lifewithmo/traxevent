# Today Level-Up Implementation Plan

**Goal:** Level up the Today dashboard onto the shared UI kit — surface the discarded KPI tiles, replace the hand-rolled row menu, fix empty states + responsive collapse. First module of the rollout after the Client Cockpit.

**Archetype:** DASHBOARD ("working dashboard" — keep the ranked move-queue as the central canvas; wrap it). Do NOT add a record spine / cockpit.

## Global Constraints
- Kit bricks only (`KpiBand`, `StatTile`, `Menu`, `EmptyState`, `Avatar` from `components/ui/`); tokens only, no raw palette classes.
- Every computed tile is a figure — `lib/today.ts` `TodayData.tiles: { tasksDue, needsAttention, openPipelineValue }` is already computed and currently discarded; surface it. **No `lib/today.ts` / `today-moves.ts` / `actions/today.ts` changes** — presentation only.
- Mirror the shipped Client Cockpit precedents: `ClientKpiBand.tsx` (KpiBand+StatTile, local `money()` = `` `$${n.toLocaleString()}` ``), `ClientCockpitHeader.tsx` (`MenuTrigger render={<Button …/>}` → `MenuContent`/`MenuItem`), `ClientQueueRail.tsx` (`Avatar name size="sm"`, `md:` responsive collapse).
- `actions/today.ts` is `'use server'` — do NOT re-export types from it (`next build` breaks). Run `npm run build` before green.

---

### Task 1: `TodayKpiBand` (new component) — parallelizable, no deps

**Files:** Create `components/admin/today/TodayKpiBand.tsx`, `__tests__/components/today/TodayKpiBand.test.tsx`

Mirror `components/admin/clients/ClientKpiBand.tsx`. Props `{ tiles: TodayTiles; eventsToday?: number }`. Render `<KpiBand>` of `<StatTile>`s: **Open pipeline** (`money(tiles.openPipelineValue)`, tone `money`), **Tasks due** (`String(tiles.tasksDue)`), **Needs attention** (`String(tiles.needsAttention)`, tone `tiles.needsAttention > 0 ? 'alert' : 'default'`), **Events today** (`String(eventsToday ?? 0)`). Local `money(n) = ` `` `$${n.toLocaleString()}` ``. TDD: assert labels/values render + alert tone when needsAttention > 0.

### Task 2: `TodayQueue` kit adoption — own file, parallelizable

**Files:** `components/admin/today/TodayQueue.tsx`; update `__tests__/components/today/TodayQueue.test.tsx`

Three changes in this one file (single agent):
1. Replace the hand-rolled `ActionMenu` (~lines 32–163) with kit `Menu`/`MenuTrigger`/`MenuContent`/`MenuItem` — `<MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Row actions" />}>`. Keep the existing `run()` dispatch. **Nuance:** the `pick_date` action's `<label>`+`<input type="date">` must render as a **plain child inside `MenuContent`, NOT a `MenuItem`** (MenuItem's div + closeOnClick + typeahead fights a native date input).
2. Empty-queue `<p>Nothing needs a move today.</p>` (~line 190) → kit `EmptyState` + a CTA (link to pipeline/leads).
3. Add `<Avatar name={move.customer} size="sm" />` to `Row` (~line 165) before the name/detail.

Test: the `getByRole('button', { name: 'Mark done' })` assertion breaks (MenuItem isn't a `<button>`) → use `getByRole('menuitem', { name: 'Mark done' })`. Add an avatar assertion (`role="img"`, aria-label = customer name).

### Task 3: `AgendaRail` empties + responsive — own file, parallelizable

**Files:** `components/admin/today/AgendaRail.tsx`; rewrite `__tests__/components/today/AgendaRail.test.tsx`

1. Filter `windowDays` to days with `items.length > 0` (drop empty-day rows + their "Nothing booked" placeholder, ~lines 64–65); if the whole 7-day window is empty, render one `EmptyState` ("Nothing on the books this week").
2. `<p>Nothing booked today.</p>` (~line 41) → kit `EmptyState`.
3. `<aside className="w-72 shrink-0 …">` (~line 36) → `w-full md:w-72 md:shrink-0` (stacks full-width below the queue on mobile).

Test: replace the `getAllByText('Nothing booked')).toHaveLength(6)` assertion (testing removed behavior) with one asserting empty days produce no row.

### Task 4: `TodayClient` layout integration — after Task 1

**Files:** `components/admin/today/TodayClient.tsx`; update `__tests__/components/today/TodayClient.test.tsx`

1. Render `<TodayKpiBand tiles={data.tiles} eventsToday={agenda.today.length} />` above `TodayQueue`.
2. Cap the queue reading column (`max-w-3xl` on the `min-w-0 flex-1` region) so rows don't stretch on wide screens; leave the KPI band full-width. **Walkthrough check:** if the gutter between the capped queue and `AgendaRail` exceeds 200px on a wide viewport, widen the cap (`max-w-4xl`) or the rail (`lg:w-80`).
3. Outer `<div className="flex min-h-screen">` (~line 28) → `flex-col md:flex-row` (agenda stacks below on mobile; agrees with Task 3's `md:` breakpoint).

Test: assert a KPI tile (e.g. "Open pipeline") renders.

---

## Verify
`npm test` (33 existing + new, all green) · `npm run build` (pass) · browser walkthrough (KPI band shows real figures; row Menu opens + actions fire incl. date-pick; empty states; wide-gutter ≤200px; mobile agenda stacks).
