// actions/billing.ts
'use server'

import { stripe } from '@/lib/stripe'
import { getOrg } from '@/actions/orgs'

export async function createCheckoutSession(orgId: string, orgSlug: string): Promise<string> {
  const org = await getOrg(orgId)
  if (!org) throw new Error('Organization not found')

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    metadata: { orgId },
    subscription_data: {
      metadata: { orgId },
    },
    ...(org.stripe_customer_id ? { customer: org.stripe_customer_id } : {}),
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${orgSlug}/billing?success=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${orgSlug}/billing`,
  })

  if (!session.url) throw new Error('Stripe did not return a session URL')
  return session.url
}

export async function createBillingPortalSession(orgId: string, orgSlug: string): Promise<string> {
  const org = await getOrg(orgId)
  if (!org?.stripe_customer_id) throw new Error('No Stripe customer found — subscribe first')

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${orgSlug}/billing`,
  })

  return session.url
}
