import { describe, it, expect } from 'vitest'
import { PROPOSAL_SKELETONS, getSkeleton } from '@/lib/proposals/skeletons'

describe('PROPOSAL_SKELETONS', () => {
  it('offers exactly full, quick, visual, and blank', () => {
    expect(PROPOSAL_SKELETONS.map((s) => s.key)).toEqual(['full', 'quick', 'visual', 'blank'])
  })

  it('blank produces no blocks', () => {
    expect(getSkeleton('blank').makeBlocks({})).toEqual([])
  })

  it('marks every scaffolded block as a placeholder with a unique id', () => {
    for (const skeleton of PROPOSAL_SKELETONS) {
      const blocks = skeleton.makeBlocks({ contactName: 'Jordan' })
      const ids = blocks.map((b) => b.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const block of blocks) {
        expect(block.placeholder).toBe(true)
      }
    }
  })

  it('pre-addresses the intro to the lead contact when provided', () => {
    const blocks = getSkeleton('full').makeBlocks({ contactName: 'Jordan' })
    const intro = blocks.find((b) => b.type === 'paragraph')
    expect(intro && 'text' in intro && intro.text).toContain('Jordan')
  })

  it('reads generically when no contact is known', () => {
    const blocks = getSkeleton('full').makeBlocks({})
    const intro = blocks.find((b) => b.type === 'paragraph')
    expect(intro && 'text' in intro && intro.text).not.toContain('undefined')
  })

  it('full proposal includes an empty image slot and the fixed section headings', () => {
    const blocks = getSkeleton('full').makeBlocks({})
    const headings = blocks
      .filter((b) => b.type === 'heading')
      .map((b) => ('text' in b ? b.text : ''))
    expect(headings).toContain('What you told us')
    expect(headings).toContain('Our recommendation')
    const image = blocks.find((b) => b.type === 'image')
    expect(image && 'url' in image && image.url).toBe('')
  })

  it('visual showcase alternates image and paragraph and carries a testimonial', () => {
    const blocks = getSkeleton('visual').makeBlocks({})
    expect(blocks.filter((b) => b.type === 'image').length).toBeGreaterThanOrEqual(2)
    expect(blocks.some((b) => b.type === 'testimonial')).toBe(true)
  })

  it('quick quote is minimal — no images, few blocks', () => {
    const blocks = getSkeleton('quick').makeBlocks({})
    expect(blocks.length).toBeLessThanOrEqual(4)
    expect(blocks.some((b) => b.type === 'image')).toBe(false)
  })
})
