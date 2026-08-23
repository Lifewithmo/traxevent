import { requireEvent, allowedEventPages } from '@/lib/auth/guards'
import { kindOf } from '@/lib/occasions/kind'
import { getSeriesCore } from '@/lib/occasions/series'
import { MarketDayOverview } from '@/components/admin/occasions/MarketDayOverview'
import { EventBrief } from '@/components/admin/events/EventBrief'
import { getEventSpineKpis } from '@/lib/event-spine'
import { resolveEnabledModules } from '@/lib/industry-packs'
import { EVENT_PAGES } from '@/lib/types'

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { org, orgId, eventId, event, member } = await requireEvent(orgSlug, eventSlug)

  if (kindOf(event) === 'market_day') {
    const series = event.series_id ? await getSeriesCore(org.id, event.series_id) : null
    return <MarketDayOverview orgSlug={orgSlug} event={event} series={series} />
  }

  // The layout suppresses the KPI band on this leaf (EventBandGate, B1): the
  // brief REPLACES it, so the page aggregates its own facts — a layout cannot
  // pass props to a page in the App Router. Same soft-failing reads, same
  // roster-less allowedPages strip as the layout, plus the B4 money gate; the
  // underlying reads dedupe with the layout's band call via React cache().
  const allowed = allowedEventPages(member, eventId, [...EVENT_PAGES], event.department_id ?? null)
  const rosterEnabled = resolveEnabledModules(org.industry_pack_id).includes('attendee-roster')
  const pages = rosterEnabled ? allowed : allowed.filter((p) => p !== 'families' && p !== 'reports')
  const includeMoney = member.role === 'owner' || member.role === 'admin'
  const today = new Date().toISOString().slice(0, 10)
  const kpis = await getEventSpineKpis({
    orgId,
    eventId,
    event,
    allowedPages: pages,
    includeMoney,
    today,
  })

  return (
    <EventBrief
      orgSlug={orgSlug}
      eventSlug={eventSlug}
      event={event}
      kpis={kpis}
      today={today}
      isAdmin={includeMoney}
      allowedPages={pages}
    />
  )
}
