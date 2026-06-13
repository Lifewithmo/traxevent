export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { cache } from 'react'
import { adminDb } from '@/lib/firebase-admin'
import { getEventReportData, getFormSubmissionReport } from '@/actions/reports'
import { ReportsClient } from '@/components/admin/ReportsClient'
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

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId, camp } = await resolveIds(orgSlug, campSlug)
  const [data, formSubmissions] = await Promise.all([
    getEventReportData(orgId, campId),
    getFormSubmissionReport(orgId, campId),
  ])

  return (
    <ReportsClient
      orgId={orgId}
      campId={campId}
      campName={camp.name}
      registrationType={camp.registration_type}
      data={data}
      formSubmissions={formSubmissions}
    />
  )
}
