'use client'

// The draft composer (spec §3 AI seating): supersedes ProposalAiPanel. Same
// notes → generate → preview → fill/replace flow, but generation now streams
// (useDraftStream) instead of a single server action round trip, and the
// component can render either seated in a modal (triggered from the canvas
// hero or a placeholder's "Fill with AI") or inline as the hero card itself
// on an empty document.
import { useState } from 'react'
import { useDraftStream } from '@/components/admin/proposal-builder/useDraftStream'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ProposalBlock, ProposalPackage } from '@/lib/types'

const money = (n: number) => `$${n.toLocaleString()}`

const TITLE = 'Draft this proposal from your notes'
const SUBTITLE =
  "Paste call notes, an email thread, or a transcript — you'll get a full draft with suggested packages."
const NOTES_PLACEHOLDER = 'Paste call notes, an email thread, or a transcript…'
const REPLACE_CONFIRM = 'Replace the existing document with this draft? Hand-written sections will be lost.'

// generateProposalDraft/the streaming route return fully-minted composed
// packages (spec §1: the server mints ids, members sum to the denormalized
// price, AI never sets an override) — so this summary reads id/name/price
// plus the member count.
function SuggestedPackages({ packages }: { packages: ProposalPackage[] }) {
  return (
    <>
      {packages.map((p) => (
        <p key={p.id} className="text-xs text-muted-foreground">
          Suggested: {p.name}
          {p.item_ids?.length ? ` — ${p.item_ids.length} items,` : ''} {money(p.price)}
          {p.recommended ? ' (recommended)' : ''}
        </p>
      ))}
    </>
  )
}

function BlockPreview({ blocks }: { blocks: ProposalBlock[] }) {
  return (
    <div className="rounded bg-muted p-2 text-sm space-y-1">
      {blocks.map((b) => (
        <p key={b.id}>
          {b.type === 'heading' && <strong>{b.text}</strong>}
          {b.type === 'paragraph' && b.text}
          {b.type === 'list' && b.items.join(' • ')}
          {b.type === 'testimonial' && <em>&ldquo;{b.quote}&rdquo;</em>}
        </p>
      ))}
    </div>
  )
}

function ComposerBody({
  orgId, proposalId, placeholderCount, hasBlocks, onApply, afterApply,
}: {
  orgId: string
  proposalId: string
  placeholderCount: number
  hasBlocks: boolean
  onApply: (blocks: ProposalBlock[], mode: 'fill' | 'replace') => void
  afterApply: () => void
}) {
  const [notes, setNotes] = useState('')
  const { state, generate, reset } = useDraftStream()
  const generating = state.status === 'streaming'

  function onGenerate() {
    void generate({ orgId, proposalId, notes })
  }

  function fill(blocks: ProposalBlock[]) {
    onApply(blocks, 'fill')
    setNotes('')
    reset()
    afterApply()
  }

  function replace(blocks: ProposalBlock[]) {
    if (!window.confirm(REPLACE_CONFIRM)) return
    onApply(blocks, 'replace')
    setNotes('')
    reset()
    afterApply()
  }

  const fillLabel = !hasBlocks
    ? 'Use draft'
    : `Fill ${placeholderCount} placeholder section${placeholderCount === 1 ? '' : 's'}`

  return (
    <div className="space-y-2">
      <Label htmlFor="ai-notes">Notes for AI draft</Label>
      <textarea
        id="ai-notes"
        rows={4}
        className="w-full rounded border p-2 text-sm"
        placeholder={NOTES_PLACEHOLDER}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={generating}
      />
      <Button type="button" onClick={onGenerate} disabled={generating || !notes.trim()} aria-busy={generating}>
        {generating ? 'Generating…' : 'Generate draft'}
      </Button>

      {state.status === 'error' && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}

      {state.status === 'streaming' && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-xs text-muted-foreground">Writing…</p>
          <BlockPreview blocks={state.previewBlocks} />
        </div>
      )}

      {state.status === 'done' && (
        <div className="space-y-2" aria-live="polite">
          <BlockPreview blocks={state.draft.blocks} />
          {state.draft.rationale && <p className="text-xs text-muted-foreground">{state.draft.rationale}</p>}
          <SuggestedPackages packages={state.draft.suggested_packages} />
          {state.draft.adjustments.map((a, i) => (
            <p key={i} className="text-xs text-[var(--warn-fg)]">{a}</p>
          ))}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => fill(state.draft.blocks)}
              disabled={hasBlocks && placeholderCount === 0}>
              {fillLabel}
            </Button>
            {hasBlocks && (
              <Button type="button" size="sm" variant="outline" onClick={() => replace(state.draft.blocks)}>
                Replace document
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function DraftComposer({
  orgId, proposalId, placeholderCount, hasBlocks, open, onOpenChange, onApply, variant,
}: {
  orgId: string
  proposalId: string
  placeholderCount: number
  hasBlocks: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (blocks: ProposalBlock[], mode: 'fill' | 'replace') => void
  variant: 'modal' | 'hero'
}) {
  const body = (
    <ComposerBody
      orgId={orgId}
      proposalId={proposalId}
      placeholderCount={placeholderCount}
      hasBlocks={hasBlocks}
      onApply={onApply}
      afterApply={() => onOpenChange(false)}
    />
  )

  if (variant === 'hero') {
    return (
      <div className="rounded border p-6 space-y-1">
        <h2 className="text-lg font-semibold">{TITLE}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{SUBTITLE}</p>
        {body}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  )
}
