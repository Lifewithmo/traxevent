export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/guards'
import { getSeries, listSeriesDays } from '@/actions/series'
import { listSeriesCloseoutsCore } from '@/lib/ops/closeout'
import { marketDayCloseoutSummary } from '@/lib/ops/derive'
import { listResourcesCore } from '@/lib/ops/resources'
import { SeriesClient, type SeriesDayMoney } from '@/components/admin/occasions/SeriesClient'

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; seriesId: string }>
}) {
  const { orgSlug, seriesId } = await params
  const { orgId, member } = await requireOrgMember(orgSlug)
  const series = await getSeries(orgId, seriesId)
  if (!series) notFound()
  const days = await listSeriesDays(orgId, seriesId)
  const isAdmin = member.role === 'owner' || member.role === 'admin'

  // Season money strip (spec 2026-08-23 S1.5) — admins only (B4 money gate).
  // Per-day figures route through the same market-day summary branch the lite
  // screen and the overview tile use. listSeriesCloseoutsCore caps at 30 doc
  // gets (a weekly season); days beyond the cap simply come back unread and
  // render as unknown, never as a false $0.
  let money: Record<string, SeriesDayMoney> | undefined
  if (isAdmin && days.length > 0) {
    const closeouts = await listSeriesCloseoutsCore(orgId, days.map((d) => d.id))
    const needResources = Object.values(closeouts).some((c) => c?.actuals?.consumables?.length)
    const resources = needResources ? await listResourcesCore(orgId) : []
    money = {}
    for (const d of days) {
      if (!(d.id in closeouts)) {
        money[d.id] = { state: 'unknown' }
        continue
      }
      const c = closeouts[d.id]
      const sales = c?.actuals?.sales
      // Counting rule: ANY saved sales counts — Mark-complete is optional.
      if (sales === undefined) {
        money[d.id] = { state: 'none' }
        continue
      }
      const fee = d.booth_fee ?? 0
      const summary = marketDayCloseoutSummary({
        resources,
        actual_consumables: c?.actuals?.consumables ?? [],
        sales,
        booth_fee: fee,
      })
      money[d.id] = { state: 'closed', sales, fee, net: summary.actual_margin }
    }
  }

  return (
    <SeriesClient
      orgId={orgId}
      orgSlug={orgSlug}
      series={series}
      days={days}
      isAdmin={isAdmin}
      money={money}
      today={new Date().toISOString().slice(0, 10)}
    />
  )
}
