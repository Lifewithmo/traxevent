export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireEventPage } from '@/lib/auth/guards'
import { getOpsPlan, getCloseout, getCloseoutSummary } from '@/actions/event-ops'
import { listLeads, getLead } from '@/actions/leads'
import { getWorkPackagesByIdsCore } from '@/lib/ops/work-packages'
import { listResourcesCore } from '@/lib/ops/resources'
import { opportunityTitle } from '@/lib/leads'
import { CloseoutClient } from '@/components/admin/ops/CloseoutClient'
import type { CloseoutSummary } from '@/lib/types'

export default async function CloseoutPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event, member } = await requireEventPage(orgSlug, eventSlug, 'ops')
  const plan = await getOpsPlan(orgId, eventId)
  if (!plan) redirect(`/${orgSlug}/${eventSlug}/ops`)

  // The same two reads closeoutSummaryCore performs internally (zero new query
  // shapes) — passed down so the client can recompute the summary live as
  // actuals are typed. A package deleted since planning simply comes back
  // missing here; the client replicates the core's guard against it.
  const [closeout, packages, resources] = await Promise.all([
    getCloseout(orgId, eventId),
    getWorkPackagesByIdsCore(orgId, plan.package_ids),
    listResourcesCore(orgId),
  ])
  // A linked job needs no picker, and no read to populate one. A link whose
  // opportunity was since deleted falls back to the picker rather than
  // dead-ending the one screen where money lands.
  const linkedLead = event.lead_id ? await getLead(orgId, event.lead_id) : null
  const linkBroken = !!event.lead_id && !linkedLead
  const leads = linkedLead ? [] : await listLeads(orgId)
  let summary: CloseoutSummary | null = null
  let summaryError: string | null = null
  try {
    summary = await getCloseoutSummary(orgId, eventId)
  } catch (err: unknown) {
    summaryError = err instanceof Error ? err.message : 'Failed to compute summary'
  }

  return (
    <CloseoutClient
      orgId={orgId}
      eventId={eventId}
      orgSlug={orgSlug}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
      eventName={event.name}
      plan={plan}
      packages={packages}
      resources={resources}
      boothFee={event.booth_fee}
      closeout={closeout}
      summary={summary}
      summaryError={summaryError}
      leads={leads}
      linkedLead={linkedLead ? { id: linkedLead.id, title: opportunityTitle(linkedLead) } : null}
      linkBroken={linkBroken}
    />
  )
}
