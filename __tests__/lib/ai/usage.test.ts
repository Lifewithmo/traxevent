import { describe, it, expect, vi, beforeEach } from 'vitest'

const set = vi.fn()
const doc = vi.fn(() => ({ set }))
const subCollection = vi.fn(() => ({ doc }))
const orgDoc = vi.fn(() => ({ collection: subCollection }))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: orgDoc }) },
}))

import { logAiUsage } from '@/lib/ai/usage'

beforeEach(() => {
  vi.clearAllMocks()
  set.mockResolvedValue(undefined)
})

describe('logAiUsage', () => {
  it('writes feature tag and token counts under orgs/{orgId}/ai_usage', async () => {
    await logAiUsage('org-1', 'proposal_draft', {
      input_tokens: 1200, output_tokens: 800, cache_read_input_tokens: 900,
    })
    expect(orgDoc).toHaveBeenCalledWith('org-1')
    expect(subCollection).toHaveBeenCalledWith('ai_usage')
    const written = set.mock.calls[0][0]
    expect(written.feature).toBe('proposal_draft')
    expect(written.input_tokens).toBe(1200)
    expect(written.output_tokens).toBe(800)
    expect(written.cache_read_input_tokens).toBe(900)
    expect(typeof written.created_at).toBe('string')
  })

  it('defaults cache_read_input_tokens to 0 when absent', async () => {
    await logAiUsage('org-1', 'proposal_draft', { input_tokens: 10, output_tokens: 5 })
    expect(set.mock.calls[0][0].cache_read_input_tokens).toBe(0)
  })

  it('swallows write failures instead of throwing', async () => {
    set.mockRejectedValue(new Error('firestore down'))
    await expect(
      logAiUsage('org-1', 'proposal_draft', { input_tokens: 1, output_tokens: 1 }),
    ).resolves.toBeUndefined()
  })
})
