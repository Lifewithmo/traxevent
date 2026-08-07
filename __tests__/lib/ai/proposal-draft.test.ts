import { describe, it, expect } from 'vitest'
import { PROPOSAL_DRAFT_SCHEMA, parseDraftResponse } from '@/lib/ai/proposal-draft'

function msg(payload: unknown, stop_reason = 'end_turn') {
  return { stop_reason, content: [{ type: 'text', text: JSON.stringify(payload) }] }
}

const GOOD = {
  blocks: [
    { id: 'b1', type: 'heading', text: 'Your wedding bar service', level: 2 },
    { id: 'b2', type: 'paragraph', text: 'Thanks for reaching out about your July event.' },
  ],
  suggested_package_ids: ['wp-a'],
  rationale: 'Matched the coffee cart package from your notes.',
}

describe('PROPOSAL_DRAFT_SCHEMA', () => {
  it('is a strict object schema requiring blocks, suggested_package_ids, and rationale', () => {
    const s = PROPOSAL_DRAFT_SCHEMA as Record<string, unknown>
    expect(s.type).toBe('object')
    expect(s.additionalProperties).toBe(false)
    expect(s.required).toEqual(['blocks', 'suggested_package_ids', 'rationale'])
  })

  it('does not permit image blocks (the model has no real URLs)', () => {
    expect(JSON.stringify(PROPOSAL_DRAFT_SCHEMA)).not.toContain('"image"')
  })
})

describe('parseDraftResponse — stop_reason gates', () => {
  it('throws the refusal message on stop_reason refusal, before reading content', () => {
    expect(() => parseDraftResponse({ stop_reason: 'refusal', content: [] }, []))
      .toThrow(/declined/i)
  })

  it('throws the too-long message on stop_reason max_tokens', () => {
    expect(() => parseDraftResponse({ stop_reason: 'max_tokens', content: [] }, []))
      .toThrow(/shorten your notes/i)
  })

  it('throws unreadable on a missing text block', () => {
    expect(() => parseDraftResponse({ stop_reason: 'end_turn', content: [] }, []))
      .toThrow(/unreadable/i)
  })

  it('throws unreadable on malformed JSON', () => {
    expect(() =>
      parseDraftResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{nope' }] }, []),
    ).toThrow(/unreadable/i)
  })
})

describe('parseDraftResponse — validation', () => {
  it('returns normalized blocks, valid ids, and rationale on a good response', () => {
    const r = parseDraftResponse(msg(GOOD), ['wp-a', 'wp-b'])
    expect(r.blocks).toHaveLength(2)
    expect(r.blocks[0]).toMatchObject({ type: 'heading', text: 'Your wedding bar service' })
    expect(r.suggested_package_ids).toEqual(['wp-a'])
    expect(r.rationale).toMatch(/coffee cart/i)
    expect(r.adjustments).toEqual([])
  })

  it('drops unknown package ids and reports them, keeping the draft', () => {
    const r = parseDraftResponse(
      msg({ ...GOOD, suggested_package_ids: ['wp-a', 'wp-fake'] }),
      ['wp-a'],
    )
    expect(r.suggested_package_ids).toEqual(['wp-a'])
    expect(r.adjustments.some((a) => a.includes('wp-fake'))).toBe(true)
    expect(r.blocks).toHaveLength(2)
  })

  it('runs blocks through normalizeBlocks — caps and drops apply to model output', () => {
    const r = parseDraftResponse(
      msg({ ...GOOD, blocks: [...GOOD.blocks, { id: 'b3', type: 'video', src: 'x' }] }),
      ['wp-a'],
    )
    expect(r.blocks).toHaveLength(2) // unsupported type dropped by normalizeBlocks
    expect(r.adjustments.some((a) => /unsupported/i.test(a))).toBe(true)
  })

  it('tolerates missing optional-shaped fields from a degraded response', () => {
    const r = parseDraftResponse(msg({ blocks: [], suggested_package_ids: [], rationale: '' }), [])
    expect(r.blocks).toEqual([])
    expect(r.suggested_package_ids).toEqual([])
  })
})
