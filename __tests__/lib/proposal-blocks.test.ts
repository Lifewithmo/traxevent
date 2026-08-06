import { describe, it, expect } from 'vitest'
import {
  normalizeBlocks, parseInline,
  MAX_BLOCKS, MAX_PARAGRAPH_CHARS, MAX_LIST_ITEMS, MAX_LIST_ITEM_CHARS,
} from '@/lib/proposals/blocks'

describe('normalizeBlocks', () => {
  it('returns empty for non-array input', () => {
    expect(normalizeBlocks(undefined).blocks).toEqual([])
    expect(normalizeBlocks('nope').blocks).toEqual([])
  })

  it('keeps a valid block of each type', () => {
    const input = [
      { id: 'a', type: 'heading', text: 'Hi', level: 2 },
      { id: 'b', type: 'paragraph', text: 'Body' },
      { id: 'c', type: 'list', items: ['one', 'two'], ordered: true },
      { id: 'd', type: 'image', url: 'https://x/y.png', alt: 'Y' },
      { id: 'e', type: 'testimonial', quote: 'Great', attribution: 'Dana' },
    ]
    const { blocks, adjustments } = normalizeBlocks(input)
    expect(blocks).toHaveLength(5)
    expect(adjustments).toEqual([])
  })

  it('drops unknown block types and reports it', () => {
    const { blocks, adjustments } = normalizeBlocks([{ id: 'a', type: 'video', url: 'x' }])
    expect(blocks).toEqual([])
    expect(adjustments[0]).toMatch(/video/)
  })

  it('drops blocks whose required fields are missing or blank', () => {
    const { blocks } = normalizeBlocks([
      { id: 'a', type: 'heading', text: '   ' },
      { id: 'b', type: 'image' },
      { id: 'c', type: 'list', items: [] },
    ])
    expect(blocks).toEqual([])
  })

  it('assigns an id when missing and de-duplicates repeats', () => {
    const { blocks } = normalizeBlocks([
      { type: 'paragraph', text: 'one' },
      { id: 'dup', type: 'paragraph', text: 'two' },
      { id: 'dup', type: 'paragraph', text: 'three' },
    ])
    expect(blocks[0].id).toBe('blk-0')
    expect(blocks[1].id).toBe('dup')
    expect(blocks[2].id).toBe('blk-2')
  })

  it('never lets a generated fallback id collide with a supplied one', () => {
    // The fallback is `blk-<index>`, so a block that legitimately CARRIES the
    // id `blk-1` collides with the fallback minted for the block at index 1.
    // Unreachable from today's editor, but increment 2's AI generator becomes
    // a producer of externally-authored ids.
    const { blocks } = normalizeBlocks([
      { id: 'blk-1', type: 'paragraph', text: 'one' },
      { type: 'paragraph', text: 'two' },
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[0].id).toBe('blk-1')
    expect(new Set(blocks.map((b) => b.id)).size).toBe(2)
  })

  it('resolves a chain of fallback collisions', () => {
    const { blocks } = normalizeBlocks([
      { id: 'blk-1', type: 'paragraph', text: 'one' },
      { id: 'blk-2', type: 'paragraph', text: 'two' },
      { type: 'paragraph', text: 'three' },
    ])
    expect(new Set(blocks.map((b) => b.id)).size).toBe(3)
  })

  it('truncates to MAX_BLOCKS and reports it', () => {
    const many = Array.from({ length: MAX_BLOCKS + 5 }, (_, i) => ({
      id: `b${i}`, type: 'paragraph', text: 'x',
    }))
    const { blocks, adjustments } = normalizeBlocks(many)
    expect(blocks).toHaveLength(MAX_BLOCKS)
    expect(adjustments.some((a) => a.includes(String(MAX_BLOCKS)))).toBe(true)
  })

  it('truncates an over-long paragraph', () => {
    const { blocks, adjustments } = normalizeBlocks([
      { id: 'a', type: 'paragraph', text: 'x'.repeat(MAX_PARAGRAPH_CHARS + 10) },
    ])
    expect((blocks[0] as { text: string }).text).toHaveLength(MAX_PARAGRAPH_CHARS)
    expect(adjustments).toHaveLength(1)
  })

  it('truncates list length and each item', () => {
    const { blocks } = normalizeBlocks([{
      id: 'a', type: 'list',
      items: Array.from({ length: MAX_LIST_ITEMS + 3 }, () => 'y'.repeat(MAX_LIST_ITEM_CHARS + 4)),
    }])
    const list = blocks[0] as { items: string[] }
    expect(list.items).toHaveLength(MAX_LIST_ITEMS)
    expect(list.items[0]).toHaveLength(MAX_LIST_ITEM_CHARS)
  })

  it('coerces an invalid heading level to 2', () => {
    const { blocks } = normalizeBlocks([{ id: 'a', type: 'heading', text: 'T', level: 7 }])
    expect((blocks[0] as { level?: number }).level).toBe(2)
  })

  it('rejects an image url that is not http(s)', () => {
    const { blocks } = normalizeBlocks([
      { id: 'a', type: 'image', url: 'javascript:alert(1)' },
      { id: 'b', type: 'image', url: 'data:text/html,<script>' },
    ])
    expect(blocks).toEqual([])
  })
})

describe('parseInline', () => {
  it('returns one plain token for plain text', () => {
    expect(parseInline('hello')).toEqual([{ text: 'hello' }])
  })

  it('parses bold and italic', () => {
    expect(parseInline('a **b** c *d*')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' c ' },
      { text: 'd', italic: true },
    ])
  })

  it('leaves unmatched markers literal', () => {
    expect(parseInline('2 * 3 = 6')).toEqual([{ text: '2 * 3 = 6' }])
  })

  it('never emits html', () => {
    const tokens = parseInline('<script>alert(1)</script>')
    expect(tokens).toEqual([{ text: '<script>alert(1)</script>' }])
  })
})
