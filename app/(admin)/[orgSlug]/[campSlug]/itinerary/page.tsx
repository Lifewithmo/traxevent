export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { cache } from 'react'
import { adminDb } from '@/lib/firebase-admin'
import { listItinerary } from '@/actions/itinerary'
import { ItineraryClient } from '@/components/admin/ItineraryClient'
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

export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId, camp } = await resolveIds(orgSlug, campSlug)
  const items = await listItinerary(orgId, campId)

  return (
    <ItineraryClient
      orgId={orgId}
      campId={campId}
      items={items}
      published={camp.itinerary_published ?? false}
    />
  )
}
