export const dynamic = 'force-dynamic'

import { requireOrgMember } from '@/lib/auth/guards'
import { listLeads } from '@/actions/leads'
import { computeEventTypeUsage } from '@/lib/crm/event-type-admin'
import { kindLabel } from '@/lib/capacity/labels'
import { EventTypesClient } from '@/components/admin/EventTypesClient'

/**
 * Settings → Event types (event types inc 1, spec §5a): the one id-referenced,
 * archivable list feeding every picker. Usage + unadopted history are computed
 * server-side per load from the org's leads (the house in-memory rollup), so
 * every row count and destructive dialog reflects the same resolution rule the
 * capacity engine applies (`computeEventTypeUsage` mirrors `leadRequirement`).
 */
export default async function EventTypesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org, orgId } = await requireOrgMember(orgSlug)

  const leads = await listLeads(orgId)
  const profiles = org.event_type_profiles ?? []
  const usage = computeEventTypeUsage(leads, profiles)

  return (
    <EventTypesClient
      orgId={orgId}
      orgSlug={orgSlug}
      initialProfiles={profiles}
      usage={usage}
      kindLabels={{
        mobileOne: kindLabel(org, 'mobile', 1),
        venueOne: kindLabel(org, 'venue', 1),
      }}
    />
  )
}
