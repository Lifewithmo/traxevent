'use client'

// The document half of the builder canvas (spec §4): blocks render in the
// customer's exact typography (same classes as ProposalBlockView) with
// editing chrome layered on — inline text editing, a "+" divider with a type
// menu, and a per-block handle offering drag reorder plus keyboard-accessible
// Move up / Move down / Delete (drag is never the only path). Placeholder
// blocks render greyed and lose their flag on first human edit.
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineText } from '@/components/admin/proposal-builder/InlineText'
import type { ProposalBlock as PlaceholderBlock } from '@/lib/types'
import type { ProposalBlockType } from '@/lib/types'

const BLOCK_TYPES: Array<{ type: ProposalBlockType; label: string }> = [
  { type: 'heading', label: 'Heading' },
  { type: 'paragraph', label: 'Paragraph' },
  { type: 'list', label: 'List' },
  { type: 'image', label: 'Image' },
  { type: 'testimonial', label: 'Testimonial' },
]

function blankBlock(type: ProposalBlockType): PlaceholderBlock {
  const id = crypto.randomUUID()
  switch (type) {
    case 'heading': return { id, type: 'heading', text: '', level: 2 }
    case 'paragraph': return { id, type: 'paragraph', text: '' }
    case 'list': return { id, type: 'list', items: [''] }
    case 'image': return { id, type: 'image', url: '' }
    case 'testimonial': return { id, type: 'testimonial', quote: '' }
  }
}

