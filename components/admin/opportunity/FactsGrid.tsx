'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { OpportunityDetailsForm } from '@/components/admin/opportunity/OpportunityDetailsForm'
import { updateLead } from '@/actions/leads'
import { shortDate } from '@/lib/pipeline-presentation'
import type { LeadUpdate } from '@/lib/crm/leads'
import type { Customer, Lead } from '@/lib/types'

interface FactsGridProps {
  orgId: string
  orgSlug: string
  lead: Lead
  customer: Customer | null
}

/**
 * One click-to-edit fact: the value, or a "+ Add {label}" affordance when it is
 * unset. Escape reverts, blur/Enter commits.
 *
 * Copied — not imported — from the only R6 implementation in the repo
 * (components/admin/clients/ClientWorkingRail.tsx:88-156), which declares it
 * module-locally and does not export it. The Clients module is frozen this
 * increment, so it cannot be hoisted into shared code; if it ever is, delete
 * this copy. Divergences from the original, both deliberate:
 *   - `display` is separate from `value`, so a stored `2026-09-12` can read as
 *     "Sep 12, 2026" while the input still edits the raw YMD.
 *   - `onSave` rejections surface instead of escaping as an unhandled rejection
 *     from the blur handler, which would have silently eaten the operator's edit.
 *   - A committed value is held locally until the refreshed prop lands (see
 *     `saved`), and commit() is re-entrancy guarded, so Enter cannot double-write.
 */
function EditableFact({
  label, value, display, inputType, onSave,
}: {
  label: string
  /** The raw editable value. Empty string means unset. */
  value: string
  /** What the operator reads when the fact is set. Defaults to `value`. */
  display?: string
  inputType?: 'text' | 'date' | 'number'
  onSave: (next: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  /**
   * The value this field just committed, held until the refreshed prop arrives.
   *
   * `save()` fires router.refresh() and returns immediately — App Router's
   * refresh does not await the refetch — so for a whole server round trip
   * `value` is still the STALE prop. Without this, a successful save on a
   * previously-unset fact snapped straight back to "+ Add Event type" and only
   * popped to "Gala" when the RSC payload landed, which reads to the operator as
   * a save that silently failed.
   *
   * `from` is the prop value the commit was made against, so the override clears
   * itself the instant the prop moves off it.
   */
  const [saved, setSaved] = useState<{ from: string; to: string } | null>(null)

  // React's "adjust state during render" pattern rather than an effect: the
  // stale value never gets painted, and there is no second commit phase.
  if (saved !== null && saved.from !== value) setSaved(null)
  const current = saved?.to ?? value

  function startEditing() {
    setDraft(current)
    setEditing(true)
  }

  async function commit() {
    // Re-entrancy guard. On Enter, onKeyDown calls commit(), the synchronous
    // prefix flips `busy`, and React flushes at the end of the discrete event —
    // at which point the browser fires blur on the input it just made
    // unfocusable, and onBlur calls commit() a SECOND time against a `value`
    // prop that has not moved yet. That is a duplicate updateLead write plus a
    // duplicate router.refresh() for every Enter-committed edit. jsdom does not
    // implement the unfocusing steps, which is why nine green tests missed it.
    if (busy) return
    if (draft.trim() === current.trim()) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      await onSave(draft)
      setSaved({ from: value, to: draft.trim() })
      setEditing(false)
    } catch {
      // Stay in edit mode so the typed value survives and the operator can
      // retry; the owning card renders the message. Swallowing the rejection
      // here is deliberate — `commit` is called from onBlur/onKeyDown, where an
      // escaping rejection is an unhandled promise, not an error the operator
      // ever sees.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      {editing ? (
        <input
          autoFocus
          type={inputType ?? 'text'}
          aria-label={label}
          value={draft}
          // readOnly, NOT disabled: a disabled input is unfocusable, so flipping
          // it mid-save rips focus out from under the operator (and fires the
          // spurious blur the guard above exists to absorb).
          readOnly={busy}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              setDraft(current)
              setEditing(false)
            }
          }}
          className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-0.5 text-sm"
        />
      ) : current ? (
        <dd className="mt-0.5">
          <button type="button" onClick={startEditing} className="text-left text-sm font-medium text-foreground hover:underline">
            {saved?.to ?? display ?? value}
          </button>
        </dd>
      ) : (
        <dd className="mt-0.5">
          <button type="button" onClick={startEditing} className="text-sm text-primary hover:underline">
            + Add {label}
          </button>
        </dd>
      )}
    </div>
  )
}

/**
 * The opportunity's metadata card: the handful of facts a quote hangs on, each
 * editable where it sits.
 *
 * Two changes of substance from the em-dash grid this replaces:
 *   - Editing a fact no longer swaps the WHOLE card for OpportunityDetailsForm.
 *     That reflowed the spine and cost the operator their place for a one-word
 *     correction. The full form survives as an explicit "Edit all details"
 *     escape hatch — the only route to title/contact/notes, which have no
 *     business on a four-fact card.
 *   - Estimated value is NOT here. It is a figure on OpportunityKpiBand, with
 *     its own "+ Add value"; rendering it twice would make the card and the band
 *     argue about which one is the source of truth. Guest count stays, because
 *     the band has no tile for it and it drives headcount on conversion.
 */
export function FactsGrid({ orgId, orgSlug, lead, customer }: FactsGridProps) {
  const router = useRouter()
  const [editingAll, setEditingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Blank -> null clears the field (updateLeadCore maps null to
  // FieldValue.delete()); mirrors the `opt` helper in OpportunityDetailsForm.
  const opt = (v: string): string | null => (v.trim() === '' ? null : v.trim())

  async function save(updates: LeadUpdate) {
    setError(null)
    try {
      await updateLead(orgId, lead.id, updates)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      throw e
    }
  }

  if (editingAll) {
    return (
      <div className="space-y-2">
        <OpportunityDetailsForm orgId={orgId} orgSlug={orgSlug} lead={lead} customer={customer} />
        <Button variant="ghost" size="sm" onClick={() => setEditingAll(false)}>
          Done
        </Button>
      </div>
    )
  }

  const guestCount = lead.guest_count != null ? String(lead.guest_count) : ''

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h4 className="text-[13px] font-semibold">Details</h4>
        <Button variant="ghost" size="xs" onClick={() => setEditingAll(true)}>
          Edit all details
        </Button>
      </header>
      <div aria-live="polite" aria-atomic="true">
        {error && <p role="alert" className="px-3 pt-2 text-sm text-destructive">{error}</p>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-3 sm:grid-cols-3">
        <EditableFact
          label="Event date"
          value={lead.event_date ?? ''}
          display={lead.event_date ? shortDate(lead.event_date) : undefined}
          inputType="date"
          onSave={(v) => save({ event_date: opt(v) })}
        />
        <EditableFact
          label="Event type"
          value={lead.event_type ?? ''}
          onSave={(v) => save({ event_type: opt(v) })}
        />
        <EditableFact
          label="Guest count"
          value={guestCount}
          display={guestCount ? `${guestCount} guests` : undefined}
          inputType="number"
          onSave={(v) => {
            const trimmed = v.trim()
            if (trimmed === '') return save({ guest_count: null })
            const n = Number(trimmed)
            if (Number.isNaN(n)) {
              setError('Guest count must be a number.')
              return Promise.reject(new Error('Guest count must be a number.'))
            }
            return save({ guest_count: n })
          }}
        />
      </dl>
    </section>
  )
}
