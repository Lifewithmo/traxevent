'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { Proposal } from '@/lib/types'

async function findProposalByToken(token: string) {
  const snap = await adminDb.collectionGroup('proposals').where('token', '==', token).limit(1).get()
  if (snap.empty) return null
  return snap.docs[0]
}

// PUBLIC (token = authorization). Drafts are never exposed.
export async function getPublicProposal(token: string): Promise<Proposal | null> {
  const doc = await findProposalByToken(token)
  if (!doc) return null
  const proposal = doc.data() as Proposal
  if (proposal.status === 'draft') return null
  return proposal
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
