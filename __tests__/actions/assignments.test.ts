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
        { id: 'fam-5', data: () => ({ id: 'fam-5', registration_status: 'cancelled', assignment_slot_id: undefined }) },
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
        { id: 'fam-5', data: () => ({ id: 'fam-5', registration_status: 'confirmed', assignment_slot_id: undefined }) },
      ],
    })

    const result = await autoAssign('org-1', 'camp-1')
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
        { id: 'fam-1', data: () => ({ id: 'fam-1', registration_status: 'confirmed', assignment_slot_id: 'slot-a' }) },
        { id: 'fam-2', data: () => ({ id: 'fam-2', registration_status: 'confirmed', assignment_slot_id: undefined }) },
      ],
    })

    const result = await autoAssign('org-1', 'camp-1')
    expect(result.assigned).toBe(1)
    expect(familyUpdateSpy).toHaveBeenCalledTimes(1)
  })
})
