'use client'

// Builder top bar (spec §4): inline-editable title, status badge, viewport
// toggle for the canvas width, and a link to the print view.
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InlineText } from '@/components/admin/proposal-builder/InlineText'
import { PROPOSAL_STATUS_LABELS } from '@/lib/proposals'
import type { ProposalStatus } from '@/lib/types'

export type Viewport = 'desktop' | 'mobile'

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
}) {
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
        <div className="flex items-center gap-1" role="group" aria-label="Canvas width">
          <Button size="sm" variant={viewport === 'desktop' ? 'default' : 'outline'}
            onClick={() => onViewport('desktop')}>
            Desktop
          </Button>
          <Button size="sm" variant={viewport === 'mobile' ? 'default' : 'outline'}
            onClick={() => onViewport('mobile')}>
            Mobile
          </Button>
        </div>
        <a
          href={`/proposals/${token}/print`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-muted-foreground underline"
        >
          Open print view
        </a>
      </div>
    </div>
  )
}
