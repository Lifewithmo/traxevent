import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapacityUnit } from '@/lib/types'

// Mock the guard-free Core layer so these tests exercise only the action
// wrappers (membership guard + pass-through), not Firestore.
const listCapacityUnitsCore = vi.hoisted(() => vi.fn())
const createCapacityUnitCore = vi.hoisted(() => vi.fn())
const updateCapacityUnitCore = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const deleteCapacityUnitCore = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/capacity/units', () => ({
  listCapacityUnitsCore,
  createCapacityUnitCore,
  updateCapacityUnitCore,
  deleteCapacityUnitCore,
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))

import {
  listCapacityUnits,
  createCapacityUnit,
  updateCapacityUnit,
  deleteCapacityUnit,
} from '@/actions/capacity'

const sampleUnit: CapacityUnit = {
  id: 'u1',
  name: 'Kart 1',
  kind: 'mobile',
  active: true,
  blockouts: [],
  created_at: 'x',
}

describe('capacity actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listCapacityUnits asserts membership then returns the Core result', async () => {
    const { assertOrgMember } = await import('@/lib/auth/assert')
    listCapacityUnitsCore.mockResolvedValue([sampleUnit])
    const units = await listCapacityUnits('org-1')
    expect(assertOrgMember).toHaveBeenCalledWith('org-1')
    expect(listCapacityUnitsCore).toHaveBeenCalledWith('org-1')
    expect(units).toEqual([sampleUnit])
  })

  it('createCapacityUnit asserts admin then passes input through to the Core fn and returns the unit', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    createCapacityUnitCore.mockResolvedValue(sampleUnit)
    const unit = await createCapacityUnit('org-1', { name: 'Kart 1', kind: 'mobile' })
    expect(assertOrgAdmin).toHaveBeenCalledWith('org-1')
    expect(createCapacityUnitCore).toHaveBeenCalledWith('org-1', { name: 'Kart 1', kind: 'mobile' })
    expect(unit).toEqual(sampleUnit)
  })

  it('updateCapacityUnit asserts admin then forwards id + updates to the Core fn', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    await updateCapacityUnit('org-1', 'u1', { active: false })
    expect(assertOrgAdmin).toHaveBeenCalledWith('org-1')
    expect(updateCapacityUnitCore).toHaveBeenCalledWith('org-1', 'u1', { active: false })
  })

  it('deleteCapacityUnit asserts admin then forwards id to the Core fn', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    await deleteCapacityUnit('org-1', 'u1')
    expect(assertOrgAdmin).toHaveBeenCalledWith('org-1')
    expect(deleteCapacityUnitCore).toHaveBeenCalledWith('org-1', 'u1')
  })

  it('createCapacityUnit rejects and does NOT write when admin is denied', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    vi.mocked(assertOrgAdmin).mockRejectedValueOnce(new Error('Unauthorized'))
    await expect(createCapacityUnit('org-1', { name: 'Kart 1', kind: 'mobile' })).rejects.toThrow('Unauthorized')
    expect(createCapacityUnitCore).not.toHaveBeenCalled()
  })

  it('deleteCapacityUnit rejects and does NOT delete when admin is denied', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    vi.mocked(assertOrgAdmin).mockRejectedValueOnce(new Error('Forbidden'))
    await expect(deleteCapacityUnit('org-1', 'u1')).rejects.toThrow('Forbidden')
    expect(deleteCapacityUnitCore).not.toHaveBeenCalled()
  })
})
