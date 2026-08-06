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
