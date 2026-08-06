'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createChecklistTemplate, deleteChecklistTemplate } from '@/actions/work-packages'
import { CHECKLIST_PHASES as PHASES } from '@/lib/ops/derive'
import type { ChecklistTemplate, ChecklistPhase, ChecklistTemplateStep, EvidenceType } from '@/lib/types'

interface ChecklistTemplatesTabProps {
  orgId: string
  isAdmin: boolean
  templates: ChecklistTemplate[]
  ownTemplateIds: string[]
}

const EVIDENCE: EvidenceType[] = ['none', 'photo', 'number']

export function ChecklistTemplatesTab({ orgId, isAdmin, templates: initial, ownTemplateIds: initialOwn }: ChecklistTemplatesTabProps) {
  const [templates, setTemplates] = useState(initial)
  const [ownIds, setOwnIds] = useState(new Set(initialOwn))
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<ChecklistPhase>('prep')
  const [steps, setSteps] = useState<ChecklistTemplateStep[]>([{ text: '', evidence: 'none' }])

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      const created = await createChecklistTemplate(orgId, {
        name: name.trim(), phase,
        steps: steps.filter((s) => s.text.trim()).map((s) => ({ text: s.text.trim(), evidence: s.evidence })),
      })
      setTemplates((prev) => [...prev, created])
      setOwnIds((prev) => new Set([...prev, created.id]))
      setCreating(false); setName(''); setPhase('prep'); setSteps([{ text: '', evidence: 'none' }])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(t: ChecklistTemplate) {
    if (!confirm(`Delete "${t.name}"? Packages that attach it will simply stop including it on new events.`)) return
    setSaving(true); setError(null)
    try {
      await deleteChecklistTemplate(orgId, t.id)
      setTemplates((prev) => prev.filter((x) => x.id !== t.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {PHASES.map((ph) => {
        const inPhase = templates.filter((t) => t.phase === ph)
        if (inPhase.length === 0) return null
        return (
          <div key={ph}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{ph}</h3>
            {inPhase.map((t) => (
              <Card key={t.id} className="mb-2">
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <CardTitle className="text-sm">{t.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{ownIds.has(t.id) ? 'Custom' : 'Built-in'}</Badge>
                    {isAdmin && ownIds.has(t.id) && (
                      <Button variant="ghost" size="sm" aria-label={`Delete ${t.name}`} disabled={saving} onClick={() => handleDelete(t)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="py-0 pb-3">
                  <ol className="text-sm text-gray-700 list-decimal pl-5">
                    {t.steps.map((s, i) => (
                      <li key={i}>{s.text}{s.evidence !== 'none' && <span className="text-xs text-gray-400"> — {s.evidence} evidence</span>}</li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      })}
      {templates.length === 0 && !creating && (
        <p className="py-6 text-center text-gray-500">No checklists yet.</p>
      )}

      {isAdmin && !creating && <Button onClick={() => setCreating(true)}>New checklist</Button>}

      {isAdmin && creating && (
        <Card>
          <CardHeader><CardTitle className="text-base">New checklist</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3">
              <div>
                <Label htmlFor="ct-name">Name</Label>
                <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ct-phase">Phase</Label>
                <select id="ct-phase" value={phase} onChange={(e) => setPhase(e.target.value as ChecklistPhase)}
                  className="block h-9 rounded-md border border-gray-300 px-2 text-sm">
                  {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  aria-label={`Step ${i + 1} text`} className="flex-1"
                  value={s.text}
                  onChange={(e) => setSteps((prev) => prev.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)))}
                />
                <select
                  aria-label={`Step ${i + 1} evidence`} value={s.evidence}
                  onChange={(e) => setSteps((prev) => prev.map((x, idx) => (idx === i ? { ...x, evidence: e.target.value as EvidenceType } : x)))}
                  className="h-9 rounded-md border border-gray-300 px-2 text-sm"
                >
                  {EVIDENCE.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                </select>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSteps((prev) => [...prev, { text: '', evidence: 'none' }])}>
                Add step
              </Button>
              <Button onClick={handleSave} disabled={saving || !name.trim() || !steps.some((s) => s.text.trim())}>Save checklist</Button>
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
