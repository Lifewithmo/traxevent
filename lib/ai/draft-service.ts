import 'server-only'

// Server-only orchestration for proposal drafting, shared by the action
// (actions/proposal-ai.ts) and the streaming route handler
// (app/api/ai/proposal-draft/route.ts). Split into two halves so the route
// can stream text deltas between them: prepareDraftRequest does everything
// up to building the request params for client.beta.messages.stream, and
// finalizeDraft does everything after the model's final message arrives.
import { randomBytes } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'
import { assertOrgAdmin } from '@/lib/auth/assert'
import { listWorkPackagesCore } from '@/lib/ops/work-packages'
import { listResourcesCore } from '@/lib/ops/resources'
import { AI_MODEL, AI_MAX_TOKENS, AI_EFFORT, AI_BETAS, AI_FALLBACKS } from '@/lib/ai/client'
import { serializeCatalog, buildDraftSystemBlocks } from '@/lib/ai/grounding'
import { serializeVoice, type VoiceExample } from '@/lib/ai/voice'
import {
  PROPOSAL_DRAFT_SCHEMA,
  parseDraftResponse,
  mintSuggestedPackages,
  type ProposalDraft,
  type DraftMessage,
} from '@/lib/ai/proposal-draft'
import { logAiUsage } from '@/lib/ai/usage'
import type { Proposal, Org } from '@/lib/types'
import type Anthropic from '@anthropic-ai/sdk'

export interface DraftRequestBundle {
  requestParams: Parameters<Anthropic['beta']['messages']['stream']>[0]
  proposal: Proposal
}

// Read-only by design: the draft lands in the editor as unsaved state and
// nothing persists until the admin saves through the normal block-editor
// path (which re-runs normalizeBlocks and the signed/voided guards). The
// only write here is the best-effort ai_usage log (in finalizeDraft).
export async function prepareDraftRequest(
  orgId: string,
  proposalId: string,
  notes: string,
  modelOverride?: string,
): Promise<DraftRequestBundle> {
  await assertOrgAdmin(orgId)

  const trimmed = typeof notes === 'string' ? notes.trim() : ''
  if (!trimmed) throw new Error('Add some notes to draft from first.')

  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('proposals').doc(proposalId)
    .get()
  if (!snap.exists) throw new Error('Proposal not found')
  const proposal = snap.data() as Proposal

  const [packages, resources, voiceSnap, orgSnap] = await Promise.all([
    listWorkPackagesCore(orgId),
    listResourcesCore(orgId),
    adminDb.collection('orgs').doc(orgId).collection('ai_voice').doc('examples').get(),
    adminDb.collection('orgs').doc(orgId).get(),
  ])
  const examples = (voiceSnap.exists ? (voiceSnap.data()?.examples ?? []) : []) as VoiceExample[]
  const voiceText = serializeVoice(examples, (orgSnap.data() as Org | undefined)?.ai_voice_note)

  const requestParams = {
    model: modelOverride ?? AI_MODEL,
    max_tokens: AI_MAX_TOKENS,
    // Server-side refusal fallback is Opus-tier only — Sonnet 5 400s on the
    // parameter, so both fields are conditional on the configured model.
    ...(AI_FALLBACKS ? { betas: AI_BETAS, fallbacks: AI_FALLBACKS } : {}),
    output_config: {
      effort: AI_EFFORT,
      format: { type: 'json_schema', schema: PROPOSAL_DRAFT_SCHEMA },
    },
    system: buildDraftSystemBlocks(serializeCatalog(packages, resources), voiceText),
    messages: [{
      role: 'user',
      content: `Proposal context: title "${proposal.title ?? ''}", existing pricing notes "${proposal.notes ?? ''}".\n\nOperator notes to draft from:\n\n${trimmed}`,
    }],
  } as unknown as Parameters<Anthropic['beta']['messages']['stream']>[0]

  return { requestParams, proposal }
}

export async function finalizeDraft(
  orgId: string,
  message: DraftMessage & { usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null } },
): Promise<ProposalDraft> {
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
