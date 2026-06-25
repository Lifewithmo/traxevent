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

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertCampPage: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
}))

import type { Family, FamilyNote } from '@/lib/types'
import {
  getAdminFamilies,
  updateFamilyStatus,
  addFamilyNote,
  updateAdminFamily,
  bulkUpdateStatus,
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
      docs: [{ id: 'fam-1', data: () => baseFamily }],
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
    dbSpies.familyUpdate.mockClear()
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
    expect(payload.notes).toBeDefined()
    expect(payload.registration_status).toBe('confirmed')
  })

  it('uses arrayUnion so concurrent writes do not overwrite each other', async () => {
    await updateFamilyStatus('org-1', 'camp-1', 'fam-1', 'confirmed', 'Admin')
    const payload = dbSpies.familyUpdate.mock.calls[0][0]
    // FieldValue.arrayUnion() returns an opaque sentinel — it is NOT a plain array
    expect(Array.isArray(payload.notes)).toBe(false)
  })
})

describe('addFamilyNote', () => {
  beforeEach(() => {
    dbSpies.familyUpdate.mockClear()
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
    const payload = dbSpies.familyUpdate.mock.calls[0][0]
    expect(payload.notes).toBeDefined()
    expect(Array.isArray(payload.notes)).toBe(false)
  })
})

describe('updateAdminFamily', () => {
  beforeEach(() => {
    dbSpies.familyUpdate.mockClear()
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

describe('bulkUpdateStatus', () => {
  beforeEach(() => {
    dbSpies.familyUpdate.mockClear()
    dbSpies.familyUpdate.mockResolvedValue(undefined)
  })

  it('calls updateFamilyStatus for each family ID', async () => {
    await bulkUpdateStatus('org-1', 'camp-1', ['fam-1', 'fam-2'], 'confirmed', 'Admin')
    expect(dbSpies.familyUpdate).toHaveBeenCalledTimes(2)
  })

  it('sets registration_status on all selected families', async () => {
    await bulkUpdateStatus('org-1', 'camp-1', ['fam-1', 'fam-2'], 'waitlisted', 'Admin')
    const calls = dbSpies.familyUpdate.mock.calls
    expect(calls[0][0]).toMatchObject({ registration_status: 'waitlisted' })
    expect(calls[1][0]).toMatchObject({ registration_status: 'waitlisted' })
  })
})
