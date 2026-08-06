import { describe, it, expect, vi, beforeEach } from 'vitest'
const custDoc = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined) }))
const collRef = vi.hoisted(() => ({ doc: vi.fn(() => custDoc) }))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) },
}))
import { createCustomerCore } from '@/lib/crm/customers'

describe('createCustomerCore', () => {
  beforeEach(() => vi.clearAllMocks())
  it('requires a name', async () => {
    await expect(createCustomerCore('o1', { name: '  ' })).rejects.toThrow('Name is required')
  })
  it('writes a customer with an id + timestamp and only present optional fields', async () => {
    const c = await createCustomerCore('o1', { name: 'Dana Kim', company: 'Riverside Corp', email: 'dana@riv.co' })
    expect(c.id).toBeTruthy()
    expect(c.created_at).toBeTruthy()
    expect(custDoc.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Dana Kim', company: 'Riverside Corp', email: 'dana@riv.co' })
    )
    // phone/tags/notes absent → not in payload
    const written = custDoc.set.mock.calls[0][0]
    expect('phone' in written).toBe(false)
  })
  it('derives email_lower from a mixed-case email', async () => {
    await createCustomerCore('o1', { name: 'Dana Kim', email: 'Dana@Riv.CO' })
    expect(custDoc.set).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'Dana@Riv.CO', email_lower: 'dana@riv.co' })
    )
  })
})
