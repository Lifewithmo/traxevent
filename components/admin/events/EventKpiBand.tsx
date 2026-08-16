// The spine's four-number band for client jobs. Dumb component: all reads
// happen in lib/event-spine.ts; this only maps aggregator output (with each
// section's null fallback) onto exactly 4 StatTiles.
import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { eventCountdown } from '@/lib/event-ui'
import { formatMoney } from '@/lib/utils'
import type { EventSpineKpis } from '@/lib/event-spine'
import type { Event } from '@/lib/types'

interface EventKpiBandProps {
  event: Pick<Event, 'event_start' | 'event_end' | 'headcount'>
  kpis: EventSpineKpis
  /** Today's YYYY-MM-DD, computed server-side in the layout (testable countdown). */
  today: string
}

export function EventKpiBand({ event, kpis, today }: EventKpiBandProps) {
  const countdown = eventCountdown(event.event_start, event.event_end, today)
  const { registrations, financial, readiness } = kpis

  return (
    <KpiBand className="print:hidden">
      <StatTile label="Countdown" value={countdown.value} note={countdown.note} />

      {registrations ? (
        <StatTile
          label="Registrations"
          value={String(registrations.total)}
          note={`${registrations.byStatus['confirmed'] ?? 0} confirmed · ${registrations.byStatus['pending'] ?? 0} pending`}
        />
      ) : (
        // No roster for this job (module off or families gated): the expected
        // headcount from event settings is the honest number.
        <StatTile
          label="Guests expected"
          value={event.headcount != null ? String(event.headcount) : '—'}
          note={event.headcount != null ? undefined : 'Set in event settings'}
        />
      )}

      {readiness ? (
        <StatTile
          label="Ops readiness"
          value={`${readiness.pct}%`}
          note={`${readiness.done}/${readiness.total} tasks${readiness.overdue > 0 ? `, ${readiness.overdue} overdue` : ''}`}
          tone={readiness.overdue > 0 ? 'alert' : 'default'}
        />
      ) : (
        <StatTile label="Ops readiness" value="—" note="No ops plan yet" />
      )}

      {financial ? (
        <StatTile
          label="Balance"
          value={formatMoney(financial.outstanding)}
          note={`of ${formatMoney(financial.totalDue)} billed`}
          tone="money"
        />
      ) : (
        <StatTile label="Balance" value="—" tone="money" />
      )}
    </KpiBand>
  )
}
