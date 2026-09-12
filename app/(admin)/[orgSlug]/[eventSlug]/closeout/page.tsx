export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireEvent } from '@/lib/auth/guards'
import { kindOf } from '@/lib/occasions/kind'
import { getCloseoutCore } from '@/lib/ops/closeout'
import { listResourcesCore } from '@/lib/ops/resources'
import { listSeriesDaysCore } from '@/lib/occasions/series'
import { MarketDayCloseoutClient } from '@/components/admin/ops/MarketDayCloseoutClient'
import type { Event, OpsResource } from '@/lib/types'

/**
 * Ghost hint (inc-3 B4): the series' prior day with saved sales. DECISION —
 * the closeout page did not previously have the series in scope, so this IS
 * two extra reads (the series-days query + one closeout doc get), but both
 * reuse existing fetch paths and query shapes: listSeriesDaysCore is the
 * exact single-field-index query the series page runs (zero NEW index — B4's
 * hard line) and the closeout get is a direct doc read. Gated to series-
 * generated days, run in parallel with the page's own closeout read, and
 * soft-failing: a failed hint lookup renders no hint, never an error.
 */
async function loadPriorDayHint(
  orgId: string, event: Event, eventId: string,
): Promise<{ date: string; sales: number; imported: boolean } | null> {
  if (!event.series_id) return null
  try {
    const days = await listSeriesDaysCore(orgId, event.series_id) // ascending
    const prior = days
      .filter((d) => d.id !== eventId && d.event_start < event.event_start)
      .pop()
    if (!prior) return null
    const closeout = await getCloseoutCore(orgId, prior.id)
    const sales = closeout?.actuals?.sales
    // Counting rule (inc-2): ANY saved sales counts — Mark-complete optional.
    if (sales === undefined) return null
    return {
      date: prior.event_start.slice(0, 10),
      sales,
      // B3 hard gate: imported money is labeled as imported at EVERY render —
      // the hint included. Dropping sales_source here would show a Square
      // figure as if it were typed.
      imported: closeout?.actuals?.sales_source === 'square_csv',
    }
  } catch {
    return null
  }
}

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

  // Market-day nav bypasses allowedPages (and although buildEventNav now hides
  // the Closeout row from non-admins, deep URLs still resolve), so this page
  // carries its own guard: closing out the day is an
  // owner/admin task — the same role line the series page draws (isAdmin) and
  // the same gate completeCloseout enforces server-side.
  if (member.role !== 'owner' && member.role !== 'admin') {
    redirect(`/${orgSlug}/${eventSlug}/dashboard`)
  }

  const [closeout, priorDay] = await Promise.all([
    getCloseoutCore(orgId, eventId),
    loadPriorDayHint(orgId, event, eventId),
  ])
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
      eventDate={event.event_start.slice(0, 10)}
      closeout={closeout}
      resources={resources}
      priorDay={priorDay}
    />
  )
}
