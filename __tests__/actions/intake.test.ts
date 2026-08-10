import { describe, it, expect, vi, beforeEach } from 'vitest'

const { assertOrgAdminSpy, orgGetSpy, orgUpdateSpy } = vi.hoisted(() => ({
  assertOrgAdminSpy: vi.fn().mockResolvedValue(undefined),
  orgGetSpy: vi.fn(),
  orgUpdateSpy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: assertOrgAdminSpy,
  assertOrgMember: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: orgGetSpy, update: orgUpdateSpy })),
    })),
  },
}))

import { ensureIntakeToken, regenerateIntakeToken } from '@/actions/intake'

beforeEach(() => vi.clearAllMocks())

describe('ensureIntakeToken', () => {
  it('requires org admin', async () => {
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'o1', name: 'Org' }) })
    await ensureIntakeToken('o1')
    expect(assertOrgAdminSpy).toHaveBeenCalledWith('o1')
  })

  it('returns the existing token without writing', async () => {
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ intake_token: 'tok_existing' }) })
    expect(await ensureIntakeToken('o1')).toBe('tok_existing')
    expect(orgUpdateSpy).not.toHaveBeenCalled()
  })

  it('mints and persists a 48-hex token when absent', async () => {
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ name: 'Org' }) })
    const token = await ensureIntakeToken('o1')
    expect(token).toMatch(/^[0-9a-f]{48}$/)
    expect(orgUpdateSpy).toHaveBeenCalledWith({ intake_token: token })
  })

  it('throws when the org does not exist', async () => {
    orgGetSpy.mockResolvedValue({ exists: false })
    await expect(ensureIntakeToken('o1')).rejects.toThrow('Org not found')
  })
})

describe('regenerateIntakeToken', () => {
  it('requires admin and always writes a fresh token', async () => {
    const token = await regenerateIntakeToken('o1')
    expect(assertOrgAdminSpy).toHaveBeenCalledWith('o1')
    expect(token).toMatch(/^[0-9a-f]{48}$/)
    expect(orgUpdateSpy).toHaveBeenCalledWith({ intake_token: token })
  })
})
