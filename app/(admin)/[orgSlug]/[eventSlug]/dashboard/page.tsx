import { requireEvent } from '@/lib/auth/guards'
import { resolveEnabledModules } from '@/lib/industry-packs'
import { kindOf } from '@/lib/occasions/kind'
import { getSeriesCore } from '@/lib/occasions/series'
import { MarketDayOverview } from '@/components/admin/occasions/MarketDayOverview'

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

  const enabledModules = resolveEnabledModules(org.industry_pack_id)
  const rosterEnabled = enabledModules.includes('attendee-roster')

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
      <p className="text-gray-500 text-sm">
        {orgSlug} / {eventSlug}
      </p>

      {!rosterEnabled && (
        <div className="mt-4 p-4 bg-white rounded-lg border inline-block">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Expected headcount</p>
          <p className="text-2xl font-bold">
            {event.headcount != null ? event.headcount : 'Not set'}
          </p>
        </div>
      )}

      <div className="mt-8 p-6 bg-white rounded-lg border text-center text-gray-400">
        Camp feature pages (families, assignments, teams, budget, itinerary, communicate)
        are coming in Phase 1b.
      </div>
    </div>
  )
}
