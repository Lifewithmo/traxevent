// app/api/billing/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createCheckoutSession } from '@/actions/billing'

export async function POST(req: NextRequest) {
  const { orgId, orgSlug } = await req.json()
  if (!orgId || !orgSlug) {
    return NextResponse.json({ error: 'Missing orgId or orgSlug' }, { status: 400 })
  }
  try {
    const url = await createCheckoutSession(orgId, orgSlug)
    return NextResponse.json({ url })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create checkout' },
      { status: 500 }
    )
  }
}
