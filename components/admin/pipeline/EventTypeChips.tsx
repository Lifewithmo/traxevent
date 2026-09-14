'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Recognition over recall (Nielsen #6) for the org's 3–10 real event types:
 * profile names first, then historical types by frequency — the caller (the
 * pipeline/cockpit page) owns that ordering. Single-select toggle; clicking
 * the selected chip clears it. The free-text input next to this row stays
 * authoritative — chips only WRITE to it, so a type the org has never seen
 * still costs one field, not a fight with a picker.
 *
 * Same aria-pressed grammar as DeliveryModeToggle: real buttons, a labelled
 * group, no custom key handling to get wrong.
 */
export function EventTypeChips({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (next: string) => void
}) {
  if (options.length === 0) return null
  const selected = value.trim().toLowerCase()
  return (
    <div role="group" aria-label="Common event types" className="flex flex-wrap gap-1">
      {options.map((opt) => {
        const active = selected === opt.toLowerCase()
        return (
          <Button
            key={opt}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            aria-pressed={active}
            onClick={() => onChange(active ? '' : opt)}
            className={cn(!active && 'text-muted-foreground')}
          >
            {opt}
          </Button>
        )
      })}
    </div>
  )
}
