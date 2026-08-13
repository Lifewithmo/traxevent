'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// @/actions/intake is imported lazily (below) rather than statically: its module
// graph pulls in firebase-admin, which throws at import time without server env
// vars — a static import here would force every test that renders
// PipelineListClient to mock this action.

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://traxevent.com'

interface IntakeLinkCardProps {
  orgId: string
  open: boolean
  onClose: () => void
}

export function IntakeLinkCard({ orgId, open, onClose }: IntakeLinkCardProps) {
  const [token, setToken] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || token) return
    import('@/actions/intake')
      .then(({ ensureIntakeToken }) => ensureIntakeToken(orgId))
      .then(setToken)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load the intake link')
      )
  }, [open, token, orgId])

  if (!open) return null
  const url = token ? `${APP_ORIGIN}/inquire/${token}` : null

  async function handleRegenerate() {
    setBusy(true)
    setError(null)
    try {
      const { regenerateIntakeToken } = await import('@/actions/intake')
      setToken(await regenerateIntakeToken(orgId))
      setConfirming(false)
      setCopied(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card data-intake-card>
      <CardHeader>
        <CardTitle className="text-base">Intake link</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div aria-live="polite" aria-atomic="true">
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <p className="text-sm text-muted-foreground">
          Share this link anywhere — your website, social bio, or a QR code. Inquiries land in
          your pipeline and you&apos;ll get an email.
        </p>
        {url ? (
          <p className="break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs">{url}</p>
        ) : (
          !error && <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {confirming ? (
          <div className="space-y-2">
            <p className="text-sm">The current link will stop working. Anyone holding it gets a 404.</p>
            <div className="flex gap-2">
              <Button variant="destructive" onClick={handleRegenerate} disabled={busy}>
                {busy ? 'Regenerating…' : 'Yes, regenerate'}
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!url}
              onClick={async () => {
                if (!url) return
                await navigator.clipboard.writeText(url)
                setCopied(true)
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button variant="outline" disabled={!url} onClick={() => url && window.open(url, '_blank')}>
              Open
            </Button>
            <Button variant="outline" disabled={!token} onClick={() => setConfirming(true)}>
              Regenerate
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
