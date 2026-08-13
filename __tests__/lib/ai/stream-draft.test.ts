import { describe, it, expect } from 'vitest'
import { extractStreamedBlocks } from '@/lib/ai/stream-draft'

describe('extractStreamedBlocks', () => {
  it('returns [] before the blocks array opens', () => {
    expect(extractStreamedBlocks('{"bl')).toEqual([])
  })
  it('returns each complete block object, ignoring the trailing partial', () => {
    const partial = '{"blocks":[{"id":"a","type":"heading","text":"Hi","level":2},{"id":"b","type":"paragraph","text":"Wor'
    const out = extractStreamedBlocks(partial)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ type: 'heading', text: 'Hi' })
  })
  it('handles nested braces and escaped quotes inside strings', () => {
    const partial = '{"blocks":[{"id":"a","type":"paragraph","text":"a \\"quote\\" and {brace}"} , {"id":"b"'
    const out = extractStreamedBlocks(partial)
    expect(out).toHaveLength(1)
    expect((out[0] as { text: string }).text).toContain('"quote"')
  })
  it('stops at the end of the blocks array', () => {
    const full = '{"blocks":[{"id":"a","type":"paragraph","text":"x"}],"suggested_packages":[{"name":"n","items":[]}],"rationale":"r"}'
    expect(extractStreamedBlocks(full)).toHaveLength(1)
  })
})
