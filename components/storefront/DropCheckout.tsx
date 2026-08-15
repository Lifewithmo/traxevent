'use client'

import { useState, useEffect, useMemo } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'

export interface CheckoutRequest {
  handle: string
  drop_id: string
  cart: Array<{ product_id: string; qty: number }>
  buyer: { name: string; email: string; phone?: string }
  pickup_window_id: string
  pickup_slot?: string
  tip?: number
}

function PayForm({ total, onPaid }: { total: number; onPaid: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required' })
    if (result.error) {
      setError(result.error.message ?? 'Payment failed')
      setSubmitting(false)
    } else {
      onPaid()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <Button type="submit" disabled={submitting || !stripe} className="w-full">
        {submitting ? 'Processing…' : `Pay $${total.toFixed(2)}`}
      </Button>
    </form>
  )
}

export function DropCheckout({ request, total }: { request: CheckoutRequest; total: number }) {
  const [intent, setIntent] = useState<{
    clientSecret?: string
    stripeAccountId?: string
    orderToken?: string
    error?: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/payments/drop-order/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setIntent(data.error ? { error: data.error } : data)
      })
      .catch(() => {
        if (!cancelled) setIntent({ error: 'Failed to start checkout — please try again' })
      })
    return () => {
      cancelled = true
    }
    // The request is captured once on mount — the parent remounts this
    // component (key) if the cart changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stripeAccountId = intent?.stripeAccountId
  const stripePromise = useMemo(
    () => (stripeAccountId ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, { stripeAccount: stripeAccountId }) : null),
    [stripeAccountId],
  )

  if (intent?.error) {
    return (
      <div aria-live="polite" aria-atomic="true">
        <p className="text-sm text-red-600">{intent.error}</p>
      </div>
    )
  }
  if (!intent?.clientSecret || !stripePromise) {
    return <p className="text-sm text-gray-500">Loading payment form…</p>
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret: intent.clientSecret }}>
      <PayForm
        total={total}
        onPaid={() => {
          // Status page owns the post-payment experience (webhook may lag —
          // it renders a "confirming" state while the order is pending).
          window.location.assign(`/orders/${intent.orderToken}`)
        }}
      />
    </Elements>
  )
}
