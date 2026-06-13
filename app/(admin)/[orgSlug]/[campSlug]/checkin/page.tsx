export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { cache } from 'react'
import { adminDb } from '@/lib/firebase-admin'
import { listAllEventMembers, getCheckinsForDate } from '@/actions/checkins'
import { resolveTerminology } from '@/lib/event-types'
import { CheckinClient } from '@/components/admin/CheckinClient'
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

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { date } = await searchParams
  const { orgId, campId, camp } = await resolveIds(orgSlug, campSlug)

  const today = new Date().toISOString().slice(0, 10)
  const activeDate = date ?? today

  const [members, checkins] = await Promise.all([
    listAllEventMembers(orgId, campId),
    getCheckinsForDate(orgId, campId, activeDate),
  ])

  const terminology = resolveTerminology(camp.event_type_id, camp.event_type_terminology)
  const guardianMode = camp.registration_type === 'child'

  return (
    <CheckinClient
      orgId={orgId}
      campId={campId}
      orgSlug={orgSlug}
      campSlug={campSlug}
      date={activeDate}
      members={members}
      checkins={checkins}
      guardianMode={guardianMode}
      memberLabel={terminology.memberPlural}
    />
  )
}
