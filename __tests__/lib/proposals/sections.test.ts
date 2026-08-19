import { describe, it, expect } from 'vitest'
import { normalizeSections, MAX_SECTIONS } from '@/lib/proposals/sections'

describe('normalizeSections', () => {
  it('returns empty for non-array input', () => {
    expect(normalizeSections(undefined).sections).toEqual([])
    expect(normalizeSections('nope').sections).toEqual([])
  })

  it('keeps a known section type and normalizes its blocks', () => {
    const { sections } = normalizeSections([
      { id: 's1', type: 'letter', blocks: [{ id: 'b1', type: 'paragraph', text: 'Hi' }] },
    ])
    expect(sections).toHaveLength(1)
    expect(sections[0].type).toBe('letter')
    expect(sections[0].blocks).toEqual([{ id: 'b1', type: 'paragraph', text: 'Hi' }])
  })

  it('drops an unknown section type and reports it', () => {
    const { sections, adjustments } = normalizeSections([{ id: 's1', type: 'wat' }])
    expect(sections).toEqual([])
    expect(adjustments[0]).toContain('wat')
  })

  it('mints ids for missing or colliding ones', () => {
    const { sections } = normalizeSections([
      { type: 'tiers' },
      { id: 'sec-0', type: 'investment' },
      { type: 'accept' },
    ])
    const ids = sections.map((s) => s.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('preserves placeholder: true only, and drops other values', () => {
    const { sections } = normalizeSections([
      { id: 'a', type: 'menu', placeholder: true },
      { id: 'b', type: 'menu', placeholder: 'yes' },
    ])
    expect(sections[0].placeholder).toBe(true)
    expect(sections[1].placeholder).toBeUndefined()
  })

  it('caps the section count', () => {
    const many = Array.from({ length: MAX_SECTIONS + 5 }, () => ({ type: 'prose' }))
    const { sections, adjustments } = normalizeSections(many)
    expect(sections).toHaveLength(MAX_SECTIONS)
    expect(adjustments.join(' ')).toContain(String(MAX_SECTIONS))
  })

  it('omits blocks entirely for a derived section', () => {
    const { sections } = normalizeSections([
      { id: 's1', type: 'tiers', blocks: [{ id: 'b1', type: 'paragraph', text: 'ignored' }] },
    ])
    expect(sections[0].blocks).toBeUndefined()
  })
})
