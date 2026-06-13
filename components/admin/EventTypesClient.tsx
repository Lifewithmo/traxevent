'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createCustomEventType, deleteCustomEventType } from '@/actions/event-types'
import type { EventType, RegistrationUnit, Terminology } from '@/lib/event-types'

interface EventTypesClientProps {
  orgId: string
  types: EventType[]
}

const TERM_FIELDS: { key: keyof Terminology; label: string }[] = [
  { key: 'registrantSingular', label: 'Registrant (singular)' },
  { key: 'registrantPlural', label: 'Registrants (plural)' },
  { key: 'memberSingular', label: 'Member (singular)' },
  { key: 'memberPlural', label: 'Members (plural)' },
  { key: 'assignmentSingular', label: 'Assignment (singular)' },
  { key: 'assignmentPlural', label: 'Assignments (plural)' },
  { key: 'eventLabel', label: 'Event label' },
]

function emptyTerminology(): Terminology {
  return {
    registrantSingular: '', registrantPlural: '', memberSingular: '', memberPlural: '',
    assignmentSingular: '', assignmentPlural: '', eventLabel: '',
  }
}

const selectClass =
  'w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function EventTypesClient({ orgId, types: initial }: EventTypesClientProps) {
  const [types, setTypes] = useState<EventType[]>(initial)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [registrationUnit, setRegistrationUnit] = useState<RegistrationUnit>('individual')
  const [terminology, setTerminology] = useState<Terminology>(emptyTerminology())

  function setTermField(key: keyof Terminology, value: string) {
    setTerminology((prev) => ({ ...prev, [key]: value }))
  }

  async function handleCreate() {
    if (!name.trim() || TERM_FIELDS.some((f) => !terminology[f.key].trim())) {
      setError('Please fill in the name and all terminology fields.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const t = await createCustomEventType(orgId, {
        name: name.trim(),
        description: description.trim(),
        registrationUnit,
        terminology,
      })
      setTypes((prev) => [...prev, t])
      setCreating(false)
      setName(''); setDescription(''); setRegistrationUnit('individual'); setTerminology(emptyTerminology())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this event type? Events already using it keep their settings.')) return
    setSaving(true)
    setError(null)
    try {
      await deleteCustomEventType(orgId, id)
      setTypes((prev) => prev.filter((t) => t.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Event Types</h1>
        {!creating && <Button onClick={() => { setCreating(true); setError(null) }}>New event type</Button>}
      </div>
      <p className="text-sm text-muted-foreground">
        Built-in event types ship with TraxEvent. Create custom types to tailor the terminology and
        registration unit for your org. Built-in types can be used but not edited.
      </p>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {creating && (
        <Card>
          <CardHeader><CardTitle className="text-base">New custom event type</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="etName">Name</Label>
                <Input id="etName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sports Clinic" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="etUnit">Registration unit</Label>
                <select id="etUnit" className={selectClass} value={registrationUnit} onChange={(e) => setRegistrationUnit(e.target.value as RegistrationUnit)}>
                  <option value="family">Family</option>
                  <option value="individual">Individual</option>
                  <option value="child">Child</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="etDesc">Description</Label>
              <Input id="etDesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">Terminology</p>
              <div className="grid grid-cols-2 gap-3">
                {TERM_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label htmlFor={`term-${f.key}`} className="text-xs">{f.label}</Label>
                    <Input id={`term-${f.key}`} value={terminology[f.key]} onChange={(e) => setTermField(f.key, e.target.value)} className="h-8" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save event type'}</Button>
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {types.map((t) => (
          <Card key={t.id}>
            <CardContent className="py-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{t.name}</p>
                    {t.is_custom ? <Badge variant="secondary">Custom</Badge> : <Badge variant="outline">Built-in</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Badge variant="outline" className="text-xs capitalize">{t.registrationUnit}</Badge>
                    <Badge variant="outline" className="text-xs">{t.terminology.registrantPlural} · {t.terminology.assignmentPlural}</Badge>
                  </div>
                </div>
                {t.is_custom && (
                  <Button size="sm" variant="outline" onClick={() => handleDelete(t.id)} disabled={saving}>Delete</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
