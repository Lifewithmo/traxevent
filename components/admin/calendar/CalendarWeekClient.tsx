'use client'

import { useState } from 'react'
import Link from 'next/link'
import { addDays } from '@/lib/opportunity-detail'
import { feedInRange, weekDays, type CalendarItem } from '@/lib/calendar'
import { needsAttention, weekRollup } from '@/lib/calendar-week'
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
  /** Path the week/view links write to; the pipeline calendar reuses this component. */
  basePath?: string
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

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

// Below md the 7-column grid stacks into one column, so a cell needs its own day
// label (the header row is desktop-only) and an empty cell is dropped entirely —
// scrolling past seven blank boxes on a phone is worse than not seeing them.
function dayCellClass(empty: boolean): string {
  return [
    'space-y-1 border-b border-border/60 p-1.5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0',
    empty ? 'hidden md:block' : '',
  ]
    .filter(Boolean)
    .join(' ')
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
          <span className="font-semibold tabular-nums text-[var(--money-green)]"> {money(item.amount)}</span>
        )}
      </span>
      {item.detail && <span className="block truncate text-[10px] text-muted-foreground">{item.detail}</span>}
    </Link>
  )
}

const LEGEND: Array<{ label: string; swatch: string }> = [
  { label: 'Booked event', swatch: 'h-2.5 w-2.5 rounded-sm bg-[var(--money-green)]' },
  { label: 'Opportunity date', swatch: 'h-2.5 w-2.5 rounded-sm border border-dashed border-foreground/60' },
  { label: 'Task / follow-up', swatch: 'h-2.5 w-2.5 rounded-sm bg-muted-foreground/40' },
  { label: 'Blocker', swatch: 'h-2.5 w-2.5 rounded-sm bg-destructive' },
]

export function CalendarWeekClient({
  orgSlug,
  items,
  today,
  weekFrom,
  view,
  subscribeUrl,
  basePath,
  footnote,
}: CalendarWeekClientProps) {
  const [subscribing, setSubscribing] = useState(false)
  const path = basePath ?? `/${orgSlug}/calendar`
  const days = weekDays(weekFrom)
  const weekItems = feedInRange(items, weekFrom, days[6])
  const weekHref = (anchor: string) => `${path}?week=${anchor}`

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
    <div className="flex min-w-0 flex-col md:flex-row">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <h1 className="text-base font-semibold">{rangeLabel(weekFrom)}</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Link href={weekHref(addDays(weekFrom, -7))} aria-label="Previous week" className={NAV_BUTTON}>←</Link>
            <Link href={weekHref(today)} className={NAV_BUTTON}>Today</Link>
            <Link href={weekHref(addDays(weekFrom, 7))} aria-label="Next week" className={NAV_BUTTON}>→</Link>
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
              variant="outline"
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

        <CalendarKpiBand rollup={rollup} attention={attention} />

        {view === 'week' ? (
          <section aria-label="Week grid">
            <div className="hidden border-b border-border md:grid md:grid-cols-7">
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
                <div className="grid min-h-24 grid-cols-1 border-b border-border md:grid-cols-7">
                  {days.map((d) => {
                    const cellItems = weekItems.filter(
                      (i) => TIME_KINDS.has(i.kind) && i.date.slice(0, 10) === d
                    )
                    return (
                      <div key={d} className={dayCellClass(cellItems.length === 0)}>
                        <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground md:hidden">
                          {dayLabel(d)}
                        </p>
                        {cellItems.map((i) => (
                          <TimeEntry key={`${i.kind}:${i.id}`} item={i} />
                        ))}
                      </div>
                    )
                  })}
                </div>

                <div className="border-b border-border bg-muted px-5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Owed
                </div>
                <div className="grid min-h-20 grid-cols-1 border-b border-border md:grid-cols-7">
                  {days.map((d) => {
                    const cellItems = weekItems.filter(
                      (i) => !TIME_KINDS.has(i.kind) && i.date.slice(0, 10) === d
                    )
                    return (
                      <div key={d} className={dayCellClass(cellItems.length === 0)}>
                        <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground md:hidden">
                          {dayLabel(d)}
                        </p>
                        {cellItems.map((i) => (
                          <OwedEntry key={`${i.kind}:${i.id}`} item={i} />
                        ))}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Nothing to key when the week is empty. */}
            {weekItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-4 px-5 py-2.5 text-[11px] text-muted-foreground">
                {LEGEND.map((l) => (
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
            {agendaGroups.length === 0 && emptyCalendar}
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
                        {money(item.amount)}
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

      <CalendarAttentionRail groups={attention} />
    </div>
  )
}
