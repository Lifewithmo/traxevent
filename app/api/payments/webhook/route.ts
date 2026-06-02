// app/api/payments/webhook/route.ts
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { headers } from 'next/headers'
import { adminDb } from '@/lib/firebase-admin'

export async function POST(req: Request) {
  const body = await req.text()
  const headersList = await headers()
  const sig = headersList.get('stripe-signature')

  if (!sig) return new Response('Missing stripe-signature header', { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_PAYMENT_WEBHOOK_SECRET!)
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent
    const familyId = pi.metadata?.familyId
    if (!familyId) return new Response('ok')

    const snap = await adminDb
      .collectionGroup('families')
      .where('id', '==', familyId)
      .limit(1)
      .get()

    if (!snap.empty) {
      try {
        await snap.docs[0].ref.update({
          payment_status: 'paid',
          amount_paid: pi.amount / 100,
          updated_at: new Date().toISOString(),
        })
      } catch {
        return new Response('Firestore update failed', { status: 500 })
      }
    }
  }

  return new Response('ok')
}
