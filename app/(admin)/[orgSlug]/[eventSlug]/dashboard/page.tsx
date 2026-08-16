import { requireEvent } from '@/lib/auth/guards'
import { kindOf } from '@/lib/occasions/kind'
import { getSeriesCore } from '@/lib/occasions/series'
import { MarketDayOverview } from '@/components/admin/occasions/MarketDayOverview'
import { EmptyState } from '@/components/ui/empty-state'

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { org, event } = await requireEvent(orgSlug, eventSlug)

  if (kindOf(event) === 'market_day') {
    const series = event.series_id ? await getSeriesCore(org.id, event.series_id) : null
    return <MarketDayOverview orgSlug={orgSlug} event={event} series={series} />
  }

  // Identity, tabs, and the KPI band (countdown/registrations/readiness/
  // balance — including expected headcount) all live in the spine rendered by
  // the event layout; the dashboard body itself has nothing to show yet.
  return (
    <div className="p-5">
      <div className="rounded-xl border border-border bg-card py-8">
        <EmptyState
          title="Event workspace"
          description="Work this job from the tabs above. Teams and budget tools arrive in Phase 1b."
        />
      </div>
    </div>
  )
}
