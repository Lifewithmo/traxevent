import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Firestore to a chainable stub whose terminal `.update()` is a spy, so
// these tests exercise the guard + validation + persisted shape, not Firestore.
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

import { updateServiceableDays, updateResourceLabels } from '@/actions/capacity-config'

beforeEach(() => vi.clearAllMocks())

describe('updateServiceableDays', () => {
  it('asserts admin then persists the serviceable_days scalar', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    await updateServiceableDays('org-1', {
      weekdays: [1, 2, 3, 4, 5],
      closures: [{ start: '2026-12-24', end: '2026-12-26', note: 'Holiday' }],
    })
    expect(assertOrgAdmin).toHaveBeenCalledWith('org-1')
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({
      serviceable_days: {
        weekdays: [1, 2, 3, 4, 5],
        closures: [{ start: '2026-12-24', end: '2026-12-26', note: 'Holiday' }],
      },
    })
  })

  it('accepts an empty weekdays array (operator closed every day)', async () => {
    await updateServiceableDays('org-1', { weekdays: [] })
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({ serviceable_days: { weekdays: [] } })
  })

  it('writes to the orgs/{orgId} document — pinning the write TARGET, not just the payload', async () => {
    // Guards against a regression that updates the right shape at the wrong path
    // (e.g. collection('org') or a different doc) — the payload spy alone can't catch it.
    const { adminDb } = await import('@/lib/firebase-admin')
    await updateServiceableDays('org-1', { weekdays: [6, 0] })
    expect(adminDb.collection).toHaveBeenCalledWith('orgs')
    expect(adminDb.collection).not.toHaveBeenCalledWith('org')
    expect(adminDb.doc).toHaveBeenCalledWith('org-1')
  })

  it('rejects and does NOT write when admin is denied', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    vi.mocked(assertOrgAdmin).mockRejectedValueOnce(new Error('Forbidden'))
    await expect(updateServiceableDays('org-1', { weekdays: [1] })).rejects.toThrow('Forbidden')
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('rejects a weekday outside 0..6', async () => {
    await expect(updateServiceableDays('org-1', { weekdays: [1, 7] })).rejects.toThrow()
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('rejects a non-integer weekday', async () => {
    await expect(updateServiceableDays('org-1', { weekdays: [1.5] })).rejects.toThrow()
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('rejects a malformed closure (start after end)', async () => {
    await expect(
      updateServiceableDays('org-1', { closures: [{ start: '2026-12-26', end: '2026-12-24' }] }),
    ).rejects.toThrow()
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })
})

describe('updateResourceLabels', () => {
  it('asserts admin then persists trimmed labels', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    await updateResourceLabels('org-1', {
      mobile: { one: '  Cart ', many: ' Carts ' },
    })
    expect(assertOrgAdmin).toHaveBeenCalledWith('org-1')
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({
      resource_labels: { mobile: { one: 'Cart', many: 'Carts' } },
    })
  })

  it('persists both kinds when both provided', async () => {
    await updateResourceLabels('org-1', {
      mobile: { one: 'Cart', many: 'Carts' },
      venue: { one: 'Room', many: 'Rooms' },
    })
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({
      resource_labels: {
        mobile: { one: 'Cart', many: 'Carts' },
        venue: { one: 'Room', many: 'Rooms' },
      },
    })
  })

  it('rejects an empty singular or plural label', async () => {
    await expect(updateResourceLabels('org-1', { mobile: { one: 'Cart', many: '  ' } })).rejects.toThrow()
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('rejects and does NOT write when admin is denied', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    vi.mocked(assertOrgAdmin).mockRejectedValueOnce(new Error('Forbidden'))
    await expect(
      updateResourceLabels('org-1', { mobile: { one: 'Cart', many: 'Carts' } }),
    ).rejects.toThrow('Forbidden')
    expect(orgDocUpdateSpy).not.toHaveBeenCalled()
  })
})
