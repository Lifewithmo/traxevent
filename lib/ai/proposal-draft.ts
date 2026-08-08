// Pure request/response shapes for proposal drafting — no SDK, no DB imports.
// The action (actions/proposal-ai.ts) owns I/O; this module owns validation.
import { normalizeBlocks } from '@/lib/proposals/blocks'
import type { ProposalBlock, ProposalLineItem, ProposalPackage } from '@/lib/types'

export const MAX_SUGGESTED_PACKAGES = 3

// Raw JSON Schema for output_config.format. Structured outputs cannot express
// minLength/maxLength/array-length caps, so this schema is NOT the enforcement
// point — normalizeBlocks + parseDraftResponse re-validate every response.
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

// Pricing model v2: the model proposes whole composed tiers — name plus line
// items — not references into the org catalog. Ids are deliberately absent
// from this schema: the server mints every id (mintSuggestedPackages) so the
// model can never collide with, or point at, real document state.
const SUGGESTED_ITEM = {
  type: 'object', additionalProperties: false,
  required: ['description', 'quantity', 'unit_price'],
  properties: {
    description: { type: 'string' },
    quantity: { type: 'number' },
    unit_price: { type: 'number' },
    optional: { type: 'boolean' },
  },
}
const SUGGESTED_PACKAGE = {
  type: 'object', additionalProperties: false,
  required: ['name', 'items'],
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    recommended: { type: 'boolean' },
    items: { type: 'array', items: SUGGESTED_ITEM },
  },
}

export const PROPOSAL_DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['blocks', 'suggested_packages', 'rationale'],
  properties: {
    blocks: { type: 'array', items: { anyOf: [HEADING, PARAGRAPH, LIST, TESTIMONIAL] } },
    suggested_packages: { type: 'array', items: SUGGESTED_PACKAGE },
    rationale: { type: 'string' },
  },
} as const

export interface DraftMessage {
  stop_reason: string | null
  content: Array<{ type: string; text?: string }>
}

export interface SuggestedItemDraft {
  description: string
  quantity: number
  unit_price: number
  optional?: boolean
}

export interface SuggestedPackageDraft {
  name: string
  description?: string
  recommended?: boolean
  items: SuggestedItemDraft[]
}

export interface DraftResult {
  blocks: ProposalBlock[]
  suggested_packages: SuggestedPackageDraft[]
  rationale: string
  adjustments: string[]
}

// Enriched shape returned by the action: suggestions become ready-to-apply
// document state — pool line items plus composed packages whose item_ids
// reference them — with every id minted server-side (never model-authored).
// `suggested_packages` entries are full ProposalPackages, so existing readers
// of id/name/price (ProposalAiPanel) keep working; nothing persists until the
// operator applies the draft and it flows through updateProposalDraft.
export interface ProposalDraft extends Omit<DraftResult, 'suggested_packages'> {
  suggested_packages: ProposalPackage[]
  suggested_line_items: ProposalLineItem[]
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function normalizeSuggestedPackages(input: unknown, adjustments: string[]): SuggestedPackageDraft[] {
  if (!Array.isArray(input)) return []

  const capped = input.slice(0, MAX_SUGGESTED_PACKAGES)
  if (input.length > capped.length) {
    adjustments.push(`Kept the first ${MAX_SUGGESTED_PACKAGES} suggested packages and dropped ${input.length - capped.length}.`)
  }

  const packages: SuggestedPackageDraft[] = []
  for (const raw of capped) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const name = str(r.name).trim()
    if (!name) {
      adjustments.push('Dropped a suggested package with no name.')
      continue
    }

    const items: SuggestedItemDraft[] = []
    for (const rawItem of Array.isArray(r.items) ? r.items : []) {
      if (!rawItem || typeof rawItem !== 'object') continue
      const i = rawItem as Record<string, unknown>
      const description = str(i.description).trim()
      if (!description || !finite(i.quantity) || !finite(i.unit_price)) {
        adjustments.push(`Dropped an invalid line item from suggested package "${name}".`)
        continue
      }
      items.push({
        description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        ...(i.optional === true ? { optional: true } : {}),
      })
    }
    if (items.length === 0) {
      adjustments.push(`Dropped suggested package "${name}" — it had no usable line items.`)
      continue
    }

    const description = str(r.description).trim()
    packages.push({
      name,
      ...(description ? { description } : {}),
      ...(r.recommended === true ? { recommended: true } : {}),
      items,
    })
  }
  return packages
}

export function parseDraftResponse(message: DraftMessage): DraftResult {
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
  // duplication (the schema cannot express the caps enforced here).
  const { blocks, adjustments } = normalizeBlocks(payload.blocks)
  const suggested_packages = normalizeSuggestedPackages(payload.suggested_packages, adjustments)

  const rationale = typeof payload.rationale === 'string' ? payload.rationale : ''
  return { blocks, suggested_packages, rationale, adjustments }
}

/**
 * Turn validated suggestions into ready-to-apply document state. Pure — the
 * caller injects the id minter (the action uses randomBytes) so this stays
 * deterministic under test. Non-optional items become tier members
 * (`item_ids`, in suggestion order); `optional: true` items become
 * tier-independent add-ons in the pool, per the v2 model. The denormalized
 * price is the member sum; AI never sets price_override (spec §1).
 */
export function mintSuggestedPackages(
  suggested: SuggestedPackageDraft[],
  mintId: () => string,
): { packages: ProposalPackage[]; line_items: ProposalLineItem[] } {
  const line_items: ProposalLineItem[] = []
  const packages: ProposalPackage[] = []

  for (const pkg of suggested) {
    const itemIds: string[] = []
    let sum = 0
    for (const item of pkg.items) {
      const id = mintId()
      const optional = item.optional === true
      line_items.push({
        id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        ...(optional ? { optional: true } : {}),
      })
      if (!optional) {
        itemIds.push(id)
        if (item.quantity > 0 && item.unit_price > 0) {
          sum += round2(item.quantity * item.unit_price)
        }
      }
    }
    packages.push({
      id: mintId(),
      name: pkg.name,
      ...(pkg.description ? { description: pkg.description } : {}),
      includes: [], // never written for composed packages
      price: round2(sum),
      item_ids: itemIds,
      ...(pkg.recommended ? { recommended: true } : {}),
    })
  }

  return { packages, line_items }
}
