'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createEvent } from '@/actions/events'
import { getOrgBySlug } from '@/actions/orgs'
import { listOrgEventTypes } from '@/actions/event-types'
import { DEFAULT_EVENT_TYPE_ID, eventCreateFieldsFromType } from '@/lib/event-types'
import type { EventType } from '@/lib/event-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export default function NewEventPage() {
  const router = useRouter()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const searchParams = useSearchParams()
  // The calendar's empty-state CTAs pass ?date=YYYY-MM-DD (the day/period they were
  // launched from) so the booking lands pre-dated instead of on a blank form.
  const dateParam = searchParams.get('date')
  const seedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : ''
  const [name, setName] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [eventTypeId, setEventTypeId] = useState<string>(DEFAULT_EVENT_TYPE_ID)
  const [eventStart, setEventStart] = useState(seedDate)
  const [eventEnd, setEventEnd] = useState(seedDate)
  // Optional booking time for client jobs (writes the existing Event.hours field).
  // Blank → omitted → the calendar renders the job in the all-day "time TBD" band.
  const [hoursStart, setHoursStart] = useState('')
  const [hoursEnd, setHoursEnd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [orgId, setOrgId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const org = await getOrgBySlug(orgSlug)
        if (!org) {
          setError('Organization not found')
          return
        }
        setOrgId(org.id)
        setEventTypes(await listOrgEventTypes(org.id))
      } catch {
        setError('Failed to load event types')
      }
    }
    load()
  }, [orgSlug])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // Booking time is both-or-neither, and the end must be after the start —
    // otherwise a one-sided range is silently dropped and start>start clamps the grid.
    if (Boolean(hoursStart) !== Boolean(hoursEnd)) {
      setError('Enter both a start and end time, or leave both blank.')
      return
    }
    if (hoursStart && hoursEnd && hoursEnd <= hoursStart) {
      setError('End time must be after the start time.')
      return
    }
    setLoading(true)
    try {
      if (!orgId) throw new Error('Organization not found')
      const selectedType = eventTypes.find((t) => t.id === eventTypeId)
      if (!selectedType) throw new Error('Select an event type')
      const event = await createEvent(orgId, {
        name,
        year,
        ...eventCreateFieldsFromType(selectedType),
        event_start: eventStart,
        event_end: eventEnd,
        ...(hoursStart && hoursEnd ? { hours: { start: hoursStart, end: hoursEnd } } : {}),
      })
      router.push(`/${orgSlug}/${event.slug}/dashboard`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">New event</h1>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="eventType">Event type</Label>
              <select
                id="eventType"
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={eventTypeId}
                onChange={(e) => setEventTypeId(e.target.value)}
              >
                {eventTypes.map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.name}{et.is_custom ? ' (custom)' : ''} — {et.description}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">Event name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Gala 2026" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="year">Year</Label>
              <Input id="year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} min={2020} max={2040} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="campStart">Start date</Label>
                <Input id="campStart" type="date" value={eventStart} onChange={(e) => setEventStart(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="campEnd">End date</Label>
                <Input id="campEnd" type="date" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} required />
              </div>
            </div>
            {/* Optional booking time — sets the job's time on the calendar; blank shows it as "time TBD". */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="hoursStart">Start time (optional)</Label>
                <Input id="hoursStart" type="time" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hoursEnd">End time (optional)</Label>
                <Input id="hoursEnd" type="time" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || eventTypes.length === 0}>
              {loading ? 'Creating…' : 'Create event'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
