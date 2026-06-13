'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { getOrgBySlug } from '@/actions/orgs'
import { getCampBySlug, updateCamp } from '@/actions/camps'
import { DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import type { EventType } from '@/lib/event-types'
import { listOrgEventTypes } from '@/actions/event-types'
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
  const [paymentAmount, setPaymentAmount] = useState<string>('')
  const [fromDisplayName, setFromDisplayName] = useState<string>('')
  const [replyToEmail, setReplyToEmail] = useState<string>('')
  const [eventTypes, setEventTypes] = useState<EventType[]>([])

  useEffect(() => {
    async function load() {
      const org = await getOrgBySlug(orgSlug)
      if (!org) return
      setOrgId(org.id)
      listOrgEventTypes(org.id).then(setEventTypes)
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
      setPaymentAmount(c.payment_amount != null ? String(c.payment_amount) : '')
      setFromDisplayName(c.from_display_name ?? '')
      setReplyToEmail(c.reply_to_email ?? '')
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
      const selectedType = eventTypes.find((t) => t.id === eventTypeId)
      await updateCamp(orgId, camp.id, {
        name,
        status,
        event_type_id: eventTypeId,
        registration_type: selectedType ? selectedType.registrationUnit : camp.registration_type,
        event_type_terminology: selectedType?.is_custom ? selectedType.terminology : undefined,
        camp_start: campStart,
        camp_end: campEnd,
        registration_open: registrationOpen || undefined,
        registration_close: registrationClose || undefined,
        capacity: capacity ? Number(capacity) : undefined,
        payment_amount: paymentAmount ? Number(paymentAmount) : undefined,
        from_display_name: fromDisplayName || undefined,
        reply_to_email: replyToEmail || undefined,
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
                {eventTypes.map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.name}{et.is_custom ? ' (custom)' : ''} — {et.description}
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

            <div className="space-y-1">
              <Label htmlFor="paymentAmount">Registration fee (optional)</Label>
              <Input
                id="paymentAmount"
                type="number"
                min={0}
                step="0.01"
                value={paymentAmount}
                onChange={(e) => { setPaymentAmount(e.target.value); setSaved(false) }}
                placeholder="0 for free events"
              />
              <p className="text-xs text-muted-foreground">
                In dollars. Leave blank or 0 for free events. TraxEvent collects 1% of paid registrations automatically.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="fromDisplayName">Email sender name (optional)</Label>
              <Input
                id="fromDisplayName"
                value={fromDisplayName}
                onChange={(e) => { setFromDisplayName(e.target.value); setSaved(false) }}
                placeholder={`${camp.name} at Your Church`}
              />
              <p className="text-xs text-muted-foreground">
                How your org appears in the "From" field of emails. Defaults to TraxEvent if left blank.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="replyToEmail">Reply-to email address (optional)</Label>
              <Input
                id="replyToEmail"
                type="email"
                value={replyToEmail}
                onChange={(e) => { setReplyToEmail(e.target.value); setSaved(false) }}
                placeholder="director@yourchurch.org"
              />
              <p className="text-xs text-muted-foreground">
                Replies from registrants are routed to this address instead of TraxEvent.
              </p>
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
