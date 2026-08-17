import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { formatMoney } from '@/lib/money'
import { attentionCount, type AttentionGroup, type WeekRollup } from '@/lib/calendar-week'

interface CalendarKpiBandProps {
  /** weekRollup() over the SHOWN week. */
  rollup: WeekRollup
  /** needsAttention() over the WHOLE feed — the caller owns the derivation.
   *  Unused (and optional) in rail mode: attention folds into the day spine. */
  attention?: AttentionGroup[]
  /** Which feed the page is showing. `?kinds=pipeline` filters events and
   *  invoices out entirely, so a booked/money band there would read "nothing
   *  booked · nothing due" for a week that has both. */
  scope?: 'all' | 'pipeline'
  /** pipeline scope only: open opportunities carrying no date at all. */
  undated?: number
  /** Cockpit LEFT-RAIL variant (decision #3): swap the feed-scoped "Needs
   *  attention" tile — which now lives folded into the day spine — for the
   *  category surfaces the rail owns: Booked-$ (weekRollup().bookedValue) and a
   *  week-scoped Blockers count. */
  showBooked?: boolean
}

// Summarises the SHOWN week, so it carries everything the old 12px prose line
// ("1 event · 165 guests · 1 blocker") used to say — that line is now deleted.
//
// "Needs attention" is deliberately feed-scoped (the whole 30-day horizon plus
// anything past due) while the other tiles are week-scoped, so EVERY branch of
// its note names the horizon. Without that, paging to a week beyond the horizon
// reads "0 · nothing blocking" as if it were a claim about the week on screen.
export function CalendarKpiBand({
  rollup,
  attention = [],
  scope = 'all',
  undated = 0,
  showBooked = false,
}: CalendarKpiBandProps) {
  // Rail variant: the KPI stack the cockpit's left rail owns — Events · Guests ·
  // Booked-$ · Due-$ · Blockers (spec §5). "Needs attention" is gone from here
  // because the day spine now carries it (decision #3).
  if (showBooked) {
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
          value={formatMoney(bookedValue)}
          // Booked-$ is closed-won estimated_value landing this week. Green only
          // when it is real money — $0 booked is neutral, not a win.
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

  const attentionTotal = attentionCount(attention)
  const blocking = attention.find((g) => g.key === 'blocker')?.entries.length ?? 0

  const attentionTile = (
    <StatTile
      label="Needs attention"
      value={String(attentionTotal)}
      tone={attentionTotal > 0 ? 'alert' : 'default'}
      note={
        blocking > 0
          ? `${blocking} blocking · next 30 days`
          : attentionTotal > 0
            ? 'next 30 days'
            : 'none in the next 30 days'
      }
    />
  )

  if (scope === 'pipeline') {
    return (
      <KpiBand inset>
        <StatTile
          label="Holds"
          value={String(rollup.tentativeCount)}
          note={rollup.tentativeCount > 0 ? 'dates not booked' : 'nothing held'}
        />
        <StatTile
          label="Tasks due"
          value={String(rollup.taskCount)}
          note={rollup.taskCount > 0 ? 'this week' : 'none this week'}
        />
        <StatTile
          label="Undated"
          value={String(undated)}
          tone={undated > 0 ? 'alert' : 'default'}
          note={undated > 0 ? 'on no week at all' : 'every opportunity dated'}
        />
        {attentionTile}
      </KpiBand>
    )
  }

  const overdue = rollup.overdueDueAmount > 0
  const holds = rollup.tentativeCount

  return (
    <KpiBand inset>
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
        value={formatMoney(rollup.dueAmount)}
        // Green is reserved for money that is real. $0 owed is neutral, not a win.
        tone={overdue ? 'alert' : rollup.dueAmount > 0 ? 'money' : 'default'}
        note={
          overdue
            ? `${formatMoney(rollup.overdueDueAmount)} overdue`
            : rollup.dueAmount > 0
              ? 'nothing overdue'
              : 'nothing due'
        }
      />
      {attentionTile}
    </KpiBand>
  )
}
