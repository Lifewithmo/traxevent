import { describe, it, expect, vi, beforeEach } from 'vitest'

const update = vi.fn()
const get = vi.fn()
const doc = vi.fn(() => ({ get, update }))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => ({ doc }) }) }) },
}))

import { updateProposalBlocksCore } from '@/lib/proposals/blocks-core'

beforeEach(() => {
  vi.clearAllMocks()
  get.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'draft' }) })
})

describe('updateProposalBlocksCore', () => {
  it('writes normalized blocks and stamps updated_at', async () => {
    const res = await updateProposalBlocksCore('o1', 'p1', [
      { id: 'a', type: 'paragraph', text: 'Hello' },
    ])
    expect(res.adjustments).toEqual([])
    const written = update.mock.calls[0][0]
    expect(written.blocks).toEqual([{ id: 'a', type: 'paragraph', text: 'Hello' }])
    expect(typeof written.updated_at).toBe('string')
  })

  it('drops invalid blocks and reports the adjustment', async () => {
    const res = await updateProposalBlocksCore('o1', 'p1', [{ id: 'a', type: 'video' }])
    expect(update.mock.calls[0][0].blocks).toEqual([])
    expect(res.adjustments).toHaveLength(1)
  })

  it('returns the normalized blocks it wrote, not the caller input', async () => {
    // The editor re-seeds its state from this value; if the action only
    // reported `adjustments`, a dropped block would stay on screen while
    // Firestore no longer had it.
    const res = await updateProposalBlocksCore('o1', 'p1', [
      { id: 'a', type: 'paragraph', text: 'Kept' },
      { id: 'b', type: 'paragraph', text: '   ' },
    ])
    expect(res.blocks).toEqual([{ id: 'a', type: 'paragraph', text: 'Kept' }])
    expect(res.blocks).toEqual(update.mock.calls[0][0].blocks)
  })

  it('refuses to edit a voided proposal', async () => {
    // Voiding is enforced in the UI everywhere else; the block editor is the
    // one write path that must not depend on the UI for it.
    get.mockResolvedValue({ exists: true, data: () => ({ id: 'p1', status: 'voided' }) })
    await expect(updateProposalBlocksCore('o1', 'p1', [])).rejects.toThrow(/voided/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses to edit a signed proposal', async () => {
    get.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'p1', signature: { signer_name: 'Dana' } }),
    })
    await expect(updateProposalBlocksCore('o1', 'p1', [])).rejects.toThrow(/signed/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('throws when the proposal does not exist', async () => {
    get.mockResolvedValue({ exists: false })
    await expect(updateProposalBlocksCore('o1', 'p1', [])).rejects.toThrow(/not found/i)
  })
})
