// app/api/billing/network-portal/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createNetworkBillingPortalSession } from '@/actions/network-billing'

export async function POST(req: NextRequest) {
  const { networkId, networkSlug } = await req.json()
  if (!networkId || !networkSlug) {
    return NextResponse.json({ error: 'Missing networkId or networkSlug' }, { status: 400 })
  }
  try {
    const url = await createNetworkBillingPortalSession(networkId, networkSlug)
    return NextResponse.json({ url })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to open portal' },
      { status: 500 }
    )
  }
}
