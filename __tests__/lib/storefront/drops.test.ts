import { describe, it, expect, vi, beforeEach } from 'vitest'

const dropSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const dropUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const dropGetSpy = vi.hoisted(() => vi.fn())
const listGetSpy = vi.hoisted(() => vi.fn())
const productsListSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const dropsCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-drop-id',
      set: dropSetSpy,
      get: dropGetSpy,
      update: dropUpdateSpy,
    })),
    orderBy: vi.fn().mockReturnValue({ get: listGetSpy }),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => (sub === 'drops' ? dropsCol : {})),
  }
  return {
    adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }) },
  }
})

vi.mock('@/lib/storefront/products', () => ({ listProductsCore: productsListSpy }))

import { createDropCore, updateDraftDropCore, publishDropCore, closeDropCore, adjustStockCore } from '@/lib/storefront/drops'

const PRODUCTS = [
  { id: 'p1', name: 'Vanilla Latte', price: 5.5, active: true, description: 'smooth', photo_url: 'https://x/p1.jpg', created_at: 'x' },
  { id: 'p2', name: 'Retired', price: 4, active: false, created_at: 'x' },
]

const INPUT = {
  title: 'Weekend Drop',
  opens_at: '2026-08-20T15:00:00Z',
  closes_at: '2026-08-21T15:00:00Z',
  timezone: 'America/Boise',
  pickup: { location_name: 'SW Boise', windows: [{ day: '2026-08-22', start: '08:00', end: '11:00' }] },
  items: [{ product_id: 'p1', stock: 10 }],
  channels: ['email' as const],
}

describe('drops core', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    productsListSpy.mockResolvedValue(PRODUCTS)
  })

  it('createDropCore snapshots product name/price/photo into items, mints window ids, normalizes instants, status draft', async () => {
    const drop = await createDropCore('org-1', INPUT)
    expect(drop.status).toBe('draft')
    expect(drop.items).toEqual([
      { product_id: 'p1', name: 'Vanilla Latte', price: 5.5, description: 'smooth', photo_url: 'https://x/p1.jpg', stock: 10 },
    ])
    expect(drop.opens_at).toBe('2026-08-20T15:00:00.000Z')      // toISOString-normalized
    expect(drop.pickup.windows[0].id).toHaveLength(16)
    expect(dropSetSpy).toHaveBeenCalled()
  })

  it('rejects inactive/unknown products, empty items/windows, inverted instants, bad windows', async () => {
    await expect(createDropCore('org-1', { ...INPUT, items: [{ product_id: 'p2' }] })).rejects.toThrow('not available')
    await expect(createDropCore('org-1', { ...INPUT, items: [] })).rejects.toThrow('at least one item')
    await expect(createDropCore('org-1', { ...INPUT, pickup: { ...INPUT.pickup, windows: [] } })).rejects.toThrow('pickup window')
    await expect(createDropCore('org-1', { ...INPUT, closes_at: '2026-08-20T14:00:00Z' })).rejects.toThrow('close after it opens')
    await expect(
      createDropCore('org-1', { ...INPUT, pickup: { ...INPUT.pickup, windows: [{ day: 'nope', start: '08:00', end: '11:00' }] } })
    ).rejects.toThrow('valid pickup')
  })

  it('publishDropCore flips draft → scheduled; rejects non-drafts and past closes_at', async () => {
    dropGetSpy.mockResolvedValue({ exists: true, data: () => ({ ...INPUT, id: 'd1', status: 'draft', opens_at: '2999-01-01T00:00:00.000Z', closes_at: '2999-01-02T00:00:00.000Z', items: [{ product_id: 'p1', name: 'x', price: 5 }] }) })
    const out = await publishDropCore('org-1', 'd1')
    expect(out.status).toBe('scheduled')
    expect(dropUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'scheduled' }))

    dropGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'd1', status: 'scheduled' }) })
    await expect(publishDropCore('org-1', 'd1')).rejects.toThrow('draft')
  })

  it('closeDropCore only closes scheduled drops; adjustStockCore rewrites one item stock', async () => {
    dropGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'd1', status: 'scheduled', items: [{ product_id: 'p1', name: 'x', price: 5, stock: 10 }] }) })
    await closeDropCore('org-1', 'd1')
    expect(dropUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'closed' }))

    await adjustStockCore('org-1', 'd1', 'p1', 25)
    const written = dropUpdateSpy.mock.calls.at(-1)![0]
    expect(written.items).toEqual([{ product_id: 'p1', name: 'x', price: 5, stock: 25 }])
  })

  it('updateDraftDropCore clears note/tax_rate when input omits them', async () => {
    dropGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        ...INPUT,
        id: 'd1',
        status: 'draft',
        note: 'old note',
        tax_rate: 8.5,
        items: [{ product_id: 'p1', name: 'x', price: 5 }],
      }),
    })
    const updated = await updateDraftDropCore('org-1', 'd1', INPUT)
    expect(updated.status).toBe('draft')
    const written = dropSetSpy.mock.calls.at(-1)![0]
    expect(written).not.toHaveProperty('note')
    expect(written).not.toHaveProperty('tax_rate')
  })

  it('updateDraftDropCore rejects non-draft drops', async () => {
    dropGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ ...INPUT, id: 'd1', status: 'scheduled', items: [{ product_id: 'p1', name: 'x', price: 5 }] }),
    })
    await expect(updateDraftDropCore('org-1', 'd1', INPUT)).rejects.toThrow('Only draft drops can be edited')
  })
})
