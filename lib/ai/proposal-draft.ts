// Pure request/response shapes for proposal drafting — no SDK, no DB imports.
// The action (actions/proposal-ai.ts) owns I/O; this module owns validation.
import { normalizeBlocks } from '@/lib/proposals/blocks'
import type { ProposalBlock } from '@/lib/types'

// Raw JSON Schema for output_config.format. Structured outputs cannot express
// minLength/maxLength/array-length caps, so this schema is NOT the enforcement
// point — normalizeBlocks re-validates every response (caps, drops, ids).
// The block union deliberately excludes `image`: the model has no real URLs.
const HEADING = {
  type: 'object', additionalProperties: false,
  required: ['id', 'type', 'text', 'level'],
  properties: {
    id: { type: 'string' }, type: { const: 'heading' },
    text: { type: 'string' }, level: { type: 'integer', enum: [2, 3] },
  },
}
const PARAGRAPH = {
  type: 'object', additionalProperties: false,
  required: ['id', 'type', 'text'],
  properties: { id: { type: 'string' }, type: { const: 'paragraph' }, text: { type: 'string' } },
}
const LIST = {
  type: 'object', additionalProperties: false,
  required: ['id', 'type', 'items'],
  properties: {
    id: { type: 'string' }, type: { const: 'list' },
    items: { type: 'array', items: { type: 'string' } },
    ordered: { type: 'boolean' },
  },
}
const TESTIMONIAL = {
  type: 'object', additionalProperties: false,
  required: ['id', 'type', 'quote'],
  properties: {
    id: { type: 'string' }, type: { const: 'testimonial' },
    quote: { type: 'string' }, attribution: { type: 'string' },
  },
}

export const PROPOSAL_DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['blocks', 'suggested_package_ids', 'rationale'],
  properties: {
    blocks: { type: 'array', items: { anyOf: [HEADING, PARAGRAPH, LIST, TESTIMONIAL] } },
    suggested_package_ids: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
  },
} as const

export interface DraftMessage {
  stop_reason: string | null
  content: Array<{ type: string; text?: string }>
}

export interface DraftResult {
  blocks: ProposalBlock[]
  suggested_package_ids: string[]
  rationale: string
  adjustments: string[]
}

export function parseDraftResponse(message: DraftMessage, validPackageIds: string[]): DraftResult {
  // stop_reason is checked BEFORE content: a refusal has empty/partial
  // content, and max_tokens means truncated (unparseable) JSON.
  if (message.stop_reason === 'refusal') {
    throw new Error('The AI declined to draft from these notes. Try rephrasing them.')
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Draft too long — shorten your notes.')
  }

  const textBlock = message.content.find((b) => b.type === 'text' && typeof b.text === 'string')
  if (!textBlock?.text) throw new Error('The AI returned an unreadable draft. Try again.')

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(textBlock.text) as Record<string, unknown>
  } catch {
    throw new Error('The AI returned an unreadable draft. Try again.')
  }

  // Our own guards re-validate the parsed object — required, not defensive
  // duplication (the schema cannot express the caps normalizeBlocks enforces).
  const { blocks, adjustments } = normalizeBlocks(payload.blocks)

  const valid = new Set(validPackageIds)
  const rawIds = Array.isArray(payload.suggested_package_ids)
    ? payload.suggested_package_ids.filter((x): x is string => typeof x === 'string')
    : []
  const suggested = rawIds.filter((id) => valid.has(id))
  for (const id of rawIds) {
    if (!valid.has(id)) adjustments.push(`Dropped a suggested package not in your catalog: "${id}".`)
  }

  const rationale = typeof payload.rationale === 'string' ? payload.rationale : ''
  return { blocks, suggested_package_ids: suggested, rationale, adjustments }
}
