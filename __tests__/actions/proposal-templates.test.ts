import { describe, it, expect, vi, beforeEach } from 'vitest'

const tplDoc = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
}))
const orderGet = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
const tplColl = vi.hoisted(() => ({
  doc: vi.fn(() => tplDoc),
  orderBy: vi.fn(() => ({ get: orderGet })),
}))
const orgDoc = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue({ data: () => ({}) }) }))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: orgDoc.get,
        collection: vi.fn((name: string) => (name === 'proposal_templates' ? tplColl : { doc: vi.fn() })),
      })),
    })),
  },
}))
vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({}),
  assertOrgAdmin: vi.fn().mockResolvedValue({}),
}))
const createProposalSpy = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: 'p1', title: 'Acme — Gala', terms: 'Org default terms' })
)
vi.mock('@/actions/proposals', () => ({ createProposal: createProposalSpy }))
const updateDraftCoreSpy = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ proposal: { id: 'p1' }, adjustments: [] })
)
vi.mock('@/lib/proposals/draft-core', () => ({ updateProposalDraftCore: updateDraftCoreSpy }))

import {
  createProposalTemplate,
  duplicateProposalTemplate,
  renameProposalTemplate,
  deleteProposalTemplate,
  updateTemplateDraft,
  createProposalFromTemplate,
} from '@/actions/proposal-templates'
import { assertOrgAdmin } from '@/lib/auth/assert'
import type { ProposalTemplate } from '@/lib/types'

const stored: ProposalTemplate = {
  id: 't1', org_id: 'o1', name: 'Standard wedding',
  line_items: [{ id: 'li1', description: 'Espresso bar', quantity: 1, unit_price: 500 }],
  terms: 'Tpl terms', usage_count: 4, created_at: 'x',
}

describe('createProposalTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an empty name', async () => {
    await expect(createProposalTemplate('o1', { name: '   ' })).rejects.toThrow('name')
    expect(tplDoc.set).not.toHaveBeenCalled()
  })

  it('writes a template with id, org_id, trimmed name, timestamps', async () => {
    const t = await createProposalTemplate('o1', { name: '  Standard  ' })
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(t.name).toBe('Standard')
    expect(t.org_id).toBe('o1')
    expect(t.id).toMatch(/^[0-9a-f]{16}$/)
    expect(t.line_items).toEqual([])
    expect(tplDoc.set).toHaveBeenCalledWith(t)
  })

  it('accepts initial content', async () => {
    const t = await createProposalTemplate('o1', {
      name: 'From proposal',
      content: { line_items: stored.line_items, terms: 'Tpl terms' },
    })
    expect(t.line_items).toEqual(stored.line_items)
    expect(t.terms).toBe('Tpl terms')
  })
})

describe('duplicateProposalTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('copies content, appends (copy), resets usage', async () => {
    tplDoc.get.mockResolvedValueOnce({ exists: true, data: () => stored })
    const copy = await duplicateProposalTemplate('o1', 't1')
    expect(copy.name).toBe('Standard wedding (copy)')
    expect(copy.line_items).toEqual(stored.line_items)
    expect(copy.usage_count).toBeUndefined()
    expect(copy.id).not.toBe('t1')
  })
})

describe('renameProposalTemplate / deleteProposalTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rename trims and updates', async () => {
    await renameProposalTemplate('o1', 't1', '  New name ')
    expect(tplDoc.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New name', updated_at: expect.any(String) })
    )
  })

  it('delete removes the doc', async () => {
    await deleteProposalTemplate('o1', 't1')
    expect(tplDoc.delete).toHaveBeenCalled()
  })
})

describe('createProposalFromTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates, applies template content full-state, keeps the autofilled title, bumps usage', async () => {
    tplDoc.get.mockResolvedValueOnce({ exists: true, data: () => stored })
    const created = await createProposalFromTemplate('o1', 'l1', 't1', { title: 'Acme — Gala' })
    expect(created.id).toBe('p1')
    expect(createProposalSpy).toHaveBeenCalledWith('o1', 'l1', { title: 'Acme — Gala' })
    const [, , draft] = updateDraftCoreSpy.mock.calls[0]
    expect(draft.title).toBe('Acme — Gala')
    expect(draft.line_items).toEqual(stored.line_items)
    expect(draft.terms).toBe('Tpl terms')
    expect(tplDoc.update).toHaveBeenCalled()
  })

  it('falls back to the org default terms already seeded on the proposal', async () => {
    const { terms: _t, ...noTerms } = stored
    tplDoc.get.mockResolvedValueOnce({ exists: true, data: () => noTerms })
    await createProposalFromTemplate('o1', 'l1', 't1', { title: 'T' })
    const [, , draft] = updateDraftCoreSpy.mock.calls[0]
    expect(draft.terms).toBe('Org default terms')
  })

  it('throws when the template is gone', async () => {
    tplDoc.get.mockResolvedValueOnce({ exists: false })
    await expect(createProposalFromTemplate('o1', 'l1', 't1', { title: 'T' })).rejects.toThrow('not found')
    expect(createProposalSpy).not.toHaveBeenCalled()
  })
})

describe('updateTemplateDraft', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normalizes and persists full-state content, never expires_at', async () => {
    tplDoc.get.mockResolvedValueOnce({ exists: true, data: () => stored })
    const res = await updateTemplateDraft('o1', 't1', {
      blocks: [{ id: 'b1', type: 'paragraph', text: 'Hello' }],
      line_items: stored.line_items,
      terms: 'New terms',
      expires_at: '2026-09-01',
    })
    const written = tplDoc.update.mock.calls[0][0]
    expect(written.terms).toBe('New terms')
    expect(written.expires_at).toBeUndefined()
    expect(res.persisted.blocks).toHaveLength(1)
    expect(res.persisted).not.toHaveProperty('expires_at')
  })

  it('clears absent clearable fields (full-state semantics)', async () => {
    tplDoc.get.mockResolvedValueOnce({ exists: true, data: () => stored })
    await updateTemplateDraft('o1', 't1', { blocks: [], line_items: [] })
    const written = tplDoc.update.mock.calls[0][0]
    expect(written.terms).toBeInstanceOf(Object) // FieldValue.delete() sentinel
  })

  it('throws when the template is gone', async () => {
    tplDoc.get.mockResolvedValueOnce({ exists: false })
    await expect(updateTemplateDraft('o1', 't1', { line_items: [] })).rejects.toThrow('not found')
  })
})
