'use client'

import Link from 'next/link'
import type { Agenda, AgendaEntry, AgendaOps } from '@/lib/today-moves'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'

/** Booked work is money — it gets the one green in the app. */
const GREEN = 'text-emerald-700 dark:text-emerald-400'

function dayLabel(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
}

function fullDayLabel(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function tMinus(e: AgendaEntry): string {
  if (e.daysUntil <= 0) return 'Today'
  if (e.daysUntil === 1) return 'Tomorrow'
  return `T-${e.daysUntil}d`
}

/** Interpreted verdict, never a bare % — "12 of 18 packed · not ready", not "67%".
 *  Null = claim nothing (no ops read for this event, or nothing trackable yet). */
function readinessChip(ops?: AgendaOps): { label: string; tone: 'alert' | 'confirmed' | 'neutral' } | null {
  if (!ops) return null // no ops surface read for this event — never a false "not ready"
  if (!ops.hasPlan) return { label: 'No ops plan yet', tone: 'alert' }
  const r = ops.readiness
  if (!r || r.total === 0) return null // plan exists but nothing trackable — claim nothing
  if (r.overdue > 0) return { label: `Not ready · ${r.overdue} overdue`, tone: 'alert' }
  if (r.done === r.total) return { label: 'Ready', tone: 'confirmed' }
  return { label: 'On track', tone: 'neutral' }
}

function packedLine(ops?: AgendaOps): string | null {
  if (!ops?.packed || ops.packed.total === 0) return null
  return `${ops.packed.done} of ${ops.packed.total} packed`
}

/** Short at-risk marker for compact rows; quiet rows carry no chip at all. */
function atRiskLabel(ops?: AgendaOps): string | null {
  if (!ops) return null
  if (!ops.hasPlan) return 'No plan'
  const overdue = ops.readiness?.overdue ?? 0
  return overdue > 0 ? `${overdue} overdue` : null
}

function EventLine({ entry, orgSlug }: { entry: AgendaEntry; orgSlug: string }) {
  const risk = atRiskLabel(entry.ops)
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <Link
          href={`/${orgSlug}/${entry.slug}/dashboard`}
          className={`min-w-0 truncate text-xs font-semibold hover:underline ${GREEN}`}
        >
          {entry.name}
        </Link>
        {risk && <StatusPill tone="alert" className="shrink-0">{risk}</StatusPill>}
      </div>
      <p className={`mt-0.5 text-xs ${GREEN} opacity-80`}>
        {[entry.headcount ? `${entry.headcount} guests` : null, entry.multiDay ? 'multi-day' : null]
          .filter(Boolean)
          .join(' · ') || 'Booked'}
      </p>
    </div>
  )
}

/** The focal entry: the next physical commitment, pinned first and bigger,
 *  with the readiness/packed chip. The whole block deep-links to the brief. */
function NextJobBlock({ entry, orgSlug }: { entry: AgendaEntry; orgSlug: string }) {
  const chip = readinessChip(entry.ops)
  const packed = packedLine(entry.ops)
  const meta = [entry.headcount ? `${entry.headcount} guests` : null, entry.multiDay ? 'multi-day' : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <Link
      href={`/${orgSlug}/${entry.slug}/dashboard`}
      className="block rounded-md border border-emerald-200 border-l-[3px] border-l-emerald-600 bg-background p-3 hover:bg-muted/50 dark:border-emerald-900"
    >
      <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Next job</p>
      <p className={`mt-1 text-sm font-semibold ${GREEN}`}>{entry.name}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {[`${tMinus(entry)} · ${fullDayLabel(entry.date)}`, meta || null].filter(Boolean).join(' · ')}
      </p>
      {(chip || packed) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {chip && <StatusPill tone={chip.tone}>{chip.label}</StatusPill>}
          {packed && <span className={`text-xs ${GREEN} opacity-80`}>{packed}</span>}
        </div>
      )}
    </Link>
  )
}

export function AgendaRail({ orgSlug, agenda }: { orgSlug: string; agenda: Agenda }) {
  // The rail's job: what's my next physical commitment, and is it ready.
  // The next event is the focal entry; everything after it stays compact.
  const next: AgendaEntry | null = agenda.today[0] ?? agenda.upcoming[0] ?? null
  const todayRest = next && next.daysUntil === 0 ? agenda.today.slice(1) : agenda.today
  const upcoming = next
    ? agenda.upcoming.filter((e) => !(e.eventId === next.eventId && e.date === next.date))
    : agenda.upcoming

  const byDay = new Map<string, AgendaEntry[]>()
  for (const e of upcoming) {
    byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  }
  const daysWithItems = agenda.windowDays.filter((ymd) => (byDay.get(ymd) ?? []).length > 0)

  // When the pinned block IS today's only booking, a "Nothing booked today"
  // empty state underneath it would be false — drop the section instead.
  const pinnedIsToday = !!next && next.daysUntil === 0
  const showTodaySection = !pinnedIsToday || todayRest.length > 0

  return (
    <aside className="w-full border-b border-border bg-muted/40 p-4 md:w-72 md:shrink-0 md:border-b-0 md:border-l">
      {next && <NextJobBlock entry={next} orgSlug={orgSlug} />}

      {showTodaySection && (
        <>
          <h2 className={`border-b border-border pb-2 font-mono text-[13px] font-bold uppercase tracking-wide ${next ? 'mt-6' : ''}`}>
            {pinnedIsToday ? 'Also today' : 'On the cart today'}
          </h2>
          {todayRest.length === 0 ? (
            <EmptyState title="Nothing booked today." className="items-start px-0 py-3 text-left" />
          ) : (
            todayRest.map((e) => (
              <div
                key={e.eventId}
                className="mt-3 rounded-md border border-emerald-200 border-l-[3px] border-l-emerald-600 bg-background p-3 dark:border-emerald-900"
              >
                <EventLine entry={e} orgSlug={orgSlug} />
              </div>
            ))
          )}
        </>
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
