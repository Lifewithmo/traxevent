'use client'

import { useRef, useState } from 'react'
import { updateProposalBlocks } from '@/actions/proposals'
import { uploadProposalImage } from '@/actions/proposal-images'
import { ProposalAiPanel } from '@/components/admin/ProposalAiPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProposalBlock, ProposalBlockType } from '@/lib/types'

const LABELS: Record<ProposalBlockType, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  list: 'List',
  image: 'Image',
  testimonial: 'Testimonial',
}

function blankBlock(type: ProposalBlockType, id: string): ProposalBlock {
  switch (type) {
    case 'heading': return { id, type: 'heading', text: '', level: 2 }
    case 'paragraph': return { id, type: 'paragraph', text: '' }
    case 'list': return { id, type: 'list', items: [''] }
    case 'image': return { id, type: 'image', url: '' }
    case 'testimonial': return { id, type: 'testimonial', quote: '' }
  }
}

// New blocks are minted with a `new-N` id that the server keeps verbatim
// (normalizeBlocks does not rewrite client-supplied ids). A counter that
// always starts at 0 would collide with a `new-0` block persisted in an
// earlier session the moment this editor remounts against that proposal's
// saved blocks. Seed the counter past the highest `new-N` suffix already
// present in initialBlocks so freshly minted ids can never collide with
// ones that already made it to Firestore.
function nextNewBlockId(blocks: ProposalBlock[]): number {
  let max = -1
  for (const b of blocks) {
    const match = /^new-(\d+)$/.exec(b.id)
    if (match) {
      const n = Number(match[1])
      if (n > max) max = n
    }
  }
  return max + 1
}

