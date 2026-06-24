import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifySessionCookieSpy = vi.hoisted(() => vi.fn())
const cookieGetSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { verifySessionCookie: verifySessionCookieSpy },
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: cookieGetSpy })),
}))

import { getCurrentUser } from '@/lib/auth/session'

describe('getCurrentUser', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when there is no session cookie', async () => {
    cookieGetSpy.mockReturnValue(undefined)
    expect(await getCurrentUser()).toBeNull()
  })

  it('returns null when the cookie fails verification', async () => {
    cookieGetSpy.mockReturnValue({ value: 'bad' })
    verifySessionCookieSpy.mockRejectedValue(new Error('invalid'))
    expect(await getCurrentUser()).toBeNull()
  })

  it('returns the decoded identity for a valid session cookie', async () => {
    cookieGetSpy.mockReturnValue({ value: 'good' })
    verifySessionCookieSpy.mockResolvedValue({ uid: 'u1', orgId: 'o1', orgSlug: 'first-hills', role: 'staff' })
    const user = await getCurrentUser()
    expect(user).toEqual({ uid: 'u1', orgId: 'o1', orgSlug: 'first-hills', role: 'staff' })
  })

  it('tolerates a token missing org claims (registrant)', async () => {
    cookieGetSpy.mockReturnValue({ value: 'good' })
    verifySessionCookieSpy.mockResolvedValue({ uid: 'u2' })
    const user = await getCurrentUser()
    expect(user).toEqual({ uid: 'u2', orgId: undefined, orgSlug: undefined, role: undefined })
  })
})
