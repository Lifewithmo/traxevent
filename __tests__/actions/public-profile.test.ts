import { describe, it, expect, vi, beforeEach } from 'vitest'

const { assertOrgAdminSpy, orgGetSpy, txGetSpy, txUpdateSpy, runTransaction } = vi.hoisted(() => {
  const txGetSpy = vi.fn()
  const txUpdateSpy = vi.fn()
  const runTransaction = vi.fn(
    async (fn: (tx: { get: typeof txGetSpy; update: typeof txUpdateSpy }) => Promise<unknown>) =>
      fn({ get: txGetSpy, update: txUpdateSpy }),
  )
  return {
    assertOrgAdminSpy: vi.fn().mockResolvedValue(undefined),
    orgGetSpy: vi.fn(),
    txGetSpy,
    txUpdateSpy,
    runTransaction,
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: assertOrgAdminSpy,
  assertOrgMember: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn((id: string) => ({ id, get: orgGetSpy })),
      where: vi.fn(() => ({ limit: vi.fn(() => ({ kind: 'handle-query' })) })),
    })),
    runTransaction,
  },
}))

import { savePublicProfile } from '@/actions/public-profile'

const VALID = {
  enabled: true,
  handle: 'abbyscoffeecorner',
  links: [{ id: 'l1', title: 'My menu', url: 'https://example.com/menu' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  txGetSpy.mockResolvedValue({ empty: true, docs: [] })
})

describe('savePublicProfile', () => {
  it('requires org admin', async () => {
    await savePublicProfile('o1', VALID)
    expect(assertOrgAdminSpy).toHaveBeenCalledWith('o1')
  })

  it('rejects invalid payloads before touching Firestore', async () => {
    await expect(savePublicProfile('o1', { ...VALID, handle: 'x' })).rejects.toThrow()
    expect(runTransaction).not.toHaveBeenCalled()
  })

  it('writes the parsed profile and returns it', async () => {
    const saved = await savePublicProfile('o1', { ...VALID, bio: '  hi  ', display_name: '' })
    expect(saved.bio).toBe('hi')
    expect(saved).not.toHaveProperty('display_name')
    expect(txUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'o1' }),
      { public_profile: saved },
    )
  })

  it('rejects when another org holds the handle', async () => {
    txGetSpy.mockResolvedValue({ empty: false, docs: [{ id: 'other-org' }] })
    await expect(savePublicProfile('o1', VALID)).rejects.toThrow('That URL is taken.')
    expect(txUpdateSpy).not.toHaveBeenCalled()
  })

  it('allows re-saving your own handle', async () => {
    txGetSpy.mockResolvedValue({ empty: false, docs: [{ id: 'o1' }] })
    await expect(savePublicProfile('o1', VALID)).resolves.toBeTruthy()
    expect(txUpdateSpy).toHaveBeenCalled()
  })
})
