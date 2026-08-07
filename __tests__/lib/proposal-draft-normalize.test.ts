import { describe, it, expect } from 'vitest'
import { normalizeProposalDraft, ProposalDraftError } from '@/lib/proposals/draft'
import { upgradeLegacyProposal } from '@/lib/proposals/upgrade'
import { computeSelectedTotal, packageBullets } from '@/lib/proposals'
import type { ProposalDraftInput } from '@/lib/proposals/draft'

const pool = [
  { id: 'i1', description: 'Setup', quantity: 1, unit_price: 500, unit: 'each' },
  { id: 'i2', description: 'Service', quantity: 8, unit_price: 120 },
]

describe('normalizeProposalDraft — scalars', () => {
  it('trims title/notes/deposit_terms and clears empties', () => {
    const { draft } = normalizeProposalDraft({
      title: '  Big day  ', notes: '   ', deposit_terms: ' Due up front ',
      line_items: [], blocks: [],
    })
    expect(draft.title).toBe('Big day')
    expect(draft.notes).toBeUndefined()
    expect(draft.deposit_terms).toBe('Due up front')
  })

  it('keeps only valid deposit_gate literals', () => {
    const bad = normalizeProposalDraft({ deposit_gate: 'whenever' as never, line_items: [], blocks: [] })
    expect(bad.draft.deposit_gate).toBeUndefined()
    const good = normalizeProposalDraft({ deposit_gate: 'before_accept', line_items: [], blocks: [] })
    expect(good.draft.deposit_gate).toBe('before_accept')
  })

  it('drops malformed discount/deposit/tax_rate with adjustments', () => {
    const { draft, adjustments } = normalizeProposalDraft({
      discount: { type: 'percent', value: Number.NaN },
      deposit: { type: 'half' as never, value: 50 },
      tax_rate: Number.POSITIVE_INFINITY,
      line_items: [], blocks: [],
    })
    expect(draft.discount).toBeUndefined()
    expect(draft.deposit).toBeUndefined()
    expect(draft.tax_rate).toBeUndefined()
    expect(adjustments.length).toBe(3)
  })

  it('keeps well-formed discount/deposit/tax_rate', () => {
    const { draft, adjustments } = normalizeProposalDraft({
      discount: { type: 'fixed', value: 100 },
      deposit: { type: 'percent', value: 50 },
      tax_rate: 8.25,
      line_items: [], blocks: [],
    })
    expect(draft.discount).toEqual({ type: 'fixed', value: 100 })
    expect(draft.deposit).toEqual({ type: 'percent', value: 50 })
    expect(draft.tax_rate).toBe(8.25)
    expect(adjustments).toEqual([])
  })
})

describe('normalizeProposalDraft — line items', () => {
  it('normalizes a full item and keeps unit/optional/taxable', () => {
    const { draft } = normalizeProposalDraft({
      line_items: [{ id: 'a', description: ' Bar ', quantity: 2, unit_price: 9.5, unit: ' hr ', optional: true, taxable: false }],
      blocks: [],
    })
    expect(draft.line_items).toEqual([
      { id: 'a', description: 'Bar', quantity: 2, unit_price: 9.5, unit: 'hr', optional: true, taxable: false },
    ])
  })

  it('drops empty descriptions and non-finite numbers with adjustments', () => {
    const { draft, adjustments } = normalizeProposalDraft({
      line_items: [
        { id: 'a', description: '  ', quantity: 1, unit_price: 1 },
        { id: 'b', description: 'NaN qty', quantity: Number.NaN, unit_price: 1 },
        { id: 'c', description: 'Inf price', quantity: 1, unit_price: Number.POSITIVE_INFINITY },
        'not-an-object',
      ],
      blocks: [],
    })
    expect(draft.line_items).toEqual([])
    expect(adjustments.length).toBe(4)
  })

  it('mints missing ids collision-safely and re-mints duplicates with an adjustment', () => {
    const { draft, adjustments } = normalizeProposalDraft({
      line_items: [
        { description: 'No id', quantity: 1, unit_price: 1 },
        { id: 'dup', description: 'First', quantity: 1, unit_price: 1 },
        { id: 'dup', description: 'Second', quantity: 1, unit_price: 1 },
      ],
      blocks: [],
    })
    const ids = draft.line_items.map((i) => i.id)
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(3)
    expect(draft.line_items[1].id).toBe('dup') // first claim wins
    expect(adjustments.some((a) => a.includes('duplicate'))).toBe(true)
  })
})

