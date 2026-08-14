export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listProposalTemplates } from '@/actions/proposal-templates'
import { TemplateListClient } from '@/components/admin/templates/TemplateListClient'

export default async function ProposalTemplatesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const templates = await listProposalTemplates(orgId)
  return <TemplateListClient orgId={orgId} orgSlug={orgSlug} templates={templates} />
}
