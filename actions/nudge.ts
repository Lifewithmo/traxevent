'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertOrgAdmin } from '@/lib/auth/assert'
import { logActivity } from '@/lib/activity'
import { sendProposalNudge } from '@/lib/email'
import { unopenedSentProposal } from '@/lib/pipeline-view'
import { getLead } from '@/actions/leads'
import { listProposals } from '@/actions/proposals'
import { getVerifiedSendingDomain } from '@/actions/domains'
import type { Org } from '@/lib/types'

// Sends a reminder for the newest sent-but-unopened proposal on the lead.
// The proposal is re-derived server-side so the client only ever passes ids.
export async function nudgeProposal(orgId: string, leadId: string): Promise<void> {
  await assertOrgAdmin(orgId)

  const lead = await getLead(orgId, leadId)
  if (!lead) throw new Error('Lead not found')
  if (!lead.email) throw new Error('Lead has no email address')

  const proposal = unopenedSentProposal(await listProposals(orgId, leadId))
  if (!proposal) throw new Error('No unopened sent proposal to nudge')

  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  const org = orgSnap.data() as Org | undefined
  let fromDomain: string | undefined
  try {
    fromDomain = await getVerifiedSendingDomain(orgId)
  } catch {
    // domain lookup failure should not block the email — fall back to default
  }

  await sendProposalNudge({
    to: lead.email,
    contactName: lead.name,
    proposalTitle: proposal.title,
    token: proposal.token,
    fromDisplayName: org?.branding?.display_name ?? org?.name,
    fromDomain,
  })

  await logActivity(orgId, {
    parent_type: 'opportunity',
    parent_id: leadId,
    kind: 'nudge',
    summary: 'Nudged — proposal reminder sent',
  })
}
