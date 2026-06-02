import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')
  const orgSlug = searchParams.get('orgSlug')
  if (!orgId || !orgSlug) {
    return NextResponse.json({ error: 'Missing orgId or orgSlug' }, { status: 400 })
  }

  const state = JSON.stringify({ orgId, orgSlug })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.STRIPE_CLIENT_ID!,
    scope: 'read_write',
    state,
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/connect/callback`,
  })

  return NextResponse.redirect(
    `https://connect.stripe.com/oauth/authorize?${params.toString()}`
  )
}
