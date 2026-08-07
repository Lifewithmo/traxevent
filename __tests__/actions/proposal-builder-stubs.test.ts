// TEMPORARY — tests for the Track-C stub save action. Deleted together with
// actions/proposal-builder-stubs.ts at integration (Track A's real
// updateProposalDraft carries its own tests).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const get = vi.fn()
const update = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({ collection: () => ({ doc: () => ({ get, update }) }) }),
    }),
  },
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => '__DELETE__' },
}))

import { updateProposalDraft } from '@/actions/proposal-builder-stubs'

beforeEach(() => {
  vi.clearAllMocks()
  get.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'draft' }) })
})

describe('updateProposalDraft (stub)', () => {
  it('refuses a signed proposal', async () => {
    get.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'p1', status: 'accepted', signature: { signer_name: 'Dana' } }),
    })
    await expect(updateProposalDraft('o1', 'p1', { title: 'x' })).rejects.toThrow(/signed/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a voided proposal', async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'voided' }) })
    await expect(updateProposalDraft('o1', 'p1', { title: 'x' })).rejects.toThrow(/voided/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('preserves placeholder blocks verbatim, including empty image slots', async () => {
    const res = await updateProposalDraft('o1', 'p1', {
      blocks: [
        { id: 'a', type: 'paragraph', text: 'Real edited text' },
        { id: 'b', type: 'image', url: '', placeholder: true },
        { id: 'c', type: 'paragraph', text: 'Replace this intro', placeholder: true },
      ],
    })
    expect(res.draft.blocks).toEqual([
      { id: 'a', type: 'paragraph', text: 'Real edited text' },
      { id: 'b', type: 'image', url: '', placeholder: true },
      { id: 'c', type: 'paragraph', text: 'Replace this intro', placeholder: true },
    ])
  })

  it('still normalizes non-placeholder blocks (drops empty ones)', async () => {
    const res = await updateProposalDraft('o1', 'p1', {
      blocks: [
        { id: 'a', type: 'paragraph', text: 'Kept' },
        { id: 'b', type: 'paragraph', text: '   ' },
      ],
    })
    expect(res.draft.blocks).toEqual([{ id: 'a', type: 'paragraph', text: 'Kept' }])
  })

  it('recomputes the denormalized composed price (override wins)', async () => {
    const res = await updateProposalDraft('o1', 'p1', {
      line_items: [
        { id: 'i1', description: 'Crew', quantity: 2, unit_price: 100 },
        { id: 'i2', description: 'Bar', quantity: 1, unit_price: 500 },
      ],
      packages: [
        { id: 'p-sum', name: 'Sum', includes: [], price: 0, item_ids: ['i1', 'i2'] },
        { id: 'p-ovr', name: 'Override', includes: [], price: 0, item_ids: ['i1'], price_override: 950 },
      ],
    })
    expect(res.draft.packages?.[0].price).toBe(700)
    expect(res.draft.packages?.[1].price).toBe(950)
  })

  it('drops a composed package with unresolvable or duplicate item refs, with an adjustment', async () => {
    const res = await updateProposalDraft('o1', 'p1', {
      line_items: [{ id: 'i1', description: 'Crew', quantity: 1, unit_price: 100 }],
      packages: [
        { id: 'bad', name: 'Bad', includes: [], price: 0, item_ids: ['missing'] },
        { id: 'dup', name: 'Dup', includes: [], price: 0, item_ids: ['i1', 'i1'] },
        { id: 'ok', name: 'Ok', includes: [], price: 0, item_ids: ['i1'] },
      ],
    })
    expect(res.draft.packages?.map((p) => p.id)).toEqual(['ok'])
    expect(res.adjustments.length).toBeGreaterThanOrEqual(2)
  })

  it('rejects more than 3 packages', async () => {
    const pkg = (id: string) => ({ id, name: id, includes: ['x'], price: 1 })
    await expect(
      updateProposalDraft('o1', 'p1', { packages: [pkg('a'), pkg('b'), pkg('c'), pkg('d')] }),
    ).rejects.toThrow(/3/)
  })

  it('maps cleared optional fields to a Firestore delete sentinel', async () => {
    await updateProposalDraft('o1', 'p1', { title: 'Kept', discount: undefined })
    const written = update.mock.calls[0][0]
    expect(written.title).toBe('Kept')
    expect(written.discount).toBe('__DELETE__')
  })
})
