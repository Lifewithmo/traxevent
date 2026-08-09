'use client'

import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { ensureClientPortalToken } from '@/actions/client-portal'

interface CopyPortalLinkButtonProps {
  orgId: string
  leadId: string
}

export function CopyPortalLinkButton({ orgId, leadId }: CopyPortalLinkButtonProps) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCopy() {
    setBusy(true); setError(null); setCopied(false)
    try {
      const token = await ensureClientPortalToken(orgId, leadId)
      await navigator.clipboard.writeText(`${window.location.origin}/client/${token}`)
      setCopied(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create client portal link.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        disabled={busy}
        title="Copy a link where this client sees their event, proposals, and invoices."
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-50"
      >
        <Link2 className="h-4 w-4" />
        {busy ? 'Generating…' : copied ? 'Copied!' : 'Portal link'}
      </button>
      <span aria-live="polite" aria-atomic="true" className={error ? 'text-xs text-destructive' : 'sr-only'}>
        {error ?? (copied ? 'Client portal link copied' : '')}
      </span>
    </>
  )
}
