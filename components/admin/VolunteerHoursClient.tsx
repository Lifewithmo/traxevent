'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { logVolunteerHours, deleteVolunteerHours } from '@/actions/volunteer-hours'
import { sumHoursByPerson } from '@/lib/volunteer-hours'
import type { EventPerson, VolunteerHoursEntry } from '@/lib/types'

interface VolunteerHoursClientProps {
  orgId: string
  campId: string
  volunteers: EventPerson[]
  entries: VolunteerHoursEntry[]
}

const selectClass =
  'w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function VolunteerHoursClient({ orgId, campId, volunteers, entries: initialEntries }: VolunteerHoursClientProps) {
  const [entries, setEntries] = useState<VolunteerHoursEntry[]>(initialEntries)
  const [personId, setPersonId] = useState('')
  const [date, setDate] = useState('')
  const [hours, setHours] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totals = sumHoursByPerson(entries)

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
      const entry = await logVolunteerHours(orgId, campId, {
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
      await deleteVolunteerHours(orgId, campId, id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <h2 className="text-xl font-bold">Volunteer Hours</h2>

      {volunteers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add volunteers above to start logging hours.</p>
      ) : (
        <>
          {/* Totals per volunteer */}
          <div className="flex flex-wrap gap-2">
            {volunteers.map((v) => (
              <Badge key={v.id} variant="outline">{v.name}: {totals[v.id] ?? 0} h</Badge>
            ))}
          </div>

          {/* Log form */}
          <Card>
            <CardHeader><CardTitle className="text-base">Log hours</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="vhPerson">Volunteer</Label>
                  <select id="vhPerson" className={selectClass} value={personId} onChange={(e) => setPersonId(e.target.value)}>
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
              <table className="w-full text-sm">
                <thead className="bg-muted border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Volunteer</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Hours</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Note</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{e.person_name}</td>
                      <td className="px-4 py-2">{e.date}</td>
                      <td className="px-4 py-2 text-right">{e.hours}</td>
                      <td className="px-4 py-2 text-muted-foreground">{e.note ?? ''}</td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => handleDelete(e.id)} disabled={saving}>Remove</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
