# Phase 2a: Assignments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow org admins to define assignment slots (cabins, rooms, tables, classes — terminology driven by event type), assign registrants to slots, auto-balance unassigned families, and print a roster per slot.

**Architecture:** A single unified `AssignmentSlot` model stored at `orgs/{orgId}/camps/{campId}/assignment_slots/{slotId}` covers all event types — a cabin in summer-camp, a room in a retreat, a table in a gala, a class in VBS. Assignment is a simple FK: `Family.assignment_slot_id` points to a slot. The admin page shows a two-tab view: Slots (manage slot definitions) and Assignments (see all registrants with dropdown pickers). Auto-assign distributes unassigned active registrations round-robin across slots. Print export is a server-rendered `?print=1` route using browser `@media print` CSS.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, Firebase Admin SDK (Firestore), shadcn/ui, Tailwind CSS

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/types.ts` | Modify | Add `AssignmentSlot` interface; add `assignment_slot_id?` to `Family` |
| `actions/assignments.ts` | Create | `listSlots`, `createSlot`, `updateSlot`, `deleteSlot`, `assignFamily`, `autoAssign` |
| `app/(admin)/[orgSlug]/[campSlug]/assignments/page.tsx` | Create | Server component — resolves IDs, fetches slots + families, renders client |
| `app/(admin)/[orgSlug]/[campSlug]/assignments/print/page.tsx` | Create | Server component — print-friendly roster per slot |
| `components/admin/AssignmentsClient.tsx` | Create | Client component — slot management + assignment dropdowns + auto-assign |
| `__tests__/actions/assignments.test.ts` | Create | Unit tests for all server actions |

---

## Task 1: AssignmentSlot type + server actions

**Files:**
- Modify: `lib/types.ts`
- Create: `actions/assignments.ts`
- Create: `__tests__/actions/assignments.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/actions/assignments.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const slotDocSpy = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}))
const familyUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getSlotsSnapSpy = vi.hoisted(() => vi.fn())
const getFamiliesSnapSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((col: string) => {
      if (col === 'orgs') {
        return {
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockImplementation((sub: string) => {
              if (sub === 'camps') {
                return {
                  doc: vi.fn().mockReturnValue({
                    collection: vi.fn().mockImplementation((sub2: string) => {
                      if (sub2 === 'assignment_slots') {
                        return {
                          doc: vi.fn().mockReturnValue(slotDocSpy),
                          orderBy: vi.fn().mockReturnValue({ get: getSlotsSnapSpy }),
                          get: getSlotsSnapSpy,
                        }
                      }
                      if (sub2 === 'families') {
                        return {
                          doc: vi.fn().mockReturnValue({ update: familyUpdateSpy }),
                          get: getFamiliesSnapSpy,
                        }
                      }
                      return {}
                    }),
                  }),
                }
              }
              return {}
            }),
          }),
        }
      }
      return {}
    }),
  },
}))

import {
  listSlots,
  createSlot,
  updateSlot,
  deleteSlot,
  assignFamily,
  autoAssign,
} from '@/actions/assignments'

describe('createSlot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a slot document with correct fields', async () => {
    const slot = await createSlot('org-1', 'camp-1', { name: 'Cabin 4', capacity: 8 })
    expect(slotDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cabin 4',
        capacity: 8,
        created_at: expect.any(String),
      })
    )
    expect(slot.name).toBe('Cabin 4')
    expect(slot.capacity).toBe(8)
  })

  it('creates slot without capacity when omitted', async () => {
    await createSlot('org-1', 'camp-1', { name: 'Table 1' })
    expect(slotDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Table 1' })
    )
  })
})

describe('updateSlot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates slot fields and sets updated_at', async () => {
    await updateSlot('org-1', 'camp-1', 'slot-1', { name: 'Cabin 4A', capacity: 10 })
    expect(slotDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cabin 4A',
        capacity: 10,
        updated_at: expect.any(String),
      })
    )
  })
})

describe('deleteSlot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the slot document', async () => {
    await deleteSlot('org-1', 'camp-1', 'slot-1')
    expect(slotDocSpy.delete).toHaveBeenCalled()
  })
})

