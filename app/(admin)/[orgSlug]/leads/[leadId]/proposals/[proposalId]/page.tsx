export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getProposal } from '@/actions/proposals'
import { ProposalEditorClient } from '@/components/admin/ProposalEditorClient'
import { isAiEnabled } from '@/lib/ai/client'

export default async function ProposalEditorPage({ params }: { params: Promise<{ orgSlug: string; leadId: string; proposalId: string }> }) {
  const { orgSlug, leadId, proposalId } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const proposal = await getProposal(orgId, proposalId)
  if (!proposal || proposal.lead_id !== leadId) notFound()
  const aiEnabled = isAiEnabled()
  return (
    <ProposalEditorClient
      orgId={orgId}
      orgSlug={orgSlug}
      leadId={leadId}
      proposal={proposal}
      aiEnabled={aiEnabled}
    />
  )
}
