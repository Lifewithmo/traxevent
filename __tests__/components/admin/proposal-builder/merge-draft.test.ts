import { describe, it, expect } from 'vitest'
import { mergeDraftIntoBlocks } from '@/components/admin/proposal-builder/merge-draft'
import type { ProposalBlock as PlaceholderBlock } from '@/lib/types'
import type { ProposalBlock } from '@/lib/types'

const current: PlaceholderBlock[] = [
  { id: 'h1', type: 'heading', text: 'Replace with a cover title', level: 2, placeholder: true },
  { id: 'p1', type: 'paragraph', text: 'Hi Jordan — replace this intro.', placeholder: true },
  { id: 'human', type: 'paragraph', text: 'Hand-written by the operator.' },
  { id: 'p2', type: 'paragraph', text: 'Describe your recommendation.', placeholder: true },
]

const draft: ProposalBlock[] = [
  { id: 'd1', type: 'heading', text: 'Coffee cart for the Miller wedding', level: 2 },
  { id: 'd2', type: 'paragraph', text: 'Thanks for talking with us about your big day.' },
  { id: 'd3', type: 'paragraph', text: 'We recommend our two-barista espresso package.' },
]

describe('mergeDraftIntoBlocks', () => {
  it('fills placeholders with draft blocks of the same type, in document order', () => {
    const { blocks, filled } = mergeDraftIntoBlocks(current, draft)
    expect(filled).toBe(3)
    expect(blocks.map((b) => ('text' in b ? b.text : ''))).toEqual([
      'Coffee cart for the Miller wedding',
      'Thanks for talking with us about your big day.',
      'Hand-written by the operator.',
      'We recommend our two-barista espresso package.',
    ])
  })

  it('keeps the placeholder ids and clears the flag on filled blocks', () => {
    const { blocks } = mergeDraftIntoBlocks(current, draft)
    expect(blocks[0].id).toBe('h1')
    expect(blocks[0].placeholder).toBeUndefined()
  })

  it('never touches human-authored blocks', () => {
    const { blocks } = mergeDraftIntoBlocks(current, draft)
    expect(blocks[2]).toBe(current[2])
  })

  it('never refills a placeholder the user already edited (flag cleared)', () => {
    const edited = current.map((b) =>
      b.id === 'p1' ? { id: 'p1', type: 'paragraph' as const, text: 'Edited by hand.' } : b,
    )
    const { blocks } = mergeDraftIntoBlocks(edited, draft)
    expect(blocks.find((b) => b.id === 'p1')).toEqual({
      id: 'p1', type: 'paragraph', text: 'Edited by hand.',
    })
  })

  it('leaves unmatched placeholders in place and drops unused draft blocks', () => {
    const { blocks, filled } = mergeDraftIntoBlocks(current, [
      { id: 'd1', type: 'paragraph', text: 'Only one paragraph.' },
    ])
    expect(filled).toBe(1)
    // Heading placeholder had no matching draft heading — stays.
    expect(blocks[0].placeholder).toBe(true)
    expect(blocks).toHaveLength(4)
  })

  it('never fills image placeholders (the AI schema has no image blocks)', () => {
    const withImage: PlaceholderBlock[] = [
      { id: 'img', type: 'image', url: '', placeholder: true },
    ]
    const { blocks, filled } = mergeDraftIntoBlocks(withImage, draft)
    expect(filled).toBe(0)
    expect(blocks[0].placeholder).toBe(true)
  })

  it('fills an empty document by appending the whole draft', () => {
    const { blocks, filled } = mergeDraftIntoBlocks([], draft)
    expect(filled).toBe(3)
    expect(blocks).toHaveLength(3)
  })
})
