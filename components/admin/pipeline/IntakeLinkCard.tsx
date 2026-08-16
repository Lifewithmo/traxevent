'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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

  // `display:contents` wrapper: the dialog body itself lives in a portal on
  // <body>, so this keeps a single `[data-intake-card]` marker in the caller's
  // own tree (both Pipeline surfaces assert exactly one) at zero layout cost.
  return (
    <div data-intake-card className="contents">
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Intake link</DialogTitle>
            <DialogDescription>
              Share this link anywhere — your website, social bio, or a QR code. Inquiries land in
              your pipeline and you&apos;ll get an email.
            </DialogDescription>
          </DialogHeader>

          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {url ? (
            <p className="break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
              {url}
            </p>
          ) : (
            !error && <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          <DialogFooter className="flex-wrap">
            <Button
              variant="outline"
              disabled={!token}
              onClick={() => setConfirming(true)}
              className="sm:mr-auto"
            >
              Regenerate
            </Button>
            <Button variant="outline" disabled={!url} onClick={() => url && window.open(url, '_blank')}>
              Open
            </Button>
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
          </DialogFooter>

          {/*
            The confirm dialog is NESTED inside the outer one on purpose. Base UI
            links dialogs only through React context (`useRenderDialogRoot` reads
            `parentContext` from the enclosing `DialogRootContext`), so two roots
            rendered as SIBLINGS never register with each other: both compute
            `isTopmost === true`, both pass `escapeKey: true` to `useDismiss`, and
            both register their own document keydown listener — one Escape closes
            BOTH. Nested, the outer's `ownNestedOpenDialogs` is 1, so its
            escapeKey/outsidePress correctly stand down while the confirm is up.
          */}
          <Dialog
            open={confirming}
            onOpenChange={(next) => {
              if (busy) return
              setConfirming(next)
              // The failure belongs to the confirm step; dropping it here stops a
              // stale error trailing back into the outer dialog.
              if (!next) setError(null)
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Regenerate the intake link?</DialogTitle>
                <DialogDescription>
                  The current link will stop working. Anyone holding it gets a 404.
                </DialogDescription>
              </DialogHeader>

              {/*
                A failed regenerate has to report INSIDE this dialog. The outer
                dialog's copy of the error is both occluded by this popup's own
                `fixed inset-0` backdrop and stamped `aria-hidden`/`inert` by this
                dialog's FloatingFocusManager (`markOthers`) — so rendering it only
                out there is neither visible nor announced.
              */}
              <div aria-live="assertive" aria-atomic="true">
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleRegenerate} disabled={busy}>
                  {busy ? 'Regenerating…' : 'Yes, regenerate'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </div>
  )
}
