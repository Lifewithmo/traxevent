import { describe, it, expect, vi, beforeEach } from 'vitest'

const { leadGetSpy, leadUpdateSpy } = vi.hoisted(() => ({
  leadGetSpy: vi.fn(),
  leadUpdateSpy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/firebase-admin', () => {
  const leadRef = { get: leadGetSpy, update: leadUpdateSpy }
  const leadsCol = { doc: vi.fn().mockReturnValue(leadRef) }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => {
      if (sub === 'leads') return leadsCol
      return {}
    }),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }),
    },
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))

vi.mock('@/lib/tokens', () => ({
  generateAccessToken: vi.fn().mockReturnValue('tok_client'),
}))

import { ensureClientPortalToken } from '@/actions/client-portal'

describe('ensureClientPortalToken', () => {
  beforeEach(() => vi.clearAllMocks())

  it('generates a token, updates the lead, and returns it when none exists', async () => {
    leadGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'lead-1', name: 'Ada', stage: 'inquiry', created_at: 'x' }),
    })
    const token = await ensureClientPortalToken('org-1', 'lead-1')
    expect(token).toBe('tok_client')
    expect(leadUpdateSpy).toHaveBeenCalledTimes(1)
    expect(leadUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ portal_token: 'tok_client', updated_at: expect.any(String) }),
    )
  })

  it('returns the existing token without updating when one is set', async () => {
    leadGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'lead-1', name: 'Ada', stage: 'inquiry', portal_token: 'existing', created_at: 'x' }),
    })
    const token = await ensureClientPortalToken('org-1', 'lead-1')
    expect(token).toBe('existing')
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws "Lead not found" when the lead does not exist', async () => {
    leadGetSpy.mockResolvedValue({ exists: false })
    await expect(ensureClientPortalToken('org-1', 'missing')).rejects.toThrow('Lead not found')
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })
})
