'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createCamp } from '@/actions/camps'
import { getOrgBySlug } from '@/actions/orgs'
import { getAllEventTypes } from '@/lib/event-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export default function NewEventPage() {
  const router = useRouter()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [name, setName] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [eventTypeId, setEventTypeId] = useState('summer-camp')
  const [campStart, setCampStart] = useState('')
  const [campEnd, setCampEnd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const eventTypes = getAllEventTypes()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const org = await getOrgBySlug(orgSlug)
      if (!org) throw new Error('Organization not found')
      const selectedType = eventTypes.find((et) => et.id === eventTypeId)!
      const camp = await createCamp(org.id, {
        name,
        year,
        registration_type: selectedType.registrationUnit,
        event_type_id: eventTypeId,
        camp_start: campStart,
        camp_end: campEnd,
      })
      router.push(`/${orgSlug}/${camp.slug}/dashboard`)
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
                    {et.name} — {et.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="name">Event name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Summer Camp 2026"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                min={2020}
                max={2040}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="campStart">Start date</Label>
                <Input
                  id="campStart"
                  type="date"
                  value={campStart}
                  onChange={(e) => setCampStart(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="campEnd">End date</Label>
                <Input
                  id="campEnd"
                  type="date"
                  value={campEnd}
                  onChange={(e) => setCampEnd(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating…' : 'Create event'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
