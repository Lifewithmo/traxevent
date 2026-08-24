export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireEvent } from '@/lib/auth/guards'
import { kindOf } from '@/lib/occasions/kind'
import { getCloseoutCore } from '@/lib/ops/closeout'
import { listResourcesCore } from '@/lib/ops/resources'
import { MarketDayCloseoutClient } from '@/components/admin/ops/MarketDayCloseoutClient'
import type { OpsResource } from '@/lib/types'

export default async function MarketDayCloseoutPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event, member } = await requireEvent(orgSlug, eventSlug)

  // BINDING (spec 2026-08-23 P1): the URL resolves kind-agnostically, and on a
  // client job the layout's KPI band would render over this leaf — client jobs
  // close out on the plan-centric, ops-gated screen instead.
  if (kindOf(event) === 'client_job') redirect(`/${orgSlug}/${eventSlug}/ops/closeout`)

  // Market-day nav bypasses allowedPages (buildEventNav returns MARKET_DAY_NAV
  // unfiltered), so this page carries its own guard: closing out the day is an
  // owner/admin task — the same role line the series page draws (isAdmin) and
  // the same gate completeCloseout enforces server-side.
  if (member.role !== 'owner' && member.role !== 'admin') {
    redirect(`/${orgSlug}/${eventSlug}/dashboard`)
  }

  const closeout = await getCloseoutCore(orgId, eventId)
  // Resources only cost already-recorded consumable actuals (not something the
  // lite screen writes) — skip the read on the common path.
  const resources: OpsResource[] = closeout?.actuals?.consumables?.length
    ? await listResourcesCore(orgId)
    : []

  return (
    <MarketDayCloseoutClient
      orgId={orgId}
      eventId={eventId}
      boothFee={event.booth_fee ?? 0}
      closeout={closeout}
      resources={resources}
    />
  )
}
