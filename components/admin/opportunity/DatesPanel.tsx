'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { listCalendarRange } from '@/actions/calendar'
import { cn } from '@/lib/utils'
import {
  windowDays, rangeLabel, daysOutLabel, monthStartOf, addMonths,
  monthLabel, monthGrid, bucketByDay, shortDayLabel, listDateLabel,
} from '@/lib/date-window'
import { addDays } from '@/lib/opportunity-detail'
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
      // line below is swapped for a "couldn't load" line while the window
      // sits outside `confirmed`, so a fetch failure never reads as "free."
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

  const daysSet = new Set(days)
  const windowItems = items
    .filter((i) => daysSet.has(i.date.slice(0, 10)))
    .sort((a, b) => a.date.localeCompare(b.date))
  const listableItems = windowItems.filter((i) => i.kind !== 'task')
  const taskCount = windowItems.filter((i) => i.kind === 'task').length
  const distance = daysOutLabel(lead.event_date, today)
  // The displayed window isn't fully backed by a range we've actually loaded successfully.
  const windowUnconfirmed = days[0] < confirmed.current.from || days[9] > confirmed.current.to

  return (
    <Card>
      <CardContent className="space-y-2">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Dates</span>
          {previewing ? (
            <span className="text-xs font-medium text-destructive">previewing {shortMonthDay(displayCenter)}</span>
          ) : (
            distance && <span className="text-xs text-muted-foreground">{distance}</span>
          )}
        </div>

        {/* Strip controls row */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Toggle month"
            aria-expanded={monthOpen}
            onClick={() => setMonthOpen((v) => !v)}
            className="text-muted-foreground"
          >
            ▾
          </button>
          <span className={cn('text-xs font-medium', previewing ? 'text-destructive' : '')}>{rangeLabel(days)}</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label="Earlier dates"
              onClick={() => { setCenter(addDays(center, -10)); setPinned(false) }}
              className="text-muted-foreground"
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Later dates"
              onClick={() => { setCenter(addDays(center, 10)); setPinned(false) }}
              className="text-muted-foreground"
            >
              →
            </button>
          </div>
        </div>

        {/* Ten-day strip */}
        <div className="grid grid-cols-10 gap-1">
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

        {/* Month grid — renders below the strip so the strip never moves. */}
        {monthOpen && (
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">{monthLabel(monthStart)}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => setMonthStart(addMonths(monthStart, -1))}
                  className="text-muted-foreground"
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => setMonthStart(addMonths(monthStart, 1))}
                  className="text-muted-foreground"
                >
                  →
                </button>
              </div>
            </div>
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
                      'box-border rounded-sm border border-transparent py-1 text-xs',
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
            windowUnconfirmed && loadFailed ? (
              <p className="text-muted-foreground">Couldn&apos;t load this window — try again.</p>
            ) : (
              <p className="text-muted-foreground">Nothing on the calendar in this window.</p>
            )
          ) : (
            <>
              {listableItems.map((item) => (
                <div key={`${item.kind}:${item.id}`}>
                  <Link href={item.href} className="hover:underline">
                    {listDateLabel(item.date)} — {item.title}
                  </Link>
                  <span className="ml-2 text-muted-foreground">{item.kind === 'event' ? 'Booked' : 'Tentative'}</span>
                </div>
              ))}
              {taskCount > 0 && (
                <p className="text-muted-foreground">
                  {taskCount} task{taskCount === 1 ? '' : 's'} across the window
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
