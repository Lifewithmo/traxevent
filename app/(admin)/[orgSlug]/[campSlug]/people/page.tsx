export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { cache } from 'react'
import { adminDb } from '@/lib/firebase-admin'
import { listEventPeople, listPermissionTemplates } from '@/actions/people'
import { EventPeopleClient } from '@/components/admin/EventPeopleClient'
import type { Camp } from '@/lib/types'

const resolveIds = cache(async (orgSlug: string, campSlug: string) => {
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const campSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').where('slug', '==', campSlug).limit(1).get()
  if (campSnap.empty) notFound()

  return { orgId, campId: campSnap.docs[0].id, camp: campSnap.docs[0].data() as Camp }
})

export default async function EventPeoplePage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId } = await resolveIds(orgSlug, campSlug)

  const [people, templates] = await Promise.all([
    listEventPeople(orgId, campId),
    listPermissionTemplates(orgId),
  ])

  return (
    <EventPeopleClient orgId={orgId} campId={campId} people={people} templates={templates} />
  )
}
