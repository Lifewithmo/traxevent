'use server'

import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { generateAccessToken } from '@/lib/tokens'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { logActivity } from '@/lib/activity'
import { updateProposalDraftCore } from '@/lib/proposals/draft-core'
import { MAX_TERMS_CHARS } from '@/lib/proposals/draft'
import type { ProposalDraftInput } from '@/lib/proposals/draft'
import type { Org, Proposal, ProposalLineItem, ProposalPackage, ProposalDiscount, ProposalDeposit, ProposalBlock } from '@/lib/types'
import { blocksToVoiceText, pushVoiceExample, type VoiceExample } from '@/lib/ai/voice'
import { evaluateSendGate, SEND_GATE_MESSAGES } from '@/lib/proposals/send-gate'

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
  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  const defaultTerms = (((orgSnap.data() as Org | undefined)?.default_proposal_terms) ?? '').trim().slice(0, MAX_TERMS_CHARS)
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
    ...(defaultTerms ? { terms: defaultTerms } : {}),
  }
  await proposalsRef(orgId).doc(id).set(proposal)
  return proposal
}

export async function sendProposal(
  orgId: string,
  proposalId: string,
  override?: { reason: string },
): Promise<void> {
  const member = await assertOrgAdmin(orgId)
  const ref = proposalsRef(orgId).doc(proposalId)
  const snap = await ref.get()
  const proposalBeforeSend = snap?.exists ? (snap.data() as Proposal) : undefined
  // Tracks whether this send actually used the override, so the activity log
  // below (and any future surface) can say so — sent_override was previously
  // written to the document and never surfaced anywhere a human looks; the
  // activity-log entry for an overridden send read identical to a clean one.
  let overrideReason: string | undefined
  if (proposalBeforeSend) {
    if (proposalBeforeSend.signature || proposalBeforeSend.pending_signature) {
      throw new Error('This proposal is signed and can no longer be edited')
    }

    // The polish gate (spec §12). It lives HERE and not in SendDialog because a
    // server action is a public POST endpoint and the dialog is documented
    // "Presentational only" — its warnings sit beside an always-enabled button.
    // This action is the only writer of status:'sent' in the codebase.
    const failed = evaluateSendGate(proposalBeforeSend, new Date())
    if (failed.length > 0 && !override?.reason?.trim()) {
      throw new Error(failed.map((c) => SEND_GATE_MESSAGES[c]).join(' '))
    }
    if (failed.length > 0 && override?.reason?.trim()) {
      overrideReason = override.reason.trim()
      await ref.update({
        sent_override: {
          reason: overrideReason,
          checks: failed,
          by: member.uid,
          at: new Date().toISOString(),
        },
      })
    }
  }
  await ref.update({ status: 'sent', updated_at: new Date().toISOString() })

  // Best-effort activity log, after the authoritative status write.
  if (proposalBeforeSend) {
    const title = proposalBeforeSend.title ?? 'Untitled proposal'
    await logActivity(orgId, {
      parent_type: 'opportunity',
      parent_id: proposalBeforeSend.lead_id,
      kind: 'proposal',
      summary: overrideReason
        ? `Proposal sent (send gate overridden — ${overrideReason}) — ${title}`
        : `Proposal sent — ${title}`,
    })
  }

  // Voice capture (redesign spec §4): the sent document's final text becomes
  // few-shot voice material for future AI drafts. Best-effort — a capture
  // failure must never fail the send.
  try {
    const blocks = (snap?.exists ? ((snap.data() as Proposal).blocks ?? []) : []) as ProposalBlock[]
    const text = blocksToVoiceText(blocks)
    if (text.trim()) {
      const voiceRef = adminDb.collection('orgs').doc(orgId).collection('ai_voice').doc('examples')
      const voiceSnap = await voiceRef.get()
      const existing = (voiceSnap.exists ? (voiceSnap.data()?.examples ?? []) : []) as VoiceExample[]
      const title = (snap?.exists ? (snap.data() as Proposal).title : undefined) ?? 'Untitled proposal'
      await voiceRef.set({
        examples: pushVoiceExample(existing, {
          proposal_id: proposalId,
          title,
          text,
          sent_at: new Date().toISOString(),
        }),
      })
    }
  } catch {
    // non-fatal
  }
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

// The consolidated autosave action (spec §5): one debounced write covering
// title, notes, blocks, line items, packages, and discount/tax/deposit/gate/
// terms/expiry. Validation, normalization, and composed-price recompute live
// in the guard-free core; this wrapper only adds authorization.
export async function updateProposalDraft(
  orgId: string,
  proposalId: string,
  input: ProposalDraftInput,
): Promise<{ proposal: Proposal; adjustments: string[] }> {
  await assertOrgAdmin(orgId)
  return updateProposalDraftCore(orgId, proposalId, input)
}
