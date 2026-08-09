'use client'

import { useState } from 'react'
import Link from 'next/link'
import { addDays } from '@/lib/opportunity-detail'
import { feedInRange, weekDays, type CalendarItem } from '@/lib/calendar'
import { SubscribePanel } from '@/components/admin/calendar/SubscribePanel'

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

function summaryLabel(weekItems: CalendarItem[]): string {
  const events = weekItems.filter((i) => i.kind === 'event')
  const guests = events.reduce((n, e) => n + (e.headcount ?? 0), 0)
  const blockers = weekItems.filter((i) => i.blocker).length
  const parts = [
    `${events.length} ${events.length === 1 ? 'event' : 'events'}`,
    guests > 0 ? `${guests} guests` : null,
    blockers > 0 ? `${blockers} ${blockers === 1 ? 'blocker' : 'blockers'}` : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

function TimeEntry({ item }: { item: CalendarItem }) {
  const booked = item.kind === 'event'
  return (
    <Link
      href={item.href}
      className={[
        'block rounded-sm border p-1.5 text-xs leading-tight',
        booked
          ? 'border-emerald-200 border-l-[3px] border-l-emerald-600 bg-background font-semibold text-emerald-700 dark:border-emerald-900 dark:text-emerald-400'
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
        {item.kind === 'invoice_due' && <span className="font-mono">$ </span>}
        {item.title}
        {item.kind === 'invoice_due' && item.amount !== undefined && (
          <span className="font-mono"> {money(item.amount)}</span>
        )}
      </span>
      {item.detail && <span className="block truncate text-[10px] text-muted-foreground">{item.detail}</span>}
    </Link>
  )
}

const LEGEND: Array<{ label: string; swatch: string }> = [
  { label: 'Booked event', swatch: 'h-2.5 w-2.5 rounded-sm bg-emerald-600' },
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

  const agendaGroups: Array<{ label: string; items: CalendarItem[] }> = []
  for (const item of items) {
    const label = monthLabel(item.date)
    const last = agendaGroups[agendaGroups.length - 1]
    if (last && last.label === label) last.items.push(item)
    else agendaGroups.push({ label, items: [item] })
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold">{rangeLabel(weekFrom)}</h1>
          <p className="text-xs text-muted-foreground">{summaryLabel(weekItems)}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <Link href={weekHref(addDays(weekFrom, -7))} aria-label="Previous week" className="rounded border border-border px-2 py-1 hover:bg-muted">←</Link>
          <Link href={weekHref(today)} className="rounded border border-border px-2 py-1 hover:bg-muted">Today</Link>
          <Link href={weekHref(addDays(weekFrom, 7))} aria-label="Next week" className="rounded border border-border px-2 py-1 hover:bg-muted">→</Link>
          <span className="mx-1 h-4 w-px bg-border" />
          {(['week', 'agenda'] as const).map((v) => (
            <Link
              key={v}
              href={`${weekHref(weekFrom)}&view=${v}`}
              className={[
                'rounded px-2 py-1 capitalize',
                view === v ? 'bg-foreground font-semibold text-background' : 'border border-border hover:bg-muted',
              ].join(' ')}
            >
              {v}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setSubscribing((s) => !s)}
            aria-expanded={subscribing}
            className="rounded border border-border px-2 py-1 hover:bg-muted"
          >
            Subscribe in Outlook / Google
          </button>
        </div>
      </div>

      {subscribing && <SubscribePanel url={subscribeUrl} />}

      {view === 'week' ? (
        <>
          <div className="grid grid-cols-7 border-b border-border">
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

          <div className="grid min-h-24 grid-cols-7 border-b border-border">
            {days.map((d) => (
              <div key={d} className="space-y-1 border-r border-border/60 p-1.5 last:border-r-0">
                {weekItems
                  .filter((i) => TIME_KINDS.has(i.kind) && i.date.slice(0, 10) === d)
                  .map((i) => (
                    <TimeEntry key={`${i.kind}:${i.id}`} item={i} />
                  ))}
              </div>
            ))}
          </div>

          <div className="border-b border-border bg-muted px-5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Owed
          </div>
          <div className="grid min-h-20 grid-cols-7 border-b border-border">
            {days.map((d) => (
              <div key={d} className="space-y-1 border-r border-border/60 p-1.5 last:border-r-0">
                {weekItems
                  .filter((i) => !TIME_KINDS.has(i.kind) && i.date.slice(0, 10) === d)
                  .map((i) => (
                    <OwedEntry key={`${i.kind}:${i.id}`} item={i} />
                  ))}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4 px-5 py-2.5 text-[11px] text-muted-foreground">
            {LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className={l.swatch} />
                {l.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="max-w-2xl px-5 py-4">
          {agendaGroups.length === 0 && <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>}
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
                  {item.amount !== undefined && <span className="shrink-0 font-mono text-xs">{money(item.amount)}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {footnote}
    </div>
  )
}
