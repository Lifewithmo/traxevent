export const dynamic = 'force-dynamic'

import { requireCampPage } from '@/lib/auth/guards'
import { listSlots } from '@/actions/assignments'
import { getAdminFamilies } from '@/actions/admin-families'
import { resolveTerminology } from '@/lib/event-types'
import { AssignmentsClient } from '@/components/admin/AssignmentsClient'

export default async function AssignmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId, camp } = await requireCampPage(orgSlug, campSlug, 'assignments')
  const [slots, families] = await Promise.all([
    listSlots(orgId, campId),
    getAdminFamilies(orgId, campId),
  ])
  const terminology = resolveTerminology(camp.event_type_id, camp.event_type_terminology)

  return (
    <AssignmentsClient
      orgId={orgId}
      campId={campId}
      campSlug={campSlug}
      orgSlug={orgSlug}
      slots={slots}
      families={families}
      terminology={terminology}
    />
  )
}
