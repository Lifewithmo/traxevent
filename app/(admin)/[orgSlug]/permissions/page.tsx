export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listPermissionTemplates } from '@/actions/people'
import { PermissionTemplatesClient } from '@/components/admin/PermissionTemplatesClient'

export default async function OrgPermissionsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const templates = await listPermissionTemplates(orgId)

  return <PermissionTemplatesClient orgId={orgId} templates={templates} />
}
