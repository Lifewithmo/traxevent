// app/api/payments/intent/route.ts
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { adminDb } from '@/lib/firebase-admin'
import type { Org, Camp } from '@/lib/types'

export async function POST(req: Request) {
  const { orgSlug, campSlug, familyId } = await req.json()
  if (!orgSlug || !campSlug) {
    return NextResponse.json({ error: 'Missing orgSlug or campSlug' }, { status: 400 })
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

  // Look up camp by slug
  const campSnap = await adminDb
    .collection('orgs').doc(org.id)
    .collection('camps').where('slug', '==', campSlug).limit(1)
    .get()
  if (campSnap.empty) return NextResponse.json({ error: 'Camp not found' }, { status: 404 })
  const camp = campSnap.docs[0].data() as Camp

  if (!camp.payment_amount || camp.payment_amount <= 0) {
    return NextResponse.json(
      { error: 'This event has no payment amount configured' },
      { status: 400 }
    )
  }

  const amountCents = Math.round(camp.payment_amount * 100)
  const applicationFeeCents = Math.round(amountCents * 0.01) // 1% platform fee

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: 'usd',
      application_fee_amount: applicationFeeCents,
      automatic_payment_methods: { enabled: true },
      metadata: { familyId: familyId ?? '' },
    },
    { stripeAccount: org.stripe_account_id }
  )

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    stripeAccountId: org.stripe_account_id,
  })
}
