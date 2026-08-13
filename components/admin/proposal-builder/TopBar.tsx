'use client'

// Builder command bar (spec §4): inline-editable title, status badge,
// autosave state, placeholder chip, AI entry point, the primary action
// (Send/Copy link), and an overflow menu for everything else (print view,
// viewport toggle, void/delete).
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InlineText } from '@/components/admin/proposal-builder/InlineText'
import type { SaveStatus } from '@/components/admin/proposal-builder/useDraftAutosave'
import { PROPOSAL_STATUS_LABELS } from '@/lib/proposals'
import type { ProposalStatus } from '@/lib/types'

export type Viewport = 'desktop' | 'mobile'

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: 'Saved',
  dirty: 'Saving…',
  saving: 'Saving…',
  retrying: 'Retrying',
}

export function TopBar({
  orgSlug,
  leadId,
  title,
  onTitle,
  status,
  token,
  locked,
  viewport,
  onViewport,
  saveStatus,
  retryNow,
  placeholderCount = 0,
  onPlaceholderChip,
  aiEnabled = false,
  onOpenAi,
  onSend,
  onCopyLink,
  onVoid,
  onDelete,
  busy = false,
}: {
  orgSlug: string
  leadId: string
  title: string
  onTitle: (next: string) => void
  status: ProposalStatus
  token: string
  locked: boolean
  viewport: Viewport
  onViewport: (v: Viewport) => void
  saveStatus?: SaveStatus
  retryNow?: () => void
  placeholderCount?: number
  onPlaceholderChip?: () => void
  aiEnabled?: boolean
  onOpenAi?: () => void
  onSend?: () => void
  onCopyLink?: () => void
  onVoid?: () => void
  onDelete?: () => void
  busy?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [menuOpen])

  const canSend = status === 'draft' && !locked
  const canCopyLink = status === 'sent' || status === 'accepted'
  const canVoid = status !== 'draft' && status !== 'voided'
  const canDelete = status === 'draft'

  return (
    <div className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <Link href={`/${orgSlug}/leads/${leadId}`} className="text-sm text-muted-foreground hover:underline">
          ←
        </Link>
        <div className="min-w-[200px] flex-1 text-lg font-semibold">
          <InlineText
            value={title}
            onCommit={onTitle}
            ariaLabel="Proposal title"
            placeholder="Untitled proposal"
            disabled={locked}
          />
        </div>
        <Badge variant="secondary">{PROPOSAL_STATUS_LABELS[status]}</Badge>

        {saveStatus && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{SAVE_LABELS[saveStatus]}</span>
            {saveStatus === 'retrying' && retryNow && (
              <Button size="sm" variant="outline" onClick={retryNow}>Retry now</Button>
            )}
          </div>
        )}

        {placeholderCount > 0 && onPlaceholderChip && (
          <button
            type="button"
            onClick={onPlaceholderChip}
            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
          >
            {placeholderCount} placeholder{placeholderCount === 1 ? '' : 's'}
          </button>
        )}

        {aiEnabled && onOpenAi && (
          <Button size="sm" variant="outline" onClick={onOpenAi}>✦ Draft with AI</Button>
        )}

        {canSend && onSend && (
          <Button size="sm" onClick={onSend} disabled={busy}>Send to client…</Button>
        )}
        {canCopyLink && onCopyLink && (
          <Button size="sm" onClick={onCopyLink} disabled={busy}>Copy client link</Button>
        )}

        <div className="relative" ref={menuRef}>
          <Button
            size="sm"
            variant="outline"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            ⋯
          </Button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-1 w-48 space-y-1 rounded-md border bg-white p-1 shadow-lg"
            >
              <Button
                type="button"
                role="menuitem"
                size="sm"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  window.open(`/proposals/${token}/print`, '_blank')
                  setMenuOpen(false)
                }}
              >
                Open print view
              </Button>
              <Button
                type="button"
                role="menuitem"
                size="sm"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  onViewport('desktop')
                  setMenuOpen(false)
                }}
              >
                Desktop
              </Button>
              <Button
                type="button"
                role="menuitem"
                size="sm"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  onViewport('mobile')
                  setMenuOpen(false)
                }}
              >
                Mobile
              </Button>
              {canVoid && onVoid && (
                <Button
                  type="button"
                  role="menuitem"
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start text-destructive"
                  disabled={busy}
                  onClick={() => {
                    onVoid()
                    setMenuOpen(false)
                  }}
                >
                  Void proposal
                </Button>
              )}
              {canDelete && onDelete && (
                <Button
                  type="button"
                  role="menuitem"
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start text-destructive"
                  disabled={busy}
                  onClick={() => {
                    onDelete()
                    setMenuOpen(false)
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
