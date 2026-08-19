import { describe, it, expect } from 'vitest'
import { templateContentFromDraft, proposalDraftFromTemplate } from '@/lib/proposals/templates'
import type { ProposalTemplate, ProposalBlock } from '@/lib/types'

const blocks: ProposalBlock[] = [
  { id: 'b1', type: 'heading', text: 'Cover', level: 2 },
  { id: 'b2', type: 'paragraph', text: 'Guidance text', placeholder: true },
]

function template(over: Partial<ProposalTemplate> = {}): ProposalTemplate {
  return {
    id: 't1', org_id: 'o1', name: 'Standard wedding', line_items: [], created_at: 'x', ...over,
  }
}

describe('templateContentFromDraft', () => {
  it('picks only content fields and drops undefined', () => {
    const content = templateContentFromDraft({
      title: 'Acme — Gala',
      notes: 'internal',
      blocks,
      line_items: [{ id: 'li1', description: 'Espresso bar', quantity: 1, unit_price: 500 }],
      packages: [{ id: 'p1', name: 'Good', includes: [], price: 500, item_ids: ['li1'] }],
      tax_rate: 8.25,
      expires_at: '2026-09-01',
    })
    expect(content).not.toHaveProperty('title')
    expect(content).not.toHaveProperty('expires_at')
    expect(content).not.toHaveProperty('discount')
    expect(content.notes).toBe('internal')
    expect(content.blocks).toEqual(blocks)
    expect(content.blocks![1].placeholder).toBe(true)
    expect(content.packages![0].item_ids).toEqual(['li1'])
    expect(content.tax_rate).toBe(8.25)
  })

  // Regression: `sections` (the archetype layer) was declared on
  // ProposalTemplate but missing from TEMPLATE_CONTENT_FIELDS, so
  // save-as-template silently dropped the document body for any proposal
  // authored in sections.
  it('carries sections through, once they exist', () => {
    const sections = [{ id: 's1', type: 'prose' as const, blocks }]
    const content = templateContentFromDraft({ title: 'x', sections })
    expect(content.sections).toEqual(sections)
  })
})

describe('proposalDraftFromTemplate', () => {
  it('copies content verbatim with the given title', () => {
    const t = template({
      blocks,
      line_items: [{ id: 'li1', description: 'Espresso bar', quantity: 1, unit_price: 500 }],
      terms: 'Template terms',
    })
    const draft = proposalDraftFromTemplate(t, { title: 'Acme — Gala', fallbackTerms: 'Org terms' })
    expect(draft.title).toBe('Acme — Gala')
    expect(draft.terms).toBe('Template terms')
    expect(draft.blocks).toEqual(blocks)
    expect((draft.line_items as { id?: string }[])[0].id).toBe('li1')
    expect(draft).not.toHaveProperty('expires_at')
  })

  it('copies sections through, once they exist', () => {
    const sections = [{ id: 's1', type: 'prose' as const, blocks }]
    const t = template({ sections })
    const draft = proposalDraftFromTemplate(t, { title: 'T' })
    expect(draft.sections).toEqual(sections)
  })

  it('falls back to org default terms when the template has none', () => {
    const draft = proposalDraftFromTemplate(template(), { title: 'T', fallbackTerms: 'Org terms' })
    expect(draft.terms).toBe('Org terms')
  })

  it('omits terms entirely when neither source has them', () => {
    const draft = proposalDraftFromTemplate(template(), { title: 'T' })
    expect(draft).not.toHaveProperty('terms')
  })
})
