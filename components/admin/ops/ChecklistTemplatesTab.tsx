'use client'

import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { createChecklistTemplate, deleteChecklistTemplate } from '@/actions/work-packages'
import { CHECKLIST_PHASES as PHASES } from '@/lib/ops/derive'
import type { ChecklistTemplate, ChecklistPhase, ChecklistTemplateStep, EvidenceType } from '@/lib/types'

interface ChecklistTemplatesTabProps {
  orgId: string
  isAdmin: boolean
  templates: ChecklistTemplate[]
  setTemplates: React.Dispatch<React.SetStateAction<ChecklistTemplate[]>>
  ownTemplateIds: string[]
}

const EVIDENCE: EvidenceType[] = ['none', 'photo', 'number']

const SELECT_CLASS =
  'block h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground'

export function ChecklistTemplatesTab({ orgId, isAdmin, templates, setTemplates, ownTemplateIds: initialOwn }: ChecklistTemplatesTabProps) {
  const [ownIds, setOwnIds] = useState(new Set(initialOwn))
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<ChecklistPhase>('prep')
  const [steps, setSteps] = useState<ChecklistTemplateStep[]>([{ text: '', evidence: 'none' }])
  const [pendingDelete, setPendingDelete] = useState<ChecklistTemplate | null>(null)

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

  const isEmpty = templates.length === 0 && !creating

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {PHASES.map((ph) => {
        const inPhase = templates.filter((t) => t.phase === ph)
        if (inPhase.length === 0) return null
        return (
          <div key={ph}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{ph}</h3>
            {inPhase.map((t) => (
              <Card key={t.id} className="mb-2">
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 py-3">
                  <CardTitle className="text-sm text-foreground">{t.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={ownIds.has(t.id) ? 'confirmed' : 'neutral'}>
                      {ownIds.has(t.id) ? 'Custom' : 'Built-in'}
                    </StatusPill>
                    {isAdmin && ownIds.has(t.id) && (
                      <Menu>
                        <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.name}`} disabled={saving} />}>
                          <MoreHorizontal />
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem onClick={() => setPendingDelete(t)}>Delete</MenuItem>
                        </MenuContent>
                      </Menu>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="py-0 pb-3">
                  <ol className="list-decimal pl-5 text-sm text-muted-foreground">
                    {t.steps.map((s, i) => (
                      <li key={i}>
                        <span className="align-middle text-foreground">{s.text}</span>
                        {s.evidence !== 'none' && (
                          <StatusPill tone="neutral" className="ml-2 align-middle">{s.evidence}</StatusPill>
                        )}
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      })}

      {isEmpty && (
        <EmptyState
          title="No checklists yet"
          description="Checklists give the crew a phase-by-phase run of the job — prep through closeout."
          action={isAdmin ? <Button onClick={() => setCreating(true)}>New checklist</Button> : undefined}
        />
      )}

      {isAdmin && !creating && !isEmpty && <Button onClick={() => setCreating(true)}>New checklist</Button>}

      {isAdmin && creating && (
        <Card>
          <CardHeader><CardTitle className="text-base">New checklist</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <div>
                <Label htmlFor="ct-name">Name</Label>
                <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ct-phase">Phase</Label>
                <select id="ct-phase" value={phase} onChange={(e) => setPhase(e.target.value as ChecklistPhase)}
                  className={SELECT_CLASS}>
                  {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {steps.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={`Step ${i + 1} text`} className="min-w-40 flex-1"
                  value={s.text}
                  onChange={(e) => setSteps((prev) => prev.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)))}
                />
                <select
                  aria-label={`Step ${i + 1} evidence`} value={s.evidence}
                  onChange={(e) => setSteps((prev) => prev.map((x, idx) => (idx === i ? { ...x, evidence: e.target.value as EvidenceType } : x)))}
                  className={SELECT_CLASS}
                >
                  {EVIDENCE.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                </select>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setSteps((prev) => [...prev, { text: '', evidence: 'none' }])}>
                Add step
              </Button>
              <Button onClick={handleSave} disabled={saving || !name.trim() || !steps.some((s) => s.text.trim())}>Save checklist</Button>
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : 'Delete checklist?'}
        description="Packages that attach it will simply stop including it on new events."
        confirmLabel="Delete"
        destructive
        pending={saving}
        onConfirm={async () => { if (pendingDelete) await handleDelete(pendingDelete) }}
      />
    </div>
  )
}
