'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type DeliveryMode = 'offsite' | 'onsite'

// One vocabulary for the two demand shapes: OFFSITE takes a serving unit to the
// customer's venue (a cart), ON-SITE hosts in one of the operator's own rooms.
// Order matters — offsite is the default, so it leads.
const MODES: ReadonlyArray<{ value: DeliveryMode; label: string }> = [
  { value: 'offsite', label: 'Offsite' },
  { value: 'onsite', label: 'On-site' },
]

/**
 * The delivery-mode control — a plain segmented offsite / on-site toggle that
 * only ever appears for a business-tier org with a room to host in (the caller
 * gates it). Controlled: the parent owns `value` and decides whether a change
 * is optimistic-then-persisted (the opportunity cockpit) or held until submit
 * (the create form).
 *
 * WCAG: each option is a real focusable <button type="button"> carrying
 * `aria-pressed`, wrapped in a labelled `role="group"` — the same aria-pressed
 * pattern the pipeline's tab bar already uses, so a screen reader announces the
 * group's name and each option's pressed state, and the whole thing is
 * keyboard-operable with no custom key handling. The kit Button meets AA in
 * both the filled (selected) and outline (unselected) tones.
 */
export function DeliveryModeToggle({
  value,
  onChange,
  disabled,
  idPrefix = 'delivery',
}: {
  value: DeliveryMode
  onChange: (next: DeliveryMode) => void
  disabled?: boolean
  idPrefix?: string
}) {
  const labelId = `${idPrefix}-label`
  return (
    <div className="space-y-1">
      <Label id={labelId}>Where</Label>
      <div
        role="group"
        aria-labelledby={labelId}
        className="inline-flex flex-wrap gap-1"
      >
        {MODES.map((m) => {
          const active = value === m.value
          return (
            <Button
              key={m.value}
              type="button"
              size="sm"
              variant={active ? 'default' : 'outline'}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(m.value)}
              className={cn(!active && 'text-muted-foreground')}
            >
              {m.label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
