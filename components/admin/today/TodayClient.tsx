'use client'

import { TodayQueue } from '@/components/admin/today/TodayQueue'
import { TodayKpiBand } from '@/components/admin/today/TodayKpiBand'
import { AgendaRail } from '@/components/admin/today/AgendaRail'
import { buildMoves, moveCount, type Agenda } from '@/lib/today-moves'
import { todayYmd } from '@/lib/opportunity-detail'
import type { TodayData } from '@/lib/today'

interface TodayClientProps {
  orgId: string
  orgSlug: string
  data: TodayData
  agenda: Agenda
}

export function TodayClient({ orgId, orgSlug, data, agenda }: TodayClientProps) {
  const today = todayYmd()
  const moves = moveCount(buildMoves(data, today))
  const eventsToday = agenda.today.length
  const heading = new Date(`${today}T00:00:00.000Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col md:flex-row">
      {/* DOM order is queue-first: the page h1 leads the document (heading
          outline h1 → the rail's h2s stays valid) and desktop tab/reading
          order matches the visual layout instead of forcing ~10 rail links
          before the first queue action. Below md the rail still DISPLAYS
          first — the walk found the next job buried 2-3 scrolls deep — via
          order-first on the <aside> (a visual-only reorder). Tradeoff, chosen
          deliberately: on phones AT/tab order starts at the queue while the
          rail paints on top; we take that over inverting desktop, since the
          rail is a labeled complementary landmark AT users can jump to. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-base font-semibold">{heading}</h1>
            <p className="text-xs text-muted-foreground">
              {moves} {moves === 1 ? 'move' : 'moves'}
              {eventsToday > 0 && (
                <>
                  {' · '}
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {eventsToday} {eventsToday === 1 ? 'event' : 'events'} today
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <TodayKpiBand tiles={data.tiles} eventsToday={eventsToday} />
        <TodayQueue orgId={orgId} orgSlug={orgSlug} data={data} />
      </div>
      <AgendaRail orgSlug={orgSlug} agenda={agenda} />
    </div>
  )
}
