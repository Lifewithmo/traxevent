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
  const networkRef = (networkId: string) => adminDb.collection('networks').doc(networkId)

  // Cascade a billing_status to every member org of a network.
  async function cascadeMemberOrgBilling(networkId: string, status: 'network_managed' | 'inactive') {
    const snap = await adminDb.collection('orgs').where('network_id', '==', networkId).get()
    await Promise.all(snap.docs.map((d) => d.ref.update({ billing_status: status })))
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const customerId = typeof session.customer === 'string'
        ? session.customer
        : (session.customer as Stripe.Customer | null)?.id
      if (!customerId) break
      const networkId = session.metadata?.networkId
      if (networkId) {
        await networkRef(networkId).update({ billing_status: 'active', stripe_customer_id: customerId })
        await cascadeMemberOrgBilling(networkId, 'network_managed')
        break
      }
      const orgId = session.metadata?.orgId
      if (!orgId) break
      await orgRef(orgId).update({ billing_status: 'active', stripe_customer_id: customerId })
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const networkId = sub.metadata?.networkId
      if (networkId) {
        await networkRef(networkId).update({ billing_status: 'inactive' })
        await cascadeMemberOrgBilling(networkId, 'inactive')
        break
      }
      const orgId = sub.metadata?.orgId
      if (!orgId) break
      await orgRef(orgId).update({ billing_status: 'inactive' })
      break
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const active = sub.status === 'active'
      const networkId = sub.metadata?.networkId
      if (networkId) {
        await networkRef(networkId).update({ billing_status: active ? 'active' : 'inactive' })
        await cascadeMemberOrgBilling(networkId, active ? 'network_managed' : 'inactive')
        break
      }
      const orgId = sub.metadata?.orgId
      if (!orgId) break
      await orgRef(orgId).update({ billing_status: active ? 'active' : 'inactive' })
      break
    }
  }

  return new Response('ok')
}
