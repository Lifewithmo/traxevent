# Admin Families Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin families dashboard at `/{orgSlug}/{campSlug}/families` — a table of registrations with a slide-over detail panel, bulk status actions, and CSV export.

**Architecture:** A server component page fetches families and resolves org/camp IDs from slugs, then renders a client-side `FamiliesClient` orchestrator that manages URL-synced state (selected family, status filter) and local state (search, bulk selection). The slide-over fetches full family + member data on demand via a server action.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Firestore (firebase-admin), Vitest + React Testing Library, Tailwind CSS (purple #7C3AED brand color).

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `lib/types.ts` | Add `FamilyNote`, `FamilyCsvRow` interfaces; extend `Family` with admin fields |
| Create | `lib/csv.ts` | Pure CSV generation utility |
| Create | `actions/admin-families.ts` | Server actions: get, update, bulk status, notes, CSV |
| Create | `app/(admin)/[orgSlug]/[campSlug]/families/page.tsx` | Server page: resolves slugs, fetches families |
| Create | `components/admin/StatusBadge.tsx` | Reusable status badge |
| Create | `components/admin/BulkToolbar.tsx` | Bulk action bar (appears when rows are checked) |
| Create | `components/admin/FamiliesTable.tsx` | Controlled table: search, filter pills, checkboxes |
| Create | `components/admin/FamiliesClient.tsx` | Client orchestrator: URL sync, state, renders table + slide-over |
| Create | `components/admin/FamilySlideOver.tsx` | Slide-over shell: tabs, header, footer with status actions + prev/next |
| Create | `components/admin/tabs/FamilyDetailsTab.tsx` | Contact fields editor |
| Create | `components/admin/tabs/FamilyCampersTab.tsx` | Camper cards editor |
| Create | `components/admin/tabs/FamilyPaymentTab.tsx` | Payment fields + balance |
| Create | `components/admin/tabs/FamilyNotesTab.tsx` | Notes list + add note |
| Create | `__tests__/lib/csv.test.ts` | CSV utility tests |
| Create | `__tests__/actions/admin-families.test.ts` | Server action tests |
| Create | `__tests__/components/admin/FamiliesTable.test.tsx` | Table tests |
| Create | `__tests__/components/admin/FamilySlideOver.test.tsx` | Slide-over tests |
| Create | `__tests__/components/admin/tabs/FamilyDetailsTab.test.tsx` | Details tab tests |
| Create | `__tests__/components/admin/tabs/FamilyPaymentTab.test.tsx` | Payment tab tests |

---

### Task 1: Extend types + create CSV utility

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/csv.ts`
- Create: `__tests__/lib/csv.test.ts`

- [ ] **Step 1: Write the failing CSV test**

Create `__tests__/lib/csv.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { exportFamiliesCsv } from '@/lib/csv'
import type { FamilyCsvRow } from '@/lib/types'

const makeRow = (overrides: Partial<FamilyCsvRow> = {}): FamilyCsvRow => ({
  familyName: 'Chen, Lisa',
  email: 'lisa@example.com',
  phone: '555-1234',
  campers: 'Mia; Noah',
  status: 'pending',
  balance: '$350.00',
  submitted: '2025-05-12',
  ...overrides,
})

describe('exportFamiliesCsv', () => {
  it('includes the correct header row', () => {
    const csv = exportFamiliesCsv([])
    expect(csv.split('\n')[0]).toBe(
      'Family Name,Email,Phone,Campers,Status,Balance,Submitted'
    )
  })

  it('returns header only for empty input', () => {
    const csv = exportFamiliesCsv([])
    expect(csv).toBe('Family Name,Email,Phone,Campers,Status,Balance,Submitted')
  })

  it('produces one data row per family', () => {
    const csv = exportFamiliesCsv([makeRow(), makeRow({ familyName: 'Smith, Bob' })])
    expect(csv.split('\n')).toHaveLength(3)
  })

  it('wraps every field in double quotes', () => {
    const csv = exportFamiliesCsv([makeRow()])
    const dataLine = csv.split('\n')[1]
    const fields = dataLine.split(',')
    fields.forEach(f => {
      expect(f.startsWith('"')).toBe(true)
      expect(f.endsWith('"')).toBe(true)
    })
  })

  it('escapes double quotes inside field values', () => {
    const csv = exportFamiliesCsv([makeRow({ familyName: 'O"Brien, Tim' })])
    expect(csv).toContain('"O""Brien, Tim"')
  })

  it('includes all seven columns in each row', () => {
    const csv = exportFamiliesCsv([makeRow()])
    const dataLine = csv.split('\n')[1]
    // Count top-level commas (between quoted fields)
    const cols = dataLine.split('","')
    expect(cols).toHaveLength(7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/rm/vw/traxevent && npx vitest run __tests__/lib/csv.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/csv'"

- [ ] **Step 3: Add `FamilyNote` and `FamilyCsvRow` to `lib/types.ts`**

After the closing brace of the `Family` interface (after line 120), add:

```typescript
  // Admin-managed fields (not present at registration time)
  amount_due?: number
  amount_paid?: number
  payment_notes?: string
  notes?: FamilyNote[]
```

Also add these new interfaces after the `FamilyMember` interface (after line 134):

```typescript
export interface FamilyNote {
  id: string
  text: string
  author: string
  created_at: string
  type: 'admin' | 'system'
}

export interface FamilyCsvRow {
  familyName: string
  email: string
  phone: string
  campers: string
  status: string
  balance: string
  submitted: string
}
```

- [ ] **Step 4: Create `lib/csv.ts`**

```typescript
import type { FamilyCsvRow } from '@/lib/types'

export function exportFamiliesCsv(rows: FamilyCsvRow[]): string {
  const HEADER = 'Family Name,Email,Phone,Campers,Status,Balance,Submitted'
  if (rows.length === 0) return HEADER

  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`

  const lines = rows.map(r =>
    [r.familyName, r.email, r.phone, r.campers, r.status, r.balance, r.submitted]
      .map(escape)
      .join(',')
  )

  return [HEADER, ...lines].join('\n')
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/rm/vw/traxevent && npx vitest run __tests__/lib/csv.test.ts
```

Expected: PASS — 6 tests

- [ ] **Step 6: Commit**

```bash
cd /Users/rm/vw/traxevent && git add lib/types.ts lib/csv.ts __tests__/lib/csv.test.ts && git commit -m "feat: add FamilyNote/FamilyCsvRow types and CSV utility"
```

---

### Task 2: Server actions for admin families

**Files:**
- Create: `actions/admin-families.ts`
- Create: `__tests__/actions/admin-families.test.ts`

- [ ] **Step 1: Write the failing server action tests**

Create `__tests__/actions/admin-families.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mutable spies that each test can reconfigure
const dbSpies = {
  familiesGet: vi.fn(),
  familyGet: vi.fn(),
  familyUpdate: vi.fn().mockResolvedValue(undefined),
  membersGet: vi.fn().mockResolvedValue({ docs: [] }),
  batchCommit: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            collection: () => ({
              doc: () => ({
                collection: () => ({ get: () => dbSpies.membersGet() }),
                get: () => dbSpies.familyGet(),
                update: (data: unknown) => dbSpies.familyUpdate(data),
              }),
              orderBy: () => ({ get: () => dbSpies.familiesGet() }),
              get: () => dbSpies.familiesGet(),
            }),
          }),
        }),
      }),
    }),
    batch: () => ({
      delete: vi.fn(),
      set: vi.fn(),
      commit: () => dbSpies.batchCommit(),
    }),
  },
}))

import type { Family, FamilyNote } from '@/lib/types'
import {
  getAdminFamilies,
  updateFamilyStatus,
  addFamilyNote,
  updateAdminFamily,
} from '@/actions/admin-families'

const baseFamily: Family = {
  id: 'fam-1',
  org_id: 'org-1',
  camp_id: 'camp-1',
  org_slug: 'acme',
  camp_slug: 'summer-2025',
  camp_name: 'Summer Camp',
  org_name: 'Acme',
  first_name: 'Lisa',
  last_name: 'Chen',
  email: 'lisa@example.com',
  phone: '555-1234',
  address: { street: '1 Main', city: 'SF', state: 'CA', zip: '94102' },
  emergency_contact: { name: 'David', phone: '555-5678', relationship: 'Spouse' },
  registration_status: 'pending',
  payment_status: 'unpaid',
  registrant_uid: null,
  pco_household_id: null,
  access_token: null,
  access_token_expires_at: null,
  created_at: '2025-05-12T10:00:00Z',
  updated_at: '2025-05-12T10:00:00Z',
  notes: [],
}

