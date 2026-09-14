'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createEventTypeProfile } from '@/actions/event-type-profiles'
import type { EventTypeProfile } from '@/lib/types'

/**
 * Inline create-an-event-type, launched from the New Opportunity flow (spec
 * §5b — decision (b): never leave the flow). A small kit Dialog stacked over
 * the New-opportunity dialog: name + the two capacity-policy toggles in the
 * operator's own kind words, prefilled from what the operator has already
 * said (the unrecognized free text; Where=on-site → needs a room).
 *
 * Focus contract: opens on the name field; EVERY close path — Create, Escape,
 * Cancel — puts focus back on the event-type input (`returnFocusRef`) so the
 * phone call never loses its place. The parent owns selection: `onCreated`
 * hands it the server-returned profile ({id, name} populated — the action is
 * idempotent on a case-insensitive name match, so an existing/unarchived
 * profile comes back just as usable).
 */
export function NewEventTypePopover({
  orgId,
  open,
  onClose,
  onCreated,
  initialName,
  initialNeedsVenue,
  mobileLabel,
  venueLabel,
  returnFocusRef,
}: {
  orgId: string
  open: boolean
  onClose: () => void
  onCreated: (profile: EventTypeProfile) => void
  /** Prefill from the flow's current free text (empty when it already matches). */
  initialName: string
  /** Prefill from the flow's current Where state (on-site → true). */
  initialNeedsVenue: boolean
  /** kindLabel(org, 'mobile', 1) — the operator's own word ("cart", "truck"…). */
  mobileLabel: string
  /** kindLabel(org, 'venue', 1). */
  venueLabel: string
  /** The event-type input in the flow — focus lands back here on any close. */
  returnFocusRef: React.RefObject<HTMLElement | null>
}) {
  const [name, setName] = useState(initialName)
  const [needsMobile, setNeedsMobile] = useState(true)
  const [needsVenue, setNeedsVenue] = useState(initialNeedsVenue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  // Fresh draft on every open, computed at open time (the flow's free text
  // and Where state move between opens). Latest-ref so a parent re-render
  // can never wipe a draft mid-typing — the NewOpportunityForm idiom.
  const initDraftRef = useRef(() => {})
  useEffect(() => {
    initDraftRef.current = () => {
      setName(initialName)
      setNeedsMobile(true)
      setNeedsVenue(initialNeedsVenue)
      setSaving(false)
      setError(null)
    }
  })
  useEffect(() => {
    if (open) initDraftRef.current()
  }, [open])

  async function handleCreate() {
    if (saving) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name for the event type.')
      nameRef.current?.focus()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const profile = await createEventTypeProfile(orgId, {
        name: trimmed,
        needsMobile,
        needsVenue,
      })
      onCreated(profile)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create the event type')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        className="sm:max-w-sm"
        initialFocus={nameRef}
        finalFocus={returnFocusRef}
      >
        <DialogHeader>
          <DialogTitle>New event type</DialogTitle>
        </DialogHeader>
        {/* Portalled to body, so this <form> is never DOM-nested inside the
            New-opportunity form — Enter here creates the TYPE, not the lead.
            stopPropagation is LOAD-BEARING both times: React portals bubble
            through the REACT tree, so without it this submit (and a ⌘↩ here)
            would reach the New-opportunity form's own handlers and create the
            LEAD mid-popover. */}
        <form
          onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); void handleCreate() }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              e.stopPropagation()
              void handleCreate()
            }
          }}
          noValidate
          className="space-y-3"
        >
          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="newEventTypeName">Event type name</Label>
            <Input
              ref={nameRef}
              id="newEventTypeName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wedding"
              aria-invalid={error && !name.trim() ? true : undefined}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <KindTogglePill
              pressed={needsMobile}
              label={mobileLabel}
              disabled={saving}
              onToggle={() => setNeedsMobile((v) => !v)}
            />
            <KindTogglePill
              pressed={needsVenue}
              label={venueLabel}
              disabled={saving}
              onToggle={() => setNeedsVenue((v) => !v)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Drives the capacity verdict for every opportunity of this type.
          </p>
          <DialogFooter className="mx-0 mb-0">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create type'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A needs-{kind} toggle pill — the weekday-pill idiom, AA status tokens.
 * Local copy of the settings-surface pattern (the original lives with the
 * Event Types settings page): aria-pressed toggles, `--status-confirmed` /
 * `--status-neutral` token pair, visible focus ring, motion-reduce safe.
 */
function KindTogglePill({
  pressed,
  label,
  disabled,
  onToggle,
}: {
  pressed: boolean
  label: string
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`needs ${label}`}
      disabled={disabled}
      onClick={onToggle}
      className={
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 motion-reduce:transition-none ' +
        (pressed
          ? 'bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]'
          : 'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]')
      }
    >
      <span aria-hidden="true" className="text-current">{pressed ? '✓' : '+'}</span>
      needs {label}
    </button>
  )
}
