# Phase 1a: Event Type Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the event type configuration system — the architectural core of TraxEvent — so every event has a type that drives its terminology, registration unit, and admin UI labels.

**Architecture:** A static config registry in `lib/event-types.ts` defines 5 built-in event types, each with a `Terminology` bundle. The `Camp` document gains an `event_type_id` field. The admin layout fetches the event type server-side and passes the terminology to the sidebar as a prop, making all nav labels dynamic without any client-side fetches.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest + React Testing Library, Firebase Admin SDK (Firestore), Tailwind CSS, shadcn/ui

**Design system:** `docs/design-system.md` — use Plus Jakarta Sans, blue/green palette, shadcn components

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/event-types.ts` | **Create** | Built-in event type registry + lookup functions |
| `lib/types.ts` | **Modify** | Add `Terminology`, `EventType` interfaces; update `Camp` |
| `actions/camps.ts` | **Modify** | Add `updateCamp`; update `createCamp` to accept `event_type_id` |
| `app/(admin)/[orgSlug]/[campSlug]/settings/page.tsx` | **Create** | Event settings page (name, dates, status, event type, capacity) |
| `app/(admin)/[orgSlug]/[campSlug]/layout.tsx` | **Modify** | Fetch camp + event type server-side; pass terminology to sidebar |
| `components/layout/AdminSidebar.tsx` | **Modify** | Accept `terminology` prop; render dynamic nav labels |
| `app/(admin)/[orgSlug]/new-camp/page.tsx` | **Modify** | Add event type picker dropdown |
| `app/(admin)/[orgSlug]/page.tsx` | **Modify** | Show event type badge on event cards |
| `__tests__/lib/event-types.test.ts` | **Create** | Unit tests for config registry |
| `__tests__/actions/camps.test.ts` | **Modify** | Add `updateCamp` tests |
| `__tests__/components/layout/AdminSidebar.test.tsx` | **Create** | Terminology-driven label tests |

---

## Task 1: EventType config system

**Files:**
- Create: `lib/event-types.ts`
- Create: `__tests__/lib/event-types.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/lib/event-types.test.ts
import { describe, it, expect } from 'vitest'
import { getEventType, getAllEventTypes, DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'

describe('DEFAULT_EVENT_TYPE_ID', () => {
  it('is summer-camp', () => {
    expect(DEFAULT_EVENT_TYPE_ID).toBe('summer-camp')
  })
})

describe('getEventType', () => {
  it('returns summer-camp config', () => {
    const et = getEventType('summer-camp')
    expect(et.id).toBe('summer-camp')
    expect(et.name).toBe('Summer Camp')
    expect(et.registrationUnit).toBe('family')
    expect(et.terminology.registrantPlural).toBe('Families')
    expect(et.terminology.memberSingular).toBe('Camper')
    expect(et.terminology.assignmentSingular).toBe('Cabin')
    expect(et.terminology.eventLabel).toBe('Camp')
  })

  it('returns retreat config', () => {
    const et = getEventType('retreat')
    expect(et.registrationUnit).toBe('individual')
    expect(et.terminology.registrantPlural).toBe('Registrants')
    expect(et.terminology.assignmentSingular).toBe('Room')
  })

  it('returns vbs config', () => {
    const et = getEventType('vbs')
    expect(et.registrationUnit).toBe('child')
    expect(et.terminology.registrantPlural).toBe('Children')
    expect(et.terminology.assignmentSingular).toBe('Class')
  })

  it('returns gala config', () => {
    const et = getEventType('gala')
    expect(et.registrationUnit).toBe('individual')
    expect(et.terminology.registrantPlural).toBe('Guests')
    expect(et.terminology.assignmentSingular).toBe('Table')
  })

  it('returns mission-trip config', () => {
    const et = getEventType('mission-trip')
    expect(et.registrationUnit).toBe('individual')
    expect(et.terminology.registrantPlural).toBe('Participants')
    expect(et.terminology.assignmentSingular).toBe('Team')
  })

  it('falls back to summer-camp for unknown id', () => {
    const et = getEventType('unknown-type')
    expect(et.id).toBe('summer-camp')
  })
})

describe('getAllEventTypes', () => {
  it('returns all 5 built-in types', () => {
    const all = getAllEventTypes()
    expect(all).toHaveLength(5)
    const ids = all.map((et) => et.id)
    expect(ids).toContain('summer-camp')
    expect(ids).toContain('retreat')
    expect(ids).toContain('vbs')
    expect(ids).toContain('gala')
    expect(ids).toContain('mission-trip')
  })

  it('each type has all required terminology keys', () => {
    for (const et of getAllEventTypes()) {
      expect(et.terminology.registrantSingular).toBeTruthy()
      expect(et.terminology.registrantPlural).toBeTruthy()
      expect(et.terminology.memberSingular).toBeTruthy()
      expect(et.terminology.memberPlural).toBeTruthy()
      expect(et.terminology.assignmentSingular).toBeTruthy()
      expect(et.terminology.assignmentPlural).toBeTruthy()
      expect(et.terminology.eventLabel).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/rm/vw/traxevent
npx vitest run __tests__/lib/event-types.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/event-types'`

- [ ] **Step 3: Create `lib/event-types.ts`**

```typescript
// lib/event-types.ts

export interface Terminology {
  registrantSingular: string
  registrantPlural: string
  memberSingular: string
  memberPlural: string
  assignmentSingular: string
  assignmentPlural: string
  eventLabel: string
}

export type RegistrationUnit = 'family' | 'individual' | 'child'

export interface EventType {
  id: string
  name: string
  description: string
  registrationUnit: RegistrationUnit
  terminology: Terminology
}

export const DEFAULT_EVENT_TYPE_ID = 'summer-camp'

const BUILT_IN_EVENT_TYPES: EventType[] = [
  {
    id: 'summer-camp',
    name: 'Summer Camp',
    description: 'Family registration, cabin assignments, daily check-in',
    registrationUnit: 'family',
    terminology: {
      registrantSingular: 'Family',
      registrantPlural: 'Families',
      memberSingular: 'Camper',
      memberPlural: 'Campers',
      assignmentSingular: 'Cabin',
      assignmentPlural: 'Cabins',
      eventLabel: 'Camp',
    },
  },
  {
    id: 'retreat',
    name: 'Retreat',
    description: 'Individual registration, room assignments, meal preferences',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Registrant',
      registrantPlural: 'Registrants',
      memberSingular: 'Attendee',
      memberPlural: 'Attendees',
      assignmentSingular: 'Room',
      assignmentPlural: 'Rooms',
      eventLabel: 'Retreat',
    },
  },
  {
    id: 'vbs',
    name: 'VBS',
    description: 'Child + guardian registration, class assignments, guardian pickup',
    registrationUnit: 'child',
    terminology: {
      registrantSingular: 'Child',
      registrantPlural: 'Children',
      memberSingular: 'Child',
      memberPlural: 'Children',
      assignmentSingular: 'Class',
      assignmentPlural: 'Classes',
      eventLabel: 'VBS',
    },
  },
  {
    id: 'gala',
    name: 'Gala / Fundraiser',
    description: 'Individual or couple registration, table seating, ticket tiers',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Guest',
      registrantPlural: 'Guests',
      memberSingular: 'Guest',
      memberPlural: 'Guests',
      assignmentSingular: 'Table',
      assignmentPlural: 'Tables',
      eventLabel: 'Gala',
    },
  },
  {
    id: 'mission-trip',
    name: 'Mission Trip',
    description: 'Individual registration, team assignments, document collection',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Participant',
      registrantPlural: 'Participants',
      memberSingular: 'Member',
      memberPlural: 'Members',
      assignmentSingular: 'Team',
      assignmentPlural: 'Teams',
      eventLabel: 'Trip',
    },
  },
]

const EVENT_TYPE_MAP = new Map(BUILT_IN_EVENT_TYPES.map((et) => [et.id, et]))

export function getEventType(id: string): EventType {
  return EVENT_TYPE_MAP.get(id) ?? EVENT_TYPE_MAP.get(DEFAULT_EVENT_TYPE_ID)!
}

export function getAllEventTypes(): EventType[] {
  return BUILT_IN_EVENT_TYPES
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run __tests__/lib/event-types.test.ts
```

Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add lib/event-types.ts __tests__/lib/event-types.test.ts
git commit -m "feat: add EventType config system with 5 built-in types"
```

---

## Task 2: Update Camp type and createCamp

**Files:**
- Modify: `lib/types.ts`
- Modify: `actions/camps.ts`
- Modify: `__tests__/actions/camps.test.ts`

- [ ] **Step 1: Write failing tests for the updated Camp shape**

Add to the end of `__tests__/actions/camps.test.ts`:

```typescript
// Add these imports at the top of the existing file:
// import { createCamp } from '@/actions/camps'

// Add this describe block at the end of the file:

const campSetSpy = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            id: 'new-camp-id',
            set: campSetSpy,
          }),
        }),
      }),
    }),
  },
}))

