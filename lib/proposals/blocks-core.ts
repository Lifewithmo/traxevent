import { adminDb } from '@/lib/firebase-admin'
import { normalizeBlocks } from '@/lib/proposals/blocks'
import type { Proposal, ProposalBlock } from '@/lib/types'

/**
 * Guard-free block write. Mirrors lib/crm/invoices.ts: no auth assertions here
 * so an unauthenticated context (increment 2's generator preview) can compose it.
 * The caller is responsible for authorization.
 *
 * Returns the blocks it actually WROTE, not the caller's input. normalizeBlocks
 * drops blocks whose required content is missing, and it cannot report every
 * drop through `adjustments` (a half-filled block is an ordinary editing state,
 * not an anomaly worth a warning). An editor that kept rendering its own
 * pre-normalization array would therefore show blocks that no longer exist in
 * Firestore. Handing back the persisted truth makes that mismatch impossible.
 */
export async function updateProposalBlocksCore(
  orgId: string,
  proposalId: string,
  blocks: unknown,
): Promise<{ blocks: ProposalBlock[]; adjustments: string[] }> {
  const ref = adminDb.collection('orgs').doc(orgId).collection('proposals').doc(proposalId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Proposal not found')

  const data = snap.data() as Proposal
  if (data.signature || data.pending_signature) {
    throw new Error('This proposal is signed and can no longer be edited')
  }
  // Voiding is enforced through the admin UI everywhere else in the proposal
  // editor; the block editor is the one write path that reached Firestore
  // without an equivalent server-side check. A voided proposal's document is
  // still served publicly at its token, so an unguarded write here would let
  // an admin alter a revoked offer.
  if (data.status === 'voided') {
    throw new Error('This proposal is voided and can no longer be edited')
  }

  const { blocks: normalized, adjustments } = normalizeBlocks(blocks)
  await ref.update({ blocks: normalized, updated_at: new Date().toISOString() })
  return { blocks: normalized, adjustments }
}
