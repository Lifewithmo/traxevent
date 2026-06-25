'use client'

import { Suspense } from 'react'
import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { getOrgBySlug } from '@/actions/orgs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Org } from '@/lib/types'

function BillingContent() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [org, setOrg] = useState<Org | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const justSubscribed = searchParams.get('success') === '1'
  const justConnected = searchParams.get('connected') === '1'

  useEffect(() => {
    getOrgBySlug(orgSlug)
      .then(setOrg)
      .catch(() => setError('Failed to load organisation'))
  }, [orgSlug])

  async function handleSubscribe() {
    if (!org) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org.id, orgSlug: org.slug }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(data.url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout')
    } finally {
      setLoading(false)
    }
  }

  async function handleManage() {
    if (!org) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org.id, orgSlug: org.slug }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(data.url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to open portal')
    } finally {
      setLoading(false)
    }
  }

  if (!org) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  const statusVariant: 'default' | 'secondary' | 'destructive' =
    org.billing_status === 'active' ? 'default'
    : org.billing_status === 'trialing' || org.billing_status === 'network_managed' ? 'secondary'
    : 'destructive'

  const statusLabel =
    org.billing_status === 'active' ? 'Active'
    : org.billing_status === 'trialing' ? 'Trial'
    : org.billing_status === 'network_managed' ? 'Network-managed'
    : 'Inactive'

  return (
    <div className="p-6 max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Billing</h1>

      <div aria-live="polite" aria-atomic="true">
        {justSubscribed && <p className="text-sm text-green-700">Subscription activated — welcome to TraxEvent!</p>}
        {justConnected && <p className="text-sm text-green-700">Stripe account connected. You can now collect registration payments.</p>}
      </div>

      {/* TraxEvent subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">TraxEvent subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">$199 / year — unlimited events, unlimited registrants</p>
          {org.billing_status === 'network_managed' && (
            <p className="text-sm text-muted-foreground">Covered by your network — billing is managed centrally.</p>
          )}
          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {org.billing_status !== 'active' && org.billing_status !== 'network_managed' && (
              <Button onClick={handleSubscribe} disabled={loading}>
                {loading ? 'Redirecting…' : 'Subscribe — $199/year'}
              </Button>
            )}
            {org.stripe_customer_id && (
              <Button variant="outline" onClick={handleManage} disabled={loading}>
                {loading ? 'Opening…' : 'Manage subscription'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stripe Connect — registration payments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registration payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {org.stripe_account_id ? (
            <>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Stripe account</span>
                <Badge variant="default">Connected</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Registration payments go directly to your Stripe account. TraxEvent collects a 1% platform fee automatically.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Connect your Stripe account to collect registration payments. Money goes directly to you — TraxEvent takes 1% automatically.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  window.location.href = `/api/connect/oauth?orgId=${org.id}&orgSlug=${org.slug}`
                }}
              >
                Connect Stripe account
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <BillingContent />
    </Suspense>
  )
}
