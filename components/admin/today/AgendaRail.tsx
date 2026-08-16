'use client'

import Link from 'next/link'
import type { Agenda, AgendaEntry } from '@/lib/today-moves'
import { EmptyState } from '@/components/ui/empty-state'

/** Booked work is money — it gets the one green in the app. */
const GREEN = 'text-emerald-700 dark:text-emerald-400'

function dayLabel(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
}

function EventLine({ entry, orgSlug }: { entry: AgendaEntry; orgSlug: string }) {
  return (
    <div className="min-w-0 flex-1">
      <Link href={`/${orgSlug}/${entry.slug}/dashboard`} className={`text-xs font-semibold hover:underline ${GREEN}`}>
        {entry.name}
      </Link>
      <p className={`mt-0.5 text-xs ${GREEN} opacity-80`}>
        {[entry.headcount ? `${entry.headcount} guests` : null, entry.multiDay ? 'multi-day' : null]
          .filter(Boolean)
          .join(' · ') || 'Booked'}
      </p>
    </div>
  )
}

export function AgendaRail({ orgSlug, agenda }: { orgSlug: string; agenda: Agenda }) {
  const byDay = new Map<string, AgendaEntry[]>()
  for (const e of agenda.upcoming) {
    byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  }

  const daysWithItems = agenda.windowDays.filter((ymd) => (byDay.get(ymd) ?? []).length > 0)

  return (
    <aside className="w-full md:w-72 md:shrink-0 border-l border-border bg-muted/40 p-4">
      <h2 className="border-b border-border pb-2 font-mono text-[13px] font-bold uppercase tracking-wide">
        On the cart today
      </h2>
      {agenda.today.length === 0 ? (
        <EmptyState title="Nothing booked today." className="items-start px-0 py-3 text-left" />
      ) : (
        agenda.today.map((e) => (
          <div
            key={e.eventId}
            className="mt-3 rounded-md border border-emerald-200 border-l-[3px] border-l-emerald-600 bg-background p-3 dark:border-emerald-900"
          >
            <EventLine entry={e} orgSlug={orgSlug} />
          </div>
        ))
      )}

      <h2 className="mt-6 border-b border-border pb-2 font-mono text-[13px] font-bold uppercase tracking-wide">
        Next seven days
      </h2>
      {daysWithItems.length === 0 ? (
        <EmptyState title="Nothing on the books this week" className="items-start px-0 py-3 text-left" />
      ) : (
        <div className="mt-1">
          {daysWithItems.map((ymd) => {
            const items = byDay.get(ymd) ?? []
            return (
              <div key={ymd} className="flex gap-3 border-b border-border/60 py-2">
                <div className={`w-12 shrink-0 font-mono text-xs font-semibold ${GREEN}`}>{dayLabel(ymd)}</div>
                <div className="min-w-0 flex-1 space-y-2">
                  {items.map((e) => (
                    <EventLine key={e.eventId} entry={e} orgSlug={orgSlug} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Link href={`/${orgSlug}/calendar`} className={`mt-3 inline-block text-xs underline ${GREEN}`}>
        Open the Events calendar
      </Link>
    </aside>
  )
}
