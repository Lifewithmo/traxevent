'use client'

import { useState } from 'react'
import Link from 'next/link'
import { addDays } from '@/lib/opportunity-detail'
import { feedInRange, weekDays, type CalendarItem } from '@/lib/calendar'
import { needsAttention, weekRollup } from '@/lib/calendar-week'
import { formatMoney } from '@/lib/money'
import { CalendarAttentionRail } from '@/components/admin/calendar/CalendarAttentionRail'
import { CalendarKpiBand } from '@/components/admin/calendar/CalendarKpiBand'
import { SubscribePanel } from '@/components/admin/calendar/SubscribePanel'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { TabLinks } from '@/components/ui/tab-links'
import { cn } from '@/lib/utils'

interface CalendarWeekClientProps {
  orgSlug: string
  items: CalendarItem[]
  today: string
  weekFrom: string
  view: 'week' | 'agenda'
  subscribeUrl: string
  /** `?kinds=pipeline` shows lead/task/follow-up only — events and invoices are
   *  filtered out, so the band and legend must not claim they are absent. */
  scope?: 'all' | 'pipeline'
  /** pipeline scope only: open opportunities carrying no date at all. */
  undated?: number
  /** Rendered under the grid — e.g. the pipeline calendar's scope note. */
  footnote?: React.ReactNode
}

/** The top band is time; everything else is owed. */
const TIME_KINDS = new Set(['event', 'lead'])

const NAV_BUTTON = cn(buttonVariants({ variant: 'outline', size: 'sm' }))