describe('normalizeProposalDraft — packages', () => {
  it('throws on more than 3 packages', () => {
    const pkgs = ['A', 'B', 'C', 'D'].map((name, n) => ({ id: `p${n}`, name, includes: [], price: 0, item_ids: [] }))
    expect(() => normalizeProposalDraft({ packages: pkgs, line_items: [], blocks: [] }))
      .toThrow(ProposalDraftError)
  })

  it('throws when an item_ids ref does not resolve', () => {
    expect(() => normalizeProposalDraft({
      packages: [{ id: 'p', name: 'P', includes: [], price: 0, item_ids: ['ghost'] }],
      line_items: pool, blocks: [],
    })).toThrow(/resolve|unknown/i)
  })

  it('throws on duplicate refs within one tier', () => {
    expect(() => normalizeProposalDraft({
      packages: [{ id: 'p', name: 'P', includes: [], price: 0, item_ids: ['i1', 'i1'] }],
      line_items: pool, blocks: [],
    })).toThrow(/duplicate/i)
  })

  it('recomputes the denormalized price from members, ignoring the client-sent price', () => {
    const { draft } = normalizeProposalDraft({
      packages: [{ id: 'p', name: 'P', includes: ['stale'], price: 999999, item_ids: ['i1', 'i2'] }],
      line_items: pool, blocks: [],
    })
    expect(draft.packages).toHaveLength(1)
    expect(draft.packages![0].price).toBe(500 + 960)
    expect(draft.packages![0].includes).toEqual([]) // never written for composed
  })

  it('price_override wins the denormalized price; non-finite override is dropped with adjustment', () => {
    const ok = normalizeProposalDraft({
      packages: [{ id: 'p', name: 'P', includes: [], price: 0, item_ids: ['i1'], price_override: 1200 }],
      line_items: pool, blocks: [],
    })
    expect(ok.draft.packages![0].price).toBe(1200)
    expect(ok.draft.packages![0].price_override).toBe(1200)

    const bad = normalizeProposalDraft({
      packages: [{ id: 'p', name: 'P', includes: [], price: 0, item_ids: ['i1'], price_override: Number.NaN }],
      line_items: pool, blocks: [],
    })
    expect(bad.draft.packages![0].price_override).toBeUndefined()
    expect(bad.draft.packages![0].price).toBe(500)
    expect(bad.adjustments.some((a) => a.includes('override'))).toBe(true)
  })

  it('keeps legacy packages authoritative (includes + flat price) and drops nameless packages', () => {
    const { draft, adjustments } = normalizeProposalDraft({
      packages: [
        { id: 'l', name: ' Classic ', includes: [' Setup ', ''], price: 1200 },
        { id: 'x', name: '   ', includes: [], price: 5 },
      ],
      line_items: [], blocks: [],
    })
    expect(draft.packages).toEqual([
      { id: 'l', name: 'Classic', includes: ['Setup'], price: 1200 },
    ])
    expect(adjustments.some((a) => a.includes('name'))).toBe(true)
  })

  it('mints package ids when missing', () => {
    const { draft } = normalizeProposalDraft({
      packages: [{ name: 'P', includes: [], price: 0, item_ids: [] } as never],
      line_items: [], blocks: [],
    })
    expect(draft.packages![0].id).toBeTruthy()
  })

  it('clears packages entirely when the field is absent', () => {
    const { draft } = normalizeProposalDraft({ line_items: [], blocks: [] })
    expect(draft.packages).toBeUndefined()
  })
})

describe('normalizeProposalDraft — blocks and upgrade equivalence', () => {
  it('runs blocks through normalizeBlocks and merges adjustments', () => {
    const { draft, adjustments } = normalizeProposalDraft({
      blocks: [
        { id: 'b1', type: 'paragraph', text: 'Hello', placeholder: true },
        { id: 'b2', type: 'bogus' },
      ],
      line_items: [],
    })
    expect(draft.blocks).toEqual([{ id: 'b1', type: 'paragraph', text: 'Hello', placeholder: true }])
    expect(adjustments.some((a) => a.includes('bogus'))).toBe(true)
  })

  it('upgrade-on-first-autosave: adapter output normalizes without drift', () => {
    const legacy = {
      line_items: [{ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true }],
      packages: [
        { id: 'good', name: 'Good', includes: ['Install', 'Cleanup'], price: 12500 },
        { id: 'best', name: 'Best', includes: ['Install', 'Cleanup', 'Warranty'], price: 15000, recommended: true },
      ],
    }
    const upgraded = upgradeLegacyProposal(legacy)
    const { draft, adjustments } = normalizeProposalDraft({
      line_items: upgraded.line_items, packages: upgraded.packages, blocks: [],
    } as ProposalDraftInput)
    expect(adjustments).toEqual([])
    expect(draft.line_items).toEqual(upgraded.line_items)
    expect(draft.packages).toEqual(upgraded.packages)
    for (const pkgId of ['good', 'best']) {
      const sel = { package_id: pkgId, optional_item_ids: ['o1'] }
      expect(computeSelectedTotal(draft, sel)).toBe(computeSelectedTotal(legacy, sel))
    }
    expect(packageBullets(draft.packages![0], draft.line_items)).toEqual(['Install', 'Cleanup'])
  })
})
