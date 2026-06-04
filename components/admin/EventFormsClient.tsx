'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { assignFormToEvent, removeFormAssignment } from '@/actions/forms'
import type { FormTemplate, EventFormAssignment } from '@/lib/types'

interface EventFormsClientProps {
  orgId: string
  campId: string
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
  campId,
  templates,
  assignments: initialAssignments,
  signedCounts,
  activeRegistrantCount,
}: EventFormsClientProps) {
  const [assignments, setAssignments] = useState<EventFormAssignment[]>(initialAssignments)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assignedTemplateIds = new Set(assignments.map((a) => a.template_id))
  const unassigned = templates.filter((t) => !assignedTemplateIds.has(t.id))

  async function handleAssign(template: FormTemplate) {
    setSaving(true)
    setError(null)
    try {
      const assignment = await assignFormToEvent(orgId, campId, template)
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
      await removeFormAssignment(orgId, campId, assignmentId)
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Forms</h1>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Assigned forms */}
      <section>
        <h2 className="text-base font-semibold mb-3">Assigned to this event</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No forms assigned yet. Add one from the list below.
          </p>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => {
              const signedCount = signedCounts[a.id] ?? 0
              return (
                <Card key={a.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">{a.template_name}</p>
                        <div className="flex gap-2 items-center">
                          <Badge variant="secondary">
                            {AUDIENCE_LABELS[a.audience] ?? a.audience}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {signedCount} / {activeRegistrantCount} signed
                          </span>
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
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* Available templates */}
      {unassigned.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">Available templates</h2>
          <div className="space-y-2">
            {unassigned.map((t) => (
              <Card key={t.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{t.name}</p>
                      <div className="flex gap-2">
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
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No form templates found for your org.{' '}
          <a href="../forms" className="text-primary underline">
            Create templates
          </a>{' '}
          at the org level first.
        </p>
      )}
    </div>
  )
}
