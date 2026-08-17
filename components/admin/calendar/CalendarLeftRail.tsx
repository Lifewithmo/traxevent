'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { TabLinks } from '@/components/ui/tab-links'
import { addDays } from '@/lib/opportunity-detail'
import { calendarHref } from '@/lib/calendar-href'
import { cn } from '@/lib/utils'
import type { WeekRollup } from '@/lib/calendar-week'
import type { RunwayJob } from '@/lib/calendar-cashflow'
import { CalendarKpiBand } from '@/components/admin/calendar/CalendarKpiBand'
import { RunwayStrip } from '@/components/admin/calendar/RunwayStrip'
import { SubscribePanel } from '@/components/admin/calendar/SubscribePanel'
import { Button } from '@/components/ui/button'

interface CalendarLeftRailProps {
  orgSlug: string
  today: string
  /** weekRollup() over the CURRENT week (param-independent, so the rail survives
   *  navigation without a refetch). */
  rollup: WeekRollup
  /** buildRunway() output over the whole feed. */
  runway: RunwayJob[]
  /** The org's ICS feed URL (origin + /ics/[orgSlug]/[token]); enables the
   *  Subscribe-in-Google/Outlook disclosure. Omitted → the entry point hides. */
  subscribeUrl?: string
}

const YMD = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// Mirrors AdminSidebar / ClientQueueRail's hamburger so the drawer reads as the
// same off-canvas pattern.
function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden focusable="false">
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  )
}

