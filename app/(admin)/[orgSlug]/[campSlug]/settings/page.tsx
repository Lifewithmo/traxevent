'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { getOrgBySlug } from '@/actions/orgs'
import { getCampBySlug, updateCamp } from '@/actions/camps'
import { getAllEventTypes, getEventType, DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Camp } from '@/lib/types'

export default function EventSettingsPage() {
  const { orgSlug, campSlug } = useParams<{ orgSlug: string; campSlug: string }>()
  const [camp, setCamp] = useState<Camp | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [status, setStatus] = useState<Camp['status']>('draft')
  const [eventTypeId, setEventTypeId] = useState<string>(DEFAULT_EVENT_TYPE_ID)
  const [campStart, setCampStart] = useState('')
  const [campEnd, setCampEnd] = useState('')
  const [registrationOpen, setRegistrationOpen] = useState('')
  const [registrationClose, setRegistrationClose] = useState('')
  const [capacity, setCapacity] = useState<string>('')

  useEffect(() => {
    async function load() {
      const org = await getOrgBySlug(orgSlug)
      if (!org) return
      setOrgId(org.id)
      const c = await getCampBySlug(org.id, campSlug)
      if (!c) return
      setCamp(c)
      setName(c.name)
      setStatus(c.status)
      setEventTypeId(c.event_type_id ?? DEFAULT_EVENT_TYPE_ID)
      setCampStart(c.camp_start)
      setCampEnd(c.camp_end)
      setRegistrationOpen(c.registration_open ?? '')
      setRegistrationClose(c.registration_close ?? '')
      setCapacity(c.capacity != null ? String(c.capacity) : '')
    }
    load()
  }, [orgSlug, campSlug])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !camp) return
    setError(null)
    setSaving(true)
    setSaved(false)
    try {
      await updateCamp(orgId, camp.id, {
        name,
        status,
        event_type_id: eventTypeId,
        registration_type: getEventType(eventTypeId).registrationUnit,
        camp_start: campStart,
        camp_end: campEnd,
        registration_open: registrationOpen || undefined,
        registration_close: registrationClose || undefined,
        capacity: capacity ? Number(capacity) : undefined,
      })
      setSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!camp) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Event settings</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Event name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => { setName(e.target.value); setSaved(false) }}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="eventType">Event type</Label>
              <select
                id="eventType"
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={eventTypeId}
                onChange={(e) => { setEventTypeId(e.target.value); setSaved(false) }}
              >
                {getAllEventTypes().map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.name} — {et.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={status}
                onChange={(e) => { setStatus(e.target.value as Camp['status']); setSaved(false) }}
              >
                <option value="draft">Draft — not visible to registrants</option>
                <option value="active">Active — registration open</option>
                <option value="archived">Archived — read-only</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="campStart">Event start</Label>
                <Input
                  id="campStart"
                  type="date"
                  value={campStart}
                  onChange={(e) => { setCampStart(e.target.value); setSaved(false) }}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="campEnd">Event end</Label>
                <Input
                  id="campEnd"
                  type="date"
                  value={campEnd}
                  onChange={(e) => { setCampEnd(e.target.value); setSaved(false) }}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="regOpen">Registration opens</Label>
                <Input
                  id="regOpen"
                  type="date"
                  value={registrationOpen}
                  onChange={(e) => { setRegistrationOpen(e.target.value); setSaved(false) }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="regClose">Registration closes</Label>
                <Input
                  id="regClose"
                  type="date"
                  value={registrationClose}
                  onChange={(e) => { setRegistrationClose(e.target.value); setSaved(false) }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="capacity">Capacity cap (optional)</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => { setCapacity(e.target.value); setSaved(false) }}
                placeholder="No limit"
              />
            </div>

            <div aria-live="polite" aria-atomic="true">
              {error && <p className="text-sm text-destructive">{error}</p>}
              {saved && <p className="text-sm text-accent">Settings saved.</p>}
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
