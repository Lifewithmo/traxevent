export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getPublicProposal } from '@/actions/proposals-public'
import { ProposalResponseClient } from '@/components/proposals/ProposalResponseClient'
export default async function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const proposal = await getPublicProposal(token)
  if (!proposal) notFound()
  return <ProposalResponseClient token={token} proposal={proposal} branding={proposal.branding} />
}
