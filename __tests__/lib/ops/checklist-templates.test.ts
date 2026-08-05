import { describe, it, expect, vi, beforeEach } from 'vitest'

const docSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
const collRef = vi.hoisted(() => ({
  doc: vi.fn((id?: string) => ({ id: id ?? 'ct-new', set: docSetSpy, delete: vi.fn() })),
  orderBy: vi.fn().mockReturnValue({ get: listGetSpy }),
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))

import {
  createChecklistTemplateCore, getTemplatesForOrg, BUILT_IN_TEMPLATES,
} from '@/lib/ops/checklist-templates'

beforeEach(() => vi.clearAllMocks())

describe('createChecklistTemplateCore', () => {
  it('requires a name, a valid phase, and at least one step', async () => {
    await expect(createChecklistTemplateCore('o1', { name: ' ', phase: 'prep', steps: [{ text: 'x', evidence: 'none' }] }))
      .rejects.toThrow('Name is required')
    // @ts-expect-error invalid phase at runtime
    await expect(createChecklistTemplateCore('o1', { name: 'T', phase: 'party', steps: [{ text: 'x', evidence: 'none' }] }))
      .rejects.toThrow('Invalid phase')
    await expect(createChecklistTemplateCore('o1', { name: 'T', phase: 'prep', steps: [] }))
      .rejects.toThrow('At least one step is required')
  })
})

describe('BUILT_IN_TEMPLATES', () => {
  it('has coffee-cart and general sets, every template well-formed', () => {
    for (const key of ['coffee-cart', 'general']) {
      const set = BUILT_IN_TEMPLATES[key]
      expect(set.length).toBeGreaterThan(0)
      for (const t of set) {
        expect(t.id).toBeTruthy()
        expect(t.steps.length).toBeGreaterThan(0)
      }
    }
  })

  it('coffee-cart covers the full phase lifecycle', () => {
    const phases = new Set(BUILT_IN_TEMPLATES['coffee-cart'].map((t) => t.phase))
    for (const p of ['prep', 'load-out', 'setup', 'service-close', 'closeout']) {
      expect(phases.has(p as never)).toBe(true)
    }
  })
})

describe('getTemplatesForOrg', () => {
  it('falls back to built-in pack defaults when the org has none', async () => {
    listGetSpy.mockResolvedValueOnce({ docs: [] })
    const templates = await getTemplatesForOrg('o1', 'coffee-cart')
    expect(templates).toEqual(BUILT_IN_TEMPLATES['coffee-cart'])
  })

  it('falls back to general for unknown pack ids', async () => {
    listGetSpy.mockResolvedValueOnce({ docs: [] })
    const templates = await getTemplatesForOrg('o1', undefined)
    expect(templates).toEqual(BUILT_IN_TEMPLATES['general'])
  })

  it('prefers org templates when they exist', async () => {
    const own = { id: 'ct1', name: 'My prep', phase: 'prep', steps: [{ text: 'x', evidence: 'none' }], created_at: 't' }
    listGetSpy.mockResolvedValueOnce({ docs: [{ data: () => own }] })
    const templates = await getTemplatesForOrg('o1', 'coffee-cart')
    expect(templates).toEqual([own])
  })
})