import { createCamp } from '@/actions/camps'

describe('createCamp — event_type_id', () => {
  it('stores event_type_id when provided', async () => {
    const camp = await createCamp('org-1', {
      name: 'Summer Camp',
      year: 2026,
      registration_type: 'family',
      event_type_id: 'gala',
      camp_start: '2026-06-01',
      camp_end: '2026-06-07',
    })
    expect(camp.event_type_id).toBe('gala')
  })

  it('defaults event_type_id to summer-camp when omitted', async () => {
    const camp = await createCamp('org-1', {
      name: 'Summer Camp',
      year: 2026,
      registration_type: 'family',
      camp_start: '2026-06-01',
      camp_end: '2026-06-07',
    })
    expect(camp.event_type_id).toBe('summer-camp')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run __tests__/actions/camps.test.ts
```

Expected: FAIL — `camp.event_type_id` is `undefined`

- [ ] **Step 3: Add `Terminology` and `EventType` to `lib/types.ts` and update `Camp`**

Add after the existing `CampRegistrationType` type (line 3):

```typescript
// lib/types.ts — add after line 3 (CampRegistrationType declaration)

export interface Camp {
  id: string
  name: string
  slug: string
  year: number
  status: 'draft' | 'active' | 'archived'
  registration_type: CampRegistrationType
  event_type_id: string              // NEW — drives terminology + UI config
  features: {
    accommodations: boolean
    teams: boolean
    budget: boolean
    itinerary: boolean
    communicate: boolean
  }
  camp_start: string
  camp_end: string
  registration_open?: string         // NEW — ISO date, optional
  registration_close?: string        // NEW — ISO date, optional
  capacity?: number                  // NEW — max registrants, optional
  created_at: string
  updated_at?: string                // NEW — set on every updateCamp call
}
```

Replace the existing `Camp` interface in `lib/types.ts` (lines 43–60) with the above.

- [ ] **Step 4: Update `createCamp` in `actions/camps.ts` to accept and store `event_type_id`**

```typescript
// actions/camps.ts — replace the createCamp function

import { DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'

export async function createCamp(
  orgId: string,
  input: {
    name: string
    year: number
    registration_type: CampRegistrationType
    event_type_id?: string
    camp_start: string
    camp_end: string
  }
): Promise<Camp> {
  const campRef = adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc()

  const camp: Camp = {
    id: campRef.id,
    name: input.name,
    slug: buildCampSlug(input.name, input.year),
    year: input.year,
    status: 'draft',
    registration_type: input.registration_type,
    event_type_id: input.event_type_id ?? DEFAULT_EVENT_TYPE_ID,
    features: {
      accommodations: true,
      teams: true,
      budget: true,
      itinerary: true,
      communicate: true,
    },
    camp_start: input.camp_start,
    camp_end: input.camp_end,
    created_at: new Date().toISOString(),
  }

  await campRef.set(camp)
  return camp
}
```

Add the import for `DEFAULT_EVENT_TYPE_ID` at the top of `actions/camps.ts`:

```typescript
import { DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run __tests__/actions/camps.test.ts
```

Expected: PASS — all tests including the 2 new ones

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts actions/camps.ts __tests__/actions/camps.test.ts
git commit -m "feat: add event_type_id, capacity, registration dates to Camp type"
```

---

## Task 3: updateCamp server action

**Files:**
- Modify: `actions/camps.ts`
- Modify: `__tests__/actions/camps.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `__tests__/actions/camps.test.ts`:

```typescript
// Add campUpdateSpy to the dbSpies at top of file, alongside campSetSpy:
// const campUpdateSpy = vi.fn().mockResolvedValue(undefined)
// const campGetSpy = vi.fn()

// Then add this describe block:
describe('updateCamp', () => {
  beforeEach(() => {
    campGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'camp-id', name: 'Old Name' }),
    })
    campUpdateSpy.mockResolvedValue(undefined)
  })

  it('updates the camp document with provided fields and updated_at', async () => {
    await updateCamp('org-1', 'camp-id', { name: 'New Name', status: 'active' })
    expect(campUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Name',
        status: 'active',
        updated_at: expect.any(String),
      })
    )
  })

  it('only updates fields that are provided', async () => {
    await updateCamp('org-1', 'camp-id', { capacity: 100 })
    const call = campUpdateSpy.mock.calls[0][0]
    expect(call.capacity).toBe(100)
    expect(call.name).toBeUndefined()
  })

  it('throws if camp does not exist', async () => {
    campGetSpy.mockResolvedValue({ exists: false })
    await expect(updateCamp('org-1', 'bad-id', { name: 'x' })).rejects.toThrow('Camp not found')
  })
})
```

Note: you will need to wire `campGetSpy` and `campUpdateSpy` into the firebase-admin mock for the camp document path (`orgs/{orgId}/camps/{campId}`). Expand the mock to support `.get()` and `.update()` on the camp doc, similar to the pattern already in `__tests__/actions/admin-families.test.ts`.

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run __tests__/actions/camps.test.ts
```

