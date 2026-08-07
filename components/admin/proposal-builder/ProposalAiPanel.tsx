'use client'

// AI drafting panel, reworked for the builder rail (spec §3 AI seating): the
// default mode drafts INTO the current document — the builder merges the
// returned blocks into un-replaced placeholder sections and never touches
// human-authored blocks (see merge-draft.ts). Full replace survives as the
// confirm-gated secondary mode.
import { useState } from 'react'
import { generateProposalDraft } from '@/actions/proposal-ai'
import type { ProposalDraft } from '@/lib/ai/proposal-draft'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { ProposalBlock } from '@/lib/types'
import type { SuggestedPackageV2 } from '@/lib/proposal-builder-stubs'

const money = (n: number) => `$${n.toLocaleString()}`

// Until Track A lands, generateProposalDraft still returns the v1 suggestion
// shape ({id, name, price}); afterwards it returns SuggestedPackageV2 with
// composed items. Render both so this panel works on either side of the
// rebase — the v1 branch dies with the stubs at integration.
type SuggestedPackage = SuggestedPackageV2 | { id: string; name: string; price: number }

function SuggestedPackages({ packages }: { packages: SuggestedPackage[] }) {
  return (
    <>
      {packages.map((p, i) => {
        if ('items' in p) {
          const total = p.items.reduce((s, it) => s + it.quantity * it.unit_price, 0)
          return (
            <p key={i} className="text-xs text-muted-foreground">
              Suggested: {p.name} — {p.items.length} items, {money(total)}
              {p.recommended ? ' (recommended)' : ''}
            </p>
          )
        }
        return (
          <p key={i} className="text-xs text-muted-foreground">
            Suggested: {p.name} ({money(p.price)})
          </p>
        )
      })}
    </>
  )
}

export function ProposalAiPanel({
  orgId, proposalId, placeholderCount, hasBlocks, disabled, onApply,
}: {
  orgId: string
  proposalId: string
  placeholderCount: number
  hasBlocks: boolean
  disabled: boolean
  onApply: (blocks: ProposalBlock[], mode: 'fill' | 'replace') => void
}) {
  const [notes, setNotes] = useState('')
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<ProposalDraft | null>(null)
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

  function fill() {
    if (!draft) return
    onApply(draft.blocks, 'fill')
    setDraft(null)
  }

  function replace() {
    if (!draft) return
    if (!window.confirm('Replace the existing document with this draft? Hand-written sections will be lost.')) return
    onApply(draft.blocks, 'replace')
    setDraft(null)
  }

  const fillLabel = !hasBlocks
    ? 'Use draft'
    : `Fill ${placeholderCount} placeholder section${placeholderCount === 1 ? '' : 's'}`

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
      <Button type="button" onClick={generate} disabled={disabled || generating || !notes.trim()} aria-busy={generating}>
        {generating ? 'Generating…' : 'Generate draft'}
      </Button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {draft && (
        <div className="space-y-2" aria-live="polite">
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
          <SuggestedPackages packages={draft.suggested_packages as SuggestedPackage[]} />
          {draft.adjustments.map((a, i) => (
            <p key={i} className="text-xs text-amber-700">{a}</p>
          ))}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={fill}
              disabled={hasBlocks && placeholderCount === 0}>
              {fillLabel}
            </Button>
            {hasBlocks && (
              <Button type="button" size="sm" variant="outline" onClick={replace}>
                Replace document
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
