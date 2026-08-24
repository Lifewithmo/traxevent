export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/guards'
import { getSeries, listSeriesDays } from '@/actions/series'
import { listSeriesCloseoutsCore, selectSeriesRollupDays } from '@/lib/ops/closeout'
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
  const today = new Date().toISOString().slice(0, 10)

  // Season money strip (spec 2026-08-23 S1.5) — admins only (B4 money gate).
  // Per-day figures route through the same market-day summary branch the lite
  // screen and the overview tile use. The rollup reads at most 30 closeout
  // docs; selectSeriesRollupDays spends that budget on the days that can
  // actually hold a closeout — the NEWEST days <= today first — so an
  // extended season never renders yesterday's saved sales as a load failure.
  // Days past the cap get a DISTINCT beyond-the-rollup state (never the
  // failed-read 'unknown'), and the header discloses the truncation.
  let money: Record<string, SeriesDayMoney> | undefined
  if (isAdmin && days.length > 0) {
    const { readIds, beyondCapIds } = selectSeriesRollupDays(days, today)
    const beyondCap = new Set(beyondCapIds)
    const closeouts = await listSeriesCloseoutsCore(orgId, readIds)
    const needResources = Object.values(closeouts).some((c) => c?.actuals?.consumables?.length)
    const resources = needResources ? await listResourcesCore(orgId) : []
    money = {}
    for (const d of days) {
      if (beyondCap.has(d.id)) {
        // Never attempted — honest and distinct from a FAILED read.
        money[d.id] = { state: 'beyond_cap' }
        continue
      }
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
      money[d.id] = {
        state: 'closed',
        sales,
        fee,
        net: summary.actual_margin,
        // Only when it exists: the cell's equation must stay arithmetically true.
        ...(summary.actual_consumable_cost > 0 ? { consumables: summary.actual_consumable_cost } : {}),
      }
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
      today={today}
    />
  )
}
