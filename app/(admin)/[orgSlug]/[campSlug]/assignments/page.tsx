export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listSlots } from '@/actions/assignments'
import { getAdminFamilies } from '@/actions/admin-families'
import { getEventType } from '@/lib/event-types'
import { AssignmentsClient } from '@/components/admin/AssignmentsClient'
import type { Camp } from '@/lib/types'

async function resolveIds(orgSlug: string, campSlug: string) {
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const campSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').where('slug', '==', campSlug).limit(1).get()
  if (campSnap.empty) notFound()

  return { orgId, campId: campSnap.docs[0].id, camp: campSnap.docs[0].data() as Camp }
}

export default async function AssignmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId, camp } = await resolveIds(orgSlug, campSlug)
  const [slots, families] = await Promise.all([
    listSlots(orgId, campId),
    getAdminFamilies(orgId, campId),
  ])
  const { terminology } = getEventType(camp.event_type_id)

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
