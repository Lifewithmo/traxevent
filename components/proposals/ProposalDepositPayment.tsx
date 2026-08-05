'use client'

import { useState, useEffect, useMemo } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

interface ProposalDepositPaymentProps {
  token: string
  depositAmount: number
  onSuccess: () => void
  // Only required when `beforeAccept` is true — the intent route stashes
  // these as `pending_signature` (never `signProposal`'d directly) so the
  // webhook can promote them to the authoritative signature once the
  // deposit succeeds.
  beforeAccept?: boolean
  signer?: { signer_name: string; signer_email: string }
  consent?: boolean
  selection?: { package_id?: string; optional_item_ids: string[] }
}

function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
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
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <Button type="submit" disabled={submitting || !stripe}>
        {submitting ? 'Processing…' : 'Pay deposit'}
      </Button>
    </form>
  )
}

export function ProposalDepositPayment({
  token,
  depositAmount,
  onSuccess,
  beforeAccept,
  signer,
  consent,
  selection,
}: ProposalDepositPaymentProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setClientSecret(null)
    setStripeAccountId(null)
    setLoadError(null)
    fetch('/api/payments/proposal-deposit/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        ...(beforeAccept
          ? {
              signer_name: signer?.signer_name,
              signer_email: signer?.signer_email,
              consent,
              selection,
            }
          : {}),
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.error) {
          setLoadError(data.error)
        } else {
          setClientSecret(data.clientSecret)
          setStripeAccountId(data.stripeAccountId)
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError('Failed to initialize payment')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, beforeAccept])

  const stripePromise = useMemo(
    () =>
      stripeAccountId
        ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, {
            stripeAccount: stripeAccountId,
          })
        : null,
    [stripeAccountId],
  )

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-gray-900">Deposit due</p>
        <p className="text-2xl font-bold text-gray-900">{money(depositAmount)}</p>
      </div>
      {loadError ? (
        <div aria-live="polite" aria-atomic="true">
          <p className="text-sm text-red-600">{loadError}</p>
        </div>
      ) : !clientSecret || !stripeAccountId ? (
        <p className="text-sm text-gray-500">Loading payment form…</p>
      ) : (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <CheckoutForm onSuccess={onSuccess} />
        </Elements>
      )}
    </div>
  )
}
