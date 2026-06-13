'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createSendingDomain, verifySendingDomain, removeSendingDomain } from '@/actions/domains'
import type { DomainDnsRecord, SendingDomainStatus } from '@/lib/types'

interface EmailDomainClientProps {
  orgId: string
  initialDomain?: string
  initialStatus?: SendingDomainStatus
  initialRecords: DomainDnsRecord[]
}

const STATUS_LABEL: Record<SendingDomainStatus, string> = {
  pending: 'Pending DNS verification',
  verified: 'Verified',
  failed: 'Verification failed',
}

const STATUS_VARIANT: Record<SendingDomainStatus, 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  verified: 'default',
  failed: 'destructive',
}

export function EmailDomainClient({
  orgId,
  initialDomain,
  initialStatus,
  initialRecords,
}: EmailDomainClientProps) {
  const [domain, setDomain] = useState(initialDomain ?? '')
  const [status, setStatus] = useState<SendingDomainStatus | undefined>(initialStatus)
  const [records, setRecords] = useState<DomainDnsRecord[]>(initialRecords)
  const [configured, setConfigured] = useState(Boolean(initialDomain))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleCreate() {
    if (!domain.trim()) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await createSendingDomain(orgId, domain.trim())
      setStatus(result.status)
      setRecords(result.records)
      setConfigured(true)
      setNotice('Domain added. Add the DNS records below at your registrar, then click Verify.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add domain')
    } finally {
      setBusy(false)
    }
  }

  async function handleVerify() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await verifySendingDomain(orgId)
      setStatus(result.status)
      setNotice(
        result.status === 'verified'
          ? 'Domain verified — your emails will now send from this domain.'
          : 'Not verified yet. DNS changes can take up to 48 hours to propagate. Try again later.'
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to verify domain')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!confirm('Remove this sending domain? Emails will revert to the default address.')) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await removeSendingDomain(orgId)
      setConfigured(false)
      setDomain('')
      setStatus(undefined)
      setRecords([])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove domain')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Email Domain</h1>
      <p className="text-sm text-muted-foreground">
        Send registration and event emails from your own domain instead of traxevent.com. Add your
        domain, then add the DNS records it generates at your domain registrar to verify ownership.
      </p>

      <div aria-live="polite" aria-atomic="true" className="space-y-1">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-green-700">{notice}</p>}
      </div>

      {!configured ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a sending domain</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="mail.yourchurch.org"
              />
              <p className="text-xs text-muted-foreground">
                Use a subdomain like <span className="font-mono">mail.yourchurch.org</span> dedicated to sending.
              </p>
            </div>
            <Button onClick={handleCreate} disabled={busy || !domain.trim()}>
              {busy ? 'Adding…' : 'Add domain'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-3">
              <span className="font-mono">{domain}</span>
              {status && <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {records.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">DNS records to add at your registrar</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-1 pr-3 font-medium">Type</th>
                        <th className="py-1 pr-3 font-medium">Name</th>
                        <th className="py-1 pr-3 font-medium">Value</th>
                        <th className="py-1 font-medium">Priority</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {records.map((r, i) => (
                        <tr key={i} className="border-b last:border-0 align-top">
                          <td className="py-1.5 pr-3">{r.type}</td>
                          <td className="py-1.5 pr-3 break-all">{r.name}</td>
                          <td className="py-1.5 pr-3 break-all">{r.value}</td>
                          <td className="py-1.5">{r.priority ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              {status !== 'verified' && (
                <Button onClick={handleVerify} disabled={busy}>
                  {busy ? 'Checking…' : 'Verify'}
                </Button>
              )}
              <Button variant="outline" onClick={handleRemove} disabled={busy}>
                Remove domain
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
