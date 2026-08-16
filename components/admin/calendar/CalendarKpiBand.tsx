import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import type { WeekRollup } from '@/lib/calendar-week'

interface CalendarKpiBandProps {
  rollup: WeekRollup
  /** attentionCount(needsAttention(...)) — the caller owns the derivation. */
  attentionTotal: number
}

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

// Summarises the SHOWN week, so it carries everything the old 12px prose line
// ("1 event · 165 guests · 1 blocker") used to say — that line is now deleted.
// Pure presentation: the caller runs weekRollup/needsAttention and passes in.
export function CalendarKpiBand({ rollup, attentionTotal }: CalendarKpiBandProps) {
  const overdue = rollup.overdueDueAmount > 0
  const events = `${rollup.eventCount} ${rollup.eventCount === 1 ? 'event' : 'events'}`

  return (
    <KpiBand className="border-b border-border px-5 py-3">
      <StatTile
        label="Events"
        value={String(rollup.eventCount)}
        note={rollup.tentativeCount > 0 ? `${rollup.tentativeCount} tentative` : 'booked this week'}
      />
      <StatTile
        label="Guests"
        value={rollup.guestCount.toLocaleString()}
        note={rollup.eventCount === 0 ? undefined : `across ${events}`}
      />
      <StatTile
        label="Due this week"
        value={money(rollup.dueAmount)}
        tone={overdue ? 'alert' : 'money'}
        note={
          overdue
            ? `${money(rollup.overdueDueAmount)} overdue`
            : rollup.dueAmount > 0
              ? 'nothing overdue'
              : 'nothing due'
        }
      />
      <StatTile
        label="Needs attention"
        value={String(attentionTotal)}
        tone={attentionTotal > 0 ? 'alert' : 'default'}
        note={rollup.blockerCount > 0 ? `${rollup.blockerCount} blocking` : 'nothing blocking'}
      />
    </KpiBand>
  )
}
