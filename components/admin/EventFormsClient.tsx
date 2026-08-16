'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import { assignFormToEvent, removeFormAssignment } from '@/actions/forms'
import type { FormTemplate, EventFormAssignment } from '@/lib/types'

interface EventFormsClientProps {
  orgId: string
  eventId: string
  templates: FormTemplate[]
  assignments: EventFormAssignment[]
  signedCounts: Record<string, number>
  activeRegistrantCount: number
}

const AUDIENCE_LABELS: Record<string, string> = {
  registrant: 'Registrant / Parent',
  volunteer: 'Volunteer',
  staff: 'Staff',
}

export function EventFormsClient({
  orgId,
  eventId,
  templates,
  assignments: initialAssignments,
  signedCounts,
  activeRegistrantCount,
}: EventFormsClientProps) {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [assignments, setAssignments] = useState<EventFormAssignment[]>(initialAssignments)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assignedTemplateIds = new Set(assignments.map((a) => a.template_id))
  const unassigned = templates.filter((t) => !assignedTemplateIds.has(t.id))

  async function handleAssign(template: FormTemplate) {
    setSaving(true)
    setError(null)
    try {
      const assignment = await assignFormToEvent(orgId, eventId, template)
      setAssignments((prev) => [...prev, assignment])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(assignmentId: string) {
    setSaving(true)
    setError(null)
    try {
      await removeFormAssignment(orgId, eventId, assignmentId)
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-5 space-y-6">
      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Assigned forms */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Assigned to this event</h2>
        <div className="rounded-xl border border-border bg-card">
          {assignments.length === 0 ? (
            <EmptyState
              title="No forms assigned yet."
              description="Add one from the list below."
            />
          ) : (
            assignments.map((a) => {
              const signedCount = signedCounts[a.id] ?? 0
              const complete = activeRegistrantCount > 0 && signedCount >= activeRegistrantCount
              const pct =
                activeRegistrantCount > 0
                  ? Math.min(100, (signedCount / activeRegistrantCount) * 100)
                  : 0
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 first:border-t-0"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-medium">{a.template_name}</p>
                    <Badge variant="secondary">
                      {AUDIENCE_LABELS[a.audience] ?? a.audience}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    {complete && <StatusPill tone="confirmed">Complete</StatusPill>}
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {signedCount}/{activeRegistrantCount} signed
                      </span>
                      <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRemove(a.id)}
                      disabled={saving}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      {/* Available templates */}
      {unassigned.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Available templates</h2>
          <div className="rounded-xl border border-border bg-card">
            {unassigned.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 first:border-t-0"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{t.fields.length} field{t.fields.length !== 1 ? 's' : ''}</Badge>
                    <Badge variant="secondary">
                      {AUDIENCE_LABELS[t.audience] ?? t.audience}
                    </Badge>
                  </div>
                </div>
                <Button size="sm" onClick={() => handleAssign(t)} disabled={saving}>
                  Assign
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {templates.length === 0 && (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            title="No form templates found for your org."
            description="Create templates at the org level first."
            action={
              <Button variant="outline" size="sm" render={<Link href={`/${orgSlug}/forms`} />}>
                Create templates
              </Button>
            }
          />
        </div>
      )}
    </div>
  )
}