describe('assignFamily', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets assignment_slot_id on the family document', async () => {
    await assignFamily('org-1', 'camp-1', 'fam-1', 'slot-1')
    expect(familyUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        assignment_slot_id: 'slot-1',
        updated_at: expect.any(String),
      })
    )
  })

  it('removes assignment_slot_id when slotId is null (unassign)', async () => {
    await assignFamily('org-1', 'camp-1', 'fam-1', null)
    expect(familyUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ assignment_slot_id: null })
    )
  })
})

describe('autoAssign', () => {
  beforeEach(() => vi.clearAllMocks())

  it('distributes unassigned active families round-robin across slots', async () => {
    // 2 slots, 4 unassigned families
    getSlotsSnapSpy.mockResolvedValue({
      docs: [
        { id: 'slot-a', data: () => ({ id: 'slot-a', name: 'Cabin A', capacity: undefined }) },
        { id: 'slot-b', data: () => ({ id: 'slot-b', name: 'Cabin B', capacity: undefined }) },
      ],
    })
    getFamiliesSnapSpy.mockResolvedValue({
      docs: [
        { id: 'fam-1', data: () => ({ id: 'fam-1', registration_status: 'confirmed', assignment_slot_id: undefined }) },
        { id: 'fam-2', data: () => ({ id: 'fam-2', registration_status: 'pending', assignment_slot_id: undefined }) },
        { id: 'fam-3', data: () => ({ id: 'fam-3', registration_status: 'confirmed', assignment_slot_id: undefined }) },
        { id: 'fam-4', data: () => ({ id: 'fam-4', registration_status: 'confirmed', assignment_slot_id: undefined }) },
        { id: 'fam-5', data: () => ({ id: 'fam-5', registration_status: 'cancelled', assignment_slot_id: undefined }) }, // skip
      ],
    })

    const result = await autoAssign('org-1', 'camp-1')

    expect(result.assigned).toBe(4)
    expect(familyUpdateSpy).toHaveBeenCalledTimes(4)
  })

  it('respects slot capacity — does not overflow', async () => {
    getSlotsSnapSpy.mockResolvedValue({
      docs: [
        { id: 'slot-a', data: () => ({ id: 'slot-a', name: 'Cabin A', capacity: 2 }) },
        { id: 'slot-b', data: () => ({ id: 'slot-b', name: 'Cabin B', capacity: 2 }) },
      ],
    })
    getFamiliesSnapSpy.mockResolvedValue({
      docs: [
        { id: 'fam-1', data: () => ({ id: 'fam-1', registration_status: 'confirmed', assignment_slot_id: undefined }) },
        { id: 'fam-2', data: () => ({ id: 'fam-2', registration_status: 'confirmed', assignment_slot_id: undefined }) },
        { id: 'fam-3', data: () => ({ id: 'fam-3', registration_status: 'confirmed', assignment_slot_id: undefined }) },
        { id: 'fam-4', data: () => ({ id: 'fam-4', registration_status: 'confirmed', assignment_slot_id: undefined }) },
        { id: 'fam-5', data: () => ({ id: 'fam-5', registration_status: 'confirmed', assignment_slot_id: undefined }) }, // over capacity
      ],
    })

    const result = await autoAssign('org-1', 'camp-1')

    // Only 4 assigned (2 per slot × 2 slots), 5th family left unassigned
    expect(result.assigned).toBe(4)
    expect(familyUpdateSpy).toHaveBeenCalledTimes(4)
  })

  it('returns assigned: 0 when no slots exist', async () => {
    getSlotsSnapSpy.mockResolvedValue({ docs: [] })
    getFamiliesSnapSpy.mockResolvedValue({ docs: [] })

    const result = await autoAssign('org-1', 'camp-1')
    expect(result.assigned).toBe(0)
    expect(familyUpdateSpy).not.toHaveBeenCalled()
  })

  it('skips already-assigned families', async () => {
    getSlotsSnapSpy.mockResolvedValue({
      docs: [{ id: 'slot-a', data: () => ({ id: 'slot-a', name: 'A', capacity: undefined }) }],
    })
    getFamiliesSnapSpy.mockResolvedValue({
      docs: [
        { id: 'fam-1', data: () => ({ id: 'fam-1', registration_status: 'confirmed', assignment_slot_id: 'slot-a' }) }, // already assigned
        { id: 'fam-2', data: () => ({ id: 'fam-2', registration_status: 'confirmed', assignment_slot_id: undefined }) }, // needs assignment
      ],
    })

    const result = await autoAssign('org-1', 'camp-1')
    expect(result.assigned).toBe(1)
    expect(familyUpdateSpy).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run __tests__/actions/assignments.test.ts
```

Expected: FAIL — `Cannot find module '@/actions/assignments'`

- [ ] **Step 3: Update `lib/types.ts`**

Add `AssignmentSlot` interface (after `CommunicationLogEntry`):

```typescript
export interface AssignmentSlot {
  id: string
  name: string          // "Cabin 4", "Table 7", "Blue Team", "Butterflies Class"
  capacity?: number     // max occupants; undefined = unlimited
  notes?: string        // admin-visible notes
  sort_order?: number   // display ordering (lower = first)
  created_at: string
  updated_at?: string
}
```

Add `assignment_slot_id` to `Family` (after `updated_at`):

```typescript
export interface Family {
  // ... existing fields ...
  updated_at: string
  assignment_slot_id?: string | null  // null = explicitly unassigned; undefined = never set
  // ... existing admin-managed fields ...
  amount_due?: number
```

- [ ] **Step 4: Create `actions/assignments.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { AssignmentSlot, Family } from '@/lib/types'
import { randomBytes } from 'crypto'

function slotsRef(orgId: string, campId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId).collection('assignment_slots')
}

function familiesRef(orgId: string, campId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId).collection('families')
}

export interface CreateSlotInput {
  name: string
  capacity?: number
  notes?: string
  sort_order?: number
}

export async function listSlots(orgId: string, campId: string): Promise<AssignmentSlot[]> {
  const snap = await slotsRef(orgId, campId).orderBy('sort_order', 'asc').get()
  return snap.docs.map((d) => d.data() as AssignmentSlot)
}

export async function createSlot(
  orgId: string,
  campId: string,
  input: CreateSlotInput
): Promise<AssignmentSlot> {
  const id = randomBytes(8).toString('hex')
  const now = new Date().toISOString()
  const slot: AssignmentSlot = {
    id,
    name: input.name,
    ...(input.capacity != null ? { capacity: input.capacity } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.sort_order != null ? { sort_order: input.sort_order } : {}),
    created_at: now,
  }
  await slotsRef(orgId, campId).doc(id).set(slot)
  return slot
}

export async function updateSlot(
  orgId: string,
  campId: string,
  slotId: string,
  updates: Partial<Pick<AssignmentSlot, 'name' | 'capacity' | 'notes' | 'sort_order'>>
): Promise<void> {
  await slotsRef(orgId, campId).doc(slotId).update({
    ...updates,
    updated_at: new Date().toISOString(),
  })
}

export async function deleteSlot(orgId: string, campId: string, slotId: string): Promise<void> {
  await slotsRef(orgId, campId).doc(slotId).delete()
}

export async function assignFamily(
  orgId: string,
  campId: string,
  familyId: string,
  slotId: string | null
): Promise<void> {
  await familiesRef(orgId, campId).doc(familyId).update({
    assignment_slot_id: slotId,
    updated_at: new Date().toISOString(),
  })
}

export async function autoAssign(
  orgId: string,
  campId: string
): Promise<{ assigned: number }> {
  const [slotsSnap, familiesSnap] = await Promise.all([
    slotsRef(orgId, campId).orderBy('sort_order', 'asc').get(),
    familiesRef(orgId, campId).get(),
  ])

  const slots = slotsSnap.docs.map((d) => d.data() as AssignmentSlot)
  if (slots.length === 0) return { assigned: 0 }

  const families = familiesSnap.docs
    .map((d) => d.data() as Family)
    .filter(
      (f) =>
        (f.registration_status === 'pending' || f.registration_status === 'confirmed') &&
        !f.assignment_slot_id
    )

  // Count current occupancy per slot
  const occupancy = new Map<string, number>(slots.map((s) => [s.id, 0]))
  familiesSnap.docs.forEach((d) => {
    const f = d.data() as Family
    if (f.assignment_slot_id && occupancy.has(f.assignment_slot_id)) {
      occupancy.set(f.assignment_slot_id, (occupancy.get(f.assignment_slot_id) ?? 0) + 1)
    }
  })

  let assigned = 0
  for (const family of families) {
    // Pick the slot with most remaining capacity (or least occupancy if unlimited)
    const available = slots.filter((s) => {
      const count = occupancy.get(s.id) ?? 0
      return s.capacity == null || count < s.capacity
    })
    if (available.length === 0) break

    // Round-robin: pick slot with lowest current occupancy among available
    available.sort((a, b) => (occupancy.get(a.id) ?? 0) - (occupancy.get(b.id) ?? 0))
    const target = available[0]

    await familiesRef(orgId, campId).doc(family.id).update({
      assignment_slot_id: target.id,
      updated_at: new Date().toISOString(),
    })
    occupancy.set(target.id, (occupancy.get(target.id) ?? 0) + 1)
    assigned++
  }

  return { assigned }
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run __tests__/actions/assignments.test.ts
```

Expected: PASS — 10 tests

- [ ] **Step 6: Run full suite + tsc**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: all pass, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts actions/assignments.ts "__tests__/actions/assignments.test.ts"
git commit -m "feat: AssignmentSlot type + server actions (CRUD, assign, auto-assign)"
```

---

## Task 2: Assignments admin page

**Files:**
- Create: `app/(admin)/[orgSlug]/[campSlug]/assignments/page.tsx`
- Create: `components/admin/AssignmentsClient.tsx`

No unit tests — the server actions are tested in Task 1. This task builds the admin UI.

The page has two tabs:
- **Slots tab**: list all defined slots, add/edit/delete, show occupancy count
- **Assignments tab**: list all active families with a dropdown to pick their slot; Auto-assign button

The component receives `terminology` from `getEventType(camp.event_type_id)` so all labels adapt:
- Summer camp: "Cabins", "Cabin", "Assign to Cabin"
- Retreat: "Rooms", "Room"
- Gala: "Tables", "Table"
- VBS: "Classes", "Class"
- Mission trip: "Teams", "Team"

- [ ] **Step 1: Create `app/(admin)/[orgSlug]/[campSlug]/assignments/page.tsx`**

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listSlots } from '@/actions/assignments'
import { getAdminFamilies } from '@/actions/admin-families'
import { getEventType } from '@/lib/event-types'
import { AssignmentsClient } from '@/components/admin/AssignmentsClient'
import type { Camp } from '@/lib/types'

async function resolveIds(orgSlug: string, campSlug: string) {
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const campSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').where('slug', '==', campSlug).limit(1).get()
  if (campSnap.empty) notFound()

  return { orgId, campId: campSnap.docs[0].id, camp: campSnap.docs[0].data() as Camp }
}

export default async function AssignmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId, camp } = await resolveIds(orgSlug, campSlug)
  const [slots, families] = await Promise.all([
    listSlots(orgId, campId),
    getAdminFamilies(orgId, campId),
  ])
  const { terminology } = getEventType(camp.event_type_id)

  return (
    <AssignmentsClient
      orgId={orgId}
      campId={campId}
      campSlug={campSlug}
      orgSlug={orgSlug}
      slots={slots}
      families={families}
      terminology={terminology}
    />
  )
}
```

- [ ] **Step 2: Create `components/admin/AssignmentsClient.tsx`**

```tsx
'use client'

import { useState } from 'react'
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

  // Compute occupancy map from current families state
  const occupancy = new Map<string, number>()
  families.forEach((f) => {
    if (f.assignment_slot_id) {
      occupancy.set(f.assignment_slot_id, (occupancy.get(f.assignment_slot_id) ?? 0) + 1)
    }
  })

  const activeFamilies = families.filter(
    (f) => f.registration_status === 'confirmed' || f.registration_status === 'pending'
  )

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
            ? { ...s, name: editSlotName.trim(), capacity: editSlotCapacity ? Number(editSlotCapacity) : undefined }
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
    try {
      await deleteSlot(orgId, campId, slotId)
      setSlots((prev) => prev.filter((s) => s.id !== slotId))
      // Unset assignment for any families pointing to this slot
      setFamilies((prev) =>
        prev.map((f) => (f.assignment_slot_id === slotId ? { ...f, assignment_slot_id: undefined } : f))
      )
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
      setAutoAssignResult(`Auto-assigned ${result.assigned} registrant${result.assigned !== 1 ? 's' : ''}.`)
      // Refresh page data for accurate state
      window.location.reload()
    } finally {
      setAutoAssigning(false)
    }
  }

  const slotLabel = terminology.assignmentSingular
  const slotsLabel = terminology.assignmentPlural

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{slotsLabel}</h1>
        <div className="flex gap-2">
          <a
            href={`/${orgSlug}/${campSlug}/assignments/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground underline"
          >
            Print roster
          </a>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {(['slots', 'assignments'] as const).map((t) => (
          <button
            key={t}
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
        <div className="space-y-4">
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
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateSlot()}
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
                              {count}{slot.capacity != null ? `/${slot.capacity}` : ''} assigned
                            </Badge>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingSlotId(slot.id)
                                setEditSlotName(slot.name)
                                setEditSlotCapacity(slot.capacity != null ? String(slot.capacity) : '')
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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {activeFamilies.filter((f) => f.assignment_slot_id).length} of {activeFamilies.length} assigned
            </p>
            <div className="flex items-center gap-3">
              <div aria-live="polite">
                {autoAssignResult && <span className="text-sm text-accent">{autoAssignResult}</span>}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoAssign}
                disabled={autoAssigning || slots.length === 0}
              >
                {autoAssigning ? 'Assigning…' : `Auto-assign`}
              </Button>
            </div>
          </div>

          {activeFamilies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active registrations to assign.</p>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Registrant</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">{slotLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeFamilies.map((family) => (
                    <tr key={family.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">
                        {family.first_name} {family.last_name}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={family.registration_status === 'confirmed' ? 'default' : 'secondary'}>
                          {family.registration_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          value={family.assignment_slot_id ?? ''}
                          onChange={(e) => handleAssign(family.id, e.target.value || null)}
                        >
                          <option value="">— Unassigned —</option>
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
```

- [ ] **Step 3: Run TypeScript check + full test suite**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: tsc clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add \
  "app/(admin)/[orgSlug]/[campSlug]/assignments/page.tsx" \
  components/admin/AssignmentsClient.tsx
git commit -m "feat: assignments admin page — slot management, assignment dropdowns, auto-assign"
```

---

## Task 3: Print roster page

**Files:**
- Create: `app/(admin)/[orgSlug]/[campSlug]/assignments/print/page.tsx`

No unit tests — pure server-rendered HTML for browser print.

The print page shows each slot as a section with its assigned registrants. For family registration types, it shows the family name and each family member (from the `family_members` subcollection). For individual events, it just shows the registrant name.

- [ ] **Step 1: Create `app/(admin)/[orgSlug]/[campSlug]/assignments/print/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listSlots } from '@/actions/assignments'
import { getAdminFamilies } from '@/actions/admin-families'
import { getEventType } from '@/lib/event-types'
import type { Camp, FamilyMember } from '@/lib/types'

