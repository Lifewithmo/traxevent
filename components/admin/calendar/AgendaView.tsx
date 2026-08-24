'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatMoney } from '@/lib/money'
import { addDays, todayYmd } from '@/lib/opportunity-detail'
import { cn } from '@/lib/utils'
import { type CalendarItem, type CalendarKind } from '@/lib/calendar'
import { KindDot } from '@/components/admin/calendar/KindDot'
import { useDismissLayer } from '@/components/admin/calendar/dismiss-stack'
import { bulkRescheduleAgenda, type AgendaMove } from '@/actions/calendar-bulk'

/**
 * The agenda is the org's n:many surface — a 400-row feed spanning years — and
 * its job is "what's coming, and can I move it?", read on a phone between jobs.
 *
 * Two things follow, and they used to be missing:
 *
 *  1. ANCHORED + WINDOWED. It opened on the org's OLDEST record and rendered the
 *     entire history, so the operator scrolled forward through the past to reach
 *     today. It now lands on today (or the open spine day) and renders a bounded
 *     page; history is one explicit "Load earlier" away rather than the doormat.
 *     No virtualisation dependency — the repo has none and does not need one for
 *     a bounded windowed list with load-more.
 *  2. BULK. A scheduler's real unit of work is "these three jobs move to
 *     Saturday", not three separate detail pages. Multi-select + one
 *     transactional bulk reschedule turns ~15 taps into 6.
 */

/** Rows added per Load earlier / Load later, and the initial render bound. */
const PAGE = 40
/** Twin of BULK_LIMIT in actions/calendar-bulk.ts — keep the two in step. */
const MAX_BULK_MOVE = 200

/**
 * ACTIONABILITY RULE — the only kinds whose date IS the job's date, and so the
 * only rows that get a checkbox:
 *
 *   event — a booked job   → Event.event_start/_end + its Lead.event_date
 *   lead  — a tentative hold → Lead.event_date
 *
 * Every other kind carries a date the operator does not own at that row: an
 * `invoice_due` date belongs to the invoice's payment terms, a `compliance`
 * date is an expiry set by the issuing authority (moving it would be a lie, not
 * a reschedule), a `drop` date belongs to a pickup WINDOW edited on the drop,
 * and `task`/`follow_up` are sub-records with their own snooze affordance. Those
 * rows are EXCLUDED from selection rather than shown as a wall of disabled
 * controls — the select-all label names the rule so it stays discoverable.
 */
const RESCHEDULABLE: ReadonlySet<CalendarKind> = new Set<CalendarKind>(['event', 'lead'])

const ymd = (date: string) => date.slice(0, 10)
const keyOf = (item: Pick<CalendarItem, 'kind' | 'id'>) => `${item.kind}:${item.id}`
const utcDate = (date: string) => new Date(`${ymd(date)}T00:00:00.000Z`)

