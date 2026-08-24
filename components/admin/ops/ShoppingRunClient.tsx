'use client'

// Job: "I'm at the store buying for this week's jobs in one trip — show me one
// merged list of what still has to go in the cart, and let me check it off
// one-handed."
// Deciding value: {unchecked} of {total} items across {N} jobs — the one focal
// number; when it reaches 0, Mo walks to checkout. Everything else on the
// screen (window/job toggles, failed-read line, pending/failed counts, the
// overstatement caption) exists only to say whether that number covers the
// right jobs and can be trusted right now.
//
// Composition (spec 2026-08-23 S2): no cards — a sticky compact header, a
// scope strip (window + job toggles as URL-param links, no persistence), then
// ONE merged list grouped by resource, then the derivation caption. Phone-
// first: every action (row check-all, constituent toggle, expand, retry) is a
// ≥44px target; single column inside a max-w-3xl working column (LoadoutClient
// breakpoint parity — the store aisle is a phone surface, md+ just gets air).
//
// Write-back keeps ONE truth (never a parallel run doc): constituent toggles
// hit the same toggleListItem as the per-event loadout; a run-row check-all is
// ONE multi-plan transaction (bulkSetRunChecked). Check-offs are optimistic
// with VISIBLE failure + retry — never a silent revert (hard gate): per-
// constituent writes are serialized per key via useSerializedCheckWrites (the
// machinery shared with LoadoutClient), and a row bulk write supersedes its
// constituents' writes and is disabled while any of them is on the wire.

