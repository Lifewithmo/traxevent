import { describe, it, expect } from 'vitest'
import { serializeCatalog, buildDraftSystemBlocks } from '@/lib/ai/grounding'
import type { WorkPackage, OpsResource } from '@/lib/types'

const pkgs: WorkPackage[] = [
  { id: 'wp-b', name: 'Big Bar', price: 2500, lines: [], max_guests: 150, created_at: 'x' },
  { id: 'wp-a', name: 'Coffee Cart', description: 'Espresso service', price: 1200, lines: [], created_at: 'x' },
]
const res: OpsResource[] = [
  { id: 'r-2', name: 'Oat milk', kind: 'consumable', unit: 'gal', created_at: 'x' },
  { id: 'r-1', name: 'Espresso machine', kind: 'reusable', created_at: 'x' },
]

describe('serializeCatalog', () => {
  it('includes every package id, name, and price', () => {
    const text = serializeCatalog(pkgs, res)
    expect(text).toContain('wp-a')
    expect(text).toContain('Coffee Cart')
    expect(text).toContain('1200')
    expect(text).toContain('wp-b')
    expect(text).toContain('2500')
  })

  it('includes every resource id, name, kind, and unit when present', () => {
    const text = serializeCatalog(pkgs, res)
    expect(text).toContain('r-1')
    expect(text).toContain('Espresso machine')
    expect(text).toContain('r-2')
    expect(text).toContain('gal')
  })

  it('is deterministic: input order does not change the output', () => {
    const a = serializeCatalog(pkgs, res)
    const b = serializeCatalog([...pkgs].reverse(), [...res].reverse())
    expect(a).toBe(b)
  })

  it('states an empty catalog explicitly rather than emitting nothing', () => {
    const text = serializeCatalog([], [])
    expect(text.length).toBeGreaterThan(0)
    expect(text).toMatch(/no packages/i)
  })
})

describe('buildDraftSystemBlocks', () => {
  it('returns [static prompt, catalog] with cache_control on the catalog block', () => {
    const blocks = buildDraftSystemBlocks('CATALOG-TEXT')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].cache_control).toBeUndefined()
    expect(blocks[1].text).toContain('CATALOG-TEXT')
    expect(blocks[1].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('the system prompt forbids inventing prices and instructs ids-only suggestions', () => {
    const [prompt] = buildDraftSystemBlocks('x')
    expect(prompt.text).toMatch(/never.*(invent|make up).*(price|pricing)/i)
    expect(prompt.text).toMatch(/suggested_package_ids/)
  })
})
