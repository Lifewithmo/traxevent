'use server'

import { adminDb } from '@/lib/firebase-admin'
import { computeSelectedTotal } from '@/lib/proposals'
import type {
  Proposal, ProposalStatus, ProposalLineItem, ProposalPackage,
  ProposalDiscount, ProposalDeposit, ProposalSelection,
} from '@/lib/types'

// Public-safe projection of a Proposal. Deliberately OMITS the secret
// `token`, the internal `org_id`, `lead_id`, and `id` so none of them can
// leak to an unauthenticated public page.
export interface PublicProposal {
  title?: string
  status: ProposalStatus
  line_items: ProposalLineItem[]
  packages?: ProposalPackage[]
  discount?: ProposalDiscount
  tax_rate?: number
  deposit?: ProposalDeposit
  expires_at?: string
  notes?: string
  selection?: ProposalSelection
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
  if (proposal.packages !== undefined) publicProposal.packages = proposal.packages
  if (proposal.discount !== undefined) publicProposal.discount = proposal.discount
  if (proposal.tax_rate !== undefined) publicProposal.tax_rate = proposal.tax_rate
  if (proposal.deposit !== undefined) publicProposal.deposit = proposal.deposit
  if (proposal.expires_at !== undefined) publicProposal.expires_at = proposal.expires_at
  if (proposal.selection !== undefined) publicProposal.selection = proposal.selection
  if (proposal.client_response_at !== undefined) {
    publicProposal.client_response_at = proposal.client_response_at
  }
  return publicProposal
}

// PUBLIC. Client accepts or rejects. Accepting captures the selection snapshot
// (server-recomputed total) and advances the opportunity to 'closed_won' (booked = won).
export async function respondToProposal(
  token: string,
  response: 'accepted' | 'rejected',
  selection?: { package_id?: string; optional_item_ids?: string[] },
): Promise<void> {
  if (response !== 'accepted' && response !== 'rejected') throw new Error('Invalid response')
  const doc = await findProposalByToken(token)
  if (!doc) throw new Error('Proposal not found')
  const proposal = doc.data() as Proposal
  if (proposal.status !== 'sent') throw new Error('This proposal is no longer awaiting a response')

  const now = new Date().toISOString()

  if (response === 'rejected') {
    await doc.ref.update({ status: 'rejected', client_response_at: now, updated_at: now })
    // TODO(activity): logActivity(orgId, { kind: 'proposal', summary: 'Proposal declined' })
    return
  }

  // accepted — validate the selection against THIS proposal, then snapshot it.
  const packages = proposal.packages ?? []
  const items = proposal.line_items ?? []
  const packageId = selection?.package_id
  if (packages.length > 0) {
    if (!packageId) throw new Error('Please select an option before accepting')
    if (!packages.some((p) => p.id === packageId)) throw new Error('Invalid selection')
  }
  const optionalIds = selection?.optional_item_ids ?? []
  if (!Array.isArray(optionalIds)) throw new Error('Invalid selection')
  const validOptionalIds = new Set(
    items.filter((i) => i.optional === true && i.id !== undefined).map((i) => i.id as string),
  )
  for (const id of optionalIds) {
    if (!validOptionalIds.has(id)) throw new Error('Invalid selection')
  }

  const snapshot: ProposalSelection = {
    ...(packages.length > 0 && packageId ? { package_id: packageId } : {}),
    optional_item_ids: optionalIds,
    selected_total: computeSelectedTotal(proposal, { package_id: packageId, optional_item_ids: optionalIds }),
    selected_at: now,
  }
  await doc.ref.update({ status: 'accepted', selection: snapshot, client_response_at: now, updated_at: now })

  const orgRef = doc.ref.parent.parent
  if (orgRef) {
    await orgRef.collection('leads').doc(proposal.lead_id).update({ stage: 'closed_won', updated_at: now })
  }
  // TODO(activity): logActivity(orgId, { kind: 'proposal', summary: 'Proposal accepted' })
}
