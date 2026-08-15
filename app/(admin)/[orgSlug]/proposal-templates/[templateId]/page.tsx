export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getProposalTemplate } from '@/actions/proposal-templates'
import { TemplateBuilderClient } from '@/components/admin/templates/TemplateBuilderClient'
import type { OrgBranding } from '@/lib/types'

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ orgSlug: string; templateId: string }>
}) {
  const { orgSlug, templateId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const org = orgSnap.docs[0].data() as { branding?: OrgBranding }

  const template = await getProposalTemplate(orgId, templateId)
  if (!template) notFound()

  return (
    <TemplateBuilderClient
      orgId={orgId}
      orgSlug={orgSlug}
      template={template}
      branding={org.branding}
    />
  )
}
