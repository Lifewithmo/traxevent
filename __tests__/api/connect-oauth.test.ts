import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Signing env for lib/connect-state (read at call time, not import time).
process.env.CONNECT_STATE_SECRET = 'test-connect-state-secret'
process.env.STRIPE_CLIENT_ID = 'ca_test_123'
process.env.NEXT_PUBLIC_BASE_URL = 'https://app.test'

const assertOrgAdminSpy = vi.hoisted(() => vi.fn())
const orgDocGet = vi.hoisted(() => vi.fn())
const orgDocUpdate = vi.hoisted(() => vi.fn())
const docSpy = vi.hoisted(() => vi.fn())
const oauthTokenSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: assertOrgAdminSpy,
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => {
        docSpy(name, id)
        return { get: orgDocGet, update: orgDocUpdate }
      },
    }),
  },
}))

vi.mock('@/lib/stripe', () => ({
  stripe: { oauth: { token: oauthTokenSpy } },
}))

import { GET as oauthGET } from '@/app/api/connect/oauth/route'
import { GET as callbackGET } from '@/app/api/connect/callback/route'
import {
  signConnectState,
  verifyConnectState,
  CONNECT_NONCE_COOKIE,
} from '@/lib/connect-state'

function oauthReq(query: string) {
  return new Request(`https://app.test/api/connect/oauth${query}`)
}

