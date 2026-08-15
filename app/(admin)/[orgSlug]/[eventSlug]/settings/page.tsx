'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { getOrgBySlug } from '@/actions/orgs'
import { getEventBySlug, updateEvent } from '@/actions/events'
import { DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import type { EventType } from '@/lib/event-types'
import { listOrgEventTypes } from '@/actions/event-types'
import { listDepartments } from '@/actions/departments'
import type { Department } from '@/lib/types'
import { resolveEnabledModules, type ModuleId } from '@/lib/industry-packs'
import { kindOf } from '@/lib/occasions/kind'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Event, EventKeyContact } from '@/lib/types'

export default function EventSettingsPage() {
  const { orgSlug, eventSlug } = useParams<{ orgSlug: string; eventSlug: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [status, setStatus] = useState<Event['status']>('draft')
  const [eventTypeId, setEventTypeId] = useState<string>(DEFAULT_EVENT_TYPE_ID)
  const [eventStart, setEventStart] = useState('')
  const [eventEnd, setEventEnd] = useState('')
  const [registrationOpen, setRegistrationOpen] = useState('')
  const [registrationClose, setRegistrationClose] = useState('')
  const [capacity, setCapacity] = useState<string>('')
  const [paymentAmount, setPaymentAmount] = useState<string>('')
  const [fromDisplayName, setFromDisplayName] = useState<string>('')
  const [replyToEmail, setReplyToEmail] = useState<string>('')
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [departmentId, setDepartmentId] = useState<string>('')
  const [enabledModules, setEnabledModules] = useState<ModuleId[]>([])
  const [headcount, setHeadcount] = useState<string>('')
  const [keyContacts, setKeyContacts] = useState<EventKeyContact[]>([])
  const [locationName, setLocationName] = useState('')
  const [locationAddress, setLocationAddress] = useState('')
  const [hoursStart, setHoursStart] = useState('')
  const [hoursEnd, setHoursEnd] = useState('')
  const [boothFee, setBoothFee] = useState('')

  useEffect(() => {
    async function load() {
      const org = await getOrgBySlug(orgSlug)
      if (!org) return
      setOrgId(org.id)
      setEnabledModules(resolveEnabledModules(org.industry_pack_id))
      listOrgEventTypes(org.id).then(setEventTypes).catch(() => setError('Failed to load event types'))
      listDepartments(org.id).then(setDepartments).catch(() => setError('Failed to load departments'))
      const c = await getEventBySlug(org.id, eventSlug)
      if (!c) return
      setEvent(c)
      setName(c.name)
      setStatus(c.status)
      setLocationName(c.location?.name ?? '')
      setLocationAddress(c.location?.address ?? '')
      setHoursStart(c.hours?.start ?? '')
      setHoursEnd(c.hours?.end ?? '')
      setBoothFee(c.booth_fee != null ? String(c.booth_fee) : '')
      setEventTypeId(c.event_type_id ?? DEFAULT_EVENT_TYPE_ID)
      setDepartmentId(c.department_id ?? '')
      setEventStart(c.event_start)
      setEventEnd(c.event_end)
      setRegistrationOpen(c.registration_open ?? '')
      setRegistrationClose(c.registration_close ?? '')
      setCapacity(c.capacity != null ? String(c.capacity) : '')
      setPaymentAmount(c.payment_amount != null ? String(c.payment_amount) : '')
      setFromDisplayName(c.from_display_name ?? '')
      setReplyToEmail(c.reply_to_email ?? '')
      setHeadcount(c.headcount != null ? String(c.headcount) : '')
      setKeyContacts(c.key_contacts ?? [])
    }
    load()
  }, [orgSlug, eventSlug])

  const showHeadcountSection = !enabledModules.includes('attendee-roster')
  const rosterEnabled = enabledModules.includes('attendee-roster')
  const isMarketDay = event ? kindOf(event) === 'market_day' : false

  function updateKeyContact(index: number, patch: Partial<EventKeyContact>) {
    setKeyContacts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    setSaved(false)
  }

  function addKeyContact() {
    setKeyContacts((rows) => [...rows, { name: '', role: '' }])
  }

  function removeKeyContact(index: number) {
    setKeyContacts((rows) => rows.filter((_, i) => i !== index))
    setSaved(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !event) return
    setError(null)
    setSaving(true)
    setSaved(false)
    try {
      const selectedType = eventTypes.find((t) => t.id === eventTypeId)
      await updateEvent(orgId, event.id, {
        name,
        status,
        department_id: departmentId || null,
        ...(isMarketDay
          ? {}
          : {
              event_type_id: eventTypeId,
              registration_type: selectedType ? selectedType.registrationUnit : (event.registration_type ?? 'individual'),
              event_type_terminology: selectedType
                ? (selectedType.is_custom ? selectedType.terminology : null)
                : undefined,
            }),
        event_start: eventStart,
        event_end: eventEnd,
        registration_open: registrationOpen || undefined,
        registration_close: registrationClose || undefined,
        capacity: capacity ? Number(capacity) : undefined,
        payment_amount: paymentAmount ? Number(paymentAmount) : undefined,
        from_display_name: fromDisplayName || undefined,
        reply_to_email: replyToEmail || undefined,
        ...(showHeadcountSection
          ? {
              headcount: headcount ? Number(headcount) : undefined,
              key_contacts: keyContacts.filter((c) => c.name.trim() || c.role.trim()),
            }
          : {}),
        ...(isMarketDay
          ? {
              location: locationName.trim()
                ? { name: locationName.trim(), ...(locationAddress.trim() ? { address: locationAddress.trim() } : {}) }
                : null,
              hours: hoursStart && hoursEnd ? { start: hoursStart, end: hoursEnd } : null,
              booth_fee: boothFee !== '' ? Number(boothFee) : null,
            }
          : {}),
      })
      setSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!event) {
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

            {!isMarketDay && (
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
            )}

            {isMarketDay && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Market day</h2>
                <div className="space-y-1">
                  <Label htmlFor="md-location">Location name</Label>
                  <Input id="md-location" value={locationName} onChange={(e) => { setLocationName(e.target.value); setSaved(false) }} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="md-address">Address (optional)</Label>
                  <Input id="md-address" value={locationAddress} onChange={(e) => { setLocationAddress(e.target.value); setSaved(false) }} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="md-start">Opens</Label>
                    <Input id="md-start" type="time" value={hoursStart} onChange={(e) => { setHoursStart(e.target.value); setSaved(false) }} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="md-end">Closes</Label>
                    <Input id="md-end" type="time" value={hoursEnd} onChange={(e) => { setHoursEnd(e.target.value); setSaved(false) }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="md-fee">Booth fee ($)</Label>
                  <Input id="md-fee" type="number" min="0" step="1" value={boothFee} onChange={(e) => { setBoothFee(e.target.value); setSaved(false) }} />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="department">Department (optional)</Label>
              <select
                id="department"
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={departmentId}
                onChange={(e) => { setDepartmentId(e.target.value); setSaved(false) }}
              >
                <option value="">— None —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={status}
                onChange={(e) => { setStatus(e.target.value as Event['status']); setSaved(false) }}
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
                  value={eventStart}
                  onChange={(e) => { setEventStart(e.target.value); setSaved(false) }}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="campEnd">Event end</Label>
                <Input
                  id="campEnd"
                  type="date"
                  value={eventEnd}
                  onChange={(e) => { setEventEnd(e.target.value); setSaved(false) }}
                  required
                />
              </div>
            </div>

            {rosterEnabled && !isMarketDay && (
              <>
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
              </>
            )}

            <div className="space-y-1">
              <Label htmlFor="fromDisplayName">Email sender name (optional)</Label>
              <Input
                id="fromDisplayName"
                value={fromDisplayName}
                onChange={(e) => { setFromDisplayName(e.target.value); setSaved(false) }}
                placeholder={`${event.name} at Your Business`}
              />
              <p className="text-xs text-muted-foreground">
                How your org appears in the &ldquo;From&rdquo; field of emails. Defaults to TraxEvent if left blank.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="replyToEmail">Reply-to email address (optional)</Label>
              <Input
                id="replyToEmail"
                type="email"
                value={replyToEmail}
                onChange={(e) => { setReplyToEmail(e.target.value); setSaved(false) }}
                placeholder="you@yourbusiness.com"
              />
              <p className="text-xs text-muted-foreground">
                Replies from registrants are routed to this address instead of TraxEvent.
              </p>
            </div>

            <div aria-live="polite" aria-atomic="true">
              {error && <p className="text-sm text-destructive">{error}</p>}
              {saved && <p className="text-sm text-green-700">Settings saved.</p>}
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {showHeadcountSection && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Headcount &amp; key contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="headcount">Expected headcount</Label>
                <Input
                  id="headcount"
                  type="number"
                  min={0}
                  value={headcount}
                  onChange={(e) => { setHeadcount(e.target.value); setSaved(false) }}
                  placeholder="Number of guests"
                />
                <p className="text-xs text-muted-foreground">
                  A single expected guest count, instead of a per-person attendee roster.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Key contacts</Label>
                {keyContacts.map((contact, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 border rounded-md p-3">
                    <div className="space-y-1">
                      <Label htmlFor={`contactName-${i}`}>Name</Label>
                      <Input
                        id={`contactName-${i}`}
                        value={contact.name}
                        onChange={(e) => updateKeyContact(i, { name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`contactRole-${i}`}>Role</Label>
                      <Input
                        id={`contactRole-${i}`}
                        value={contact.role}
                        onChange={(e) => updateKeyContact(i, { role: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`contactPhone-${i}`}>Phone (optional)</Label>
                      <Input
                        id={`contactPhone-${i}`}
                        value={contact.phone ?? ''}
                        onChange={(e) => updateKeyContact(i, { phone: e.target.value || undefined })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`contactEmail-${i}`}>Email (optional)</Label>
                      <Input
                        id={`contactEmail-${i}`}
                        type="email"
                        value={contact.email ?? ''}
                        onChange={(e) => updateKeyContact(i, { email: e.target.value || undefined })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeKeyContact(i)}
                      >
                        Remove contact
                      </Button>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addKeyContact}>
                  Add contact
                </Button>
              </div>

              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
