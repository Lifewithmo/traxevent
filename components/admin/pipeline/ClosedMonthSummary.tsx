import Link from 'next/link'
import { PipelineStatTile } from './PipelineStatTile'
import { money } from '@/lib/pipeline-presentation'
import type { closedThisMonth } from '@/lib/pipeline-view'

/**
 * The month's LOSS side, at the foot of both Pipeline surfaces.
 *
 * NO "Won this month" tile. `monthly.wonValue` is `wonValueInMonth(leads, ym)`
 * (pipeline-view.ts:106) and the KPI band ON THIS SAME PAGE already renders that
 * exact call as "Booked this month" (leads/page.tsx:57 → PipelineStatsHeader
 * :127) — same function, same arguments, same number, and the counts collide
 * too. A won tile here put one figure on the screen twice at the same 20px
 * money weight, which wave2-addenda §1 forbids outright.
 *
 * What the band does NOT own is the loss side and the route to the work the
 * wins created, so this is exactly those two things: one alert-toned figure and
 * the /calendar affordance (real navigation, not a restated number).
 */
export function ClosedMonthSummary({
  orgSlug, monthly,
}: { orgSlug: string; monthly: ReturnType<typeof closedThisMonth> }) {
  const { lostCount, lostValue } = monthly
  const lost = lostCount > 0
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      {/*
        The alert tone is CONDITIONAL. `tone="alert"` tints the whole tile
        terracotta and paints the figure destructive; a month with nothing lost
        would then render "$0 / none lost" as an alarm, which is the opposite of
        what happened. Zero losses is a default-tone tile.
      */}
      <PipelineStatTile
        label="Lost this month"
        value={money(lostValue)}
        tone={lost ? 'alert' : 'default'}
        note={lost ? `${lostCount} lost · archived` : 'none lost'}
        noteTone={lost ? 'alert' : 'default'}
        className="min-w-[190px]"
      />
      <p className="pb-1 text-xs text-muted-foreground">
        Won deals become scheduled work —{' '}
        <Link
          href={`/${orgSlug}/calendar`}
          className="text-primary underline-offset-4 hover:underline"
        >
          Events
        </Link>
      </p>
    </div>
  )
}