describe('getAdminFamilies', () => {
  beforeEach(() => {
    dbSpies.familiesGet.mockResolvedValue({
      docs: [{ data: () => baseFamily }],
    })
  })

  it('returns array of Family from Firestore', async () => {
    const result = await getAdminFamilies('org-1', 'camp-1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('fam-1')
  })

  it('returns empty array when no families exist', async () => {
    dbSpies.familiesGet.mockResolvedValue({ docs: [] })
    const result = await getAdminFamilies('org-1', 'camp-1')
    expect(result).toEqual([])
  })
})

describe('updateFamilyStatus', () => {
  beforeEach(() => {
    dbSpies.familyGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...baseFamily, notes: [] }),
    })
    dbSpies.familyUpdate.mockResolvedValue(undefined)
  })

  it('writes the new registration_status to Firestore', async () => {
    await updateFamilyStatus('org-1', 'camp-1', 'fam-1', 'confirmed', 'Admin')
    expect(dbSpies.familyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ registration_status: 'confirmed' })
    )
  })

  it('appends a system note on status change', async () => {
    await updateFamilyStatus('org-1', 'camp-1', 'fam-1', 'confirmed', 'Admin')
    const payload = dbSpies.familyUpdate.mock.calls[0][0]
    expect(payload.notes).toHaveLength(1)
    expect(payload.notes[0].type).toBe('system')
    expect(payload.notes[0].text).toContain('confirmed')
  })

  it('preserves existing notes when appending the system note', async () => {
    const existing: FamilyNote = {
      id: 'n1', text: 'Old note', author: 'Admin',
      created_at: '2025-01-01T00:00:00Z', type: 'admin',
    }
    dbSpies.familyGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...baseFamily, notes: [existing] }),
    })
    await updateFamilyStatus('org-1', 'camp-1', 'fam-1', 'waitlisted', 'Admin')
    const payload = dbSpies.familyUpdate.mock.calls[0][0]
    expect(payload.notes).toHaveLength(2)
    expect(payload.notes[0].text).toBe('Old note')
  })
})

describe('addFamilyNote', () => {
  beforeEach(() => {
    dbSpies.familyGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...baseFamily, notes: [] }),
    })
    dbSpies.familyUpdate.mockResolvedValue(undefined)
  })

  it('returns the new note', async () => {
    const note = await addFamilyNote('org-1', 'camp-1', 'fam-1', 'Follow up', 'Admin')
    expect(note.text).toBe('Follow up')
    expect(note.type).toBe('admin')
    expect(note.author).toBe('Admin')
    expect(note.id).toBeTruthy()
  })

  it('writes the note to Firestore', async () => {
    await addFamilyNote('org-1', 'camp-1', 'fam-1', 'Follow up', 'Admin')
    expect(dbSpies.familyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({ text: 'Follow up', type: 'admin' }),
        ]),
      })
    )
  })
})

