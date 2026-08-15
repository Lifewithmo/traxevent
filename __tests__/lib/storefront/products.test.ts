import { describe, it, expect, vi, beforeEach } from 'vitest'

const docSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const docUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listGetSpy = vi.hoisted(() => vi.fn())
const fieldValueDeleteSentinel = vi.hoisted(() => ({ __op: 'delete' }))

vi.mock('@/lib/firebase-admin', () => {
  const productsCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-product-id',
      set: docSetSpy,
      update: docUpdateSpy,
    })),
    orderBy: vi.fn().mockReturnValue({ get: listGetSpy }),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => (sub === 'products' ? productsCol : {})),
  }
  return {
    adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }) },
  }
})

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn().mockReturnValue(fieldValueDeleteSentinel) },
}))

import { createProductCore, updateProductCore, listProductsCore } from '@/lib/storefront/products'

describe('products core', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createProductCore writes id, trimmed name, active:true, created_at; omits empty optionals', async () => {
    const p = await createProductCore('org-1', { name: '  Vanilla Latte ', price: 5.5 })
    expect(docSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Vanilla Latte', price: 5.5, active: true, created_at: expect.any(String) })
    )
    const written = docSetSpy.mock.calls[0][0]
    expect(written).not.toHaveProperty('description')
    expect(written).not.toHaveProperty('photo_url')
    expect(p.id).toHaveLength(16)
  })

  it('rejects empty names and non-positive prices', async () => {
    await expect(createProductCore('org-1', { name: '  ', price: 5 })).rejects.toThrow('Name is required')
    await expect(createProductCore('org-1', { name: 'x', price: 0 })).rejects.toThrow('Price must be greater than zero')
  })

  it('updateProductCore skips undefined, maps null to FieldValue.delete, sets updated_at', async () => {
    await updateProductCore('org-1', 'p1', { name: 'New', description: null, price: undefined, active: false })
    const written = docUpdateSpy.mock.calls[0][0]
    expect(written.name).toBe('New')
    expect(written.description).toBe(fieldValueDeleteSentinel)
    expect(written).not.toHaveProperty('price')
    expect(written.active).toBe(false)
    expect(written.updated_at).toEqual(expect.any(String))
  })

  it('listProductsCore returns docs ordered by name', async () => {
    listGetSpy.mockResolvedValue({ docs: [{ data: () => ({ id: 'a', name: 'A' }) }] })
    const out = await listProductsCore('org-1')
    expect(out).toEqual([{ id: 'a', name: 'A' }])
  })
})
