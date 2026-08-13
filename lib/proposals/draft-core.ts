import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { normalizeProposalDraft, type ProposalDraftInput } from '@/lib/proposals/draft'
import type { Proposal } from '@/lib/types'

// The optional draft fields that follow full-state semantics: the builder
// always sends everything it edits, so an absent key means "the user cleared
// this" and must remove the stored value (Firestore rejects raw undefined;
// dropping the key would leave stale data behind).
const CLEARABLE_FIELDS = [
  'title',
  'notes',
  'packages',
  'discount',
  'tax_rate',
  'deposit',
  'expires_at',
  'deposit_gate',
  'deposit_terms',
  'terms',
] as const

/**
 * Guard-free consolidated draft write (spec §5) — the single autosave path
 * for title, notes, blocks, line items, packages, and pricing terms.
 * No auth assertions here; the caller owns authorization (house core pattern).
 *
 * Returns the draft it actually WROTE (normalized, composed prices
 * recomputed) plus adjustments, so the editor can re-seed its state from the
 * persisted truth — never from its own pre-normalization input.
 */
export async function updateProposalDraftCore(
  orgId: string,
  proposalId: string,
  input: ProposalDraftInput,
): Promise<{ proposal: Proposal; adjustments: string[] }> {
  const ref = adminDb.collection('orgs').doc(orgId).collection('proposals').doc(proposalId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Proposal not found')

  const data = snap.data() as Proposal
  if (data.signature || data.pending_signature) {
    throw new Error('This proposal is signed and can no longer be edited')
  }
  // A voided proposal's document is still served publicly at its token; an
  // unguarded write here would let an admin alter a revoked offer.
  if (data.status === 'voided') {
    throw new Error('This proposal is voided and can no longer be edited')
  }

  const { draft, adjustments } = normalizeProposalDraft(input)
  const updated_at = new Date().toISOString()

  const update: Record<string, unknown> = {
    blocks: draft.blocks,
    line_items: draft.line_items,
    updated_at,
  }
  const persisted: Proposal = { ...data, blocks: draft.blocks, line_items: draft.line_items, updated_at }
  const persistedBag = persisted as unknown as Record<string, unknown>
  for (const key of CLEARABLE_FIELDS) {
    const value = draft[key]
    if (value === undefined) {
      update[key] = FieldValue.delete()
      delete persistedBag[key]
    } else {
      update[key] = value
      persistedBag[key] = value
    }
  }

  await ref.update(update)
  return { proposal: persisted, adjustments }
}
