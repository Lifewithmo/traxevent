export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getPublicProposal } from '@/actions/proposals-public'
import { ProposalResponseClient } from '@/components/proposals/ProposalResponseClient'
// TEMPORARY stub type (Track C): Track B adds `branding` to the
// PublicProposal payload (spec §2 — all fields public-safe by construction).
// Until it lands the cast reads undefined and the neutral theme renders.
import type { OrgBranding } from '@/lib/proposal-builder-stubs'

export default async function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const proposal = await getPublicProposal(token)
  if (!proposal) notFound()
  const branding = (proposal as { branding?: OrgBranding }).branding
  return <ProposalResponseClient token={token} proposal={proposal} branding={branding} />
}
