'use client'

// Builder command bar (spec §4): inline-editable title, status badge,
// autosave state, placeholder chip, AI entry point, the primary action
// (Send/Copy link), and an overflow menu for everything else (print view,
// viewport toggle, void/delete).
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'
import { StatusPill, pillVariants } from '@/components/ui/status-pill'
import { InlineText } from '@/components/admin/proposal-builder/InlineText'
import type { SaveStatus } from '@/components/admin/proposal-builder/useDraftAutosave'
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_TONE } from '@/lib/proposals'
import { cn } from '@/lib/utils'
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
  onSaveAsTemplate,
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
  onSaveAsTemplate?: () => void
  busy?: boolean
}) {
  const canSend = status === 'draft' && !locked
  const canCopyLink = status === 'sent' || status === 'accepted'
  const canVoid = status !== 'draft' && status !== 'voided'
  const canDelete = status === 'draft'

  return (
    <div className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
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
        <StatusPill tone={PROPOSAL_STATUS_TONE[status]}>{PROPOSAL_STATUS_LABELS[status]}</StatusPill>

        {saveStatus && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{SAVE_LABELS[saveStatus]}</span>
            {saveStatus === 'retrying' && retryNow && (
              <Button size="sm" variant="outline" onClick={retryNow}>Retry now</Button>
            )}
          </div>
        )}

        {placeholderCount > 0 && onPlaceholderChip && (
          // Stays a <button> (StatusPill renders a bare <span> with no render
          // escape hatch) but wears the pill's tokens, so the one clickable
          // element keeps both its affordance and the shared status colors.
          <button
            type="button"
            onClick={onPlaceholderChip}
            className={cn(pillVariants({ tone: 'pending' }))}
          >
            {placeholderCount} placeholder{placeholderCount === 1 ? '' : 's'}
          </button>
        )}

        {aiEnabled && !locked && onOpenAi && (
          <Button size="sm" variant="outline" onClick={onOpenAi}>✦ Draft with AI</Button>
        )}

        {canSend && onSend && (
          <Button size="sm" onClick={onSend} disabled={busy}>Send to client…</Button>
        )}
        {canCopyLink && onCopyLink && (
          <Button size="sm" onClick={onCopyLink} disabled={busy}>Copy client link</Button>
        )}

        <Menu>
          <MenuTrigger render={<Button size="sm" variant="outline" aria-label="More actions" />}>
            ⋯
          </MenuTrigger>
          <MenuContent className="w-48">
            <MenuItem onClick={() => window.open(`/proposals/${token}/print`, '_blank')}>
              Open print view
            </MenuItem>
            {onSaveAsTemplate && (
              <MenuItem disabled={busy} onClick={onSaveAsTemplate}>
                Save as template
              </MenuItem>
            )}
            <MenuItem onClick={() => onViewport('desktop')}>Desktop</MenuItem>
            <MenuItem onClick={() => onViewport('mobile')}>Mobile</MenuItem>
            {canVoid && onVoid && (
              <MenuItem disabled={busy} className="text-destructive" onClick={onVoid}>
                Void proposal
              </MenuItem>
            )}
            {canDelete && onDelete && (
              <MenuItem disabled={busy} className="text-destructive" onClick={onDelete}>
                Delete
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
      </div>
    </div>
  )
}
