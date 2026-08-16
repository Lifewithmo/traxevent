'use client'

import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  eventId: string
  items: ItineraryItem[]
  published: boolean
}

function formatDayHeading(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function ItineraryClient({ orgId, eventId, items: initialItems, published: initialPublished }: ItineraryClientProps) {
  const [items, setItems] = useState<ItineraryItem[]>(initialItems)
  const [published, setPublished] = useState(initialPublished)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(initialItems.length === 0)
  const [deleteId, setDeleteId] = useState<string | null>(null)

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
      const item = await createItineraryItem(orgId, eventId, {
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
      await updateItineraryItem(orgId, eventId, id, {
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
    setSaving(true)
    setError(null)
    try {
      await deleteItineraryItem(orgId, eventId, id)
      setItems((prev) => prev.filter((i) => i.id !== id))
      setDeleteId(null)
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
      await setItineraryPublished(orgId, eventId, next)
      setPublished(next)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  function startEditing(it: ItineraryItem) {
    setEditingId(it.id)
    setEditTitle(it.title)
    setEditStart(it.start_time)
    setEditEnd(it.end_time ?? '')
    setEditLocation(it.location ?? '')
  }

  const addToggle = (
    <Button variant="outline" size="sm" aria-expanded={addOpen} onClick={() => setAddOpen((o) => !o)}>
      + Add block
    </Button>
  )

  return (
    <div className="p-5 space-y-4">
      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Schedule</h2>
            <p className="text-xs text-muted-foreground">
              {items.length} block{items.length !== 1 ? 's' : ''} across {days.length} day{days.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill tone={published ? 'confirmed' : 'neutral'}>
              {published ? 'Published' : 'Draft'}
            </StatusPill>
            <Button variant="outline" size="sm" onClick={handleTogglePublish} disabled={saving}>
              {published ? 'Unpublish' : 'Publish to registrants'}
            </Button>
          </div>
        </div>

        {days.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState title="No schedule blocks yet." action={addOpen ? undefined : addToggle} />
          </div>
        ) : (
          <div className="space-y-5">
            {days.map(({ day: d, items: dayItems }) => (
              <div key={d} className="space-y-2">
                <h3 className="font-semibold text-sm">{formatDayHeading(d)}</h3>
                {dayItems.map((it) => (
                  <Card key={it.id}>
                    <CardContent className="py-3">
                      {editingId === it.id ? (
                        <div className="space-y-2">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <Input className="h-8" aria-label="Start time" value={editStart} type="time" onChange={(e) => setEditStart(e.target.value)} />
                            <Input className="h-8" aria-label="End time" value={editEnd} type="time" onChange={(e) => setEditEnd(e.target.value)} />
                            <Input className="h-8" aria-label="Location" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="Location" />
                          </div>
                          <Input className="h-8" aria-label="Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveEdit(it.id)} disabled={saving}>Save</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">
                              {formatTime(it.start_time)}{it.end_time ? ` – ${formatTime(it.end_time)}` : ''} · {it.title}
                            </p>
                            {(it.location || it.description) && (
                              <p className="text-xs text-muted-foreground">
                                {[it.location, it.description].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                          <Menu>
                            <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" disabled={saving} />}>
                              <MoreHorizontal />
                            </MenuTrigger>
                            <MenuContent>
                              <MenuItem onClick={() => startEditing(it)}>Edit</MenuItem>
                              <MenuItem
                                className="text-destructive data-highlighted:text-destructive"
                                onClick={() => { setError(null); setDeleteId(it.id) }}
                              >
                                Delete
                              </MenuItem>
                            </MenuContent>
                          </Menu>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        {days.length > 0 && addToggle}
        {addOpen && (
          <Card>
            <CardHeader><CardTitle className="text-base">Add a schedule block</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
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
              <div className="grid gap-2 sm:grid-cols-2">
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
        )}
      </section>

      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this item?</DialogTitle>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => { if (deleteId) handleDelete(deleteId) }}
              disabled={saving}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
