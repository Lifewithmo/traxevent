'use client'

import { TodayQueue } from '@/components/admin/today/TodayQueue'
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
    <div className="flex min-h-screen">
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
        <TodayQueue orgId={orgId} orgSlug={orgSlug} data={data} />
      </div>
      <AgendaRail orgSlug={orgSlug} agenda={agenda} />
    </div>
  )
}
