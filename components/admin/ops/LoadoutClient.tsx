'use client'

// Job: "I'm at the van (or the store aisle) with my phone — show me what still
// has to go in, and let me check it off one-handed."
// Deciding value: {packed} of {total} packed — the one focal number; when it
// reaches total, Mo shuts the doors and drives. Everything else on the screen
// (T-minus, freshness stamp, divergence warning, pending/failed counts) exists
// only to say how urgent that number is and whether it can be trusted right now.
//
// Composition (spec 2026-08-19 S2): no cards — a sticky compact header, then
// the two derived lists grouped by rules and whitespace, then the derivation
// caption. Phone-first: every day-of action (row toggle, check-all, retry,
// recompute) is a ≥44px target (kit `touch` size / min-h-11 rows). Breakpoints:
// single column below md, the two groups side-by-side at md+ inside a max-w-3xl
// working column. Check-offs are optimistic with VISIBLE failure + retry —
// never a silent revert (hard gate). The gate is held three ways: per-row
// writes are serialized per key (last tap wins on the server or fails
// visibly), a recompute MERGES the fresh plan over rows with unsettled
// writes instead of replacing them, and bulk writes are mutually exclusive
// with both. Urgency = unchecked × T-minus only; there are deliberately no
// shortage flags (refuted — no on-hand data exists).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import { toggleListItem, bulkSetListChecked, recomputeOpsLists } from '@/actions/event-ops'
import { computeReadiness } from '@/lib/ops/readiness'
import { cn } from '@/lib/utils'
import type { OpsPlan, OpsListItem } from '@/lib/types'

type ListKey = 'shopping_list' | 'packing_list'

export interface LoadoutClientProps {
  orgId: string
  eventId: string
  orgSlug: string
  eventSlug: string
  plan: OpsPlan | null
  eventStart: string
  eventHeadcount?: number
}

function qtyLabel(i: OpsListItem): string {
  return i.unit ? `${i.qty} ${i.unit}` : `× ${i.qty}`
}

function keyOf(list: ListKey, i: OpsListItem): string {
  return `${list}:${i.resource_id}|${i.unit ?? ''}`
}

function sameItem(a: OpsListItem, b: OpsListItem): boolean {
  return a.resource_id === b.resource_id && (a.unit ?? null) === (b.unit ?? null)
}

function tMinusLabel(days: number): string {
  if (days > 0) return `T-${days}d`
  if (days === 0) return 'Day of'
  return `${-days}d ago`
}

