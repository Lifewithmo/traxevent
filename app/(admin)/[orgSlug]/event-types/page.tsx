export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listOrgEventTypes } from '@/actions/event-types'
import { EventTypesClient } from '@/components/admin/EventTypesClient'

export default async function EventTypesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const types = await listOrgEventTypes(orgId)
  return <EventTypesClient orgId={orgId} types={types} />
}
