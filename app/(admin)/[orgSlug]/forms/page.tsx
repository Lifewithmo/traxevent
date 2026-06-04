export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listFormTemplates } from '@/actions/forms'
import { FormTemplatesClient } from '@/components/admin/FormTemplatesClient'
import type { Org } from '@/lib/types'

export default async function OrgFormsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const org = orgSnap.docs[0].data() as Org
  const orgId = orgSnap.docs[0].id

  const templates = await listFormTemplates(orgId)

  return (
    <FormTemplatesClient
      orgId={orgId}
      templates={templates}
    />
  )
}
