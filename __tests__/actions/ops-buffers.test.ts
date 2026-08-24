import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Firestore to a chainable stub whose terminal `.update()` is a spy, so
// these tests exercise the guard + validation + persisted shape, not Firestore.
// Same harness as capacity-config.test.ts — the action is a clone of that pattern.
const orgDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    update: orgDocUpdateSpy,
  },
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))

import { updateOpsBuffers } from '@/actions/ops-buffers'

beforeEach(() => vi.clearAllMocks())

describe('updateOpsBuffers', () => {
  it('asserts admin then persists the ops_buffers scalar', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    await updateOpsBuffers('org-1', { pack_minutes: 50, drive_minutes: 20 })
    expect(assertOrgAdmin).toHaveBeenCalledWith('org-1')
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({
      ops_buffers: { pack_minutes: 50, drive_minutes: 20 },
    })
  })

  it('writes to the orgs/{orgId} document — pinning the write TARGET, not just the payload', async () => {
    const { adminDb } = await import('@/lib/firebase-admin')
    await updateOpsBuffers('org-1', { pack_minutes: 45 })
    expect(adminDb.collection).toHaveBeenCalledWith('orgs')
    expect(adminDb.collection).not.toHaveBeenCalledWith('org')
    expect(adminDb.doc).toHaveBeenCalledWith('org-1')
  })

  it('rejects and does NOT write when admin is denied', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    vi.mocked(assertOrgAdmin).mockRejectedValueOnce(new Error('Forbidden'))
    await expect(updateOpsBuffers('org-1', { pack_minutes: 45 })).rejects.toThrow('Forbidden')
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('an absent field is CLEARED (falls back to the constants), not preserved', async () => {
    // The action replaces the whole scalar: sending only drive_minutes drops a
    // previously stored pack_minutes.
    await updateOpsBuffers('org-1', { drive_minutes: 20 })
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({
      ops_buffers: { drive_minutes: 20 },
    })
    const payload = orgDocUpdateSpy.mock.calls[0][0] as { ops_buffers: Record<string, unknown> }
    expect('pack_minutes' in payload.ops_buffers).toBe(false)
  })

  it('an empty config clears BOTH fields (back to the 45m/30m defaults)', async () => {
    await updateOpsBuffers('org-1', {})
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({ ops_buffers: {} })
  })

  it('accepts the boundaries: 1 and 480 minutes', async () => {
    await updateOpsBuffers('org-1', { pack_minutes: 1, drive_minutes: 480 })
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({
      ops_buffers: { pack_minutes: 1, drive_minutes: 480 },
    })
  })

  it.each([
    ['zero', { pack_minutes: 0 }],
    ['negative', { drive_minutes: -15 }],
    ['fractional', { pack_minutes: 45.5 }],
    ['over the 480 ceiling', { drive_minutes: 481 }],
    ['NaN', { pack_minutes: Number.NaN }],
  ])('rejects a %s value and does NOT write', async (_label, cfg) => {
    await expect(updateOpsBuffers('org-1', cfg)).rejects.toThrow()
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('rejects a non-numeric value smuggled past the types', async () => {
    await expect(
      updateOpsBuffers('org-1', { pack_minutes: '45' as unknown as number }),
    ).rejects.toThrow()
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })
})
