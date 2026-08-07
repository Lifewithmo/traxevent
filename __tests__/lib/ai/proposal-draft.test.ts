import { describe, it, expect } from 'vitest'
import { PROPOSAL_DRAFT_SCHEMA, parseDraftResponse, mintSuggestedPackages } from '@/lib/ai/proposal-draft'
import type { SuggestedPackageDraft } from '@/lib/ai/proposal-draft'

function msg(payload: unknown, stop_reason = 'end_turn') {
  return { stop_reason, content: [{ type: 'text', text: JSON.stringify(payload) }] }
}

const GOOD = {
  blocks: [
    { id: 'b1', type: 'heading', text: 'Your wedding bar service', level: 2 },
    { id: 'b2', type: 'paragraph', text: 'Thanks for reaching out about your July event.' },
  ],
  suggested_packages: [
    {
      name: 'Standard bar',
      description: 'Our most popular setup',
      recommended: true,
      items: [
        { description: 'Bar setup & teardown', quantity: 1, unit_price: 250 },
        { description: 'Bartender', quantity: 5, unit_price: 60 },
        { description: 'Glassware upgrade', quantity: 1, unit_price: 120, optional: true },
      ],
    },
  ],
  rationale: 'Matched the coffee cart package from your notes.',
}

describe('PROPOSAL_DRAFT_SCHEMA', () => {
  it('is a strict object schema requiring blocks, suggested_packages, and rationale', () => {
    const s = PROPOSAL_DRAFT_SCHEMA as Record<string, unknown>
    expect(s.type).toBe('object')
    expect(s.additionalProperties).toBe(false)
    expect(s.required).toEqual(['blocks', 'suggested_packages', 'rationale'])
  })

  it('describes composed package suggestions with line items, not catalog ids', () => {
    const text = JSON.stringify(PROPOSAL_DRAFT_SCHEMA)
    expect(text).not.toContain('suggested_package_ids')
    expect(text).toContain('unit_price')
  })

  it('does not permit image blocks (the model has no real URLs)', () => {
    expect(JSON.stringify(PROPOSAL_DRAFT_SCHEMA)).not.toContain('"image"')
  })
})

