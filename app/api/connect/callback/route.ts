import { NextResponse, type NextRequest } from 'next/server'
import { stripe } from '@/lib/stripe'
import { adminDb } from '@/lib/firebase-admin'
import { assertOrgAdmin } from '@/lib/auth/assert'
import { verifyConnectState, CONNECT_NONCE_COOKIE } from '@/lib/connect-state'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const stateRaw = searchParams.get('state')

  if (!code) return new Response('Missing code', { status: 400 })
  if (!stateRaw) return new Response('Missing state', { status: 400 })

  // 1. The state must be one WE signed, fresh, and well-formed. Nothing in it
  //    is trusted before the signature verifies.
  const verdict = verifyConnectState(stateRaw)
  if (!verdict.ok) {
    if (verdict.reason === 'expired') return new Response('State expired', { status: 403 })
    if (verdict.reason === 'bad-signature') {
      return new Response('Invalid state signature', { status: 403 })
    }
    return new Response('Invalid state parameter', { status: 400 })
  }
  const { orgId, orgSlug, nonce } = verdict.payload

  // 2. CSRF binding: the flow must complete in the same browser that
  //    initiated it (the nonce cookie is set by /api/connect/oauth).
  const cookieNonce = req.cookies.get(CONNECT_NONCE_COOKIE)?.value
  if (!cookieNonce || cookieNonce !== nonce) {
    return new Response('State does not match this session', { status: 403 })
  }

  // 3. Only an authenticated owner/admin of the org named in the (signed)
  //    state may complete the bind — checked before the token exchange and
  //    before any write.
  try {
    await assertOrgAdmin(orgId)
  } catch (err) {
    const unauthenticated = err instanceof Error && err.message === 'Unauthorized'
    return new Response(unauthenticated ? 'Unauthorized' : 'Forbidden', {
      status: unauthenticated ? 401 : 403,
    })
  }

  let response: Awaited<ReturnType<typeof stripe.oauth.token>>
  try {
    response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    })
  } catch {
    return new Response('Stripe OAuth exchange failed', { status: 502 })
  }

  if (!response.stripe_user_id) {
    return new Response('Stripe did not return account ID', { status: 502 })
  }

  await adminDb.collection('orgs').doc(orgId).update({
    stripe_account_id: response.stripe_user_id,
  })

  const res = NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_BASE_URL}/${orgSlug}/billing?connected=1`,
    { status: 302 }
  )
  // The nonce is single-flow; clear it once the bind completes.
  res.cookies.delete(CONNECT_NONCE_COOKIE)
  return res
}
