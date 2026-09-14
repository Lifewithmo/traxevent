'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { updateOpsRequirements, getOpsPlan } from '@/actions/event-ops'
import { SITE_NEED_OPTIONS as SITE_NEEDS } from '@/lib/ops/derive'
import { MAX_BUFFER_MINUTES, bufferAssumptionLabel, resolveBuffers, type OpsBuffers } from '@/lib/event-ui'
import type { OpsPlan, OpsRequirements, WorkPackage } from '@/lib/types'

interface RequirementsCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  packages: WorkPackage[]
  onPlanChange: (next: OpsPlan) => void
  /** Org.ops_buffers — what a blank override field inherits (inc-3 S3.1). */
  orgBuffers?: OpsBuffers
}

/** '' ⇒ inherit (org default, then the constants); else a whole
 *  1..MAX_BUFFER_MINUTES minutes. Mirrors the org settings pre-flight
 *  (CapacityUnitsClient.parseBufferField) — the SHARED ceiling constant, so
 *  this check cannot drift from the server rejection. */
function parseBufferField(raw: string): { ok: true; value?: number } | { ok: false } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true }
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n <= 0 || n > MAX_BUFFER_MINUTES) return { ok: false }
  return { ok: true, value: n }
}

export function RequirementsCard({ orgId, eventId, plan, packages, onPlanChange, orgBuffers }: RequirementsCardProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const req = plan.requirements
  const [guests, setGuests] = useState(String(req.guests))
  const [serviceStart, setServiceStart] = useState(req.service_start ?? '')
  const [serviceEnd, setServiceEnd] = useState(req.service_end ?? '')
  const [siteNeeds, setSiteNeeds] = useState<string[]>(req.site_needs ?? [])
  const [notes, setNotes] = useState(req.notes ?? '')
  const [packOverride, setPackOverride] = useState(
    req.buffers?.pack_minutes !== undefined ? String(req.buffers.pack_minutes) : '',
  )
  const [driveOverride, setDriveOverride] = useState(
    req.buffers?.drive_minutes !== undefined ? String(req.buffers.drive_minutes) : '',
  )

  const planPackages = plan.package_ids.map((id) => packages.find((p) => p.id === id)?.name ?? `${id} (deleted)`)
  // What a blank field inherits: the org default when set, else the constants.
  const inherited = resolveBuffers(orgBuffers)
  const packParsed = parseBufferField(packOverride)
  const driveParsed = parseBufferField(driveOverride)
  const buffersValid = packParsed.ok && driveParsed.ok
  const hasOverride = req.buffers?.pack_minutes !== undefined || req.buffers?.drive_minutes !== undefined

  function changedFields(): Partial<OpsRequirements> {
    const updates: Partial<OpsRequirements> = {}
    if (Number(guests) !== req.guests) updates.guests = Number(guests)
    if (serviceStart !== (req.service_start ?? '')) updates.service_start = serviceStart
    if (serviceEnd !== (req.service_end ?? '')) updates.service_end = serviceEnd
    if (JSON.stringify(siteNeeds) !== JSON.stringify(req.site_needs ?? [])) updates.site_needs = siteNeeds
    // No null channel in the core: '' is the documented clear-notes workaround.
    if (notes !== (req.notes ?? '')) updates.notes = notes
    // Full replace-the-scalar (org buffers precedent): both fields always sent
    // together; a blank field is omitted and inherits org → constants.
    if (buffersValid) {
      const nextBuffers: NonNullable<OpsRequirements['buffers']> = {
        ...(packParsed.value !== undefined ? { pack_minutes: packParsed.value } : {}),
        ...(driveParsed.value !== undefined ? { drive_minutes: driveParsed.value } : {}),
      }
      if (
        nextBuffers.pack_minutes !== req.buffers?.pack_minutes ||
        nextBuffers.drive_minutes !== req.buffers?.drive_minutes
      ) {
        updates.buffers = nextBuffers
      }
    }
    return updates
  }

  function handleEdit() {
    setGuests(String(req.guests))
    setServiceStart(req.service_start ?? '')
    setServiceEnd(req.service_end ?? '')
    setSiteNeeds(req.site_needs ?? [])
    setNotes(req.notes ?? '')
    setPackOverride(req.buffers?.pack_minutes !== undefined ? String(req.buffers.pack_minutes) : '')
    setDriveOverride(req.buffers?.drive_minutes !== undefined ? String(req.buffers.drive_minutes) : '')
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
            <dt className="text-muted-foreground">Pack/drive buffers</dt>
            <dd>
              {hasOverride
                ? bufferAssumptionLabel(orgBuffers, req.buffers)
                : addField('pack/drive override')}
            </dd>
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
            {/* Per-event pack/drive override (inc-3 S3.1): drive time is
                per-venue — the org default is wrong for exactly the number
                that varies per job. Blank inherits (placeholder shows what). */}
            <div className="flex gap-3 flex-wrap">
              <div>
                <Label htmlFor="req-pack">Pack time (minutes)</Label>
                <Input
                  id="req-pack" type="number" inputMode="numeric" className="w-36"
                  min={1} max={MAX_BUFFER_MINUTES}
                  value={packOverride} placeholder={String(inherited.pack)}
                  onChange={(e) => setPackOverride(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="req-drive">Drive time (minutes)</Label>
                <Input
                  id="req-drive" type="number" inputMode="numeric" className="w-36"
                  min={1} max={MAX_BUFFER_MINUTES}
                  value={driveOverride} placeholder={String(inherited.drive)}
                  onChange={(e) => setDriveOverride(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Behind &quot;Pack by / Leave by&quot; for THIS job — drive time is per-venue. Blank inherits{' '}
              {inherited.pack}m pack · {inherited.drive}m drive.
            </p>
            {!buffersValid && (
              <p className="text-xs text-destructive">
                Buffer minutes must be a whole number between 1 and {MAX_BUFFER_MINUTES} — or blank to inherit.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Changing guests re-derives the shopping list (checked items carry over) and flags the plan for review.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving || !guests || !Number.isFinite(Number(guests)) || Number(guests) <= 0 || !buffersValid}>Save</Button>
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
