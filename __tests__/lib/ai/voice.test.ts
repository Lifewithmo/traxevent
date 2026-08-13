import { describe, it, expect } from 'vitest'
import { blocksToVoiceText, pushVoiceExample, serializeVoice, MAX_VOICE_EXAMPLES } from '@/lib/ai/voice'
import type { ProposalBlock } from '@/lib/types'

const blocks: ProposalBlock[] = [
  { id: '1', type: 'heading', text: 'What we bring', level: 2 },
  { id: '2', type: 'paragraph', text: 'A full espresso bar with two baristas.' },
  { id: '3', type: 'list', items: ['Three-hour window', 'Oat and whole milk'] },
  { id: '4', type: 'testimonial', quote: 'People loved it.', attribution: 'Dana W.' },
  { id: '5', type: 'paragraph', text: 'Hidden', placeholder: true } as ProposalBlock,
  { id: '6', type: 'image', url: 'https://x/y.png' } as ProposalBlock,
]

describe('blocksToVoiceText', () => {
  it('renders headings, paragraphs, lists, testimonials; skips placeholders and images', () => {
    const text = blocksToVoiceText(blocks)
    expect(text).toContain('What we bring')
    expect(text).toContain('A full espresso bar')
    expect(text).toContain('- Three-hour window')
    expect(text).toContain('"People loved it." — Dana W.')
    expect(text).not.toContain('Hidden')
    expect(text).not.toContain('y.png')
  })
})

describe('pushVoiceExample', () => {
  const ex = (id: string, at: string) => ({ proposal_id: id, title: id, text: 't', sent_at: at })
  it('prepends newest and caps at MAX_VOICE_EXAMPLES', () => {
    const out = pushVoiceExample([ex('a', '1'), ex('b', '2'), ex('c', '3')], ex('d', '4'))
    expect(out.map((e) => e.proposal_id)).toEqual(['d', 'a', 'b'])
    expect(out).toHaveLength(MAX_VOICE_EXAMPLES)
  })
  it('re-sending the same proposal replaces its old example instead of duplicating', () => {
    const out = pushVoiceExample([ex('a', '1'), ex('b', '2')], ex('b', '9'))
    expect(out.map((e) => e.proposal_id)).toEqual(['b', 'a'])
  })
})

describe('serializeVoice', () => {
  it('returns null with no material', () => {
    expect(serializeVoice([], undefined)).toBeNull()
    expect(serializeVoice([], '   ')).toBeNull()
  })
  it('includes note and examples', () => {
    const s = serializeVoice([{ proposal_id: 'a', title: 'Launch bar', text: 'Warm prose.', sent_at: '2026-08-01' }], 'no exclamation marks')
    expect(s).toContain('no exclamation marks')
    expect(s).toContain('Launch bar')
    expect(s).toContain('Warm prose.')
  })
})