Expected: FAIL — `updateCamp is not a function`

- [ ] **Step 3: Add `updateCamp` to `actions/camps.ts`**

Add after `getCampBySlug`:

```typescript
// actions/camps.ts

export async function updateCamp(
  orgId: string,
  campId: string,
  updates: Partial<Pick<Camp,
    | 'name'
    | 'status'
    | 'event_type_id'
    | 'registration_type'
    | 'camp_start'
    | 'camp_end'
    | 'registration_open'
    | 'registration_close'
    | 'capacity'
  >>
): Promise<void> {
  const ref = adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)

  const snap = await ref.get()
  if (!snap.exists) throw new Error('Camp not found')

  await ref.update({
    ...updates,
    updated_at: new Date().toISOString(),
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run __tests__/actions/camps.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/camps.ts __tests__/actions/camps.test.ts
git commit -m "feat: add updateCamp server action"
```

---

## Task 4: Event settings page

**Files:**
- Create: `app/(admin)/[orgSlug]/[campSlug]/settings/page.tsx`

There is no server action test needed here beyond what's already covered in Task 3. The page is a client component that calls `updateCamp` and `getOrgBySlug`/`getCampBySlug`.

- [ ] **Step 1: Create `app/(admin)/[orgSlug]/[campSlug]/settings/page.tsx`**

