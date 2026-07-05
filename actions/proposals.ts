'use server'

import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { generateAccessToken } from '@/lib/tokens'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { PROPOSAL_STATUSES } from '@/lib/proposals'
import type { Proposal, ProposalLineItem, ProposalStatus } from '@/lib/types'

function proposalsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('proposals')
}

export interface CreateProposalInput {
  title?: string
  line_items?: ProposalLineItem[]
  notes?: string
}

export async function listProposals(orgId: string, leadId: string): Promise<Proposal[]> {
  await assertOrgMember(orgId)
  const snap = await proposalsRef(orgId).where('lead_id', '==', leadId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Proposal)
}

export async function listAllProposals(orgId: string): Promise<Proposal[]> {
  await assertOrgMember(orgId)
  const snap = await proposalsRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Proposal)
}

export async function getProposal(orgId: string, proposalId: string): Promise<Proposal | null> {
  await assertOrgMember(orgId)
  const snap = await proposalsRef(orgId).doc(proposalId).get()
  return snap.exists ? (snap.data() as Proposal) : null
}

export async function createProposal(orgId: string, leadId: string, input: CreateProposalInput): Promise<Proposal> {
  await assertOrgAdmin(orgId)
  const id = randomBytes(8).toString('hex')
  const proposal: Proposal = {
    id,
    org_id: orgId,
    lead_id: leadId,
    token: generateAccessToken(),
    status: 'draft',
    line_items: input.line_items ?? [],
    created_at: new Date().toISOString(),
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await proposalsRef(orgId).doc(id).set(proposal)
  return proposal
}

export interface ProposalUpdate {
  title?: string
  notes?: string
  line_items?: ProposalLineItem[]
  status?: ProposalStatus
}

export async function updateProposal(orgId: string, proposalId: string, updates: ProposalUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  if (updates.status && !PROPOSAL_STATUSES.includes(updates.status)) throw new Error('Invalid status')
  await proposalsRef(orgId).doc(proposalId).update({ ...updates, updated_at: new Date().toISOString() })
}

export async function sendProposal(orgId: string, proposalId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await proposalsRef(orgId).doc(proposalId).update({ status: 'sent', updated_at: new Date().toISOString() })
}

export async function deleteProposal(orgId: string, proposalId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await proposalsRef(orgId).doc(proposalId).delete()
}
