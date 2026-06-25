'use server'

import { stripe } from '@/lib/stripe'
import { adminDb } from '@/lib/firebase-admin'
import { assertNetworkAdmin } from '@/lib/auth/assert'
import type { Network } from '@/lib/types'

async function getNetwork(networkId: string): Promise<Network | null> {
  const snap = await adminDb.collection('networks').doc(networkId).get()
  return snap.exists ? (snap.data() as Network) : null
}

// Consolidated per-seat subscription for a whole network. quantity = member-org count.
export async function createNetworkCheckoutSession(networkId: string, networkSlug: string): Promise<string> {
  await assertNetworkAdmin(networkId)
  const network = await getNetwork(networkId)
  if (!network) throw new Error('Network not found')

  const orgsSnap = await adminDb.collection('orgs').where('network_id', '==', networkId).get()
  const quantity = Math.max(1, orgsSnap.size)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: process.env.STRIPE_NETWORK_PRICE_ID!, quantity }],
    metadata: { networkId },
    subscription_data: { metadata: { networkId } },
    ...(network.stripe_customer_id ? { customer: network.stripe_customer_id } : {}),
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/network/${networkSlug}/billing?success=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/network/${networkSlug}/billing`,
  })

  if (!session.url) throw new Error('Stripe did not return a session URL')
  return session.url
}

export async function createNetworkBillingPortalSession(networkId: string, networkSlug: string): Promise<string> {
  await assertNetworkAdmin(networkId)
  const network = await getNetwork(networkId)
  if (!network?.stripe_customer_id) throw new Error('No Stripe customer found — subscribe first')

  const session = await stripe.billingPortal.sessions.create({
    customer: network.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/network/${networkSlug}/billing`,
  })

  return session.url
}