describe('parseDraftResponse — stop_reason gates', () => {
  it('throws the refusal message on stop_reason refusal, before reading content', () => {
    expect(() => parseDraftResponse({ stop_reason: 'refusal', content: [] }))
      .toThrow(/declined/i)
  })

  it('throws the too-long message on stop_reason max_tokens', () => {
    expect(() => parseDraftResponse({ stop_reason: 'max_tokens', content: [] }))
      .toThrow(/shorten your notes/i)
  })

  it('throws unreadable on a missing text block', () => {
    expect(() => parseDraftResponse({ stop_reason: 'end_turn', content: [] }))
      .toThrow(/unreadable/i)
  })

  it('throws unreadable on malformed JSON', () => {
    expect(() =>
      parseDraftResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{nope' }] }),
    ).toThrow(/unreadable/i)
  })
})

describe('parseDraftResponse — validation', () => {
  it('returns normalized blocks, suggested packages, and rationale on a good response', () => {
    const r = parseDraftResponse(msg(GOOD))
    expect(r.blocks).toHaveLength(2)
    expect(r.blocks[0]).toMatchObject({ type: 'heading', text: 'Your wedding bar service' })
    expect(r.suggested_packages).toHaveLength(1)
    expect(r.suggested_packages[0]).toMatchObject({ name: 'Standard bar', recommended: true })
    expect(r.suggested_packages[0].items).toHaveLength(3)
    expect(r.rationale).toMatch(/coffee cart/i)
    expect(r.adjustments).toEqual([])
  })

  it('keeps at most 3 packages and reports the drop', () => {
    const pkg = GOOD.suggested_packages[0]
    const r = parseDraftResponse(msg({ ...GOOD, suggested_packages: [pkg, pkg, pkg, pkg] }))
    expect(r.suggested_packages).toHaveLength(3)
    expect(r.adjustments.some((a) => /3/.test(a))).toBe(true)
  })

  it('drops a nameless package and reports it', () => {
    const r = parseDraftResponse(msg({ ...GOOD, suggested_packages: [{ ...GOOD.suggested_packages[0], name: '  ' }] }))
    expect(r.suggested_packages).toEqual([])
    expect(r.adjustments.some((a) => /name/i.test(a))).toBe(true)
  })

  it('drops invalid items (empty description, non-finite numbers) and reports them', () => {
    const r = parseDraftResponse(msg({
      ...GOOD,
      suggested_packages: [{
        name: 'P',
        items: [
          { description: 'Kept', quantity: 1, unit_price: 10 },
          { description: '  ', quantity: 1, unit_price: 10 },
          { description: 'Bad qty', quantity: 'x', unit_price: 10 },
        ],
      }],
    }))
    expect(r.suggested_packages[0].items).toEqual([{ description: 'Kept', quantity: 1, unit_price: 10 }])
    expect(r.adjustments.length).toBe(2)
  })

  it('drops a package whose items all fail validation', () => {
    const r = parseDraftResponse(msg({
      ...GOOD,
      suggested_packages: [{ name: 'Empty', items: [{ description: '', quantity: 1, unit_price: 1 }] }],
    }))
    expect(r.suggested_packages).toEqual([])
    expect(r.adjustments.some((a) => /Empty/.test(a))).toBe(true)
  })

  it('runs blocks through normalizeBlocks — caps and drops apply to model output', () => {
    const r = parseDraftResponse(msg({ ...GOOD, blocks: [...GOOD.blocks, { id: 'b3', type: 'video', src: 'x' }] }))
    expect(r.blocks).toHaveLength(2)
    expect(r.adjustments.some((a) => /unsupported/i.test(a))).toBe(true)
  })

  it('tolerates a degraded response with empty fields', () => {
    const r = parseDraftResponse(msg({ blocks: [], suggested_packages: [], rationale: '' }))
    expect(r.blocks).toEqual([])
    expect(r.suggested_packages).toEqual([])
  })
})

describe('mintSuggestedPackages', () => {
  const suggested: SuggestedPackageDraft[] = [
    {
      name: 'Standard bar',
      description: 'Popular',
      recommended: true,
      items: [
        { description: 'Setup', quantity: 1, unit_price: 250 },
        { description: 'Bartender', quantity: 5, unit_price: 60 },
        { description: 'Glassware', quantity: 1, unit_price: 120, optional: true },
      ],
    },
  ]
  const minter = () => {
    let n = 0
    return () => `ai-${n++}`
  }

  it('mints pool items and packages with resolvable unique ids', () => {
    const { packages, line_items } = mintSuggestedPackages(suggested, minter())
    const ids = line_items.map((i) => i.id)
    expect(new Set(ids).size).toBe(3)
    expect(packages).toHaveLength(1)
    for (const ref of packages[0].item_ids!) expect(ids).toContain(ref)
  })

  it('splits members from optional add-ons: optional items stay out of item_ids', () => {
    const { packages, line_items } = mintSuggestedPackages(suggested, minter())
    expect(packages[0].item_ids).toHaveLength(2)
    const optional = line_items.find((i) => i.description === 'Glassware')
    expect(optional?.optional).toBe(true)
    expect(packages[0].item_ids).not.toContain(optional!.id)
  })

  it('computes the denormalized price from members only, with no override', () => {
    const { packages } = mintSuggestedPackages(suggested, minter())
    expect(packages[0].price).toBe(250 + 300)
    expect(packages[0].price_override).toBeUndefined()
    expect(packages[0].includes).toEqual([])
    expect(packages[0]).toMatchObject({ name: 'Standard bar', description: 'Popular', recommended: true })
  })
})
