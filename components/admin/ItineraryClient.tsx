'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  createItineraryItem,
  updateItineraryItem,
  deleteItineraryItem,
  setItineraryPublished,
} from '@/actions/itinerary'
import { groupItineraryByDay, formatTime } from '@/lib/itinerary'
import type { ItineraryItem } from '@/lib/types'

interface ItineraryClientProps {
  orgId: string
  campId: string
  items: ItineraryItem[]
  published: boolean
}

function formatDayHeading(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function ItineraryClient({ orgId, campId, items: initialItems, published: initialPublished }: ItineraryClientProps) {
  const [items, setItems] = useState<ItineraryItem[]>(initialItems)
  const [published, setPublished] = useState(initialPublished)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [day, setDay] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editLocation, setEditLocation] = useState('')

  const days = groupItineraryByDay(items)

  async function handleAdd() {
    if (!day || !startTime || !title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const item = await createItineraryItem(orgId, campId, {
        day,
        start_time: startTime,
        end_time: endTime || undefined,
        title: title.trim(),
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        sort_order: items.filter((i) => i.day === day).length,
      })
      setItems((prev) => [...prev, item])
      setStartTime(''); setEndTime(''); setTitle(''); setLocation(''); setDescription('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit(id: string) {
    setSaving(true)
    setError(null)
    try {
      await updateItineraryItem(orgId, campId, id, {
        title: editTitle.trim(),
        start_time: editStart,
        end_time: editEnd || undefined,
        location: editLocation.trim() || undefined,
      })
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, title: editTitle.trim(), start_time: editStart, end_time: editEnd || undefined, location: editLocation.trim() || undefined }
            : i
        )
      )
      setEditingId(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this item?')) return
    setSaving(true)
    setError(null)
    try {
      await deleteItineraryItem(orgId, campId, id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePublish() {
    const next = !published
    setSaving(true)
    setError(null)
    try {
      await setItineraryPublished(orgId, campId, next)
      setPublished(next)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Itinerary</h1>
        <div className="flex items-center gap-3">
          <Badge variant={published ? 'default' : 'secondary'}>
            {published ? 'Published' : 'Draft'}
          </Badge>
          <Button variant="outline" size="sm" onClick={handleTogglePublish} disabled={saving}>
            {published ? 'Unpublish' : 'Publish to registrants'}
          </Button>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Add a schedule block</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="day">Day</Label>
              <Input id="day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="start">Start</Label>
              <Input id="start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end">End (optional)</Label>
              <Input id="end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Morning Session" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="location">Location (optional)</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Main Hall" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">Description (optional)</Label>
              <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleAdd} disabled={saving || !day || !startTime || !title.trim()}>
            {saving ? 'Adding…' : 'Add block'}
          </Button>
        </CardContent>
      </Card>

      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">No schedule blocks yet. Add one above.</p>
      ) : (
        <div className="space-y-5">
          {days.map(({ day: d, items: dayItems }) => (
            <div key={d} className="space-y-2">
              <h2 className="font-semibold text-sm">{formatDayHeading(d)}</h2>
              {dayItems.map((it) => (
                <Card key={it.id}>
                  <CardContent className="py-3">
                    {editingId === it.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <Input className="h-8" value={editStart} type="time" onChange={(e) => setEditStart(e.target.value)} />
                          <Input className="h-8" value={editEnd} type="time" onChange={(e) => setEditEnd(e.target.value)} />
                          <Input className="h-8" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="Location" />
                        </div>
                        <Input className="h-8" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleSaveEdit(it.id)} disabled={saving}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">
                            {formatTime(it.start_time)}{it.end_time ? ` – ${formatTime(it.end_time)}` : ''} · {it.title}
                          </p>
                          {(it.location || it.description) && (
                            <p className="text-xs text-muted-foreground">
                              {[it.location, it.description].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditingId(it.id)
                            setEditTitle(it.title)
                            setEditStart(it.start_time)
                            setEditEnd(it.end_time ?? '')
                            setEditLocation(it.location ?? '')
                          }}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => handleDelete(it.id)} disabled={saving}>Delete</Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
