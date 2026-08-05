import { describe, it, expect, vi, beforeEach } from 'vitest'

const docSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const docUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
const collRef = vi.hoisted(() => ({
  doc: vi.fn((id?: string) => ({ id: id ?? 'wp-new', set: docSetSpy, update: docUpdateSpy, delete: vi.fn() })),
  orderBy: vi.fn().mockReturnValue({ get: listGetSpy }),
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))

import { createWorkPackageCore, updateWorkPackageCore } from '@/lib/ops/work-packages'

const RESOURCES = new Set(['res-beans', 'res-cups', 'res-machine'])

beforeEach(() => vi.clearAllMocks())

describe('createWorkPackageCore', () => {
  const base = {
    name: 'Espresso Bar — up to 100',
    price: 1200,
    lines: [
      { kind: 'consumable' as const, resource_id: 'res-beans', qty_per_guest: 0.75 },
      { kind: 'equipment' as const, resource_id: 'res-machine', qty: 1 },
      { kind: 'labor' as const, role: 'barista', count: 2 },
    ],
  }

  it('requires name and non-negative price', async () => {
    await expect(createWorkPackageCore('o1', { ...base, name: ' ' }, RESOURCES)).rejects.toThrow('Name is required')
    await expect(createWorkPackageCore('o1', { ...base, price: -5 }, RESOURCES)).rejects.toThrow('Price must be zero or more')
  })

  it('rejects lines referencing unknown resources', async () => {
    const bad = { ...base, lines: [{ kind: 'consumable' as const, resource_id: 'res-nope', qty_per_guest: 1 }] }
    await expect(createWorkPackageCore('o1', bad, RESOURCES)).rejects.toThrow('Unknown resource: res-nope')
  })

  it('rejects non-positive quantities', async () => {
    const bad = { ...base, lines: [{ kind: 'equipment' as const, resource_id: 'res-machine', qty: 0 }] }
    await expect(createWorkPackageCore('o1', bad, RESOURCES)).rejects.toThrow('Quantities must be positive')
  })

  it('writes the package with id + created_at; labor lines pass without resource validation', async () => {
    const wp = await createWorkPackageCore('o1', base, RESOURCES)
    expect(wp.id).toBeTruthy()
    expect(docSetSpy.mock.calls[0][0].lines).toHaveLength(3)
  })

  it('strips undefined keys from line objects before writing to Firestore', async () => {
    const withUndefined = {
      ...base,
      lines: [
        { kind: 'consumable' as const, resource_id: 'res-beans', qty_per_guest: 0.75, base_qty: undefined },
      ],
    }
    await createWorkPackageCore('o1', withUndefined, RESOURCES)
    const writtenPackage = docSetSpy.mock.calls[0][0]
    const line = writtenPackage.lines[0]
    expect('base_qty' in line).toBe(false)
    expect(line.qty_per_guest).toBe(0.75)
  })
})

describe('updateWorkPackageCore', () => {
  it('validates replacement lines against resources', async () => {
    await expect(
      updateWorkPackageCore('o1', 'wp1', { lines: [{ kind: 'equipment', resource_id: 'res-nope', qty: 1 }] }, RESOURCES),
    ).rejects.toThrow('Unknown resource: res-nope')
  })

  it('strips undefined and stamps updated_at', async () => {
    await updateWorkPackageCore('o1', 'wp1', { price: 1400 }, RESOURCES)
    const payload = docUpdateSpy.mock.calls[0][0]
    expect(payload.price).toBe(1400)
    expect(payload.updated_at).toBeTruthy()
    expect('name' in payload).toBe(false)
  })
})
