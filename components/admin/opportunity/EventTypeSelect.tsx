'use client'

import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

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

// The kit Input's control skin (components/ui/input.tsx), rebuilt for the
// native <select> so every event-type control — public intake included —
// matches its kit-Input neighbors instead of forking them: same h-8/rounded-lg
// metrics, the house focus-visible ring, and `text-base` under md (16px — any
// smaller and iOS Safari focus-zooms the PUBLIC intake form) stepping down to
// `md:text-sm`. Select-specific departures from the Input string: the file:*
// and placeholder: variants don't apply, and `appearance` stays native so the
// platform chevron survives (px-2.5 leaves it room). The two text fields this
// component renders use the kit <Input> component itself.
const SELECT_CLASSNAME =
  'block h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80'

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
  /**
   * True from the moment "Other…" is picked until the select's next blur (or
   * a listed re-pick): picking Other clears the draft to '' and mounts the
   * autofocused Other input, so the select immediately blurs — a HAND-OFF
   * inside the control, not the operator leaving it. Forwarding that blur to
   * a commit-on-blur host (FactsGrid) committed the just-cleared draft:
   * event_type saved as null over a set value, or the editor closed blank.
   * Consumed on first blur; `relatedTarget === the Other input` is the
   * belt-and-suspenders for a manual select→Other tab with no pick.
   */
  const enteringOtherRef = useRef(false)

  // Zero active types: nothing to choose from, so this is just the plain
  // free-text field (spec §5c's 0-types rule, extended to the editors). It
  // takes over BOTH the primary id (`id`, so a host's `<label htmlFor={id}>`
  // stays wired across the 0↔1+ profile transition) and the primary label
  // (`selectAriaLabel`) — there is no select here for `otherInputId`/
  // `otherAriaLabel`'s "secondary, clarifying field" role to apply to.
  if (profiles.length === 0) {
    return (
      <Input
        id={id}
        type="text"
        aria-label={selectAriaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange({ event_type: e.target.value, event_type_id: null })}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={otherPlaceholder}
      />
    )
  }

  const selectValue = otherMode ? OTHER_VALUE : (matched ? matched.name : '')

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    if (next === OTHER_VALUE) {
      enteringOtherRef.current = true
      setOtherMode(true)
      onChange({ event_type: '', event_type_id: null })
      return
    }
    enteringOtherRef.current = false
    setOtherMode(false)
    const profile = profiles.find((p) => p.name === next)
    const resolved: EventTypeSelectValue = { event_type: profile?.name ?? next, event_type_id: profile?.id ?? null }
    onChange(resolved)
    onCommitSelect?.(resolved)
  }

  /** Swallows the into-Other hand-off blur (see `enteringOtherRef`); every
   *  other select blur reaches the host unchanged. The Other input's own blur
   *  is wired straight to `onBlur` — its commit-on-blur contract is untouched. */
  function handleSelectBlur(e: React.FocusEvent<HTMLSelectElement>) {
    const toOtherInput = e.relatedTarget instanceof HTMLElement && e.relatedTarget.id === otherInputId
    const handingOff = enteringOtherRef.current || toOtherInput
    enteringOtherRef.current = false
    if (handingOff) return
    onBlur?.()
  }

  return (
    <div className="space-y-1.5">
      <select
        id={id}
        aria-label={selectAriaLabel}
        value={selectValue}
        disabled={disabled}
        onChange={handleSelectChange}
        onBlur={handleSelectBlur}
        onKeyDown={onKeyDown}
        className={SELECT_CLASSNAME}
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
        <Input
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
        />
      )}
    </div>
  )
}
