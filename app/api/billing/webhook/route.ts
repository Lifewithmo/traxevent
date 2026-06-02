// app/api/billing/webhook/route.ts
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
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  const orgRef = (orgId: string) => adminDb.collection('orgs').doc(orgId)

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId = session.metadata?.orgId
      if (!orgId) break
      const customerId = typeof session.customer === 'string'
        ? session.customer
        : (session.customer as Stripe.Customer | null)?.id
      if (!customerId) break
      await orgRef(orgId).update({
        billing_status: 'active',
        stripe_customer_id: customerId,
      })
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.orgId
      if (!orgId) break
      await orgRef(orgId).update({ billing_status: 'inactive' })
      break
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.orgId
      if (!orgId) break
      await orgRef(orgId).update({
        billing_status: sub.status === 'active' ? 'active' : 'inactive',
      })
      break
    }
  }

  return new Response('ok')
}
