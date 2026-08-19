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

  it('flags an empty document once placeholders are stripped', () => {
    const blocks = [{ id: 'b1', type: 'paragraph' as const, text: 'x', placeholder: true }]
    expect(evaluateSendGate({ ...ok, blocks }, NOW)).toContain('empty_document')
  })

  it('has a human message for every check it can return', () => {
    const all = evaluateSendGate({ line_items: [], blocks: [], expires_at: '2026-01-01' }, NOW)
    for (const check of all) expect(SEND_GATE_MESSAGES[check]).toBeTruthy()
  })
})
