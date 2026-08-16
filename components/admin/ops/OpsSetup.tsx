'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { instantiateOpsPlan } from '@/actions/event-ops'
import { formatMoney } from '@/lib/utils'
import { SITE_NEED_OPTIONS as SITE_NEEDS } from '@/lib/ops/derive'
import type { OpsPlan, WorkPackage } from '@/lib/types'

interface OpsSetupProps {
  orgId: string
  eventId: string
  /** Enables the packages-page link in the empty state when the caller has it. */
  orgSlug?: string
  packages: WorkPackage[]
  eventStart: string
  industryPackId?: string
  defaultGuests?: number
  onCreated: (plan: OpsPlan) => void
}

export function OpsSetup({ orgId, eventId, orgSlug, packages, eventStart, industryPackId, defaultGuests, onCreated }: OpsSetupProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [guests, setGuests] = useState(defaultGuests ? String(defaultGuests) : '')
  const [serviceStart, setServiceStart] = useState('')
  const [serviceEnd, setServiceEnd] = useState('')
  const [siteNeeds, setSiteNeeds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setSaving(true); setError(null)
    try {
      const plan = await instantiateOpsPlan(orgId, eventId, {
        package_ids: selected,
        requirements: {
          guests: Number(guests),
          ...(serviceStart ? { service_start: serviceStart } : {}),
          ...(serviceEnd ? { service_end: serviceEnd } : {}),
          ...(siteNeeds.length > 0 ? { site_needs: siteNeeds } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        event_start: eventStart,
        ...(industryPackId ? { industry_pack_id: industryPackId } : {}),
      })
      onCreated(plan)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set up'
      setError(msg.includes('already exists') ? 'An ops plan already exists for this event — reload the page to see it.' : msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <header className="border-b border-border px-3 py-2">
        <h4 className="text-[13px] font-semibold">Set up this event&apos;s ops plan</h4>
      </header>
      <div className="space-y-4 p-3">
        <p className="text-sm text-muted-foreground">
          Packages and guest count drive the shopping list, packing list, deadlines, and checklists.
          Packages can&apos;t be changed after setup yet — pick carefully.
        </p>
        <div className="space-y-1">
          <p className="text-sm font-medium">Packages</p>
          {packages.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={p.name}
                checked={selected.includes(p.id)}
                onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id))}
              />
              {p.name} <span className="text-muted-foreground">{formatMoney(p.price)}</span>
              {p.max_guests !== undefined && <span className="text-xs text-muted-foreground">up to {p.max_guests}</span>}
            </label>
          ))}
          {packages.length === 0 && (
            <EmptyState
              title="No packages in your catalog yet"
              description="Create one under Menu Packages first."
              action={orgSlug ? (
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/${orgSlug}/packages`} />}>
                  Open Menu Packages
                </Button>
              ) : undefined}
            />
          )}
        </div>
        <div className="flex gap-3 flex-wrap">
          <div>
            <Label htmlFor="ops-guests">Guests</Label>
            <Input id="ops-guests" type="number" className="w-28" value={guests} onChange={(e) => setGuests(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ops-svc-start">Service start</Label>
            <Input id="ops-svc-start" type="datetime-local" value={serviceStart} onChange={(e) => setServiceStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ops-svc-end">Service end</Label>
            <Input id="ops-svc-end" type="datetime-local" value={serviceEnd} onChange={(e) => setServiceEnd(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Site needs</p>
          <div className="flex gap-4">
            {SITE_NEEDS.map((n) => (
              <label key={n} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  aria-label={n}
                  checked={siteNeeds.includes(n)}
                  onChange={(e) => setSiteNeeds((prev) => e.target.checked ? [...prev, n] : prev.filter((x) => x !== n))}
                />
                {n}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="ops-notes">Notes</Label>
          <Input id="ops-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleCreate} disabled={saving || selected.length === 0 || !guests || !Number.isFinite(Number(guests)) || Number(guests) <= 0}>
          Set up ops plan
        </Button>
      </div>
    </section>
  )
}
