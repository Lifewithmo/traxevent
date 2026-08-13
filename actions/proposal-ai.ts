'use server'

import { getAnthropicClient } from '@/lib/ai/client'
import { prepareDraftRequest, finalizeDraft } from '@/lib/ai/draft-service'
import type { ProposalDraft } from '@/lib/ai/proposal-draft'

// Read-only by design: the draft lands in the editor as unsaved state and
// nothing persists until the admin saves through the normal block-editor
// path (which re-runs normalizeBlocks and the signed/voided guards). The
// only write here is the best-effort ai_usage log (inside finalizeDraft).
export async function generateProposalDraft(
  orgId: string,
  proposalId: string,
  notes: string,
): Promise<ProposalDraft> {
  const { requestParams } = await prepareDraftRequest(orgId, proposalId, notes)

  const client = getAnthropicClient()
  // Streaming transport for timeout safety on a long generation; the caller
  // still gets a single value via finalMessage() — no SSE plumbing in v1.
  const stream = client.beta.messages.stream(requestParams)
  const message = await stream.finalMessage()

  return finalizeDraft(orgId, message)
}
