'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { completeChecklistStep } from '@/actions/event-ops'
import { uploadEvidencePhoto } from '@/actions/ops-evidence'
import { CHECKLIST_PHASES as PHASE_ORDER } from '@/lib/ops/derive'
import type { OpsPlan } from '@/lib/types'

interface ChecklistsCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  onPlanChange: (next: OpsPlan) => void
}

export function ChecklistsCard({ orgId, eventId, plan, onPlanChange }: ChecklistsCardProps) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)          // `${checklistId}:${stepIndex}`
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({})

  const ordered = plan.checklists.slice().sort(
    (a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase)
  )

  function patch(checklistId: string, stepIndex: number, done: boolean, evidence_value?: string) {
    onPlanChange({
      ...plan,
      checklists: plan.checklists.map((c) =>
        c.id !== checklistId ? c : {
          ...c,
          steps: c.steps.map((s, i) => (i === stepIndex ? { ...s, done, ...(evidence_value !== undefined ? { evidence_value } : {}) } : s)),
        }
      ),
    })
  }

  async function complete(checklistId: string, stepIndex: number, input: { done: boolean; evidence_value?: string }) {
    const key = `${checklistId}:${stepIndex}`
    setBusy(key); setError(null)
    try {
      await completeChecklistStep(orgId, eventId, checklistId, stepIndex, input)
      patch(checklistId, stepIndex, input.done, input.evidence_value)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBusy(null)
    }
  }

  async function handlePhoto(checklistId: string, stepIndex: number, file: File | undefined) {
    if (!file) return
    const key = `${checklistId}:${stepIndex}`
    setBusy(key); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { url } = await uploadEvidencePhoto(orgId, eventId, fd)
      await completeChecklistStep(orgId, eventId, checklistId, stepIndex, { done: true, evidence_value: url })
      patch(checklistId, stepIndex, true, url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Checklists</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {ordered.map((c) => (
          <div key={c.id}>
            <h3 className="text-sm font-semibold">{c.name} <span className="text-xs font-normal text-gray-400">({c.phase})</span></h3>
            <div className="mt-1 space-y-2">
              {c.steps.map((s, i) => {
                const key = `${c.id}:${i}`
                return (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    {s.evidence === 'none' ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" aria-label={s.text} checked={s.done} disabled={busy === key}
                          onChange={(e) => complete(c.id, i, { done: e.target.checked })} />
                        <span className={s.done ? 'line-through text-gray-400' : ''}>{s.text}</span>
                      </label>
                    ) : (
                      <span className={`text-sm ${s.done ? 'line-through text-gray-400' : ''}`}>{s.text}</span>
                    )}
                    {s.evidence === 'number' && !s.done && (
                      <>
                        <Input
                          aria-label={`Value for ${s.text}`}
                          type="number" className="w-24 h-8"
                          value={numberDrafts[key] ?? ''}
                          onChange={(e) => setNumberDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                        <Button size="sm" variant="outline"
                          aria-label={`Done: ${s.text}`}
                          disabled={busy === key || !(numberDrafts[key] ?? '').trim()}
                          onClick={() => complete(c.id, i, { done: true, evidence_value: numberDrafts[key].trim() })}>
                          Done
                        </Button>
                      </>
                    )}
                    {s.evidence === 'photo' && !s.done && (
                      <label className="text-sm text-gray-600 cursor-pointer underline">
                        {busy === key ? 'Uploading…' : 'Take / choose photo'}
                        <input
                          type="file" accept="image/*" capture="environment" className="sr-only"
                          aria-label={`Photo for ${s.text}`}
                          onChange={(e) => handlePhoto(c.id, i, e.target.files?.[0])}
                        />
                      </label>
                    )}
                    {s.done && s.evidence !== 'none' && (
                      <span className="text-xs text-gray-500">
                        {s.evidence === 'photo' && s.evidence_value
                          ? <a href={s.evidence_value} target="_blank" rel="noreferrer" className="underline">view photo</a>
                          : s.evidence_value}
                        <button className="ml-2 underline" onClick={() => complete(c.id, i, { done: false })}>undo</button>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {ordered.length === 0 && <p className="text-sm text-gray-500">No checklists on this plan.</p>}
      </CardContent>
    </Card>
  )
}