function monthLabel(date: string): string {
  return utcDate(date).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function dayLabel(date: string): string {
  return utcDate(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function spanDays(from: string, to: string): number {
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86_400_000)
}


interface AgendaViewProps {
  orgSlug: string
  /** The whole feed, date-sorted; anchored, windowed and grouped by month here. */
  items: CalendarItem[]
  /**
   * Today as YYYY-MM-DD. OPTIONAL only because the current CalendarCanvas call
   * site passes just `orgSlug`/`items`; the canvas already holds the server's
   * `today` and `selectedDay` and can hand them over in one line. Absent, we
   * fall back to the browser's local date — the same `todayYmd()` call
   * TodayQueue/TodayClient already make client-side.
   */
  today?: string
  /** The open spine day, if the operator has one — the agenda anchors there. */
  selectedDay?: string
}

export function AgendaView({ orgSlug, items, today: todayProp, selectedDay }: AgendaViewProps) {
  const router = useRouter()
  const today = todayProp ?? todayYmd()

  // ── optimistic state ──────────────────────────────────────────────────────
  // key → the day the row has been optimistically moved to. Cleared the moment
  // the server hands back a fresh feed (see the reconcile effect below), so the
  // list shows server truth rather than a client fiction that outlives it.
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  // null = the operator has not overridden the computed default (below).
  const [targetInput, setTargetInput] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [undoMoves, setUndoMoves] = useState<AgendaMove[] | null>(null)
  // null = "the default window, anchored on today"; Back to today restores it.
  const [win, setWin] = useState<{ start: number; end: number } | null>(null)

  const itemsRef = useRef(items)
  useEffect(() => {
    if (itemsRef.current === items) return
    itemsRef.current = items
    setOverrides({})
    setWin(null)
  }, [items])

  const feed = useMemo(() => {
    if (Object.keys(overrides).length === 0) return items
    const moved = items.map((item) => {
      const to = overrides[keyOf(item)]
      if (!to) return item
      // A multi-day job keeps its span when it moves.
      const span = item.endDate ? spanDays(item.date, item.endDate) : 0
      return { ...item, date: to, ...(item.endDate ? { endDate: addDays(to, span) } : {}) }
    })
    // date, then a stable key tiebreak — both total orders applied
    // lexicographically, so the comparator is transitive (see PR #114).
    return moved.sort((a, b) => a.date.localeCompare(b.date) || keyOf(a).localeCompare(keyOf(b)))
  }, [items, overrides])

  const byKey = useMemo(() => new Map(feed.map((i) => [keyOf(i), i])), [feed])

  /** Where the list opens: the spine's day when it falls inside the feed, else today. */
  const anchorDay = useMemo(() => {
    if (!selectedDay || feed.length === 0) return today
    const first = ymd(feed[0].date)
    const last = ymd(feed[feed.length - 1].date)
    return selectedDay >= first && selectedDay <= last ? selectedDay : today
  }, [selectedDay, today, feed])

  const anchorIndex = useMemo(() => {
    const at = feed.findIndex((i) => ymd(i.date) >= anchorDay)
    return at === -1 ? feed.length : at
  }, [feed, anchorDay])

  const listRef = useRef<HTMLElement>(null)
  /** Collapse back to the default window. Loading history prepends rows above
   *  the operator, so put the top of the list — which is now today — back in
   *  view rather than leaving them wherever the reflow landed. */
  function backToToday() {
    setWin(null)
    listRef.current?.scrollIntoView?.({ block: 'start' })
  }

  const view = win ?? { start: anchorIndex, end: Math.min(feed.length, anchorIndex + PAGE) }
  const shown = feed.slice(view.start, view.end)
  const hasEarlier = view.start > 0
  const hasLater = view.end < feed.length
  const atAnchor = win === null

  const groups = useMemo(() => {
    const out: Array<{ label: string; items: CalendarItem[] }> = []
    for (const item of shown) {
      const label = monthLabel(item.date)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(item)
      else out.push({ label, items: [item] })
    }
    return out
  }, [shown])

  /** Where "now" falls once the operator has pulled history in above it. Only
   *  drawn when there IS past in the window — at the anchor the first row is
   *  already today, and a rule above row one would be noise. */
  const todayMarkerKey = useMemo(() => {
    const at = shown.findIndex((i) => ymd(i.date) >= today)
    return at > 0 ? keyOf(shown[at]) : null
  }, [shown, today])

  const selectableInView = useMemo(
    () => shown.filter((i) => RESCHEDULABLE.has(i.kind)).map(keyOf),
    [shown]
  )
  const allInViewSelected = selectableInView.length > 0 && selectableInView.every((k) => selected.has(k))
  const someInViewSelected = selectableInView.some((k) => selected.has(k))

  const selectAllRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someInViewSelected && !allInViewSelected
  }, [someInViewSelected, allInViewSelected])

  /**
   * Anticipation (Tesler): the day field is never blank. Default is the open
   * spine day, else the first day from today forward that carries no booked job
   * or hold — computed, and inspectable because the list itself shows why.
   */
  const nextOpenDay = useMemo(() => {
    const busyDays = new Set(feed.filter((i) => RESCHEDULABLE.has(i.kind)).map((i) => ymd(i.date)))
    let day = today
    for (let n = 0; n < 400 && busyDays.has(day); n += 1) day = addDays(day, 1)
    return day
  }, [feed, today])

  /** The day the bulk bar will write. DERIVED, not synced in an effect: the
   *  operator's own value wins, otherwise the computed default fills the field. */
  const target = selected.size === 0 ? '' : targetInput ?? selectedDay ?? nextOpenDay

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setTargetInput(null)
  }, [])

  /**
   * Escape clears the selection — the standard way out of a bulk mode — but
   * ONLY when the selection is the topmost thing Escape could mean.
   *
   * This used to be a bare `window` keydown listener that knew about nothing
   * else on the page. It therefore also fired for the Escape that closed the
   * cockpit's ⌘K palette, the `?` sheet, the item peek and the mobile rail
   * drawer: one keypress, two dismissals, and a multi-select silently gone.
   * The shared stack (dismiss-stack.ts) is the single owner of the key now, and
   * it only ever calls the layer on top.
   */
  useDismissLayer(selected.size > 0, clearSelection)

  /**
   * Pre-flight the target day. A horizontal calendar will happily stack five
   * jobs on one Saturday; this one counts what is already booked there BEFORE
   * the move, at the point of the move (same stance as the unit picker's
   * inline double-booked warning, PR #119).
   */
  const conflictsOnTarget = useMemo(() => {
    if (!target) return 0
    return feed.filter((i) => RESCHEDULABLE.has(i.kind) && ymd(i.date) === target && !selected.has(keyOf(i))).length
  }, [feed, target, selected])

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAllInView() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allInViewSelected) selectableInView.forEach((k) => next.delete(k))
      else selectableInView.forEach((k) => next.add(k))
      return next
    })
  }

  /**
   * One mutation path for both "move" and "undo": optimistic first, then the
   * server, then either a fresh feed or a full restore. Nothing fails silently.
   */
  async function applyMoves(moves: AgendaMove[], verb: string, inverse: AgendaMove[] | null) {
    const previousOverrides = overrides
    const previousSelection = selected
    const optimistic = { ...overrides }
    for (const m of moves) optimistic[`${m.kind}:${m.id}`] = m.date

    setBusy(true)
    setError(null)
    setStatus(null)
    setUndoMoves(null)
    setOverrides(optimistic)
    setSelected(new Set())

    try {
      const result = await bulkRescheduleAgenda(orgSlug, moves)
      if (result.failures.length > 0) {
        // Roll the rows that did NOT move back to where they were, and put them
        // back in the selection so the operator can retry without re-picking.
        const restored = { ...optimistic }
        const retry = new Set<string>()
        for (const f of result.failures) {
          const key = `${f.kind}:${f.id}`
          retry.add(key)
          if (previousOverrides[key] !== undefined) restored[key] = previousOverrides[key]
          else delete restored[key]
        }
        setOverrides(restored)
        setSelected(retry)
        setError(
          `${result.failures.length} of ${moves.length} could not move — ${result.failures[0].message}`
        )
      }
      if (result.moved > 0) {
        setStatus(`${result.moved} ${result.moved === 1 ? 'item' : 'items'} ${verb}`)
        setUndoMoves(inverse)
        router.refresh()
      }
    } catch (err) {
      // Nothing was applied — restore the list AND the selection exactly.
      setOverrides(previousOverrides)
      setSelected(previousSelection)
      setError(err instanceof Error ? err.message : 'Reschedule failed')
    } finally {
      setBusy(false)
    }
  }

  function onMove() {
    if (!target || selected.size === 0) return
    const moves: AgendaMove[] = []
    const inverse: AgendaMove[] = []
    for (const key of selected) {
      const item = byKey.get(key)
      if (!item || !RESCHEDULABLE.has(item.kind)) continue
      const kind = item.kind as AgendaMove['kind']
      moves.push({ kind, id: item.id, date: target })
      inverse.push({ kind, id: item.id, date: ymd(item.date) })
    }
    if (moves.length === 0) return
    void applyMoves(moves, `moved to ${dayLabel(target)}`, inverse)
  }

  function onUndo() {
    if (!undoMoves || undoMoves.length === 0) return
    void applyMoves(undoMoves, 'moved back', null)
  }

  if (items.length === 0) {
    return (
      <div className="px-5 py-4">
        <EmptyState
          title="Nothing on the calendar"
          description="Booked jobs, holds, drops, tasks and invoice due dates all land here."
          className="px-5 py-12"
          action={
            <Link className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/${orgSlug}/new-event`}>
              Book a job
            </Link>
          }
        />
      </div>
    )
  }

  const tooMany = selected.size > MAX_BULK_MOVE

  return (
    <section ref={listRef} aria-label="Agenda" className="min-w-0">
      {/* Selection state is announced, not just drawn. */}
      <p className="sr-only" role="status" aria-live="polite">
        {selected.size === 0
          ? 'Nothing selected'
          : `${selected.size} ${selected.size === 1 ? 'row' : 'rows'} selected`}
      </p>

      <div className="px-2 py-3 sm:px-5 sm:py-4">
        {/* List controls: select-all, where the window sits, and the way back. */}
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border pb-2">
          <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
            <input
              ref={selectAllRef}
              type="checkbox"
              className="size-4 accent-primary"
              checked={allInViewSelected}
              disabled={selectableInView.length === 0}
              onChange={toggleAllInView}
            />
            <span className="sr-only">
              Select all {selectableInView.length} reschedulable rows in view (booked jobs and holds)
            </span>
          </label>
          <p className="text-xs text-muted-foreground tabular-nums">
            Showing <span className="font-semibold text-foreground">{shown.length}</span> of {feed.length}
          </p>
          {!atAnchor ? (
            <Button type="button" variant="ghost" size="sm" className="ml-auto h-11" onClick={backToToday}>
              Back to today
            </Button>
          ) : null}
        </div>

        {hasEarlier ? (
          <div className="pb-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setWin({ start: Math.max(0, view.start - PAGE), end: view.end })}
            >
              Load earlier ({view.start} before this)
            </Button>
          </div>
        ) : null}

        {shown.length === 0 ? (
          <EmptyState
            title={`Nothing on or after ${dayLabel(anchorDay)}`}
            description="Everything on this calendar is in the past."
            className="px-5 py-10"
            action={
              <Link className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/${orgSlug}/new-event`}>
                Book a job
              </Link>
            }
          />
        ) : null}

        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            <h2 className="sticky top-0 z-10 border-b border-border bg-background/95 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground backdrop-blur">
              {group.label}
            </h2>
            {group.items.map((item) => {
              const key = keyOf(item)
              const selectable = RESCHEDULABLE.has(item.kind)
              const isSelected = selected.has(key)
              return (
                <div key={key}>
                {key === todayMarkerKey ? (
                  <p className="flex items-center gap-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--link)]">
                    <span className="h-px flex-1 bg-[var(--link)]/40" aria-hidden />
                    Today
                    <span className="h-px flex-1 bg-[var(--link)]/40" aria-hidden />
                  </p>
                ) : null}
                <div
                  data-selected={isSelected || undefined}
                  className={cn(
                    'flex items-start gap-1 border-b border-border/60',
                    isSelected && 'bg-primary/5'
                  )}
                >
                  {selectable ? (
                    <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={isSelected}
                        onChange={() => toggleRow(key)}
                      />
                      <span className="sr-only">
                        Select {item.title} on {dayLabel(item.date)}
                      </span>
                    </label>
                  ) : (
                    <span className="size-11 shrink-0" aria-hidden />
                  )}
                  <span className="w-11 shrink-0 pt-3.5 font-mono text-xs font-semibold tabular-nums">
                    {ymd(item.date).slice(5)}
                  </span>
                  <span className="flex shrink-0 pt-4">
                    <KindDot kind={item.kind} />
                  </span>
                  <div className="min-w-0 flex-1 py-2.5 pl-1.5">
                    <Link
                      href={item.href}
                      // The peek contract (see CalendarCanvas). Inside the
                      // cockpit this row opens IN PLACE instead of navigating —
                      // the agenda is the surface where losing your scroll
                      // position costs the most, since the window is paged. The
                      // href stays real, so a middle-click, a ⌘-click and the
                      // agenda rendered outside the cockpit all still navigate.
                      data-item-key={key}
                      className={cn('text-sm hover:underline', item.kind === 'event' && 'font-semibold')}
                    >
                      {item.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {[item.tentative ? 'tentative' : null, item.detail].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {item.amount !== undefined ? (
                    <span className="shrink-0 pr-2 pt-3.5 text-xs font-semibold tabular-nums text-[var(--money-green)]">
                      {formatMoney(item.amount)}
                    </span>
                  ) : null}
                </div>
                </div>
              )
            })}
          </div>
        ))}

        {hasLater ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setWin({ start: view.start, end: Math.min(feed.length, view.end + PAGE) })}
          >
            Load later ({feed.length - view.end} more)
          </Button>
        ) : null}
      </div>

      {/* Bulk bar — bottom-anchored so it sits in the phone's thumb zone. */}
      {selected.size > 0 || status || error ? (
        <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 px-2 py-2 backdrop-blur sm:px-5">
          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tabular-nums">{selected.size} selected</p>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Move to</span>
                <input
                  type="date"
                  value={target}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="h-11 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label="Move the selected rows to this day"
                />
              </label>
              <Button
                type="button"
                size="sm"
                className="h-11"
                onClick={onMove}
                disabled={busy || !target || tooMany}
              >
                {busy ? 'Moving…' : `Move ${selected.size}`}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-11" onClick={clearSelection}>
                Clear
              </Button>
              {tooMany ? (
                <p className="basis-full text-xs text-destructive">
                  Too many at once — move {MAX_BULK_MOVE} or fewer.
                </p>
              ) : conflictsOnTarget > 0 ? (
                <p className="basis-full text-xs text-[var(--status-pending-fg)]">
                  Heads up: {conflictsOnTarget} booked {conflictsOnTarget === 1 ? 'item is' : 'items are'} already on{' '}
                  {dayLabel(target)}.
                </p>
              ) : null}
            </div>
          ) : null}

          {status || error ? (
            <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 pt-1">
              {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
              {status && undoMoves ? (
                <Button type="button" variant="outline" size="sm" onClick={onUndo} disabled={busy}>
                  Undo
                </Button>
              ) : null}
              {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  setStatus(null)
                  setError(null)
                  setUndoMoves(null)
                }}
              >
                Dismiss
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
