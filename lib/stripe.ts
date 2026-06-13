// lib/stripe.ts
import Stripe from 'stripe'

let client: Stripe | null = null

function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    client = new Stripe(key, {
      apiVersion: '2026-05-27.dahlia',
    })
  }
  return client
}

// Lazy proxy: the Stripe client is only constructed on first property access
// (i.e. at request time inside a handler), not when this module is imported.
// This keeps `next build` page-data collection from requiring STRIPE_SECRET_KEY
// at build time, while leaving every `stripe.x()` call site unchanged.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const c = getStripe()
    const value = Reflect.get(c, prop, receiver)
    return typeof value === 'function' ? value.bind(c) : value
  },
})
