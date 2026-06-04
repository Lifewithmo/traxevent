'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  createSlot,
  updateSlot,
  deleteSlot,
  assignFamily,
  autoAssign,
} from '@/actions/assignments'
import type { AssignmentSlot, Family } from '@/lib/types'
import type { Terminology } from '@/lib/event-types'

interface AssignmentsClientProps {
  orgId: string
  campId: string
  campSlug: string
  orgSlug: string
  slots: AssignmentSlot[]
  families: Family[]
  terminology: Terminology
}

export function AssignmentsClient({
  orgId,
  campId,
  campSlug,
  orgSlug,
  slots: initialSlots,
  families: initialFamilies,
  terminology,
}: AssignmentsClientProps) {
  const router = useRouter()
  const [tab, setTab] = useState<'slots' | 'assignments'>('slots')
  const [slots, setSlots] = useState<AssignmentSlot[]>(initialSlots)
  const [families, setFamilies] = useState<Family[]>(initialFamilies)

  // Slot form state
  const [newSlotName, setNewSlotName] = useState('')
  const [newSlotCapacity, setNewSlotCapacity] = useState<string>('')
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [editSlotName, setEditSlotName] = useState('')
  const [editSlotCapacity, setEditSlotCapacity] = useState<string>('')
  const [slotError, setSlotError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Auto-assign state
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [autoAssignResult, setAutoAssignResult] = useState<string | null>(null)

  // Compute occupancy from current families state
  const occupancy = new Map<string, number>()
  families.forEach((f) => {
    if (f.assignment_slot_id) {
      occupancy.set(f.assignment_slot_id, (occupancy.get(f.assignment_slot_id) ?? 0) + 1)
    }
  })

  const activeFamilies = families.filter(
    (f) => f.registration_status === 'confirmed' || f.registration_status === 'pending'
  )

  const slotLabel = terminology.assignmentSingular
  const slotsLabel = terminology.assignmentPlural

  async function handleCreateSlot() {
    if (!newSlotName.trim()) return
    setSaving(true)
    setSlotError(null)
    try {
      const slot = await createSlot(orgId, campId, {
        name: newSlotName.trim(),
        ...(newSlotCapacity ? { capacity: Number(newSlotCapacity) } : {}),
        sort_order: slots.length,
      })
      setSlots((prev) => [...prev, slot])
      setNewSlotName('')
      setNewSlotCapacity('')
    } catch (err: unknown) {
      setSlotError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateSlot(slotId: string) {
    setSaving(true)
    setSlotError(null)
    try {
      await updateSlot(orgId, campId, slotId, {
        name: editSlotName.trim(),
        ...(editSlotCapacity ? { capacity: Number(editSlotCapacity) } : { capacity: undefined }),
      })
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slotId
            ? {
                ...s,
                name: editSlotName.trim(),
                capacity: editSlotCapacity ? Number(editSlotCapacity) : undefined,
              }
            : s
        )
      )
      setEditingSlotId(null)
    } catch (err: unknown) {
      setSlotError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSlot(slotId: string) {
    setSaving(true)
    setSlotError(null)
    try {
      await deleteSlot(orgId, campId, slotId)
      setSlots((prev) => prev.filter((s) => s.id !== slotId))
      setFamilies((prev) =>
        prev.map((f) =>
          f.assignment_slot_id === slotId ? { ...f, assignment_slot_id: undefined } : f
        )
      )
    } catch (err: unknown) {
      setSlotError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  async function handleAssign(familyId: string, slotId: string | null) {
    await assignFamily(orgId, campId, familyId, slotId)
    setFamilies((prev) =>
      prev.map((f) =>
        f.id === familyId ? { ...f, assignment_slot_id: slotId ?? undefined } : f
      )
    )
  }

  async function handleAutoAssign() {
    setAutoAssigning(true)
    setAutoAssignResult(null)
    try {
      const result = await autoAssign(orgId, campId)
      setAutoAssignResult(
        `Auto-assigned ${result.assigned} registrant${result.assigned !== 1 ? 's' : ''}.`
      )
      router.refresh()
    } finally {
      setAutoAssigning(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{slotsLabel}</h1>
        <a
          href={`/${orgSlug}/${campSlug}/assignments/print`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground underline"
        >
          Print roster
        </a>
      </div>

      {/* Tab bar */}
      <div role="tablist" aria-label="Assignment views" className="flex gap-1 border-b">
        {(['slots', 'assignments'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            id={`tab-${t}`}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'slots' ? slotsLabel : 'Assignments'}
          </button>
        ))}
      </div>

      {/* Slots tab */}
      {tab === 'slots' && (
        <div role="tabpanel" id="panel-slots" aria-labelledby="tab-slots" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add {slotLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 items-end">
                <div className="space-y-1 flex-1">
                  <Label htmlFor="newSlotName">{slotLabel} name</Label>
                  <Input
                    id="newSlotName"
                    value={newSlotName}
                    onChange={(e) => setNewSlotName(e.target.value)}
                    placeholder={`e.g. ${slotLabel} 1`}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSlot() }}
                  />
                </div>
                <div className="space-y-1 w-28">
                  <Label htmlFor="newSlotCapacity">Capacity</Label>
                  <Input
                    id="newSlotCapacity"
                    type="number"
                    min={1}
                    value={newSlotCapacity}
                    onChange={(e) => setNewSlotCapacity(e.target.value)}
                    placeholder="No limit"
                  />
                </div>
                <Button onClick={handleCreateSlot} disabled={saving || !newSlotName.trim()}>
                  Add
                </Button>
              </div>
              <div aria-live="polite" aria-atomic="true">
                {slotError && <p className="text-sm text-destructive mt-2">{slotError}</p>}
              </div>
            </CardContent>
          </Card>

          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No {slotsLabel.toLowerCase()} defined yet. Add one above.
            </p>
          ) : (
            <div className="space-y-2">
              {slots.map((slot) => {
                const count = occupancy.get(slot.id) ?? 0
                const isEditing = editingSlotId === slot.id
                return (
                  <Card key={slot.id}>
                    <CardContent className="py-3">
                      {isEditing ? (
                        <div className="flex gap-2 items-end">
                          <div className="flex-1 space-y-1">
                            <Label>Name</Label>
                            <Input
                              value={editSlotName}
                              onChange={(e) => setEditSlotName(e.target.value)}
                            />
                          </div>
                          <div className="w-28 space-y-1">
                            <Label>Capacity</Label>
                            <Input
                              type="number"
                              min={1}
                              value={editSlotCapacity}
                              onChange={(e) => setEditSlotCapacity(e.target.value)}
                              placeholder="No limit"
                            />
                          </div>
                          <Button size="sm" onClick={() => handleUpdateSlot(slot.id)} disabled={saving}>
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingSlotId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{slot.name}</span>
                            <Badge variant="outline">
                              {count}
                              {slot.capacity != null ? `/${slot.capacity}` : ''} assigned
                            </Badge>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingSlotId(slot.id)
                                setEditSlotName(slot.name)
                                setEditSlotCapacity(
                                  slot.capacity != null ? String(slot.capacity) : ''
                                )
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteSlot(slot.id)}
                              disabled={saving}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Assignments tab */}
      {tab === 'assignments' && (
        <div role="tabpanel" id="panel-assignments" aria-labelledby="tab-assignments" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {activeFamilies.filter((f) => f.assignment_slot_id).length} of{' '}
              {activeFamilies.length} assigned
            </p>
            <div className="flex items-center gap-3">
              <div aria-live="polite" aria-atomic="true">
                {autoAssignResult && (
                  <span className="text-sm text-accent">{autoAssignResult}</span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoAssign}
                disabled={autoAssigning || slots.length === 0}
              >
                {autoAssigning ? 'Assigning…' : 'Auto-assign'}
              </Button>
            </div>
          </div>

          {activeFamilies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active registrations to assign.</p>
          ) : (
            <div className="bg-card rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Registrant
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      {slotLabel}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeFamilies.map((family) => (
                    <tr key={family.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">
                        {family.first_name} {family.last_name}
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            family.registration_status === 'confirmed' ? 'default' : 'secondary'
                          }
                        >
                          {family.registration_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          value={family.assignment_slot_id ?? ''}
                          onChange={(e) =>
                            handleAssign(family.id, e.target.value || null)
                          }
                        >
                          <option value="">&mdash; Unassigned &mdash;</option>
                          {slots.map((slot) => (
                            <option key={slot.id} value={slot.id}>
                              {slot.name}
                              {slot.capacity != null
                                ? ` (${occupancy.get(slot.id) ?? 0}/${slot.capacity})`
                                : ` (${occupancy.get(slot.id) ?? 0})`}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
