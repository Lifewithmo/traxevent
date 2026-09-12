'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { TabLinks } from '@/components/ui/tab-links'
import { addDays } from '@/lib/opportunity-detail'
import { calendarHref } from '@/lib/calendar-href'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { WeekRollup } from '@/lib/calendar-week'
import type { RunwayJob } from '@/lib/calendar-cashflow'
import { CalendarKpiBand } from '@/components/admin/calendar/CalendarKpiBand'
import { RunwayStrip } from '@/components/admin/calendar/RunwayStrip'
import { UnscheduledSection } from '@/components/admin/calendar/UnscheduledSection'
import type { UnscheduledRow } from '@/lib/calendar-unscheduled'
import { SubscribePanel } from '@/components/admin/calendar/SubscribePanel'
import { KindLegend } from '@/components/admin/calendar/KindDot'
import { BookabilityKey } from '@/components/admin/calendar/BookabilityMark'
import { useDismissLayer } from '@/components/admin/calendar/dismiss-stack'
import {
  nextOpenDates,
  shortDayLabel,
  weekdayName,
  type BookabilityCtx,
} from '@/lib/calendar-bookability'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RAIL'S JOB, in the operator's words — one solo mobile-beverage owner who
 * also drives the cart, on a phone, in a van:
 *
 *     "What still needs a day put on it, and what day can I say yes to?"
 *
 * Everything in here serves that or gets quieter. The COMPOSITION PASS that
 * produced this shape found seven sections in one scroll — filter+legend,
 * mini-month, next-open, unscheduled queue, this-week KPIs, cash runway, ICS
 * subscribe — each with the identical 11px/600/uppercase eyebrow, each
 * individually disciplined about "not adding a fourth hierarchy level", and the
 * sum with no hierarchy at all: navigation, a queue and three reports all
 * reading as siblings.
 *
 * FIVE ZONES NOW, with exactly one figure and four grounds:
 *
 *  1. WHICH DAY (nav) — scope filter + mini-month + next-open chips, merged into
 *     ONE hairline-separated zone. Three boxes became one. Kept at the top
 *     because every calendar the operator has ever used puts the month grid
 *     top-left (Jakob), and it reads as texture — a repeating 11px lattice — not
 *     as a claim on attention.
 *  2. NEEDS A DATE — **the focal element**. The rail's only real heading, its
 *     only 26px number, and its only full border. See UnscheduledSection.
 *  3. THIS WEEK — collapsed to a one-line summary; the five StatTiles are one
 *     tap away. They are param-independent (always the CURRENT week, even while
 *     you browse October) and largely restate the grid beside them, so 270px of
 *     card chrome was the rail's worst signal-per-pixel. The summary keeps every
 *     value AND escalates overdue money / blockers so no alarm hides behind a
 *     disclosure.
 *  4. CASH RUNWAY — hairline rows instead of five bordered cards, plus the
 *     verdict line it never had.
 *  5. KEY & SETUP — the two always-on mark legends and the ICS link, together in
 *     one footer. Reference material, not content: it belongs at the bottom edge
 *     where a legend belongs, not in the rail's loudest slot.
 * ─────────────────────────────────────────────────────────────────────────────
 */

interface CalendarLeftRailProps {
  orgSlug: string
  today: string
  /** weekRollup() over the CURRENT week (param-independent, so the rail survives
   *  navigation without a refetch). */
  rollup: WeekRollup
  /** buildRunway() output over the whole feed. */
  runway: RunwayJob[]
  /** buildUnscheduled() output, already ranked and tagged with `committed`.
   *  The work that has NO date — dropped by buildCalendarFeed, and therefore
   *  invisible on every other calendar surface. Optional so the rail still
   *  renders outside the cockpit shell; the empty list is a real state, not a
   *  missing one. */
  unscheduled?: UnscheduledRow[]
  /** Everything needed to answer "are you free that day?" for any date, with no
   *  further I/O. Omitted/null → the bookability block hides entirely. */
  bookability?: BookabilityCtx | null
  /** The org's ICS feed URL (origin + /ics/[orgSlug]/[token]); enables the
   *  Subscribe-in-Google/Outlook disclosure. Omitted → the entry point hides. */
  subscribeUrl?: string
}