```tsx
// app/(admin)/[orgSlug]/[campSlug]/settings/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { getOrgBySlug } from '@/actions/orgs'
import { getCampBySlug, updateCamp } from '@/actions/camps'
import { getAllEventTypes } from '@/lib/event-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Camp } from '@/lib/types'

export default function EventSettingsPage() {
  const { orgSlug, campSlug } = useParams<{ orgSlug: string; campSlug: string }>()
  const [camp, setCamp] = useState<Camp | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [status, setStatus] = useState<Camp['status']>('draft')
  const [eventTypeId, setEventTypeId] = useState('summer-camp')
  const [campStart, setCampStart] = useState('')
  const [campEnd, setCampEnd] = useState('')
  const [registrationOpen, setRegistrationOpen] = useState('')
  const [registrationClose, setRegistrationClose] = useState('')
  const [capacity, setCapacity] = useState<string>('')

  useEffect(() => {
    async function load() {
      const org = await getOrgBySlug(orgSlug)
      if (!org) return
      setOrgId(org.id)
      const c = await getCampBySlug(org.id, campSlug)
      if (!c) return
      setCamp(c)
      setName(c.name)
      setStatus(c.status)
      setEventTypeId(c.event_type_id ?? 'summer-camp')
      setCampStart(c.camp_start)
      setCampEnd(c.camp_end)
      setRegistrationOpen(c.registration_open ?? '')
      setRegistrationClose(c.registration_close ?? '')
      setCapacity(c.capacity != null ? String(c.capacity) : '')
    }
    load()
  }, [orgSlug, campSlug])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !camp) return
    setError(null)
    setSaving(true)
    setSaved(false)
    try {
      await updateCamp(orgId, camp.id, {
        name,
        status,
        event_type_id: eventTypeId,
        camp_start: campStart,
        camp_end: campEnd,
        registration_open: registrationOpen || undefined,
        registration_close: registrationClose || undefined,
        capacity: capacity ? Number(capacity) : undefined,
      })
      setSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!camp) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Event settings</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Event name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => { setName(e.target.value); setSaved(false) }}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="eventType">Event type</Label>
              <select
                id="eventType"
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={eventTypeId}
                onChange={(e) => { setEventTypeId(e.target.value); setSaved(false) }}
              >
                {getAllEventTypes().map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.name} — {et.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={status}
                onChange={(e) => { setStatus(e.target.value as Camp['status']); setSaved(false) }}
              >
                <option value="draft">Draft — not visible to registrants</option>
                <option value="active">Active — registration open</option>
                <option value="archived">Archived — read-only</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="campStart">Event start</Label>
                <Input
                  id="campStart"
                  type="date"
                  value={campStart}
                  onChange={(e) => { setCampStart(e.target.value); setSaved(false) }}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="campEnd">Event end</Label>
                <Input
                  id="campEnd"
                  type="date"
                  value={campEnd}
                  onChange={(e) => { setCampEnd(e.target.value); setSaved(false) }}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="regOpen">Registration opens</Label>
                <Input
                  id="regOpen"
                  type="date"
                  value={registrationOpen}
                  onChange={(e) => { setRegistrationOpen(e.target.value); setSaved(false) }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="regClose">Registration closes</Label>
                <Input
                  id="regClose"
                  type="date"
                  value={registrationClose}
                  onChange={(e) => { setRegistrationClose(e.target.value); setSaved(false) }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="capacity">Capacity cap (optional)</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => { setCapacity(e.target.value); setSaved(false) }}
                placeholder="No limit"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {saved && <p className="text-sm text-green-600">Settings saved.</p>}

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify the page renders without TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/(admin)/[orgSlug]/[campSlug]/settings/page.tsx
git commit -m "feat: add event settings page (name, dates, status, event type, capacity)"
```

