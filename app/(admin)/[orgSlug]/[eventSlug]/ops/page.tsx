export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { adminDb } from '@/lib/firebase-admin'
import { getOpsPlan, listIssues } from '@/actions/event-ops'
import { listWorkPackages } from '@/actions/work-packages'
import { listComplianceDocsCore, expiringDocs } from '@/lib/ops/compliance'
import { OpsPlanClient } from '@/components/admin/ops/OpsPlanClient'
import type { Org } from '@/lib/types'

export default async function OpsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event, member } = await requireEventPage(orgSlug, eventSlug, 'ops')
  const org = (await adminDb.collection('orgs').doc(orgId).get()).data() as Org
  const [plan, issues, packages, complianceDocs] = await Promise.all([
    getOpsPlan(orgId, eventId),
    listIssues(orgId, eventId),
    listWorkPackages(orgId),
    listComplianceDocsCore(orgId),
  ])
  const complianceWarnings = expiringDocs(complianceDocs, event.event_start.slice(0, 10))
    .map((d) => ({ name: d.name, expires_on: d.expires_on! }))
  return (
    <OpsPlanClient
      orgId={orgId}
      eventId={eventId}
      orgSlug={orgSlug}
      eventSlug={eventSlug}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
      plan={plan}
      issues={issues}
      packages={packages}
      eventName={event.name}
      eventStart={event.event_start}
      eventHeadcount={event.headcount}
      industryPackId={org.industry_pack_id}
      complianceWarnings={complianceWarnings}
    />
  )
}
