'use client'

import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ensureClientPortalToken } from '@/actions/client-portal'

interface CopyPortalLinkButtonProps {
  orgId: string
  leadId: string
}

export interface CopyPortalLink {
  copy: () => Promise<void>
  busy: boolean
  copied: boolean
  error: string | null
  /**
   * Drop the one-shot acknowledgement. A control that closes and reopens —
   * a menu item, say — has to clear it: "Copied!" left standing is a success
   * message about nothing, and it permanently renames the control for anyone
   * finding it by its accessible name.
   */
  reset: () => void
  /** Ready-to-render label for whichever control drives it. */
  label: string
}

/**
 * Minting-and-copying the client portal link, without the chrome.
 *
 * Extracted so the header's actions menu and the contact strip's button drive
 * one implementation — two copies of "mint a token, then write a URL to the
 * clipboard" is exactly the kind of drift that ends with one surface handing
 * out a stale link.
 */
export function useCopyPortalLink(orgId: string, leadId: string): CopyPortalLink {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function copy() {
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

  function reset() {
    setCopied(false)
    setError(null)
  }

  return { copy, reset, busy, copied, error, label: busy ? 'Generating…' : copied ? 'Copied!' : 'Portal link' }
}

export function CopyPortalLinkButton({ orgId, leadId }: CopyPortalLinkButtonProps) {
  const { copy, busy, copied, error, label } = useCopyPortalLink(orgId, leadId)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={copy}
        disabled={busy}
        title="Copy a link where this client sees their event, proposals, and invoices."
      >
        <Link2 />
        {label}
      </Button>
      <span aria-live="polite" aria-atomic="true" className={error ? 'text-xs text-destructive' : 'sr-only'}>
        {error ?? (copied ? 'Client portal link copied' : '')}
      </span>
    </>
  )
}
