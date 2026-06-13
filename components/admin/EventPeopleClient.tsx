'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { addEventPerson, updateEventPersonPermissions, removeEventPerson } from '@/actions/people'
import { CAMP_PAGES, type EventPerson, type EventPersonKind, type PermissionTemplate, type CampPage } from '@/lib/types'

interface EventPeopleClientProps {
  orgId: string
  campId: string
  people: EventPerson[]
  templates: PermissionTemplate[]
}

const selectClass =
  'w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function EventPeopleClient({
  orgId,
  campId,
  people: initialPeople,
  templates,
}: EventPeopleClientProps) {
  const [people, setPeople] = useState<EventPerson[]>(initialPeople)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [kind, setKind] = useState<EventPersonKind>('volunteer')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [pages, setPages] = useState<CampPage[]>([])

  function applyTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find((x) => x.id === id)
    if (t) setPages([...t.pages])
  }

  function togglePage(page: CampPage) {
    setPages((prev) => (prev.includes(page) ? prev.filter((p) => p !== page) : [...prev, page]))
    setTemplateId('')
  }

  async function handleAdd() {
    if (!name.trim() || !email.trim()) return
    setSaving(true)
    setError(null)
    try {
      const person = await addEventPerson(orgId, campId, {
        kind,
        name: name.trim(),
        email: email.trim(),
        role: role.trim(),
        pages,
        ...(templateId ? { appliedTemplateId: templateId } : {}),
      })
      setPeople((prev) => [...prev, person])
      setAdding(false)
      setName(''); setEmail(''); setRole(''); setPages([]); setTemplateId(''); setKind('volunteer')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(personId: string) {
    if (!confirm('Remove this person from the event?')) return
    setSaving(true)
    setError(null)
    try {
      await removeEventPerson(orgId, campId, personId)
      setPeople((prev) => prev.filter((p) => p.id !== personId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove')
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePersonPage(person: EventPerson, page: CampPage) {
    const nextPages = person.pages.includes(page)
      ? person.pages.filter((p) => p !== page)
      : [...person.pages, page]
    setPeople((prev) =>
      prev.map((p) => (p.id === person.id ? { ...p, pages: nextPages, applied_template_id: null } : p))
    )
    try {
      await updateEventPersonPermissions(orgId, campId, person.id, nextPages)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update permissions')
    }
  }

  async function handleApplyTemplateToPerson(person: EventPerson, tid: string) {
    const t = templates.find((x) => x.id === tid)
    if (!t) return
    const nextPages = [...t.pages]
    setPeople((prev) =>
      prev.map((p) => (p.id === person.id ? { ...p, pages: nextPages, applied_template_id: tid } : p))
    )
    try {
      await updateEventPersonPermissions(orgId, campId, person.id, nextPages, tid)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to apply template')
    }
  }

  const staff = people.filter((p) => p.kind === 'staff')
  const volunteers = people.filter((p) => p.kind === 'volunteer')

  function PersonCard({ person }: { person: EventPerson }) {
    return (
      <Card>
        <CardContent className="py-3 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="font-medium">{person.name}</p>
                {person.role && <Badge variant="secondary">{person.role}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{person.email}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => handleRemove(person.id)} disabled={saving}>
              Remove
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor={`tmpl-${person.id}`} className="text-xs text-muted-foreground">Apply template</Label>
              <select
                id={`tmpl-${person.id}`}
                className={selectClass + ' max-w-xs'}
                value={person.applied_template_id ?? ''}
                onChange={(e) => e.target.value && handleApplyTemplateToPerson(person, e.target.value)}
              >
                <option value="">— Custom —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {CAMP_PAGES.map((page) => {
                const id = `${person.id}-${page}`
                return (
                  <label key={page} htmlFor={id} className="flex items-center gap-2 text-sm capitalize cursor-pointer">
                    <input
                      id={id}
                      type="checkbox"
                      className="w-4 h-4"
                      checked={person.pages.includes(page)}
                      onChange={() => handleTogglePersonPage(person, page)}
                    />
                    {page}
                  </label>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">People</h1>
        {!adding && <Button onClick={() => { setAdding(true); setError(null) }}>Add person</Button>}
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {adding && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add staff or volunteer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="kind">Type</Label>
                <select id="kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as EventPersonKind)}>
                  <option value="volunteer">Volunteer</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="role">Role</Label>
                <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Cabin Leader" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="addTemplate" className="text-xs text-muted-foreground">Apply template</Label>
                <select
                  id="addTemplate"
                  className={selectClass + ' max-w-xs'}
                  value={templateId}
                  onChange={(e) => applyTemplate(e.target.value)}
                >
                  <option value="">— Custom —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {CAMP_PAGES.map((page) => {
                  const id = `add-${page}`
                  return (
                    <label key={page} htmlFor={id} className="flex items-center gap-2 text-sm capitalize cursor-pointer">
                      <input
                        id={id}
                        type="checkbox"
                        className="w-4 h-4"
                        checked={pages.includes(page)}
                        onChange={() => togglePage(page)}
                      />
                      {page}
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={saving || !name.trim() || !email.trim()}>
                {saving ? 'Adding…' : 'Add person'}
              </Button>
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Staff ({staff.length})</h2>
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff assigned to this event yet.</p>
        ) : (
          staff.map((p) => <PersonCard key={p.id} person={p} />)
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Volunteers ({volunteers.length})</h2>
        {volunteers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No volunteers assigned to this event yet.</p>
        ) : (
          volunteers.map((p) => <PersonCard key={p.id} person={p} />)
        )}
      </section>
    </div>
  )
}
