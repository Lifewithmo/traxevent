import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { formatMoney } from '@/lib/money'
import type { WeekRollup } from '@/lib/calendar-week'

// The cockpit LEFT-RAIL KPI stack: Events · Guests · Booked-$ · Due-$ · Blockers
// over the CURRENT week (spec §5). This is the only calendar KPI band now — the
// old page-level scope/attention variants died with CalendarWeekClient, and
// "Needs attention" folded into the day spine (decision #3).
export function CalendarKpiBand({ rollup }: { rollup: WeekRollup }) {
  const bookedValue = rollup.bookedValue
  const overdue = rollup.overdueDueAmount > 0

  return (
    <KpiBand inset>
      <StatTile
        label="Events"
        value={String(rollup.eventCount)}
        note={rollup.eventCount > 0 ? 'this week' : 'nothing booked'}
      />
      <StatTile
        label="Guests"
        value={rollup.guestCount.toLocaleString()}
        note={
          rollup.eventCount === 0
            ? undefined
            : `across ${rollup.eventCount} ${rollup.eventCount === 1 ? 'event' : 'events'}`
        }
      />
      <StatTile
        label="Booked"
        // Booked-$ is closed-won estimated_value landing this week. Green only when
        // it is real money — $0 booked is neutral, not a win.
        value={formatMoney(bookedValue)}
        tone={bookedValue > 0 ? 'money' : 'default'}
        note={bookedValue > 0 ? 'won, this week' : 'nothing won yet'}
      />
      <StatTile
        label="Due this week"
        value={formatMoney(rollup.dueAmount)}
        tone={overdue ? 'alert' : rollup.dueAmount > 0 ? 'money' : 'default'}
        note={
          overdue
            ? `${formatMoney(rollup.overdueDueAmount)} overdue`
            : rollup.dueAmount > 0
              ? 'nothing overdue'
              : 'nothing due'
        }
      />
      <StatTile
        label="Blockers"
        value={String(rollup.blockerCount)}
        tone={rollup.blockerCount > 0 ? 'alert' : 'default'}
        note={rollup.blockerCount > 0 ? 'this week' : 'none this week'}
      />
    </KpiBand>
  )
}
