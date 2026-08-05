import { describe, it, expect, vi, beforeEach } from 'vitest'

const docSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const docUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const docDeleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
const collRef = vi.hoisted(() => ({
  doc: vi.fn((id?: string) => ({ id: id ?? 'res-new', set: docSetSpy, update: docUpdateSpy, delete: docDeleteSpy })),
  orderBy: vi.fn().mockReturnValue({ get: listGetSpy }),
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))

import { createResourceCore, updateResourceCore, listResourcesCore } from '@/lib/ops/resources'

beforeEach(() => vi.clearAllMocks())

describe('createResourceCore', () => {
  it('requires a name and a valid kind', async () => {
    await expect(createResourceCore('o1', { name: '  ', kind: 'consumable' })).rejects.toThrow('Name is required')
    // @ts-expect-error invalid kind at runtime
    await expect(createResourceCore('o1', { name: 'Beans', kind: 'magic' })).rejects.toThrow('Invalid resource kind')
  })

  it('writes id + created_at and only present optional fields', async () => {
    const r = await createResourceCore('o1', { name: 'Espresso beans', kind: 'consumable', unit: 'oz', unit_cost: 0.55 })
    expect(r.id).toBeTruthy()
    expect(r.created_at).toBeTruthy()
    const written = docSetSpy.mock.calls[0][0]
    expect(written.unit).toBe('oz')
    expect(written.unit_cost).toBe(0.55)
    expect('notes' in written).toBe(false)
  })
})

describe('updateResourceCore', () => {
  it('rejects a blank name', async () => {
    await expect(updateResourceCore('o1', 'r1', { name: '   ' })).rejects.toThrow('Name is required')
  })

  it('strips undefined and converts null to a field delete', async () => {
    await updateResourceCore('o1', 'r1', { unit_cost: null, name: 'Beans (dark)' })
    const payload = docUpdateSpy.mock.calls[0][0]
    expect(payload.name).toBe('Beans (dark)')
    expect(payload.updated_at).toBeTruthy()
    // null → FieldValue.delete() sentinel (not literal null, not dropped)
    expect(payload.unit_cost).toBeDefined()
    expect(payload.unit_cost).not.toBeNull()
  })
})

describe('listResourcesCore', () => {
  it('orders by name', async () => {
    await listResourcesCore('o1')
    expect(collRef.orderBy).toHaveBeenCalledWith('name')
  })
})