export function ProposalBlockEditor({
  orgId, proposalId, initialBlocks, disabled = false, aiEnabled = false,
}: {
  orgId: string
  proposalId: string
  initialBlocks: ProposalBlock[]
  // Mirrors the `locked` value the surrounding ProposalEditorClient applies to
  // every other control: a signed, pending-signature, or voided proposal is
  // read-only. The server re-checks all three (updateProposalBlocksCore) —
  // this only keeps the UI honest.
  disabled?: boolean
  // Gated on ANTHROPIC_API_KEY by the server page — computed there so this
  // client component never reads process.env itself.
  aiEnabled?: boolean
}) {
  const [blocks, setBlocks] = useState<ProposalBlock[]>(initialBlocks)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // A ref, not state: the counter itself is never rendered, and mutating it
  // synchronously (rather than via a state updater) means two add() calls
  // in the same handler can never read a stale value from the render
  // closure — each call mints its id and advances the counter in one step.
  const nextIdRef = useRef(nextNewBlockId(initialBlocks))

  function add(type: ProposalBlockType) {
    if (disabled) return
    const id = `new-${nextIdRef.current}`
    nextIdRef.current += 1
    setBlocks((b) => [...b, blankBlock(type, id)])
  }

  // Keyed by block ID, never by index. `pickImage` resolves after an await, by
  // which time a `move` or `remove` may already have shifted positions — an
  // index captured in the render closure would then write the uploaded URL
  // onto a different block entirely.
  //
  // One documented cast, here rather than at every call site. Spreading a
  // partial onto a discriminated union cannot be expressed type-safely in
  // TypeScript; callers only ever pass fields that exist on the block they
  // are editing, and normalizeBlocks re-validates everything server-side.
  function patch(id: string, changes: Record<string, unknown>) {
    setBlocks((b) => b.map((blk) => (blk.id === id ? ({ ...blk, ...changes } as ProposalBlock) : blk)))
  }

  function move(index: number, delta: number) {
    if (disabled) return
    const target = index + delta
    if (target < 0 || target >= blocks.length) return
    setBlocks((b) => {
      const next = [...b]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function remove(index: number) {
    if (disabled) return
    if (!window.confirm('Delete this block?')) return
    setBlocks((b) => b.filter((_, i) => i !== index))
  }

  async function pickImage(id: string, file: File) {
    if (disabled) return
    setError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const { url } = await uploadProposalImage(orgId, proposalId, form)
      patch(id, { url })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image upload failed')
    }
  }

  async function save() {
    if (disabled) return
    setSaving(true)
    setError(null)
    setNotice(null)
    const submitted = blocks.length
    try {
      // Re-seed from the server's normalized result rather than keeping local
      // state: normalizeBlocks silently drops blocks whose required content is
      // still blank (every freshly added block starts in exactly that state),
      // and those drops are NOT reported through `adjustments`. Trusting local
      // state here is what let the editor print "Saved." while still showing a
      // block that Firestore had just discarded.
      const { blocks: persisted, adjustments } = await updateProposalBlocks(orgId, proposalId, blocks)
      setBlocks(persisted)
      const dropped = submitted - persisted.length
      const messages = [...adjustments]
      if (dropped > 0) {
        messages.push(
          `Removed ${dropped} incomplete block${dropped === 1 ? '' : 's'} that had no content yet.`,
        )
      }
      setNotice(messages.length ? messages.join(' ') : 'Saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {aiEnabled && (
        <ProposalAiPanel
          orgId={orgId}
          proposalId={proposalId}
          hasBlocks={blocks.length > 0}
          disabled={disabled}
          onApply={(draftBlocks, mode) => {
            // Re-mint ids through the editor's own counter so a model-supplied id
            // can never collide with an existing block id (same invariant as
            // nextNewBlockId for hand-added blocks).
            const reminted = draftBlocks.map((b) => {
              const id = `new-${nextIdRef.current}`
              nextIdRef.current += 1
              return { ...b, id }
            })
            setBlocks((prev) => (mode === 'append' ? [...prev, ...reminted] : reminted))
          }}
        />
      )}

      {blocks.length === 0 && (
        <p className="text-sm text-muted-foreground">No content yet. Add a block to start the document.</p>
      )}

      {blocks.map((block, i) => (
        <div key={block.id} className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-muted-foreground">{LABELS[block.type]}</span>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" aria-label="Move up"
                onClick={() => move(i, -1)} disabled={disabled || i === 0}>↑</Button>
              <Button type="button" variant="outline" size="sm" aria-label="Move down"
                onClick={() => move(i, 1)} disabled={disabled || i === blocks.length - 1}>↓</Button>
              <Button type="button" variant="outline" size="sm" aria-label="Delete block"
                onClick={() => remove(i)} disabled={disabled}>Delete</Button>
            </div>
          </div>

          {block.type === 'heading' && (
            <Input aria-label={`Heading ${i + 1}`} value={block.text} disabled={disabled}
              onChange={(e) => patch(block.id, { text: e.target.value })} />
          )}

          {block.type === 'paragraph' && (
            <textarea aria-label={`Paragraph ${i + 1}`} rows={4} value={block.text} disabled={disabled}
              className="w-full rounded-md border px-3 py-2 text-sm"
              onChange={(e) => patch(block.id, { text: e.target.value })} />
          )}

          {block.type === 'list' && (
            <textarea aria-label={`List ${i + 1}`} rows={4} value={block.items.join('\n')} disabled={disabled}
              className="w-full rounded-md border px-3 py-2 text-sm"
              onChange={(e) => patch(block.id, { items: e.target.value.split('\n') })} />
          )}

          {block.type === 'image' && (
            <div className="space-y-2">
              <input type="file" accept="image/*" aria-label={`Image ${i + 1}`} disabled={disabled}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickImage(block.id, f) }} />
              {block.url && <p className="truncate text-xs text-muted-foreground">{block.url}</p>}
              <Input aria-label={`Image ${i + 1} alt text`} placeholder="Alt text"
                value={block.alt ?? ''} disabled={disabled}
                onChange={(e) => patch(block.id, { alt: e.target.value })} />
            </div>
          )}

          {block.type === 'testimonial' && (
            <div className="space-y-2">
              <textarea aria-label={`Testimonial ${i + 1}`} rows={3} value={block.quote} disabled={disabled}
                className="w-full rounded-md border px-3 py-2 text-sm"
                onChange={(e) => patch(block.id, { quote: e.target.value })} />
              <Input aria-label={`Testimonial ${i + 1} attribution`} placeholder="Attribution"
                value={block.attribution ?? ''} disabled={disabled}
                onChange={(e) => patch(block.id, { attribution: e.target.value })} />
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(LABELS) as ProposalBlockType[]).map((t) => (
          <Button key={t} type="button" variant="outline" size="sm" disabled={disabled}
            onClick={() => add(t)}>{`Add ${t}`}</Button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor="save-document" className="sr-only">Save document</Label>
        <Button id="save-document" type="button" onClick={save} disabled={disabled || saving}>
          {saving ? 'Saving…' : 'Save document'}
        </Button>
        {notice && <span className="text-sm text-muted-foreground">{notice}</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  )
}
