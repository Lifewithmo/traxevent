// app/api/billing/portal/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createBillingPortalSession } from '@/actions/billing'

export async function POST(req: NextRequest) {
  const { orgId, orgSlug } = await req.json()
  if (!orgId || !orgSlug) {
    return NextResponse.json({ error: 'Missing orgId or orgSlug' }, { status: 400 })
  }
  try {
    const url = await createBillingPortalSession(orgId, orgSlug)
    return NextResponse.json({ url })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to open portal' },
      { status: 500 }
    )
  }
}