export function BlockCanvas({
  blocks,
  onChange,
  onUploadImage,
  disabled,
  onFillWithAi,
  hero,
}: {
  blocks: PlaceholderBlock[]
  onChange: (next: PlaceholderBlock[]) => void
  onUploadImage: (file: File) => Promise<{ url: string }>
  disabled: boolean
  onFillWithAi?: () => void
  hero?: ReactNode
}) {
  const [menuAt, setMenuAt] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const dragIndex = useRef<number | null>(null)

  // Every human edit routes through here: the patch clears the placeholder
  // flag (spec §3 — cleared on first human edit) by rebuilding the block
  // without it.
  function patch(id: string, changes: Record<string, unknown>) {
    onChange(
      blocks.map((b) => {
        if (b.id !== id) return b
        const { placeholder: _p, ...rest } = { ...b, ...changes }
        return rest as PlaceholderBlock
      }),
    )
  }

  function insertAt(index: number, type: ProposalBlockType) {
    const next = [...blocks]
    next.splice(index, 0, blankBlock(type))
    setMenuAt(null)
    onChange(next)
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= blocks.length) return
    const next = [...blocks]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  function remove(index: number) {
    if (!window.confirm('Delete this block?')) return
    onChange(blocks.filter((_, i) => i !== index))
  }

  function drop(index: number) {
    const from = dragIndex.current
    dragIndex.current = null
    if (from === null || from === index) return
    const next = [...blocks]
    const [moved] = next.splice(from, 1)
    next.splice(from < index ? index - 1 : index, 0, moved)
    onChange(next)
  }

  async function pickImage(id: string, file: File) {
    setUploadError(null)
    try {
      const { url } = await onUploadImage(file)
      patch(id, { url })
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Image upload failed')
    }
  }

  function divider(index: number) {
    if (disabled) return null
    return (
      <div className="group relative -my-2 flex h-6 items-center justify-center opacity-0 transition-opacity focus-within:opacity-100 hover:opacity-100">
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" aria-hidden="true" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="relative z-10 h-6 rounded-full px-2 text-xs"
          aria-label={`Add block at position ${index + 1}`}
          onClick={() => setMenuAt(menuAt === index ? null : index)}
        >
          +
        </Button>
        {menuAt === index && (
          <div className="absolute top-7 z-20 flex gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            {BLOCK_TYPES.map(({ type, label }) => (
              <Button key={type} type="button" size="sm" variant="ghost" onClick={() => insertAt(index, type)}>
                {label}
              </Button>
            ))}
          </div>
        )}
      </div>
    )
  }

  function chrome(index: number) {
    if (disabled) return null
    return (
      <div className="absolute -left-2 top-0 z-10 flex -translate-x-full flex-col gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/block:opacity-100">
        <button
          type="button"
          draggable
          onDragStart={() => { dragIndex.current = index }}
          aria-label="Drag to reorder"
          className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ⠿
        </button>
        <button type="button" aria-label="Move up" disabled={index === 0}
          onClick={() => move(index, -1)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30">↑</button>
        <button type="button" aria-label="Move down" disabled={index === blocks.length - 1}
          onClick={() => move(index, 1)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30">↓</button>
        <button type="button" aria-label="Delete block"
          onClick={() => remove(index)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive">✕</button>
      </div>
    )
  }

  // A placeholder's ghost "Fill with AI" affordance (spec §3): only offered
  // when the canvas has somewhere to send it (onFillWithAi wired) and isn't
  // disabled — it opens the composer modal, which fills every remaining
  // placeholder, not just this one.
  function fillWithAiButton(block: PlaceholderBlock) {
    if (disabled || !onFillWithAi || block.placeholder !== true) return null
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="absolute right-0 top-0 z-10 text-xs text-muted-foreground opacity-0 transition-opacity focus-within:opacity-100 group-hover/block:opacity-100"
        onClick={onFillWithAi}
      >
        Fill with AI
      </Button>
    )
  }

  function editor(block: PlaceholderBlock, index: number) {
    // A placeholder block's content fields hold skeleton INSTRUCTIONS, not
    // content. The editor must start empty — the instruction becomes the
    // field hint — so the first keystroke replaces it rather than appending
    // to it. (Caught in the pre-merge browser walk.)
    const ph = block.placeholder === true
    switch (block.type) {
      case 'heading':
        return block.level === 3 ? (
          <h3 className="mt-6 mb-2 text-lg font-semibold" style={{ color: 'var(--proposal-accent, #111827)' }}>
            <InlineText value={ph ? '' : block.text} disabled={disabled}
              placeholder={ph ? block.text : 'Heading'}
              ariaLabel={`Heading ${index + 1}`} onCommit={(text) => patch(block.id, { text })} />
          </h3>
        ) : (
          <h2 className="mt-8 mb-3 text-xl font-bold" style={{ color: 'var(--proposal-accent, #111827)' }}>
            <InlineText value={ph ? '' : block.text} disabled={disabled}
              placeholder={ph ? block.text : 'Heading'}
              ariaLabel={`Heading ${index + 1}`} onCommit={(text) => patch(block.id, { text })} />
          </h2>
        )
      case 'paragraph':
        return (
          <p className="mb-4 leading-relaxed text-foreground">
            <InlineText value={ph ? '' : block.text} disabled={disabled} multiline
              placeholder={ph ? block.text : 'Write something…'}
              ariaLabel={`Paragraph ${index + 1}`} onCommit={(text) => patch(block.id, { text })} />
          </p>
        )
      case 'list': {
        const Tag = block.ordered ? 'ol' : 'ul'
        return (
          <Tag className={`mb-4 ${block.ordered ? 'list-decimal' : 'list-disc'} pl-6 text-foreground`}>
            {block.items.map((item, i) => (
              <li key={i} className="mb-1">
                <InlineText value={ph ? '' : item} disabled={disabled}
                  placeholder={ph ? item : 'List item'}
                  ariaLabel={`List ${index + 1} item ${i + 1}`}
                  onCommit={(text) => {
                    // An emptied item is removed; the list itself stays.
                    const items = block.items.map((x, j) => (j === i ? text : x)).filter((x) => x.trim() !== '')
                    patch(block.id, { items: items.length ? items : [''] })
                  }} />
              </li>
            ))}
            {!disabled && (
              <li className="list-none">
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => patch(block.id, { items: [...block.items, ''] })}>
                  + Add line
                </button>
              </li>
            )}
          </Tag>
        )
      }
      case 'image':
        return (
          <figure className="mb-6">
            {block.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={block.url} alt={block.alt ?? ''} className="w-full rounded-md" />
            ) : (
              <label
                className="flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed text-sm text-muted-foreground"
                style={{ borderColor: 'var(--proposal-secondary, #d1d5db)' }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files?.[0]
                  if (f && !disabled) pickImage(block.id, f)
                }}
              >
                <span>{disabled ? 'No image yet' : 'Click or drop an image to upload'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label={`Upload image ${index + 1}`}
                  disabled={disabled}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) pickImage(block.id, f)
                  }}
                />
              </label>
            )}
            <figcaption className="mt-2 text-sm text-muted-foreground">
              <InlineText value={block.caption ?? ''} disabled={disabled} placeholder="Add a caption"
                ariaLabel={`Image ${index + 1} caption`}
                onCommit={(caption) => patch(block.id, { caption: caption || undefined })} />
              <InlineText value={block.alt ?? ''} disabled={disabled} placeholder="Describe this image (alt text)"
                ariaLabel={`Image ${index + 1} alt text`}
                onCommit={(alt) => patch(block.id, { alt: alt || undefined })} />
            </figcaption>
          </figure>
        )
      case 'testimonial':
        return (
          <blockquote className="mb-6 border-l-4 pl-4 italic text-foreground"
            style={{ borderColor: 'var(--proposal-secondary, #d1d5db)' }}>
            <InlineText value={ph ? '' : block.quote} disabled={disabled} multiline
              placeholder={ph ? block.quote : 'Customer quote'}
              ariaLabel={`Testimonial ${index + 1}`} onCommit={(quote) => patch(block.id, { quote })} />
            <cite className="text-sm not-italic text-muted-foreground">
              <InlineText value={block.attribution ?? ''} disabled={disabled} placeholder="— Attribution"
                ariaLabel={`Testimonial ${index + 1} attribution`}
                onCommit={(attribution) => patch(block.id, { attribution: attribution || undefined })} />
            </cite>
          </blockquote>
        )
    }
  }

  return (
    <div>
      {hero}
      {uploadError && <p role="alert" className="mb-2 text-sm text-destructive">{uploadError}</p>}
      {divider(0)}
      {blocks.map((block, index) => (
        <div key={block.id}>
          <div
            className="group/block relative"
            data-placeholder={block.placeholder === true ? 'true' : undefined}
            data-placeholder-block={block.placeholder === true ? 'true' : undefined}
            onDragOver={(e) => { if (!disabled) e.preventDefault() }}
            onDrop={() => { if (!disabled) drop(index) }}
          >
            {chrome(index)}
            {fillWithAiButton(block)}
            <div className={block.placeholder === true ? 'opacity-50' : undefined}>
              {editor(block, index)}
            </div>
          </div>
          {divider(index + 1)}
        </div>
      ))}
      {blocks.length === 0 && !disabled && (
        <EmptyState title="No content yet" description="Use the + button to add your first section." />
      )}
    </div>
  )
}
