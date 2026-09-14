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
  onCreateNew,
}: {
  options: string[]
  value: string
  onChange: (next: string) => void
  /** Admins/owners only (event types inc 1): renders a "+ New type" action as
   *  the LAST chip, opening the inline-create popover — never leave the flow.
   *  An ACTION, not a toggle: no aria-pressed, so screen readers hear a plain
   *  button among the toggle chips. */
  onCreateNew?: () => void
}) {
  if (options.length === 0 && !onCreateNew) return null
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
      {onCreateNew && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCreateNew}
          className="border-dashed text-muted-foreground"
        >
          + New type
        </Button>
      )}
    </div>
  )
}