describe('updateAdminFamily', () => {
  beforeEach(() => {
    dbSpies.familyUpdate.mockResolvedValue(undefined)
  })

  it('writes the provided fields to Firestore', async () => {
    await updateAdminFamily('org-1', 'camp-1', 'fam-1', {
      first_name: 'Lucy',
      amount_due: 500,
    })
    expect(dbSpies.familyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: 'Lucy', amount_due: 500 })
    )
  })

  it('always stamps updated_at', async () => {
    await updateAdminFamily('org-1', 'camp-1', 'fam-1', { phone: '555-9999' })
    const payload = dbSpies.familyUpdate.mock.calls[0][0]
    expect(payload.updated_at).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/rm/vw/traxevent && npx vitest run __tests__/actions/admin-families.test.ts
```

Expected: FAIL — "Cannot find module '@/actions/admin-families'"

- [ ] **Step 3: Create `actions/admin-families.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { Family, FamilyMember, FamilyNote, FamilyCsvRow } from '@/lib/types'
import { randomBytes } from 'crypto'
import { exportFamiliesCsv } from '@/lib/csv'

function familiesRef(orgId: string, campId: string) {
  return adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families')
}

export async function getAdminFamilies(orgId: string, campId: string): Promise<Family[]> {
  const snap = await familiesRef(orgId, campId).orderBy('created_at', 'desc').get()
  return snap.docs.map(d => d.data() as Family)
}

export async function getAdminFamily(
  orgId: string,
  campId: string,
  familyId: string
): Promise<{ family: Family; members: FamilyMember[] } | null> {
  const familySnap = await familiesRef(orgId, campId).doc(familyId).get()
  if (!familySnap.exists) return null
  const membersSnap = await familiesRef(orgId, campId)
    .doc(familyId)
    .collection('family_members')
    .get()
  return {
    family: familySnap.data() as Family,
    members: membersSnap.docs.map(d => d.data() as FamilyMember),
  }
}

export async function updateAdminFamily(
  orgId: string,
  campId: string,
  familyId: string,
  updates: Partial<Pick<Family,
    | 'first_name' | 'last_name' | 'email' | 'phone'
    | 'address' | 'emergency_contact'
    | 'amount_due' | 'amount_paid' | 'payment_notes' | 'payment_status'
  >>
): Promise<void> {
  await familiesRef(orgId, campId).doc(familyId).update({
    ...updates,
    updated_at: new Date().toISOString(),
  })
}

export async function updateFamilyStatus(
  orgId: string,
  campId: string,
  familyId: string,
  status: Family['registration_status'],
  adminName: string
): Promise<void> {
  const note: FamilyNote = {
    id: randomBytes(8).toString('hex'),
    text: `Status changed to ${status}`,
    author: adminName,
    created_at: new Date().toISOString(),
    type: 'system',
  }
  const snap = await familiesRef(orgId, campId).doc(familyId).get()
  const existing = ((snap.data() as Family).notes) ?? []
  await familiesRef(orgId, campId).doc(familyId).update({
    registration_status: status,
    notes: [...existing, note],
    updated_at: new Date().toISOString(),
  })
}

export async function bulkUpdateStatus(
  orgId: string,
  campId: string,
  familyIds: string[],
  status: Family['registration_status'],
  adminName: string
): Promise<void> {
  await Promise.all(
    familyIds.map(id => updateFamilyStatus(orgId, campId, id, status, adminName))
  )
}

export async function addFamilyNote(
  orgId: string,
  campId: string,
  familyId: string,
  text: string,
  author: string
): Promise<FamilyNote> {
  const note: FamilyNote = {
    id: randomBytes(8).toString('hex'),
    text,
    author,
    created_at: new Date().toISOString(),
    type: 'admin',
  }
  const snap = await familiesRef(orgId, campId).doc(familyId).get()
  const existing = ((snap.data() as Family).notes) ?? []
  await familiesRef(orgId, campId).doc(familyId).update({
    notes: [...existing, note],
    updated_at: new Date().toISOString(),
  })
  return note
}

export async function updateFamilyMembers(
  orgId: string,
  campId: string,
  familyId: string,
  members: FamilyMember[]
): Promise<void> {
  const batch = adminDb.batch()
  const membersCol = familiesRef(orgId, campId).doc(familyId).collection('family_members')
  const existingSnap = await membersCol.get()
  existingSnap.docs.forEach(d => batch.delete(d.ref))
  members.forEach(m => batch.set(membersCol.doc(m.id), m))
  await batch.commit()
}

export async function buildFamiliesCsvAction(
  orgId: string,
  campId: string,
  familyIds?: string[]
): Promise<string> {
  const families = await getAdminFamilies(orgId, campId)
  const filtered = familyIds ? families.filter(f => familyIds.includes(f.id)) : families

  const membersMap = new Map<string, FamilyMember[]>()
  await Promise.all(
    filtered.map(async f => {
      const snap = await familiesRef(orgId, campId)
        .doc(f.id)
        .collection('family_members')
        .get()
      membersMap.set(f.id, snap.docs.map(d => d.data() as FamilyMember))
    })
  )

  const rows: FamilyCsvRow[] = filtered.map(f => {
    const members = membersMap.get(f.id) ?? []
    const balance = ((f.amount_due ?? 0) - (f.amount_paid ?? 0)).toFixed(2)
    return {
      familyName: `${f.last_name}, ${f.first_name}`,
      email: f.email,
      phone: f.phone,
      campers: members.map(m => m.first_name).join('; '),
      status: f.registration_status,
      balance: `$${balance}`,
      submitted: f.created_at.split('T')[0],
    }
  })

  return exportFamiliesCsv(rows)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/rm/vw/traxevent && npx vitest run __tests__/actions/admin-families.test.ts
```

Expected: PASS — 8 tests

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd /Users/rm/vw/traxevent && npx vitest run
```

Expected: all tests pass (23 previous + 14 new)

- [ ] **Step 6: Commit**

```bash
cd /Users/rm/vw/traxevent && git add actions/admin-families.ts __tests__/actions/admin-families.test.ts && git commit -m "feat: add admin families server actions"
```

---

### Task 3: StatusBadge + BulkToolbar components

**Files:**
- Create: `components/admin/StatusBadge.tsx`
- Create: `components/admin/BulkToolbar.tsx`

These two are tested in the FamiliesTable tests (Task 4). No separate test file.

- [ ] **Step 1: Create `components/admin/StatusBadge.tsx`**

```typescript
import type { Family } from '@/lib/types'

const STATUS_STYLES: Record<Family['registration_status'], string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  waitlisted: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS: Record<Family['registration_status'], string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  waitlisted: 'Waitlist',
  cancelled: 'Cancelled',
}

interface StatusBadgeProps {
  status: Family['registration_status']
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
```

- [ ] **Step 2: Create `components/admin/BulkToolbar.tsx`**

```typescript
import type { Family } from '@/lib/types'

interface BulkToolbarProps {
  selectedCount: number
  onStatusChange: (status: Family['registration_status']) => void
  onExport: () => void
  onClear: () => void
}

export function BulkToolbar({
  selectedCount,
  onStatusChange,
  onExport,
  onClear,
}: BulkToolbarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 border-b border-purple-200 text-sm">
      <span className="font-semibold text-purple-800">{selectedCount} selected</span>
      <button
        onClick={() => onStatusChange('confirmed')}
        className="px-3 py-1 rounded-md bg-white border border-purple-200 text-purple-700 font-semibold hover:bg-purple-100 transition-colors"
      >
        Confirm
      </button>
      <button
        onClick={() => onStatusChange('waitlisted')}
        className="px-3 py-1 rounded-md bg-white border border-purple-200 text-purple-700 font-semibold hover:bg-purple-100 transition-colors"
      >
        Waitlist
      </button>
      <button
        onClick={() => onStatusChange('cancelled')}
        className="px-3 py-1 rounded-md bg-white border border-purple-200 text-purple-700 font-semibold hover:bg-purple-100 transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={onExport}
        className="px-3 py-1 rounded-md bg-white border border-purple-200 text-purple-700 font-semibold hover:bg-purple-100 transition-colors"
      >
        Export selected
      </button>
      <div className="flex-1" />
      <button
        onClick={onClear}
        className="text-purple-500 hover:text-purple-700 text-xs"
      >
        Clear selection
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/rm/vw/traxevent && git add components/admin/StatusBadge.tsx components/admin/BulkToolbar.tsx && git commit -m "feat: add StatusBadge and BulkToolbar components"
```

---

### Task 4: FamiliesTable component

**Files:**
- Create: `components/admin/FamiliesTable.tsx`
- Create: `__tests__/components/admin/FamiliesTable.test.tsx`

- [ ] **Step 1: Write the failing FamiliesTable tests**

Create `__tests__/components/admin/FamiliesTable.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, useState } from 'vitest'
import { useState as useStateReact } from 'react'
import { FamiliesTable } from '@/components/admin/FamiliesTable'
import type { Family } from '@/lib/types'

const makeFam = (overrides: Partial<Family> = {}): Family => ({
  id: 'fam-1',
  org_id: 'org-1',
  camp_id: 'camp-1',
  org_slug: 'acme',
  camp_slug: 'summer-2025',
  camp_name: 'Summer Camp',
  org_name: 'Acme',
  first_name: 'Lisa',
  last_name: 'Chen',
  email: 'lisa@example.com',
  phone: '555-1234',
  address: { street: '1 Main', city: 'SF', state: 'CA', zip: '94102' },
  emergency_contact: { name: 'David', phone: '555-5678', relationship: 'Spouse' },
  registration_status: 'pending',
  payment_status: 'unpaid',
  registrant_uid: null,
  pco_household_id: null,
  access_token: null,
  access_token_expires_at: null,
  created_at: '2025-05-12T10:00:00Z',
  updated_at: '2025-05-12T10:00:00Z',
  notes: [],
  ...overrides,
})

const families = [
  makeFam({ id: 'fam-1', first_name: 'Lisa', last_name: 'Chen', registration_status: 'pending' }),
  makeFam({ id: 'fam-2', first_name: 'Bob', last_name: 'Smith', registration_status: 'confirmed' }),
  makeFam({ id: 'fam-3', first_name: 'Maria', last_name: 'Garcia', email: 'maria@example.com', registration_status: 'waitlisted' }),
]

// Controlled wrapper so we can test state changes
function Wrapper({
  initialSearch = '',
  initialFilter = 'all',
}: {
  initialSearch?: string
  initialFilter?: string
}) {
  const [search, setSearch] = useStateReact(initialSearch)
  const [statusFilter, setStatusFilter] = useStateReact(initialFilter)
  const [selectedIds, setSelectedIds] = useStateReact<Set<string>>(new Set())
  const [selectedFamilyId, setSelectedFamilyId] = useStateReact<string | null>(null)

  return (
    <FamiliesTable
      families={families}
      search={search}
      onSearchChange={setSearch}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      selectedIds={selectedIds}
      onToggleRow={id =>
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.has(id) ? next.delete(id) : next.add(id)
          return next
        })
      }
      onToggleAll={ids => setSelectedIds(new Set(ids))}
      onClearSelection={() => setSelectedIds(new Set())}
      selectedFamilyId={selectedFamilyId}
      onSelectFamily={setSelectedFamilyId}
      onBulkStatusChange={vi.fn()}
      onExport={vi.fn()}
    />
  )
}

describe('FamiliesTable', () => {
  it('renders all families by default', () => {
    render(<Wrapper />)
    expect(screen.getByText('Chen, Lisa')).toBeInTheDocument()
    expect(screen.getByText('Smith, Bob')).toBeInTheDocument()
    expect(screen.getByText('Garcia, Maria')).toBeInTheDocument()
  })

  it('filters rows by search text (name match)', async () => {
    render(<Wrapper />)
    const input = screen.getByPlaceholderText(/search/i)
    await userEvent.type(input, 'chen')
    expect(screen.getByText('Chen, Lisa')).toBeInTheDocument()
    expect(screen.queryByText('Smith, Bob')).not.toBeInTheDocument()
  })

  it('filters rows by search text (email match)', async () => {
    render(<Wrapper />)
    const input = screen.getByPlaceholderText(/search/i)
    await userEvent.type(input, 'maria@')
    expect(screen.getByText('Garcia, Maria')).toBeInTheDocument()
    expect(screen.queryByText('Chen, Lisa')).not.toBeInTheDocument()
  })

  it('shows only pending families when Pending filter is active', () => {
    render(<Wrapper initialFilter="pending" />)
    expect(screen.getByText('Chen, Lisa')).toBeInTheDocument()
    expect(screen.queryByText('Smith, Bob')).not.toBeInTheDocument()
  })

  it('shows empty state message when no families match search', async () => {
    render(<Wrapper />)
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'zzznomatch')
    expect(screen.getByText(/no families match/i)).toBeInTheDocument()
  })

  it('toggles row selection when checkbox is clicked', async () => {
    render(<Wrapper />)
    const checkboxes = screen.getAllByRole('checkbox')
    // First checkbox is select-all; data checkboxes follow
    await userEvent.click(checkboxes[1])
    // BulkToolbar should appear showing "1 selected"
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument()
  })

  it('calls onSelectFamily when a row is clicked', async () => {
    const onSelectFamily = vi.fn()
    render(
      <FamiliesTable
        families={families}
        search=""
        onSearchChange={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
        selectedIds={new Set()}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onClearSelection={vi.fn()}
        selectedFamilyId={null}
        onSelectFamily={onSelectFamily}
        onBulkStatusChange={vi.fn()}
        onExport={vi.fn()}
      />
    )
    await userEvent.click(screen.getByText('Chen, Lisa'))
    expect(onSelectFamily).toHaveBeenCalledWith('fam-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/rm/vw/traxevent && npx vitest run __tests__/components/admin/FamiliesTable.test.tsx
```

Expected: FAIL — "Cannot find module '@/components/admin/FamiliesTable'"

- [ ] **Step 3: Create `components/admin/FamiliesTable.tsx`**

```typescript
'use client'

import type { Family } from '@/lib/types'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { BulkToolbar } from '@/components/admin/BulkToolbar'

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'waitlisted', label: 'Waitlist' },
  { key: 'cancelled', label: 'Cancelled' },
]

interface FamiliesTableProps {
  families: Family[]
  search: string
  onSearchChange: (s: string) => void
  statusFilter: string
  onStatusFilterChange: (status: string) => void
  selectedIds: Set<string>
  onToggleRow: (id: string) => void
  onToggleAll: (ids: string[]) => void
  onClearSelection: () => void
  selectedFamilyId: string | null
  onSelectFamily: (id: string) => void
  onBulkStatusChange: (ids: string[], status: Family['registration_status']) => void
  onExport: (ids?: string[]) => void
}

export function FamiliesTable({
  families,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onClearSelection,
  selectedFamilyId,
  onSelectFamily,
  onBulkStatusChange,
  onExport,
}: FamiliesTableProps) {
  // Client-side filter
  const filtered = families.filter(f => {
    if (statusFilter !== 'all' && f.registration_status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const name = `${f.last_name} ${f.first_name}`.toLowerCase()
      if (!name.includes(q) && !f.email.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Status counts for filter pills
  const counts = {
    all: families.length,
    pending: families.filter(f => f.registration_status === 'pending').length,
    confirmed: families.filter(f => f.registration_status === 'confirmed').length,
    waitlisted: families.filter(f => f.registration_status === 'waitlisted').length,
    cancelled: families.filter(f => f.registration_status === 'cancelled').length,
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every(f => selectedIds.has(f.id))

  function handleToggleAll() {
    if (allFilteredSelected) {
      onClearSelection()
    } else {
      onToggleAll(filtered.map(f => f.id))
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search + filter bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <input
          type="text"
          placeholder="Search families, emails…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
        <div className="flex gap-1">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onStatusFilterChange(key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                statusFilter === key
                  ? 'bg-purple-100 text-purple-700 border border-purple-300'
                  : 'bg-white text-gray-500 border border-gray-200 hover:border-purple-200'
              }`}
            >
              {label} ({counts[key as keyof typeof counts]})
            </button>
          ))}
        </div>
        <button
          onClick={() => onExport()}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white text-gray-600 hover:border-purple-300 transition-colors"
        >
          Export all
        </button>
      </div>

      {/* Bulk toolbar */}
      <BulkToolbar
        selectedCount={selectedIds.size}
        onStatusChange={status =>
          onBulkStatusChange(Array.from(selectedIds), status)
        }
        onExport={() => onExport(Array.from(selectedIds))}
        onClear={onClearSelection}
      />

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="grid grid-cols-[28px_1fr_140px_110px_90px_60px] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wide">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={handleToggleAll}
            className="accent-purple-600"
          />
          <span>Family</span>
          <span>Campers</span>
          <span>Status</span>
          <span>Balance</span>
          <span />
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            {search
              ? 'No families match your search'
              : `No ${statusFilter === 'all' ? '' : statusFilter + ' '}registrations`}
          </div>
        )}

        {filtered.map(f => {
          const balance = (f.amount_due ?? 0) - (f.amount_paid ?? 0)
          return (
            <div
              key={f.id}
              onClick={() => onSelectFamily(f.id)}
              className={`grid grid-cols-[28px_1fr_140px_110px_90px_60px] gap-2 px-4 py-2.5 border-b border-gray-100 text-sm items-center cursor-pointer transition-colors ${
                selectedFamilyId === f.id ? 'bg-purple-50' : 'hover:bg-purple-50/40'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(f.id)}
                onChange={e => {
                  e.stopPropagation()
                  onToggleRow(f.id)
                }}
                onClick={e => e.stopPropagation()}
                className="accent-purple-600"
              />
              <div>
                <div className="font-semibold text-gray-900">
                  {f.last_name}, {f.first_name}
                </div>
                <div className="text-xs text-gray-400">{f.email}</div>
              </div>
              <div className="text-gray-500 text-xs truncate">—</div>
              <div>
                <StatusBadge status={f.registration_status} />
              </div>
              <div
                className={`font-semibold text-sm ${
                  balance > 0 ? 'text-red-600' : 'text-gray-700'
                }`}
              >
                {balance > 0 ? `$${balance.toFixed(0)}` : '—'}
              </div>
              <div className="text-xs font-semibold text-purple-600">View</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/rm/vw/traxevent && npx vitest run __tests__/components/admin/FamiliesTable.test.tsx
```

Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
cd /Users/rm/vw/traxevent && git add components/admin/FamiliesTable.tsx __tests__/components/admin/FamiliesTable.test.tsx && git commit -m "feat: add FamiliesTable component with search, filters, and bulk selection"
```

---

### Task 5: FamilySlideOver shell + FamiliesClient

**Files:**
- Create: `components/admin/FamilySlideOver.tsx`
- Create: `components/admin/FamiliesClient.tsx`
- Create: `__tests__/components/admin/FamilySlideOver.test.tsx`

- [ ] **Step 1: Write the failing FamilySlideOver tests**

Create `__tests__/components/admin/FamilySlideOver.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FamilySlideOver } from '@/components/admin/FamilySlideOver'
import type { Family, FamilyMember } from '@/lib/types'

const mockFamily: Family = {
  id: 'fam-1',
  org_id: 'org-1',
  camp_id: 'camp-1',
  org_slug: 'acme',
  camp_slug: 'summer-2025',
  camp_name: 'Summer Camp',
  org_name: 'Acme',
  first_name: 'Lisa',
  last_name: 'Chen',
  email: 'lisa@example.com',
  phone: '555-1234',
  address: { street: '1 Main', city: 'SF', state: 'CA', zip: '94102' },
  emergency_contact: { name: 'David', phone: '555-5678', relationship: 'Spouse' },
  registration_status: 'pending',
  payment_status: 'unpaid',
  registrant_uid: null,
  pco_household_id: null,
  access_token: null,
  access_token_expires_at: null,
  created_at: '2025-05-12T10:00:00Z',
  updated_at: '2025-05-12T10:00:00Z',
  notes: [],
}

const mockMember: FamilyMember = {
  id: 'mem-1',
  family_id: 'fam-1',
  first_name: 'Mia',
  last_name: 'Chen',
  birth_year: 2015,
  gender: 'F',
  grade: '4th',
  allergies: 'peanuts',
  dietary_restrictions: '',
  tshirt_size: 'M',
  medical_notes: '',
}

vi.mock('@/actions/admin-families', () => ({
  getAdminFamily: vi.fn().mockResolvedValue({ family: mockFamily, members: [mockMember] }),
  updateFamilyStatus: vi.fn().mockResolvedValue(undefined),
}))

const mockFamilies = [
  mockFamily,
  { ...mockFamily, id: 'fam-2', first_name: 'Bob', last_name: 'Smith' },
]

function renderSlideOver(overrides = {}) {
  return render(
    <FamilySlideOver
      familyId="fam-1"
      families={mockFamilies}
      orgId="org-1"
      campId="camp-1"
      onClose={vi.fn()}
      onNavigate={vi.fn()}
      onStatusChange={vi.fn()}
      {...overrides}
    />
  )
}

describe('FamilySlideOver', () => {
  it('renders null when familyId is null', () => {
    const { container } = render(
      <FamilySlideOver
        familyId={null}
        families={mockFamilies}
        orgId="org-1"
        campId="camp-1"
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onStatusChange={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows family name in header after loading', async () => {
    renderSlideOver()
    await waitFor(() => expect(screen.getByText('Chen, Lisa')).toBeInTheDocument())
  })

  it('calls onClose when ✕ button is clicked', async () => {
    const onClose = vi.fn()
    renderSlideOver({ onClose })
    await waitFor(() => screen.getByText('Chen, Lisa'))
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the Details tab by default', async () => {
    renderSlideOver()
    await waitFor(() => screen.getByText('Chen, Lisa'))
    expect(screen.getByRole('tab', { name: /details/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('switches to Notes tab when clicked', async () => {
    renderSlideOver()
    await waitFor(() => screen.getByText('Chen, Lisa'))
    await userEvent.click(screen.getByRole('tab', { name: /notes/i }))
    expect(screen.getByRole('tab', { name: /notes/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('calls onNavigate with next family id when Next is clicked', async () => {
    const onNavigate = vi.fn()
    renderSlideOver({ onNavigate })
    await waitFor(() => screen.getByText('Chen, Lisa'))
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNavigate).toHaveBeenCalledWith('fam-2')
  })

  it('Prev button is disabled for first family in list', async () => {
    renderSlideOver()
    await waitFor(() => screen.getByText('Chen, Lisa'))
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled()
  })

  it('calls onStatusChange with confirmed when Confirm is clicked', async () => {
    const onStatusChange = vi.fn()
    renderSlideOver({ onStatusChange })
    await waitFor(() => screen.getByText('Chen, Lisa'))
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    expect(onStatusChange).toHaveBeenCalledWith('fam-1', 'confirmed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/rm/vw/traxevent && npx vitest run __tests__/components/admin/FamilySlideOver.test.tsx
```

Expected: FAIL — "Cannot find module '@/components/admin/FamilySlideOver'"

- [ ] **Step 3: Create `components/admin/FamilySlideOver.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import type { Family, FamilyMember } from '@/lib/types'
import { getAdminFamily, updateFamilyStatus } from '@/actions/admin-families'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { FamilyDetailsTab } from '@/components/admin/tabs/FamilyDetailsTab'
import { FamilyCampersTab } from '@/components/admin/tabs/FamilyCampersTab'
import { FamilyPaymentTab } from '@/components/admin/tabs/FamilyPaymentTab'
import { FamilyNotesTab } from '@/components/admin/tabs/FamilyNotesTab'

type Tab = 'details' | 'campers' | 'payment' | 'notes'

interface FamilySlideOverProps {
  familyId: string | null
  families: Family[]
  orgId: string
  campId: string
  onClose: () => void
  onNavigate: (familyId: string) => void
  onStatusChange: (familyId: string, status: Family['registration_status']) => void
}

export function FamilySlideOver({
  familyId,
  families,
  orgId,
  campId,
  onClose,
  onNavigate,
  onStatusChange,
}: FamilySlideOverProps) {
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [family, setFamily] = useState<Family | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!familyId) return
    setLoading(true)
    getAdminFamily(orgId, campId, familyId).then(result => {
      if (result) {
        setFamily(result.family)
        setMembers(result.members)
      }
      setLoading(false)
    })
  }, [familyId, orgId, campId])

  // Keyboard: Escape closes
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!familyId) return null

  const currentIndex = families.findIndex(f => f.id === familyId)
  const prevId = currentIndex > 0 ? families[currentIndex - 1].id : null
  const nextId = currentIndex < families.length - 1 ? families[currentIndex + 1].id : null

  async function handleStatusChange(status: Family['registration_status']) {
    if (!familyId || !family) return
    const previousStatus = family.registration_status
    onStatusChange(familyId, status)
    setFamily(prev => prev ? { ...prev, registration_status: status } : prev)
    try {
      await updateFamilyStatus(orgId, campId, familyId, status, 'Admin')
    } catch {
      // Revert on failure
      onStatusChange(familyId, previousStatus)
      setFamily(prev => prev ? { ...prev, registration_status: previousStatus } : prev)
      alert('Failed to update status. Please try again.')
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'campers', label: `Campers (${members.length})` },
    { key: 'payment', label: 'Payment' },
    { key: 'notes', label: `Notes (${family?.notes?.length ?? 0})` },
  ]

  return (
    <>
      {/* Backdrop (click to close) */}
      <div
        className="fixed inset-0 z-20 bg-black/10"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-30 w-[440px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between">
          {loading || !family ? (
            <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
          ) : (
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {family.last_name}, {family.first_name}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">{family.email}</p>
              <div className="mt-1.5">
                <StatusBadge status={family.registration_status} />
              </div>
            </div>
          )}
          <button
            aria-label="Close"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-4" role="tablist">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === key
                  ? 'text-purple-700 border-purple-600'
                  : 'text-gray-400 border-transparent hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading || !family ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-9 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {activeTab === 'details' && (
                <FamilyDetailsTab
                  family={family}
                  orgId={orgId}
                  campId={campId}
                  onSaved={updated => setFamily(prev => prev ? { ...prev, ...updated } : prev)}
                />
              )}
              {activeTab === 'campers' && (
                <FamilyCampersTab
                  members={members}
                  familyId={family.id}
                  orgId={orgId}
                  campId={campId}
                  onSaved={setMembers}
                />
              )}
              {activeTab === 'payment' && (
                <FamilyPaymentTab
                  family={family}
                  orgId={orgId}
                  campId={campId}
                  onSaved={updated => setFamily(prev => prev ? { ...prev, ...updated } : prev)}
                />
              )}
              {activeTab === 'notes' && (
                <FamilyNotesTab
                  family={family}
                  orgId={orgId}
                  campId={campId}
                  onNoteAdded={note =>
                    setFamily(prev =>
                      prev ? { ...prev, notes: [...(prev.notes ?? []), note] } : prev
                    )
                  }
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2">
          <div className="flex gap-2 flex-1">
            <button
              onClick={() => handleStatusChange('confirmed')}
              disabled={family?.registration_status === 'confirmed'}
              className="px-3 py-1.5 bg-purple-600 text-white text-xs font-semibold rounded-md hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => handleStatusChange('waitlisted')}
              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-semibold rounded-md hover:border-purple-300 transition-colors"
            >
              Waitlist
            </button>
          </div>
          <button
            aria-label="Prev"
            onClick={() => prevId && onNavigate(prevId)}
            disabled={!prevId}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-md text-gray-500 hover:border-purple-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <button
            aria-label="Next"
            onClick={() => nextId && onNavigate(nextId)}
            disabled={!nextId}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-md text-gray-500 hover:border-purple-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Create `components/admin/FamiliesClient.tsx`**

```typescript
'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Family } from '@/lib/types'
import { FamiliesTable } from '@/components/admin/FamiliesTable'
import { FamilySlideOver } from '@/components/admin/FamilySlideOver'
import { bulkUpdateStatus, buildFamiliesCsvAction } from '@/actions/admin-families'

interface FamiliesClientProps {
  families: Family[]
  orgId: string
  campId: string
  orgSlug: string
  campSlug: string
}

export function FamiliesClient({
  families,
  orgId,
  campId,
}: FamiliesClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedFamilyId = searchParams.get('familyId')
  const statusFilter = searchParams.get('status') ?? 'all'

  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Optimistic status updates for instant UI feedback
  const [statusOverrides, setStatusOverrides] = useState<Record<string, Family['registration_status']>>({})

  const displayFamilies = families.map(f =>
    statusOverrides[f.id] ? { ...f, registration_status: statusOverrides[f.id] } : f
  )

  function setFamilyId(id: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) {
      params.set('familyId', id)
    } else {
      params.delete('familyId')
    }
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  function setStatusFilter(status: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (status === 'all') {
      params.delete('status')
    } else {
      params.set('status', status)
    }
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const handleStatusChange = useCallback(
    async (familyId: string, status: Family['registration_status']) => {
      setStatusOverrides(prev => ({ ...prev, [familyId]: status }))
    },
    []
  )

  async function handleBulkStatusChange(
    ids: string[],
    status: Family['registration_status']
  ) {
    const overrides: Record<string, Family['registration_status']> = {}
    ids.forEach(id => (overrides[id] = status))
    setStatusOverrides(prev => ({ ...prev, ...overrides }))
    setSelectedIds(new Set())
    try {
      await bulkUpdateStatus(orgId, campId, ids, status, 'Admin')
    } catch {
      // Revert optimistic update on failure
      setStatusOverrides(prev => {
        const next = { ...prev }
        ids.forEach(id => delete next[id])
        return next
      })
      alert('Failed to update status. Please try again.')
    }
  }

  async function handleExport(ids?: string[]) {
    try {
      const csv = await buildFamiliesCsvAction(orgId, campId, ids)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'families.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Export failed. Please try again.')
    }
  }

  return (
    <div className="flex flex-col h-full relative">
      <FamiliesTable
        families={displayFamilies}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        selectedIds={selectedIds}
        onToggleRow={id =>
          setSelectedIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
          })
        }
        onToggleAll={ids => setSelectedIds(new Set(ids))}
        onClearSelection={() => setSelectedIds(new Set())}
        selectedFamilyId={selectedFamilyId}
        onSelectFamily={setFamilyId}
        onBulkStatusChange={handleBulkStatusChange}
        onExport={handleExport}
      />
      <FamilySlideOver
        familyId={selectedFamilyId}
        families={displayFamilies}
        orgId={orgId}
        campId={campId}
        onClose={() => setFamilyId(null)}
        onNavigate={setFamilyId}
        onStatusChange={handleStatusChange}
      />
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/rm/vw/traxevent && npx vitest run __tests__/components/admin/FamilySlideOver.test.tsx
```

Expected: PASS — 8 tests (the tab components are stubbed and will resolve once created in Task 6 + 7)

**Note:** If tests fail because tab components don't exist yet, create minimal stubs:

```bash
mkdir -p /Users/rm/vw/traxevent/components/admin/tabs
```

Then create stubs for each tab (replace with real implementation in Tasks 6 and 7):
- `components/admin/tabs/FamilyDetailsTab.tsx` → `export function FamilyDetailsTab() { return <div>Details</div> }`
- `components/admin/tabs/FamilyCampersTab.tsx` → `export function FamilyCampersTab() { return <div>Campers</div> }`
- `components/admin/tabs/FamilyPaymentTab.tsx` → `export function FamilyPaymentTab() { return <div>Payment</div> }`
- `components/admin/tabs/FamilyNotesTab.tsx` → `export function FamilyNotesTab() { return <div>Notes</div> }`

- [ ] **Step 6: Commit**

```bash
cd /Users/rm/vw/traxevent && git add components/admin/ __tests__/components/admin/FamilySlideOver.test.tsx && git commit -m "feat: add FamilySlideOver and FamiliesClient"
```

---

### Task 6: FamilyDetailsTab + FamilyCampersTab

**Files:**
- Create (or replace stub): `components/admin/tabs/FamilyDetailsTab.tsx`
- Create (or replace stub): `components/admin/tabs/FamilyCampersTab.tsx`
- Create: `__tests__/components/admin/tabs/FamilyDetailsTab.test.tsx`

- [ ] **Step 1: Write the failing FamilyDetailsTab tests**

Create `__tests__/components/admin/tabs/FamilyDetailsTab.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FamilyDetailsTab } from '@/components/admin/tabs/FamilyDetailsTab'
import type { Family } from '@/lib/types'

vi.mock('@/actions/admin-families', () => ({
  updateAdminFamily: vi.fn().mockResolvedValue(undefined),
}))

const mockFamily: Family = {
  id: 'fam-1',
  org_id: 'org-1',
  camp_id: 'camp-1',
  org_slug: 'acme',
  camp_slug: 'summer-2025',
  camp_name: 'Summer Camp',
  org_name: 'Acme',
  first_name: 'Lisa',
  last_name: 'Chen',
  email: 'lisa@example.com',
  phone: '555-1234',
  address: { street: '1 Main', city: 'SF', state: 'CA', zip: '94102' },
  emergency_contact: { name: 'David', phone: '555-5678', relationship: 'Spouse' },
  registration_status: 'pending',
  payment_status: 'unpaid',
  registrant_uid: null,
  pco_household_id: null,
  access_token: null,
  access_token_expires_at: null,
  created_at: '2025-05-12T10:00:00Z',
  updated_at: '2025-05-12T10:00:00Z',
  notes: [],
}

describe('FamilyDetailsTab', () => {
  it('renders the family contact fields', () => {
    render(
      <FamilyDetailsTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByDisplayValue('Lisa')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Chen')).toBeInTheDocument()
    expect(screen.getByDisplayValue('lisa@example.com')).toBeInTheDocument()
  })

  it('does not show Save button when fields are clean', () => {
    render(
      <FamilyDetailsTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })

  it('shows Save button after editing a field', async () => {
    render(
      <FamilyDetailsTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    const firstNameInput = screen.getByDisplayValue('Lisa')
    await userEvent.clear(firstNameInput)
    await userEvent.type(firstNameInput, 'Lucy')
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('calls updateAdminFamily with changed fields when Save is clicked', async () => {
    const { updateAdminFamily } = await import('@/actions/admin-families')
    render(
      <FamilyDetailsTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    const firstNameInput = screen.getByDisplayValue('Lisa')
    await userEvent.clear(firstNameInput)
    await userEvent.type(firstNameInput, 'Lucy')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() =>
      expect(updateAdminFamily).toHaveBeenCalledWith(
        'org-1', 'camp-1', 'fam-1',
        expect.objectContaining({ first_name: 'Lucy' })
      )
    )
  })

  it('hides Save button and calls onSaved after successful save', async () => {
    const onSaved = vi.fn()
    render(
      <FamilyDetailsTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={onSaved}
      />
    )
    const firstNameInput = screen.getByDisplayValue('Lisa')
    await userEvent.clear(firstNameInput)
    await userEvent.type(firstNameInput, 'Lucy')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/rm/vw/traxevent && npx vitest run __tests__/components/admin/tabs/FamilyDetailsTab.test.tsx
```

Expected: FAIL (stub returns only `<div>Details</div>`, doesn't have required inputs)

- [ ] **Step 3: Create `components/admin/tabs/FamilyDetailsTab.tsx`**

```typescript
'use client'

import { useState } from 'react'
import type { Family } from '@/lib/types'
import { updateAdminFamily } from '@/actions/admin-families'

interface FamilyDetailsTabProps {
  family: Family
  orgId: string
  campId: string
  onSaved: (updates: Partial<Family>) => void
}

type DraftFields = Pick<Family, 'first_name' | 'last_name' | 'email' | 'phone'> & {
  ec_name: string
  ec_phone: string
  ec_relationship: string
  addr_street: string
  addr_city: string
  addr_state: string
  addr_zip: string
}

function toDraft(f: Family): DraftFields {
  return {
    first_name: f.first_name,
    last_name: f.last_name,
    email: f.email,
    phone: f.phone,
    ec_name: f.emergency_contact.name,
    ec_phone: f.emergency_contact.phone,
    ec_relationship: f.emergency_contact.relationship,
    addr_street: f.address.street,
    addr_city: f.address.city,
    addr_state: f.address.state,
    addr_zip: f.address.zip,
  }
}

function isDirty(a: DraftFields, b: DraftFields) {
  return (Object.keys(a) as (keyof DraftFields)[]).some(k => a[k] !== b[k])
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
      {children}
    </label>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-300"
      />
    </div>
  )
}

export function FamilyDetailsTab({ family, orgId, campId, onSaved }: FamilyDetailsTabProps) {
  const clean = toDraft(family)
  const [draft, setDraft] = useState<DraftFields>(clean)
  const [saving, setSaving] = useState(false)
  const dirty = isDirty(draft, clean)

  function set(key: keyof DraftFields) {
    return (v: string) => setDraft(prev => ({ ...prev, [key]: v }))
  }

  async function handleSave() {
    setSaving(true)
    const updates: Partial<Family> = {
      first_name: draft.first_name,
      last_name: draft.last_name,
      email: draft.email,
      phone: draft.phone,
      emergency_contact: {
        name: draft.ec_name,
        phone: draft.ec_phone,
        relationship: draft.ec_relationship,
      },
      address: {
        street: draft.addr_street,
        city: draft.addr_city,
        state: draft.addr_state,
        zip: draft.addr_zip,
      },
    }
    await updateAdminFamily(orgId, campId, family.id, updates)
    setSaving(false)
    onSaved(updates)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" value={draft.first_name} onChange={set('first_name')} />
        <Field label="Last name" value={draft.last_name} onChange={set('last_name')} />
        <Field label="Email" value={draft.email} onChange={set('email')} />
        <Field label="Phone" value={draft.phone} onChange={set('phone')} />
      </div>

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Emergency contact
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" value={draft.ec_name} onChange={set('ec_name')} />
          <Field label="Phone" value={draft.ec_phone} onChange={set('ec_phone')} />
          <div className="col-span-2">
            <Field label="Relationship" value={draft.ec_relationship} onChange={set('ec_relationship')} />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Address</p>
        <div className="space-y-2">
          <Field label="Street" value={draft.addr_street} onChange={set('addr_street')} />
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <Field label="City" value={draft.addr_city} onChange={set('addr_city')} />
            </div>
            <Field label="State" value={draft.addr_state} onChange={set('addr_state')} />
            <Field label="ZIP" value={draft.addr_zip} onChange={set('addr_zip')} />
          </div>
        </div>
      </div>

      {dirty && (
        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-purple-600 text-white text-sm font-semibold rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `components/admin/tabs/FamilyCampersTab.tsx`**

```typescript
'use client'

import { useState } from 'react'
import type { FamilyMember } from '@/lib/types'
import { updateFamilyMembers } from '@/actions/admin-families'

interface FamilyCampersTabProps {
  members: FamilyMember[]
  familyId: string
  orgId: string
  campId: string
  onSaved: (members: FamilyMember[]) => void
}

function blankMember(familyId: string): FamilyMember {
  return {
    id: Math.random().toString(36).slice(2),
    family_id: familyId,
    first_name: '',
    last_name: '',
    birth_year: new Date().getFullYear() - 10,
    gender: '',
    grade: '',
    allergies: '',
    dietary_restrictions: '',
    tshirt_size: '',
    medical_notes: '',
  }
}

function MemberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-0.5">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-gray-50 focus:outline-none focus:ring-1 focus:ring-purple-300"
      />
    </div>
  )
}

export function FamilyCampersTab({
  members: initialMembers,
  familyId,
  orgId,
  campId,
  onSaved,
}: FamilyCampersTabProps) {
  const [members, setMembers] = useState<FamilyMember[]>(initialMembers)
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  function updateMember(id: string, key: keyof FamilyMember, value: string) {
    setMembers(prev =>
      prev.map(m =>
        m.id === id
          ? { ...m, [key]: key === 'birth_year' ? parseInt(value, 10) || m.birth_year : value }
          : m
      )
    )
  }

  function addMember() {
    setMembers(prev => [...prev, blankMember(familyId)])
  }

  function removeMember(id: string) {
    setMembers(prev => prev.filter(m => m.id !== id))
    setConfirmRemove(null)
  }

  async function handleSave() {
    setSaving(true)
    await updateFamilyMembers(orgId, campId, familyId, members)
    setSaving(false)
    onSaved(members)
  }

  return (
    <div className="space-y-3">
      {members.map(m => (
        <div key={m.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm font-semibold text-gray-700">
              {m.first_name || m.last_name ? `${m.first_name} ${m.last_name}`.trim() : 'New camper'}
            </span>
            {confirmRemove === m.id ? (
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => removeMember(m.id)}
                  className="text-red-600 font-semibold"
                >
                  Remove
                </button>
                <button onClick={() => setConfirmRemove(null)} className="text-gray-400">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRemove(m.id)}
                className="text-xs text-gray-400 hover:text-red-500"
                aria-label="Remove camper"
              >
                ✕
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MemberField label="First name" value={m.first_name} onChange={v => updateMember(m.id, 'first_name', v)} />
            <MemberField label="Last name" value={m.last_name} onChange={v => updateMember(m.id, 'last_name', v)} />
            <MemberField label="Birth year" value={m.birth_year} onChange={v => updateMember(m.id, 'birth_year', v)} />
            <MemberField label="Gender" value={m.gender} onChange={v => updateMember(m.id, 'gender', v)} />
            <MemberField label="Grade" value={m.grade} onChange={v => updateMember(m.id, 'grade', v)} />
            <MemberField label="T-shirt size" value={m.tshirt_size} onChange={v => updateMember(m.id, 'tshirt_size', v)} />
            <MemberField label="Allergies" value={m.allergies} onChange={v => updateMember(m.id, 'allergies', v)} />
            <MemberField label="Dietary restrictions" value={m.dietary_restrictions} onChange={v => updateMember(m.id, 'dietary_restrictions', v)} />
          </div>
          <div className="mt-2">
            <label className="block text-xs text-gray-400 mb-0.5">Medical notes</label>
            <textarea
              value={m.medical_notes}
              onChange={e => updateMember(m.id, 'medical_notes', e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-gray-50 resize-none focus:outline-none focus:ring-1 focus:ring-purple-300"
            />
          </div>
        </div>
      ))}

      <button
        onClick={addMember}
        className="w-full py-2 border border-dashed border-purple-300 rounded-lg text-sm text-purple-600 hover:bg-purple-50 transition-colors"
      >
        + Add camper
      </button>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-1.5 bg-purple-600 text-white text-sm font-semibold rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving…' : 'Save all'}
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/rm/vw/traxevent && npx vitest run __tests__/components/admin/tabs/FamilyDetailsTab.test.tsx
```

Expected: PASS — 5 tests

- [ ] **Step 6: Run full test suite**

```bash
cd /Users/rm/vw/traxevent && npx vitest run
```

Expected: all previous tests still pass

- [ ] **Step 7: Commit**

```bash
cd /Users/rm/vw/traxevent && git add components/admin/tabs/FamilyDetailsTab.tsx components/admin/tabs/FamilyCampersTab.tsx __tests__/components/admin/tabs/FamilyDetailsTab.test.tsx && git commit -m "feat: add FamilyDetailsTab and FamilyCampersTab"
```

---

### Task 7: FamilyPaymentTab + FamilyNotesTab

**Files:**
- Create (or replace stub): `components/admin/tabs/FamilyPaymentTab.tsx`
- Create (or replace stub): `components/admin/tabs/FamilyNotesTab.tsx`
- Create: `__tests__/components/admin/tabs/FamilyPaymentTab.test.tsx`

- [ ] **Step 1: Write the failing FamilyPaymentTab tests**

Create `__tests__/components/admin/tabs/FamilyPaymentTab.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { FamilyPaymentTab } from '@/components/admin/tabs/FamilyPaymentTab'
import type { Family } from '@/lib/types'

vi.mock('@/actions/admin-families', () => ({
  updateAdminFamily: vi.fn().mockResolvedValue(undefined),
}))

const mockFamily: Family = {
  id: 'fam-1',
  org_id: 'org-1',
  camp_id: 'camp-1',
  org_slug: 'acme',
  camp_slug: 'summer-2025',
  camp_name: 'Summer Camp',
  org_name: 'Acme',
  first_name: 'Lisa',
  last_name: 'Chen',
  email: 'lisa@example.com',
  phone: '555-1234',
  address: { street: '1 Main', city: 'SF', state: 'CA', zip: '94102' },
  emergency_contact: { name: 'David', phone: '555-5678', relationship: 'Spouse' },
  registration_status: 'pending',
  payment_status: 'unpaid',
  amount_due: 700,
  amount_paid: 0,
  payment_notes: '',
  registrant_uid: null,
  pco_household_id: null,
  access_token: null,
  access_token_expires_at: null,
  created_at: '2025-05-12T10:00:00Z',
  updated_at: '2025-05-12T10:00:00Z',
  notes: [],
}

describe('FamilyPaymentTab', () => {
  it('shows the correct balance (amount_due minus amount_paid)', () => {
    render(
      <FamilyPaymentTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByText('$700.00')).toBeInTheDocument()
  })

  it('shows zero balance when fully paid', () => {
    render(
      <FamilyPaymentTab
        family={{ ...mockFamily, amount_paid: 700 }}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('calls updateAdminFamily when Save is clicked after editing', async () => {
    const { updateAdminFamily } = await import('@/actions/admin-families')
    render(
      <FamilyPaymentTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    const amountPaidInput = screen.getByLabelText(/amount paid/i)
    await userEvent.clear(amountPaidInput)
    await userEvent.type(amountPaidInput, '350')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() =>
      expect(updateAdminFamily).toHaveBeenCalledWith(
        'org-1', 'camp-1', 'fam-1',
        expect.objectContaining({ amount_paid: 350 })
      )
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/rm/vw/traxevent && npx vitest run __tests__/components/admin/tabs/FamilyPaymentTab.test.tsx
```

Expected: FAIL (stub doesn't have the required UI)

- [ ] **Step 3: Create `components/admin/tabs/FamilyPaymentTab.tsx`**

```typescript
'use client'

import { useState } from 'react'
import type { Family } from '@/lib/types'
import { updateAdminFamily } from '@/actions/admin-families'

interface FamilyPaymentTabProps {
  family: Family
  orgId: string
  campId: string
  onSaved: (updates: Partial<Family>) => void
}

export function FamilyPaymentTab({ family, orgId, campId, onSaved }: FamilyPaymentTabProps) {
  const [amountDue, setAmountDue] = useState(String(family.amount_due ?? 0))
  const [amountPaid, setAmountPaid] = useState(String(family.amount_paid ?? 0))
  const [paymentNotes, setPaymentNotes] = useState(family.payment_notes ?? '')
  const [saving, setSaving] = useState(false)

  const due = parseFloat(amountDue) || 0
  const paid = parseFloat(amountPaid) || 0
  const balance = due - paid

  const dirty =
    String(family.amount_due ?? 0) !== amountDue ||
    String(family.amount_paid ?? 0) !== amountPaid ||
    (family.payment_notes ?? '') !== paymentNotes

  async function handleSave() {
    setSaving(true)
    const updates: Partial<Family> = {
      amount_due: due,
      amount_paid: paid,
      payment_notes: paymentNotes,
      payment_status:
        paid === 0 ? 'unpaid' : paid >= due ? 'paid' : 'partial',
    }
    await updateAdminFamily(orgId, campId, family.id, updates)
    setSaving(false)
    onSaved(updates)
  }

  function LabeledInput({
    label,
    id,
    value,
    onChange,
  }: {
    label: string
    id: string
    value: string
    onChange: (v: string) => void
  }) {
    return (
      <div>
        <label htmlFor={id} className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
          {label}
        </label>
        <div className="relative">
          <span className="absolute left-2.5 top-1.5 text-sm text-gray-400">$</span>
          <input
            id={id}
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full pl-6 pr-3 py-1.5 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <LabeledInput label="Amount due" id="amount-due" value={amountDue} onChange={setAmountDue} />
        <LabeledInput label="Amount paid" id="amount-paid" value={amountPaid} onChange={setAmountPaid} />
      </div>

      <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between border border-gray-200">
        <span className="text-sm font-semibold text-gray-600">Balance</span>
        <span
          className={`text-lg font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}
        >
          ${balance.toFixed(2)}
        </span>
      </div>

      <div>
        <label htmlFor="payment-notes" className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Payment notes
        </label>
        <textarea
          id="payment-notes"
          value={paymentNotes}
          onChange={e => setPaymentNotes(e.target.value)}
          rows={3}
          className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
          placeholder="e.g. Scholarship applied, payment plan…"
        />
      </div>

      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 bg-purple-600 text-white text-sm font-semibold rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `components/admin/tabs/FamilyNotesTab.tsx`**

```typescript
'use client'

import { useState } from 'react'
import type { Family, FamilyNote } from '@/lib/types'
import { addFamilyNote } from '@/actions/admin-families'

interface FamilyNotesTabProps {
  family: Family
  orgId: string
  campId: string
  onNoteAdded: (note: FamilyNote) => void
}

export function FamilyNotesTab({ family, orgId, campId, onNoteAdded }: FamilyNotesTabProps) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const notes = [...(family.notes ?? [])].reverse()

  async function handleAdd() {
    if (!text.trim()) return
    setSaving(true)
    const note = await addFamilyNote(orgId, campId, family.id, text.trim(), 'Admin')
    onNoteAdded(note)
    setText('')
    setSaving(false)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">No notes yet</p>
      )}

      {notes.map(note => (
        <div
          key={note.id}
          className={`border-l-2 pl-3 rounded-r ${
            note.type === 'system'
              ? 'border-gray-200 bg-gray-50 py-2'
              : 'border-purple-300 bg-purple-50/40 py-2'
          }`}
        >
          <p className="text-xs text-gray-400 mb-0.5">
            {note.author} · {formatDate(note.created_at)}
          </p>
          <p className={`text-sm ${note.type === 'system' ? 'text-gray-400 italic' : 'text-gray-700'}`}>
            {note.text}
          </p>
        </div>
      ))}

      <div className="pt-2 border-t border-gray-100">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a note…"
          rows={3}
          className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
        <button
          onClick={handleAdd}
          disabled={saving || !text.trim()}
          className="mt-2 px-4 py-1.5 bg-purple-600 text-white text-sm font-semibold rounded-md hover:bg-purple-700 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Adding…' : 'Add note'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/rm/vw/traxevent && npx vitest run __tests__/components/admin/tabs/FamilyPaymentTab.test.tsx
```

Expected: PASS — 3 tests

- [ ] **Step 6: Run full test suite**

```bash
cd /Users/rm/vw/traxevent && npx vitest run
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
cd /Users/rm/vw/traxevent && git add components/admin/tabs/ __tests__/components/admin/tabs/FamilyPaymentTab.test.tsx && git commit -m "feat: add FamilyPaymentTab and FamilyNotesTab"
```

---

### Task 8: FamiliesPage server component

**Files:**
- Create: `app/(admin)/[orgSlug]/[campSlug]/families/page.tsx`

No new tests needed — the server component is thin glue; all logic is covered by component and action tests above.

- [ ] **Step 1: Create `app/(admin)/[orgSlug]/[campSlug]/families/page.tsx`**

```typescript
export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getAdminFamilies } from '@/actions/admin-families'
import { FamiliesClient } from '@/components/admin/FamiliesClient'

async function resolveIds(orgSlug: string, campSlug: string) {
  const orgSnap = await adminDb
    .collection('orgs')
    .where('slug', '==', orgSlug)
    .limit(1)
    .get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const campSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps')
    .where('slug', '==', campSlug)
    .limit(1)
    .get()
  if (campSnap.empty) notFound()
  const campId = campSnap.docs[0].id

  return { orgId, campId }
}

export default async function FamiliesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId } = await resolveIds(orgSlug, campSlug)
  const families = await getAdminFamilies(orgId, campId)

  return (
    <div className="flex flex-col h-screen">
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-gray-900">Families</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {families.length} registration{families.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={null}>
          <FamiliesClient
            families={families}
            orgId={orgId}
            campId={campId}
            orgSlug={orgSlug}
            campSlug={campSlug}
          />
        </Suspense>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the full test suite one final time**

```bash
cd /Users/rm/vw/traxevent && npx vitest run
```

Expected: all tests pass

- [ ] **Step 3: Build check**

```bash
cd /Users/rm/vw/traxevent && npx next build 2>&1 | tail -20
```

Expected: build completes without errors

- [ ] **Step 4: Commit**

```bash
cd /Users/rm/vw/traxevent && git add app/\(admin\)/\[orgSlug\]/\[campSlug\]/families/ && git commit -m "feat: add FamiliesPage server component"
```

- [ ] **Step 5: Final commit message**

```bash
cd /Users/rm/vw/traxevent && git log --oneline -8
```

Expected output (8 commits from this feature):
```
<sha> feat: add FamiliesPage server component
<sha> feat: add FamilyPaymentTab and FamilyNotesTab
<sha> feat: add FamilyDetailsTab and FamilyCampersTab
<sha> feat: add FamilySlideOver and FamiliesClient
<sha> feat: add FamiliesTable component with search, filters, and bulk selection
<sha> feat: add StatusBadge and BulkToolbar components
<sha> feat: add admin families server actions
<sha> feat: add FamilyNote/FamilyCsvRow types and CSV utility
```
