export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getOrgReportData } from '@/actions/reports'
import { listDepartments } from '@/actions/departments'
import { OrgReportsClient } from '@/components/admin/OrgReportsClient'

export default async function OrgReportsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const [report, departments] = await Promise.all([
    getOrgReportData(orgId),
    listDepartments(orgId),
  ])
  return <OrgReportsClient report={report} departments={departments} />
}
