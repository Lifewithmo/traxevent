'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { updateOpsRequirements, getOpsPlan } from '@/actions/event-ops'
import { SITE_NEED_OPTIONS as SITE_NEEDS } from '@/lib/ops/derive'
import type { OpsPlan, OpsRequirements, WorkPackage } from '@/lib/types'

interface RequirementsCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  packages: WorkPackage[]
  onPlanChange: (next: OpsPlan) => void
}

export function RequirementsCard({ orgId, eventId, plan, packages, onPlanChange }: RequirementsCardProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const req = plan.requirements
  const [guests, setGuests] = useState(String(req.guests))
  const [serviceStart, setServiceStart] = useState(req.service_start ?? '')
  const [serviceEnd, setServiceEnd] = useState(req.service_end ?? '')
  const [siteNeeds, setSiteNeeds] = useState<string[]>(req.site_needs ?? [])
  const [notes, setNotes] = useState(req.notes ?? '')

  const planPackages = plan.package_ids.map((id) => packages.find((p) => p.id === id)?.name ?? `${id} (deleted)`)

  function changedFields(): Partial<OpsRequirements> {
    const updates: Partial<OpsRequirements> = {}
    if (Number(guests) !== req.guests) updates.guests = Number(guests)
    if (serviceStart !== (req.service_start ?? '')) updates.service_start = serviceStart
    if (serviceEnd !== (req.service_end ?? '')) updates.service_end = serviceEnd
    if (JSON.stringify(siteNeeds) !== JSON.stringify(req.site_needs ?? [])) updates.site_needs = siteNeeds
    // No null channel in the core: '' is the documented clear-notes workaround.
    if (notes !== (req.notes ?? '')) updates.notes = notes
    return updates
  }

  function handleEdit() {
    setGuests(String(req.guests))
    setServiceStart(req.service_start ?? '')
    setServiceEnd(req.service_end ?? '')
    setSiteNeeds(req.site_needs ?? [])
    setNotes(req.notes ?? '')
    setError(null)
    setEditing(true)
  }

  async function handleSave() {
    const updates = changedFields()
    if (Object.keys(updates).length === 0) { setEditing(false); return }
    setSaving(true); setError(null)
    try {
      await updateOpsRequirements(orgId, eventId, updates)
      // Guest changes re-derive the shopping list server-side — always re-fetch.
      const fresh = await getOpsPlan(orgId, eventId)
      if (fresh) onPlanChange(fresh)
      setEditing(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Unset fields open the same edit form the Edit button does — the card has an
  // edit affordance, so no bare em-dashes in view mode.
  const addField = (label: string) => (
    <button type="button" onClick={handleEdit} className="text-sm text-[var(--link)] hover:underline">
      + Add {label}
    </button>
  )

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h4 className="text-[13px] font-semibold">Requirements</h4>
        {!editing && <Button variant="outline" size="sm" onClick={handleEdit}>Edit</Button>}
      </header>
      <div className="space-y-3 p-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!editing ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Packages</dt>
            <dd>{planPackages.map((n) => <span key={n} className="mr-1">{n}</span>)}</dd>
            <dt className="text-muted-foreground">Guests</dt>
            <dd className="font-medium">{req.guests}</dd>
            <dt className="text-muted-foreground">Service window</dt>
            <dd>{req.service_start ? `${req.service_start} → ${req.service_end ?? '?'}` : addField('service window')}</dd>
            <dt className="text-muted-foreground">Site needs</dt>
            <dd>{(req.site_needs ?? []).length > 0 ? req.site_needs!.map((n) => <Badge key={n} variant="secondary" className="mr-1">{n}</Badge>) : addField('site needs')}</dd>
            <dt className="text-muted-foreground">Notes</dt>
            <dd>{req.notes || addField('notes')}</dd>
          </dl>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              <div>
                <Label htmlFor="req-guests">Guests</Label>
                <Input id="req-guests" type="number" className="w-28" value={guests} onChange={(e) => setGuests(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="req-start">Service start</Label>
                <Input id="req-start" type="datetime-local" value={serviceStart} onChange={(e) => setServiceStart(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="req-end">Service end</Label>
                <Input id="req-end" type="datetime-local" value={serviceEnd} onChange={(e) => setServiceEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-4">
              {SITE_NEEDS.map((n) => (
                <label key={n} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" aria-label={n} checked={siteNeeds.includes(n)}
                    onChange={(e) => setSiteNeeds((prev) => e.target.checked ? [...prev, n] : prev.filter((x) => x !== n))} />
                  {n}
                </label>
              ))}
            </div>
            <div>
              <Label htmlFor="req-notes">Notes</Label>
              <Input id="req-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Changing guests re-derives the shopping list (checked items carry over) and flags the plan for review.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving || !guests || !Number.isFinite(Number(guests)) || Number(guests) <= 0}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">Change log ({plan.change_log.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {plan.change_log.slice().reverse().map((c, i) => (
              <li key={i}>
                {c.at.slice(0, 16).replace('T', ' ')} — {c.field}: {c.from ?? '—'} → {c.to ?? '—'} ({c.by})
              </li>
            ))}
            {plan.change_log.length === 0 && <li>No changes yet.</li>}
          </ul>
        </details>
      </div>
    </section>
  )
}
