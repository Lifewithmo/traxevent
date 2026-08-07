'use client'

import { useState } from 'react'
import { generateProposalDraft } from '@/actions/proposal-ai'
import type { DraftResult } from '@/lib/ai/proposal-draft'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { ProposalBlock } from '@/lib/types'

export function ProposalAiPanel({
  orgId, proposalId, hasBlocks, disabled, onApply,
}: {
  orgId: string
  proposalId: string
  hasBlocks: boolean
  disabled: boolean
  onApply: (blocks: ProposalBlock[], mode: 'use' | 'append' | 'replace') => void
}) {
  const [notes, setNotes] = useState('')
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<DraftResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      setDraft(await generateProposalDraft(orgId, proposalId, notes))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft generation failed')
    } finally {
      setGenerating(false)
    }
  }

  function replace() {
    if (!draft) return
    if (!window.confirm('Replace the existing document with this draft?')) return
    onApply(draft.blocks, 'replace')
    setDraft(null)
  }

  return (
    <div className="rounded border p-3 space-y-2">
      <Label htmlFor="ai-notes">Notes for AI draft</Label>
      <textarea
        id="ai-notes"
        rows={4}
        className="w-full rounded border p-2 text-sm"
        placeholder="Paste call notes, an email thread, or a transcript…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={disabled || generating}
      />
      <Button type="button" onClick={generate} disabled={disabled || generating || !notes.trim()}>
        {generating ? 'Generating…' : 'Generate draft'}
      </Button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {draft && (
        <div className="space-y-2">
          <div className="rounded bg-muted p-2 text-sm space-y-1">
            {draft.blocks.map((b) => (
              <p key={b.id}>
                {b.type === 'heading' && <strong>{b.text}</strong>}
                {b.type === 'paragraph' && b.text}
                {b.type === 'list' && b.items.join(' • ')}
                {b.type === 'testimonial' && <em>&ldquo;{b.quote}&rdquo;</em>}
              </p>
            ))}
          </div>
          {draft.rationale && <p className="text-xs text-muted-foreground">{draft.rationale}</p>}
          {draft.adjustments.map((a, i) => (
            <p key={i} className="text-xs text-amber-700">{a}</p>
          ))}
          <div className="flex gap-2">
            {hasBlocks ? (
              <>
                <Button type="button" size="sm" onClick={() => { onApply(draft.blocks, 'append'); setDraft(null) }}>
                  Append
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={replace}>
                  Replace
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" onClick={() => { onApply(draft.blocks, 'use'); setDraft(null) }}>
                Use draft
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
