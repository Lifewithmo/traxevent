export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { listSlots } from '@/actions/assignments'
import { getAdminFamilies } from '@/actions/admin-families'
import { resolveTerminology } from '@/lib/event-types'
import { AssignmentsClient } from '@/components/admin/AssignmentsClient'

export default async function AssignmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { orgId, eventId, event } = await requireEventPage(orgSlug, eventSlug, 'assignments')
  const [slots, families] = await Promise.all([
    listSlots(orgId, eventId),
    getAdminFamilies(orgId, eventId),
  ])
  const terminology = resolveTerminology(event.event_type_id, event.event_type_terminology)

  return (
    <AssignmentsClient
      orgId={orgId}
      eventId={eventId}
      eventSlug={eventSlug}
      orgSlug={orgSlug}
      slots={slots}
      families={families}
      terminology={terminology}
    />
  )
}
