'use client'

import { useState } from 'react'

/**
 * The shared select-or-other event-type picker (event types inc 1, spec
 * §5c/§5d): a native `<select>` of the org's ACTIVE profile names plus
 * "Other…", which reveals a plain free-text input for anything not on the
 * list. One control everywhere it appears — public intake, FactsGrid's
 * inline fact, OpportunityDetailsForm — so an operator who has used one has
 * used them all (Jakob's law), and the capacity/matching engine's own
 * trim+case-insensitive name rule never has to reconcile three spellings of
 * the same control.
 *
 * With ZERO active profiles it renders nothing but the plain input — the
 * same "today's free-text input stands" rule spec §5c states for the public
 * form, extended here to the editors too: a taxonomy with no entries has no
 * list to pick from.
 *
 * Picking a listed name resolves `event_type_id` to that profile's id (or
 * `null` for a legacy profile that hasn't been re-saved with one yet); any
 * free text — including a value that used to match but no longer does —
 * always carries `event_type_id: null`, the explicit-unset idiom
 * `updateLeadCore` expects (`lib/crm/leads.ts`: `undefined` is "leave
 * untouched", only `null` deletes the field). Typing into the Other field
 * never resolves an id itself, even if the text happens to match a
 * configured name mid-keystroke — only an explicit dropdown pick does,
 * via `onCommitSelect`, so a coincidental match can't yank the field out
 * from under someone still typing.
 */

export interface EventTypeSelectValue {
  event_type: string
  event_type_id?: string | null
}

/** Just what this component needs to render a choice — never the policy
 *  flags (`needsMobile`/`needsVenue`); the public intake page in particular
 *  must not ship those to an anonymous visitor (spec §5c). A full
 *  `EventTypeProfile[]` satisfies this structurally, so the admin hosts can
 *  pass their active profiles straight through. */
export interface EventTypeSelectOption {
  id?: string
  name: string
}

const OTHER_VALUE = '__other__'

// Pinned to ConvertToWorkCard.tsx's Kind select (~:276) so every event-type
// control in the product — public or admin — reads as the same control.
// h-9 clears the ≥24px touch-target gate; border-input/bg-background are the
// house tokens, dark-mode safe with no palette-specific literals.
const CONTROL_CLASSNAME =
  'block h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed'

interface EventTypeSelectProps {
  profiles: EventTypeSelectOption[]
  value: string
  onChange: (next: EventTypeSelectValue) => void
  /**
   * Fires ONLY when the operator picks an option directly from the dropdown
   * (including picking a listed name back after being in Other mode) — a
   * discrete, save-worthy action. Never fired for typing into the revealed
   * Other field (the host commits that on its own blur/Enter, same as any
   * other free-text fact) nor for merely toggling into Other mode (nothing
   * to save yet).
   */
  onCommitSelect?: (next: EventTypeSelectValue) => void
  id: string
  otherInputId: string
  selectAriaLabel?: string
  otherAriaLabel?: string
  otherPlaceholder?: string
  /** Visible text for the trailing option that reveals the free-text field.
   *  Defaults to "Other…" (the admin editors' wording); the public intake
   *  form passes "Something else…" per spec §5c. */
  otherOptionLabel?: string
  disabled?: boolean
  autoFocusOther?: boolean
  /**
   * Pass-through blur/keydown, wired directly to whichever control(s) are
   * mounted (never simulated via a wrapping element — native `blur` does not
   * bubble). A click-to-edit host (FactsGrid) uses these to commit-on-blur/
   * Enter and revert-on-Escape for the free-text side, matching every other
   * fact's save contract; `onCommitSelect` above already covers the discrete
   * dropdown-pick side, so a host that only needs a draft (OpportunityDetailsForm,
   * the public intake form) can leave both unset.
   */
  onBlur?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLSelectElement | HTMLInputElement>) => void
}

export function EventTypeSelect({
  profiles,
  value,
  onChange,
  onCommitSelect,
  id,
  otherInputId,
  selectAriaLabel,
  otherAriaLabel,
  otherPlaceholder,
  otherOptionLabel = 'Other…',
  disabled,
  autoFocusOther,
  onBlur,
  onKeyDown,
}: EventTypeSelectProps) {
  const matched = profiles.find((p) => p.name.trim().toLowerCase() === value.trim().toLowerCase())
  const [otherMode, setOtherMode] = useState(() => value.trim() !== '' && !matched)

  // Zero active types: nothing to choose from, so this is just the plain
  // free-text field (spec §5c's 0-types rule, extended to the editors). It
  // takes over BOTH the primary id (`id`, so a host's `<label htmlFor={id}>`
  // stays wired across the 0↔1+ profile transition) and the primary label
  // (`selectAriaLabel`) — there is no select here for `otherInputId`/
  // `otherAriaLabel`'s "secondary, clarifying field" role to apply to.
  if (profiles.length === 0) {
    return (
      <input
        id={id}
        type="text"
        aria-label={selectAriaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange({ event_type: e.target.value, event_type_id: null })}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={otherPlaceholder}
        className={CONTROL_CLASSNAME}
      />
    )
  }

  const selectValue = otherMode ? OTHER_VALUE : (matched ? matched.name : '')

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    if (next === OTHER_VALUE) {
      setOtherMode(true)
      onChange({ event_type: '', event_type_id: null })
      return
    }
    setOtherMode(false)
    const profile = profiles.find((p) => p.name === next)
    const resolved: EventTypeSelectValue = { event_type: profile?.name ?? next, event_type_id: profile?.id ?? null }
    onChange(resolved)
    onCommitSelect?.(resolved)
  }

  return (
    <div className="space-y-1.5">
      <select
        id={id}
        aria-label={selectAriaLabel}
        value={selectValue}
        disabled={disabled}
        onChange={handleSelectChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={CONTROL_CLASSNAME}
      >
        <option value="" disabled hidden={selectValue !== ''}>
          Select an event type
        </option>
        {profiles.map((p) => (
          <option key={p.id ?? p.name} value={p.name}>
            {p.name}
          </option>
        ))}
        <option value={OTHER_VALUE}>{otherOptionLabel}</option>
      </select>
      {otherMode && (
        <input
          id={otherInputId}
          type="text"
          aria-label={otherAriaLabel}
          value={value}
          disabled={disabled}
          autoFocus={autoFocusOther}
          onChange={(e) => onChange({ event_type: e.target.value, event_type_id: null })}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder={otherPlaceholder}
          className={CONTROL_CLASSNAME}
        />
      )}
    </div>
  )
}