---

## Task 5: Terminology-driven admin sidebar

**Files:**
- Modify: `components/layout/AdminSidebar.tsx`
- Modify: `app/(admin)/[orgSlug]/[campSlug]/layout.tsx`
- Create: `__tests__/components/layout/AdminSidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// __tests__/components/layout/AdminSidebar.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { getEventType } from '@/lib/event-types'

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/camp-2026/dashboard',
}))

describe('AdminSidebar — terminology-driven labels', () => {
  it('shows "Families" for summer-camp event type', () => {
    const { terminology } = getEventType('summer-camp')
    render(<AdminSidebar orgSlug="acme" campSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Families')).toBeInTheDocument()
  })

  it('shows "Guests" for gala event type', () => {
    const { terminology } = getEventType('gala')
    render(<AdminSidebar orgSlug="acme" campSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Guests')).toBeInTheDocument()
  })

  it('shows "Children" for vbs event type', () => {
    const { terminology } = getEventType('vbs')
    render(<AdminSidebar orgSlug="acme" campSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Children')).toBeInTheDocument()
  })

  it('shows "Participants" for mission-trip event type', () => {
    const { terminology } = getEventType('mission-trip')
    render(<AdminSidebar orgSlug="acme" campSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Participants')).toBeInTheDocument()
  })

  it('always shows Dashboard regardless of event type', () => {
    const { terminology } = getEventType('gala')
    render(<AdminSidebar orgSlug="acme" campSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('includes a Settings nav link', () => {
    const { terminology } = getEventType('summer-camp')
    render(<AdminSidebar orgSlug="acme" campSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run __tests__/components/layout/AdminSidebar.test.tsx
```

