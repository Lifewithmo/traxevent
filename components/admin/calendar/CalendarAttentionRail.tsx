import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { formatMoney } from '@/lib/money'
import { StatusPill } from '@/components/ui/status-pill'
import { attentionCount, type AttentionEntry, type AttentionGroup, type AttentionReason } from '@/lib/calendar-week'

interface CalendarAttentionRailProps {
  /** Already computed by the caller via needsAttention() — pre-sorted, worst group first. */
  groups: AttentionGroup[]
  /** Entries shown per group before the "+N more" link. */
  previewLimit?: number
  /** Where "+N more" goes — the agenda view lists the whole feed. */
  moreHref?: string
}

/** What each reason reads as on the row — short enough to sit under a title. */
const REASON_PILL: Record<AttentionReason, { tone: 'alert' | 'pending' | 'neutral'; text: string }> = {
  blocker: { tone: 'alert', text: 'Blocking' },
  overdue: { tone: 'alert', text: 'Past due' },
  money: { tone: 'pending', text: 'Owed' },
  unbooked: { tone: 'neutral', text: 'Hold' },
}

// Always build from the ISO date part at UTC midnight — `new Date(ymd)` alone
// parses as UTC but formats in local time, losing a day west of Greenwich.
function dayLabel(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function AttentionRow({ entry }: { entry: AttentionEntry }) {
  const { item, reason, overdue } = entry
  const pill = REASON_PILL[reason]
  // A blocker or an unpaid invoice that has slipped past its date still has to
  // read as late even though its pill says something else.
  const lateDate = overdue && reason !== 'overdue'

  return (
    <Link
      href={item.href}
      className="-mx-2 block rounded-sm px-2 py-2 hover:bg-muted focus-visible:bg-muted"
    >
      <p className="truncate text-[13px] font-medium leading-tight">{item.title}</p>
      {item.detail ? (
        <p className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">{item.detail}</p>
      ) : null}
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusPill tone={pill.tone}>{pill.text}</StatusPill>
        <span className={`text-xs ${lateDate ? 'text-destructive' : 'text-muted-foreground'}`}>
          {dayLabel(item.date)}
        </span>
        {item.amount !== undefined ? (
          <span className="ml-auto text-[13px] font-semibold tabular-nums text-[var(--money-green)]">
            {formatMoney(item.amount)}
          </span>
        ) : null}
      </span>
    </Link>
  )
}

/** The right-hand rail: what is about to go wrong, worst first. */
export function CalendarAttentionRail({ groups, previewLimit = 4, moreHref }: CalendarAttentionRailProps) {
  // Same helper the KPI tile uses, so the two counts cannot drift apart.
  const total = attentionCount(groups)

  return (
    // Named landmark: without this the rail is an anonymous "complementary"
    // region when navigating by landmark.
    <aside
      aria-labelledby="attention-rail-heading"
      className="w-full border-t border-border bg-muted/40 p-4 xl:w-72 xl:shrink-0 xl:border-l xl:border-t-0"
    >
      <h2
        id="attention-rail-heading"
        className="flex items-baseline justify-between gap-2 border-b border-border pb-2 font-mono text-[13px] font-bold uppercase tracking-wide"
      >
        Needs attention
        {/* The rail scans the whole feed, not the shown week — say so, or six
            months forward it silently lists August rows beside a February grid. */}
        <span className="font-sans text-xs font-medium normal-case tracking-normal text-muted-foreground">
          {total > 0 ? `${total} ${total === 1 ? 'item' : 'items'} · next 30 days` : 'next 30 days'}
        </span>
      </h2>

      {groups.length === 0 ? (
        <EmptyState
          title="Nothing needs attention"
          description="Blockers, past-due work, money owed and unbooked holds land here."
          className="items-start px-0 py-3 text-left"
        />
      ) : (
        groups.map((group) => {
          const shown = group.entries.slice(0, previewLimit)
          const hidden = group.entries.length - shown.length
          return (
            <section key={group.key} className="mt-4">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {group.label}
              </h3>
              <div className="mt-1 divide-y divide-border/60">
                {shown.map((entry) => (
                  <AttentionRow key={`${entry.item.kind}:${entry.item.id}`} entry={entry} />
                ))}
              </div>
              {hidden > 0 ? (
                moreHref ? (
                  <Link
                    href={moreHref}
                    className="mt-1 inline-block text-xs font-medium text-[var(--link)] hover:underline"
                  >
                    +{hidden} more &rarr;
                  </Link>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">+{hidden} more</p>
                )
              ) : null}
            </section>
          )
        })
      )}
    </aside>
  )
}
