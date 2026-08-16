'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { StatTile } from '@/components/ui/stat-tile'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { logVolunteerHours, deleteVolunteerHours } from '@/actions/volunteer-hours'
import { sumHoursByPerson } from '@/lib/volunteer-hours'
import type { EventPerson, VolunteerHoursEntry } from '@/lib/types'

interface VolunteerHoursClientProps {
  orgId: string
  eventId: string
  volunteers: EventPerson[]
  entries: VolunteerHoursEntry[]
}

const selectClass = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm'

export function VolunteerHoursClient({ orgId, eventId, volunteers, entries: initialEntries }: VolunteerHoursClientProps) {
  const [entries, setEntries] = useState<VolunteerHoursEntry[]>(initialEntries)
  const [personId, setPersonId] = useState('')
  const [date, setDate] = useState('')
  const [hours, setHours] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totals = sumHoursByPerson(entries)
  // Hours logged against people no longer in the volunteer list still count —
  // surface them so the badges don't silently understate total logged hours.
  const volunteerIds = new Set(volunteers.map((v) => v.id))
  const unattributedHours = Object.entries(totals)
    .filter(([id]) => !volunteerIds.has(id))
    .reduce((sum, [, h]) => sum + h, 0)
  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0)

  async function handleLog() {
    const v = volunteers.find((x) => x.id === personId)
    const h = Number(hours)
    if (!v || !date || !h || h <= 0) {
      setError('Pick a volunteer, date, and a positive number of hours.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const entry = await logVolunteerHours(orgId, eventId, {
        personId: v.id, personName: v.name, date, hours: h, note: note.trim() || undefined,
      })
      setEntries((prev) => [entry, ...prev])
      setHours(''); setNote('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to log hours')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setSaving(true)
    setError(null)
    try {
      await deleteVolunteerHours(orgId, eventId, id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">Volunteer Hours ({entries.length})</h2>

      {volunteers.length === 0 ? (
        <EmptyState
          title="Add volunteers above to start logging hours."
          description="Volunteers you add to this event show up here."
        />
      ) : (
        <>
          {/* Figures */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <StatTile label="Total hours" value={String(totalHours)} note="logged on this event" />
            <StatTile label="Volunteers" value={String(volunteers.length)} />
          </div>

          {/* Totals per volunteer */}
          <div className="flex flex-wrap gap-2">
            {volunteers.map((v) => (
              <Badge key={v.id} variant="outline">{v.name}: {totals[v.id] ?? 0} h</Badge>
            ))}
            {unattributedHours > 0 && (
              <Badge variant="secondary">Former volunteers: {unattributedHours} h</Badge>
            )}
          </div>

          {/* Log form */}
          <Card>
            <CardHeader><CardTitle className="text-base">Log hours</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="vhPerson">Volunteer</Label>
                  <select id="vhPerson" className={selectClass + ' w-full'} value={personId} onChange={(e) => setPersonId(e.target.value)}>
                    <option value="">— Select —</option>
                    {volunteers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vhDate">Date</Label>
                  <Input id="vhDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vhHours">Hours</Label>
                  <Input id="vhHours" type="number" min={0} step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="vhNote">Note (optional)</Label>
                <Input id="vhNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Kitchen shift" />
              </div>
              <div aria-live="polite" aria-atomic="true">
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <Button onClick={handleLog} disabled={saving}>{saving ? 'Saving…' : 'Log hours'}</Button>
            </CardContent>
          </Card>

          {/* Entries */}
          {entries.length > 0 && (
            <div className="bg-card rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className="px-4 text-muted-foreground">Volunteer</TableHead>
                    <TableHead className="px-4 text-muted-foreground">Date</TableHead>
                    <TableHead className="px-4 text-right text-muted-foreground">Hours</TableHead>
                    <TableHead className="px-4 text-muted-foreground">Note</TableHead>
                    <TableHead className="px-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="px-4 font-medium">{e.person_name}</TableCell>
                      <TableCell className="px-4">{e.date}</TableCell>
                      <TableCell className="px-4 text-right">{e.hours}</TableCell>
                      <TableCell className="px-4 text-muted-foreground">{e.note ?? ''}</TableCell>
                      <TableCell className="px-4 text-right">
                        <Button size="sm" variant="outline" onClick={() => handleDelete(e.id)} disabled={saving}>Remove</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
