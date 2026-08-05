import { describe, it, expect, vi, beforeEach } from 'vitest'
const custDoc = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined), get: vi.fn(), update: vi.fn().mockResolvedValue(undefined) }))
const collRef = vi.hoisted(() => ({ doc: vi.fn(() => custDoc), orderBy: vi.fn(() => ({ get: vi.fn() })) }))
vi.mock('@/lib/firebase-admin', () => ({ adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) } }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: vi.fn().mockResolvedValue({}), assertOrgAdmin: vi.fn().mockResolvedValue({}) }))
import { createCustomer } from '@/actions/customers'

describe('createCustomer', () => {
  beforeEach(() => vi.clearAllMocks())
  it('requires a name', async () => {
    await expect(createCustomer('o1', { name: '  ' })).rejects.toThrow('Name is required')
  })
  it('creates a customer with an id and timestamp', async () => {
    const c = await createCustomer('o1', { name: 'Dana Kim', company: 'Riverside Corp', email: 'dana@riv.co' })
    expect(c.name).toBe('Dana Kim')
    expect(c.id).toBeTruthy()
    expect(c.created_at).toBeTruthy()
    expect(custDoc.set).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dana Kim', company: 'Riverside Corp', email: 'dana@riv.co' }))
  })
})