/**
 * The weekday the "next open" line is anchored on.
 *
 * Saturday, hardcoded, because this cockpit's anchor operator is a mobile
 * beverage cart: weddings, markets and brewery pop-ups are weekend-shaped, and
 * "what Saturdays have you got left" is the single most-asked question of the
 * business. SEAM: when orgs start differing (a corporate-catering vertical is
 * Thursday-shaped), this becomes an org setting rather than a constant — the
 * rest of the machinery already takes the weekday from the date it is handed.
 */
const ANCHOR_DOW = 6 // 0 Sun … 6 Sat

/** The first ANCHOR_DOW on or after `ymd`. */
function nextAnchorDay(ymd: string): string {
  const dow = new Date(`${ymd}T00:00:00.000Z`).getUTCDay()
  return addDays(ymd, (ANCHOR_DOW - dow + 7) % 7)
}

/**
 * "Next open Saturday" — the one answer this rail can give that no other surface
 * can, and the reason it earns space here.
 *
 * The month grid can only answer about days you are already looking at, and the
 * day spine only about the day you opened. The operator on the phone has neither:
 * they have a customer asking for "a Saturday in the autumn". This line answers
 * that with zero navigation.
 *
 * COMPOSITION: this is no longer its own bordered section. It is about DATES, so
 * it is a footer INSIDE the mini-month zone — same question, same box. Its
 * always-on <BookabilityKey/> moved to the rail's Key footer, where the other
 * mark legend already lives; a key belongs with the other key, not wedged
 * between the date picker and the queue.
 */
