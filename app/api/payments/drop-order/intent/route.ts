// Drop-order checkout: pending-order hold + PaymentIntent on the org's
// connected account. NO application_fee_amount — monetization is the monthly
// subscription (spec 2026-08-15 §1 decision 2).
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createHash } from 'crypto'
import { stripe } from '@/lib/stripe'
import { getOrgByHandle } from '@/lib/public-profile-server'
import { getDropCore } from '@/lib/storefront/drops'
import { createPendingOrderCore, deletePendingOrderCore } from '@/lib/storefront/orders'
import { checkRateLimit } from '@/lib/rate-limit'
import type { CartLine } from '@/lib/storefront/drop-logic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const handle = typeof body?.handle === 'string' ? body.handle : ''
  const dropId = typeof body?.drop_id === 'string' ? body.drop_id : ''
  if (!handle || !dropId) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim()
  const ipHash = createHash('sha256').update(ip || 'unknown').digest('hex')
  const rl = await checkRateLimit(`checkout:ip:${ipHash}`, { limit: 20, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests — please try again later.' }, { status: 429 })

  const org = await getOrgByHandle(handle)
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!org.stripe_account_id) {
    return NextResponse.json({ error: 'This shop is not accepting card payments yet' }, { status: 400 })
  }
  const drop = await getDropCore(org.id, dropId)
  if (!drop) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cart = Array.isArray(body?.cart) ? (body.cart as CartLine[]) : []
  let order
  try {
    order = await createPendingOrderCore(org.id, drop, {
      cart,
      buyer: {
        name: typeof body?.buyer?.name === 'string' ? body.buyer.name : '',
        email: typeof body?.buyer?.email === 'string' ? body.buyer.email : '',
        ...(typeof body?.buyer?.phone === 'string' && body.buyer.phone ? { phone: body.buyer.phone } : {}),
      },
      pickup_window_id: typeof body?.pickup_window_id === 'string' ? body.pickup_window_id : '',
      ...(typeof body?.pickup_slot === 'string' ? { pickup_slot: body.pickup_slot } : {}),
      ...(typeof body?.tip === 'number' ? { tip: body.tip } : {}),
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not start checkout' },
      { status: 400 },
    )
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Math.round(order.total * 100),
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: { purpose: 'drop_order', order_id: order.id, org_id: org.id },
      },
      { stripeAccount: org.stripe_account_id },
    )
    if (!paymentIntent.client_secret) throw new Error('Payment intent has no client secret')
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      stripeAccountId: org.stripe_account_id,
      orderToken: order.token,
    })
  } catch (err: unknown) {
    // Release the hold — otherwise the buyer's items stay reserved 15 minutes
    // for a payment that can never happen.
    await deletePendingOrderCore(org.id, order.id)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create payment' },
      { status: 502 },
    )
  }
}