function monthTitle(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/** Monday-start grid of the month's days plus the leading/trailing pad days
 *  (marked out-of-month) so the calendar is a clean 7-wide block. */
function monthCells(monthKey: string): Array<{ day: string; inMonth: boolean }> {
  const [year, month1] = monthKey.split('-').map(Number)
  const firstYmd = `${monthKey}-01`
  const firstDow = new Date(`${firstYmd}T00:00:00.000Z`).getUTCDay() // 0 Sun … 6 Sat
  const lead = (firstDow + 6) % 7
  const total = Math.ceil((lead + daysInMonth(year, month1)) / 7) * 7
  const gridStart = addDays(firstYmd, -lead)
  return Array.from({ length: total }, (_, i) => {
    const day = addDays(gridStart, i)
    return { day, inMonth: day.slice(0, 7) === monthKey }
  })
}

export function CalendarLeftRail({ orgSlug, today, rollup, runway, subscribeUrl }: CalendarLeftRailProps) {
  const params = useSearchParams()
  const pathname = usePathname() ?? ''
  const [showSubscribe, setShowSubscribe] = useState(false)
  // Below md the rail is an off-canvas drawer (mirrors AdminSidebar / ClientQueueRail)
  // so the kind filter, mini-month, KPIs, runway and ICS subscribe stay reachable on
  // mobile instead of being hidden. Always opens closed.
  const [mobileOpen, setMobileOpen] = useState(false)

  // Navigating (picking a day / toggling scope) dismisses the drawer.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const view = params.get('view') ?? undefined
  const kinds = params.get('kinds') ?? undefined
  const week = params.get('week') ?? undefined

  // The open day comes from the /calendar/[ymd] segment, not a param.
  const last = pathname.split('/').filter(Boolean).pop() ?? ''
  const selected = YMD.test(last) ? last : undefined

  // Mini-month cursor: starts on the open day's month (or the current week /
  // today), and pages locally without navigating away from the day.
  const initialMonth = (selected ?? week ?? today).slice(0, 7)
  const [cursor, setCursor] = useState(initialMonth)

  const cells = useMemo(() => monthCells(cursor), [cursor])
  const stepMonth = (delta: number) => {
    const anchor = addDays(`${cursor}-01`, delta > 0 ? 32 : -1)
    setCursor(anchor.slice(0, 7))
  }

  // Links that target a SPECIFIC day must NOT forward the current `?week`: a stale
  // week would win over the clicked day (page.tsx / [ymd] do `anchor = week ?? ymd`)
  // and render an unrelated period with the clicked day off-screen. Omit it so the
  // target self-derives its own week/month — mirroring the WeekGrid/MonthGrid
  // day-header links, which already omit week.
  const dayHref = (ymd: string) => calendarHref({ orgSlug, view, kinds, ymd })

  // Kind filter toggles scope while staying put. With a day open, keep the day and
  // drop week (the day derives its period); on the bare canvas, keep the shown week.
  const filterTabs = [
    { key: 'all' as const, label: 'Everything', href: calendarHref({ orgSlug, view, week: selected ? undefined : week, ymd: selected }) },
    {
      key: 'pipeline' as const,
      label: 'Pipeline only',
      href: calendarHref({ orgSlug, view, week: selected ? undefined : week, kinds: 'pipeline', ymd: selected }),
    },
  ]

  return (
    <>
      {/* Mobile bar: the only rail chrome that takes layout space below md
          (mirrors AdminSidebar's own mobile bar). Hidden from md up. */}
      <div className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open calendar panel"
          aria-expanded={mobileOpen}
          aria-controls="calendar-left-rail"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-card"
        >
          <MenuIcon />
        </button>
        <span className="text-sm font-semibold">Calendar</span>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
      )}

      <div
        id="calendar-left-rail"
        className={cn(
          'flex h-full w-[280px] shrink-0 flex-col overflow-y-auto bg-sidebar md:border-r md:border-sidebar-border',
          // Below md: off-canvas drawer, out of flow so the canvas gets full width.
          'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[280px]',
          'max-md:transition-transform max-md:duration-200 motion-reduce:transition-none',
          mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'
        )}
      >
      <div className="border-b border-sidebar-border px-4 py-3">
        <TabLinks
          tabs={filterTabs}
          active={kinds === 'pipeline' ? 'pipeline' : 'all'}
          ariaLabel="Calendar filter"
          className="w-full"
        />
      </div>

      {/* Mini-month */}
      <div className="border-b border-sidebar-border px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-sidebar-foreground">{monthTitle(cursor)}</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => stepMonth(-1)}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-card motion-reduce:transition-none"
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => stepMonth(1)}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-card motion-reduce:transition-none"
            >
              →
            </button>
          </div>
        </div>
        <div role="grid" aria-label={`Mini calendar, ${monthTitle(cursor)}`} className="grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((w, i) => (
            <div
              key={i}
              role="columnheader"
              aria-hidden
              className="pb-1 text-center font-mono text-[9px] font-bold uppercase text-muted-foreground"
            >
              {w}
            </div>
          ))}
          {cells.map(({ day, inMonth }) => {
            const dayNum = Number(day.slice(8, 10))
            const isToday = day === today
            const isSelected = day === selected
            if (!inMonth) {
              return <span key={day} aria-hidden className="py-1 text-center text-[11px] text-muted-foreground/30" />
            }
            return (
              <Link
                key={day}
                href={dayHref(day)}
                aria-current={isSelected ? 'date' : undefined}
                className={cn(
                  'flex h-6 items-center justify-center rounded-md text-[11px] tabular-nums transition-colors hover:bg-card focus-visible:bg-card motion-reduce:transition-none',
                  isToday && 'bg-foreground font-bold text-background',
                  isSelected && !isToday && 'bg-card font-semibold text-foreground ring-1 ring-inset ring-ring',
                  !isToday && !isSelected && 'text-sidebar-foreground'
                )}
              >
                {dayNum}
              </Link>
            )
          })}
        </div>
      </div>

      {/* This-week KPIs (Booked-$ wired here) */}
      <div className="border-b border-sidebar-border">
        <p className="px-5 pt-3 text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
          This week
        </p>
        <CalendarKpiBand rollup={rollup} />
      </div>

      {/* Cash-flow runway (category-defining) */}
      <RunwayStrip orgSlug={orgSlug} runway={runway} dayHref={dayHref} />

      {/* ICS subscribe — parity with the retired week view. */}
      {subscribeUrl ? (
        <div className="mt-auto border-t border-sidebar-border">
          <div className="px-4 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              aria-expanded={showSubscribe}
              onClick={() => setShowSubscribe((s) => !s)}
            >
              Subscribe in Google / Outlook
            </Button>
          </div>
          {showSubscribe ? <SubscribePanel url={subscribeUrl} /> : null}
        </div>
      ) : null}
      </div>
    </>
  )
}