import { useMemo, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Loader2, Minus, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import { toggleListItem } from '@/actions/event-ops'
import { bulkSetRunChecked } from '@/actions/shopping-run'
import { useSerializedCheckWrites } from '@/components/admin/ops/useSerializedCheckWrites'
import {
  RUN_DAYS, RUN_WINDOW_OPTIONS, computeShoppingRun, constituentKey, shoppingRunStats,
  type RunConstituent, type ShoppingRunPair, type ShoppingRunRow,
} from '@/lib/ops/shopping-run'
import { cn } from '@/lib/utils'
import type { OpsPlan, OpsResource } from '@/lib/types'

export interface ShoppingRunJob {
  id: string
  name: string
  slug: string
  event_start: string   // YYYY-MM-DD
  excluded: boolean
  no_plan: boolean      // read succeeded, no plan doc — nothing to merge
}

export interface ShoppingRunClientProps {
  orgId: string
  orgSlug: string
  days: number
  /** Every in-window job, included or not — the scope strip renders all of
   *  them so an excluded job stays one tap from coming back. */
  jobs: ShoppingRunJob[]
  /** Included jobs whose plan doc exists — the merge inputs. */
  pairs: ShoppingRunPair[]
  /** The ?exclude= scope as the SERVER parsed and carried it (verbatim, minus
   *  ids that left the widest window) — NOT re-derived from in-window jobs.
   *  May hold ids outside the CURRENT window: a day-10 exclusion must survive
   *  a trip through the 3-day view, so every scope link serializes this list,
   *  letting out-of-window exclusions ride along inertly. */
  excludedIds: string[]
  resources: OpsResource[]
  /** Plan reads that FAILED (not "missing"): those jobs are excluded from the
   *  run and named visibly — never silently absent. */
  failedReads: number
}

function qtyLabel(r: { qty: number; unit?: string }): string {
  return r.unit ? `${r.qty} ${r.unit}` : `× ${r.qty}`
}

// en-US pinned so SSR and hydration agree (LoadoutClient precedent).
function dayLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function ShoppingRunClient(props: ShoppingRunClientProps) {
  const { orgId, orgSlug, days, jobs, resources, failedReads } = props
  const [plans, setPlans] = useState<Record<string, OpsPlan>>(() =>
    Object.fromEntries(props.pairs.map((p) => [p.event.id, p.plan])),
  )
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  // Per-ROW bulk-failure state — a Map, deliberately not one global slot: with
  // N rows, tapping row B's check-all right after row A's failed is the normal
  // shopping flow, and a single slot would erase A's only visible trace while
  // A still displays its optimistic checked state (the LoadoutClient
  // single-busy-slot lesson, which N rows turn from rare into routine).
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<string, { message: string; checked: boolean }>>(new Map())
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const writes = useSerializedCheckWrites()

  useEffect(() => { setLoadedAt(new Date()) }, [])

  // ── Fresh server reads win (scope navigation / refresh) ──
  // The window/exclude toggles are soft navigations to this same route: the
  // server re-fetches every plan doc and passes fresh `pairs` (a new identity
  // each pass), but React preserves this component instance — so the mount-
  // time overlay must not shadow the reads the navigation just paid for.
  // Re-baseline on the fresh plans, preserving ONLY the checked state the
  // operator can SEE an unsettled write for (LoadoutClient's recompute-merge
  // precedent — a pending/failed tap never silently reverts; its write still
  // re-lands last on the server), and prune write flags for constituents that
  // left the scope so the header counts never point at rows that no longer
  // render. (Render-phase state adjustment — the sanctioned React pattern for
  // deriving state from changed props without an intermediate stale frame.)
  const [seenPairs, setSeenPairs] = useState(props.pairs)
  if (props.pairs !== seenPairs) {
    setSeenPairs(props.pairs)
    const itemKey = (eventId: string, i: { resource_id: string; unit?: string }) =>
      constituentKey({ event_id: eventId, resource_id: i.resource_id, unit: i.unit })
    writes.prune(new Set(
      props.pairs.flatMap((p) => p.plan.shopping_list.map((i) => itemKey(p.event.id, i))),
    ))
    setPlans((prevPlans) => Object.fromEntries(props.pairs.map((p) => {
      const prev = prevPlans[p.event.id]
      if (!prev) return [p.event.id, p.plan]
      return [p.event.id, {
        ...p.plan,
        shopping_list: p.plan.shopping_list.map((item) => {
          if (!writes.isUnsettled(itemKey(p.event.id, item))) return item
          const shown = prev.shopping_list.find(
            (x) => x.resource_id === item.resource_id && (x.unit ?? null) === (item.unit ?? null),
          )
          return shown ? { ...item, checked: shown.checked } : item
        }),
      }]
    })))
    // Bulk failures don't outlive a fresh read: a failed bulk's keys are
    // settled (supersede), so the merge above just replaced its optimistic
    // display with server truth — the screen is honest again, and a stale
    // "didn't save" banner would now be the false claim.
    setRowErrors(new Map())
  }

  const livePairs: ShoppingRunPair[] = useMemo(
    () => props.pairs.map((p) => ({ event: p.event, plan: plans[p.event.id] ?? p.plan })),
    [props.pairs, plans],
  )
  const rows = useMemo(() => computeShoppingRun(livePairs, resources), [livePairs, resources])
  const stats = useMemo(() => shoppingRunStats(livePairs), [livePairs])
  const pct = stats.total === 0 ? 0 : Math.round(((stats.total - stats.unchecked) / stats.total) * 100)

  // ── URL-param scope toggles (no persistence — the URL IS the state) ──
  function runQuery(nextDays: number, excludedIds: string[]): string {
    const q = new URLSearchParams()
    if (nextDays !== RUN_DAYS) q.set('days', String(nextDays))
    if (excludedIds.length > 0) q.set('exclude', excludedIds.join(','))
    const s = q.toString()
    return s ? `?${s}` : ''
  }
  const runHref = (nextDays: number, ids: string[]) => `/${orgSlug}/shopping-run${runQuery(nextDays, ids)}`
  // The server-carried scope, never re-derived from in-window jobs: deriving
  // from `jobs` silently dropped any exclusion whose job sat outside the
  // current window, so ?days=14 → 3 → 14 re-included it with no signal.
  const excludedIds = props.excludedIds
  const toggleHref = (job: ShoppingRunJob) =>
    runHref(days, job.excluded ? excludedIds.filter((id) => id !== job.id) : [...excludedIds, job.id])
  const printHref = `/${orgSlug}/shopping-run/print${runQuery(days, excludedIds)}`

  function setConstituentChecked(c: Pick<RunConstituent, 'event_id' | 'resource_id' | 'unit'>, checked: boolean) {
    setPlans((prev) => {
      const plan = prev[c.event_id]
      if (!plan) return prev
      return {
        ...prev,
        [c.event_id]: {
          ...plan,
          shopping_list: plan.shopping_list.map((i) =>
            i.resource_id === c.resource_id && (i.unit ?? null) === (c.unit ?? null) ? { ...i, checked } : i,
          ),
        },
      }
    })
  }

  function handleConstituentTap(c: RunConstituent) {
    const next = !c.checked
    setConstituentChecked(c, next) // optimistic — a failure marks the row, never silently reverts it
    writes.enqueue(constituentKey(c), next, (intent) =>
      toggleListItem(orgId, c.event_id, 'shopping_list', c.resource_id, intent, c.unit),
    )
  }

  /** Row check-all: ONE transaction across every plan this row draws from. */
  async function handleRowTap(row: ShoppingRunRow, checked: boolean) {
    setRowBusy(row.key)
    // Clear only THIS row's earlier failure (the retry path funnels here):
    // another row's failure must stay visible while that row still displays
    // its optimistic state — never one global slot.
    setRowErrors((m) => {
      if (!m.has(row.key)) return m
      const n = new Map(m)
      n.delete(row.key)
      return n
    })
    // The bulk write supersedes this row's per-constituent writes (the hook
    // settles their flags); the row is disabled while any is on the wire, so
    // in practice this clears failed constituents the bulk is overwriting.
    writes.supersede(row.constituents.map(constituentKey))
    for (const c of row.constituents) setConstituentChecked(c, checked)
    const byEvent = new Map<string, { resource_id: string; unit?: string }[]>()
    for (const c of row.constituents) {
      const keys = byEvent.get(c.event_id) ?? []
      keys.push({ resource_id: c.resource_id, ...(c.unit !== undefined ? { unit: c.unit } : {}) })
      byEvent.set(c.event_id, keys)
    }
    try {
      await bulkSetRunChecked(orgId, [...byEvent].map(([event_id, keys]) => ({ event_id, keys })), checked)
    } catch (err: unknown) {
      setRowErrors((m) => new Map(m).set(row.key, { message: err instanceof Error ? err.message : 'Failed to save', checked }))
    } finally {
      setRowBusy(null)
    }
  }

  function toggleExpanded(key: string) {
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  const includedCount = jobs.filter((j) => !j.excluded).length
  const noPlanShown = jobs.filter((j) => !j.excluded && j.no_plan).length

  // ── Scope strip: does the focal number cover the right jobs? ──
  const scopeStrip = (
    <div className="mx-auto w-full max-w-3xl space-y-2 px-4 pt-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Window</span>
        {RUN_WINDOW_OPTIONS.map((d) => (
          <Button key={d} size="touch" variant={d === days ? 'secondary' : 'ghost'} nativeButton={false}
            className={cn('px-3 text-sm', d === days && 'pointer-events-none')}
            render={<Link href={runHref(d, excludedIds)} aria-current={d === days ? 'true' : undefined} />}>
            {d} days
          </Button>
        ))}
      </div>
      {jobs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Jobs in this run">
          {jobs.map((job) => (
            <Link key={job.id} href={toggleHref(job)}
              aria-label={job.excluded ? `Include ${job.name} in the run` : `Exclude ${job.name} from the run`}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                job.excluded
                  ? 'border-dashed border-border text-muted-foreground'
                  : 'border-border bg-card',
              )}>
              <span className={cn(job.excluded && 'line-through')}>{job.name}</span>
              <span className="text-xs text-muted-foreground">{dayLabel(job.event_start)}</span>
              {job.no_plan && !job.excluded && <StatusPill tone="pending">no plan</StatusPill>}
            </Link>
          ))}
        </div>
      )}
      {failedReads > 0 && (
        <p className="rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-sm font-medium text-[var(--danger-fg)]">
          Couldn&apos;t check {failedReads} job{failedReads === 1 ? '' : 's'} — {failedReads === 1 ? 'its' : 'their'} items
          are missing from this run. Reload to try again.
        </p>
      )}
    </div>
  )

  // ── Empty: nothing in the window at all — name the next action ──
  if (jobs.length === 0) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16">
        <EmptyState
          title={`No client jobs in the next ${days} days`}
          description="The shopping run merges the shopping lists of every upcoming client job into one store trip. Book a job — or widen the window — and it fills in."
          action={
            days < 14 ? (
              <Button size="touch" variant="outline" nativeButton={false} render={<Link href={runHref(14, excludedIds)} />}>
                Look 14 days out
              </Button>
            ) : (
              <Button size="touch" variant="outline" nativeButton={false} render={<Link href={`/${orgSlug}`} />}>
                Back to events
              </Button>
            )
          }
        />
        {failedReads > 0 && (
          <p className="mt-4 rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-sm font-medium text-[var(--danger-fg)]">
            Couldn&apos;t check {failedReads} job{failedReads === 1 ? '' : 's'} — reload to try again.
          </p>
        )}
      </div>
    )
  }

  // ── Empty variants that keep the scope strip (the fix is one tap away) ──
  if (stats.total === 0) {
    const body = includedCount === 0
      ? { title: 'Every job is excluded', description: 'Tap a job above to bring its shopping list back into the run.' }
      : noPlanShown > 0 && livePairs.length === 0
        ? { title: 'No ops plans yet', description: 'Shopping lists derive from each job’s ops plan (packages × guests). Set up a plan from a job’s Ops tab and its list joins the run.' }
        : { title: 'Nothing to buy', description: 'These jobs’ packages derive no consumable lines — there is no shopping to merge. Packing stays on each job’s load-out.' }
    return (
      <div className="pb-10">
        {scopeStrip}
        <div className="mx-auto w-full max-w-xl px-4 py-12">
          <EmptyState title={body.title} description={body.description} />
        </div>
      </div>
    )
  }

  return (
    <div className="pb-10">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto w-full max-w-3xl px-4 pb-2 pt-3">
          <div className="flex items-end justify-between gap-3">
            <p className="text-2xl font-bold leading-tight tracking-tight tabular-nums">
              {stats.unchecked}{' '}
              <span className="text-base font-medium text-muted-foreground">
                of {stats.total} item{stats.total === 1 ? '' : 's'} across {stats.jobs} job{stats.jobs === 1 ? '' : 's'}
              </span>
            </p>
            <div className="text-right text-xs text-muted-foreground">
              <p>Next {days} days</p>
              <p>{loadedAt ? `Loaded ${timeLabel(loadedAt)}` : ' '}</p>
            </div>
          </div>
          {/* Space reserved (min-h): the header must never grow/shrink mid
              check-off — a jittering header shifts the row under the thumb. */}
          <p className="mt-0.5 flex min-h-4 gap-3 text-xs">
            {writes.pending.size > 0 && <span className="text-muted-foreground">{writes.pending.size} saving…</span>}
            {writes.failed.size > 0 && (
              <span className="font-medium text-[var(--danger-fg)]">
                {writes.failed.size} not saved — retry below
              </span>
            )}
          </p>
        </div>
        <div className="h-1 bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </header>

      {scopeStrip}

      <div className="mx-auto w-full max-w-3xl px-4 pt-4">
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const isOpen = expanded.has(row.key)
            const busy = rowBusy === row.key
            // Mirror LoadoutClient's bulk rules: a row's check-all waits until
            // none of its constituent writes is on the wire (the two requests
            // would race on the server and whichever committed last would
            // silently win), and only ONE bulk runs at a time — rowBusy is
            // single-slot, so a second concurrent bulk would orphan the
            // first's busy spinner. Failures are per-row (rowErrors map): a
            // LATER bulk must never erase an EARLIER bulk's visible failure.
            const hasPending = row.constituents.some((c) => writes.pending.has(constituentKey(c)))
            const error = rowErrors.get(row.key) ?? null
            return (
              <li key={row.key}>
                <div className="flex items-center gap-1">
                  {/* The row is the check target (≥44px, one-handed): one tap
                      buys this item for EVERY job at once. */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={row.checked === 'all' ? true : row.checked === 'partial' ? 'mixed' : false}
                    aria-label={row.name}
                    disabled={rowBusy !== null || hasPending}
                    onClick={() => handleRowTap(row, row.checked !== 'all')}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-6 shrink-0 place-items-center rounded-md border transition-colors',
                        row.checked === 'all' && 'border-primary bg-primary text-primary-foreground',
                        row.checked === 'partial' && 'border-primary text-primary',
                        row.checked === 'none' && 'border-input bg-background',
                      )}
                    >
                      {row.checked === 'all' && <Check className="size-4" />}
                      {row.checked === 'partial' && <Minus className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-base leading-snug', row.checked === 'all' ? 'text-muted-foreground line-through' : 'text-foreground')}>
                        {row.name}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {row.constituents.length === 1
                          ? row.constituents[0].event_name
                          : `${row.constituents.length} jobs`}
                        {row.needs_conversion && <StatusPill tone="pending">check by eye</StatusPill>}
                      </span>
                    </span>
                    {busy
                      ? <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
                      : hasPending && <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />}
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{qtyLabel(row)}</span>
                  </button>
                  <Button size="icon-touch" variant="ghost" aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Hide' : 'Show'} per-job breakdown for ${row.name}`}
                    onClick={() => toggleExpanded(row.key)}>
                    <ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} />
                  </Button>
                </div>
                {error && (
                  <div className="mb-1 flex items-center justify-between gap-2 rounded-lg bg-[var(--danger-bg)] pl-3">
                    <p className="text-sm font-medium text-[var(--danger-fg)]">
                      Didn&apos;t save across {row.constituents.length === 1 ? 'the job' : 'the jobs'}
                    </p>
                    {/* Retry re-sends the state shown on the row — the display never reverts on its own. */}
                    <Button size="touch" variant="ghost" className="text-[var(--danger-fg)]"
                      disabled={rowBusy !== null}
                      onClick={() => handleRowTap(row, error.checked)}>
                      Retry
                    </Button>
                  </div>
                )}
                {isOpen && (
                  <ul className="mb-1 ml-9 border-l border-border pl-2">
                    {row.constituents.map((c) => {
                      const key = constituentKey(c)
                      const isPending = writes.pending.has(key)
                      const isFailed = writes.failed.has(key)
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={c.checked}
                            aria-label={`${row.name} for ${c.event_name}`}
                            disabled={busy}
                            onClick={() => handleConstituentTap(c)}
                            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                          >
                            <span
                              aria-hidden
                              className={cn(
                                'grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                                c.checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background',
                              )}
                            >
                              {c.checked && <Check className="size-3.5" />}
                            </span>
                            <span className={cn('min-w-0 flex-1 truncate text-sm', c.checked ? 'text-muted-foreground line-through' : 'text-foreground')}>
                              {c.event_name} <span className="text-xs text-muted-foreground">· {dayLabel(c.event_start)}</span>
                            </span>
                            {isPending && <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />}
                            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{qtyLabel(c)}</span>
                          </button>
                          {isFailed && (
                            <div className="mb-1 flex items-center justify-between gap-2 rounded-lg bg-[var(--danger-bg)] pl-3">
                              <p className="text-sm font-medium text-[var(--danger-fg)]">Didn&apos;t save</p>
                              <Button size="touch" variant="ghost" className="text-[var(--danger-fg)]"
                                onClick={() => writes.enqueue(key, c.checked, (intent) =>
                                  toggleListItem(orgId, c.event_id, 'shopping_list', c.resource_id, intent, c.unit))}>
                                Retry
                              </Button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>

        <footer className="mt-4 border-t border-border pt-2 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            {/* Honesty caption: per-job quantities were rounded UP when each
                list was derived, and no on-hand stock is netted out — both
                stated, never implied away. */}
            <p className="text-xs text-muted-foreground">
              Rounded up per job — may overstate the combined need. On-hand stock isn&apos;t netted out.
            </p>
            <Button size="touch" variant="ghost" nativeButton={false} render={<Link href={printHref} />}>
              <Printer data-icon="inline-start" aria-hidden className="size-4" /> Print
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
