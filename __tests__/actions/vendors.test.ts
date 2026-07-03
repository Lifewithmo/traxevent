import { describe, it, expect, vi, beforeEach } from 'vitest'

const vendorDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const vendorDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const vendorDocDeleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listVendorsSpy = vi.hoisted(() => vi.fn())
const fieldValueDeleteSentinel = vi.hoisted(() => ({ __op: 'delete' }))

vi.mock('@/lib/firebase-admin', () => {
  const vendorsCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-vendor-id',
      set: vendorDocSetSpy,
      update: vendorDocUpdateSpy,
      delete: vendorDocDeleteSpy,
    })),
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({ get: listVendorsSpy }),
    }),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => {
      if (sub === 'vendors') return vendorsCol
      return {}
    }),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }),
    },
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn().mockReturnValue(fieldValueDeleteSentinel) },
}))

import {
  listVendors,
  createVendor,
  updateVendor,
  deleteVendor,
} from '@/actions/vendors'

describe('vendors actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createVendor writes a vendor with a generated id, lead_id, default status, and created_at', async () => {
    const vendor = await createVendor('org-1', 'lead-1', { name: 'Best Catering' })
    expect(vendorDocSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: 'lead-1',
        name: 'Best Catering',
        status: 'potential',
        created_at: expect.any(String),
      })
    )
    expect(vendor.id).toBeTruthy()
    expect(vendor.lead_id).toBe('lead-1')
    expect(vendor.status).toBe('potential')
    expect(vendor.name).toBe('Best Catering')
  })

  it('createVendor persists passed fields and omits blank optionals', async () => {
    await createVendor('org-1', 'lead-1', {
      name: 'Full Vendor',
      service: 'Catering',
      contact_name: 'Jane',
      email: 'jane@example.com',
      phone: '555-1234',
      cost: 1200,
      notes: 'Great reviews',
    })
    const written = vendorDocSetSpy.mock.calls[0][0]
    expect(written.service).toBe('Catering')
    expect(written.contact_name).toBe('Jane')
    expect(written.email).toBe('jane@example.com')
    expect(written.phone).toBe('555-1234')
    expect(written.cost).toBe(1200)
    expect(written.notes).toBe('Great reviews')
  })

  it('createVendor omits blank optionals (service/email)', async () => {
    await createVendor('org-1', 'lead-1', { name: 'No Extras', service: '', email: '   ' })
    const written = vendorDocSetSpy.mock.calls[0][0]
    expect(written).not.toHaveProperty('service')
    expect(written).not.toHaveProperty('email')
  })

  it('createVendor throws "Name is required" for blank name and does not write', async () => {
    await expect(createVendor('org-1', 'lead-1', { name: '   ' })).rejects.toThrow(
      'Name is required'
    )
    expect(vendorDocSetSpy).not.toHaveBeenCalled()
  })

  it('createVendor throws "Invalid status" for a bad status and does not write', async () => {
    await expect(
      // @ts-expect-error testing invalid status at runtime
      createVendor('org-1', 'lead-1', { name: 'Bad Status', status: 'nope' })
    ).rejects.toThrow('Invalid status')
    expect(vendorDocSetSpy).not.toHaveBeenCalled()
  })

  it('listVendors filters by lead_id, orders by created_at asc, and returns mapped docs', async () => {
    listVendorsSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'v1', lead_id: 'lead-1', name: 'A', status: 'potential', created_at: 'x' }) },
      ],
    })
    const list = await listVendors('org-1', 'lead-1')
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('A')
  })

  it('updateVendor skips undefined, maps null to FieldValue.delete, and always sets updated_at', async () => {
    await updateVendor('org-1', 'v1', {
      name: 'New Name',
      service: null,
      phone: undefined,
    })
    const written = vendorDocUpdateSpy.mock.calls[0][0]
    expect(written.name).toBe('New Name')
    expect(written.service).toBe(fieldValueDeleteSentinel)
    expect(written).not.toHaveProperty('phone')
    expect(written.updated_at).toEqual(expect.any(String))
  })

  it('updateVendor throws "Invalid status" for a bad status and does not write', async () => {
    await expect(
      // @ts-expect-error testing invalid status at runtime
      updateVendor('org-1', 'v1', { status: 'nope' })
    ).rejects.toThrow('Invalid status')
    expect(vendorDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('deleteVendor calls .delete()', async () => {
    await deleteVendor('org-1', 'v1')
    expect(vendorDocDeleteSpy).toHaveBeenCalled()
  })
})
