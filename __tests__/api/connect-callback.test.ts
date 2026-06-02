import { describe, it, expect, vi, beforeEach } from 'vitest'

const orgUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const oauthTokenSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        update: orgUpdateSpy,
      }),
    }),
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    oauth: {
      token: oauthTokenSpy,
    },
  },
}))

import { GET } from '@/app/api/connect/callback/route'

describe('GET /api/connect/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000'
  })

  it('exchanges code and stores stripe_account_id, then redirects to billing page', async () => {
    oauthTokenSpy.mockResolvedValue({ stripe_user_id: 'acct_123xyz' })
    const state = encodeURIComponent(JSON.stringify({ orgId: 'org-1', orgSlug: 'acme' }))
    const req = new Request(`http://localhost/api/connect/callback?code=auth_code_abc&state=${state}`)
    const res = await GET(req)
    expect(oauthTokenSpy).toHaveBeenCalledWith({
      grant_type: 'authorization_code',
      code: 'auth_code_abc',
    })
    expect(orgUpdateSpy).toHaveBeenCalledWith({ stripe_account_id: 'acct_123xyz' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost:3000/acme/billing?connected=1')
  })

  it('returns 400 when code is missing', async () => {
    const state = encodeURIComponent(JSON.stringify({ orgId: 'org-1', orgSlug: 'acme' }))
    const req = new Request(`http://localhost/api/connect/callback?state=${state}`)
    const res = await GET(req)
    expect(res.status).toBe(400)
    expect(oauthTokenSpy).not.toHaveBeenCalled()
  })

  it('returns 400 when state is missing', async () => {
    const req = new Request('http://localhost/api/connect/callback?code=auth_code_abc')
    const res = await GET(req)
    expect(res.status).toBe(400)
    expect(oauthTokenSpy).not.toHaveBeenCalled()
  })
})