async function resolveIds(orgSlug: string, campSlug: string) {
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const campSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').where('slug', '==', campSlug).limit(1).get()
  if (campSnap.empty) notFound()

  return { orgId, campId: campSnap.docs[0].id, camp: campSnap.docs[0].data() as Camp }
}

async function getMembersForFamily(orgId: string, campId: string, familyId: string): Promise<FamilyMember[]> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families').doc(familyId)
    .collection('family_members')
    .get()
  return snap.docs.map((d) => d.data() as FamilyMember)
}

export default async function AssignmentsPrintPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId, camp } = await resolveIds(orgSlug, campSlug)
  const [slots, families] = await Promise.all([
    listSlots(orgId, campId),
    getAdminFamilies(orgId, campId),
  ])
  const { terminology, registrationUnit } = getEventType(camp.event_type_id)

  // Group assigned families by slot
  const familiesBySlot = new Map<string, typeof families>()
  slots.forEach((s) => familiesBySlot.set(s.id, []))
  families.forEach((f) => {
    if (f.assignment_slot_id && familiesBySlot.has(f.assignment_slot_id)) {
      familiesBySlot.get(f.assignment_slot_id)!.push(f)
    }
  })

  // For family registration, fetch members for each assigned family
  const membersByFamily = new Map<string, FamilyMember[]>()
  if (registrationUnit === 'family') {
    const assigned = families.filter((f) => f.assignment_slot_id)
    await Promise.all(
      assigned.map(async (f) => {
        const members = await getMembersForFamily(orgId, campId, f.id)
        membersByFamily.set(f.id, members)
      })
    )
  }

  const printedAt = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <html>
      <head>
        <title>{camp.name} — {terminology.assignmentPlural} Roster</title>
        <style>{`
          body { font-family: sans-serif; font-size: 12px; color: #000; margin: 0; padding: 16px; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          .meta { color: #666; font-size: 11px; margin-bottom: 24px; }
          .slot { break-inside: avoid; margin-bottom: 24px; border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
          .slot-header { font-size: 14px; font-weight: bold; margin-bottom: 8px; display: flex; justify-content: space-between; }
          .slot-count { font-weight: normal; color: #666; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; font-size: 10px; text-transform: uppercase; color: #888; border-bottom: 1px solid #eee; padding: 4px 0; }
          td { padding: 4px 0; border-bottom: 1px solid #f5f5f5; }
          .members { font-size: 11px; color: #444; }
          .unassigned { color: #888; font-style: italic; }
          @media print {
            body { padding: 0; }
            @page { margin: 1.5cm; }
          }
        `}</style>
      </head>
      <body>
        <h1>{camp.name}</h1>
        <p className="meta">
          {terminology.assignmentPlural} Roster · Printed {printedAt}
        </p>

        {slots.map((slot) => {
          const assigned = familiesBySlot.get(slot.id) ?? []
          return (
            <div key={slot.id} className="slot">
              <div className="slot-header">
                <span>{slot.name}</span>
                <span className="slot-count">
                  {assigned.length}
                  {slot.capacity != null ? `/${slot.capacity}` : ''} {terminology.registrantPlural.toLowerCase()}
                </span>
              </div>
              {assigned.length === 0 ? (
                <p className="unassigned">No {terminology.registrantPlural.toLowerCase()} assigned</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>{terminology.registrantSingular}</th>
                      {registrationUnit === 'family' && <th>{terminology.memberPlural}</th>}
                      <th>Email</th>
                      <th>Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assigned.map((f) => {
                      const members = membersByFamily.get(f.id) ?? []
                      return (
                        <tr key={f.id}>
                          <td>{f.first_name} {f.last_name}</td>
                          {registrationUnit === 'family' && (
                            <td className="members">
                              {members.map((m) => `${m.first_name} ${m.last_name}`).join(', ')}
                            </td>
                          )}
                          <td>{f.email}</td>
                          <td>{f.phone}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Run TypeScript check + full test suite**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: tsc clean, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/[orgSlug]/[campSlug]/assignments/print/page.tsx"
git commit -m "feat: print roster page — slot-by-slot registrant list with family members"
```

---

## Self-Review Checklist

After all tasks, run:

```bash
npx vitest run
npx tsc --noEmit
```

**Spec coverage check:**
- [x] Room/cabin assignment module (define rooms, assign registrants) — Tasks 1 + 2
- [x] Team/table/class assignment (same model, terminology-driven) — Tasks 1 + 2
- [x] Occupancy tracking — Task 2 (`occupancy` map, capacity display in badges and dropdowns)
- [x] Auto-balance option — Tasks 1 + 2 (`autoAssign` action + button)
- [x] Assignment print export (cabin list, team roster, seating chart) — Task 3
- [x] All 5 event types supported via unified model + terminology — Tasks 2 + 3

**Type consistency:**
- `AssignmentSlot.id` used as the FK in `Family.assignment_slot_id` throughout
- `assignFamily(orgId, campId, familyId, slotId | null)` — `null` = unassign, consistent in actions and client
- `CreateSlotInput` defined in Task 1, used in Task 2 via `createSlot(orgId, campId, input)` call
- `Terminology` imported from `@/lib/event-types` in Task 2 — types match the existing `EventType` system

**Placeholder scan:** No TBD patterns. All steps have complete code.

**Note for implementer:** The print page uses a raw `<html>` + `<head>` structure, not the Next.js layout. This is intentional — print pages need full control over `<head>` for the `<style>` block. In Next.js 16 App Router, a route can opt out of the root layout by exporting a custom `generateMetadata` or by being a standalone page file. If TypeScript or Next.js complains about the bare `<html>` return, wrap the content in a fragment and move the `<style>` to a `<style>` JSX element inside the page body, or create a `layout.tsx` in the `print/` directory that renders `{children}` with no wrapper.
