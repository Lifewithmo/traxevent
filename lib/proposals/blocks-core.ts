import { adminDb } from '@/lib/firebase-admin'
import { normalizeBlocks } from '@/lib/proposals/blocks'
import type { Proposal } from '@/lib/types'

/**
 * Guard-free block write. Mirrors lib/crm/invoices.ts: no auth assertions here
 * so an unauthenticated context (increment 2's generator preview) can compose it.
 * The caller is responsible for authorization.
 */
export async function updateProposalBlocksCore(
  orgId: string,
  proposalId: string,
  blocks: unknown,
): Promise<{ adjustments: string[] }> {
  const ref = adminDb.collection('orgs').doc(orgId).collection('proposals').doc(proposalId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Proposal not found')

  const data = snap.data() as Proposal
  if (data.signature || data.pending_signature) {
    throw new Error('This proposal is signed and can no longer be edited')
  }

  const { blocks: normalized, adjustments } = normalizeBlocks(blocks)
  await ref.update({ blocks: normalized, updated_at: new Date().toISOString() })
  return { adjustments }
}
