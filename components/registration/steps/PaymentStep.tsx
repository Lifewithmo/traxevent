'use client'

import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'

interface PaymentStepProps {
  orgSlug: string
  campSlug: string
  familyId: string
  paymentAmount: number
  onSuccess: () => void
  onBack: () => void
}

function CheckoutForm({ onSuccess, onBack }: { onSuccess: () => void; onBack: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    const result = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })
    if (result.error) {
      setError(result.error.message ?? 'Payment failed')
      setSubmitting(false)
    } else {
      onSuccess()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button type="submit" disabled={submitting || !stripe}>
          {submitting ? 'Processing…' : 'Pay and complete registration'}
        </Button>
      </div>
    </form>
  )
}

export function PaymentStep({ orgSlug, campSlug, familyId, paymentAmount, onSuccess, onBack }: PaymentStepProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/payments/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgSlug, campSlug, familyId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setLoadError(data.error)
        } else {
          setClientSecret(data.clientSecret)
          setStripeAccountId(data.stripeAccountId)
        }
      })
      .catch(() => setLoadError('Failed to initialize payment'))
  }, [orgSlug, campSlug, familyId])

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" onClick={onBack}>Back</Button>
      </div>
    )
  }

  if (!clientSecret || !stripeAccountId) {
    return <p className="text-sm text-muted-foreground">Loading payment form…</p>
  }

  const stripePromise = loadStripe(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
    { stripeAccount: stripeAccountId }
  )

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">Registration fee</p>
        <p className="text-2xl font-bold">${paymentAmount.toFixed(2)}</p>
      </div>
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <CheckoutForm onSuccess={onSuccess} onBack={onBack} />
      </Elements>
    </div>
  )
}
