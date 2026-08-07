export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getProposal } from '@/actions/proposals'
import { ProposalBuilderClient } from '@/components/admin/proposal-builder/ProposalBuilderClient'
import { isAiEnabled } from '@/lib/ai/client'
// TEMPORARY stub type — Track B lands `branding` on the org document type;
// until then the cast below reads it structurally (undefined = neutral theme).
import type { OrgBranding } from '@/lib/proposal-builder-stubs'

export default async function ProposalBuilderPage({ params }: { params: Promise<{ orgSlug: string; leadId: string; proposalId: string }> }) {
  const { orgSlug, leadId, proposalId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const branding = (orgSnap.docs[0].data() as { branding?: OrgBranding }).branding
  const proposal = await getProposal(orgId, proposalId)
  if (!proposal || proposal.lead_id !== leadId) notFound()
  const aiEnabled = isAiEnabled()
  return (
    <ProposalBuilderClient
      orgId={orgId}
      orgSlug={orgSlug}
      leadId={leadId}
      proposal={proposal}
      branding={branding}
      aiEnabled={aiEnabled}
    />
  )
}
