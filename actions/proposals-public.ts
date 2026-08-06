'use server'

import { headers } from 'next/headers'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import { computeSelectedTotal, depositAmount } from '@/lib/proposals'
import { signedDocumentHash } from '@/lib/proposal-signature'
import { sendProposalSignedConfirmation } from '@/lib/email'
import { getVerifiedSendingDomain } from '@/actions/domains'
import type {
  Proposal, ProposalStatus, ProposalLineItem, ProposalPackage,
  ProposalDiscount, ProposalDeposit, ProposalSelection, PaymentStatus, ProposalBlock,
} from '@/lib/types'

// Public-safe projection of a Proposal. Deliberately OMITS the secret
// `token`, the internal `org_id`, `lead_id`, and `id` so none of them can
// leak to an unauthenticated public page. Also OMITS the sensitive parts of
// `signature` (ip/user_agent/document_hash/signer_email), `pending_signature`,
// and the raw `events` audit log — only a reduced `signed` summary is exposed.
export interface PublicProposal {
  title?: string
  status: ProposalStatus
  line_items: ProposalLineItem[]
  packages?: ProposalPackage[]
  discount?: ProposalDiscount
  tax_rate?: number
  deposit?: ProposalDeposit
  deposit_gate?: 'before_accept' | 'after_accept'
  deposit_terms?: string
  payment_status?: PaymentStatus
  expires_at?: string
  notes?: string
  blocks?: ProposalBlock[]
  selection?: ProposalSelection
  client_response_at?: string
  created_at: string
  signed?: { signer_name: string; signed_at: string }
}

async function findProposalByToken(token: string) {
  const snap = await adminDb.collectionGroup('proposals').where('token', '==', token).limit(1).get()
  if (snap.empty) return null
  return snap.docs[0]
}

// Server-authoritative request context. The client never supplies ip/ua —
// they are derived here from the (server-trusted) request headers.
async function requestContext(): Promise<{ ip: string; user_agent: string }> {
  const h = await headers()
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
    user_agent: h.get('user-agent') ?? 'unknown',
  }
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
  if (proposal.blocks !== undefined) publicProposal.blocks = proposal.blocks
  if (proposal.packages !== undefined) publicProposal.packages = proposal.packages
  if (proposal.discount !== undefined) publicProposal.discount = proposal.discount
  if (proposal.tax_rate !== undefined) publicProposal.tax_rate = proposal.tax_rate
  if (proposal.deposit !== undefined) publicProposal.deposit = proposal.deposit
  if (proposal.deposit_gate !== undefined) publicProposal.deposit_gate = proposal.deposit_gate
  if (proposal.deposit_terms !== undefined) publicProposal.deposit_terms = proposal.deposit_terms
  if (proposal.payment_status !== undefined) publicProposal.payment_status = proposal.payment_status
  if (proposal.expires_at !== undefined) publicProposal.expires_at = proposal.expires_at
  if (proposal.selection !== undefined) publicProposal.selection = proposal.selection
  if (proposal.client_response_at !== undefined) {
    publicProposal.client_response_at = proposal.client_response_at
  }
  // Reduced signature summary only — never the ip/user_agent/document_hash/
  // signer_email that live on `proposal.signature`.
  if (proposal.signature !== undefined) {
    publicProposal.signed = {
      signer_name: proposal.signature.signer_name,
      signed_at: proposal.signature.signed_at,
    }
  }
  return publicProposal
}

// PUBLIC. Client rejects (declines) a sent proposal.
//
// Acceptance is retired from this action: it now happens ONLY through
// `signProposal`, which captures a server-authoritative audit trail
// (ip/user_agent/timestamp/document hash) before advancing the opportunity.
// The `accepted` branch is kept only so the Increment-1 UI (which still
// calls this action) fails loudly instead of silently closing a deal with
// no signature — it throws and writes nothing.
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

  if (response === 'accepted') {
    throw new Error('Acceptance now requires signing')
  }

  const now = new Date().toISOString()
  const ctx = await requestContext()
  await doc.ref.update({
    status: 'rejected',
    client_response_at: now,
    updated_at: now,
    events: FieldValue.arrayUnion({ kind: 'declined', at: now, ...ctx }),
  })
  // TODO(activity): logActivity(orgId, { kind: 'proposal', summary: 'Proposal declined' })
}

