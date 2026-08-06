'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createIssue, resolveIssue } from '@/actions/event-ops'
import type { OpsIssue, IssueSeverity } from '@/lib/types'

const TYPES = ['equipment', 'supply', 'venue', 'staff', 'other']
const SEVERITIES: IssueSeverity[] = ['low', 'medium', 'high']

// Option labels are capitalized so plain lowercase text ('high', 'equipment')
// stays unique to the issue rows themselves.
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

interface IssuesCardProps {
  orgId: string
  eventId: string
  issues: OpsIssue[]
}

export function IssuesCard({ orgId, eventId, issues: initial }: IssuesCardProps) {
  const [issues, setIssues] = useState(initial)
  const [type, setType] = useState('equipment')
  const [severity, setSeverity] = useState<IssueSeverity>('low')
  const [note, setNote] = useState('')
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolution, setResolution] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!note.trim()) return
    setSaving(true); setError(null)
    try {
      const created = await createIssue(orgId, eventId, { type, severity, note: note.trim() })
      setIssues((prev) => [created, ...prev])
      setNote('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to log issue')
    } finally {
      setSaving(false)
    }
  }

  async function handleResolve(id: string) {
    setSaving(true); setError(null)
    try {
      await resolveIssue(orgId, eventId, id, resolution.trim() || undefined)
      setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'resolved', resolution: resolution.trim() || undefined } : i)))
      setResolvingId(null); setResolution('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resolve')
    } finally {
      setSaving(false)
    }
  }

  const sevVariant = (s: IssueSeverity) => (s === 'high' ? 'destructive' : 'secondary')

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Issues</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {issues.map((i) => (
          <div key={i.id} className="rounded-md border px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={sevVariant(i.severity)}>{i.severity}</Badge>
              <span className="text-xs text-gray-500">{i.type}</span>
              {i.status === 'resolved' && <Badge variant="secondary">resolved</Badge>}
              {i.status === 'open' && resolvingId !== i.id && (
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setResolvingId(i.id)}>Resolve</Button>
              )}
            </div>
            <p className={`mt-1 ${i.status === 'resolved' ? 'text-gray-400' : ''}`}>{i.note}</p>
            {i.resolution && <p className="text-xs text-gray-500">↳ {i.resolution}</p>}
            {resolvingId === i.id && (
              <div className="mt-2 flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor={`res-${i.id}`}>Resolution</Label>
                  <Input id={`res-${i.id}`} value={resolution} onChange={(e) => setResolution(e.target.value)} />
                </div>
                <Button size="sm" disabled={saving} onClick={() => handleResolve(i.id)}>Mark resolved</Button>
              </div>
            )}
          </div>
        ))}
        {issues.length === 0 && <p className="text-sm text-gray-500">No issues logged.</p>}

        <div className="flex items-end gap-2 border-t pt-3 flex-wrap">
          <div>
            <Label htmlFor="iss-type">Type</Label>
            <select id="iss-type" value={type} onChange={(e) => setType(e.target.value)}
              className="block h-9 rounded-md border border-gray-300 px-2 text-sm">
              {TYPES.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="iss-sev">Severity</Label>
            <select id="iss-sev" value={severity} onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
              className="block h-9 rounded-md border border-gray-300 px-2 text-sm">
              {SEVERITIES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <Label htmlFor="iss-note">Note</Label>
            <Input id="iss-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button onClick={handleCreate} disabled={saving || !note.trim()}>Log issue</Button>
        </div>
      </CardContent>
    </Card>
  )
}
