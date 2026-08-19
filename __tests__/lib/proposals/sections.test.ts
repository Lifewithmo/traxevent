import { describe, it, expect } from 'vitest'
import { normalizeSections, MAX_SECTIONS, sectionsFromProposal, sectionTreatments } from '@/lib/proposals/sections'

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

describe('sectionsFromProposal', () => {
  const base = { line_items: [], blocks: undefined, sections: undefined }

  it('returns explicit sections unchanged when present', () => {
    const sections = [{ id: 's1', type: 'letter' as const }]
    expect(sectionsFromProposal({ ...base, sections })).toEqual(sections)
  })

  it('maps a legacy blocks-only proposal to one prose section plus derived ones', () => {
    const blocks = [{ id: 'b1', type: 'paragraph' as const, text: 'Legacy' }]
    const out = sectionsFromProposal({ ...base, blocks })
    expect(out.map((s) => s.type)).toEqual(['prose', 'investment', 'accept'])
    expect(out[0].blocks).toEqual(blocks)
  })

  it('includes tiers only when the proposal has packages', () => {
    const out = sectionsFromProposal({
      ...base,
      packages: [{ id: 'p1', name: 'Basic', price: 100 }],
    })
    expect(out.map((s) => s.type)).toContain('tiers')
  })

  it('includes add_ons only when an optional line item exists', () => {
    const withAddon = sectionsFromProposal({
      ...base,
      line_items: [{ id: 'i1', description: 'Extra', quantity: 1, unit_price: 5, optional: true }],
    })
    expect(withAddon.map((s) => s.type)).toContain('add_ons')

    const without = sectionsFromProposal({
      ...base,
      line_items: [{ id: 'i1', description: 'Base', quantity: 1, unit_price: 5 }],
    })
    expect(without.map((s) => s.type)).not.toContain('add_ons')
  })

  it('places terms AFTER accept, never before it', () => {
    const out = sectionsFromProposal({ ...base, terms: 'Legal text' })
    const types = out.map((s) => s.type)
    expect(types.indexOf('terms')).toBeGreaterThan(types.indexOf('accept'))
  })

  it('never returns an empty list, even for a bare proposal', () => {
    expect(sectionsFromProposal(base).length).toBeGreaterThan(0)
  })

  it('synthesizes a real prose section from notes, never an empty one', () => {
    const out = sectionsFromProposal({ ...base, notes: '  Thanks for considering us!  ' })
    const notesSection = out.find((s) => s.id === 'sec-notes')
    expect(notesSection).toBeDefined()
    expect(notesSection?.blocks?.length).toBeGreaterThan(0)
    expect(notesSection?.blocks?.[0]).toMatchObject({ type: 'paragraph', text: 'Thanks for considering us!' })
  })
})

describe('sectionTreatments (absence rule)', () => {
  const s = (type: string) => ({ id: type, type: type as never })

  it('always gives cover a full bleed', () => {
    expect(sectionTreatments([s('cover'), s('letter')])[0]).toBe('bleed')
  })

  it('never places two tinted bands adjacent', () => {
    const out = sectionTreatments(['letter', 'menu', 'logistics', 'tiers', 'investment'].map(s))
    for (let i = 1; i < out.length; i++) {
      if (out[i] === 'tinted') expect(out[i - 1]).not.toBe('tinted')
    }
  })

  it('stays alternating when a middle section is removed', () => {
    const full = ['letter', 'menu', 'logistics', 'tiers'].map(s)
    const without = ['letter', 'logistics', 'tiers'].map(s)
    for (const out of [sectionTreatments(full), sectionTreatments(without)]) {
      for (let i = 1; i < out.length; i++) {
        if (out[i] === 'tinted') expect(out[i - 1]).not.toBe('tinted')
      }
    }
  })

  it('returns one treatment per section', () => {
    const list = ['cover', 'letter', 'tiers'].map(s)
    expect(sectionTreatments(list)).toHaveLength(list.length)
  })

  it('handles a single-section document', () => {
    expect(sectionTreatments([s('prose')])).toEqual(['plain'])
  })
})
