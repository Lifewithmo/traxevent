'use client'

import { Suspense } from 'react'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { seatCount, summarizeMemberBilling, memberBillingLabel } from '@/lib/network-billing'
import type { Network, Org } from '@/lib/types'

interface NetworkBillingClientProps {
  network: Network
  networkId: string
  orgs: Org[]
}

function NetworkBillingContent({ network, networkId, orgs }: NetworkBillingClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const justSubscribed = searchParams.get('success') === '1'

  const statusVariant: 'default' | 'secondary' =
    network.billing_status === 'active' ? 'default' : 'secondary'
  const statusLabel = network.billing_status === 'active' ? 'Active' : 'Inactive'

  const summary = summarizeMemberBilling(orgs)

  async function handleSubscribe() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/network-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ networkId, networkSlug: network.slug }),
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
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/network-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ networkId, networkSlug: network.slug }),
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

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Billing</h1>

      <div aria-live="polite" aria-atomic="true">
        {justSubscribed && <p className="text-sm text-green-700">Network subscription activated — your member orgs are now covered.</p>}
      </div>

      {/* TraxEvent network subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">TraxEvent network subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{seatCount(orgs)} member orgs × seat</p>
          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {network.billing_status !== 'active' && (
              <Button onClick={handleSubscribe} disabled={loading}>
                {loading ? 'Redirecting…' : 'Subscribe'}
              </Button>
            )}
            {network.stripe_customer_id && (
              <Button variant="outline" onClick={handleManage} disabled={loading}>
                {loading ? 'Opening…' : 'Manage subscription'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Member org billing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Member org billing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {summary.networkManaged} network-managed · {summary.active} active · {summary.trialing} trialing · {summary.inactive} inactive
          </p>
          <div className="bg-card rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Organization</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Billing status</th>
                </tr>
              </thead>
              <tbody>
                {orgs.length === 0 ? (
                  <tr><td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">No member organizations yet.</td></tr>
                ) : (
                  orgs.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{o.name}</td>
                      <td className="px-3 py-2 text-right">
                        <Badge variant={o.billing_status === 'active' ? 'default' : 'secondary'}>
                          {memberBillingLabel(o.billing_status)}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function NetworkBillingClient(props: NetworkBillingClientProps) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <NetworkBillingContent {...props} />
    </Suspense>
  )
}
