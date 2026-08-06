import { describe, it, expect, vi, beforeEach } from 'vitest'
const custDoc = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined), get: vi.fn(), update: vi.fn().mockResolvedValue(undefined) }))
const collRef = vi.hoisted(() => ({ doc: vi.fn(() => custDoc), orderBy: vi.fn(() => ({ get: vi.fn() })) }))
vi.mock('@/lib/firebase-admin', () => ({ adminDb: { collection: () => ({ doc: () => ({ collection: () => collRef }) }) } }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: vi.fn().mockResolvedValue({}), assertOrgAdmin: vi.fn().mockResolvedValue({}) }))
import { createCustomer, updateCustomer } from '@/actions/customers'

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

describe('updateCustomer email_lower sync', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets email_lower alongside a new email value', async () => {
    await updateCustomer('o1', 'c1', { email: 'Dana@Riv.CO' })
    expect(custDoc.update).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'Dana@Riv.CO', email_lower: 'dana@riv.co' })
    )
  })

  it('deletes email_lower when email is explicitly cleared', async () => {
    await updateCustomer('o1', 'c1', { email: null })
    const written = custDoc.update.mock.calls[0][0]
    expect(written.email).toBeInstanceOf(Object) // FieldValue.delete() sentinel
    expect('email_lower' in written).toBe(true)
    expect(written.email_lower).toBeInstanceOf(Object) // also a delete sentinel
  })

  it('leaves email_lower untouched when email is not part of the update', async () => {
    await updateCustomer('o1', 'c1', { name: 'New Name' })
    const written = custDoc.update.mock.calls[0][0]
    expect('email' in written).toBe(false)
    expect('email_lower' in written).toBe(false)
  })
})
