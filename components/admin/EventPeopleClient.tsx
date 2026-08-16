'use client'

import { useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { addEventPerson, updateEventPersonPermissions, removeEventPerson } from '@/actions/people'
import { EVENT_PAGES, type EventPerson, type EventPersonKind, type PermissionTemplate, type EventPage } from '@/lib/types'

interface EventPeopleClientProps {
  orgId: string
  eventId: string
  people: EventPerson[]
  templates: PermissionTemplate[]
}

const selectClass = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm'

function PersonCard({
  person,
  templates,
  saving,
  onRemove,
  onApplyTemplate,
  onTogglePage,
}: {
  person: EventPerson
  templates: PermissionTemplate[]
  saving: boolean
  onRemove: (person: EventPerson) => void
  onApplyTemplate: (person: EventPerson, tid: string) => void
  onTogglePage: (person: EventPerson, page: EventPage) => void
}) {
  return (
    <Card>
      <CardContent className="py-3 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <Avatar name={person.name} size="sm" />
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="font-medium">{person.name}</p>
                {person.role && <Badge variant="secondary">{person.role}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{person.email}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => onRemove(person)} disabled={saving}>
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
              onChange={(e) => e.target.value && onApplyTemplate(person, e.target.value)}
            >
              <option value="">— Custom —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {EVENT_PAGES.map((page) => {
              const id = `${person.id}-${page}`
              return (
                <label key={page} htmlFor={id} className="flex items-center gap-2 text-sm capitalize cursor-pointer">
                  <input
                    id={id}
                    type="checkbox"
                    className="w-4 h-4"
                    checked={person.pages.includes(page)}
                    onChange={() => onTogglePage(person, page)}
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

export function EventPeopleClient({
  orgId,
  eventId,
  people: initialPeople,
  templates,
}: EventPeopleClientProps) {
  const [people, setPeople] = useState<EventPerson[]>(initialPeople)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<EventPerson | null>(null)

  // Last non-null target — keeps the dialog description stable while the close animation plays.
  const lastRemoveTarget = useRef(removeTarget)
  if (removeTarget !== null) lastRemoveTarget.current = removeTarget

  const [kind, setKind] = useState<EventPersonKind>('volunteer')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [pages, setPages] = useState<EventPage[]>([])

  function applyTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find((x) => x.id === id)
    if (t) setPages([...t.pages])
  }

  function togglePage(page: EventPage) {
    setPages((prev) => (prev.includes(page) ? prev.filter((p) => p !== page) : [...prev, page]))
    setTemplateId('')
  }

  async function handleAdd() {
    if (!name.trim() || !email.trim()) return
    setSaving(true)
    setError(null)
    try {
      const person = await addEventPerson(orgId, eventId, {
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
    setRemoveTarget(null)
    setSaving(true)
    setError(null)
    try {
      await removeEventPerson(orgId, eventId, personId)
      setPeople((prev) => prev.filter((p) => p.id !== personId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove')
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePersonPage(person: EventPerson, page: EventPage) {
    const prev = person  // snapshot before optimistic update
    const nextPages = person.pages.includes(page)
      ? person.pages.filter((p) => p !== page)
      : [...person.pages, page]
    setPeople((list) =>
      list.map((p) => (p.id === person.id ? { ...p, pages: nextPages, applied_template_id: null } : p))
    )
    try {
      await updateEventPersonPermissions(orgId, eventId, person.id, nextPages)
    } catch (err: unknown) {
      setPeople((list) => list.map((p) => (p.id === person.id ? prev : p)))  // rollback
      setError(err instanceof Error ? err.message : 'Failed to update permissions')
    }
  }

  async function handleApplyTemplateToPerson(person: EventPerson, tid: string) {
    const t = templates.find((x) => x.id === tid)
    if (!t) return
    const prev = person  // snapshot before optimistic update
    const nextPages = [...t.pages]
    setPeople((list) =>
      list.map((p) => (p.id === person.id ? { ...p, pages: nextPages, applied_template_id: tid } : p))
    )
    try {
      await updateEventPersonPermissions(orgId, eventId, person.id, nextPages, tid)
    } catch (err: unknown) {
      setPeople((list) => list.map((p) => (p.id === person.id ? prev : p)))  // rollback
      setError(err instanceof Error ? err.message : 'Failed to apply template')
    }
  }

  const staff = people.filter((p) => p.kind === 'staff')
  const volunteers = people.filter((p) => p.kind === 'volunteer')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">People ({people.length})</h2>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="kind">Type</Label>
                <select id="kind" className={selectClass + ' w-full'} value={kind} onChange={(e) => setKind(e.target.value as EventPersonKind)}>
                  <option value="volunteer">Volunteer</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="role">Role</Label>
                <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Cabin Leader" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
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
              <div className="grid gap-2 sm:grid-cols-3">
                {EVENT_PAGES.map((page) => {
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
        <h3 className="text-sm font-medium text-muted-foreground">Staff ({staff.length})</h3>
        {staff.length === 0 ? (
          <EmptyState
            title="No staff assigned to this event yet."
            description="Add one with the Add person button above."
          />
        ) : (
          staff.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              templates={templates}
              saving={saving}
              onRemove={setRemoveTarget}
              onApplyTemplate={handleApplyTemplateToPerson}
              onTogglePage={handleTogglePersonPage}
            />
          ))
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Volunteers ({volunteers.length})</h3>
        {volunteers.length === 0 ? (
          <EmptyState
            title="No volunteers assigned to this event yet."
            description="Add one with the Add person button above."
          />
        ) : (
          volunteers.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              templates={templates}
              saving={saving}
              onRemove={setRemoveTarget}
              onApplyTemplate={handleApplyTemplateToPerson}
              onTogglePage={handleTogglePersonPage}
            />
          ))
        )}
      </section>

      <Dialog open={removeTarget !== null} onOpenChange={(open) => { if (!open) setRemoveTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this person from the event?</DialogTitle>
            <DialogDescription>
              {lastRemoveTarget.current
                ? `${lastRemoveTarget.current.name} will be removed from this event's roster and lose page access.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => { if (removeTarget) handleRemove(removeTarget.id) }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
