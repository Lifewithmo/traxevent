import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { attentionCount, type AttentionGroup, type WeekRollup } from '@/lib/calendar-week'

interface CalendarKpiBandProps {
  /** weekRollup() over the SHOWN week. */
  rollup: WeekRollup
  /** needsAttention() over the WHOLE feed — the caller owns the derivation. */
  attention: AttentionGroup[]
}

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

// Summarises the SHOWN week, so it carries everything the old 12px prose line
// ("1 event · 165 guests · 1 blocker") used to say — that line is now deleted.
//
// The first three tiles are week-scoped; "Needs attention" is deliberately
// feed-scoped (the whole 30-day horizon plus anything past due), because it
// answers "what do I go fix" rather than "how is this week". Its value AND its
// note both come from `attention`, never from `rollup` — mixing the two scopes
// in one tile once let it render "0" above the note "1 blocking".
export function CalendarKpiBand({ rollup, attention }: CalendarKpiBandProps) {
  const overdue = rollup.overdueDueAmount > 0
  const holds = rollup.tentativeCount
  const attentionTotal = attentionCount(attention)
  const blocking = attention.find((g) => g.key === 'blocker')?.entries.length ?? 0

  return (
    <KpiBand className="border-b border-border px-5 py-3">
      <StatTile
        label="Events"
        value={String(rollup.eventCount)}
        // Holds are opportunity dates, NOT a subset of the booked events above
        // them — the leading "+" keeps the tile from reading "1 of my 2 events
        // is unconfirmed", which was never what the number meant.
        note={
          holds > 0
            ? `+${holds} tentative hold${holds === 1 ? '' : 's'}`
            : rollup.eventCount > 0
              ? 'all booked'
              : 'nothing booked'
        }
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
        label="Due this week"
        value={money(rollup.dueAmount)}
        // Green is reserved for money that is real. $0 owed is neutral, not a win.
        tone={overdue ? 'alert' : rollup.dueAmount > 0 ? 'money' : 'default'}
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
        note={
          blocking > 0
            ? `${blocking} blocking`
            : attentionTotal > 0
              ? 'next 30 days'
              : 'nothing blocking'
        }
      />
    </KpiBand>
  )
}
