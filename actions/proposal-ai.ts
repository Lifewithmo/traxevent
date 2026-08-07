'use server'

import { randomBytes } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'
import { assertOrgAdmin } from '@/lib/auth/assert'
import { listWorkPackagesCore } from '@/lib/ops/work-packages'
import { listResourcesCore } from '@/lib/ops/resources'
import { getAnthropicClient, AI_MODEL, AI_MAX_TOKENS, AI_EFFORT, AI_BETAS } from '@/lib/ai/client'
import { serializeCatalog, buildDraftSystemBlocks } from '@/lib/ai/grounding'
import { PROPOSAL_DRAFT_SCHEMA, parseDraftResponse, mintSuggestedPackages, type ProposalDraft } from '@/lib/ai/proposal-draft'
import { logAiUsage } from '@/lib/ai/usage'
import type { Proposal } from '@/lib/types'

// Read-only by design: the draft lands in the editor as unsaved state and
// nothing persists until the admin saves through the normal block-editor
// path (which re-runs normalizeBlocks and the signed/voided guards). The
// only write here is the best-effort ai_usage log.
export async function generateProposalDraft(
  orgId: string,
  proposalId: string,
  notes: string,
): Promise<ProposalDraft> {
  await assertOrgAdmin(orgId)

  const trimmed = typeof notes === 'string' ? notes.trim() : ''
  if (!trimmed) throw new Error('Add some notes to draft from first.')

  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('proposals').doc(proposalId)
    .get()
  if (!snap.exists) throw new Error('Proposal not found')
  const proposal = snap.data() as Proposal

  const [packages, resources] = await Promise.all([
    listWorkPackagesCore(orgId),
    listResourcesCore(orgId),
  ])

  const client = getAnthropicClient()
  // Streaming transport for timeout safety on a long generation; the caller
  // still gets a single value via finalMessage() — no SSE plumbing in v1.
  const stream = client.beta.messages.stream({
    model: AI_MODEL,
    max_tokens: AI_MAX_TOKENS,
    betas: AI_BETAS,
    fallbacks: 'default',
    output_config: {
      effort: AI_EFFORT,
      format: { type: 'json_schema', schema: PROPOSAL_DRAFT_SCHEMA },
    },
    system: buildDraftSystemBlocks(serializeCatalog(packages, resources)),
    messages: [{
      role: 'user',
      content: `Proposal context: title "${proposal.title ?? ''}", existing pricing notes "${proposal.notes ?? ''}".\n\nOperator notes to draft from:\n\n${trimmed}`,
    }],
  })

  const message = await stream.finalMessage()

  // Log before parsing: a refusal or truncation still consumed tokens.
  await logAiUsage(orgId, 'proposal_draft', {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
  })

  const draft = parseDraftResponse(message)

  // Pricing model v2: suggestions arrive as composed tiers with line items.
  // Every id is minted HERE, server-side — the model's output carries none —
  // so suggested item_ids can only reference the suggested pool items, never
  // real document state. randomBytes keeps ids unguessable and collision-free.
  const { packages: suggested_packages, line_items: suggested_line_items } = mintSuggestedPackages(
    draft.suggested_packages,
    () => `ai-${randomBytes(4).toString('hex')}`,
  )

  return { ...draft, suggested_packages, suggested_line_items }
}
