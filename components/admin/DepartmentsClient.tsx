'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createDepartment, updateDepartment, deleteDepartment } from '@/actions/departments'
import type { Department } from '@/lib/types'

interface DepartmentsClientProps {
  orgId: string
  departments: Department[]
}

export function DepartmentsClient({ orgId, departments: initial }: DepartmentsClientProps) {
  const [departments, setDepartments] = useState<Department[]>(initial)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError(null)
    try {
      const d = await createDepartment(orgId, { name: name.trim(), description: description.trim() || undefined })
      setDepartments((prev) => [...prev, d])
      setCreating(false); setName(''); setDescription('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally { setSaving(false) }
  }

  async function handleRename(dept: Department, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === dept.name) return
    setError(null)
    const prev = departments
    setDepartments((p) => p.map((d) => (d.id === dept.id ? { ...d, name: trimmed } : d)))
    try {
      await updateDepartment(orgId, dept.id, { name: trimmed })
    } catch (err: unknown) {
      setDepartments(prev)
      setError(err instanceof Error ? err.message : 'Failed to rename')
    }
  }

  async function handleDelete(dept: Department) {
    if (!confirm(`Delete "${dept.name}"? Events in it become unassigned (they are not deleted).`)) return
    setSaving(true); setError(null)
    const prev = departments
    setDepartments((p) => p.filter((d) => d.id !== dept.id))
    try {
      await deleteDepartment(orgId, dept.id)
    } catch (err: unknown) {
      setDepartments(prev)
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Departments</h1>
        {!creating && <Button onClick={() => { setCreating(true); setError(null) }}>New department</Button>}
      </div>
      <p className="text-sm text-muted-foreground">
        Departments are an optional way to group your events (e.g. by ministry or program). Assign an event to a
        department in its settings. Grouping shows up on your events list and the org-level report.
      </p>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {creating && (
        <Card>
          <CardHeader><CardTitle className="text-base">New department</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="deptName">Name</Label>
              <Input id="deptName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. High School" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="deptDesc">Description (optional)</Label>
              <Input id="deptDesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {departments.length === 0 && !creating && (
          <p className="text-sm text-muted-foreground">No departments yet.</p>
        )}
        {departments.map((d) => (
          <Card key={d.id}>
            <CardContent className="py-3 flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1">
                <Input
                  defaultValue={d.name}
                  className="h-8 font-medium"
                  onBlur={(e) => handleRename(d, e.target.value)}
                  aria-label={`Department name for ${d.name}`}
                />
                {d.description && <p className="text-xs text-muted-foreground">{d.description}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={() => handleDelete(d)} disabled={saving}>Delete</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