function NextOpenLine({ ctx, today }: { ctx: BookabilityCtx; today: string }) {
  const anchor = nextAnchorDay(today)
  // nextOpenDates scans forward in +7 steps from the date it is GIVEN, so
  // stepping back one week makes `anchor` itself the first candidate.
  const open = nextOpenDates(addDays(anchor, -7), ctx, 3)

  return (
    <div data-slot="rail-bookability" className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <p className="text-[11px] text-muted-foreground">Next open {weekdayName(anchor)}</p>
      {open.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {open.map((d) => (
            <li key={d}>
              {/* One tap to that day's spine — the answer is offerable, not just
                  readable. 24px tall (WCAG 2.5.8 target size). */}
              <Link
                href={calendarHref({ orgSlug: ctx.orgSlug, ymd: d })}
                className="inline-flex min-h-6 items-center rounded-md border border-sidebar-border px-1.5 text-xs font-medium tabular-nums text-sidebar-foreground hover:bg-sidebar-hover focus-visible:bg-sidebar-hover"
              >
                {shortDayLabel(d)}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        // Never a blank state: a fully-booked six months is real news, and the
        // next thing to do about it is add capacity.
        <p className="text-[11px] leading-tight text-muted-foreground">
          None in the next six months.{' '}
          <Link href={`/${ctx.orgSlug}/capacity`} className="underline underline-offset-2">
            Add capacity
          </Link>
        </p>
      )}
    </div>
  )
}

/**
 * ZONE 3's collapsed face: every week number in one line, with the two that are
 * ALARMS escalated so a disclosure can never hide them (Nielsen #1).
 *
 * This is what buys back ~220px of the rail. The five StatTiles are still one
 * tap away and still carry their per-tile "so what" notes; what the operator
 * loses by default is five borders, five card backgrounds and five shadows in a
 * 280px column, on numbers that describe a week they may not even be looking at.
 */
function WeekSummary({ rollup }: { rollup: WeekRollup }) {
  // A zero is not a fact worth a slot. Only what is actually there gets named,
  // so a quiet week reads as one clause instead of four "0 …"s.
  const parts: React.ReactNode[] = []
  if (rollup.eventCount > 0) {
    parts.push(
      <span key="events">
        <span className="tabular-nums">{rollup.eventCount}</span>{' '}
        {rollup.eventCount === 1 ? 'event' : 'events'}
      </span>
    )
  }
  if (rollup.guestCount > 0) {
    parts.push(
      <span key="guests">
        <span className="tabular-nums">{rollup.guestCount.toLocaleString()}</span>{' '}
        {rollup.guestCount === 1 ? 'guest' : 'guests'}
      </span>
    )
  }
  if (rollup.bookedValue > 0) {
    parts.push(
      <span key="booked">
        <span className="tabular-nums text-[var(--money-green)]">{formatMoney(rollup.bookedValue)}</span> booked
      </span>
    )
  }
  if (rollup.dueAmount > 0) {
    parts.push(
      <span key="due">
        <span className="tabular-nums">{formatMoney(rollup.dueAmount)}</span> due
      </span>
    )
  }
  // The two ALARMS. They ride the summary rather than the tiles precisely
  // because the tiles are collapsed: a disclosure must never be the only place
  // overdue money or a blocked job is stated (Nielsen #1).
  if (rollup.overdueDueAmount > 0) {
    parts.push(
      <span key="overdue" className="font-semibold text-[var(--danger-fg)]">
        <span className="tabular-nums">{formatMoney(rollup.overdueDueAmount)}</span> overdue
      </span>
    )
  }
  if (rollup.blockerCount > 0) {
    parts.push(
      <span key="blockers" className="font-semibold text-[var(--danger-fg)]">
        <span className="tabular-nums">{rollup.blockerCount}</span>{' '}
        {rollup.blockerCount === 1 ? 'blocker' : 'blockers'}
      </span>
    )
  }

  return (
    <span data-slot="week-summary" className="text-[11px] leading-tight text-muted-foreground">
      {parts.length === 0
        ? 'Nothing booked this week.'
        : parts.map((p, i) => (
            <span key={i}>
              {i > 0 ? ' · ' : null}
              {p}
            </span>
          ))}
    </span>
  )
}

const YMD = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Tailwind's `md` breakpoint, as a media query — the drawer only exists below it. */
const BELOW_MD = '(max-width: 767.98px)'

/**
 * Whether the rail is currently in its off-canvas-drawer shape.
 *
 * `inert` is an HTML attribute, so it cannot be media-queried in CSS the way
 * the `-translate-x-full` that used to "hide" the drawer was — the layout has
 * to know the breakpoint too. Starts `false` so the server HTML and the first
 * client render agree (no hydration mismatch); the effect corrects it on the
 * first commit.
 */
function useBelowMd(): boolean {
  const [below, setBelow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(BELOW_MD)
    const sync = () => setBelow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return below
}

// Mirrors AdminSidebar / ClientQueueRail's hamburger so the drawer reads as the
// same off-canvas pattern.
function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden focusable="false">
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden focusable="false">
      <path d="M5 5l10 10M15 5L5 15" />
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

export function CalendarLeftRail({
  orgSlug,
  today,
  rollup,
  runway,
  unscheduled = [],
  bookability,
  subscribeUrl,
}: CalendarLeftRailProps) {
  const params = useSearchParams()
  const pathname = usePathname() ?? ''
  const [showSubscribe, setShowSubscribe] = useState(false)
  const subscribeId = useId()
  // ZONE 3 starts collapsed: see <WeekSummary/>. Not persisted — the collapsed
  // state IS the default, and the summary carries the signal, so there is
  // nothing for a returning operator to have their preference restored to.
  const [showWeek, setShowWeek] = useState(false)
  const weekId = useId()
  // Below md the rail is an off-canvas drawer (mirrors AdminSidebar / ClientQueueRail)
  // so the kind filter, mini-month, queue, KPIs, runway and ICS subscribe stay
  // reachable on mobile instead of being hidden. Always opens closed.
  const [mobileOpen, setMobileOpen] = useState(false)

  const belowMd = useBelowMd()
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // The drawer only EXISTS below md; at md+ the same element is the in-flow
  // column and must stay fully interactive.
  const drawerOpen = belowMd && mobileOpen

  // Navigating (picking a day / toggling scope) dismisses the drawer. Adjusted
  // DURING render off a previous-value marker rather than in an effect: the
  // effect version set state on every commit after a route change, which React
  // flags (`set-state-in-effect`) and which renders the drawer once in its
  // stale-open shape before closing it.
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    if (mobileOpen) setMobileOpen(false)
  }

  // Escape goes through the shared dismiss stack, not a raw window listener.
  // Two raw listeners (this one and the agenda's selection-clear) both fired on
  // the same key, so dismissing the drawer also wiped an agenda selection. The
  // stack hands Escape to the topmost layer and nobody else. Registered on
  // `drawerOpen`, not `mobileOpen`: at md+ the drawer is an in-flow column and
  // owns no dismissible layer.
  useDismissLayer(drawerOpen, () => setMobileOpen(false))

  /**
   * Focus management for the drawer (WCAG 2.4.3 Focus Order, 2.4.7 Focus
   * Visible, 2.4.11 Focus Not Obscured).
   *
   * The drawer used to be "hidden" by `-translate-x-full` alone. A translated
   * element is still rendered, still focusable and still in the tab order, so
   * ~40 rail controls — the filter, every day of the mini-month, the runway
   * rows, the subscribe button — sat off the left edge of a phone screen
   * collecting Tab stops that moved focus somewhere invisible. Nothing moved
   * focus IN when it opened, nothing trapped it, nothing handed it back.
   *
   * `inert` (baseline since 2023) is what actually removes the subtree from the
   * tab order AND the accessibility tree, and unlike unmounting it keeps the
   * mini-month's local month cursor alive across open/close.
   */
  useEffect(() => {
    if (!drawerOpen) return
    const opener = triggerRef.current
    // Move focus INTO the drawer; the panel itself, so the reader starts at the
    // top of the panel rather than mid-way down whatever the first link is.
    panelRef.current?.focus()
    return () => {
      // …and hand it back to the control that opened it.
      if (opener?.isConnected) opener.focus()
    }
  }, [drawerOpen])

  /** Wrap Tab at the drawer's edges — the page behind it is not reachable. */
  const onPanelKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!drawerOpen || e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || active === panel) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [drawerOpen]
  )

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
          ref={triggerRef}
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open calendar panel"
          aria-expanded={mobileOpen}
          aria-controls="calendar-left-rail"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-hover focus-visible:bg-sidebar-hover"
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
        ref={panelRef}
        // Only a dialog while it IS one: at md+ this is the in-flow column.
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen ? true : undefined}
        aria-label={drawerOpen ? 'Calendar panel' : undefined}
        tabIndex={drawerOpen ? -1 : undefined}
        onKeyDown={onPanelKeyDown}
        // The one line that takes the ~40 off-screen controls out of the tab
        // order and the a11y tree. Never set at md+, where the rail is visible.
        inert={belowMd && !mobileOpen}
        className={cn(
          'flex h-full w-[280px] shrink-0 flex-col overflow-y-auto bg-sidebar outline-none md:border-r md:border-sidebar-border',
          // Below md: off-canvas drawer, out of flow so the canvas gets full width.
          'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[280px]',
          'max-md:transition-transform max-md:duration-200 motion-reduce:transition-none',
          mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'
        )}
      >
        {/* Drawer header, mobile only and STICKY. The 280px drawer had no way out
            of it except Escape (no keyboard on a phone), the scrim (off-screen
            once you have scrolled), or navigating away — Nielsen #3, and the
            reason the drawer felt like a trap rather than a panel. */}
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-sidebar-border bg-sidebar px-4 py-1.5 md:hidden">
          <span className="text-[13px] font-semibold text-sidebar-foreground">Calendar panel</span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close calendar panel"
            className="ml-auto flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-hover focus-visible:bg-sidebar-hover"
          >
            <CloseIcon />
          </button>
        </div>

        {/* ── ZONE 1 · WHICH DAY ─────────────────────────────────────────────
            Scope filter, mini-month and next-open, in ONE box. They answer one
            question between them, and three borders around three halves of one
            question is exactly the noise the composition review named. */}
        <div data-rail-section="dates" className="border-b border-sidebar-border px-4 py-3">
          <TabLinks
            tabs={filterTabs}
            active={kinds === 'pipeline' ? 'pipeline' : 'all'}
            ariaLabel="Calendar filter"
            className="w-full"
          />

          <div className="mb-2 mt-3 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-sidebar-foreground">{monthTitle(cursor)}</span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => stepMonth(-1)}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-hover focus-visible:bg-sidebar-hover motion-reduce:transition-none"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => stepMonth(1)}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-hover focus-visible:bg-sidebar-hover motion-reduce:transition-none"
              >
                →
              </button>
            </div>
          </div>
          {/* Deliberately NOT role="grid". A grid promises rows and gridcells; this
              is a CSS grid of bare links with aria-hidden weekday captions, so the
              roles announced zero rows and zero cells and a screen reader in table
              mode reported the days as orphaned links (WCAG 1.3.1). A labelled
              group of links is honest and navigable. MonthGrid — the real grid —
              uses a plain labelled <section> for the same reason. */}
          <div
            role="group"
            aria-label={`Mini calendar, ${monthTitle(cursor)}`}
            className="grid grid-cols-7 gap-0.5"
          >
            {WEEKDAYS.map((w, i) => (
              <div
                key={i}
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
                    'flex h-6 items-center justify-center rounded-md text-[11px] tabular-nums transition-colors hover:bg-sidebar-hover focus-visible:bg-sidebar-hover motion-reduce:transition-none',
                    isToday && 'bg-foreground font-bold text-background',
                    isSelected && !isToday && 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground ring-1 ring-inset ring-ring',
                    !isToday && !isSelected && 'text-sidebar-foreground'
                  )}
                >
                  {dayNum}
                </Link>
              )
            })}
          </div>

          {bookability ? <NextOpenLine ctx={bookability} today={today} /> : null}
        </div>

        {/* ── ZONE 2 · THE FOCAL ELEMENT ─────────────────────────────────────
            The work with NO date: the only zone that is work rather than
            navigation or reporting, the only thing on the calendar module that
            is invisible everywhere else, and the drag source a later increment
            drags onto the grid beside it. It carries the rail's only heading,
            only 26px number and only full border. */}
        <UnscheduledSection orgSlug={orgSlug} rows={unscheduled} today={today} />

        {/* ── ZONE 3 · THIS WEEK ─────────────────────────────────────────────
            Summary always; the five tiles on request. */}
        <section
          aria-label="This week"
          data-rail-section="week"
          className={cn(!showWeek && 'border-b border-sidebar-border')}
        >
          <h3>
            <button
              type="button"
              onClick={() => setShowWeek((s) => !s)}
              aria-expanded={showWeek}
              aria-controls={weekId}
              className="flex min-h-11 w-full items-start gap-1.5 rounded-md px-5 py-2 text-left transition-colors hover:bg-sidebar-hover focus-visible:bg-sidebar-hover motion-reduce:transition-none"
            >
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 inline-block text-[10px] text-muted-foreground transition-transform motion-reduce:transition-none',
                  showWeek && 'rotate-90'
                )}
              >
                &#9654;
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
                  This week
                </span>
                <span className="mt-0.5 block">
                  <WeekSummary rollup={rollup} />
                </span>
              </span>
            </button>
          </h3>
          {/* Unmounted, not hidden — the mobile focus trap walks the panel's
              focusable list and a display:none subtree would leave stops in it.
              (The tiles hold no controls today; the rule is the rail's, and it
              costs nothing to keep.) */}
          <div id={weekId}>{showWeek ? <CalendarKpiBand rollup={rollup} /> : null}</div>
        </section>

        {/* ── ZONE 4 · CASH RUNWAY ───────────────────────────────────────── */}
        <RunwayStrip orgSlug={orgSlug} runway={runway} dayHref={dayHref} />

        {/* ── ZONE 5 · KEY & SETUP ───────────────────────────────────────────
            Both mark legends (still ALWAYS ON — a shape grammar you have to
            reverse-engineer is not an accessible one) plus the ICS link, in one
            footer at the rail's bottom edge. They are reference and setup, not
            content; they used to occupy the rail's loudest slot and its own
            bordered section respectively. The subscribe entry point is a text
            link now rather than a full-width outline Button: a once-a-year
            action should not out-weigh the daily queue three zones above it. */}
        <div data-rail-section="key" className="mt-auto border-t border-sidebar-border">
          <div className="px-4 py-3">
            <KindLegend />
            {bookability ? <BookabilityKey className="mt-1.5" /> : null}
            {subscribeUrl ? (
              <button
                type="button"
                aria-expanded={showSubscribe}
                aria-controls={subscribeId}
                onClick={() => setShowSubscribe((s) => !s)}
                className="mt-1.5 flex min-h-11 w-full items-center rounded-md text-left text-[11px] font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:bg-sidebar-hover hover:text-foreground focus-visible:bg-sidebar-hover motion-reduce:transition-none"
              >
                Subscribe in Google / Outlook &rarr;
              </button>
            ) : null}
          </div>
          {subscribeUrl ? (
            <div id={subscribeId}>{showSubscribe ? <SubscribePanel url={subscribeUrl} /> : null}</div>
          ) : null}
        </div>
      </div>
    </>
  )
}