// en-US pinned so SSR and hydration agree (ItineraryClient precedent).
function eventDateLabel(eventStart: string): string {
  return new Date(`${eventStart.slice(0, 10)}T00:00:00`)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function LoadoutClient(props: LoadoutClientProps) {
  const { orgId, eventId, orgSlug, eventSlug, eventHeadcount } = props
  const [plan, setPlan] = useState<OpsPlan | null>(props.plan)
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  const [groupBusy, setGroupBusy] = useState<ListKey | null>(null)
  const [groupError, setGroupError] = useState<{ list: ListKey; message: string; checked: boolean } | null>(null)
  const [recomputing, setRecomputing] = useState<'plain' | 'guests' | null>(null)
  const [recomputeError, setRecomputeError] = useState<string | null>(null)
  // Freshness stamp — set after mount so it reads in the OPERATOR's timezone
  // (SSR runs in the server's), and refreshed on every successful recompute.
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  // Per-row write machinery. Writes are SERIALIZED per key: at most one
  // request is ever on the wire, and a newer tap while one is in flight only
  // records the newest intent — the settle handler then chains one more
  // request carrying it. The server therefore receives states in tap order,
  // so the LAST intended state always wins (or fails visibly): a rapid
  // double-tap can no longer commit out of order and leave the server
  // opposite the display with nothing shown.
  const writesRef = useRef(new Map<string, { seq: number; intent: boolean; inflight: boolean }>())
  // Keys whose DISPLAYED checked state has an unconfirmed or failed write —
  // the synchronous mirror of pending ∪ failed. handleRecompute's merge reads
  // it (the state sets would be closure-stale in an async continuation), and
  // sendToggle treats removal from it as "superseded: someone else settled my
  // flags" (bulk check-all, or a recompute that dropped the row).
  const unsettledRef = useRef(new Set<string>())

  useEffect(() => { setLoadedAt(new Date()) }, [])

  const opsHref = `/${orgSlug}/${eventSlug}/ops`
  const printHref = `/${orgSlug}/${eventSlug}/ops/print`

  function setItemChecked(list: ListKey, item: OpsListItem, checked: boolean) {
    setPlan((p) => (p ? { ...p, [list]: p[list].map((x) => (sameItem(x, item) ? { ...x, checked } : x)) } : p))
  }

  /** Record the newest intended state for a row and make sure exactly one
   *  request is (or will be) carrying it. Every tap and every retry funnels
   *  through here. */
  function enqueueToggle(list: ListKey, item: OpsListItem, checked: boolean) {
    const key = keyOf(list, item)
    const prev = writesRef.current.get(key)
    const seq = (prev?.seq ?? 0) + 1
    writesRef.current.set(key, { seq, intent: checked, inflight: prev?.inflight ?? false })
    unsettledRef.current.add(key)
    setPending((s) => new Set(s).add(key))
    setFailed((s) => { const n = new Set(s); n.delete(key); return n })
    // A request is already on the wire: its settle handler will see the seq
    // moved on and chain a request with the newest intent — never two at once.
    if (writesRef.current.get(key)!.inflight) return
    void sendToggle(list, item, checked, seq)
  }

  async function sendToggle(list: ListKey, item: OpsListItem, checked: boolean, seq: number) {
    const key = keyOf(list, item)
    const started = writesRef.current.get(key)
    if (started) started.inflight = true
    let ok = true
    try {
      await toggleListItem(orgId, eventId, list, item.resource_id, checked, item.unit)
    } catch {
      ok = false
    }
    const cur = writesRef.current.get(key)
    if (cur) cur.inflight = false
    // Superseded: a bulk check-all took the list over, or a recompute removed
    // this row — whoever superseded already settled the flags for this key.
    if (!cur || !unsettledRef.current.has(key)) return
    if (cur.seq !== seq) {
      // Newer tap(s) landed while this was on the wire. Send the latest
      // intent as its own request; this write's own outcome is moot because
      // the chained one lands after it on the server (last intent wins).
      void sendToggle(list, item, cur.intent, cur.seq)
      return
    }
    setPending((s) => { const n = new Set(s); n.delete(key); return n })
    if (ok) {
      unsettledRef.current.delete(key)
    } else {
      setFailed((s) => new Set(s).add(key)) // stays unsettled until a retry lands
    }
  }

  function handleRowTap(list: ListKey, item: OpsListItem) {
    const next = !item.checked
    setItemChecked(list, item, next) // optimistic — a failure marks the row, never silently reverts it
    enqueueToggle(list, item, next)
  }

  /** A bulk write supersedes the list's per-row writes: settle their flags
   *  here and drop them from `unsettled` so a (theoretical) still-in-flight
   *  settle handler stands down. Check-all is disabled while the list has
   *  pending rows, so in practice nothing is on the wire when this runs —
   *  it mostly clears `failed` rows the bulk write is about to overwrite. */
  function supersedeList(list: ListKey, items: OpsListItem[]) {
    const keys = items.map((i) => keyOf(list, i))
    for (const k of keys) {
      unsettledRef.current.delete(k)
      const w = writesRef.current.get(k)
      if (w && !w.inflight) writesRef.current.delete(k)
    }
    const drop = new Set(keys)
    setPending((s) => new Set([...s].filter((k) => !drop.has(k))))
    setFailed((s) => new Set([...s].filter((k) => !drop.has(k))))
  }

  async function handleCheckAll(list: ListKey, checked: boolean) {
    if (!plan) return
    setGroupBusy(list)
    setGroupError(null)
    supersedeList(list, plan[list])
    setPlan((p) => (p ? { ...p, [list]: p[list].map((x) => ({ ...x, checked })) } : p))
    try {
      await bulkSetListChecked(orgId, eventId, list, checked)
    } catch (err: unknown) {
      setGroupError({ list, message: err instanceof Error ? err.message : 'Failed to save', checked })
    } finally {
      setGroupBusy(null)
    }
  }

  // Recompute runs mutually exclusive with BULK writes (its buttons disable
  // while groupBusy/groupError, and check-all + the group-error Retry disable
  // while recomputing), but row check-offs stay ENABLED during it — at the van
  // the operator keeps ticking while "Recompute for N guests" runs. The merge
  // below is what keeps the no-silent-revert hard gate airtight for that
  // overlap.
  async function handleRecompute(guests?: number) {
    setRecomputing(guests !== undefined ? 'guests' : 'plain')
    setRecomputeError(null)
    try {
      const fresh = await recomputeOpsLists(orgId, eventId, guests !== undefined ? { guests } : undefined)
      // ── Hard gate: no silent revert. The fresh plan owns list membership
      // and quantities, but any row whose check-off is still in flight or
      // visibly failed keeps the checked state the operator can SEE: their
      // tap is newer intent than the recompute's read snapshot, and the
      // write re-lands it on the server (toggleListItem resolves items by
      // resource_id|unit, which survives a recompute). Flags and write
      // bookkeeping are NOT wiped, so those writes still settle their own
      // pending/failed state.
      const freshKeys = new Set<string>(
        (['shopping_list', 'packing_list'] as const).flatMap((l) => fresh[l].map((i) => keyOf(l, i))),
      )
      // Rows the recompute removed can no longer render a badge or retry —
      // prune their flags so the header counts never point at nothing (their
      // settle handlers stand down via the unsettled check).
      for (const k of [...unsettledRef.current]) if (!freshKeys.has(k)) unsettledRef.current.delete(k)
      setPending((s) => new Set([...s].filter((k) => freshKeys.has(k))))
      setFailed((s) => new Set([...s].filter((k) => freshKeys.has(k))))
      setPlan((prev) => {
        if (!prev) return fresh
        const preserve = (l: ListKey, items: OpsListItem[]) =>
          items.map((item) => {
            if (!unsettledRef.current.has(keyOf(l, item))) return item
            const shown = prev[l].find((x) => sameItem(x, item))
            return shown ? { ...item, checked: shown.checked } : item
          })
        return {
          ...fresh,
          shopping_list: preserve('shopping_list', fresh.shopping_list),
          packing_list: preserve('packing_list', fresh.packing_list),
        }
      })
      setLoadedAt(new Date())
    } catch (err: unknown) {
      setRecomputeError(err instanceof Error ? err.message : 'Failed to recompute')
    } finally {
      setRecomputing(null)
    }
  }

  // ── Empty: no plan yet — name the next action, never a bare stub ──
  if (!plan) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16">
        <EmptyState
          title="No ops plan yet"
          description="Load-out lists are derived from the packages you sold × guest count. Set up the ops plan and they'll appear here, ready to check off at the van."
          action={
            <Button size="touch" nativeButton={false} render={<Link href={opsHref} />}>
              Set up the ops plan
            </Button>
          }
        />
      </div>
    )
  }

  const allItems = [...plan.packing_list, ...plan.shopping_list]
  const total = allItems.length
  const packed = allItems.filter((i) => i.checked).length
  const pct = total === 0 ? 0 : Math.round((packed / total) * 100)
  const daysUntil = computeReadiness(plan, props.eventStart).days_until
  const diverged = eventHeadcount !== undefined && eventHeadcount > 0 && eventHeadcount !== plan.requirements.guests
  const packageCount = plan.package_ids.length

  // ── Empty: a plan whose packages derive no items — "0 of 0 packed" would lie ──
  if (total === 0) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16">
        <EmptyState
          title="Nothing to load yet"
          description="The packages on this plan have no equipment or consumable lines, so no load-out list could be derived."
          action={
            <Button size="touch" variant="outline" nativeButton={false} render={<Link href={opsHref} />}>
              Review the ops plan
            </Button>
          }
        />
      </div>
    )
  }

  function renderGroup(list: ListKey, title: string, doneVerb: string, emptyLine: string) {
    const items = plan![list]
    const done = items.filter((i) => i.checked).length
    const allChecked = items.length > 0 && done === items.length
    const busy = groupBusy === list
    // Bulk writes wait until no row write is on the wire (the sticky header's
    // "{n} saving…" line is the visible reason): the two requests would race
    // on the server and whichever committed last would silently win.
    const hasPending = items.some((i) => pending.has(keyOf(list, i)))
    return (
      <section aria-label={title}>
        <header className="flex items-end justify-between gap-2 border-b border-border pb-1">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-xs tabular-nums text-muted-foreground">
              {items.length === 0 ? 'nothing derived' : `${done} of ${items.length} ${doneVerb}`}
            </p>
          </div>
          {items.length > 0 && (
            <Button size="touch" variant="ghost" disabled={busy || recomputing !== null || hasPending}
              onClick={() => handleCheckAll(list, !allChecked)}>
              {busy ? (<><Loader2 className="animate-spin" aria-hidden /> Saving…</>) : allChecked ? 'Uncheck all' : 'Check all'}
            </Button>
          )}
        </header>
        {groupError?.list === list && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] pl-3">
            <p className="text-sm font-medium text-[var(--danger-fg)]">{groupError.message} — the whole group may not have saved.</p>
            {/* Same exclusions as check-all — this IS a check-all resend. */}
            <Button size="touch" variant="ghost" className="text-[var(--danger-fg)]"
              disabled={groupBusy !== null || recomputing !== null || hasPending}
              onClick={() => handleCheckAll(groupError.list, groupError.checked)}>
              Retry
            </Button>
          </div>
        )}
        {items.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            {emptyLine}{' '}
            <Link href={opsHref} className="underline underline-offset-2">Review packages</Link>
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const key = keyOf(list, item)
              const isPending = pending.has(key)
              const isFailed = failed.has(key)
              return (
                <li key={`${item.resource_id}|${item.unit ?? ''}`}>
                  {/* The whole row is the check target (≥44px, one-handed). */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.checked}
                    aria-label={item.name}
                    disabled={busy}
                    onClick={() => handleRowTap(list, item)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-6 shrink-0 place-items-center rounded-md border transition-colors',
                        item.checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background',
                      )}
                    >
                      {item.checked && <Check className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-base leading-snug', item.checked ? 'text-muted-foreground line-through' : 'text-foreground')}>
                        {item.name}
                      </span>
                      {item.needs_conversion && (
                        <StatusPill tone="pending" className="mt-0.5">check by eye</StatusPill>
                      )}
                    </span>
                    {isPending && <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />}
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{qtyLabel(item)}</span>
                  </button>
                  {isFailed && (
                    <div className="mb-1 flex items-center justify-between gap-2 rounded-lg bg-[var(--danger-bg)] pl-3">
                      <p className="text-sm font-medium text-[var(--danger-fg)]">Didn&apos;t save</p>
                      {/* Retry re-sends the state shown on the row above — the display never reverts on its own. */}
                      <Button size="touch" variant="ghost" className="text-[var(--danger-fg)]"
                        onClick={() => enqueueToggle(list, item, item.checked)}>
                        Retry
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    )
  }

  return (
    <div className="pb-10">
      {/* Load-out is a takeover leaf: this header pins ALONE. The event spine
          header (layout.tsx → EventSpineHeader, sticky top-0 z-10) pins in the
          same overflow-auto <main>; it is ~73px with a one-line name (py-3 +
          size-12 avatar + border) and taller when the name + status pill wrap,
          while this header is ~57px — so "riding over it" left a ~16px clipped
          band of avatar/subtitle visible on scroll. Covering would mean
          matching a content-dependent height, so instead the scoped style
          below UNPINS the spine on this leaf: at rest the composition is
          unchanged, on scroll the spine scrolls away and this header pins
          cleanly. Leaf-scoped global CSS is the runsheet-print precedent;
          `main > header` matches only the spine (this header is nested, not a
          direct child of <main>), and the unlayered rule beats the layered
          Tailwind `.sticky` utility. */}
      <style>{`main > header.sticky { position: static; }`}</style>
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto w-full max-w-3xl px-4 pb-2 pt-3">
          <div className="flex items-end justify-between gap-3">
            <p className="text-2xl font-bold leading-tight tracking-tight tabular-nums">
              {packed} <span className="text-base font-medium text-muted-foreground">of {total} packed</span>
            </p>
            <div className="text-right text-xs text-muted-foreground">
              <p>
                <span className={cn(daysUntil <= 1 && daysUntil >= 0 && 'font-semibold text-foreground')}>
                  {tMinusLabel(daysUntil)}
                </span>{' '}
                · {eventDateLabel(props.eventStart)}
              </p>
              <p>{loadedAt ? `Loaded ${timeLabel(loadedAt)}` : ' '}</p>
            </div>
          </div>
          {/* Space reserved (min-h) rather than conditionally rendered: the
              header must never grow/shrink mid check-off — every tap flashes
              "1 saving…", and a jittering header shifts the row under the
              operator's thumb. */}
          <p className="mt-0.5 flex min-h-4 gap-3 text-xs">
            {pending.size > 0 && <span className="text-muted-foreground">{pending.size} saving…</span>}
            {failed.size > 0 && (
              <span className="font-medium text-[var(--danger-fg)]">
                {failed.size} not saved — retry below
              </span>
            )}
          </p>
        </div>
        <div className="h-1 bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pt-4">
        {diverged && (
          <div className="rounded-lg border border-[var(--warn-border)] bg-[var(--warn-bg)] px-3 py-2.5">
            <p className="text-sm font-medium text-[var(--warn-fg)]">
              Headcount changed — the event now expects {eventHeadcount} guests, but these
              quantities were derived for {plan.requirements.guests}.
            </p>
            {/* Also excluded while a bulk write is unresolved: replacing the
                plan mid-bulk (or while its red banner still demands a retry)
                would silently revert the group's optimistic state — the
                banner/spinner on the group is the visible reason. */}
            <Button size="touch" variant="outline" className="mt-2"
              disabled={recomputing !== null || groupBusy !== null || groupError !== null}
              onClick={() => handleRecompute(eventHeadcount)}>
              {recomputing === 'guests'
                ? (<><Loader2 className="animate-spin" aria-hidden /> Recomputing…</>)
                : `Recompute for ${eventHeadcount} guests`}
            </Button>
          </div>
        )}

        {/* Packing first: at the van it's the live list; shopping is usually already done. */}
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          {renderGroup('packing_list', 'Packing', 'packed', 'Nothing to pack — no equipment lines in this job’s packages.')}
          {renderGroup('shopping_list', 'Shopping', 'bought', 'Nothing to buy — no consumable lines in this job’s packages.')}
        </div>

        <footer className="border-t border-border pt-2 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            {/* When the divergence warning shows, IT owns the guest-basis
                figure (never the same value twice on one screen) — the
                caption keeps only the package count. */}
            <p className="text-xs text-muted-foreground">
              Derived from {packageCount} package{packageCount === 1 ? '' : 's'}
              {!diverged && <> × {plan.requirements.guests} guests</>}
            </p>
            <div className="flex items-center">
              {/* Same bulk-write exclusion as the divergence-banner button. */}
              <Button size="touch" variant="ghost"
                disabled={recomputing !== null || groupBusy !== null || groupError !== null}
                onClick={() => handleRecompute()}>
                {recomputing === 'plain'
                  ? (<><Loader2 className="animate-spin" aria-hidden /> Recomputing…</>)
                  : 'Recompute'}
              </Button>
              <Button size="touch" variant="ghost" nativeButton={false} render={<Link href={printHref} />}>
                Print
              </Button>
            </div>
          </div>
          {recomputeError && <p className="mt-1 text-sm text-destructive">{recomputeError}</p>}
        </footer>
      </div>
    </div>
  )
}
