'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { listCalendarRange } from '@/actions/calendar'
import { cn } from '@/lib/utils'
import {
  windowDays, rangeLabel, monthStartOf, addMonths,
  monthLabel, monthGrid, bucketByDay, shortDayLabel, listDateLabel,
} from '@/lib/date-window'
import { addDays } from '@/lib/opportunity-detail'
import { opportunityTitle } from '@/lib/leads'
import { AddToCalendarButton } from '@/components/admin/opportunity/AddToCalendarButton'
import type { CalendarItem } from '@/lib/calendar'
import type { Lead } from '@/lib/types'

interface DatesPanelProps {
  orgId: string
  orgSlug: string
  lead: Lead
  today: string
  initialItems: CalendarItem[]
}

const WEEKDAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** 'Sep 14' — month-short + day, derived from listDateLabel by dropping the weekday prefix. */
function shortMonthDay(ymd: string): string {
  return listDateLabel(ymd).slice(4)
}

export function DatesPanel({ orgId, orgSlug, lead, today, initialItems }: DatesPanelProps) {
  const homeCenter = lead.event_date ?? today
  const [center, setCenter] = useState(homeCenter)      // moved by arrows and by pinning
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [monthOpen, setMonthOpen] = useState(false)
  const [monthStart, setMonthStart] = useState(monthStartOf(homeCenter))
  const [items, setItems] = useState<CalendarItem[]>(initialItems)
  // One contiguous covered range; grow it as the user pages/hovers beyond it.
  // `covered` is the optimistic/in-flight dedupe marker (set before the
  // fetch resolves). `confirmed` is the last range whose fetch actually
  // succeeded — it starts as the home window, which was server-loaded.
  const covered = useRef({ from: windowDays(homeCenter)[0], to: windowDays(homeCenter)[9] })
  const confirmed = useRef({ from: windowDays(homeCenter)[0], to: windowDays(homeCenter)[9] })
  // True while the most recent fetch attempt for an uncovered range failed — distinguishes
  // "genuinely nothing here" from "we don't actually know yet" in the empty-state line.
  const [loadFailed, setLoadFailed] = useState(false)
  // True while an explicit Retry is in flight. `ensureRange` clears `loadFailed`
  // synchronously before its await, so without this the failure state would be
  // replaced by the free-window message for the whole refetch — exactly the
  // false "nothing booked here" the loadFailed distinction exists to prevent.
  const [retrying, setRetrying] = useState(false)

  const displayCenter = pinned ? center : hovered ?? center
  const days = windowDays(displayCenter)
  const buckets = bucketByDay(items, days)
  const previewing = pinned || hovered != null

  async function ensureRange(from: string, to: string) {
    const c = covered.current
    if (from >= c.from && to <= c.to) return
    const newFrom = from < c.from ? from : c.from
    const newTo = to > c.to ? to : c.to
    const attempted = { from: newFrom, to: newTo }
    // Mark covered up front (not just on success) so a second call for
    // overlapping bounds while this one is still in flight doesn't
    // double-fetch.
    covered.current = attempted
    setLoadFailed(false)
    try {
      const fetched = await listCalendarRange(orgId, orgSlug, newFrom, newTo)
      setItems((prev) => {
        const seen = new Set(fetched.map((i) => `${i.kind}:${i.id}`))
        return [...fetched, ...prev.filter((i) => !seen.has(`${i.kind}:${i.id}`))]
      })
      // This range genuinely fetched — record it as the new floor a failure
      // can roll back to, and re-union covered in case a concurrent
      // failure shrank it while we were in flight (never shrink covered on
      // success).
      confirmed.current = attempted
      const cur = covered.current
      covered.current = {
        from: attempted.from < cur.from ? attempted.from : cur.from,
        to: attempted.to > cur.to ? attempted.to : cur.to,
      }
    } catch {
      // Fetch failed — fall back to the last range that actually succeeded,
      // not just the pre-attempt range: with two overlapping in-flight
      // calls, a one-hop rollback can land on a range that ALSO failed,
      // marking it covered again (a returning silent gap). Falling back to
      // `confirmed` is unconditional and chains correctly through any
      // number of overlapping failures. This can cause one duplicate fetch
      // for a still-in-flight overlapping call, which is an acceptable
      // cost. Silent retry-on-next-change (no toast/banner); the empty-state
      // below is swapped for a "couldn't load" state while the window sits
      // outside `confirmed`, so a fetch failure never reads as "free."
      covered.current = confirmed.current
      setLoadFailed(true)
    }
  }

  useEffect(() => { void ensureRange(days[0], days[9]) }, [days[0], days[9]])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pinned) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setPinned(false); setCenter(homeCenter); setHovered(null) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pinned, homeCenter])

  function pinDay(ymd: string) {
    if (pinned && ymd === center) { setPinned(false); setCenter(homeCenter) }
    else { setPinned(true); setCenter(ymd) }
    setHovered(null)
  }

  function goHome() {
    setPinned(false)
    setHovered(null)
    setCenter(homeCenter)
  }

  const daysSet = new Set(days)
  const windowItems = items
    .filter((i) => daysSet.has(i.date.slice(0, 10)))
    .sort((a, b) => a.date.localeCompare(b.date))
  const listableItems = windowItems.filter((i) => i.kind !== 'task')
  const taskCount = windowItems.filter((i) => i.kind === 'task').length
  // The displayed window isn't fully backed by a range we've actually loaded successfully.
  const windowUnconfirmed = days[0] < confirmed.current.from || days[9] > confirmed.current.to
  const awayFromHome = displayCenter !== homeCenter

  return (
    <Card>
      <CardContent className="space-y-2">
        {/* Header row. The days-to-event figure that used to sit here as 12px
            gray prose is now a figure tile in the opportunity KPI band — it is
            deliberately NOT repeated inline. What stays is the panel-local
            preview state, which the band cannot show. */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Dates</span>
          {/* Height-pinned slot: the contents swap between a button and a pill
              on hover-preview, and the grid driving that hover sits BELOW this
              row — an unpinned slot would resize the header and re-seat the
              pointer mid-hover. min-h-7 covers the taller of the two. */}
          <span className="flex min-h-7 items-center gap-2">
            {lead.event_date && !previewing && (
              <AddToCalendarButton title={opportunityTitle(lead)} date={lead.event_date} />
            )}
            {previewing && (
              <StatusPill tone="pending">previewing {shortMonthDay(displayCenter)}</StatusPill>
            )}
          </span>
        </div>

        {/* Strip controls row */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Toggle month"
            aria-expanded={monthOpen}
            onClick={() => setMonthOpen((v) => !v)}
          >
            <ChevronDown />
          </Button>
          <span className={cn('text-xs font-medium', previewing ? 'text-primary' : '')}>{rangeLabel(days)}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Earlier dates"
              onClick={() => { setCenter(addDays(center, -10)); setPinned(false) }}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Later dates"
              onClick={() => { setCenter(addDays(center, 10)); setPinned(false) }}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        {/* Ten-day strip. R8: ten columns cannot legibly collapse — the window
            is a fixed ten days (windowDays()) and the covered/confirmed range
            refs index days[0]/days[9]. Rather than reshape the window, the
            strip keeps its natural width and scrolls sideways inside the rail,
            which is ~319px wide on a 375px phone. A scrollable region has to be
            focusable or keyboard-only users can never reach the clipped columns
            (WCAG 2.1.1), so it takes a tab stop, a name, and a focus ring. */}
        <div
          tabIndex={0}
          role="group"
          aria-label="Ten-day availability strip"
          className="overflow-x-auto rounded-md pb-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <div className="grid min-w-[360px] grid-cols-10 gap-1">
            {days.map((d) => {
              const { weekday, day } = shortDayLabel(d)
              const isEventDay = d === lead.event_date
              const isPreviewDay = d === displayCenter && previewing
              return (
                <div key={d} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{weekday}</span>
                  <span
                    className={cn(
                      'box-border flex h-5 w-5 items-center justify-center rounded-full border text-[11px]',
                      isEventDay
                        ? 'border-transparent bg-foreground text-background'
                        : isPreviewDay
                          ? 'border-foreground'
                          : 'border border-transparent'
                    )}
                  >
                    {day}
                  </span>
                  <div className="flex w-full flex-col gap-0.5">
                    {(buckets[d] ?? []).map((item) => (
                      <span
                        key={`${item.kind}:${item.id}`}
                        className={cn(
                          'box-border w-full rounded-sm',
                          item.kind === 'event' && 'h-6 bg-foreground',
                          item.kind === 'lead' && 'h-6 border border-dashed border-foreground',
                          item.kind === 'task' && 'h-1.5 bg-muted-foreground/40'
                        )}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Month grid — renders below the strip so the strip never moves. */}
        {monthOpen && (
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">{monthLabel(monthStart)}</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Previous month"
                  onClick={() => setMonthStart(addMonths(monthStart, -1))}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Next month"
                  onClick={() => setMonthStart(addMonths(monthStart, 1))}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
            {/* R8 exception, decided deliberately: a month calendar IS seven
                columns — collapsing it destroys the weekday alignment that makes
                it readable, so it does NOT stack below md. It stays legible at
                375px: the rail is ~319px wide there, and seven columns with
                gap-1 leave ~41px per cell — comfortably above the 24px tap
                target for a two-digit day. */}
            <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
              {WEEKDAY_HEADERS.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGrid(monthStart).map((cell) => {
                const { day } = shortDayLabel(cell.ymd)
                const inWindow = daysSet.has(cell.ymd)
                return (
                  <button
                    key={cell.ymd}
                    type="button"
                    aria-label={shortMonthDay(cell.ymd)}
                    aria-pressed={pinned && cell.ymd === center}
                    onMouseEnter={() => !pinned && setHovered(cell.ymd)}
                    onMouseLeave={() => !pinned && setHovered(null)}
                    onClick={() => pinDay(cell.ymd)}
                    className={cn(
                      'box-border min-h-8 rounded-sm border border-transparent py-1 text-xs',
                      !cell.inMonth && 'text-muted-foreground',
                      inWindow && 'bg-muted'
                    )}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* List */}
        <div className="space-y-1 pt-1 text-sm">
          {listableItems.length === 0 && taskCount === 0 ? (
            (windowUnconfirmed && loadFailed) || retrying ? (
              // Deliberately distinct from the free-window state below: a failed
              // fetch must never read as "nothing booked here" — including for
              // the duration of a retry, which is still "we don't know yet."
              <EmptyState
                title="Calendar didn't load"
                description="Couldn't load this window — try again."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={retrying}
                    onClick={async () => {
                      setRetrying(true)
                      try { await ensureRange(days[0], days[9]) } finally { setRetrying(false) }
                    }}
                  >
                    {retrying ? 'Retrying…' : 'Retry'}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="This window is free"
                description="Nothing on the calendar in this window."
                action={
                  awayFromHome ? (
                    <Button variant="outline" size="sm" onClick={goHome}>
                      {lead.event_date ? 'Back to event week' : 'Back to today'}
                    </Button>
                  ) : monthOpen ? (
                    // The one CTA must move the operator FORWARD. Once the month
                    // grid is open — which this state's own CTA did — offering
                    // "Hide months" would take the browsing tool away again, so
                    // the next step becomes advancing the window instead.
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setCenter(addDays(center, 10)); setPinned(false) }}
                    >
                      Next 10 days
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setMonthOpen(true)}>
                      Browse months
                    </Button>
                  )
                }
              />
            )
          ) : (
            <>
              {listableItems.map((item) => (
                <div key={`${item.kind}:${item.id}`} className="flex items-center justify-between gap-2">
                  <Link href={item.href} className="min-w-0 text-primary hover:underline">
                    {listDateLabel(item.date)} — {item.title}
                  </Link>
                  {item.kind === 'event' ? (
                    <StatusPill tone="confirmed" className="shrink-0">Booked</StatusPill>
                  ) : (
                    <StatusPill tone="pending" className="shrink-0">Tentative</StatusPill>
                  )}
                </div>
              ))}
              {taskCount > 0 && (
                // A computed rollup reads as a figure, not as muted gray prose.
                // Compact inline rather than a tile — the rail panel is too
                // narrow for one, and the KPI band above is a fixed four.
                <p data-testid="window-task-count" className="flex items-baseline gap-1.5 pt-0.5">
                  <span className="text-[15px] font-semibold leading-none tracking-[-.02em] tabular-nums">
                    {taskCount}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
                    tasks in window
                  </span>
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
