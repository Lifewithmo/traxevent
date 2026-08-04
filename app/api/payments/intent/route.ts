// app/api/payments/intent/route.ts
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { adminDb } from '@/lib/firebase-admin'
import type { Org, Event } from '@/lib/types'

export async function POST(req: Request) {
  const { orgSlug, eventSlug, familyId } = await req.json()
  if (!orgSlug || !eventSlug) {
    return NextResponse.json({ error: 'Missing orgSlug or eventSlug' }, { status: 400 })
  }

  // Look up org by slug
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) return NextResponse.json({ error: 'Org not found' }, { status: 404 })
  const org = orgSnap.docs[0].data() as Org

  if (!org.stripe_account_id) {
    return NextResponse.json(
      { error: 'This organization has not connected a Stripe account' },
      { status: 400 }
    )
  }

  // Look up event by slug
  const eventSnap = await adminDb
    .collection('orgs').doc(org.id)
    .collection('events').where('slug', '==', eventSlug).limit(1)
    .get()
  if (eventSnap.empty) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  const event = eventSnap.docs[0].data() as Event

  if (!event.payment_amount || event.payment_amount <= 0) {
    return NextResponse.json(
      { error: 'This event has no payment amount configured' },
      { status: 400 }
    )
  }

  const amountCents = Math.round(event.payment_amount * 100)
  const applicationFeeCents = Math.round(amountCents * 0.01) // 1% platform fee

  let paymentIntent: Awaited<ReturnType<typeof stripe.paymentIntents.create>>
  try {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        application_fee_amount: applicationFeeCents,
        automatic_payment_methods: { enabled: true },
        metadata: { familyId: familyId ?? '' },
      },
      { stripeAccount: org.stripe_account_id }
    )
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create payment' },
      { status: 502 }
    )
  }

  if (!paymentIntent.client_secret) {
    return NextResponse.json({ error: 'Payment intent has no client secret' }, { status: 500 })
  }

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    stripeAccountId: org.stripe_account_id,
  })
}
