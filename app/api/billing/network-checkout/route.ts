// app/api/billing/network-checkout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createNetworkCheckoutSession } from '@/actions/network-billing'

export async function POST(req: NextRequest) {
  const { networkId, networkSlug } = await req.json()
  if (!networkId || !networkSlug) {
    return NextResponse.json({ error: 'Missing networkId or networkSlug' }, { status: 400 })
  }
  try {
    const url = await createNetworkCheckoutSession(networkId, networkSlug)
    return NextResponse.json({ url })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create checkout' },
      { status: 500 }
    )
  }
}
