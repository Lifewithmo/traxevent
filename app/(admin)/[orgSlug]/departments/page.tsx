export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listDepartments } from '@/actions/departments'
import { DepartmentsClient } from '@/components/admin/DepartmentsClient'

export default async function DepartmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const departments = await listDepartments(orgId)
  return <DepartmentsClient orgId={orgId} departments={departments} />
}
