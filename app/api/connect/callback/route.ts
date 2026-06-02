import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { adminDb } from '@/lib/firebase-admin'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const stateRaw = searchParams.get('state')

  if (!code) return new Response('Missing code', { status: 400 })
  if (!stateRaw) return new Response('Missing state', { status: 400 })

  let orgId: string
  let orgSlug: string
  try {
    const state = JSON.parse(stateRaw) as { orgId: string; orgSlug: string }
    orgId = state.orgId
    orgSlug = state.orgSlug
  } catch {
    return new Response('Invalid state parameter', { status: 400 })
  }

  const response = await stripe.oauth.token({
    grant_type: 'authorization_code',
    code,
  })

  await adminDb.collection('orgs').doc(orgId).update({
    stripe_account_id: response.stripe_user_id,
  })

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_BASE_URL}/${orgSlug}/billing?connected=1`,
    { status: 302 }
  )
}
