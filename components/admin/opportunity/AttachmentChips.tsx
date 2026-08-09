'use client'

import type { AttachmentChip } from '@/lib/opportunity-detail'

interface AttachmentChipsProps {
  chips: AttachmentChip[]
  selected: AttachmentChip['kind']
  onSelect: (kind: AttachmentChip['kind']) => void
}

export function AttachmentChips({ chips, selected, onSelect }: AttachmentChipsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Tasks & documents">
      {chips.map((c) => (
        <button
          key={c.kind}
          type="button"
          aria-pressed={selected === c.kind}
          onClick={() => onSelect(c.kind)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
            selected === c.kind
              ? 'border-foreground bg-foreground text-background'
              : c.count === 0
                ? 'border-border text-muted-foreground hover:bg-muted/50'
                : 'border-border bg-muted/50 hover:bg-muted'
          }`}
        >
          <span className="font-medium">{c.label}</span>
          <span>{c.count}</span>
          {c.hint && (
            <span className={c.danger && selected !== c.kind ? 'text-destructive' : selected === c.kind ? '' : 'text-muted-foreground'}>
              · {c.hint}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
