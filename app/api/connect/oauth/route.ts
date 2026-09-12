import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { assertOrgAdmin } from '@/lib/auth/assert'
import {
  signConnectState,
  CONNECT_NONCE_COOKIE,
  CONNECT_STATE_MAX_AGE_SECONDS,
} from '@/lib/connect-state'
import type { Org } from '@/lib/types'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')
  const orgSlug = searchParams.get('orgSlug')
  if (!orgId || !orgSlug) {
    return NextResponse.json({ error: 'Missing orgId or orgSlug' }, { status: 400 })
  }

  // Only an authenticated owner/admin of THIS org may initiate a Connect bind.
  try {
    await assertOrgAdmin(orgId)
  } catch (err) {
    const unauthenticated = err instanceof Error && err.message === 'Unauthorized'
    return NextResponse.json(
      { error: unauthenticated ? 'Unauthorized' : 'Forbidden' },
      { status: unauthenticated ? 401 : 403 }
    )
  }

  // The slug feeds the post-connect redirect; only sign the org's real slug.
  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  if (!orgSnap.exists || (orgSnap.data() as Org).slug !== orgSlug) {
    return NextResponse.json({ error: 'Unknown org' }, { status: 404 })
  }

  const { state, nonce } = signConnectState({ orgId, orgSlug })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.STRIPE_CLIENT_ID!,
    scope: 'read_write',
    state,
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/connect/callback`,
  })

  const res = NextResponse.redirect(
    `https://connect.stripe.com/oauth/authorize?${params.toString()}`
  )
  // CSRF binding: the callback only accepts a state whose nonce matches this
  // httpOnly cookie, i.e. the browser that initiated the flow.
  res.cookies.set(CONNECT_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CONNECT_STATE_MAX_AGE_SECONDS,
  })
  return res
}