Expected: FAIL — `AdminSidebar` doesn't accept `terminology` prop yet

- [ ] **Step 3: Update `components/layout/AdminSidebar.tsx`**

```tsx
// components/layout/AdminSidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Terminology } from '@/lib/event-types'

interface AdminSidebarProps {
  orgSlug: string
  campSlug?: string
  terminology?: Terminology
}

function getCampNav(terminology: Terminology) {
  return [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'families', label: terminology.registrantPlural },
    { key: 'assignments', label: terminology.assignmentPlural },
    { key: 'teams', label: 'Teams' },
    { key: 'budget', label: 'Budget' },
    { key: 'itinerary', label: 'Itinerary' },
    { key: 'communicate', label: 'Communicate' },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
  ]
}

const DEFAULT_TERMINOLOGY: Terminology = {
  registrantSingular: 'Family',
  registrantPlural: 'Families',
  memberSingular: 'Camper',
  memberPlural: 'Campers',
  assignmentSingular: 'Cabin',
  assignmentPlural: 'Cabins',
  eventLabel: 'Camp',
}

export function AdminSidebar({ orgSlug, campSlug, terminology }: AdminSidebarProps) {
  const pathname = usePathname()
  const t = terminology ?? DEFAULT_TERMINOLOGY
  const campNav = getCampNav(t)

  function navClass(href: string) {
    const active = pathname === href || pathname.startsWith(href + '/')
    return [
      'block px-3 py-2 rounded-md text-sm font-medium transition-colors',
      active
        ? 'bg-gray-700 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white',
    ].join(' ')
  }

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 min-h-screen flex flex-col flex-shrink-0">
      <div className="px-4 py-5 border-b border-gray-700">
        <Link href={`/${orgSlug}`} className="font-bold text-white text-lg tracking-tight">
          TraxEvent
        </Link>
      </div>

      {campSlug && (
        <nav className="flex-1 px-2 py-4 space-y-0.5" aria-label="Event navigation">
          {campNav.map(({ key, label }) => {
            const href = `/${orgSlug}/${campSlug}/${key}`
            return (
              <Link key={key} href={href} className={navClass(href)}>
                {label}
              </Link>
            )
          })}
        </nav>
      )}

      <div className="px-2 py-4 border-t border-gray-700 space-y-0.5">
        <Link href={`/${orgSlug}/members`} className={navClass(`/${orgSlug}/members`)}>
          Members
        </Link>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Update `app/(admin)/[orgSlug]/[campSlug]/layout.tsx` to fetch the event type and pass terminology**

```tsx
// app/(admin)/[orgSlug]/[campSlug]/layout.tsx
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { getOrgBySlug } from '@/actions/orgs'
import { getCampBySlug } from '@/actions/camps'
import { getEventType } from '@/lib/event-types'

