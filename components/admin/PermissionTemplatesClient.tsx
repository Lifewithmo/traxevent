'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createPermissionTemplate, updatePermissionTemplate, deletePermissionTemplate } from '@/actions/people'
import { CAMP_PAGES, type PermissionTemplate, type CampPage } from '@/lib/types'

interface PermissionTemplatesClientProps {
  orgId: string
  templates: PermissionTemplate[]
}

function PageCheckboxes({
  selected,
  onToggle,
  idPrefix,
}: {
  selected: CampPage[]
  onToggle: (page: CampPage) => void
  idPrefix: string
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {CAMP_PAGES.map((page) => {
        const id = `${idPrefix}-${page}`
        return (
          <label key={page} htmlFor={id} className="flex items-center gap-2 text-sm capitalize cursor-pointer">
            <input
              id={id}
              type="checkbox"
              className="w-4 h-4"
              checked={selected.includes(page)}
              onChange={() => onToggle(page)}
            />
            {page}
          </label>
        )
      })}
    </div>
  )
}

export function PermissionTemplatesClient({ orgId, templates: initial }: PermissionTemplatesClientProps) {
  const [templates, setTemplates] = useState<PermissionTemplate[]>(initial)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newPages, setNewPages] = useState<CampPage[]>([])
  const [editName, setEditName] = useState('')
  const [editPages, setEditPages] = useState<CampPage[]>([])

  function toggle(list: CampPage[], page: CampPage): CampPage[] {
    return list.includes(page) ? list.filter((p) => p !== page) : [...list, page]
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const t = await createPermissionTemplate(orgId, { name: newName.trim(), pages: newPages })
      setTemplates((prev) => [...prev, t])
      setCreating(false)
      setNewName('')
      setNewPages([])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit(id: string) {
    setSaving(true)
    setError(null)
    try {
      await updatePermissionTemplate(orgId, id, { name: editName.trim(), pages: editPages })
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, name: editName.trim(), pages: editPages } : t))
      )
      setEditingId(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return
    setSaving(true)
    setError(null)
    try {
      await deletePermissionTemplate(orgId, id)
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Permission Templates</h1>
        {!creating && <Button onClick={() => { setCreating(true); setError(null) }}>New template</Button>}
      </div>

      <p className="text-sm text-muted-foreground">
        Reusable access bundles you can apply to staff and volunteers on any event. Built-in templates
        can be applied but not edited.
      </p>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New permission template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="newTemplateName">Template name</Label>
              <Input
                id="newTemplateName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Kitchen Lead"
              />
            </div>
            <div className="space-y-2">
              <Label>Pages this template grants</Label>
              <PageCheckboxes
                selected={newPages}
                onToggle={(p) => setNewPages((prev) => toggle(prev, p))}
                idPrefix="new"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving || !newName.trim()}>
                {saving ? 'Saving…' : 'Save template'}
              </Button>
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {templates.map((t) =>
          editingId === t.id ? (
            <Card key={t.id}>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1">
                  <Label>Template name</Label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Pages</Label>
                  <PageCheckboxes
                    selected={editPages}
                    onToggle={(p) => setEditPages((prev) => toggle(prev, p))}
                    idPrefix={`edit-${t.id}`}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleSaveEdit(t.id)} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card key={t.id}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{t.name}</p>
                      {t.is_built_in && <Badge variant="secondary">Built-in</Badge>}
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {t.pages.map((p) => (
                        <Badge key={p} variant="outline" className="capitalize text-xs">{p}</Badge>
                      ))}
                    </div>
                  </div>
                  {!t.is_built_in && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(t.id)
                          setEditName(t.name)
                          setEditPages([...t.pages])
                        }}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(t.id)} disabled={saving}>
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  )
}
