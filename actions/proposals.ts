'use server'

import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { randomBytes } from 'crypto'
import { generateAccessToken } from '@/lib/tokens'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { PROPOSAL_STATUSES } from '@/lib/proposals'
import type { Proposal, ProposalLineItem, ProposalStatus, ProposalPackage, ProposalDiscount, ProposalDeposit } from '@/lib/types'

function proposalsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('proposals')
}

export interface CreateProposalInput {
  title?: string
  line_items?: ProposalLineItem[]
  notes?: string
  packages?: ProposalPackage[]
  discount?: ProposalDiscount
  tax_rate?: number
  deposit?: ProposalDeposit
  expires_at?: string
  deposit_gate?: 'before_accept' | 'after_accept'
  deposit_terms?: string
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
    ...(input.packages ? { packages: input.packages } : {}),
    ...(input.discount ? { discount: input.discount } : {}),
    ...(typeof input.tax_rate === 'number' ? { tax_rate: input.tax_rate } : {}),
    ...(input.deposit ? { deposit: input.deposit } : {}),
    ...(input.expires_at ? { expires_at: input.expires_at } : {}),
    ...(input.deposit_gate ? { deposit_gate: input.deposit_gate } : {}),
    ...(input.deposit_terms?.trim() ? { deposit_terms: input.deposit_terms.trim() } : {}),
  }
  await proposalsRef(orgId).doc(id).set(proposal)
  return proposal
}

export interface ProposalUpdate {
  title?: string
  notes?: string
  line_items?: ProposalLineItem[]
  status?: ProposalStatus
  packages?: ProposalPackage[]
  discount?: ProposalDiscount
  tax_rate?: number
  deposit?: ProposalDeposit
  expires_at?: string
  deposit_gate?: 'before_accept' | 'after_accept'
  deposit_terms?: string
}

export async function updateProposal(orgId: string, proposalId: string, updates: ProposalUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  if (updates.status && !PROPOSAL_STATUSES.includes(updates.status)) throw new Error('Invalid status')

  const ref = proposalsRef(orgId).doc(proposalId)
  const snap = await ref.get()
  if (snap?.exists) {
    const data = snap.data() as Proposal
    if (data.signature || data.pending_signature) {
      throw new Error('This proposal is signed and can no longer be edited')
    }
  }

  // Firestore rejects `undefined` (ignoreUndefinedProperties is off). Unlike the partial-update
  // callers in events.ts/leads.ts (where an omitted/undefined key means "leave unchanged"), the
  // proposal editor always sends its full pricing-terms state, so an `undefined` value here means
  // "the user cleared this field" — map it to FieldValue.delete() rather than dropping the key
  // (which would leave a stale discount/deposit/expiration in Firestore) or passing it raw
  // (which throws).
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    cleaned[k] = v === undefined ? FieldValue.delete() : v
  }

  await ref.update({ ...cleaned, updated_at: new Date().toISOString() })
}

export async function sendProposal(orgId: string, proposalId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = proposalsRef(orgId).doc(proposalId)
  const snap = await ref.get()
  if (snap?.exists) {
    const data = snap.data() as Proposal
    if (data.signature || data.pending_signature) {
      throw new Error('This proposal is signed and can no longer be edited')
    }
  }
  await ref.update({ status: 'sent', updated_at: new Date().toISOString() })
}

// Voids a proposal without deleting it — retains the record with a cause
// notation. Writes via `ref.update` directly (not `updateProposal`) so the
// sign-lock does NOT block voiding a *signed* proposal — that's the point:
// a signed proposal can still be voided (e.g. duplicate booking, cancellation).
export async function voidProposal(orgId: string, proposalId: string, reason: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const trimmed = typeof reason === 'string' ? reason.trim() : ''
  if (!trimmed) throw new Error('A reason is required to void a proposal')
  const ref = proposalsRef(orgId).doc(proposalId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Proposal not found')
  const p = snap.data() as Proposal
  if (p.status === 'voided') throw new Error('This proposal is already voided')
  if (p.status === 'draft') throw new Error('Only a sent proposal can be voided')
  const now = new Date().toISOString()
  await ref.update({ status: 'voided', void_reason: trimmed, voided_at: now, updated_at: now })
}

export async function deleteProposal(orgId: string, proposalId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const ref = proposalsRef(orgId).doc(proposalId)
  const snap = await ref.get()
  if (snap?.exists) {
    const data = snap.data() as Proposal
    if (data.signature || data.pending_signature) {
      throw new Error('This proposal is signed and can no longer be edited')
    }
  }
  await ref.delete()
}
