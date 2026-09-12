import { requireEvent, allowedEventPages } from '@/lib/auth/guards'
import { kindOf } from '@/lib/occasions/kind'
import { getSeriesCore } from '@/lib/occasions/series'
import { getCloseoutCore } from '@/lib/ops/closeout'
import { marketDayCloseoutSummary } from '@/lib/ops/derive'
import { listResourcesCore } from '@/lib/ops/resources'
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
    const isAdmin = member.role === 'owner' || member.role === 'admin'
    const today = new Date().toISOString().slice(0, 10)
    // Money tile facts (admins only — B4 money-gate precedent). Soft-failing
    // read, same as the brief's: a failed closeout read falls back to the
    // day-of CTA state, never a false net.
    let closeoutNet: number | null = null
    if (isAdmin) {
      try {
        const closeout = await getCloseoutCore(orgId, eventId)
        if (closeout?.actuals?.sales !== undefined) {
          const resources = closeout.actuals.consumables?.length ? await listResourcesCore(orgId) : []
          closeoutNet = marketDayCloseoutSummary({
            resources,
            actual_consumables: closeout.actuals.consumables ?? [],
            sales: closeout.actuals.sales,
            booth_fee: event.booth_fee ?? 0,
          }).actual_margin
        }
      } catch {
        closeoutNet = null
      }
    }
    return (
      <MarketDayOverview
        orgSlug={orgSlug}
        event={event}
        series={series}
        today={today}
        isAdmin={isAdmin}
        closeoutNet={closeoutNet}
      />
    )
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
    // Org back-plan buffers (inc-2 S4.3) — pure passthrough from the already-
    // loaded org doc to the brief's Pack-by/Leave-by chips + label.
    ...(org.ops_buffers ? { buffers: org.ops_buffers } : {}),
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
