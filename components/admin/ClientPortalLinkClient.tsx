'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ensureClientPortalToken } from '@/actions/client-portal'

interface ClientPortalLinkClientProps {
  orgId: string
  leadId: string
}

export function ClientPortalLinkClient({ orgId, leadId }: ClientPortalLinkClientProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCopy() {
    setBusy(true); setError(null); setCopied(false)
    try {
      const token = await ensureClientPortalToken(orgId, leadId)
      const link = `${window.location.origin}/client/${token}`
      setUrl(link)
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create client portal link.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 pt-0 max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client portal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Share one link where this client sees their event, proposals, and invoices.
          </p>

          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {copied && <p className="text-sm text-muted-foreground">Copied!</p>}
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleCopy} disabled={busy}>
              {busy ? 'Generating…' : 'Copy client portal link'}
            </Button>
          </div>

          {url && <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />}
        </CardContent>
      </Card>
    </div>
  )
}
