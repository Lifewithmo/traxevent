export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { cache } from 'react'
import { adminDb } from '@/lib/firebase-admin'
import { listFormTemplates, listEventFormAssignments } from '@/actions/forms'
import { getAdminFamilies } from '@/actions/admin-families'
import { EventFormsClient } from '@/components/admin/EventFormsClient'
import type { Camp, Org } from '@/lib/types'

const resolveIds = cache(async (orgSlug: string, campSlug: string) => {
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const org = orgSnap.docs[0].data() as Org

  const campSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').where('slug', '==', campSlug).limit(1).get()
  if (campSnap.empty) notFound()

  return { orgId, org, campId: campSnap.docs[0].id, camp: campSnap.docs[0].data() as Camp }
})

export default async function EventFormsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId } = await resolveIds(orgSlug, campSlug)

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