function callbackReq(state: string, nonce?: string) {
  const url = `https://app.test/api/connect/callback?code=ac_123&state=${encodeURIComponent(state)}`
  return new NextRequest(
    url,
    nonce !== undefined ? { headers: { cookie: `${CONNECT_NONCE_COOKIE}=${nonce}` } } : undefined
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  assertOrgAdminSpy.mockResolvedValue({ role: 'owner' })
  orgDocGet.mockResolvedValue({ exists: true, data: () => ({ slug: 'acme' }) })
  orgDocUpdate.mockResolvedValue(undefined)
  oauthTokenSpy.mockResolvedValue({ stripe_user_id: 'acct_new_123' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/connect/oauth', () => {
  it('rejects an unauthenticated caller with 401 before touching the org', async () => {
    assertOrgAdminSpy.mockRejectedValue(new Error('Unauthorized'))
    const res = await oauthGET(oauthReq('?orgId=org-1&orgSlug=acme'))
    expect(res.status).toBe(401)
    expect(orgDocGet).not.toHaveBeenCalled()
  })

  it('rejects a caller who is not an owner/admin of that org with 403', async () => {
    assertOrgAdminSpy.mockRejectedValue(new Error('Forbidden'))
    const res = await oauthGET(oauthReq('?orgId=victim-org&orgSlug=victim'))
    expect(res.status).toBe(403)
    expect(assertOrgAdminSpy).toHaveBeenCalledWith('victim-org')
  })

  it('still 400s on missing params', async () => {
    const res = await oauthGET(oauthReq('?orgId=org-1'))
    expect(res.status).toBe(400)
  })

  it('rejects a slug that does not belong to the org', async () => {
    const res = await oauthGET(oauthReq('?orgId=org-1&orgSlug=someone-else'))
    expect(res.status).toBe(404)
  })

  it('redirects an org admin to Stripe with a verifiable signed state + nonce cookie', async () => {
    const res = await oauthGET(oauthReq('?orgId=org-1&orgSlug=acme'))
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)

    const location = res.headers.get('location')
    expect(location).toContain('https://connect.stripe.com/oauth/authorize')
    const url = new URL(location!)
    expect(url.searchParams.get('client_id')).toBe('ca_test_123')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.test/api/connect/callback')

    // The state must verify with the real verifier and name the right org.
    const state = url.searchParams.get('state')!
    const verdict = verifyConnectState(state)
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(verdict.payload.orgId).toBe('org-1')
    expect(verdict.payload.orgSlug).toBe('acme')

    // The CSRF nonce cookie must match the nonce inside the signed state.
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(`${CONNECT_NONCE_COOKIE}=${verdict.payload.nonce}`)
    expect(setCookie.toLowerCase()).toContain('httponly')
  })
})

describe('GET /api/connect/callback', () => {
  it('still 400s on missing code or state', async () => {
    const noCode = await callbackGET(new NextRequest('https://app.test/api/connect/callback?state=x'))
    expect(noCode.status).toBe(400)
    const noState = await callbackGET(new NextRequest('https://app.test/api/connect/callback?code=x'))
    expect(noState.status).toBe(400)
  })

  it('rejects garbage state with 400 and never exchanges the code', async () => {
    const res = await callbackGET(callbackReq('not-json', 'whatever'))
    expect(res.status).toBe(400)
    expect(oauthTokenSpy).not.toHaveBeenCalled()
    expect(orgDocUpdate).not.toHaveBeenCalled()
  })

  it('rejects the legacy plaintext-JSON state (attacker-craftable) with 400 and never writes', async () => {
    const res = await callbackGET(
      callbackReq(JSON.stringify({ orgId: 'victim-org', orgSlug: 'victim' }), 'whatever')
    )
    expect(res.status).toBe(400)
    expect(oauthTokenSpy).not.toHaveBeenCalled()
    expect(orgDocUpdate).not.toHaveBeenCalled()
  })

  it('rejects a state whose payload was tampered with (signature mismatch) and never writes', async () => {
    const { state, nonce } = signConnectState({ orgId: 'org-1', orgSlug: 'acme' })
    const [body, sig] = state.split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    const forgedBody = Buffer.from(
      JSON.stringify({ ...payload, orgId: 'victim-org' }),
      'utf8'
    ).toString('base64url')
    const res = await callbackGET(callbackReq(`${forgedBody}.${sig}`, nonce))
    expect(res.status).toBe(403)
    expect(oauthTokenSpy).not.toHaveBeenCalled()
    expect(orgDocUpdate).not.toHaveBeenCalled()
  })

  it('rejects an expired state and never writes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    const { state, nonce } = signConnectState({ orgId: 'org-1', orgSlug: 'acme' })
    vi.setSystemTime(new Date('2026-08-24T12:00:01Z')) // > 1h later
    const res = await callbackGET(callbackReq(state, nonce))
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('State expired')
    expect(orgDocUpdate).not.toHaveBeenCalled()
  })

  it('rejects when the CSRF nonce cookie is missing or does not match', async () => {
    const { state, nonce } = signConnectState({ orgId: 'org-1', orgSlug: 'acme' })

    const missing = await callbackGET(callbackReq(state))
    expect(missing.status).toBe(403)

    const mismatched = await callbackGET(callbackReq(state, `${nonce}x`))
    expect(mismatched.status).toBe(403)

    expect(oauthTokenSpy).not.toHaveBeenCalled()
    expect(orgDocUpdate).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller with 401 before the token exchange', async () => {
    assertOrgAdminSpy.mockRejectedValue(new Error('Unauthorized'))
    const { state, nonce } = signConnectState({ orgId: 'org-1', orgSlug: 'acme' })
    const res = await callbackGET(callbackReq(state, nonce))
    expect(res.status).toBe(401)
    expect(oauthTokenSpy).not.toHaveBeenCalled()
    expect(orgDocUpdate).not.toHaveBeenCalled()
  })

  it('rejects a caller who is not an admin of the org named in the state', async () => {
    assertOrgAdminSpy.mockRejectedValue(new Error('Forbidden'))
    const { state, nonce } = signConnectState({ orgId: 'org-1', orgSlug: 'acme' })
    const res = await callbackGET(callbackReq(state, nonce))
    expect(res.status).toBe(403)
    // The guard must be run against the org from the SIGNED state.
    expect(assertOrgAdminSpy).toHaveBeenCalledWith('org-1')
    expect(oauthTokenSpy).not.toHaveBeenCalled()
    expect(orgDocUpdate).not.toHaveBeenCalled()
  })

  it('happy path: exchanges the code, writes stripe_account_id, redirects, clears the nonce', async () => {
    const { state, nonce } = signConnectState({ orgId: 'org-1', orgSlug: 'acme' })
    const res = await callbackGET(callbackReq(state, nonce))

    expect(oauthTokenSpy).toHaveBeenCalledWith({
      grant_type: 'authorization_code',
      code: 'ac_123',
    })
    expect(docSpy).toHaveBeenCalledWith('orgs', 'org-1')
    expect(orgDocUpdate).toHaveBeenCalledWith({ stripe_account_id: 'acct_new_123' })

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://app.test/acme/billing?connected=1')
    // Single-flow nonce is cleared after completion.
    expect(res.headers.get('set-cookie') ?? '').toContain(`${CONNECT_NONCE_COOKIE}=;`)
  })
})
