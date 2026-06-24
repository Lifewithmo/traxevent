export const dynamic = 'force-dynamic'

import { adminDb } from '@/lib/firebase-admin'
import { requireCampPage } from '@/lib/auth/guards'
import { listFormTemplates, listEventFormAssignments } from '@/actions/forms'
import { getAdminFamilies } from '@/actions/admin-families'
import { EventFormsClient } from '@/components/admin/EventFormsClient'

export default async function EventFormsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId } = await requireCampPage(orgSlug, campSlug, 'forms')

  const [templates, assignments, families] = await Promise.all([
    listFormTemplates(orgId),
    listEventFormAssignments(orgId, campId),
    getAdminFamilies(orgId, campId),
  ])

  // Count signed forms per assignment.
  // NOTE: requires a Firestore composite index on collectionGroup 'signed_forms' for field
  // 'assignment_id' (ascending). Add to firestore.indexes.json if this query fails in production.
  const signedCountsByAssignment: Record<string, number> = {}
  await Promise.all(
    assignments.map(async (a) => {
      const snap = await adminDb
        .collectionGroup('signed_forms')
        .where('org_id', '==', orgId)
        .where('assignment_id', '==', a.id)
        .get()
      signedCountsByAssignment[a.id] = snap.size
    })
  )

  const activeCount = families.filter(
    (f) => f.registration_status === 'confirmed' || f.registration_status === 'pending'
  ).length

  return (
    <EventFormsClient
      orgId={orgId}
      campId={campId}
      templates={templates}
      assignments={assignments}
      signedCounts={signedCountsByAssignment}
      activeRegistrantCount={activeCount}
    />
  )
}
