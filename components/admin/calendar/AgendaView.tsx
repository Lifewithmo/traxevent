'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { CalendarItem } from '@/lib/calendar'
import { KIND_DOT } from '@/components/admin/calendar/kind-color'

/** A bulk action offered on the list view (hard gate: bulk lives on the agenda). */
export type BulkAction = 'reschedule' | 'tag'

interface AgendaViewProps {
  orgSlug: string
  /** The whole feed, date-sorted; grouped by month here. */
  items: CalendarItem[]
  /** Stub — the wave that wires reschedule/tag flows supplies the real handler. */
  onBulk?: (ids: string[], action: BulkAction) => void
}

const selId = (item: CalendarItem) => `${item.kind}:${item.id}`

function monthLabel(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function AgendaView({ orgSlug, items, onBulk }: AgendaViewProps) {
  // Insertion-ordered so the ids handed to onBulk follow feed order, not click order.
  const [selected, setSelected] = useState<string[]>([])

  const groups = useMemo(() => {
    const out: Array<{ label: string; items: CalendarItem[] }> = []
    for (const item of items) {
      const label = monthLabel(item.date)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(item)
      else out.push({ label, items: [item] })
    }
    return out
  }, [items])

  const feedOrder = useMemo(() => items.map(selId), [items])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      // keep selection in feed order so bulk handlers get a stable ordering
      return feedOrder.filter((x) => next.includes(x))
    })
  }

  if (groups.length === 0) {
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

  const runBulk = (action: BulkAction) => {
    onBulk?.(selected, action)
  }

  return (
    <section aria-label="Agenda" className="min-w-0">
      {selected.length > 0 ? (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-card px-5 py-2"
        >
          <span className="text-sm font-medium tabular-nums">{selected.length} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => runBulk('reschedule')}>
              Reschedule
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => runBulk('tag')}>
              Tag
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <div className="px-5 py-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            <h2 className="border-b border-border pb-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              {group.label}
            </h2>
            {group.items.map((item) => {
              const id = selId(item)
              return (
                <div key={id} className="flex items-start gap-1 border-b border-border/60 py-1">
                  {/* 44px label so the 16px box clears the WCAG touch target. */}
                  <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={selected.includes(id)}
                      onChange={() => toggle(id)}
                      aria-label={`Select ${item.title}`}
                    />
                  </label>
                  <span className="w-14 shrink-0 pt-2.5 font-mono text-xs font-semibold tabular-nums">
                    {item.date.slice(5, 10)}
                  </span>
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full"
                    style={{ background: KIND_DOT[item.kind] }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={item.href}
                      className={cn('text-sm hover:underline', item.kind === 'event' && 'font-semibold')}
                    >
                      {item.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {[item.tentative ? 'tentative' : null, item.detail].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {item.amount !== undefined ? (
                    <span className="shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-[var(--money-green)]">
                      {formatMoney(item.amount)}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
