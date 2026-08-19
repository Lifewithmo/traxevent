import { describe, it, expect } from 'vitest'
import { evaluateSendGate, SEND_GATE_MESSAGES } from '@/lib/proposals/send-gate'

const NOW = new Date('2026-08-18T12:00:00Z')
const ok = {
  line_items: [{ id: 'i1', description: 'Cart', quantity: 1, unit_price: 500 }],
  blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'Real content' }],
}

describe('evaluateSendGate', () => {
  it('passes a complete proposal', () => {
    expect(evaluateSendGate(ok, NOW)).toEqual([])
  })

  it('flags a proposal with no price', () => {
    expect(evaluateSendGate({ ...ok, line_items: [] }, NOW)).toContain('no_price')
  })

  it('flags remaining placeholder blocks', () => {
    const blocks = [...ok.blocks, { id: 'b2', type: 'heading' as const, text: 'TBD', placeholder: true }]
    expect(evaluateSendGate({ ...ok, blocks }, NOW)).toContain('placeholders')
  })

  it('flags an already-expired proposal', () => {
    expect(evaluateSendGate({ ...ok, expires_at: '2026-08-01' }, NOW)).toContain('expired')
  })

  it('does not flag a future expiry', () => {
    expect(evaluateSendGate({ ...ok, expires_at: '2026-12-01' }, NOW)).not.toContain('expired')
  })

  it('does not flag an unparseable expiry (proposalExpiryInstant returns Infinity)', () => {
    expect(evaluateSendGate({ ...ok, expires_at: 'not-a-date' }, NOW)).not.toContain('expired')
  })

  it('flags an empty document once placeholders are stripped', () => {
    const blocks = [{ id: 'b1', type: 'paragraph' as const, text: 'x', placeholder: true }]
    expect(evaluateSendGate({ ...ok, blocks }, NOW)).toContain('empty_document')
  })

  it('has a human message for every check it can return', () => {
    const all = evaluateSendGate({ line_items: [], blocks: [], expires_at: '2026-01-01' }, NOW)
    for (const check of all) expect(SEND_GATE_MESSAGES[check]).toBeTruthy()
  })

  // Regression: the gate previously read only `p.blocks`, which is empty for
  // any proposal authored through the archetype layer (`p.sections`) — full
  // content there was invisible to `empty_document`, and a placeholder
  // inside a section's blocks passed unchecked. Unreachable today (nothing
  // authors `sections` yet), but this is a money gate and increment 2 hits
  // it immediately.
  describe('sections-authored proposals', () => {
    const sectionsOk = {
      line_items: [{ id: 'i1', description: 'Cart', quantity: 1, unit_price: 500 }],
      blocks: [],
      sections: [
        { id: 's1', type: 'prose' as const, blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'Real content' }] },
        { id: 's2', type: 'investment' as const },
        { id: 's3', type: 'accept' as const },
      ],
    }

    it('passes a full sections-authored proposal — not blind to `blocks: []`', () => {
      expect(evaluateSendGate(sectionsOk, NOW)).toEqual([])
    })

    it('flags a placeholder block nested inside a section', () => {
      const sections = [
        {
          id: 's1',
          type: 'prose' as const,
          blocks: [{ id: 'b1', type: 'heading' as const, text: 'TBD', placeholder: true as const }],
        },
      ]
      expect(evaluateSendGate({ ...sectionsOk, sections }, NOW)).toContain('placeholders')
    })

    it('flags a section-level `placeholder: true`, even with visible blocks inside it', () => {
      const sections = [
        {
          id: 's1',
          type: 'letter' as const,
          placeholder: true as const,
          blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'Skeleton copy' }],
        },
      ]
      expect(evaluateSendGate({ ...sectionsOk, sections }, NOW)).toContain('placeholders')
    })

    it('flags an empty document when every section is placeholder-only', () => {
      const sections = [
        {
          id: 's1',
          type: 'prose' as const,
          blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'x', placeholder: true as const }],
        },
      ]
      expect(evaluateSendGate({ ...sectionsOk, sections }, NOW)).toContain('empty_document')
    })
  })
})
