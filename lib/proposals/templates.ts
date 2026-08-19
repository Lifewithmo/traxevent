// Pure copy helpers between proposal drafts and proposal templates
// (spec 2026-08-13 §5): explicit allowlist, ids and placeholder flags copied
// verbatim — ids only need uniqueness within one document, and preserving
// them keeps package item_ids references intact.
import type { ProposalTemplate } from '@/lib/types'
import type { ProposalDraftInput, ProposalDraftUpdate } from '@/lib/proposals/draft'

export const TEMPLATE_CONTENT_FIELDS = [
  'blocks',
  'sections',
  'line_items',
  'packages',
  'discount',
  'tax_rate',
  'deposit',
  'deposit_gate',
  'deposit_terms',
  'terms',
  'notes',
] as const

export type TemplateContentField = (typeof TEMPLATE_CONTENT_FIELDS)[number]

export type TemplateContent = Pick<ProposalTemplate, TemplateContentField>

/** Snapshot a builder draft's content fields for a template. Proposal-only
 *  fields (title, expires_at) are dropped; undefined values are omitted so
 *  the result is Firestore-safe. */
export function templateContentFromDraft(d: ProposalDraftUpdate): TemplateContent {
  const content: Record<string, unknown> = {}
  for (const key of TEMPLATE_CONTENT_FIELDS) {
    const v = d[key]
    if (v !== undefined) content[key] = v
  }
  return content as TemplateContent
}

/** Expand a template into the full-state draft for a fresh proposal. The
 *  CRM-autofilled title is kept; the template's terms win over the org
 *  default already seeded by createProposal; expires_at is never emitted
 *  (expiry is a per-proposal decision). */
export function proposalDraftFromTemplate(
  t: ProposalTemplate,
  opts: { title: string; fallbackTerms?: string }
): ProposalDraftInput {
  const draft: ProposalDraftInput = { title: opts.title }
  for (const key of TEMPLATE_CONTENT_FIELDS) {
    const v = t[key]
    if (v !== undefined) (draft as Record<string, unknown>)[key] = v
  }
  if (draft.terms === undefined && opts.fallbackTerms !== undefined) {
    draft.terms = opts.fallbackTerms
  }
  return draft
}