// PUBLIC. The public sign step — the ONLY path to 'accepted'. Captures a
// server-authoritative e-signature audit trail: ip/user_agent/timestamp are
// derived from the request, never trusted from the client; the client
// supplies only the selection, signer name/email, and consent. Validates the
// selection against THIS proposal's own packages/optional items, computes
// the authoritative total and deposit due, hashes the canonical signed
// document, and locks the proposal (a `sent`, un-signed proposal only).
export async function signProposal(token: string, input: {
  signer_name: string; signer_email: string; consent: boolean;
  selection?: { package_id?: string; optional_item_ids?: string[] };
}): Promise<{ deposit_due: number; payment_status: PaymentStatus }> {
  // 1. shape validation (no zod — hand-written guards, consistent with the rest of the app)
  const name = typeof input?.signer_name === 'string' ? input.signer_name.trim() : ''
  const email = typeof input?.signer_email === 'string' ? input.signer_email.trim() : ''
  const optionalIds = input?.selection?.optional_item_ids ?? []
  if (!name || !email || !email.includes('@')) throw new Error('Invalid request')
  if (input?.consent !== true) throw new Error('You must consent to sign electronically')
  if (!Array.isArray(optionalIds)) throw new Error('Invalid request')

  const doc = await findProposalByToken(token)
  if (!doc) throw new Error('Proposal not found')
  const proposal = doc.data() as Proposal
  if (proposal.status !== 'sent' || proposal.signature) {
    throw new Error('This proposal is no longer awaiting a response')
  }
  if (proposal.expires_at && new Date(proposal.expires_at).getTime() < Date.now()) {
    throw new Error('This proposal has expired. Please ask for an updated proposal.')
  }

  // 2. validate the selection against THIS proposal (same rules as Increment 1)
  const packages = proposal.packages ?? []
  const items = proposal.line_items ?? []
  const packageId = input.selection?.package_id
  if (packages.length > 0) {
    if (!packageId) throw new Error('Please select an option before accepting')
    if (!packages.some((p) => p.id === packageId)) throw new Error('Invalid selection')
  }
  const validOptional = new Set(
    items.filter((i) => i.optional === true && i.id !== undefined).map((i) => i.id as string),
  )
  for (const id of optionalIds) {
    if (!validOptional.has(id)) throw new Error('Invalid selection')
  }

  // 3. server-authoritative computation + capture
  const now = new Date().toISOString()
  const { ip, user_agent } = await requestContext()
  const selection: ProposalSelection = {
    ...(packages.length > 0 && packageId ? { package_id: packageId } : {}),
    optional_item_ids: optionalIds,
    selected_total: computeSelectedTotal(proposal, { package_id: packageId, optional_item_ids: optionalIds }),
    selected_at: now,
  }
  const document_hash = signedDocumentHash(proposal, selection)
  const deposit_due = depositAmount(selection.selected_total, proposal.deposit)
  const payment_status: PaymentStatus = proposal.deposit ? 'deposit_pending' : 'not_required'

  const signature = {
    signer_name: name, signer_email: email, signed_at: now, ip, user_agent,
    consent_electronic: true as const, document_hash,
  }
  await doc.ref.update({
    status: 'accepted', signature, selection, payment_status,
    client_response_at: now, updated_at: now,
    events: FieldValue.arrayUnion({ kind: 'signed', at: now, ip, user_agent }),
  })

  const orgRef = doc.ref.parent.parent
  if (orgRef) {
    await orgRef.collection('leads').doc(proposal.lead_id).update({ stage: 'closed_won', updated_at: now })
  }

  // best-effort confirmation email — never fail the sign on send failure
  let fromDomain: string | undefined
  try {
    fromDomain = orgRef ? await getVerifiedSendingDomain(orgRef.id) : undefined
  } catch {
    // domain lookup failure should not block the email — fall back to default
  }
  try {
    await sendProposalSignedConfirmation({ to: email, signerName: name, token, signedAt: now, fromDomain })
  } catch {
    // swallow: the signature is already recorded and authoritative
  }
  // TODO(activity): logActivity(orgId, { kind: 'proposal', summary: 'Proposal signed' })
  return { deposit_due, payment_status }
}

// PUBLIC. Best-effort view logging — appends a `viewed` audit event. Never
// throws: a logging failure must not break the public page.
export async function recordProposalView(token: string): Promise<void> {
  try {
    const doc = await findProposalByToken(token)
    if (!doc) return
    const proposal = doc.data() as Proposal
    if (proposal.status === 'draft') return
    const now = new Date().toISOString()
    const ctx = await requestContext()
    await doc.ref.update({ events: FieldValue.arrayUnion({ kind: 'viewed', at: now, ...ctx }) })
  } catch {
    // best-effort; never surface a view-logging failure to the public caller
  }
}
