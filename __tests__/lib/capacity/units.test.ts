import { describe, it, expect, vi, beforeEach } from 'vitest'

const docSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const docUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const docDeleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
const collRef = vi.hoisted(() => ({
  doc: vi.fn((id?: string) => ({ id: id ?? 'unit-new', set: docSetSpy, update: docUpdateSpy, delete: docDeleteSpy })),
  orderBy: vi.fn().mockReturnValue({ get: listGetSpy }),
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))

import {
  createCapacityUnitCore,
  updateCapacityUnitCore,
  listCapacityUnitsCore,
  deleteCapacityUnitCore,
  assertValidBlockout,
  hasMultiResourceCapacity,
} from '@/lib/capacity/units'
import type { CapacityUnit } from '@/lib/types'

beforeEach(() => vi.clearAllMocks())

describe('hasMultiResourceCapacity', () => {
  it('is true only for the business plan', () => {
    expect(hasMultiResourceCapacity({ plan: 'business' })).toBe(true)
    expect(hasMultiResourceCapacity({ plan: 'standard' })).toBe(false)
    expect(hasMultiResourceCapacity({})).toBe(false)
  })
})

describe('assertValidBlockout', () => {
  it('throws when start is after end', () => {
    expect(() => assertValidBlockout({ start: '2026-09-05', end: '2026-09-01' })).toThrow()
  })
  it('throws on missing start or end', () => {
    expect(() => assertValidBlockout({ start: '', end: '2026-09-01' })).toThrow()
    expect(() => assertValidBlockout({ start: '2026-09-01', end: '' })).toThrow()
  })
  it('passes when start equals end', () => {
    expect(() => assertValidBlockout({ start: '2026-09-01', end: '2026-09-01' })).not.toThrow()
  })
  it('passes when start is before end', () => {
    expect(() => assertValidBlockout({ start: '2026-09-01', end: '2026-09-05' })).not.toThrow()
  })
})

describe('createCapacityUnitCore', () => {
  it('requires a name and a valid kind', async () => {
    await expect(createCapacityUnitCore('o1', { name: '  ', kind: 'mobile' })).rejects.toThrow('Name is required')
    // @ts-expect-error invalid kind at runtime
    await expect(createCapacityUnitCore('o1', { name: 'Kart 1', kind: 'truck' })).rejects.toThrow('Invalid capacity unit kind')
  })

  it('defaults active:true, blockouts:[] and stamps id + created_at', async () => {
    const u = await createCapacityUnitCore('o1', { name: '  Kart 1  ', kind: 'mobile' })
    expect(u.id).toBeTruthy()
    expect(u.name).toBe('Kart 1')
    expect(u.kind).toBe('mobile')
    expect(u.active).toBe(true)
    expect(u.blockouts).toEqual([])
    expect(u.created_at).toBeTruthy()
    const written = docSetSpy.mock.calls[0][0] as CapacityUnit
    expect(written.active).toBe(true)
    expect(written.blockouts).toEqual([])
  })
})

describe('updateCapacityUnitCore', () => {
  it('rejects a blank name', async () => {
    await expect(updateCapacityUnitCore('o1', 'u1', { name: '   ' })).rejects.toThrow('Name is required')
  })

  it('validates every blockout', async () => {
    await expect(
      updateCapacityUnitCore('o1', 'u1', { blockouts: [{ start: '2026-09-05', end: '2026-09-01' }] }),
    ).rejects.toThrow()
  })

  it('writes updated_at and toggles active', async () => {
    await updateCapacityUnitCore('o1', 'u1', { active: false })
    const payload = docUpdateSpy.mock.calls[0][0]
    expect(payload.active).toBe(false)
    expect(payload.updated_at).toBeTruthy()
  })
})

describe('listCapacityUnitsCore', () => {
  it('orders by name', async () => {
    await listCapacityUnitsCore('o1')
    expect(collRef.orderBy).toHaveBeenCalledWith('name')
  })
})

describe('deleteCapacityUnitCore', () => {
  it('deletes the doc', async () => {
    await deleteCapacityUnitCore('o1', 'u1')
    expect(docDeleteSpy).toHaveBeenCalled()
  })
})