export default async function CampLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const org = await getOrgBySlug(orgSlug)
  const camp = org ? await getCampBySlug(org.id, campSlug) : null
  const eventType = getEventType(camp?.event_type_id ?? 'summer-camp')

  return (
    <div className="flex min-h-screen">
      <AdminSidebar orgSlug={orgSlug} campSlug={campSlug} terminology={eventType.terminology} />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run __tests__/components/layout/AdminSidebar.test.tsx
npx vitest run
```

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add components/layout/AdminSidebar.tsx app/(admin)/[orgSlug]/[campSlug]/layout.tsx __tests__/components/layout/AdminSidebar.test.tsx
git commit -m "feat: terminology-driven sidebar — nav labels adapt to event type"
```

---

## Task 6: Update new-event creation to pick event type

**Files:**
- Modify: `app/(admin)/[orgSlug]/new-camp/page.tsx`
- Modify: `app/(admin)/[orgSlug]/page.tsx`

No new tests needed — the logic being changed in these pages delegates to `createCamp` (already tested) and `getAllEventTypes` (already tested).

- [ ] **Step 1: Update `app/(admin)/[orgSlug]/new-camp/page.tsx`**

Replace the full file:

```tsx
// app/(admin)/[orgSlug]/new-camp/page.tsx
'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createCamp } from '@/actions/camps'
import { getOrgBySlug } from '@/actions/orgs'
import { getAllEventTypes } from '@/lib/event-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export default function NewEventPage() {
  const router = useRouter()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [name, setName] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [eventTypeId, setEventTypeId] = useState('summer-camp')
  const [campStart, setCampStart] = useState('')
  const [campEnd, setCampEnd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const eventTypes = getAllEventTypes()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const org = await getOrgBySlug(orgSlug)
      if (!org) throw new Error('Organization not found')
      const selectedType = eventTypes.find((et) => et.id === eventTypeId)!
      const camp = await createCamp(org.id, {
        name,
        year,
        registration_type: selectedType.registrationUnit,
        event_type_id: eventTypeId,
        camp_start: campStart,
        camp_end: campEnd,
      })
      router.push(`/${orgSlug}/${camp.slug}/dashboard`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">New event</h1>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="eventType">Event type</Label>
              <select
                id="eventType"
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={eventTypeId}
                onChange={(e) => setEventTypeId(e.target.value)}
              >
                {eventTypes.map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.name} — {et.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="name">Event name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Summer Camp 2026"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                min={2020}
                max={2040}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="campStart">Start date</Label>
                <Input
                  id="campStart"
                  type="date"
                  value={campStart}
                  onChange={(e) => setCampStart(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="campEnd">End date</Label>
                <Input
                  id="campEnd"
                  type="date"
                  value={campEnd}
                  onChange={(e) => setCampEnd(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating…' : 'Create event'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Update org home page to show event type badge**

In `app/(admin)/[orgSlug]/page.tsx`, update the card to show event type. Find the section that renders the badge for `camp.registration_type` and replace it:

```tsx
// Replace:
<Badge variant="outline">{camp.registration_type}</Badge>

// With:
<Badge variant="outline">{camp.event_type_id ?? 'summer-camp'}</Badge>
```

Also update the "New camp" button text and link label to "New event":

```tsx
// Replace both instances of "New camp" / "Create a camp" with:
// "New event" / "Create an event"

// Replace:
<Link href={`/${orgSlug}/new-camp`}>
  <Button>New camp</Button>
</Link>

// With:
<Link href={`/${orgSlug}/new-camp`}>
  <Button>New event</Button>
</Link>
```

- [ ] **Step 3: Run full test suite and TypeScript check**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: All tests pass, no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add app/(admin)/[orgSlug]/new-camp/page.tsx app/(admin)/[orgSlug]/page.tsx
git commit -m "feat: add event type picker to new-event creation flow"
```

---

## Self-Review Checklist

After completing all tasks, run:

```bash
npx vitest run
npx tsc --noEmit
```

Both must be clean before marking this plan complete.

**Spec coverage check:**
- [x] Event type config system (terminology, features, registration unit) — Task 1
- [x] Built-in event types: Summer Camp, Retreat, VBS, Gala, Mission Trip — Task 1
- [x] Terminology-driven UI (all labels driven by event type config) — Task 5
- [x] Event settings page (name, dates, status, registration open/close, capacity cap, event type) — Task 4
- [x] `event_type_id` stored on Camp document — Task 2
- [x] `updateCamp` server action — Task 3
- [x] New event creation picks event type — Task 6
