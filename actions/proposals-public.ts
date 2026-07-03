'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { Proposal, ProposalStatus, ProposalLineItem } from '@/lib/types'

// Public-safe projection of a Proposal. Deliberately OMITS the secret
// `token`, the internal `org_id`, `lead_id`, and `id` so none of them can
// leak to an unauthenticated public page.
export interface PublicProposal {
  title?: string
  status: ProposalStatus
  line_items: ProposalLineItem[]
  notes?: string
  client_response_at?: string
  created_at: string
}

async function findProposalByToken(token: string) {
  const snap = await adminDb.collectionGroup('proposals').where('token', '==', token).limit(1).get()
  if (snap.empty) return null
  return snap.docs[0]
}

// PUBLIC (token = authorization). Drafts are never exposed.
export async function getPublicProposal(token: string): Promise<PublicProposal | null> {
  const doc = await findProposalByToken(token)
  if (!doc) return null
  const proposal = doc.data() as Proposal
  if (proposal.status === 'draft') return null
  // Project only public-safe fields — never spread the raw doc, so that
  // token/org_id/lead_id/id are structurally absent from the response.
  const publicProposal: PublicProposal = {
    status: proposal.status,
    line_items: proposal.line_items,
    created_at: proposal.created_at,
  }
  if (proposal.title !== undefined) publicProposal.title = proposal.title
  if (proposal.notes !== undefined) publicProposal.notes = proposal.notes
  if (proposal.client_response_at !== undefined) {
    publicProposal.client_response_at = proposal.client_response_at
  }
  return publicProposal
}

// PUBLIC. Client accepts or rejects. Accepting advances the lead to 'booked'.
export async function respondToProposal(token: string, response: 'accepted' | 'rejected'): Promise<void> {
  if (response !== 'accepted' && response !== 'rejected') throw new Error('Invalid response')
  const doc = await findProposalByToken(token)
  if (!doc) throw new Error('Proposal not found')
  const proposal = doc.data() as Proposal
  if (proposal.status !== 'sent') throw new Error('This proposal is no longer awaiting a response')

  const now = new Date().toISOString()
  await doc.ref.update({ status: response, client_response_at: now, updated_at: now })

  if (response === 'accepted') {
    const orgRef = doc.ref.parent.parent
    if (orgRef) {
      await orgRef.collection('leads').doc(proposal.lead_id).update({ stage: 'booked', updated_at: now })
    }
  }
}
