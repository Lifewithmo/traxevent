import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedForDay, type CalendarItem } from '@/lib/calendar'
import { addDays } from '@/lib/opportunity-detail'
import { cn } from '@/lib/utils'
import { KIND_DOT } from '@/components/admin/calendar/kind-color'

/** Dots shown before a day collapses to "+N" (decision #2 — dots, not chips). */
export const MAX_DOTS = 4

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface MonthGridProps {
  orgSlug: string
  /** The whole feed; the month window is filtered internally. */
  items: CalendarItem[]
  /** Any ymd within the month, or 'YYYY-MM'. */
  month: string
  today: string
  selected?: string
  /** Preserved on every day link. */
  kinds?: string
  view?: string
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

export function MonthGrid({ orgSlug, items, month, today, selected, kinds, view }: MonthGridProps) {
  const monthKey = month.slice(0, 7)
  const [year, month1] = monthKey.split('-').map(Number)
  const firstYmd = `${monthKey}-01`

  const dayHref = (ymd: string) => {
    const p = new URLSearchParams()
    if (kinds) p.set('kinds', kinds)
    if (view) p.set('view', view)
    const q = p.toString()
    return `/${orgSlug}/calendar/${ymd}${q ? `?${q}` : ''}`
  }

  // Monday-start grid: pad leading days from the previous month, then fill whole weeks.
  const firstDow = new Date(`${firstYmd}T00:00:00.000Z`).getUTCDay() // 0 Sun … 6 Sat
  const lead = (firstDow + 6) % 7
  const total = Math.ceil((lead + daysInMonth(year, month1)) / 7) * 7
  const gridStart = addDays(firstYmd, -lead)
  // Per-day off the FULL feed (feedForDay's span logic), then judge emptiness
  // from the in-month days — a multi-day event that only SPANS into the month
  // (its start date is in the prior month) still counts, and still shows.
  const perCell = Array.from({ length: total }, (_, i) => {
    const day = addDays(gridStart, i)
    return { day, inMonth: day.slice(0, 7) === monthKey, items: feedForDay(items, day) }
  })

  if (perCell.every((c) => !c.inMonth || c.items.length === 0)) {
    return (
      <EmptyState
        title="Nothing scheduled this month"
        description="Booked jobs, holds, drops, tasks and invoice due dates all land here."
        className="px-5 py-12"
        action={
          <Link className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/${orgSlug}/new-event`}>
            Book a job
          </Link>
        }
      />
    )
  }

  return (
    <section aria-label="Month view" className="min-w-0">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_HEADERS.map((w) => (
          <div
            key={w}
            className="border-l border-border/60 px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground first:border-l-0"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {perCell.map(({ day: d, inMonth, items: dayItems }) => {
          const dots = dayItems.slice(0, MAX_DOTS)
          const overflow = dayItems.length - dots.length
          const isToday = d === today
          const isSelected = d === selected
          const dayNum = Number(d.slice(8, 10))
          return (
            <Link
              key={d}
              href={dayHref(d)}
              data-slot="month-cell"
              data-day={d}
              aria-current={isSelected || isToday ? 'date' : undefined}
              className={cn(
                'flex min-h-16 flex-col gap-1 border-b border-l border-border/60 p-1.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none',
                '[&:nth-child(7n+1)]:border-l-0',
                !inMonth && 'bg-muted/30 text-muted-foreground',
                isSelected && 'ring-1 ring-inset ring-ring'
              )}
            >
              <span
                className={cn(
                  'inline-flex size-6 items-center justify-center self-start rounded-full text-xs tabular-nums',
                  isToday ? 'bg-foreground font-bold text-background' : 'font-medium'
                )}
              >
                {dayNum}
              </span>
              {dayItems.length > 0 ? (
                <span className="mt-auto flex flex-wrap items-center gap-1">
                  {dots.map((i) => (
                    <span
                      key={`${i.kind}:${i.id}`}
                      data-testid="density-dot"
                      className="size-1.5 rounded-full"
                      style={{ background: KIND_DOT[i.kind] }}
                      aria-hidden
                    />
                  ))}
                  {overflow > 0 ? (
                    <span className="text-[10px] font-medium tabular-nums text-muted-foreground">+{overflow}</span>
                  ) : null}
                </span>
              ) : null}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