function rangeLabel(from: string): string {
  const start = new Date(`${from}T00:00:00.000Z`)
  const end = new Date(`${addDays(from, 6)}T00:00:00.000Z`)
  const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' } as const
  const year = end.toLocaleDateString(undefined, { year: 'numeric', timeZone: 'UTC' })
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}, ${year}`
}

function dayLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function monthLabel(ymd: string): string {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Below lg the 7-column grid stacks into one column, so a cell carries its own
// day label (the header row is desktop-only) and an empty cell is dropped —
// scrolling past seven blank boxes on a phone is worse than not seeing them.
// Today is the exception: it is never hidden, because "you are here" is the
// whole point of the screen and the desktop-only header carries the marker.
//
// Stacked below lg (bottom rules), 7 columns at lg+ (right rules). `last:` can't
// be used for the stacked rule: empty cells are `hidden`, so the DOM-last cell is
// often not the visually-last one and its rule would double with the band's own
// bottom border. The caller tells us which cell is last *visible* instead.
// `lg:last:border-r-0` is deliberately NOT used: a sibling rendered after the
// cells (the stacked-empty fallback) would stop the 7th cell being :last-child
// and leave a stray rule at the section edge. The column index decides instead.
function dayCellClass(hidden: boolean, lastVisible: boolean, lastColumn: boolean): string {
  return [
    'space-y-1 p-1.5 lg:border-b-0',
    lastColumn ? '' : 'lg:border-r',
    lastVisible ? '' : 'border-b border-border/60',
    hidden ? 'hidden lg:block' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

interface DayCell {
  day: string
  items: CalendarItem[]
  isToday: boolean
  hidden: boolean
  lastVisible: boolean
  lastColumn: boolean
}

/** Per-day buckets for one band, plus which cells the stacked layout shows. */
function dayCells(days: string[], items: CalendarItem[], time: boolean, today: string): DayCell[] {
  const base = days.map((d) => ({
    day: d,
    items: items.filter((i) => TIME_KINDS.has(i.kind) === time && i.date.slice(0, 10) === d),
    isToday: d === today,
  }))
  const shown = base.map((c) => c.items.length > 0 || c.isToday)
  const lastShown = shown.reduce((last, visible, i) => (visible ? i : last), -1)
  return base.map((c, i) => ({
    ...c,
    hidden: !shown[i],
    lastVisible: i === lastShown,
    lastColumn: i === days.length - 1,
  }))
}

/** The stacked-layout day label; desktop gets the same marker from the header row. */
function StackedDayLabel({ cell }: { cell: DayCell }) {
  return (
    <p
      className={[
        '-mx-1.5 -mt-1.5 mb-1 px-1.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide lg:hidden',
        cell.isToday ? 'bg-foreground text-background' : 'text-muted-foreground',
      ].join(' ')}
    >
      {dayLabel(cell.day)}
      {cell.isToday ? ' · today' : ''}
    </p>
  )
}

function TimeEntry({ item }: { item: CalendarItem }) {
  const booked = item.kind === 'event'
  return (
    <Link
      href={item.href}
      className={[
        'block rounded-sm border p-1.5 text-xs leading-tight',
        booked
          ? 'border-[var(--money-green-border)] border-l-[3px] border-l-[var(--money-green)] bg-background font-semibold text-[var(--money-green)]'
          : 'border-dashed border-foreground/40 text-foreground',
      ].join(' ')}
    >
      <span className="block truncate">{item.title}</span>
      <span className={`mt-0.5 block truncate text-[10px] font-normal ${booked ? 'opacity-80' : 'text-muted-foreground'}`}>
        {booked ? (item.detail ?? 'Booked') : `tentative${item.detail ? ` · ${item.detail}` : ''}`}
      </span>
    </Link>
  )
}

function OwedEntry({ item }: { item: CalendarItem }) {
  return (
    <Link
      href={item.href}
      className={[
        'block border-l-2 py-0.5 pl-1.5 text-[11px] leading-tight hover:underline',
        item.blocker ? 'border-l-destructive text-destructive' : 'border-l-transparent',
      ].join(' ')}
    >
      <span className={item.kind === 'compliance' ? 'font-semibold' : ''}>
        {item.title}
        {item.kind === 'invoice_due' && item.amount !== undefined && (
          <span className="font-semibold tabular-nums text-[var(--money-green)]"> {formatMoney(item.amount)}</span>
        )}
      </span>
      {item.detail && <span className="block truncate text-[10px] text-muted-foreground">{item.detail}</span>}
    </Link>
  )
}

const LEGEND: Array<{ label: string; swatch: string; pipeline: boolean }> = [
  { label: 'Booked event', swatch: 'h-2.5 w-2.5 rounded-sm bg-[var(--money-green)]', pipeline: false },
  { label: 'Opportunity date', swatch: 'h-2.5 w-2.5 rounded-sm border border-dashed border-foreground/60', pipeline: true },
  { label: 'Task / follow-up', swatch: 'h-2.5 w-2.5 rounded-sm bg-muted-foreground/40', pipeline: true },
  { label: 'Blocker', swatch: 'h-2.5 w-2.5 rounded-sm bg-destructive', pipeline: false },
]

export function CalendarWeekClient({
  orgSlug,
  items,
  today,
  weekFrom,
  view,
  subscribeUrl,
  scope = 'all',
  undated = 0,
  footnote,
}: CalendarWeekClientProps) {
  const [subscribing, setSubscribing] = useState(false)
  const path = `/${orgSlug}/calendar`
  const days = weekDays(weekFrom)
  const weekItems = feedInRange(items, weekFrom, days[6])
  // The filter has to survive navigation: without `kinds`, one click on
  // "Next week" silently dropped the operator back to the unfiltered calendar.
  const kindsParam = scope === 'pipeline' ? 'kinds=pipeline&' : ''
  const weekHref = (anchor: string) => `${path}?${kindsParam}week=${anchor}`

  // Deliberate asymmetry: the band summarises the SHOWN week ("how is this
  // week"); the rail scans the WHOLE feed forward 30 days plus anything already
  // past due ("what should I go fix").
  const rollup = weekRollup(weekItems, today)
  const attention = needsAttention(items, today)

  const agendaGroups: Array<{ label: string; items: CalendarItem[] }> = []
  for (const item of items) {
    const label = monthLabel(item.date)
    const last = agendaGroups[agendaGroups.length - 1]
    if (last && last.label === label) last.items.push(item)
    else agendaGroups.push({ label, items: [item] })
  }

  // Dates are set on the pipeline, so that is where an empty calendar sends you.
  const emptyCalendar = (
    <EmptyState
      title="Nothing on the calendar this week"
      description="Booked events, holds, tasks and invoice due dates all land here."
      className="px-5 py-10"
      action={
        <Link className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/${orgSlug}/leads`}>
          Open the pipeline
        </Link>
      }
    />
  )

  return (
    <div className="flex min-w-0 flex-col xl:flex-row">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <h1 className="text-base font-semibold">{view === 'week' ? rangeLabel(weekFrom) : 'Agenda'}</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* The agenda ignores weekFrom, so week stepping there moved nothing
                on screen. The view tabs carry the week across, so switching back
                still lands on the week you left. */}
            {view === 'week' && (
              <>
                <Link href={weekHref(addDays(weekFrom, -7))} aria-label="Previous week" className={NAV_BUTTON}>←</Link>
                <Link href={weekHref(today)} className={NAV_BUTTON}>Today</Link>
                <Link href={weekHref(addDays(weekFrom, 7))} aria-label="Next week" className={NAV_BUTTON}>→</Link>
              </>
            )}
            <TabLinks
              ariaLabel="Calendar view"
              active={view}
              tabs={[
                { key: 'week', label: 'Week', href: `${weekHref(weekFrom)}&view=week` },
                { key: 'agenda', label: 'Agenda', href: `${weekHref(weekFrom)}&view=agenda` },
              ]}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSubscribing((s) => !s)}
              aria-expanded={subscribing}
            >
              Subscribe in Outlook / Google
            </Button>
          </div>
        </div>

        {/* The panel is the Subscribe button's disclosure — it stays adjacent to
            its trigger rather than being pushed below the figures. */}
        {subscribing && <SubscribePanel url={subscribeUrl} />}

        {/* Week-scoped figures belong over the week grid. The agenda lists the
            whole feed by month, so a "this week" band there would describe
            something the reader is not looking at. */}
        {view === 'week' && (
          <CalendarKpiBand rollup={rollup} attention={attention} scope={scope} undated={undated} />
        )}

        {view === 'week' ? (
          <section aria-label="Week grid">
            <div className="hidden border-b border-border lg:grid lg:grid-cols-7">
              {days.map((d) => (
                <div
                  key={d}
                  className={[
                    'border-r border-border/60 px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide last:border-r-0',
                    d === today ? 'bg-foreground text-background' : 'text-muted-foreground',
                  ].join(' ')}
                >
                  {dayLabel(d)}
                </div>
              ))}
            </div>

            {weekItems.length === 0 ? (
              <div className="border-b border-border">{emptyCalendar}</div>
            ) : (
              <>
                <div className="grid min-h-24 grid-cols-1 border-b border-border lg:grid-cols-7">
                  {dayCells(days, weekItems, true, today).map((cell) => (
                    <div key={cell.day} className={dayCellClass(cell.hidden, cell.lastVisible, cell.lastColumn)}>
                      <StackedDayLabel cell={cell} />
                      {cell.items.map((i) => (
                        <TimeEntry key={`${i.kind}:${i.id}`} item={i} />
                      ))}
                    </div>
                  ))}
                  {rollup.eventCount + rollup.tentativeCount === 0 ? (
                    <p className="px-1.5 py-2 text-xs text-muted-foreground lg:hidden">
                      {scope === 'pipeline' ? 'No dates held this week.' : 'Nothing booked this week.'}
                    </p>
                  ) : null}
                </div>

                <h2 className="flex flex-wrap items-baseline gap-x-2 border-b border-border bg-muted px-5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Owed{' '}
                  {/* The explicit space keeps the accessible name from reading
                      "Owed1 blocker this week" — flex gap is visual only.
                      Week-scoped, so it stays true however far ahead you page,
                      unlike the feed-scoped "Needs attention" tile above. */}
                  {rollup.blockerCount > 0 ? (
                    <span className="font-sans font-semibold normal-case tracking-normal text-destructive">
                      {rollup.blockerCount} {rollup.blockerCount === 1 ? 'blocker' : 'blockers'} this week
                    </span>
                  ) : null}
                </h2>
                <div className="grid min-h-20 grid-cols-1 border-b border-border lg:grid-cols-7">
                  {dayCells(days, weekItems, false, today).map((cell) => (
                    <div key={cell.day} className={dayCellClass(cell.hidden, cell.lastVisible, cell.lastColumn)}>
                      <StackedDayLabel cell={cell} />
                      {cell.items.map((i) => (
                        <OwedEntry key={`${i.kind}:${i.id}`} item={i} />
                      ))}
                    </div>
                  ))}
                  {rollup.taskCount + rollup.blockerCount === 0 && rollup.dueAmount === 0 ? (
                    <p className="px-1.5 py-2 text-xs text-muted-foreground lg:hidden">Nothing owed this week.</p>
                  ) : null}
                </div>
              </>
            )}

            {/* Nothing to key when the week is empty. */}
            {weekItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-4 px-5 py-2.5 text-[11px] text-muted-foreground">
                {LEGEND.filter((l) => scope === 'all' || l.pipeline).map((l) => (
                  <span key={l.label} className="flex items-center gap-1.5">
                    <span className={l.swatch} />
                    {l.label}
                  </span>
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="px-5 py-4">
            {agendaGroups.length === 0 && (
              <EmptyState
                title="Nothing on the calendar"
                description="Booked events, holds, tasks and invoice due dates all land here."
                className="px-5 py-10"
                action={
                  <Link className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/${orgSlug}/leads`}>
                    Open the pipeline
                  </Link>
                }
              />
            )}
            {agendaGroups.map((group) => (
              <div key={group.label} className="mb-5">
                <h2 className="border-b border-border pb-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  {group.label}
                </h2>
                {group.items.map((item) => (
                  <div key={`${item.kind}:${item.id}`} className="flex items-start gap-3 border-b border-border/60 py-2">
                    <span className="w-14 shrink-0 font-mono text-xs font-semibold">{item.date.slice(5, 10)}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={item.href} className={`text-sm hover:underline ${item.kind === 'event' ? 'font-semibold' : ''}`}>
                        {item.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[item.tentative ? 'tentative' : null, item.detail].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {item.amount !== undefined && (
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--money-green)]">
                        {formatMoney(item.amount)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {footnote}
      </div>

      <CalendarAttentionRail
        groups={attention}
        // On the agenda the operator is already looking at the full feed.
        moreHref={view === 'week' ? `${weekHref(weekFrom)}&view=agenda` : undefined}
      />
    </div>
  )
}
