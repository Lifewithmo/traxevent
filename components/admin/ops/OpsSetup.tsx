'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { instantiateOpsPlan } from '@/actions/event-ops'
import { formatMoney } from '@/lib/utils'
import type { OpsPlan, WorkPackage } from '@/lib/types'

const SITE_NEEDS = ['power', 'water', 'ice', 'parking'] as const

interface OpsSetupProps {
  orgId: string
  eventId: string
  packages: WorkPackage[]
  eventStart: string
  industryPackId?: string
  defaultGuests?: number
  onCreated: (plan: OpsPlan) => void
}

export function OpsSetup({ orgId, eventId, packages, eventStart, industryPackId, defaultGuests, onCreated }: OpsSetupProps) {
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
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Set up this event&apos;s ops plan</CardTitle>
        <p className="text-sm text-gray-500">
          Packages and guest count drive the shopping list, packing list, deadlines, and checklists.
          Packages can&apos;t be changed after setup yet — pick carefully.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
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
              {p.name} <span className="text-gray-500">{formatMoney(p.price)}</span>
              {p.max_guests !== undefined && <span className="text-gray-400 text-xs">up to {p.max_guests}</span>}
            </label>
          ))}
          {packages.length === 0 && (
            <p className="text-sm text-gray-500">No packages in your catalog yet — create one under Menu Packages first.</p>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={handleCreate} disabled={saving || selected.length === 0 || !guests || Number(guests) <= 0}>
          Set up ops plan
        </Button>
      </CardContent>
    </Card>
  )
}
